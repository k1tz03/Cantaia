"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  CalendarRange,
  Loader2,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import GanttConfigModal from "@/components/planning/GanttConfigModal";
import { handleInsufficientCredits } from "@/components/credits/PaywallDialog";
import { notifyCreditsChanged } from "@/lib/hooks/use-credits";

interface ProjectPlanningTabProps {
  projectId: string;
}

export function ProjectPlanningTab({ projectId }: ProjectPlanningTabProps) {
  const t = useTranslations("planning");
  const [loading, setLoading] = useState(true);
  const [hasPlanning, setHasPlanning] = useState(false);
  const [planningTitle, setPlanningTitle] = useState("");
  const [endDate, setEndDate] = useState("");
  const [phasesCount, setPhasesCount] = useState(0);
  const [showConfig, setShowConfig] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchPlanningStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/planning/by-project?project_id=${projectId}`);
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        // Silently pretending "no planning" hid real 403/500 responses.
        setHasPlanning(false);
        setLoadError(json?.error || t("errors.loadFailed"));
        return;
      }

      setLoadError(null);
      if (json?.planning) {
        setHasPlanning(true);
        setPlanningTitle(json.planning.title || "");
        setEndDate(json.planning.calculated_end_date || "");
        setPhasesCount((json.phases || []).length);
      } else {
        setHasPlanning(false);
      }
    } catch (err: any) {
      setHasPlanning(false);
      setLoadError(err?.message || t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await fetch(`/api/submissions?project_id=${projectId}`);
      const json = await res.json();
      if (json.success && json.submissions) {
        const analyzed = json.submissions.filter(
          (s: any) => s.analysis_status === "done" || s.analysis_status === "completed" || s.items_count > 0,
        );
        setSubmissions(analyzed);
        if (analyzed.length > 0 && !selectedSubmissionId) {
          setSelectedSubmissionId(analyzed[0].id);
        }
      }
    } catch { /* ignore */ }
  }, [projectId, selectedSubmissionId]);

  useEffect(() => {
    fetchPlanningStatus();
    fetchSubmissions();
  }, [fetchPlanningStatus, fetchSubmissions]);

  const handleGenerate = async (config: any) => {
    if (!selectedSubmissionId) {
      setGenerateError(t("errors.noAnalyzedSubmission"));
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/planning/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: selectedSubmissionId,
          project_id: projectId,
          config: {
            start_date: config.startDate || config.start_date,
            target_end_date: config.endDate || config.target_end_date,
            project_type: config.projectType || config.project_type || "new",
            canton: config.canton,
            constraints: config.constraints,
          },
        }),
      });

      // 402 = out of credits: the paywall modal replaces the error banner.
      if (await handleInsufficientCredits(res)) {
        setGenerateError(null);
        return;
      }

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setGenerateError(json?.error || t("errors.generateFailed"));
        return;
      }

      setShowConfig(false);
      setGenerateError(null);
      notifyCreditsChanged();
      await fetchPlanningStatus();
    } catch (err: any) {
      console.error("[planning] Generate error:", err);
      setGenerateError(err.message || t("errors.generateUnexpected"));
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-brand" />
      </div>
    );
  }

  if (hasPlanning) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-medium text-[#FAFAFA]">{planningTitle}</h3>
            <p className="text-sm text-[#A1A1AA]">
              {t("tab.phaseCount", { count: phasesCount })}
              {endDate && (
                <>
                  {" — "}
                  {t("header.end")}: {new Date(endDate).toLocaleDateString("fr-CH")}
                </>
              )}
            </p>
          </div>
          <Link
            href={`/projects/${projectId}/planning`}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-brand border border-brand/20 rounded-lg hover:bg-brand/5"
          >
            <CalendarRange className="h-4 w-4" />
            {t("tab.open")}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // No planning — show empty state
  return (
    <div className="text-center py-16">
      {loadError && (
        <div className="mx-auto mb-6 max-w-md flex items-start gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/10 text-left text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{loadError}</span>
        </div>
      )}

      <CalendarRange className="h-12 w-12 text-[#A1A1AA] mx-auto mb-3" />
      <h3 className="text-base font-medium text-[#FAFAFA] mb-1">{t("noPlanning")}</h3>
      <p className="text-sm text-[#A1A1AA] mb-6">{t("noPlanningDesc")}</p>

      {submissions.length > 0 ? (
        <div className="space-y-3 max-w-xs mx-auto">
          {submissions.length > 1 && (
            <select
              value={selectedSubmissionId || ""}
              onChange={(e) => setSelectedSubmissionId(e.target.value)}
              className="w-full rounded-lg border border-[#27272A] px-3 py-2 text-sm"
            >
              {submissions.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.file_name || s.title || s.id}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setShowConfig(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand/90"
          >
            <CalendarRange className="h-4 w-4" />
            {t("generate")}
          </button>
        </div>
      ) : (
        <p className="text-sm text-[#A1A1AA]">
          {t("errors.noAnalyzedSubmission")}
        </p>
      )}

      {showConfig && (
        <>
          <GanttConfigModal
            onGenerate={handleGenerate}
            onCancel={() => { setShowConfig(false); setGenerateError(null); }}
            isGenerating={generating}
          />
          {generateError && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg shadow-lg max-w-md text-sm">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <p>{generateError}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
