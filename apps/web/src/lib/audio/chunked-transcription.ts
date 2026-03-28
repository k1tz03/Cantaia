/**
 * Chunked audio transcription for files > 25 MB (Whisper API limit).
 * Strategy:
 *  1. If file ≤ 24 MB → direct Whisper call
 *  2. If file > 24 MB → compress to MP3 48kbps 16kHz mono with ffmpeg
 *     a. If compressed file < 24 MB → single Whisper call (no splitting needed)
 *     b. If still > 24 MB → split into 10-min chunks, transcribe each, combine
 */

import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  statSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";

const MAX_DIRECT_SIZE = 24 * 1024 * 1024; // 24 MB
const CHUNK_SECONDS = 600; // 10 minutes per chunk

export interface ChunkedTranscriptionResult {
  text: string;
  language: string;
  duration: number;
  chunks: number;
}

/** Try to find a working ffmpeg binary. Returns path or null. */
function findFfmpeg(): string | null {
  // 1. Try ffmpeg-static
  try {
    const staticPath = require("ffmpeg-static");
    if (staticPath && existsSync(staticPath)) {
      execFileSync(staticPath, ["-version"], {
        encoding: "utf8",
        timeout: 5000,
      });
      console.log("[Transcription] Using ffmpeg-static:", staticPath);
      return staticPath;
    }
  } catch (e: unknown) {
    console.warn("[Transcription] ffmpeg-static not usable:", e instanceof Error ? e.message : e);
  }

  // 2. Try system ffmpeg
  try {
    execFileSync("ffmpeg", ["-version"], {
      encoding: "utf8",
      timeout: 5000,
    });
    console.log("[Transcription] Using system ffmpeg");
    return "ffmpeg";
  } catch {
    console.warn("[Transcription] System ffmpeg not found");
  }

  return null;
}

/** Get audio duration via ffmpeg. Returns seconds or null on failure. */
function getAudioDuration(
  ffmpegPath: string,
  filePath: string
): number | null {
  try {
    // ffmpeg -i <file> (no output) always exits with error code 1,
    // but stderr contains "Duration: HH:MM:SS.xx"
    execFileSync(ffmpegPath, ["-i", filePath], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 30000,
    });
  } catch (e: unknown) {
    const stderr = (e as any).stderr || "";
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (match) {
      return (
        parseInt(match[1]) * 3600 +
        parseInt(match[2]) * 60 +
        parseInt(match[3]) +
        parseInt(match[4]) / 100
      );
    }
    console.warn(
      "[Transcription] Duration parse failed. stderr:",
      stderr.substring(0, 500)
    );
  }
  return null;
}

/** Estimate duration from file size (WebM/Opus ~100 kbps for speech). */
function estimateDuration(fileSize: number): number {
  return fileSize / 12500; // 100 kbps = 12,500 bytes/s
}

/**
 * Transcribe audio with automatic compression/chunking for large files.
 */
