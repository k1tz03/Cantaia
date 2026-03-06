"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  Clock,
  FileText,
  Pencil,
  Send,
  CheckCircle,
  Mic,
  Download,
  AlertTriangle,
  Loader2,
  Plus,
} from "lucide-react";
import { TaskCreateModal } from "@/components/tasks/TaskCreateModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { MeetingStatus, Meeting, Project } from "@cantaia/database";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m} min`;
}

function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_LABELS: Record<MeetingStatus, { color: string; bg: string }> = {
  scheduled: { color: "text-gray-600", bg: "bg-gray-100" },
  recording: { color: "text-red-600", bg: "bg-red-50" },
  transcribing: { color: "text-amber-600", bg: "bg-amber-50" },
  generating_pv: { color: "text-blue-600", bg: "bg-blue-50" },
  review: { color: "text-blue-600", bg: "bg-blue-50" },
  finalized: { color: "text-green-600", bg: "bg-green-50" },
  sent: { color: "text-green-700", bg: "bg-green-50" },
};

export default function MeetingDetailPage() {
  const t = useTranslations("meetings");
  const params = useParams();
  const meetingId = params.id as string;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loadingMeeting, setLoadingMeeting] = useState(true);
  const [sending, setSending] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);

  useEffect(() => {
    if (!meetingId) return;
    const supabase = createClient();

    (supabase.from("meetings") as any)
      .select("*")
      .eq("id", meetingId)
      .maybeSingle()
      .then(({ data, error }: { data: Meeting | null; error: any }) => {
        if (!error && data) {
          setMeeting(data);
          // Load associated project
          (supabase.from("projects") as any)
            .select("*")
            .eq("id", data.project_id)
            .maybeSingle()
            .then(({ data: proj }: { data: Project | null }) => {
              if (proj) setProject(proj);
            });
        }
        setLoadingMeeting(false);
      });
  }, [meetingId]);
  const [taskPrefill, setTaskPrefill] = useState<{
    title?: string;
    project_id?: string;
    description?: string;
    source?: "meeting";
    source_reference?: string;
    due_date?: string;
    assigned_to_name?: string;
    assigned_to_company?: string;
  } | undefined>(undefined);
  const [createdActionIds, setCreatedActionIds] = useState<Set<string>>(new Set());

  if (loadingMeeting) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">Séance introuvable</p>
      </div>
    );
  }

  const statusCfg = STATUS_LABELS[meeting.status];

  function handleFinalize() {
    setFinalizeConfirmOpen(true);
  }

  async function executeFinalize() {
    setFinalizing(true);
    if (process.env.NODE_ENV === "development") console.log("[Meeting] Finalizing:", meetingId);
    await new Promise((r) => setTimeout(r, 1000));
    setFinalizing(false);
  }

  async function handleSend() {
    setSending(true);
    // Mock send
    if (process.env.NODE_ENV === "development") console.log("[Meeting] Sending PV:", meetingId);
    await new Promise((r) => setTimeout(r, 1000));
    setSending(false);
  }

  async function handleExportWord() {
    if (!meeting?.pv_content) return;
    setExporting(true);
    try {
      const res = await fetch("/api/meetings/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pv_content: meeting.pv_content }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `PV-${meeting.pv_content.header.project_code}-${meeting.pv_content.header.meeting_number}.docx`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("[Meeting] Export error:", err);
    } finally {
      setExporting(false);
    }
  }

  // Audio retention warning
  const audioRetentionDays = meeting.audio_retention_until
    ? Math.max(0, Math.ceil((new Date(meeting.audio_retention_until).getTime() - Date.now()) / 86400000))
    : null;

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/meetings"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{meeting.title}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.color} ${statusCfg.bg}`}>
                {t(`status${meeting.status.charAt(0).toUpperCase()}${meeting.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}` as
                  "statusScheduled" | "statusRecording" | "statusTranscribing" | "statusGenerating" | "statusDraft" | "statusFinalized" | "statusSent"
                )}
              </span>
            </div>
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

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {meeting.status === "scheduled" && (
            <Link
              href={`/meetings/${meeting.id}/record`}
              className="inline-flex items-center gap-1.5 rounded-md bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
            >
              <Mic className="h-4 w-4" />
              {t("record")}
            </Link>
          )}
          {meeting.status === "review" && (
            <>
              <Link
                href={`/meetings/${meeting.id}/edit`}
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100"
              >
                <Pencil className="h-4 w-4" />
                {t("editPV")}
              </Link>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={finalizing}
                className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {t("finalize")}
              </button>
            </>
          )}
          {meeting.status === "finalized" && (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-500 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t("sendPV")}
            </button>
          )}
          {meeting.pv_content && (
            <button
              type="button"
              onClick={handleExportWord}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {t("exportPV")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* Meeting info */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Détails</h3>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-4 w-4 text-gray-400" />
              {formatDate(meeting.meeting_date)} à {formatTime(meeting.meeting_date)}
            </div>
            {meeting.location && (
              <div className="flex items-start gap-2 text-gray-600">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                {meeting.location}
              </div>
            )}
            {meeting.planned_duration_minutes && (
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="h-4 w-4 text-gray-400" />
                {meeting.planned_duration_minutes} {t("minutes")}
              </div>
            )}
            {meeting.audio_duration_seconds && (
              <div className="flex items-center gap-2 text-gray-600">
                <Mic className="h-4 w-4 text-gray-400" />
                {formatDuration(meeting.audio_duration_seconds)}
                {meeting.audio_file_size_bytes && (
                  <span className="text-gray-400">
                    ({formatFileSize(meeting.audio_file_size_bytes)})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Audio retention warning */}
          {audioRetentionDays !== null && audioRetentionDays <= 7 && !meeting.audio_retained && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div className="text-xs text-amber-700">
                  <p className="font-medium">{t("audioRetention")}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-amber-300 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                    >
                      {t("downloadAudio")}
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200"
                    >
                      {t("keepAudioPremium")}
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] text-amber-500">{t("keepAudioPremiumDesc")}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Participants */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">
              {t("participantsLabel")} ({meeting.participants.length})
            </h3>
          </div>
          <div className="mt-3 space-y-2">
            {meeting.participants.map((p, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1.5"
              >
                <div>
                  <span className="text-sm font-medium text-gray-800">{p.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{p.company}</span>
                </div>
                <span
                  className={`text-xs font-medium ${
                    p.present ? "text-green-600" : "text-gray-400"
                  }`}
                >
                  {p.present ? t("present") : t("absent")}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Agenda */}
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-900">{t("agendaLabel")}</h3>
          </div>
          <div className="mt-3 space-y-1.5">
            {meeting.agenda.map((point, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-medium text-gray-500">
                  {idx + 1}
                </span>
                <span className="text-gray-700">{point}</span>
              </div>
            ))}
          </div>

          {/* Send info */}
          {meeting.sent_at && meeting.sent_to.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-500">
                <Send className="mr-1 inline h-3 w-3" />
                Envoyé le {new Date(meeting.sent_at).toLocaleDateString("fr-CH")} à {meeting.sent_to.length} destinataires
              </p>
            </div>
          )}
        </div>
      </div>

      {/* PV Summary (if available) */}
      {meeting.pv_content && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Résumé du PV</h3>
          <p className="mt-2 text-sm text-gray-600 italic">
            {meeting.pv_content.summary_fr}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {meeting.pv_content.sections.length} points traités
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-xs text-gray-400">
              {meeting.pv_content.sections.reduce((acc, s) => acc + s.actions.length, 0)} actions
            </span>
          </div>
        </div>
      )}

      {/* PV Actions → Tasks */}
      {meeting.pv_content && meeting.pv_content.sections.some((s) => s.actions.length > 0) && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">{t("pvActions")}</h3>
          <p className="mt-1 text-xs text-gray-500">{t("pvActionsDescription")}</p>
          <div className="mt-4 space-y-3">
            {meeting.pv_content.sections.map((section) =>
              section.actions.map((action, actionIdx) => {
                const actionId = `${section.number}-${actionIdx}`;
                const isCreated = createdActionIds.has(actionId);
                return (
                  <div
                    key={actionId}
                    className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        {action.description}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                        <span className="font-medium text-gray-600">
                          {action.responsible_name}
                        </span>
                        {action.responsible_company && (
                          <span className="text-gray-400">({action.responsible_company})</span>
                        )}
                        {action.deadline && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {action.deadline}
                          </span>
                        )}
                        {action.priority === "urgent" && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-600">
                            Urgent
                          </span>
                        )}
                        <span className="text-gray-400">
                          Point {section.number}
                        </span>
                      </div>
                    </div>
                    {isCreated ? (
                      <span className="flex items-center gap-1 whitespace-nowrap text-xs font-medium text-green-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        {t("taskCreated")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setCreatedActionIds((prev) => new Set(prev).add(actionId));
                          setTaskPrefill({
                            title: action.description,
                            project_id: meeting.project_id,
                            description: `PV Séance #${meeting.meeting_number || ""} — Point ${section.number}: ${section.title}`,
                            source: "meeting",
                            source_reference: `PV Séance #${meeting.meeting_number || ""} — Point ${section.number}`,
                            due_date: action.deadline || undefined,
                            assigned_to_name: action.responsible_name,
                            assigned_to_company: action.responsible_company,
                          });
                          setTaskModalOpen(true);
                        }}
                        className="flex items-center gap-1 whitespace-nowrap rounded-md border border-brand/30 px-2.5 py-1.5 text-xs font-medium text-brand hover:bg-brand/5"
                      >
                        <Plus className="h-3 w-3" />
                        {t("createTask")}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Task create modal */}
      <TaskCreateModal
        open={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setTaskPrefill(undefined); }}
        onCreated={() => { setTaskModalOpen(false); setTaskPrefill(undefined); }}
        prefill={taskPrefill as any}
      />

      <ConfirmDialog
        open={finalizeConfirmOpen}
        onClose={() => setFinalizeConfirmOpen(false)}
        onConfirm={executeFinalize}
        title={t("finalizeConfirm")}
        description={t("finalizeDescription")}
        variant="danger"
      />
    </div>
  );
}
