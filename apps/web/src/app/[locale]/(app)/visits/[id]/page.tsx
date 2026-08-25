"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
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
  RefreshCw,
  FolderPlus,
  X,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ClientVisit, VisitPhoto } from "@cantaia/database";
import { PhotoGallery } from "@/components/visits/PhotoGallery";
import { PhotoCapture } from "@/components/visits/PhotoCapture";
import { HandwrittenNotesResult } from "@/components/visits/HandwrittenNotesResult";
import { handleInsufficientCredits } from "@/components/credits/PaywallDialog";
import { notifyCreditsChanged } from "@/lib/hooks/use-credits";

type Tab = "report" | "transcription" | "photos" | "tasks" | "documents";

/** `signed_url` is added by GET /api/visits/photos (private `audio` bucket). */
type VisitPhotoWithUrl = VisitPhoto & { signed_url?: string | null };

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
  const [showConvert, setShowConvert] = useState(false);

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
      const { exportFile } = await import("@/lib/tauri");
      await exportFile("/api/visits/export-report", {
        method: "POST",
        body: { visit_id: visitId },
        fallbackFilename: `rapport-visite-${visitId}.pdf`,
      });
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
      <div className="p-6 text-center text-sm text-[#A1A1AA]">
        {t("visitNotFound")}
      </div>
    );
  }

  const report = visit.report || {};

  // A prospect visit with no project is convertible. `suggest_create_project`
  // is returned by POST /api/visits/generate-report but never stored, so the
  // same condition is recomputed here — that way the nudge survives a reload
  // instead of vanishing with the response that carried it.
  const canConvert = Boolean(visit.is_prospect && !visit.project_id);
  const suggestCreateProject = canConvert && (report.closing_probability || 0) > 0.5;

  const tabs: { id: Tab; label: string; icon: React.ComponentType<any>; badge?: number }[] = [
    { id: "report", label: t("tabReport"), icon: FileText },
    { id: "transcription", label: t("tabTranscription"), icon: Mic },
    { id: "photos", label: t("photos.tabPhotos"), icon: Camera, badge: visit.photos_count || 0 },
    { id: "tasks", label: t("tabTasks"), icon: CheckSquare },
    { id: "documents", label: t("tabDocuments"), icon: File },
  ];

  return (
    <div className="p-6">
      {/* Header */}
      <Link href="/visits" className="mb-4 inline-flex items-center gap-1 text-sm text-[#A1A1AA] hover:text-[#FAFAFA]">
        <ArrowLeft className="h-4 w-4" />
        {t("title")}
      </Link>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#FAFAFA]">
            {visit.client_name}
            {visit.title && <span className="ml-2 text-[#A1A1AA]">— {visit.title}</span>}
          </h1>
          <div className="mt-1.5 flex items-center gap-4 text-sm text-[#A1A1AA]">
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
          {canConvert && (
            <button
              onClick={() => setShowConvert(true)}
              className="flex items-center gap-1.5 rounded-lg bg-[#F97316] px-3 py-2 text-xs font-medium text-[#0F0F11] hover:bg-[#EA580C]"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              {t("convertToProject")}
            </button>
          )}
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
                className="rounded-lg bg-[#52525B] px-3 py-2 text-xs font-medium text-white hover:bg-[#71717A]"
              >
                {t("markLost")}
              </button>
            </>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || !report.summary}
            className="flex items-center gap-1.5 rounded-lg border border-[#27272A] px-3 py-2 text-xs font-medium text-[#A1A1AA] hover:bg-[#27272A] disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {t("exportPdf")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-[#27272A]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-[#F97316]"
                  : "border-transparent text-[#A1A1AA] hover:text-[#FAFAFA]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.badge ? (
                <span className="ml-1 rounded-full bg-[#27272A] px-1.5 py-0.5 text-[10px] font-medium text-[#A1A1AA]">
                  {tab.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* AI nudge: the client is likely to sign — turn the prospect into a project */}
      {suggestCreateProject && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-[#F97316]/30 bg-[#F97316]/10 px-4 py-3">
          <div className="flex items-start gap-2 text-sm text-[#F97316]">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {t("highSignatureProbability", {
                percent: report.closing_probability
                  ? ` (${Math.round(report.closing_probability * 100)}%)`
                  : "",
              })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowConvert(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-[#F97316] px-3 py-1.5 text-xs font-medium text-[#0F0F11] hover:bg-[#EA580C]"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            {t("convertToProject")}
          </button>
        </div>
      )}

      {/* Failure banners with retry */}
      <FailureBanner visit={visit} onRetried={loadVisit} />

      {/* Tab content */}
      {activeTab === "report" && <ReportTab visit={visit} report={report} />}
      {activeTab === "transcription" && <TranscriptionTab visit={visit} />}
      {activeTab === "photos" && <PhotosTab visit={visit} onPhotosChanged={loadVisit} />}
      {activeTab === "tasks" && <TasksTab visit={visit} />}
      {activeTab === "documents" && <DocumentsTab visit={visit} />}

      {showConvert && (
        <ConvertToProjectModal
          visit={visit}
          onClose={() => setShowConvert(false)}
          onConverted={loadVisit}
        />
      )}
    </div>
  );
}

/* ═══════ Prospect → project conversion ═══════ */
/**
 * Creates the project from the visit and hands the visit id to the API, which
 * links the two rows and replays the report's task generation (a prospect visit
 * produces no tasks — `tasks.project_id` is NOT NULL).
 */
function ConvertToProjectModal({
  visit,
  onClose,
  onConverted,
}: {
  visit: ClientVisit;
  onClose: () => void;
  onConverted: () => void;
}) {
  const t = useTranslations("visits");
  const router = useRouter();
  const report: any = visit.report || {};

  const [name, setName] = useState(
    visit.title ? `${visit.client_name} — ${visit.title}` : visit.client_name,
  );
  const [clientName, setClientName] = useState(visit.client_company || visit.client_name);
  const [address, setAddress] = useState(visit.client_address || "");
  const [city, setCity] = useState(visit.client_city || "");
  const [budget, setBudget] = useState(
    report.budget?.client_mentioned && report.budget?.range_max
      ? String(report.budget.range_max)
      : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConvert() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          client_name: clientName.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          budget_total: budget ? Number(budget) : null,
          status: "active",
          description: report.summary || null,
          source_visit_id: visit.id,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("projectCreateFailed"));
      }
      if (data.conversion?.error) {
        // The project exists but the visit could not be linked — say so rather
        // than pretending the conversion worked.
        throw new Error(
          t("visitLinkFailed", { error: data.conversion.error }),
        );
      }

      onConverted();
      onClose();
      router.push(`/projects/${data.project.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unexpectedError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-lg border border-[#27272A] bg-[#18181B] shadow-xl">
        <div className="flex items-center justify-between border-b border-[#27272A] px-5 py-4">
          <h3 className="text-sm font-semibold text-[#FAFAFA]">{t("convertVisitTitle")}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <label className="text-xs font-medium text-[#A1A1AA]">{t("projectNameLabel")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[#A1A1AA]">{t("clientLabel")}</label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-[#A1A1AA]">{t("addressLabel")}</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#A1A1AA]">{t("cityLabel")}</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] focus:border-[#F97316] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[#A1A1AA]">{t("estimatedBudgetLabel")}</label>
            <input
              type="number"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder={t("budgetPlaceholder")}
              className="mt-1 w-full rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] placeholder:text-[#52525B] focus:border-[#F97316] focus:outline-none sm:w-64"
            />
          </div>

          <p className="rounded-md bg-[#27272A]/60 px-3 py-2 text-xs text-[#A1A1AA]">
            {t("convertNote")}
          </p>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#27272A] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-[#A1A1AA] hover:bg-[#27272A]"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleConvert}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-semibold text-[#0F0F11] hover:bg-[#EA580C] disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("createProjectButton")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════ Failure banner + retry ═══════ */
function FailureBanner({ visit, onRetried }: { visit: ClientVisit; onRetried: () => void }) {
  const t = useTranslations("visits");
  const [retrying, setRetrying] = useState<"transcription" | "report" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const transcriptionFailed = visit.transcription_status === "failed";
  const reportFailed = (visit.report_status as string) === "failed";

  if (!transcriptionFailed && !reportFailed) return null;

  async function retry(kind: "transcription" | "report") {
    setRetrying(kind);
    setError(null);
    try {
      const endpoint =
        kind === "transcription" ? "/api/visits/transcribe" : "/api/visits/generate-report";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visit_id: visit.id }),
      });
      // Crédits insuffisants : la modale paywall remplace le message d'erreur.
      if (await handleInsufficientCredits(res)) {
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || t("operationFailedRetryLater"));
      }
      notifyCreditsChanged();
      onRetried();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("operationFailed"));
    } finally {
      setRetrying(null);
    }
  }

  return (
    <div className="mb-6 space-y-3">
      {transcriptionFailed && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
          <div className="flex items-start gap-2 text-sm text-red-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("transcriptionFailedBanner")}</span>
          </div>
          <button
            type="button"
            onClick={() => retry("transcription")}
            disabled={retrying !== null}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {retrying === "transcription" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {t("retry")}
          </button>
        </div>
      )}

      {reportFailed && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <div className="flex items-start gap-2 text-sm text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("reportGenerationFailedBanner")}</span>
          </div>
          <button
            type="button"
            onClick={() => retry("report")}
            disabled={retrying !== null || !visit.transcription}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {retrying === "report" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {t("retry")}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}

/* ═══════ Report Tab ═══════ */
function ReportTab({ visit, report }: { visit: ClientVisit; report: any }) {
  const t = useTranslations("visits");

  if (!report.summary && (visit.report_status as string) === "failed") {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-8 text-center">
        <AlertTriangle className="mx-auto mb-3 h-6 w-6 text-red-500" />
        <p className="text-sm font-medium text-red-400">
          {t("reportGenerationFailedRetry")}
        </p>
      </div>
    );
  }

  if (!report.summary && visit.report_status !== "completed") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-500/10 p-8 text-center">
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
        <p className="text-sm text-[#FAFAFA] leading-relaxed">{report.summary}</p>
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
              <li key={i} className="text-sm text-[#FAFAFA]">
                <span className="font-medium">{m.zone}</span> : {m.dimensions}
                {m.notes && <span className="text-[#A1A1AA]"> — {m.notes}</span>}
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
              <li key={i} className="flex items-start gap-2 text-sm text-[#FAFAFA]">
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
              <p className="text-sm text-[#FAFAFA]">
                <DollarSign className="mr-1 inline h-4 w-4 text-[#A1A1AA]" />
                {report.budget.range_min?.toLocaleString("fr-CH")}
                {report.budget.range_max ? ` — ${report.budget.range_max.toLocaleString("fr-CH")}` : ""}
                {" "}{report.budget.currency || "CHF"}
              </p>
              {report.budget.notes && (
                <p className="mt-1 text-xs text-[#A1A1AA] italic">&ldquo;{report.budget.notes}&rdquo;</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#A1A1AA]">{t("budgetNotMentioned")}</p>
          )}
        </Section>
      )}

      {/* Timeline */}
      {report.timeline && (
        <Section title={t("timeline")}>
          <div className="space-y-1 text-sm text-[#FAFAFA]">
            {report.timeline.desired_start && (
              <p><Calendar className="mr-1 inline h-3.5 w-3.5 text-[#A1A1AA]" /> {t("desiredStart")} : {report.timeline.desired_start}</p>
            )}
            {report.timeline.desired_end && (
              <p><Calendar className="mr-1 inline h-3.5 w-3.5 text-[#A1A1AA]" /> {t("desiredEnd")} : {report.timeline.desired_end}</p>
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
              <li key={i} className="flex items-start gap-2 text-sm text-[#FAFAFA]">
                <input type="checkbox" className="mt-1 h-4 w-4 rounded border-[#27272A]" />
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
              <li key={i} className="flex items-center gap-2 text-sm text-[#FAFAFA]">
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
                <span className="text-sm font-medium text-[#FAFAFA]">
                  {t("closingProbability")} : {Math.round(report.closing_probability * 100)}%
                </span>
                <div className="h-2 w-32 overflow-hidden rounded-full bg-[#27272A]">
                  <div
                    className="h-full rounded-full bg-[#F97316]/100"
                    style={{ width: `${report.closing_probability * 100}%` }}
                  />
                </div>
              </div>
            )}
            {report.sentiment && (
              <p className="text-sm text-[#FAFAFA]">
                {t("sentiment")} : <span className="font-medium">{t(`sentiment${report.sentiment.charAt(0).toUpperCase() + report.sentiment.slice(1)}` as any)}</span>
              </p>
            )}
            {report.closing_notes && (
              <p className="text-xs text-[#A1A1AA] italic">{report.closing_notes}</p>
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
    const failed = visit.transcription_status === "failed";
    return (
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-8 text-center">
        {failed ? (
          <>
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
            <p className="text-sm text-red-400">
              {t("transcriptionFailedRetry")}
            </p>
          </>
        ) : (
          <>
            <Mic className="mx-auto mb-3 h-8 w-8 text-[#A1A1AA]" />
            <p className="text-sm text-[#A1A1AA]">{t("transcribing")}</p>
          </>
        )}
      </div>
    );
  }

  const paragraphs = visit.transcription.split("\n\n").filter(Boolean);

  return (
    <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
      <div className="space-y-4">
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed text-[#FAFAFA]">
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
      // Tasks created from a visit carry source_id = visit id.
      // (`source` is the task_source enum — there is no 'client_visit' value,
      // and `source_type` does not exist on the tasks table.)
      const { data } = await (supabase.from("tasks") as any)
        .select("id, title, status, priority, due_date")
        .eq("source_id", visit.id)
        .order("created_at");
      setTasks(data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-[#A1A1AA]" /></div>;
  }

  return (
    <div className="rounded-lg border border-[#27272A] bg-[#0F0F11]">
      {tasks.length === 0 ? (
        <div className="py-12 text-center text-sm text-[#A1A1AA]">
          {t("tabTasks")} —{" "}
          {visit.project_id
            ? t("noTasksCreated")
            : t("noTasksNoProject")}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <CheckSquare className={`h-4 w-4 ${task.status === "done" ? "text-green-500" : "text-[#A1A1AA]"}`} />
                <span className="text-sm text-[#FAFAFA]">{task.title}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  task.priority === "high" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-[#27272A] text-[#A1A1AA]"
                }`}>
                  {task.priority}
                </span>
                {task.due_date && (
                  <span className="text-xs text-[#A1A1AA]">
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
        <div className="flex items-center justify-between rounded-lg border border-[#27272A] bg-[#0F0F11] px-5 py-3">
          <div className="flex items-center gap-3">
            <Mic className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-[#FAFAFA]">{t("audioFile")}</p>
              <p className="text-xs text-[#A1A1AA]">
                {visit.audio_file_name || "recording.webm"}
                {visit.audio_file_size ? ` · ${(visit.audio_file_size / (1024 * 1024)).toFixed(1)} MB` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={() => downloadDocument(visit.audio_url!, visit.audio_file_name || "recording.webm")}
            className="flex items-center gap-1 text-xs text-[#F97316] hover:text-[#F97316]"
          >
            <Download className="h-3.5 w-3.5" />
            {t("download")}
          </button>
        </div>
      )}
      {visit.report_pdf_url && (
        <div className="flex items-center justify-between rounded-lg border border-[#27272A] bg-[#0F0F11] px-5 py-3">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-[#FAFAFA]">{t("reportDocument")}</p>
              <p className="text-xs text-[#A1A1AA]">.pdf</p>
            </div>
          </div>
          <button
            onClick={() => downloadDocument(visit.report_pdf_url!, `rapport-visite-${visit.client_name}.pdf`)}
            className="flex items-center gap-1 text-xs text-[#F97316] hover:text-[#F97316]"
          >
            <Download className="h-3.5 w-3.5" />
            {t("download")}
          </button>
        </div>
      )}
      {!visit.audio_url && !visit.report_pdf_url && (
        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] py-12 text-center text-sm text-[#A1A1AA]">
          {t("tabDocuments")} — {t("noDocuments")}
        </div>
      )}
    </div>
  );
}

/* ═══════ Photos Tab ═══════ */
function PhotosTab({ visit, onPhotosChanged }: { visit: ClientVisit; onPhotosChanged: () => void }) {
  const t = useTranslations("visits");
  const [photos, setPhotos] = useState<VisitPhotoWithUrl[]>([]);
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

      // Get org ID for upload (via API route to bypass RLS recursion on users table)
      const profileRes = await fetch("/api/user/profile");
      if (profileRes.ok) {
        const profileData = await profileRes.json().catch(() => ({}));
        if (profileData?.profile?.organization_id) {
          setOrgId(profileData.profile.organization_id);
        }
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
    return <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-[#A1A1AA]" /></div>;
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
          className="flex items-center gap-1.5 rounded-lg border border-[#27272A] px-3 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
        >
          <Plus className="h-4 w-4" />
          {t("photos.addPhotos")}
        </button>
      </div>

      {/* Upload section */}
      {showUpload && orgId && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/10 p-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-purple-400">
              <Camera className="h-4 w-4" />
              {t("photos.handwrittenNotes")}
            </h4>
            <PhotoCapture
              visitId={visit.id}
              photoType="handwritten_notes"
              onPhotosUploaded={() => { loadPhotos(); onPhotosChanged(); }}
            />
          </div>
          <div className="rounded-lg border border-[#F97316]/20 bg-[#F97316]/10 p-4">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-[#F97316]">
              <Camera className="h-4 w-4" />
              {t("photos.sitePhotos")}
            </h4>
            <PhotoCapture
              visitId={visit.id}
              photoType="site"
              onPhotosUploaded={() => { loadPhotos(); onPhotosChanged(); }}
            />
          </div>
        </div>
      )}

      {/* Handwritten notes section */}
      {notesPhotos.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">
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
          <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">
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
        <div className="rounded-lg border border-dashed border-[#27272A] py-12 text-center">
          <Camera className="mx-auto mb-3 h-8 w-8 text-[#A1A1AA]" />
          <p className="text-sm text-[#A1A1AA]">{t("photos.noPhotos")}</p>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="mt-3 text-sm font-medium text-[#F97316] hover:text-[#F97316]"
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
    <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-5">
      <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">{title}</h3>
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
          <li key={i} className="text-sm text-[#FAFAFA]">
            <span className="font-medium capitalize">{r.category?.replace(/_/g, " ")}</span> — {r.description}
            {r.cfc_code && <span className="ml-1 text-xs text-[#A1A1AA]">CFC {r.cfc_code}</span>}
            {r.details && <p className="mt-0.5 text-xs text-[#A1A1AA]">{r.details}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
