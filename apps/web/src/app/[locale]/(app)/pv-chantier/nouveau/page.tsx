"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import {
  Mic,
  Square,
  Pause,
  Play,
  RotateCcw,
  Upload,
  Loader2,
  Plus,
  X,
  ArrowLeft,
  Users,
  FileAudio,
  ChevronDown,
} from "lucide-react";

interface Participant {
  name: string;
  company: string;
  role: string;
  present: boolean;
}

export default function NouveauPVPage() {
  const t = useTranslations("pv");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Metadata
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(
    searchParams.get("project_id") || ""
  );
  const [title, setTitle] = useState("");
  const [meetingDate, setMeetingDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [location, setLocation] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  // Participants
  const [participants, setParticipants] = useState<Participant[]>([
    { name: "", company: "", role: "", present: true },
  ]);

  // Audio
  const [audioMode, setAudioMode] = useState<"record" | "upload" | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Processing
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const recorder = useAudioRecorder();

  // Load projects
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/projects/list");
        const data = await res.json();
        if (data.projects) setProjects(data.projects);
      } catch (err) {
        console.error("Failed to load projects:", err);
      }
    }
    loadProjects();
  }, []);

  // Auto-fill title when project changes
  useEffect(() => {
    if (!selectedProject) return;
    const project = projects.find((p) => p.id === selectedProject);
    if (project) {
      setLocation(project.address || project.city || "");
      // Fetch next meeting number
      fetch(`/api/pv?project_id=${selectedProject}`)
        .then((r) => r.json())
        .then((data) => {
          const count = data.meetings?.length || 0;
          setTitle(`Séance de chantier #${count + 1}`);
        })
        .catch(() => {
          setTitle("Séance de chantier #1");
        });
    }
  }, [selectedProject, projects]);

  // Load previous participants
  const loadPreviousParticipants = useCallback(async () => {
    if (!selectedProject) return;
    try {
      const res = await fetch(`/api/pv?project_id=${selectedProject}`);
      const data = await res.json();
      if (data.meetings?.length > 0) {
        const lastMeeting = data.meetings[0]; // sorted by date desc
        if (lastMeeting.participants?.length > 0) {
          setParticipants(
            lastMeeting.participants.map((p: any) => ({
              name: p.name || "",
              company: p.company || "",
              role: p.role || "",
              present: true,
            }))
          );
        }
      }
    } catch (err) {
      console.error("Failed to load previous participants:", err);
    }
  }, [selectedProject]);

  const addParticipant = () => {
    setParticipants([
      ...participants,
      { name: "", company: "", role: "", present: true },
    ]);
  };

  const removeParticipant = (index: number) => {
    setParticipants(participants.filter((_, i) => i !== index));
  };

  const updateParticipant = (
    index: number,
    field: keyof Participant,
    value: any
  ) => {
    const updated = [...participants];
    updated[index] = { ...updated[index], [field]: value };
    setParticipants(updated);
  };

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setError(t("file_too_large"));
      return;
    }

    setUploadedFile(file);
    setUploadedUrl(URL.createObjectURL(file));
    setAudioMode("upload");
    setError(null);
  };

  // Drop handler
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;

    const validTypes = [
      "audio/mpeg",
      "audio/wav",
      "audio/mp4",
      "audio/ogg",
      "audio/webm",
      "audio/x-m4a",
    ];
    if (
      !validTypes.includes(file.type) &&
      !file.name.match(/\.(mp3|wav|m4a|ogg|webm)$/i)
    ) {
      setError("Format audio non supporté");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError(t("file_too_large"));
      return;
    }

    setUploadedFile(file);
    setUploadedUrl(URL.createObjectURL(file));
    setAudioMode("upload");
    setError(null);
  };

  // Get the audio blob to submit
  const getAudioBlob = (): Blob | null => {
    if (audioMode === "record" && recorder.audioBlob) {
      return recorder.audioBlob;
    }
    if (audioMode === "upload" && uploadedFile) {
      return uploadedFile;
    }
    return null;
  };

  const canSubmit =
    selectedProject &&
    title &&
    participants.filter((p) => p.name.trim()).length >= 1 &&
    getAudioBlob() !== null &&
    !processing;

  // Submit handler
  const handleSubmit = async () => {
    const audioBlob = getAudioBlob();
    if (!audioBlob || !selectedProject) return;

    setProcessing(true);
    setError(null);

    try {
      // 1. Create meeting in DB
      setProcessingStep(t("creating_meeting"));
      const createRes = await fetch("/api/pv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProject,
          title,
          meeting_date: meetingDate,
          location,
          participants: participants.filter((p) => p.name.trim()),
        }),
      });
      const createData = await createRes.json();
      if (!createData.success) throw new Error(createData.error);
      const meetingId = createData.meeting.id;

      // 2. Upload audio to Supabase Storage via client
      setProcessingStep(t("uploading_audio"));
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const ext = uploadedFile
        ? uploadedFile.name.split(".").pop() || "webm"
        : "webm";
      const storagePath = `${user.id}/${meetingId}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("meeting-audio")
        .upload(storagePath, audioBlob, {
          contentType: audioBlob.type?.replace("video/", "audio/") || "audio/webm",
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        throw new Error(`Échec upload audio: ${uploadError.message}`);
      }

      // 3. Update meeting with audio_url
      await fetch(`/api/pv/${meetingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_url: storagePath,
          status: "transcribing",
        }),
      });

      // 4. Transcribe
      setProcessingStep(t("transcribing"));
      const transcribeRes = await fetch("/api/pv/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: meetingId }),
      });
      const transcribeData = await transcribeRes.json();
      if (!transcribeData.success) throw new Error(transcribeData.error);

      // 5. Generate PV
      setProcessingStep(t("generating"));
      const generateRes = await fetch("/api/ai/generate-pv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: meetingId }),
      });
      const generateData = await generateRes.json();
      if (!generateData.success) throw new Error(generateData.error);

      // 6. Redirect to detail page
      router.push(`/pv-chantier/${meetingId}`);
    } catch (err: any) {
      console.error("Processing error:", err);
      setError(err.message || "Une erreur est survenue");
      setProcessing(false);
    }
  };

  const selectedProjectData = projects.find(
    (p) => p.id === selectedProject
  );

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push("/pv-chantier")}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            {t("new_pv")}
          </h1>
        </div>
      </div>

      {/* Processing overlay */}
      {processing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-gray-200 bg-white p-8 shadow-lg">
            <Loader2 className="h-10 w-10 animate-spin text-brand" />
            <p className="text-lg font-medium text-gray-900">
              {processingStep}
            </p>
            <p className="text-sm text-gray-500">
              {t("processing_wait")}
            </p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl space-y-8">
        {/* Section 1: Metadata */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            {t("metadata")}
          </h2>

          <div className="space-y-4">
            {/* Project */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("select_project")} *
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                >
                  {selectedProjectData ? (
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: selectedProjectData.color,
                        }}
                      />
                      {selectedProjectData.name}
                    </div>
                  ) : (
                    <span className="text-gray-400">
                      {t("select_project")}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </button>
                {showProjectDropdown && (
                  <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-md border border-gray-200 bg-white py-1 shadow-lg">
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedProject(p.id);
                          setShowProjectDropdown(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: p.color }}
                        />
                        {p.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("col_title")} *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t("date")} *
                </label>
                <input
                  type="date"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              {/* Location */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  {t("location")}
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Participants */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              <Users className="mr-2 inline h-4 w-4" />
              {t("participants")} ({participants.filter((p) => p.name.trim()).length})
            </h2>
            {selectedProject && (
              <button
                type="button"
                onClick={loadPreviousParticipants}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {t("load_previous_participants")}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {participants.map((p, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 p-2"
              >
                <input
                  type="text"
                  placeholder={t("participant_name")}
                  value={p.name}
                  onChange={(e) =>
                    updateParticipant(i, "name", e.target.value)
                  }
                  className="flex-1 rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
                <input
                  type="text"
                  placeholder={t("company")}
                  value={p.company}
                  onChange={(e) =>
                    updateParticipant(i, "company", e.target.value)
                  }
                  className="w-32 rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
                <input
                  type="text"
                  placeholder={t("role")}
                  value={p.role}
                  onChange={(e) =>
                    updateParticipant(i, "role", e.target.value)
                  }
                  className="w-28 rounded border border-gray-200 bg-white px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
                <select
                  value={p.present ? "present" : "excused"}
                  onChange={(e) =>
                    updateParticipant(
                      i,
                      "present",
                      e.target.value === "present"
                    )
                  }
                  className="rounded border border-gray-200 bg-white px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
                >
                  <option value="present">{t("present")}</option>
                  <option value="excused">{t("excused")}</option>
                </select>
                {participants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeParticipant(i)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addParticipant}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("add_participant")}
          </button>
        </div>

        {/* Section 3: Audio */}
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            <FileAudio className="mr-2 inline h-4 w-4" />
            {t("audio")}
          </h2>

          {/* Recording option */}
          {audioMode !== "upload" && (
            <div className="mb-4">
              {!recorder.isRecording && !recorder.audioBlob && (
                <button
                  type="button"
                  onClick={() => {
                    setAudioMode("record");
                    recorder.startRecording();
                  }}
                  className="flex w-full items-center justify-center gap-3 rounded-lg border-2 border-dashed border-red-200 bg-red-50/50 py-8 text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white shadow-lg">
                    <Mic className="h-6 w-6" />
                  </div>
                  <span className="text-base font-medium">
                    {t("start_recording")}
                  </span>
                </button>
              )}

              {/* Recording in progress */}
              {recorder.isRecording && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-6">
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
                      <span className="text-3xl font-mono font-bold text-gray-900">
                        {recorder.formatDuration(recorder.duration)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {recorder.isPaused ? (
                        <button
                          type="button"
                          onClick={recorder.resumeRecording}
                          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                          <Play className="h-4 w-4" />
                          {t("resume")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={recorder.pauseRecording}
                          className="inline-flex items-center gap-1.5 rounded-md bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
                        >
                          <Pause className="h-4 w-4" />
                          {t("pause")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={recorder.stopRecording}
                        className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                      >
                        <Square className="h-4 w-4" />
                        {t("stop_recording")}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Recording complete */}
              {recorder.audioBlob && !recorder.isRecording && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileAudio className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {t("recording_complete")}
                        </p>
                        <p className="text-xs text-gray-500">
                          {recorder.formatDuration(recorder.duration)}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        recorder.resetRecording();
                        setAudioMode(null);
                      }}
                      className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      {t("reset")}
                    </button>
                  </div>
                  {recorder.audioUrl && (
                    <audio
                      controls
                      src={recorder.audioUrl}
                      className="mt-3 w-full"
                    />
                  )}
                </div>
              )}

              {recorder.error && (
                <div className="mt-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {t(recorder.error)}
                </div>
              )}
            </div>
          )}

          {/* Divider */}
          {!recorder.isRecording &&
            !recorder.audioBlob &&
            audioMode !== "upload" && (
              <div className="my-4 flex items-center gap-3">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400">
                  {t("or_upload")}
                </span>
                <div className="flex-1 border-t border-gray-200" />
              </div>
            )}

          {/* Upload option */}
          {audioMode !== "record" &&
            !recorder.isRecording &&
            !recorder.audioBlob && (
              <div>
                {!uploadedFile ? (
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 py-8 text-gray-500 transition-colors hover:border-blue-300 hover:bg-blue-50/30"
                  >
                    <Upload className="h-8 w-8 text-gray-400" />
                    <p className="text-sm">{t("upload_audio")}</p>
                    <p className="text-xs text-gray-400">
                      {t("upload_formats")}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileAudio className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {uploadedFile.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedFile(null);
                          if (uploadedUrl) URL.revokeObjectURL(uploadedUrl);
                          setUploadedUrl(null);
                          setAudioMode(null);
                        }}
                        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {uploadedUrl && (
                      <audio
                        controls
                        src={uploadedUrl}
                        className="mt-3 w-full"
                      />
                    )}
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,.wav,.m4a,.ogg,.webm,audio/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mic className="h-4 w-4" />
            {t("transcribe_and_generate")}
          </button>
        </div>
      </div>
    </div>
  );
}