export async function transcribeAudioChunked(
  audioBlob: Blob,
  openaiApiKey: string,
  language: string = "fr"
): Promise<ChunkedTranscriptionResult> {
  const OpenAI = (await import("openai")).default;
  const openai = new OpenAI({ apiKey: openaiApiKey });

  // ── Small file: direct transcription ──
  if (audioBlob.size <= MAX_DIRECT_SIZE) {
    const file = new File([audioBlob], "audio.webm", { type: "audio/webm" });
    const result = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
    });

    return {
      text: result.text,
      language: (result as any).language || language,
      duration: Math.round((result as any).duration || 0),
      chunks: 1,
    };
  }

  // ── Large file: needs ffmpeg ──
  const sizeMB = (audioBlob.size / 1048576).toFixed(1);
  console.log(
    `[Transcription] File ${sizeMB} MB > 24 MB — compression needed`
  );

  const ffmpegPath = findFfmpeg();
  if (!ffmpegPath) {
    throw new Error(
      "ffmpeg introuvable sur le serveur. Nécessaire pour les fichiers audio > 24 MB. " +
        "Essayez un enregistrement plus court."
    );
  }

  const workDir = join(tmpdir(), `transcribe-${randomUUID()}`);
  mkdirSync(workDir, { recursive: true });
  const inputPath = join(workDir, "input.webm");

  try {
    writeFileSync(inputPath, Buffer.from(await audioBlob.arrayBuffer()));

    // Get duration (detect or estimate)
    let totalDuration = getAudioDuration(ffmpegPath, inputPath);
    if (totalDuration) {
      console.log(
        `[Transcription] Duration detected: ${Math.round(totalDuration)}s`
      );
    } else {
      totalDuration = estimateDuration(audioBlob.size);
      console.log(
        `[Transcription] Duration estimated: ${Math.round(totalDuration)}s`
      );
    }

    // ── Step 1: Try compressing entire file to one small MP3 ──
    const compressedPath = join(workDir, "compressed.mp3");
    try {
      console.log("[Transcription] Compressing to MP3 48kbps 16kHz mono...");
      execFileSync(
        ffmpegPath,
        [
          "-y",
          "-loglevel",
          "error",
          "-i",
          inputPath,
          "-vn",
          "-acodec",
          "libmp3lame",
          "-ar",
          "16000",
          "-ac",
          "1",
          "-ab",
          "48k",
          compressedPath,
        ],
        { timeout: 180000 }
      );

      if (
        existsSync(compressedPath) &&
        statSync(compressedPath).size < MAX_DIRECT_SIZE
      ) {
        const compressedBuf = readFileSync(compressedPath);
        const compMB = (compressedBuf.length / 1048576).toFixed(1);
        console.log(
          `[Transcription] Compressed ${sizeMB} MB → ${compMB} MB — single transcription`
        );

        const file = new File([compressedBuf], "audio.mp3", {
          type: "audio/mpeg",
        });
        const result = await openai.audio.transcriptions.create({
          file,
          model: "whisper-1",
          language,
          response_format: "verbose_json",
          timestamp_granularities: ["segment"],
        });

        return {
          text: result.text,
          language: (result as any).language || language,
          duration: Math.round((result as any).duration || 0),
          chunks: 1,
        };
      }
      console.log(
        "[Transcription] Compressed file still too large, splitting into chunks"
      );
    } catch (e: unknown) {
      console.warn(
        "[Transcription] Full compression failed, splitting:",
        e instanceof Error ? e.message : e
      );
    }

    // ── Step 2: Split into 10-min chunks ──
    const numChunks = Math.max(2, Math.ceil(totalDuration / CHUNK_SECONDS));
    console.log(
      `[Transcription] Splitting into ${numChunks} chunks of ≤${CHUNK_SECONDS}s`
    );

    const texts: string[] = [];
    let totalDur = 0;
    let lang = language;

    for (let i = 0; i < numChunks; i++) {
      const ss = i * CHUNK_SECONDS;
      const chunkPath = join(workDir, `chunk_${i}.mp3`);

      execFileSync(
        ffmpegPath,
        [
          "-y",
          "-loglevel",
          "error",
          "-i",
          inputPath,
          "-ss",
          String(ss),
          "-t",
          String(CHUNK_SECONDS),
          "-vn",
          "-acodec",
          "libmp3lame",
          "-ar",
          "16000",
          "-ac",
          "1",
          "-ab",
          "64k",
          chunkPath,
        ],
        { timeout: 120000 }
      );

      if (!existsSync(chunkPath) || statSync(chunkPath).size < 1000) {
        console.warn(`[Transcription] Chunk ${i} empty, skipping`);
        continue;
      }

      const chunkBuf = readFileSync(chunkPath);
      console.log(
        `[Transcription] Chunk ${i + 1}/${numChunks}: ${(chunkBuf.length / 1048576).toFixed(1)} MB`
      );

      const chunkFile = new File([chunkBuf], `chunk_${i}.mp3`, {
        type: "audio/mpeg",
      });
      const result = await openai.audio.transcriptions.create({
        file: chunkFile,
        model: "whisper-1",
        language,
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
      });

      texts.push(result.text);
      totalDur += Math.round((result as any).duration || 0);
      if (i === 0) lang = (result as any).language || language;
    }

    const fullText = texts.join(" ");
    console.log(
      `[Transcription] Done: ${fullText.length} chars, ${totalDur}s, ${texts.length} chunks`
    );

    return {
      text: fullText,
      language: lang,
      duration: totalDur || Math.round(totalDuration),
      chunks: texts.length,
    };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
