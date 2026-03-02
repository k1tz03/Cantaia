/**
 * Chunked audio transcription for files > 25 MB (Whisper API limit).
 * Uses ffmpeg to split large audio into 10-minute MP3 chunks (16 kHz mono 64 kbps),
 * transcribes each chunk with Whisper, then combines the results.
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

const MAX_DIRECT_SIZE = 24 * 1024 * 1024; // 24 MB (margin below 25 MB limit)
const CHUNK_SECONDS = 600; // 10 minutes per chunk

export interface ChunkedTranscriptionResult {
  text: string;
  language: string;
  duration: number;
  chunks: number;
}

function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("ffmpeg-static");
  } catch {
    return "ffmpeg"; // fallback to system PATH
  }
}

function getAudioDuration(ffmpegPath: string, filePath: string): number {
  try {
    // ffmpeg -i <file> always exits with error when no output is specified,
    // but stderr contains the duration info we need
    execFileSync(ffmpegPath, ["-i", filePath, "-f", "null", "-"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return 0;
  } catch (e: any) {
    const stderr = e.stderr || "";
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (match) {
      return (
        parseInt(match[1]) * 3600 +
        parseInt(match[2]) * 60 +
        parseInt(match[3]) +
        parseInt(match[4]) / 100
      );
    }
    throw new Error("Could not determine audio duration from ffmpeg output");
  }
}

/**
 * Transcribe audio with automatic chunking for large files.
 * Files ≤ 24 MB are sent directly to Whisper.
 * Files > 24 MB are split into 10-min MP3 chunks with ffmpeg.
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

  // ── Large file: split with ffmpeg ──
  const sizeMB = (audioBlob.size / 1048576).toFixed(1);
  console.log(
    `[Transcription] File ${sizeMB} MB > 24 MB — splitting into chunks`
  );

  const ffmpegPath = getFfmpegPath();
  const workDir = join(tmpdir(), `transcribe-${randomUUID()}`);
  mkdirSync(workDir, { recursive: true });
  const inputPath = join(workDir, "input.webm");

  try {
    // Write blob to temp file
    writeFileSync(inputPath, Buffer.from(await audioBlob.arrayBuffer()));

    // Get total duration
    const totalDuration = getAudioDuration(ffmpegPath, inputPath);
    const numChunks = Math.ceil(totalDuration / CHUNK_SECONDS);
    console.log(
      `[Transcription] Duration: ${Math.round(totalDuration)}s → ${numChunks} chunks of ≤${CHUNK_SECONDS}s`
    );

    const texts: string[] = [];
    let totalDur = 0;
    let lang = language;

    for (let i = 0; i < numChunks; i++) {
      const ss = i * CHUNK_SECONDS;
      const chunkPath = join(workDir, `chunk_${i}.mp3`);

      // Re-encode chunk as 16 kHz mono MP3 — optimal for Whisper, very small files
      execFileSync(ffmpegPath, [
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
      ]);

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
      `[Transcription] Done: ${fullText.length} chars, ${totalDur}s, ${numChunks} chunks`
    );

    return {
      text: fullText,
      language: lang,
      duration: totalDur || Math.round(totalDuration),
      chunks: numChunks,
    };
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
}
