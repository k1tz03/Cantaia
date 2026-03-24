"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Volume2,
} from "lucide-react";

type RecordingState = "idle" | "recording" | "paused" | "stopped";

interface AudioRecorderProps {
  onRecordingComplete: (blob: Blob, duration: number) => void;
}

export function AudioRecorder({ onRecordingComplete }: AudioRecorderProps) {
  const t = useTranslations("visits");
  const [state, setState] = useState<RecordingState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [volumeLevel, setVolumeLevel] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveDataRef = useRef<number[]>([]);
  const startTimeRef = useRef(0);
  const pausedTimeRef = useRef(0);
  const blobRef = useRef<Blob | null>(null);

  // Format time as HH:MM:SS
  function formatTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  // Draw waveform on canvas
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    // Calculate volume (RMS)
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const val = (dataArray[i] - 128) / 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / bufferLength);
    setVolumeLevel(Math.min(1, rms * 3));

    // Add current sample to wave data
    const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
    waveDataRef.current.push(avg);
    if (waveDataRef.current.length > canvas.width / 2) {
      waveDataRef.current.shift();
    }

    // Draw
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    // Background
    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, width, height);

    // Center line
    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Waveform bars
    const data = waveDataRef.current;
    const barWidth = 2;
    const gap = 1;
    const step = barWidth + gap;
    const startX = width - data.length * step;

    ctx.fillStyle = "#3B82F6";
    for (let i = 0; i < data.length; i++) {
      const val = ((data[i] - 128) / 128) * (height / 2);
      const barHeight = Math.max(2, Math.abs(val) * 2);
      const x = startX + i * step;
      const y = height / 2 - barHeight / 2;
      ctx.fillRect(x, y, barWidth, barHeight);
    }

    animFrameRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];
      waveDataRef.current = [];

      // Setup analyser for waveform
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Setup MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        blobRef.current = blob;
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };

      recorder.start(1000); // chunk every second
      startTimeRef.current = Date.now();
      pausedTimeRef.current = 0;
      setState("recording");

      // Start timer
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const totalMs = now - startTimeRef.current - pausedTimeRef.current;
        setElapsed(Math.floor(totalMs / 1000));
      }, 1000);

      // Start waveform
      drawWaveform();

      // Try Wake Lock API
      try {
        if ("wakeLock" in navigator) {
          await (navigator as any).wakeLock.request("screen");
        }
      } catch {
        // Wake lock not available, continue
      }
    } catch (err) {
      console.error("Microphone access denied:", err);
      setPermissionDenied(true);
    }
  }, [drawWaveform]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.pause();
      setState("paused");
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, []);

  // Resume recording
  const resumeRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "paused") {
      recorder.resume();
      setState("recording");

      timerRef.current = setInterval(() => {
        const now = Date.now();
        const totalMs = now - startTimeRef.current - pausedTimeRef.current;
        setElapsed(Math.floor(totalMs / 1000));
      }, 1000);

      drawWaveform();
    }
  }, [drawWaveform]);

  // Stop recording
  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && (recorder.state === "recording" || recorder.state === "paused")) {
      recorder.stop();
      setState("stopped");
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      // Stop stream tracks
      streamRef.current?.getTracks().forEach((track) => track.stop());
    }
  }, []);

  // Confirm and send
  const confirmRecording = useCallback(() => {
    if (blobRef.current) {
      onRecordingComplete(blobRef.current, elapsed);
    }
  }, [elapsed, onRecordingComplete]);

  // Reset
  const resetRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    blobRef.current = null;
    chunksRef.current = [];
    waveDataRef.current = [];
    setElapsed(0);
    setVolumeLevel(0);
    setState("idle");
  }, [audioUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Permission denied
  if (permissionDenied) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-500/10 p-6 text-center">
        <MicOff className="mx-auto mb-3 h-8 w-8 text-red-400" />
        <p className="text-sm font-medium text-red-800">{t("micPermissionDenied")}</p>
        <p className="mt-1 text-xs text-red-600">{t("micPermissionDeniedDesc")}</p>
        <button
          onClick={() => {
            setPermissionDenied(false);
            startRecording();
          }}
          className="mt-3 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          {t("retryMicAccess")}
        </button>
      </div>
    );
  }

  // Idle state
  if (state === "idle") {
    return (
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-8 text-center">
        <button
          onClick={startRecording}
          className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl active:scale-95"
        >
          <Mic className="h-8 w-8" />
        </button>
        <p className="mt-4 text-sm font-medium text-[#FAFAFA]">{t("startRecording")}</p>
        <p className="mt-1 text-xs text-[#71717A]">{t("startRecordingDesc")}</p>
      </div>
    );
  }

  // Stopped state — playback
  if (state === "stopped") {
    return (
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <div className="mb-4 text-center">
          <p className="text-sm font-medium text-[#FAFAFA]">
            {t("recordingFinished")} — {formatTime(elapsed)}
          </p>
        </div>

        {audioUrl && (
          <div className="mb-4">
            <audio controls src={audioUrl} className="w-full rounded-lg" />
          </div>
        )}

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={resetRecording}
            className="rounded-lg border border-[#27272A] px-4 py-2.5 text-sm font-medium text-[#71717A] hover:bg-[#27272A]"
          >
            {t("reRecord")}
          </button>
          <button
            onClick={confirmRecording}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {t("confirmRecording")}
          </button>
        </div>
      </div>
    );
  }

  // Recording / Paused state
  const isRecording = state === "recording";

  return (
    <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
      {/* Waveform */}
      <div className="mb-4 overflow-hidden rounded-lg border border-[#27272A]">
        <canvas
          ref={canvasRef}
          width={600}
          height={100}
          className="h-[100px] w-full"
        />
      </div>

      {/* Timer */}
      <div className="mb-4 text-center">
        <p className="font-mono text-3xl font-bold text-[#FAFAFA]">
          {formatTime(elapsed)}
        </p>
        <p className={`mt-1 text-xs font-medium ${isRecording ? "text-red-500" : "text-amber-500"}`}>
          {isRecording ? t("recordingInProgress") : t("recordingPaused")}
        </p>
      </div>

      {/* Volume meter */}
      <div className="mx-auto mb-4 flex max-w-xs items-center gap-2">
        <Volume2 className="h-4 w-4 text-[#71717A]" />
        <div className="flex-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-[#27272A]">
            <div
              className={`h-full rounded-full transition-all duration-100 ${
                volumeLevel > 0.6 ? "bg-green-500" : volumeLevel > 0.3 ? "bg-blue-500" : "bg-[#27272A]"
              }`}
              style={{ width: `${Math.max(5, volumeLevel * 100)}%` }}
            />
          </div>
        </div>
        <span className="text-xs text-[#71717A]">
          {volumeLevel > 0.3 ? "OK" : t("speakLouder")}
        </span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        {isRecording ? (
          <button
            onClick={pauseRecording}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 transition-colors hover:bg-amber-200"
          >
            <Pause className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={resumeRecording}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F97316]/10 text-[#F97316] transition-colors hover:bg-[#F97316]/20"
          >
            <Play className="h-5 w-5" />
          </button>
        )}

        <button
          onClick={stopRecording}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition-all hover:bg-red-700 active:scale-95"
        >
          <Square className="h-5 w-5" />
        </button>
      </div>

      {/* Tips */}
      <div className="mt-6 rounded-md bg-[#F97316]/10 p-3">
        <p className="text-xs font-medium text-[#F97316]">{t("recordingTipsTitle")}</p>
        <ul className="mt-1 space-y-0.5 text-xs text-[#F97316]">
          <li>• {t("recordingTip1")}</li>
          <li>• {t("recordingTip2")}</li>
          <li>• {t("recordingTip3")}</li>
        </ul>
      </div>
    </div>
  );
}
