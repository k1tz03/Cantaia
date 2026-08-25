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
  PenLine,
} from "lucide-react";
import { handleInsufficientCredits } from "@/components/credits/PaywallDialog";
import { notifyCreditsChanged } from "@/lib/hooks/use-credits";
import { withFallback } from "@/components/pv-chantier/pv-i18n";
import { toLocalDateString } from "@/components/calendar/datetime-utils";

interface Participant {
  name: string;
  company: string;
  role: string;
  present: boolean;
  /** Circulation address — carried into the PV header and the send modal. */
  email: string;
}

export default function NouveauPVPage() {
  const t = useTranslations("pv");
  const tf = withFallback(t);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Metadata
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(
    searchParams.get("project_id") || ""
  );
  const [title, setTitle] = useState("");
  // Local (Europe/Zurich) date, not the UTC date: between midnight and ~02h the
  // UTC day is yesterday, which would misdate the séance.
  const [meetingDate, setMeetingDate] = useState(toLocalDateString(new Date()));
  const [location, setLocation] = useState("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);

  // Participants
  const [participants, setParticipants] = useState<Participant[]>([
    { name: "", company: "", role: "", present: true, email: "" },
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
  // Set once the meeting row is created. A retry after a failed transcription
  // reuses it instead of creating a second (orphan) meeting with number N+1.
  const [createdMeetingId, setCreatedMeetingId] = useState<string | null>(null);

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
      // Next meeting number = max(meeting_number) + 1.
      // Using the row count would reuse numbers after a deletion and clash
      // with the server-side numbering in POST /api/pv.
      fetch(`/api/pv?project_id=${selectedProject}`)
        .then((r) => r.json())
        .then((data) => {
          const maxNumber = (data.meetings || []).reduce(
            (max: number, m: { meeting_number?: number | null }) =>
              Math.max(max, m.meeting_number || 0),
            0
          );
          setTitle(`${tf("meeting_default_title")} #${maxNumber + 1}`);
        })
        .catch(() => {
          setTitle(`${tf("meeting_default_title")} #1`);
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
              // The circulation address is the expensive part to re-type —
              // carrying it over is the whole point of "reprendre les
              // participants de la séance précédente".
              email: p.email || "",
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
      { name: "", company: "", role: "", present: true, email: "" },
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
      setError(tf("audio_format_unsupported"));
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

  /** Everything a meeting needs, audio excepted. */
  const hasMetadata =
    !!selectedProject &&
    !!title &&
    participants.filter((p) => p.name.trim()).length >= 1;

  const canSubmit = hasMetadata && getAudioBlob() !== null && !processing;
  const canCreateManual = hasMetadata && !processing;

  /**
   * "PV manuel" — creates the meeting and opens the editor on the org's outline,
   * without a recording. Site meetings are not always recorded (no phone, a
   * client who refuses, a five-minute point on site); before this, the only way
   * in was an audio file, so those séances never got a PV at all.
   */
  const handleCreateManual = async () => {
    if (!canCreateManual) return;
    setProcessing(true);
    setError(null);
    setProcessingStep(tf("manual_pv_creating"));

    try {
      const res = await fetch("/api/pv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: selectedProject,
          title,
          meeting_date: meetingDate,
          location,
          participants: participants.filter((p) => p.name.trim()),
          manual: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || tf("manual_pv_error"));
      }
      router.push(`/pv-chantier/${data.meeting.id}`);
    } catch (err: unknown) {
      console.error("Manual PV creation failed:", err);
      setError(err instanceof Error ? err.message : tf("error_generic"));
      setProcessing(false);
      setProcessingStep("");
    }
  };

  // Submit handler
  const handleSubmit = async () => {
    const audioBlob = getAudioBlob();
    if (!audioBlob || !selectedProject) return;

    setProcessing(true);
    setError(null);

    try {
      // 1. Create meeting in DB — but only once. On a retry after a Whisper
      // failure the meeting already exists; recreating it would leave an orphan
      // draft and burn a séance number.
      let meetingId = createdMeetingId;
      if (!meetingId) {
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
        if (!createRes.ok || !createData.success) throw new Error(createData.error || tf("error_generic"));
        meetingId = createData.meeting.id;
        setCreatedMeetingId(meetingId);
      }

      // 2. Compress large audio files client-side (Whisper API limit: 25 MB)
      let finalBlob = audioBlob;
      let finalExt = uploadedFile
        ? uploadedFile.name.split(".").pop() || "webm"
        : "webm";

      if (audioBlob.size > 24 * 1024 * 1024) {
        setProcessingStep(tf("compressing_audio"));
        const { compressAudioToMp3 } = await import(
          "@/lib/audio/compress-audio"
        );
        finalBlob = await compressAudioToMp3(audioBlob, (pct) => {
          setProcessingStep(`${tf("compressing_audio")} ${pct}%`);
        });
        finalExt = "mp3";
        console.log(
          `Audio compressed: ${(audioBlob.size / 1048576).toFixed(1)} MB → ${(finalBlob.size / 1048576).toFixed(1)} MB`
        );
      }

      // 3. Upload audio to Supabase Storage
      setProcessingStep(t("uploading_audio"));
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const storagePath = `${user.id}/${meetingId}.${finalExt}`;
      const contentType =
        finalExt === "mp3"
          ? "audio/mpeg"
          : (finalBlob.type || "audio/webm").replace("video/", "audio/");

      // upsert: a retry re-uploads to the same `${user.id}/${meetingId}` path.
      const { error: uploadError } = await supabase.storage
        .from("meeting-audio")
        .upload(storagePath, finalBlob, { contentType, upsert: true });

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
      // Crédits insuffisants : la modale paywall remplace la bannière d'erreur.
      // L'audio est déjà rattaché à la réunion, la transcription reste relançable.
      if (await handleInsufficientCredits(transcribeRes)) {
        setProcessingStep("");
        setProcessing(false);
        return;
      }
      const transcribeData = await transcribeRes.json();
      if (!transcribeData.success) throw new Error(transcribeData.error);
      notifyCreditsChanged();

      // 5. Generate PV
      setProcessingStep(t("generating"));
      const generateRes = await fetch("/api/ai/generate-pv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meeting_id: meetingId }),
      });
      if (await handleInsufficientCredits(generateRes)) {
        // Paywall ouverte — la transcription est conservée, on ouvre quand même
        // la fiche pour que le PV puisse être généré après recharge.
        setProcessingStep("");
        setProcessing(false);
        router.push(`/pv-chantier/${meetingId}`);
        return;
      }
      const generateData = await generateRes.json();
      if (!generateData.success) throw new Error(generateData.error);
      notifyCreditsChanged();

      // 6. Redirect to detail page
      router.push(`/pv-chantier/${meetingId}`);
    } catch (err: unknown) {
      console.error("Processing error:", err);
      setError(err instanceof Error ? err.message : tf("error_generic"));
      setProcessing(false);
    }
  };

  const selectedProjectData = projects.find(
    (p) => p.id === selectedProject
  );

  return (
    <div className="min-h-full bg-[#0F0F11] p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push("/pv-chantier")}
          className="rounded-md p-1.5 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#A1A1AA]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-[#FAFAFA]">
            {t("new_pv")}
          </h1>
        </div>
      </div>

      {/* Processing overlay */}
      {processing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F0F11]/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-[#27272A] bg-[#0F0F11] p-8 shadow-lg">
            <Loader2 className="h-10 w-10 animate-spin text-brand" />
            <p className="text-lg font-medium text-[#FAFAFA]">
              {processingStep}
            </p>
            <p className="text-sm text-[#A1A1AA]">
              {t("processing_wait")}
            </p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-3xl space-y-8">
        {/* Section 1: Metadata */}
        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
          <h2 className="mb-4 text-base font-semibold text-[#FAFAFA]">
            {t("metadata")}
          </h2>

          <div className="space-y-4">
            {/* Project */}
            <div>
              <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
                {t("select_project")} *
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                  className="flex w-full items-center justify-between rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] hover:bg-[#27272A]"
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
                    <span className="text-[#A1A1AA]">
                      {t("select_project")}
                    </span>
                  )}
                  <ChevronDown className="h-4 w-4 text-[#A1A1AA]" />
                </button>
                {showProjectDropdown && (
                  <div className="absolute left-0 top-full z-10 mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] py-1 shadow-lg">
                    {projects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setSelectedProject(p.id);
                          setShowProjectDropdown(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[#FAFAFA] hover:bg-[#27272A]"
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
              <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
                {t("col_title")} *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-md border border-[#27272A] px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
                  {t("date")} *
                </label>
                <input
                  type="date"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  className="w-full rounded-md border border-[#27272A] px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>

              {/* Location */}
              <div>
                <label className="mb-1 block text-sm font-medium text-[#FAFAFA]">
                  {t("location")}
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-md border border-[#27272A] px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Participants */}
        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#FAFAFA]">
              <Users className="mr-2 inline h-4 w-4" />
              {t("participants")} ({participants.filter((p) => p.name.trim()).length})
            </h2>
            {selectedProject && (
              <button
                type="button"
                onClick={loadPreviousParticipants}
                className="text-xs text-[#F97316] hover:text-[#F97316]"
              >
                {t("load_previous_participants")}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {participants.map((p, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 rounded-md border border-[#27272A] bg-[#27272A] p-2"
              >
                <input
                  type="text"
                  placeholder="Ex: Pierre Lambert"
                  value={p.name}
                  onChange={(e) =>
                    updateParticipant(i, "name", e.target.value)
                  }
                  className="min-w-[120px] flex-1 rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Ex: Implenia"
                  value={p.company}
                  onChange={(e) =>
                    updateParticipant(i, "company", e.target.value)
                  }
                  className="w-32 rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Ex: Chef de projet"
                  value={p.role}
                  onChange={(e) =>
                    updateParticipant(i, "role", e.target.value)
                  }
                  className="w-28 rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
                />
                {/* Circulation address — without it the participant cannot
                    receive the PV once it is finalized. */}
                <input
                  type="email"
                  placeholder={tf("participant_email_placeholder")}
                  value={p.email}
                  onChange={(e) =>
                    updateParticipant(i, "email", e.target.value)
                  }
                  className="min-w-[150px] flex-1 rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
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
                  className="rounded border border-[#27272A] bg-[#0F0F11] px-2 py-1.5 text-xs focus:border-brand focus:outline-none"
                >
                  <option value="present">{t("present")}</option>
                  <option value="excused">{t("excused")}</option>
                </select>
                {participants.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeParticipant(i)}
                    className="rounded p-1 text-[#A1A1AA] hover:bg-red-500/10 hover:text-red-500"
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
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#F97316] hover:text-[#F97316]"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("add_participant")}
          </button>
        </div>

        {/* Section 3: Audio */}
        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
          <h2 className="mb-4 text-base font-semibold text-[#FAFAFA]">
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
                  className="flex w-full items-center justify-center gap-3 rounded-lg border-2 border-dashed border-red-500/20 bg-red-500/5 py-8 text-red-400 transition-colors hover:border-red-500/30 hover:bg-red-500/10"
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
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-6">
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
                      <span className="text-3xl font-mono font-bold text-[#FAFAFA]">
                        {recorder.formatDuration(recorder.duration)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {recorder.isPaused ? (
                        <button
                          type="button"
                          onClick={recorder.resumeRecording}
                          className="inline-flex items-center gap-1.5 rounded-md bg-cta px-4 py-2 text-sm font-medium text-white hover:bg-[#EA580C]"
                        >
                          <Play className="h-4 w-4" />
                          {t("resume")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={recorder.pauseRecording}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#52525B] px-4 py-2 text-sm font-medium text-white hover:bg-[#3F3F46]"
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
                <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileAudio className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium text-[#FAFAFA]">
                          {t("recording_complete")}
                        </p>
                        <p className="text-xs text-[#A1A1AA]">
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
                      className="inline-flex items-center gap-1.5 text-sm text-[#A1A1AA] hover:text-[#FAFAFA]"
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
                <div className="mt-2 rounded-md bg-red-500/10 p-3 text-sm text-red-400">
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
                <div className="flex-1 border-t border-[#27272A]" />
                <span className="text-xs text-[#A1A1AA]">
                  {t("or_upload")}
                </span>
                <div className="flex-1 border-t border-[#27272A]" />
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
                    className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-[#27272A] bg-[#27272A]/50 py-8 text-[#A1A1AA] transition-colors hover:border-[#F97316]/30 hover:bg-[#F97316]/5"
                  >
                    <Upload className="h-8 w-8 text-[#A1A1AA]" />
                    <p className="text-sm">{t("upload_audio")}</p>
                    <p className="text-xs text-[#A1A1AA]">
                      {t("upload_formats")}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileAudio className="h-5 w-5 text-green-600" />
                        <div>
                          <p className="text-sm font-medium text-[#FAFAFA]">
                            {uploadedFile.name}
                          </p>
                          <p className="text-xs text-[#A1A1AA]">
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
                        className="inline-flex items-center gap-1.5 text-sm text-[#A1A1AA] hover:text-[#FAFAFA]"
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
          <div className="rounded-md border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Submit — audio flow, plus the manual escape hatch */}
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          <div className="flex flex-col items-start gap-1 sm:mr-auto">
            <button
              type="button"
              disabled={!canCreateManual}
              onClick={handleCreateManual}
              className="inline-flex items-center gap-2 rounded-md border border-[#27272A] px-4 py-2.5 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PenLine className="h-4 w-4" />
              {tf("manual_pv")}
            </button>
            <span className="text-xs text-[#A1A1AA]">{tf("manual_pv_hint")}</span>
          </div>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mic className="h-4 w-4" />
            {t("transcribe_and_generate")}
          </button>
        </div>
      </div>
    </div>
  );
}
