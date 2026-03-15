"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  FileText,
  Mic,
  CheckSquare,
  File,
  MapPin,
  Clock,
  Calendar,
  Target,
  DollarSign,
  AlertTriangle,
  Loader2,
  Download,
  Camera,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ClientVisit, VisitPhoto } from "@cantaia/database";
import { PhotoGallery } from "@/components/visits/PhotoGallery";
import { PhotoCapture } from "@/components/visits/PhotoCapture";
import { HandwrittenNotesResult } from "@/components/visits/HandwrittenNotesResult";

type Tab = "report" | "transcription" | "photos" | "tasks" | "documents";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-CH", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

export default function VisitDetailPage() {
  const t = useTranslations("visits");
  const params = useParams();
  const visitId = params.id as string;
  const [visit, setVisit] = useState<ClientVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("report");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadVisit();
  }, [visitId]);

  async function loadVisit() {
    try {
      const supabase = createClient();
      const { data } = await (supabase.from("client_visits") as any)
        .select("*")
        .eq("id", visitId)
        .maybeSingle();
      setVisit(data);
    } catch (err) {
      console.error("Failed to load visit:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/visits/export-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: visitId }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="(.+)"/);
      a.download = match?.[1] || `rapport-visite-${visitId}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // Reload to show updated report_pdf_url
      loadVisit();
    } catch (err) {
      console.error("Export error:", err);
    } finally {
      setExporting(false);
    }
  }

  async function updateStatus(status: string) {
    if (!visit) return;
    const supabase = createClient();
    await (supabase.from("client_visits") as any)
      .update({ status })
      .eq("id", visitId);
    setVisit({ ...visit, status: status as any });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!visit) {
    return (
      <div className="p-6 text-center text-sm text-gray-500">
        Visite introuvable
      </div>
    );
  }

  const report = visit.report || {};
  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "report", label: t("tabReport"), icon: FileText },
    { id: "transcription", label: t("tabTranscription"), icon: Mic },
    { id: "photos", label: t("photos.tabPhotos"), icon: Camera, badge: visit.photos_count || 0 },
    { id: "tasks", label: t("tabTasks"), icon: CheckSquare },
    { id: "documents", label: t("tabDocuments"), icon: File },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <Link href="/visits" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-4 w-4" />
        {t("title")}
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {visit.client_name}
            {visit.title && <span className="ml-2 text-gray-500">— {visit.title}</span>}
          </h1>
          <div className="mt-1.5 flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {formatDate(visit.visit_date)}
            </span>
            {visit.duration_minutes && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {visit.duration_minutes} min
              </span>
            )}
            {(visit.client_address || visit.client_city) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[visit.client_address, visit.client_postal_code, visit.client_city].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {visit.status === "report_ready" && (
            <button
              onClick={() => updateStatus("quoted")}
              className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700"
            >
              {t("markQuoted")}
            </button>
          )}
          {visit.status === "quoted" && (
            <>
              <button
                onClick={() => updateStatus("won")}
                className="rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white hover:bg-green-700"
              >
                {t("markWon")}
              </button>
              <button
                onClick={() => updateStatus("lost")}
                className="rounded-lg bg-gray-500 px-3 py-2 text-xs font-medium text-white hover:bg-gray-600"
              >
                {t("markLost")}
              </button>
            </>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || !report.summary}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {t("exportPdf")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.badge ? (
                <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "report" && <ReportTab visit={visit} report={report} />}
      {activeTab === "transcription" && <TranscriptionTab visit={visit} />}
      {activeTab === "photos" && <PhotosTab visit={visit} onPhotosChanged={loadVisit} />}
      {activeTab === "tasks" && <TasksTab visit={visit} />}
      {activeTab === "documents" && <DocumentsTab visit={visit} />}
    </div>
  );
}

/* ═══════ Report Tab ═══════ */
function ReportTab({ visit, report }: { visit: ClientVisit; report: any }) {
  const t = useTranslations("visits");

  if (!report.summary && visit.report_status !== "completed") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 text-center">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-amber-500" />
        <p className="text-sm font-medium text-amber-800">{t("generatingReport")}</p>
      </div>
    );
  }

  const requests = report.client_requests || [];
  const highPriority = requests.filter((r: any) => r.priority === "high");
  const mediumPriority = requests.filter((r: any) => r.priority === "medium");
  const lowPriority = requests.filter((r: any) => r.priority === "low");

  return (
    <div className="space-y-5">
      {/* Summary */}
      <Section title={t("summary")}>
        <p className="text-sm text-gray-700 leading-relaxed">{report.summary}</p>
      </Section>

      {/* Client requests */}
      <Section title={`${t("clientRequests")} (${requests.length})`}>
        {highPriority.length > 0 && (
          <PriorityGroup label={t("highPriority")} color="red" requests={highPriority} />
        )}
        {mediumPriority.length > 0 && (
          <PriorityGroup label={t("mediumPriority")} color="amber" requests={mediumPriority} />
        )}
        {lowPriority.length > 0 && (
          <PriorityGroup label={t("lowPriority")} color="green" requests={lowPriority} />
        )}
      </Section>

      {/* Measurements */}
      {report.measurements && report.measurements.length > 0 && (
        <Section title={t("measurements")}>
          <ul className="space-y-1.5">
            {report.measurements.map((m: any, i: number) => (
              <li key={i} className="text-sm text-gray-700">
                <span className="font-medium">{m.zone}</span> : {m.dimensions}
                {m.notes && <span className="text-gray-400"> — {m.notes}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Constraints */}
      {report.constraints && report.constraints.length > 0 && (
        <Section title={t("constraints")}>
          <ul className="space-y-1.5">
            {report.constraints.map((c: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                {c}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Budget */}
      {report.budget && (
        <Section title={t("budget")}>
          {report.budget.client_mentioned ? (
            <div>
              <p className="text-sm text-gray-700">
                <DollarSign className="mr-1 inline h-4 w-4 text-gray-400" />
                {report.budget.range_min?.toLocaleString("fr-CH")}
                {report.budget.range_max ? ` — ${report.budget.range_max.toLocaleString("fr-CH")}` : ""}
                {" "}{report.budget.currency || "CHF"}
              </p>
              {report.budget.notes && (
                <p className="mt-1 text-xs text-gray-500 italic">&ldquo;{report.budget.notes}&rdquo;</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">{t("budgetNotMentioned")}</p>
          )}
        </Section>
      )}

      {/* Timeline */}
      {report.timeline && (
        <Section title={t("timeline")}>
          <div className="space-y-1 text-sm text-gray-700">
            {report.timeline.desired_start && (
              <p><Calendar className="mr-1 inline h-3.5 w-3.5 text-gray-400" /> {t("desiredStart")} : {report.timeline.desired_start}</p>
            )}
            {report.timeline.desired_end && (
              <p><Calendar className="mr-1 inline h-3.5 w-3.5 text-gray-400" /> {t("desiredEnd")} : {report.timeline.desired_end}</p>
            )}
            {report.timeline.constraints && (
              <p className="text-amber-600"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> {report.timeline.constraints}</p>
            )}
            <p>{t("urgency")} : <span className="font-medium">{t(`urgency${(report.timeline.urgency || "moderate").charAt(0).toUpperCase() + (report.timeline.urgency || "moderate").slice(1)}` as any)}</span></p>
          </div>
        </Section>
      )}

      {/* Next steps */}
      {report.next_steps && report.next_steps.length > 0 && (
        <Section title={t("nextSteps")}>
          <ul className="space-y-1.5">
            {report.next_steps.map((step: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" className="mt-1 h-4 w-4 rounded border-gray-300" />
                {step}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Competitors */}
      {report.competitors_mentioned && report.competitors_mentioned.length > 0 && (
        <Section title={t("competitors")}>
          <ul className="space-y-1">
            {report.competitors_mentioned.map((c: string, i: number) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                {c}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* AI Analysis */}
      {(report.sentiment || report.closing_probability) && (
        <Section title={t("aiAnalysis")}>
          <div className="space-y-2">
            {report.closing_probability && (
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium text-gray-700">
                  {t("closingProbability")} : {Math.round(report.closing_probability * 100)}%
                </span>
                <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${report.closing_probability * 100}%` }}
                  />
                </div>
              </div>
            )}
            {report.sentiment && (
              <p className="text-sm text-gray-700">
                {t("sentiment")} : <span className="font-medium">{t(`sentiment${report.sentiment.charAt(0).toUpperCase() + report.sentiment.slice(1)}` as any)}</span>
              </p>
            )}
            {report.closing_notes && (
              <p className="text-xs text-gray-500 italic">{report.closing_notes}</p>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ═══════ Transcription Tab ═══════ */
function TranscriptionTab({ visit }: { visit: ClientVisit }) {
  const t = useTranslations("visits");

  if (!visit.transcription) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <Mic className="mx-auto mb-3 h-8 w-8 text-gray-300" />
        <p className="text-sm text-gray-500">{t("transcribing")}</p>
      </div>
    );
  }

  const paragraphs = visit.transcription.split("\n\n").filter(Boolean);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="space-y-4">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-gray-700">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

/* ═══════ Tasks Tab ═══════ */
function TasksTab({ visit }: { visit: ClientVisit }) {
  const t = useTranslations("visits");
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, [visit.id]);

  async function loadTasks() {
    try {
      const supabase = createClient();
      const { data } = await (supabase.from("tasks") as any)
        .select("id, title, status, priority, due_date")
        .eq("source_id", visit.id)
        .eq("source_type", "client_visit")
        .order("created_at");
      setTasks(data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {tasks.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-400">
          {t("tabTasks")} — Aucune tâche créée
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <CheckSquare className={`h-4 w-4 ${task.status === "done" ? "text-green-500" : "text-gray-300"}`} />
                <span className="text-sm text-gray-700">{task.title}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  task.priority === "high" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-600"
                }`}>
                  {task.priority}
                </span>
                {task.due_date && (
                  <span className="text-xs text-gray-400">
                    {new Date(task.due_date).toLocaleDateString("fr-CH")}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════ Documents Tab ═══════ */
function DocumentsTab({ visit }: { visit: ClientVisit }) {
  const t = useTranslations("visits");

  async function downloadDocument(storagePath: string, filename: string) {
    const supabase = createClient();
    const { data } = await supabase.storage.from("audio").download(storagePath);
    if (!data) return;
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      {visit.audio_url && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-3">
          <div className="flex items-center gap-3">
            <Mic className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">{t("audioFile")}</p>
              <p className="text-xs text-gray-400">
                {visit.audio_file_name || "recording.webm"}
                {visit.audio_file_size ? ` · ${(visit.audio_file_size / (1024 * 1024)).toFixed(1)} MB` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={() => downloadDocument(visit.audio_url!, visit.audio_file_name || "recording.webm")}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Download className="h-3.5 w-3.5" />
            {t("download")}
          </button>
        </div>
      )}
      {visit.report_pdf_url && (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-5 py-3">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-gray-700">{t("reportDocument")}</p>
              <p className="text-xs text-gray-400">.docx</p>
            </div>
          </div>
          <button
            onClick={() => downloadDocument(visit.report_pdf_url!, `rapport-visite-${visit.client_name}.docx`)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <Download className="h-3.5 w-3.5" />
            {t("download")}
          </button>
        </div>
      )}
      {!visit.audio_url && !visit.report_pdf_url && (
        <div className="rounded-lg border border-gray-200 bg-white py-12 text-center text-sm text-gray-400">
          {t("tabDocuments")} — {t("noDocuments")}
        </div>
      )}
    </div>
  );
}

/* ═══════ Photos Tab ═══════ */
function PhotosTab({ visit, onPhotosChanged }: { visit: ClientVisit; onPhotosChanged: () => void }) {
  const t = useTranslations("visits");
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [orgId, setOrgId] = useState("");

  useEffect(() => {
    loadPhotos();
  }, [visit.id]);

  async function loadPhotos() {
    try {
      const res = await fetch(`/api/visits/photos?visit_id=${visit.id}`);
      if (res.ok) {
        const data = await res.json();
        setPhotos(data.photos || []);
      }

      // Get org ID for upload
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userData } = await (supabase.from("users") as any)
          .select("organization_id")
          .eq("id", user.id)
          .maybeSingle();
        if (userData?.organization_id) setOrgId(userData.organization_id);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(photoId: string) {
    if (!confirm(t("photos.deleteConfirm"))) return;
    try {
      await fetch(`/api/visits/photos/${photoId}`, { method: "DELETE" });
      await loadPhotos();
      onPhotosChanged();
    } catch {
      // ignore
    }
  }

  async function handleUpdateCaption(photoId: string, caption: string) {
    try {
      await fetch(`/api/visits/photos/${photoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caption }),
      });
      setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, caption } : p));
    } catch {
      // ignore
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>;
  }

  const notesPhotos = photos.filter((p) => p.photo_type === "handwritten_notes");
  const sitePhotos = photos.filter((p) => p.photo_type === "site");

  return (
    <div className="space-y-6">
      {/* Add photos button */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-4 w-4" />
          {t("photos.addPhotos")}
        </button>
      </div>

      {/* Upload section */}
      {showUpload && orgId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-purple-800">
              <Camera className="h-4 w-4" />
              {t("photos.handwrittenNotes")}
            </h4>
            <PhotoCapture
              visitId={visit.id}
              orgId={orgId}
              photoType="handwritten_notes"
              onPhotosUploaded={() => { loadPhotos(); onPhotosChanged(); }}
            />
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-blue-800">
              <Camera className="h-4 w-4" />
              {t("photos.sitePhotos")}
            </h4>
            <PhotoCapture
              visitId={visit.id}
              orgId={orgId}
              photoType="site"
              onPhotosUploaded={() => { loadPhotos(); onPhotosChanged(); }}
            />
          </div>
        </div>
      )}

      {/* Handwritten notes section */}
      {notesPhotos.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            {t("photos.handwrittenNotes")} ({notesPhotos.length})
          </h3>
          <div className="space-y-3">
            {notesPhotos.map((photo) => (
              <HandwrittenNotesResult
                key={photo.id}
                photo={photo}
                onAnalysisComplete={loadPhotos}
              />
            ))}
          </div>
        </div>
      )}

      {/* Site photos section */}
      {sitePhotos.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            {t("photos.sitePhotos")} ({sitePhotos.length})
          </h3>
          <PhotoGallery
            photos={sitePhotos}
            onDelete={handleDelete}
            onUpdateCaption={handleUpdateCaption}
          />
        </div>
      )}

      {/* Empty state */}
      {photos.length === 0 && !showUpload && (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center">
          <Camera className="mx-auto mb-3 h-8 w-8 text-gray-300" />
          <p className="text-sm text-gray-500">{t("photos.noPhotos")}</p>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {t("photos.addPhotos")}
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════ Helpers ═══════ */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function PriorityGroup({ label, color, requests }: { label: string; color: string; requests: any[] }) {
  const colorMap: Record<string, string> = {
    red: "text-red-600",
    amber: "text-amber-600",
    green: "text-green-600",
  };

  return (
    <div className="mb-3">
      <p className={`mb-1.5 text-xs font-semibold ${colorMap[color]}`}>{label} :</p>
      <ul className="space-y-2">
        {requests.map((r: any, i: number) => (
          <li key={i} className="text-sm text-gray-700">
            <span className="font-medium capitalize">{r.category?.replace(/_/g, " ")}</span> — {r.description}
            {r.cfc_code && <span className="ml-1 text-xs text-gray-400">CFC {r.cfc_code}</span>}
            {r.details && <p className="mt-0.5 text-xs text-gray-400">{r.details}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
