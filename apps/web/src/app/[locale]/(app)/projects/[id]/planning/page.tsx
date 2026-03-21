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
  FilePlus,
  Calendar,
  X,
  AlertCircle,
} from "lucide-react";
import GanttChart from "@/components/planning/GanttChart";
import GanttConfigModal from "@/components/planning/GanttConfigModal";
import type {
  Planning,
  PlanningPhase,
  PlanningTask,
  PlanningDependency,
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

  // Share state
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSharePanel, setShowSharePanel] = useState(false);

  // Empty planning modal state
  const [showEmptyModal, setShowEmptyModal] = useState(false);
  const [emptyTitle, setEmptyTitle] = useState("");
  const [emptyStartDate, setEmptyStartDate] = useState("");
  const [emptyEndDate, setEmptyEndDate] = useState("");
  const [creatingEmpty, setCreatingEmpty] = useState(false);
  const [emptyError, setEmptyError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");

  // Submissions for the config modal
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

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
          (s: any) => s.analysis_status === "done" || s.analysis_status === "completed" || s.items_count > 0,
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

  // Fetch project name for the empty planning title
  const fetchProjectName = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const json = await res.json();
        const name = json.project?.name || json.name || "";
        setProjectName(name);
        setEmptyTitle(`Planning — ${name}`);
      }
    } catch {
      // ignore
    }
  }, [projectId]);

  useEffect(() => {
    fetchPlanning();
    fetchSubmissions();
    fetchProjectName();
  }, [fetchPlanning, fetchSubmissions, fetchProjectName]);

  // Create empty planning
  const handleCreateEmpty = async () => {
    if (!emptyStartDate) {
      setEmptyError(t("config.errorStartDate"));
      return;
    }
    setCreatingEmpty(true);
    setEmptyError(null);
    try {
      const res = await fetch("/api/planning/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          source: "manual",
          config: {
            title: emptyTitle || `Planning — ${projectName}`,
            start_date: emptyStartDate,
            target_end_date: emptyEndDate || undefined,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setEmptyError(json.error || "Erreur lors de la creation");
        return;
      }
      setShowEmptyModal(false);
      setEmptyError(null);
      await fetchPlanning();
    } catch (err: any) {
      setEmptyError(err.message || "Erreur inattendue");
    } finally {
      setCreatingEmpty(false);
    }
  };

  // Generate planning
  const handleGenerate = async (config: any) => {
    if (!selectedSubmissionId) {
      setGenerateError("Aucune soumission analysée trouvée. Analysez d'abord une soumission.");
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
      const json = await res.json();
      if (!res.ok) {
        setGenerateError(json.error || "Échec de la génération du planning");
        return;
      }

      setShowConfig(false);
      setGenerateError(null);
      await fetchPlanning();
    } catch (err: any) {
      console.error("[planning] Generate error:", err);
      setGenerateError(err.message || "Erreur inattendue lors de la génération");
    } finally {
      setGenerating(false);
    }
  };

  // Suppliers (for the side panel dropdown)
  const [suppliers, setSuppliers] = useState<Array<{ id: string; company_name: string }>>([]);
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/suppliers");
        if (res.ok) {
          const json = await res.json();
          setSuppliers(
            (json.suppliers || json.data || []).map((s: any) => ({
              id: s.id,
              company_name: s.company_name,
            })),
          );
        }
      } catch {
        // non-fatal
      }
    })();
  }, []);

  // ── Optimistic update helper ─────────────────────────────────────────

  const refreshPlanningOptimistic = useCallback(
    (
      taskId: string,
      updates: Partial<PlanningTask>,
    ) => {
      setPlanning((prev) => {
        if (!prev) return prev;
        const updatedTasks = prev.tasks.map((t) =>
          t.id === taskId ? { ...t, ...updates } : t,
        );
        return {
          ...prev,
          tasks: updatedTasks,
          milestones: updatedTasks.filter((t) => t.is_milestone),
          phases: prev.phases.map((ph) => ({
            ...ph,
            tasks: updatedTasks.filter((t) => t.phase_id === ph.id),
          })),
        };
      });
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
      );
    },
    [],
  );

  // Update task (drag/resize/inline edit/side panel)
  const handleTaskUpdate = useCallback(
    async (taskId: string, updates: Partial<PlanningTask>) => {
      if (!planningId) return;

      // Optimistic update
      refreshPlanningOptimistic(taskId, updates);

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
    },
    [planningId, refreshPlanningOptimistic, fetchPlanning],
  );

  // Update phase name
  const handlePhaseUpdate = useCallback(
    async (phaseId: string, updates: { name?: string }) => {
      if (!planningId) return;

      // Optimistic update
      setPlanning((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phases: prev.phases.map((ph) =>
            ph.id === phaseId ? { ...ph, ...updates } : ph,
          ),
        };
      });

      try {
        await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase_id: phaseId, ...updates }),
        });
      } catch (err) {
        console.error("[planning] phase update error:", err);
        fetchPlanning();
      }
    },
    [planningId, fetchPlanning],
  );

  // Delete task
  const handleTaskDelete = useCallback(
    async (taskId: string) => {
      if (!planningId) return;

      // Optimistic update
      setPlanning((prev) => {
        if (!prev) return prev;
        const updatedTasks = prev.tasks.filter((t) => t.id !== taskId);
        return {
          ...prev,
          tasks: updatedTasks,
          milestones: updatedTasks.filter((t) => t.is_milestone),
          phases: prev.phases.map((ph) => ({
            ...ph,
            tasks: updatedTasks.filter((t) => t.phase_id === ph.id),
          })),
        };
      });

      try {
        await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete_task_id: taskId }),
        });
      } catch (err) {
        console.error("[planning] delete task error:", err);
        fetchPlanning();
      }
    },
    [planningId, fetchPlanning],
  );

  // Create dependency
  const handleDependencyCreate = useCallback(
    async (predecessorId: string, successorId: string, type: string, lag: number) => {
      if (!planningId) return;
      try {
        const res = await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            add_dependency: {
              predecessor_id: predecessorId,
              successor_id: successorId,
              dependency_type: type,
              lag_days: lag,
            },
          }),
        });
        if (res.ok) {
          await fetchPlanning();
        }
      } catch (err) {
        console.error("[planning] add dependency error:", err);
      }
    },
    [planningId, fetchPlanning],
  );

  // Delete dependency
  const handleDependencyDelete = useCallback(
    async (depId: string) => {
      if (!planningId) return;

      // Optimistic
      setPlanning((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          dependencies: prev.dependencies.filter((d) => d.id !== depId),
        };
      });

      try {
        await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete_dependency_id: depId }),
        });
      } catch (err) {
        console.error("[planning] delete dependency error:", err);
        fetchPlanning();
      }
    },
    [planningId, fetchPlanning],
  );

  // Bulk move tasks
  const handleBulkMove = useCallback(
    async (taskIds: string[], daysDelta: number) => {
      if (!planningId || daysDelta === 0) return;

      // Optimistic
      setPlanning((prev) => {
        if (!prev) return prev;
        const idSet = new Set(taskIds);
        const updatedTasks = prev.tasks.map((t) => {
          if (!idSet.has(t.id)) return t;
          const newStart = new Date(t.start_date);
          newStart.setDate(newStart.getDate() + daysDelta);
          const newEnd = new Date(t.end_date);
          newEnd.setDate(newEnd.getDate() + daysDelta);
          return {
            ...t,
            start_date: newStart.toISOString().split("T")[0],
            end_date: newEnd.toISOString().split("T")[0],
          };
        });
        return {
          ...prev,
          tasks: updatedTasks,
          milestones: updatedTasks.filter((tk) => tk.is_milestone),
          phases: prev.phases.map((ph) => ({
            ...ph,
            tasks: updatedTasks.filter((tk) => tk.phase_id === ph.id),
          })),
        };
      });

      // Persist each task
      try {
        await Promise.all(
          taskIds.map((tid) => {
            const task = planning?.tasks.find((t) => t.id === tid);
            if (!task) return Promise.resolve();
            const newStart = new Date(task.start_date);
            newStart.setDate(newStart.getDate() + daysDelta);
            const newEnd = new Date(task.end_date);
            newEnd.setDate(newEnd.getDate() + daysDelta);
            return fetch(`/api/planning/${planningId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                task_id: tid,
                start_date: newStart.toISOString().split("T")[0],
                end_date: newEnd.toISOString().split("T")[0],
              }),
            });
          }),
        );
      } catch (err) {
        console.error("[planning] bulk move error:", err);
        fetchPlanning();
      }
    },
    [planningId, planning, fetchPlanning],
  );

  // Bulk delete tasks
  const handleBulkDelete = useCallback(
    async (taskIds: string[]) => {
      if (!planningId) return;

      // Optimistic
      const idSet = new Set(taskIds);
      setPlanning((prev) => {
        if (!prev) return prev;
        const updatedTasks = prev.tasks.filter((t) => !idSet.has(t.id));
        return {
          ...prev,
          tasks: updatedTasks,
          milestones: updatedTasks.filter((t) => t.is_milestone),
          phases: prev.phases.map((ph) => ({
            ...ph,
            tasks: updatedTasks.filter((t) => t.phase_id === ph.id),
          })),
        };
      });

      try {
        await Promise.all(
          taskIds.map((tid) =>
            fetch(`/api/planning/${planningId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ delete_task_id: tid }),
            }),
          ),
        );
      } catch (err) {
        console.error("[planning] bulk delete error:", err);
        fetchPlanning();
      }
    },
    [planningId, fetchPlanning],
  );

  // Add phase
  const handleAddPhase = useCallback(
    async (phase?: any) => {
      if (!planningId) return;
      try {
        const res = await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add_phase", phase }),
        });
        if (res.ok) await fetchPlanning();
      } catch (err) {
        console.error("[planning] add phase error:", err);
      }
    },
    [planningId, fetchPlanning],
  );

  // Add task (or milestone)
  const handleAddTaskCrud = useCallback(
    async (task?: any) => {
      if (!planningId) return;
      try {
        const res = await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add_task", task }),
        });
        if (res.ok) await fetchPlanning();
      } catch (err) {
        console.error("[planning] add task error:", err);
      }
    },
    [planningId, fetchPlanning],
  );

  // Delete phase
  const handleDeletePhase = useCallback(
    async (phaseId: string) => {
      if (!planningId) return;
      try {
        const res = await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete_phase", phase_id: phaseId }),
        });
        if (res.ok) await fetchPlanning();
      } catch (err) {
        console.error("[planning] delete phase error:", err);
      }
    },
    [planningId, fetchPlanning],
  );

  // Duplicate phase
  const handleDuplicatePhase = useCallback(
    async (phaseId: string) => {
      if (!planningId) return;
      try {
        const res = await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "duplicate_phase", phase_id: phaseId }),
        });
        if (res.ok) await fetchPlanning();
      } catch (err) {
        console.error("[planning] duplicate phase error:", err);
      }
    },
    [planningId, fetchPlanning],
  );

  // Duplicate task
  const handleDuplicateTask = useCallback(
    async (taskId: string) => {
      if (!planningId) return;
      try {
        const res = await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "duplicate_task", task_id: taskId }),
        });
        if (res.ok) await fetchPlanning();
      } catch (err) {
        console.error("[planning] duplicate task error:", err);
      }
    },
    [planningId, fetchPlanning],
  );

  // Update phase color
  const handleUpdatePhaseColor = useCallback(
    async (phaseId: string, color: string) => {
      if (!planningId) return;
      // Optimistic
      setPlanning((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          phases: prev.phases.map((ph) =>
            ph.id === phaseId ? { ...ph, color } : ph,
          ),
        };
      });
      try {
        await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_phase", phase_id: phaseId, updates: { color } }),
        });
      } catch (err) {
        console.error("[planning] update phase color error:", err);
        fetchPlanning();
      }
    },
    [planningId, fetchPlanning],
  );

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
      <div className="px-6 py-4 border-b border-border bg-background">
        <div className="flex items-center gap-3 mb-2">
          <Link
            href={`/projects/${projectId}?tab=overview`}
            className="p-1 hover:bg-muted rounded"
          >
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          </Link>
          <CalendarRange className="h-5 w-5 text-brand" />
          <h1 className="text-lg font-semibold text-foreground">
            {t("title")}
          </h1>
        </div>
      </div>

      {!planning ? (
        // Empty state
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <CalendarRange className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-medium text-foreground mb-2">
              {t("noPlanning")}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t("noPlanningDesc")}
            </p>

            <div className="space-y-3">
              {submissions.length > 0 && (
                <>
                  {submissions.length > 1 && (
                    <select
                      value={selectedSubmissionId || ""}
                      onChange={(e) => setSelectedSubmissionId(e.target.value)}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm"
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
                  <p className="text-xs text-muted-foreground">{t("emptyPlanning.or")}</p>
                </>
              )}
              <button
                onClick={() => setShowEmptyModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-border text-foreground text-sm font-medium rounded-lg hover:bg-muted"
              >
                <FilePlus className="h-4 w-4" />
                {t("emptyPlanning.createEmpty")}
              </button>
            </div>
          </div>
        </div>
      ) : (
        // Gantt chart
        <div className="flex-1 min-h-0">
          <GanttChart
            planning={planning}
            criticalPath={criticalPath}
            onTaskUpdate={handleTaskUpdate}
            onPhaseUpdate={handlePhaseUpdate}
            onTaskDelete={handleTaskDelete}
            onDependencyCreate={handleDependencyCreate}
            onDependencyDelete={handleDependencyDelete}
            onBulkMove={handleBulkMove}
            onBulkDelete={handleBulkDelete}
            onAddPhase={handleAddPhase}
            onAddTask={handleAddTaskCrud}
            onDeletePhase={handleDeletePhase}
            onDuplicatePhase={handleDuplicatePhase}
            onDuplicateTask={handleDuplicateTask}
            onUpdatePhaseColor={handleUpdatePhaseColor}
            planningId={planningId ?? undefined}
            suppliers={suppliers}
            projectName={planning.title}
          >
            {/* Action buttons in the Gantt header */}
            <button
              onClick={handleRegenerate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("regenerate")}
            </button>
            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted"
            >
              <FileText className="h-3.5 w-3.5" />
              {t("export.pdf")}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted"
            >
              <Share2 className="h-3.5 w-3.5" />
              {t("export.share")}
            </button>
          </GanttChart>
        </div>
      )}

      {/* Empty planning modal */}
      {showEmptyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <FilePlus className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  {t("emptyPlanning.createEmpty")}
                </h2>
              </div>
              <button
                onClick={() => { setShowEmptyModal(false); setEmptyError(null); }}
                className="p-1 text-muted-foreground hover:text-muted-foreground transition-colors rounded-md hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {t("emptyPlanning.title")}
                </label>
                <input
                  type="text"
                  value={emptyTitle}
                  onChange={(e) => setEmptyTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {/* Start date */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {t("emptyPlanning.startDate")} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="date"
                    value={emptyStartDate}
                    onChange={(e) => setEmptyStartDate(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>
              {/* End date (optional) */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  {t("emptyPlanning.endDate")}
                  <span className="ml-1 text-xs text-muted-foreground font-normal">
                    ({t("config.optional")})
                  </span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="date"
                    value={emptyEndDate}
                    onChange={(e) => setEmptyEndDate(e.target.value)}
                    min={emptyStartDate || undefined}
                    className="w-full pl-10 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              {/* Error */}
              {emptyError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 rounded-lg text-sm text-red-700 dark:text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {emptyError}
                </div>
              )}
              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowEmptyModal(false); setEmptyError(null); }}
                  className="px-4 py-2 text-sm font-medium text-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  disabled={creatingEmpty}
                >
                  {t("config.cancel")}
                </button>
                <button
                  type="button"
                  onClick={handleCreateEmpty}
                  disabled={creatingEmpty}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {creatingEmpty ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("emptyPlanning.creating")}
                    </>
                  ) : (
                    t("emptyPlanning.create")
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Config modal */}
      {showConfig && (
        <>
          <GanttConfigModal
            onGenerate={handleGenerate}
            onCancel={() => { setShowConfig(false); setGenerateError(null); }}
            isGenerating={generating}
          />
          {generateError && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-red-500/10 border border-red-200 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg shadow-lg max-w-md text-sm">
              <p className="font-medium">Erreur</p>
              <p>{generateError}</p>
            </div>
          )}
        </>
      )}

      {/* Share panel */}
      {showSharePanel && shareUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-2 mb-4">
              <LinkIcon className="h-5 w-5 text-brand" />
              <h3 className="text-lg font-semibold">{t("share.title")}</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              {t("share.description")}
            </p>
            <div className="flex items-center gap-2 mb-4">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 text-sm border border-border rounded-lg bg-muted"
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
                className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:text-red-400"
              >
                {t("share.revoke")}
              </button>
              <button
                onClick={() => setShowSharePanel(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
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
