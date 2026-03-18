"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  CalendarRange,
  Share2,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  LinkIcon,
  FileText,
} from "lucide-react";
import GanttChart from "@/components/planning/GanttChart";
import GanttConfigModal from "@/components/planning/GanttConfigModal";
import type {
  Planning,
  PlanningPhase,
  PlanningTask,
  PlanningDependency,
  ZoomLevel,
} from "@/components/planning/planning-types";

export default function ProjectPlanningPage() {
  const params = useParams();
  const projectId = params.id as string;
  const t = useTranslations("planning");

  const [loading, setLoading] = useState(true);
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [_phases, setPhases] = useState<PlanningPhase[]>([]);
  const [_tasks, setTasks] = useState<PlanningTask[]>([]);
  const [_dependencies, setDependencies] = useState<PlanningDependency[]>([]);
  const [planningId, setPlanningId] = useState<string | null>(null);

  const [showConfig, setShowConfig] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [zoom] = useState<ZoomLevel>("week");

  // Share state
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);

  // Submissions for the config modal
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);

  // Fetch planning by project
  const fetchPlanning = useCallback(async () => {
    try {
      const res = await fetch(`/api/planning/by-project?project_id=${projectId}`);
      if (res.status === 401) return;
      const json = await res.json();

      if (json.planning) {
        const p = json.planning;
        const planningData: Planning = {
          id: p.id,
          title: p.title,
          start_date: p.start_date,
          calculated_end_date: p.calculated_end_date || p.start_date,
          phases: (json.phases || []).map((ph: any) => ({
            ...ph,
            tasks: (json.tasks || []).filter((tk: any) => tk.phase_id === ph.id),
            isExpanded: true,
          })),
          tasks: json.tasks || [],
          dependencies: json.dependencies || [],
          milestones: (json.tasks || []).filter((tk: any) => tk.is_milestone),
        };
        setPlanning(planningData);
        setPhases(json.phases || []);
        setTasks(json.tasks || []);
        setDependencies(json.dependencies || []);
        setPlanningId(p.id);
      } else {
        setPlanning(null);
      }
    } catch (err) {
      console.error("[planning] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Fetch submissions for the project
  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await fetch(`/api/submissions?project_id=${projectId}`);
      const json = await res.json();
      if (json.success && json.submissions) {
        const analyzed = json.submissions.filter(
          (s: any) => s.analysis_status === "done",
        );
        setSubmissions(analyzed);
        if (analyzed.length > 0 && !selectedSubmissionId) {
          setSelectedSubmissionId(analyzed[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, [projectId, selectedSubmissionId]);

  useEffect(() => {
    fetchPlanning();
    fetchSubmissions();
  }, [fetchPlanning, fetchSubmissions]);

  // Generate planning
  const handleGenerate = async (config: any) => {
    if (!selectedSubmissionId) return;
    setGenerating(true);
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
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Generation failed");

      setShowConfig(false);
      await fetchPlanning();
    } catch (err: any) {
      throw err; // Let the modal handle the error
    } finally {
      setGenerating(false);
    }
  };

  // Update task (drag/resize)
  const handleTaskUpdate = async (
    taskId: string,
    updates: Partial<PlanningTask>,
  ) => {
    if (!planningId) return;

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
    );

    try {
      await fetch(`/api/planning/${planningId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, ...updates }),
      });
    } catch (err) {
      console.error("[planning] update error:", err);
      fetchPlanning(); // revert on error
    }
  };

  // Export PDF
  const handleExportPdf = async () => {
    if (!planningId) return;
    window.open(`/api/planning/${planningId}/export-pdf`, "_blank");
  };

  // Share link
  const handleShare = async () => {
    if (!planningId) return;
    try {
      const res = await fetch(`/api/planning/${planningId}/share`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.success) {
        setShareUrl(json.url);
        setShowSharePanel(true);
      }
    } catch (err) {
      console.error("[planning] share error:", err);
    }
  };

  const handleCopyLink = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRevokeShare = async () => {
    if (!planningId) return;
    try {
      await fetch(`/api/planning/${planningId}/share`, { method: "DELETE" });
      setShareUrl(null);
      setShowSharePanel(false);
    } catch (err) {
      console.error("[planning] revoke error:", err);
    }
  };

  // Regenerate
  const handleRegenerate = () => {
    setShowConfig(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  // Compute critical path for the chart
  const criticalPath: string[] = []; // Will be populated from ai_generation_log if available

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href={`/projects/${projectId}?tab=overview`}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <ArrowLeft className="h-4 w-4 text-gray-500" />
          </Link>
          <CalendarRange className="h-5 w-5 text-brand" />
          <h1 className="text-lg font-semibold text-gray-900">
            {t("title")}
          </h1>
        </div>
      </div>

      {!planning ? (
        // Empty state
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <CalendarRange className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              {t("noPlanning")}
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              {t("noPlanningDesc")}
            </p>

            {submissions.length > 0 ? (
              <div className="space-y-3">
                {submissions.length > 1 && (
                  <select
                    value={selectedSubmissionId || ""}
                    onChange={(e) => setSelectedSubmissionId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
              <p className="text-sm text-gray-400">
                Aucune soumission analysee pour ce projet.
              </p>
            )}
          </div>
        </div>
      ) : (
        // Gantt chart
        <div className="flex-1 min-h-0">
          <GanttChart
            planning={planning}
            criticalPath={criticalPath}
            zoom={zoom}
            onTaskUpdate={handleTaskUpdate}
            projectName={planning.title}
          >
            {/* Action buttons in the Gantt header */}
            <button
              onClick={handleRegenerate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("regenerate")}
            </button>
            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <FileText className="h-3.5 w-3.5" />
              {t("export.pdf")}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <Share2 className="h-3.5 w-3.5" />
              {t("export.share")}
            </button>
          </GanttChart>
        </div>
      )}

      {/* Config modal */}
      {showConfig && (
        <GanttConfigModal
          onGenerate={handleGenerate}
          onCancel={() => setShowConfig(false)}
          isGenerating={generating}
        />
      )}

      {/* Share panel */}
      {showSharePanel && shareUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-2 mb-4">
              <LinkIcon className="h-5 w-5 text-brand" />
              <h3 className="text-lg font-semibold">{t("share.title")}</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {t("share.description")}
            </p>
            <div className="flex items-center gap-2 mb-4">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-gray-50"
              />
              <button
                onClick={handleCopyLink}
                className="px-3 py-2 text-sm bg-brand text-white rounded-lg hover:bg-brand/90 flex items-center gap-1"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                {copied ? t("share.copied") : t("share.copy")}
              </button>
            </div>
            <div className="flex justify-between">
              <button
                onClick={handleRevokeShare}
                className="text-sm text-red-600 hover:text-red-800"
              >
                {t("share.revoke")}
              </button>
              <button
                onClick={() => setShowSharePanel(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
