"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Mic,
  MicOff,
  Pause,
  Play,
  Square,
  Loader2,
  Volume2,
  Info,
  Upload,
} from "lucide-react";
import type { Meeting, Project } from "@cantaia/database";

const allMeetings: Meeting[] = [];
const allProjects: Project[] = [];

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type RecordingState = "idle" | "recording" | "paused" | "stopped";

export default function RecordMeetingPage() {
  const t = useTranslations("meetings");
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;

  const meeting = allMeetings.find((m) => m.id === meetingId);
  const project = meeting ? allProjects.find((p) => p.id === meeting.project_id) : null;

  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedSize, setRecordedSize] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [browserSupported, setBrowserSupported] = useState(true);
  const [launching, setLaunching] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      setBrowserSupported(false);
    }
    return () => {
      stopAllMedia();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopAllMedia() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
    }
  }

  function updateAudioLevel() {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const val = (data[i] - 128) / 128;
      sum += val * val;
    }
    const rms = Math.sqrt(sum / data.length);
    setAudioLevel(Math.min(1, rms * 3));
    animFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Audio level analysis
      const audioCtx = new AudioContext();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // MediaRecorder
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
          setRecordedSize((prev) => prev + e.data.size);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setRecordedBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
      };

      recorder.start(10000); // 10-second chunks
      setRecordingState("recording");
      setElapsedSeconds(0);
      setRecordedSize(0);

      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);

      updateAudioLevel();
    } catch (err) {
      console.error("[Recording] Error:", err);
      setBrowserSupported(false);
    }
  }

  function pauseRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      setRecordingState("paused");
      if (timerRef.current) clearInterval(timerRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }

  function resumeRecording() {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      setRecordingState("recording");
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      updateAudioLevel();
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    setRecordingState("stopped");
    setAudioLevel(0);
  }

  function restartRecording() {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setRecordedBlob(null);
    setAudioUrl(null);
    setRecordingState("idle");
    setElapsedSeconds(0);
    setRecordedSize(0);
    chunksRef.current = [];
  }

  async function launchTranscription() {
    setLaunching(true);
    // Mock — will call POST /api/transcription/process
    console.log("[Recording] Launching transcription for meeting:", meetingId, "blob size:", recordedBlob?.size);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    router.push("/meetings");
  }

  if (!meeting) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">Séance introuvable</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/meetings"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{meeting.title}</h1>
          {project && (
            <p className="mt-0.5 text-sm text-gray-500">
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              {project.name}
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-2xl">
        {!browserSupported ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
            <MicOff className="mx-auto h-12 w-12 text-red-400" />
            <p className="mt-4 font-medium text-red-700">{t("browserNotSupported")}</p>
          </div>
        ) : recordingState === "idle" ? (
          /* Idle state — ready to record */
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-red-50">
                <Mic className="h-10 w-10 text-red-500" />
              </div>
              <h2 className="mt-6 text-lg font-semibold text-gray-900">
                {t("recordingTitle").replace("en cours", "")} — {t("record")}
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                {meeting.participants.length} {t("colParticipants").toLowerCase()}
                {meeting.location && ` · ${meeting.location}`}
              </p>
              <button
                type="button"
                onClick={startRecording}
                className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-500 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600"
              >
                <Mic className="h-5 w-5" />
                {t("record")}
              </button>
            </div>

            {/* Tips */}
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-5">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-800">
                <Info className="h-4 w-4" />
                {t("recordingTips")}
              </h3>
              <ul className="mt-3 space-y-1.5 text-sm text-blue-700">
                <li>• {t("tip1")}</li>
                <li>• {t("tip2")}</li>
                <li>• {t("tip3")}</li>
              </ul>
            </div>

            {/* Upload external audio */}
            <div className="text-center">
              <button
                type="button"
                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-brand"
              >
                <Upload className="h-4 w-4" />
                {t("uploadAudio")}
              </button>
              <p className="mt-1 text-xs text-gray-400">{t("uploadAudioFormats")}</p>
            </div>
          </div>
        ) : recordingState === "stopped" ? (
          /* Stopped state — review recording */
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                <Mic className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-gray-900">
                {t("recordingStopped")}
              </h2>
              <div className="mt-2 flex items-center justify-center gap-4 text-sm text-gray-500">
                <span>
                  {t("recordingDuration")} : {formatDuration(elapsedSeconds)}
                </span>
                <span>•</span>
                <span>
                  {t("recordingSize")} : {formatFileSize(recordedSize)}
                </span>
              </div>
            </div>

            {/* Audio player */}
            {audioUrl && (
              <div className="mt-6">
                <audio controls src={audioUrl} className="w-full" />
              </div>
            )}

            {/* Actions */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={launchTranscription}
                disabled={launching}
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-500 disabled:opacity-50"
              >
                {launching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
                {t("launchTranscription")}
              </button>
              <button
                type="button"
                onClick={restartRecording}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                {t("restart")}
              </button>
            </div>
          </div>
        ) : (
          /* Recording / Paused state */
          <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="text-center">
              {/* Pulsing indicator */}
              <div className="mx-auto flex h-24 w-24 items-center justify-center">
                <div
                  className={`flex h-20 w-20 items-center justify-center rounded-full transition-all duration-150 ${
                    recordingState === "recording"
                      ? "bg-red-500"
                      : "bg-amber-400"
                  }`}
                  style={{
                    transform: `scale(${1 + audioLevel * 0.3})`,
                  }}
                >
                  {recordingState === "recording" ? (
                    <Mic className="h-8 w-8 text-white" />
                  ) : (
                    <Pause className="h-8 w-8 text-white" />
                  )}
                </div>
              </div>

              {/* Audio level bar */}
              <div className="mx-auto mt-4 h-2 w-48 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-red-400 transition-all duration-100"
                  style={{ width: `${audioLevel * 100}%` }}
                />
              </div>

              {/* Timer */}
              <p className="mt-4 font-mono text-4xl font-bold text-gray-900">
                {formatDuration(elapsedSeconds)}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {recordingState === "recording"
                  ? t("recordingTitle")
                  : t("pauseRecording")}
                {recordedSize > 0 && (
                  <span className="ml-2">({formatFileSize(recordedSize)})</span>
                )}
              </p>
            </div>

            {/* Controls */}
            <div className="mt-8 flex items-center justify-center gap-4">
              {recordingState === "recording" ? (
                <button
                  type="button"
                  onClick={pauseRecording}
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-400 text-amber-500 transition-colors hover:bg-amber-50"
                  title={t("pauseRecording")}
                >
                  <Pause className="h-6 w-6" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resumeRecording}
                  className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-green-400 text-green-500 transition-colors hover:bg-green-50"
                  title={t("resumeRecording")}
                >
                  <Play className="h-6 w-6" />
                </button>
              )}
              <button
                type="button"
                onClick={stopRecording}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-colors hover:bg-red-600"
                title={t("stopRecording")}
              >
                <Square className="h-7 w-7" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
