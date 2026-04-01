"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useProject } from "@/lib/hooks/use-supabase-data";
import {
  ArrowLeft,
  CheckCircle,
  Circle,
  Loader2,
  ShieldCheck,
  Mail,
  FileText,
  Upload,
  FolderCheck,
  ClipboardList,
  AlertTriangle,
  Archive,
} from "lucide-react";

interface ClosureStep {
  key: string;
  icon: React.ElementType;
  status: "completed" | "active" | "locked";
  count?: string;
  detail?: string;
}

export default function ProjectClosurePage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("closure");
  const [completing, setCompleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveReady, setArchiveReady] = useState(false);

  const searchParams = useSearchParams();
  const projectId = params.id as string;
  const { project, loading: projectLoading } = useProject(projectId);

  // Cache-bust param from reception page navigation (forces fresh fetch)
  const refreshTrigger = searchParams.get("t") || "";

  // Real data from Supabase
  const [tasks, setTasks] = useState<{ id: string; status: string }[]>([]);
  const [meetings, setMeetings] = useState<{ id: string; meeting_date: string; meeting_number?: number; status: string }[]>([]);
  const [projectEmails, setProjectEmails] = useState<{ classification?: string }[]>([]);
  const [reception, setReception] = useState<{ id: string; pv_document_url?: string | null; pv_signed_url?: string | null } | null>(null);
  const [closureDocs, setClosureDocs] = useState<{ id: string }[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchClosureData = useCallback(async () => {
    if (!projectId) return;
    setDataLoading(true);
    setFetchError(null);
    try {
      // Use server-side API route (admin client, bypasses RLS, handles missing tables)
      // Add cache-busting to prevent stale responses
      const cacheBust = refreshTrigger || Date.now();
      const res = await fetch(`/api/projects/${projectId}/closure/data?_=${cacheBust}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        if (res.status === 401) {
          console.warn("[Closure] Unauthorized — redirecting to login");
          return;
        }
        throw new Error(`API returned ${res.status}`);
      }
      const data = await res.json();

      console.log("[Closure] Fetched data:", {
        reception: data.reception ? { id: data.reception.id, pv_document_url: data.reception.pv_document_url } : null,
        _meta: data._meta,
      });

      setTasks(data.tasks || []);
      setMeetings(data.meetings || []);
      setProjectEmails(data.emails || []);
      setReception(data.reception || null);
      setClosureDocs(data.closureDocs || []);
    } catch (err) {
      console.warn("[Closure] Failed to fetch closure data:", err);
      setFetchError("Erreur lors du chargement des données de clôture");
    } finally {
      setDataLoading(false);
    }
  }, [projectId, refreshTrigger]);

  useEffect(() => {
    fetchClosureData();
  }, [fetchClosureData]);

  if (projectLoading || dataLoading) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-96 items-center justify-center p-6">
        <p className="text-[#71717A]">{t("projectNotFound")}</p>
      </div>
    );
  }

  // Step 1: All tasks closed or cancelled
  const openTasks = tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );
  const step1Complete = openTasks.length === 0;

  // Step 2: No urgent/pending emails
  const pendingEmails = projectEmails.filter(
    (e) =>
      e.classification === "urgent" ||
      e.classification === "action_required"
  );
  const step2Complete = pendingEmails.length === 0;

  // Step 3: Last meeting PV finalized
  const sortedMeetings = [...meetings].sort(
    (a, b) => new Date(b.meeting_date).getTime() - new Date(a.meeting_date).getTime()
  );
  const lastMeeting = sortedMeetings[0];
  const step3Complete = !lastMeeting || lastMeeting.status === "finalized" || lastMeeting.status === "sent";

  // Step 4: PV de réception generated
  const step4Complete = !!reception && reception.pv_document_url !== null;

  // Step 5: Signed PV uploaded (BLOCKING)
  const step5Complete = !!reception && reception.pv_signed_url !== null;

  // Step 6: Closure documents (optional)
  const step6Complete = closureDocs.length > 0;

  const steps: ClosureStep[] = [
    {
      key: "tasks",
      icon: ClipboardList,
      status: step1Complete ? "completed" : "active",
      count: `${tasks.filter((t) => t.status === "done" || t.status === "cancelled").length}/${tasks.length}`,
      detail: step1Complete
        ? t("step1Complete")
        : t("step1Pending", { count: openTasks.length }),
    },
    {
      key: "emails",
      icon: Mail,
      status: step2Complete
        ? "completed"
        : step1Complete
        ? "active"
        : "locked",
      count: `${pendingEmails.length}`,
      detail: step2Complete
        ? t("step2Complete")
        : t("step2Pending", { count: pendingEmails.length }),
    },
    {
      key: "lastPV",
      icon: FileText,
      status: step3Complete
        ? "completed"
        : step1Complete && step2Complete
        ? "active"
        : "locked",
      detail: step3Complete
        ? lastMeeting
          ? t("step3Complete", { number: lastMeeting.meeting_number || 0 })
          : t("step3NoMeeting")
        : t("step3Pending"),
    },
    {
      key: "receptionPV",
      icon: ShieldCheck,
      status: step4Complete
        ? "completed"
        : step1Complete && step2Complete && step3Complete
        ? "active"
        : "locked",
      detail: step4Complete
        ? t("step4Complete")
        : t("step4Pending"),
    },
    {
      key: "signedPV",
      icon: Upload,
      status: step5Complete
        ? "completed"
        : step4Complete
        ? "active"
        : "locked",
      detail: step5Complete
        ? t("step5Complete")
        : t("step5Pending"),
    },
    {
      key: "documents",
      icon: FolderCheck,
      status: step6Complete
        ? "completed"
        : step5Complete
        ? "active"
        : "locked",
      count: `${closureDocs.length}`,
      detail: step6Complete
        ? t("step6Complete", { count: closureDocs.length })
        : t("step6Pending"),
    },
  ];

  const completedSteps = steps.filter((s) => s.status === "completed").length;
  const canComplete = step1Complete && step2Complete && step3Complete && step4Complete && step5Complete;

  const handleDownloadArchive = async () => {
    setArchiving(true);
    setArchiveError(null);
    try {
      const { exportFile } = await import("@/lib/tauri");
      await exportFile(`/api/projects/${projectId}/closure/archive`, {
        method: "POST",
        fallbackFilename: `Archive_${project.name}_${new Date().toISOString().split("T")[0]}.zip`,
      });
      setArchiveReady(true);
    } catch (err) {
      console.error("[Closure] Archive failed:", err);
      setArchiveError(err instanceof Error ? err.message : "Erreur lors de la génération de l'archive");
    } finally {
      setArchiving(false);
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/closure/data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
      if (!res.ok) {
        throw new Error(`Failed to complete project: ${res.status}`);
      }
      router.push(`/projects/${project.id}`);
    } catch (err) {
      console.error("[Closure] Failed to complete project:", err);
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href={`/projects/${project.id}`}
          className="mt-1 rounded-md p-2 text-[#71717A] hover:bg-[#27272A] hover:text-[#71717A]"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-[#FAFAFA]">
            {t("title")} — {project.name}
          </h1>
          <p className="mt-1 text-sm text-[#71717A]">{t("subtitle")}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-[#FAFAFA]">
            {t("progression")}
          </span>
          <span className="text-[#71717A]">
            {completedSteps}/{steps.length} {t("steps")}
          </span>
        </div>
        <div className="mt-2 h-2.5 w-full rounded-full bg-[#27272A]">
          <div
            className="h-2.5 rounded-full bg-brand transition-all duration-500"
            style={{ width: `${(completedSteps / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-400">{fetchError}</p>
        </div>
      )}

      {/* Steps */}
      <div className="mt-8 space-y-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = step.status === "completed";
          const isActive = step.status === "active";
          const isLocked = step.status === "locked";

          return (
            <div
              key={step.key}
              className={`rounded-md border p-5 transition-colors ${
                isCompleted
                  ? "border-green-200 bg-green-500/10"
                  : isActive
                  ? "border-brand/30 bg-[#F97316]/10"
                  : "border-[#27272A] bg-[#27272A]/50 opacity-60"
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Status icon */}
                <div className="flex-shrink-0 pt-0.5">
                  {isCompleted ? (
                    <CheckCircle className="h-6 w-6 text-green-500" />
                  ) : isActive ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white text-xs font-bold">
                      {index + 1}
                    </div>
                  ) : (
                    <Circle className="h-6 w-6 text-[#71717A]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${isCompleted ? "text-green-600 dark:text-green-400" : isActive ? "text-brand" : "text-[#71717A]"}`} />
                    <h3 className={`text-sm font-semibold ${isCompleted ? "text-green-800 dark:text-green-400" : isActive ? "text-[#FAFAFA]" : "text-[#71717A]"}`}>
                      {t(`step${index + 1}Title`)}
                    </h3>
                    {isActive && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
                        {t("activeStep")}
                      </span>
                    )}
                    {isLocked && (
                      <span className="rounded-full bg-[#27272A] px-2 py-0.5 text-[10px] font-medium text-[#71717A]">
                        {t("lockedStep")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[#71717A]">
                    {t(`step${index + 1}Description`)}
                  </p>
                  <p className={`mt-2 text-xs font-medium ${isCompleted ? "text-green-600 dark:text-green-400" : isActive ? "text-[#FAFAFA]" : "text-[#71717A]"}`}>
                    {step.detail}
                  </p>

                  {/* Action buttons for active steps */}
                  {isActive && step.key === "receptionPV" && (
                    <Link
                      href={`/projects/${project.id}/closure/reception`}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {t("generateReceptionPV")}
                    </Link>
                  )}
                  {isActive && step.key === "signedPV" && (
                    <Link
                      href={`/projects/${project.id}/closure/upload-signed`}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {t("uploadSignedPV")}
                    </Link>
                  )}
                  {isActive && step.key === "documents" && (
                    <Link
                      href={`/projects/${project.id}/closure/documents`}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium text-[#71717A] hover:bg-[#27272A]"
                    >
                      <FolderCheck className="h-3.5 w-3.5" />
                      {t("addDocuments")}
                    </Link>
                  )}
                  {isActive && step.key === "tasks" && openTasks.length > 0 && (
                    <Link
                      href="/tasks"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-[#27272A] px-3 py-1.5 text-xs font-medium text-[#71717A] hover:bg-[#27272A]"
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      {t("viewOpenTasks")}
                    </Link>
                  )}

                  {/* Step 5: blocking warning */}
                  {step.key === "signedPV" && !isCompleted && (
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      {t("step5Blocking")}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reserves banner */}
      {reception && (() => {
        const openRes = 0;
        if (openRes === 0) return null;
        return (
          <div className="mt-6 rounded-md border border-amber-200 bg-amber-500/10 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                  {t("reservesBanner", { count: openRes })}
                </p>
              </div>
              <Link
                href={`/projects/${project.id}/reserves`}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-[#0F0F11] px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                {t("viewReserves")}
              </Link>
            </div>
          </div>
        );
      })()}

      {/* Archive section */}
      {canComplete && (
        <div className="mt-8 rounded-md border border-[#27272A] bg-[#18181B] p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#F97316]/10">
              <Archive className="h-5 w-5 text-[#F97316]" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-[#FAFAFA]">
                {t("archiveTitle")}
              </h3>
              <p className="mt-1 text-xs text-[#71717A]">
                {t("archiveDescription")}
              </p>
              {archiveError && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-400">{archiveError}</p>
                </div>
              )}
              {archiveReady && (
                <div className="mt-3 flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-2">
                  <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <p className="text-xs text-green-400">{t("archiveDownloaded")}</p>
                </div>
              )}
              <button
                type="button"
                onClick={handleDownloadArchive}
                disabled={archiving}
                className="mt-3 inline-flex items-center gap-2 rounded-md bg-[#F97316] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#EA580C] disabled:opacity-50"
              >
                {archiving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t("archiveGenerating")}
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" />
                    {t("archiveDownload")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete button */}
      <div className="mt-6 border-t border-[#27272A] pt-6">
        <button
          type="button"
          onClick={handleComplete}
          disabled={!canComplete || completing}
          className={`inline-flex items-center gap-2 rounded-md px-6 py-3 text-sm font-semibold transition-colors ${
            canComplete && !completing
              ? "bg-green-600 text-white hover:bg-green-700"
              : "cursor-not-allowed bg-[#27272A] text-[#71717A]"
          }`}
        >
          {completing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          {t("completeProject")}
        </button>
        {!canComplete && (
          <p className="mt-2 text-xs text-[#71717A]">{t("completeProjectHint")}</p>
        )}
      </div>
    </div>
  );
}
