/**
 * Client-side audio compression using Web Audio API + lamejs MP3 encoder.
 * Converts any browser-decodable audio (WebM, WAV, MP3, etc.) to
 * a compact MP3: 16 kHz, mono, 48 kbps — ideal for Whisper transcription.
 *
 * A 38 MB WebM (~45 min) compresses to ~10-15 MB MP3.
 */

// Use pre-bundled lamejs with proper module.exports (webpack-compatible)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lame = require("./lame.min.js");

const TARGET_SAMPLE_RATE = 16000;
const TARGET_BITRATE = 48; // kbps
const ENCODE_BLOCK_SIZE = 1152;

/**
 * Compress an audio Blob to a small MP3 suitable for Whisper API (< 25 MB).
 * Runs entirely in the browser — no server-side ffmpeg needed.
 */
export async function compressAudioToMp3(
  blob: Blob,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  onProgress?.(0);

  // 1. Decode audio to PCM
  const audioContext = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  await audioContext.close();

  onProgress?.(20);

  // 2. Resample to 16 kHz mono via OfflineAudioContext
  const numSamples = Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE);
  const offlineCtx = new OfflineAudioContext(1, numSamples, TARGET_SAMPLE_RATE);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offlineCtx.destination);
  source.start(0);
  const resampled = await offlineCtx.startRendering();

  onProgress?.(40);

  // 3. Convert Float32 → Int16
  const float32 = resampled.getChannelData(0);
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  onProgress?.(50);

  // 4. Encode to MP3 with lamejs
  const encoder = new lame.Mp3Encoder(1, TARGET_SAMPLE_RATE, TARGET_BITRATE);
  const mp3Chunks: Uint8Array[] = [];
  const total = int16.length;

  for (let i = 0; i < total; i += ENCODE_BLOCK_SIZE) {
    const block = int16.subarray(i, Math.min(i + ENCODE_BLOCK_SIZE, total));
    const mp3buf = encoder.encodeBuffer(block);
    if (mp3buf.length > 0) {
      mp3Chunks.push(new Uint8Array(mp3buf));
    }
    // Report progress 50-95%
    if (i % (ENCODE_BLOCK_SIZE * 100) === 0) {
      onProgress?.(50 + Math.round((i / total) * 45));
    }
  }

  const end = encoder.flush();
  if (end.length > 0) {
    mp3Chunks.push(new Uint8Array(end));
  }

  onProgress?.(100);

  return new Blob(mp3Chunks as unknown as BlobPart[], { type: "audio/mpeg" });
}
