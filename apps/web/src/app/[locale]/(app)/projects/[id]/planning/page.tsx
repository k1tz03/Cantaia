"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
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
  CalendarDays,
  GanttChartSquare,
  X,
  AlertCircle,
} from "lucide-react";
import GanttChart from "@/components/planning/GanttChart";
import GanttConfigModal from "@/components/planning/GanttConfigModal";
import PlanningAiPanel from "@/components/planning/PlanningAiPanel";
import LookaheadView from "@/components/planning/LookaheadView";
import type {
  Planning,
  PlanningPhase,
  PlanningTask,
  PlanningDependency,
  PlanningAiRisk,
  PlanningAiRecommendation,
  PlanningProcurementItem,
} from "@/components/planning/planning-types";
import { handleInsufficientCredits } from "@/components/credits/PaywallDialog";
import { notifyCreditsChanged } from "@/lib/hooks/use-credits";

type PlanningViewMode = "gantt" | "lookahead";

/**
 * Format a Date as a LOCAL YYYY-MM-DD (Europe/Zurich). `toISOString().split("T")`
 * formats in UTC and can shift the day across the timezone boundary — banned by
 * the repo convention for local dates.
 */
function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function ProjectPlanningPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const t = useTranslations("planning");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [planning, setPlanning] = useState<Planning | null>(null);
  const [, setPhases] = useState<PlanningPhase[]>([]);
  const [, setTasks] = useState<PlanningTask[]>([]);
  const [, setDependencies] = useState<PlanningDependency[]>([]);
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [criticalPath, setCriticalPath] = useState<string[]>([]);

  const [showConfig, setShowConfig] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<PlanningViewMode>("gantt");
  const [rescheduling, setRescheduling] = useState(false);
  const rescheduleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      // A transient 500/403 must NOT masquerade as "no planning": showing the
      // empty state would let the user regenerate over a planning an error is
      // merely hiding. Surface an error state with a retry instead.
      if (!res.ok) {
        setLoadError(t("errors.loadFailed"));
        return;
      }
      setLoadError(null);
      const json = await res.json();

      if (json.planning) {
        const p = json.planning;

        // The AI pass has been persisting risks / recommendations / a
        // procurement plan since migration 057 without any surface showing it.
        const aiValidation = p.ai_generation_log?.ai_validation ?? null;
        const rawRecommendations = p.ai_recommendations;
        const recommendations: PlanningAiRecommendation[] = Array.isArray(
          rawRecommendations,
        )
          ? rawRecommendations
          : Array.isArray(rawRecommendations?.recommendations)
            ? rawRecommendations.recommendations
            : Array.isArray(aiValidation?.recommendations)
              ? aiValidation.recommendations
              : [];
        const procurementPlan: PlanningProcurementItem[] = Array.isArray(
          rawRecommendations?.procurement_plan,
        )
          ? rawRecommendations.procurement_plan
          : Array.isArray(aiValidation?.procurement_plan)
            ? aiValidation.procurement_plan
            : [];
        const risks: PlanningAiRisk[] = Array.isArray(aiValidation?.risks)
          ? aiValidation.risks
          : [];

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
          // Without this the saved baseline was re-read from nowhere and
          // silently vanished on every reload.
          config: p.config && typeof p.config === "object" ? p.config : null,
          ai_summary: p.ai_summary ?? aiValidation?.summary ?? null,
          ai_risks: risks,
          ai_recommendations: recommendations,
          ai_procurement_plan: procurementPlan,
        };
        setPlanning(planningData);
        setPhases(json.phases || []);
        setTasks(json.tasks || []);
        setDependencies(json.dependencies || []);
        setPlanningId(p.id);

        // Critical path: the generator stores CPM results as sort_order strings
        // (ai_generation_log.critical_path_task_ids) because task UUIDs do not
        // exist yet at generation time. Remap them onto the persisted task IDs.
        const rawCriticalIds: unknown = p.ai_generation_log?.critical_path_task_ids;
        if (Array.isArray(rawCriticalIds) && rawCriticalIds.length > 0) {
          const idBySortOrder = new Map<string, string>();
          for (const tk of (json.tasks || [])) {
            if (tk.sort_order !== null && tk.sort_order !== undefined) {
              idBySortOrder.set(String(tk.sort_order), tk.id);
            }
          }
          setCriticalPath(
            rawCriticalIds
              .map((sortOrder) => idBySortOrder.get(String(sortOrder)))
              .filter((taskId): taskId is string => Boolean(taskId)),
          );
        } else {
          setCriticalPath([]);
        }
      } else {
        setPlanning(null);
        setCriticalPath([]);
      }
    } catch (err) {
      console.error("[planning] fetch error:", err);
      setLoadError(t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [projectId, router, t]);

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
      // Crédits insuffisants : la modale paywall remplace le message d'erreur.
      if (await handleInsufficientCredits(res)) {
        setEmptyError(null);
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setEmptyError(json.error || t("errors.createFailed"));
        return;
      }
      setShowEmptyModal(false);
      setEmptyError(null);
      await fetchPlanning();
    } catch (err: any) {
      setEmptyError(err.message || t("errors.unexpected"));
    } finally {
      setCreatingEmpty(false);
    }
  };

  // Generate planning
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
      // Crédits insuffisants : la modale paywall remplace le message d'erreur.
      if (await handleInsufficientCredits(res)) {
        setGenerateError(null);
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        setGenerateError(json.error || t("errors.generateFailed"));
        return;
      }

      setShowConfig(false);
      setGenerateError(null);
      notifyCreditsChanged();
      await fetchPlanning();
    } catch (err: any) {
      console.error("[planning] Generate error:", err);
      setGenerateError(err.message || t("errors.generateUnexpected"));
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

  // ── Reschedule ───────────────────────────────────────────────────────
  // Editing one duration used to move exactly one bar: the successors kept
  // their old dates and the plan quietly stopped being a plan. Every schedule
  // edit now replays the CPM server-side, then pulls the new dates back.

  const runReschedule = useCallback(async () => {
    if (!planningId) return;
    setRescheduling(true);
    try {
      const res = await fetch(`/api/planning/${planningId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reschedule" }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        toast.error(json?.error || t("reschedule.failed"));
        await fetchPlanning();
        return;
      }

      await fetchPlanning();

      if (Array.isArray(json?.critical_task_ids)) {
        setCriticalPath(json.critical_task_ids);
      }
      if (Number(json?.cyclic_task_count) > 0) {
        toast.warning(t("reschedule.cycle", { count: json.cyclic_task_count }));
      }
    } catch (err) {
      console.error("[planning] reschedule error:", err);
      toast.error(t("reschedule.failed"));
      await fetchPlanning();
    } finally {
      setRescheduling(false);
    }
  }, [planningId, fetchPlanning, t]);

  /** Coalesces the bursts a bulk move or a quick drag sequence produces. */
  const scheduleReschedule = useCallback(() => {
    if (rescheduleTimer.current) clearTimeout(rescheduleTimer.current);
    rescheduleTimer.current = setTimeout(() => {
      rescheduleTimer.current = null;
      void runReschedule();
    }, 400);
  }, [runReschedule]);

  useEffect(
    () => () => {
      if (rescheduleTimer.current) clearTimeout(rescheduleTimer.current);
    },
    [],
  );

  // Update task (drag/resize/inline edit/side panel)
  const handleTaskUpdate = useCallback(
    async (taskId: string, updates: Partial<PlanningTask>) => {
      if (!planningId) return;

      // Snapshot the pre-edit task BEFORE the optimistic mutation — needed to
      // tell a genuine duration change from a pure reposition.
      const previous = planning?.tasks.find((tk) => tk.id === taskId);

      // Optimistic update
      refreshPlanningOptimistic(taskId, updates);

      try {
        const res = await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: taskId, ...updates }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          console.error("[planning] update rejected:", res.status);
          toast.error(json?.error || t("update.failed"));
          fetchPlanning(); // revert — the server did not persist the change
          return;
        }

        // Resync to the server-persisted row: end_date is recomputed in WORKING
        // days server-side and would otherwise drift from the calendar-day value
        // the UI guessed locally.
        const json = await res.json().catch(() => null);
        if (json?.task) {
          refreshPlanningOptimistic(taskId, json.task as Partial<PlanningTask>);
        }

        // Reschedule ONLY when the duration genuinely changed. A bar drag or an
        // explicit start-date edit is a MANUAL placement — replaying the CPM
        // (which derives dates from durations + dependencies only) would snap the
        // bar back to its earliest start. Structural changes (delete, add/remove
        // dependency) still reschedule via their own handlers.
        const durationChanged =
          updates.duration_days !== undefined &&
          !!previous &&
          Number(updates.duration_days) !== Number(previous.duration_days);
        if (durationChanged) {
          scheduleReschedule();
        }
      } catch (err) {
        console.error("[planning] update error:", err);
        toast.error(t("update.failed"));
        fetchPlanning(); // revert on error
      }
    },
    [planningId, planning, refreshPlanningOptimistic, fetchPlanning, scheduleReschedule, t],
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
        const res = await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase_id: phaseId, ...updates }),
        });
        if (!res.ok) {
          console.error("[planning] phase update rejected:", res.status);
          fetchPlanning();
        }
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
        const res = await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete_task_id: taskId }),
        });
        if (!res.ok) {
          console.error("[planning] delete task rejected:", res.status);
          toast.error(t("update.failed"));
          fetchPlanning();
          return;
        }
        // Its dependencies went with it — successors may move up.
        scheduleReschedule();
      } catch (err) {
        console.error("[planning] delete task error:", err);
        toast.error(t("update.failed"));
        fetchPlanning();
      }
    },
    [planningId, fetchPlanning, scheduleReschedule, t],
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
          // A new link changes the whole downstream schedule.
          await runReschedule();
        } else {
          const json = await res.json().catch(() => null);
          toast.error(json?.error || t("update.failed"));
        }
      } catch (err) {
        console.error("[planning] add dependency error:", err);
        toast.error(t("update.failed"));
      }
    },
    [planningId, runReschedule, t],
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
        const res = await fetch(`/api/planning/${planningId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delete_dependency_id: depId }),
        });
        if (!res.ok) {
          console.error("[planning] delete dependency rejected:", res.status);
          toast.error(t("update.failed"));
          fetchPlanning();
          return;
        }
        // Removing a constraint can pull successors earlier.
        await runReschedule();
      } catch (err) {
        console.error("[planning] delete dependency error:", err);
        toast.error(t("update.failed"));
        fetchPlanning();
      }
    },
    [planningId, fetchPlanning, runReschedule, t],
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
            start_date: toIsoDateLocal(newStart),
            end_date: toIsoDateLocal(newEnd),
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
                start_date: toIsoDateLocal(newStart),
                end_date: toIsoDateLocal(newEnd),
              }),
            });
          }),
        );
        // A bulk move is a deliberate manual shift — do NOT reschedule, or the
        // CPM would pull every task back to its earliest start.
      } catch (err) {
        console.error("[planning] bulk move error:", err);
        toast.error(t("update.failed"));
        fetchPlanning();
      }
    },
    [planningId, planning, fetchPlanning, t],
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
        scheduleReschedule();
      } catch (err) {
        console.error("[planning] bulk delete error:", err);
        toast.error(t("update.failed"));
        fetchPlanning();
      }
    },
    [planningId, fetchPlanning, scheduleReschedule, t],
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
  const [exportingPdf, setExportingPdf] = useState(false);
  const handleExportPdf = async () => {
    if (!planningId || exportingPdf) return;
    setExportingPdf(true);
    try {
      const { exportFile } = await import("@/lib/tauri");
      await exportFile(`/api/planning/${planningId}/export-pdf`, {
        fallbackFilename: `Planning_${planningId}.pdf`,
      });
    } catch (err) {
      // A silent failure here looks exactly like a browser blocking the
      // download — say it out loud.
      console.error("Planning PDF export failed:", err);
      toast.error(t("export.pdfFailed"));
    } finally {
      setExportingPdf(false);
    }
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
      } else {
        toast.error(json?.error || t("share.failed"));
      }
    } catch (err) {
      console.error("[planning] share error:", err);
      toast.error(t("share.failed"));
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

  // `criticalPath` is populated in fetchPlanning() from ai_generation_log.

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-[#27272A] bg-[#0F0F11] print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/projects/${projectId}?tab=overview`}
            className="p-1 hover:bg-[#27272A] rounded"
          >
            <ArrowLeft className="h-4 w-4 text-[#A1A1AA]" />
          </Link>
          <CalendarRange className="h-5 w-5 text-brand" />
          <h1 className="text-lg font-semibold text-[#FAFAFA]">
            {t("title")}
          </h1>

          {rescheduling && (
            <span className="flex items-center gap-1.5 text-xs text-[#A1A1AA]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t("reschedule.running")}
            </span>
          )}

          {/* View switcher */}
          {planning && (
            <div className="ml-auto flex items-center rounded-lg border border-[#27272A] bg-[#18181B] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("gantt")}
                aria-pressed={viewMode === "gantt"}
                className={[
                  "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  viewMode === "gantt"
                    ? "bg-[#0F0F11] text-[#FAFAFA] shadow-sm"
                    : "text-[#A1A1AA] hover:text-[#FAFAFA]",
                ].join(" ")}
              >
                <GanttChartSquare className="h-3.5 w-3.5" />
                {t("viewMode.gantt")}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("lookahead")}
                aria-pressed={viewMode === "lookahead"}
                className={[
                  "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-colors",
                  viewMode === "lookahead"
                    ? "bg-[#0F0F11] text-[#FAFAFA] shadow-sm"
                    : "text-[#A1A1AA] hover:text-[#FAFAFA]",
                ].join(" ")}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                {t("viewMode.lookahead")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* AI risks / recommendations / procurement plan */}
      {planning && (
        <PlanningAiPanel
          summary={planning.ai_summary}
          risks={planning.ai_risks}
          recommendations={planning.ai_recommendations}
          procurementPlan={planning.ai_procurement_plan}
        />
      )}

      {loadError && !planning ? (
        // Error state — distinct from "no planning yet" so a transient failure
        // never invites the user to regenerate over an existing planning.
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <AlertCircle className="h-16 w-16 text-[#EF4444] mx-auto mb-4" />
            <h2 className="text-lg font-medium text-[#FAFAFA] mb-2">
              {t("errors.title")}
            </h2>
            <p className="text-sm text-[#A1A1AA] mb-6">{loadError}</p>
            <button
              onClick={() => {
                setLoading(true);
                setLoadError(null);
                fetchPlanning();
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#F97316] text-[#0F0F11] text-sm font-medium rounded-lg hover:bg-[#EA580C]"
            >
              <RefreshCw className="h-4 w-4" />
              {t("errors.retry")}
            </button>
          </div>
        </div>
      ) : !planning ? (
        // Empty state
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <CalendarRange className="h-16 w-16 text-[#A1A1AA] mx-auto mb-4" />
            <h2 className="text-lg font-medium text-[#FAFAFA] mb-2">
              {t("noPlanning")}
            </h2>
            <p className="text-sm text-[#A1A1AA] mb-6">
              {t("noPlanningDesc")}
            </p>

            <div className="space-y-3">
              {submissions.length > 0 && (
                <>
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
                  <p className="text-xs text-[#A1A1AA]">{t("emptyPlanning.or")}</p>
                </>
              )}
              <button
                onClick={() => setShowEmptyModal(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 border border-[#27272A] text-[#FAFAFA] text-sm font-medium rounded-lg hover:bg-[#27272A]"
              >
                <FilePlus className="h-4 w-4" />
                {t("emptyPlanning.createEmpty")}
              </button>
            </div>
          </div>
        </div>
      ) : viewMode === "lookahead" ? (
        <div className="flex-1 min-h-0 p-3">
          <LookaheadView planning={planning} onTaskUpdate={handleTaskUpdate} />
        </div>
      ) : (
        // Gantt chart
        <div className="flex-1 min-h-0 print:hidden">
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#A1A1AA] border border-[#27272A] rounded-lg hover:bg-[#27272A]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("regenerate")}
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exportingPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#A1A1AA] border border-[#27272A] rounded-lg hover:bg-[#27272A] disabled:opacity-50"
            >
              {exportingPdf ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {t("export.pdf")}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#A1A1AA] border border-[#27272A] rounded-lg hover:bg-[#27272A]"
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
          <div className="bg-[#0F0F11] rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#27272A]">
              <div className="flex items-center gap-2">
                <FilePlus className="h-5 w-5 text-[#F97316]" />
                <h2 className="text-lg font-semibold text-[#FAFAFA]">
                  {t("emptyPlanning.createEmpty")}
                </h2>
              </div>
              <button
                onClick={() => { setShowEmptyModal(false); setEmptyError(null); }}
                className="p-1 text-[#A1A1AA] hover:text-[#A1A1AA] transition-colors rounded-md hover:bg-[#27272A]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-[#FAFAFA] mb-1.5">
                  {t("emptyPlanning.title")}
                </label>
                <input
                  type="text"
                  value={emptyTitle}
                  onChange={(e) => setEmptyTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-[#27272A] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              {/* Start date */}
              <div>
                <label className="block text-sm font-medium text-[#FAFAFA] mb-1.5">
                  {t("emptyPlanning.startDate")} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A1A1AA]" />
                  <input
                    type="date"
                    value={emptyStartDate}
                    onChange={(e) => setEmptyStartDate(e.target.value)}
                    className="w-full pl-10 pr-3 py-2 border border-[#27272A] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
              </div>
              {/* End date (optional) */}
              <div>
                <label className="block text-sm font-medium text-[#FAFAFA] mb-1.5">
                  {t("emptyPlanning.endDate")}
                  <span className="ml-1 text-xs text-[#A1A1AA] font-normal">
                    ({t("config.optional")})
                  </span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A1A1AA]" />
                  <input
                    type="date"
                    value={emptyEndDate}
                    onChange={(e) => setEmptyEndDate(e.target.value)}
                    min={emptyStartDate || undefined}
                    className="w-full pl-10 pr-3 py-2 border border-[#27272A] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                  className="px-4 py-2 text-sm font-medium text-[#FAFAFA] hover:text-[#FAFAFA] hover:bg-[#27272A] rounded-lg transition-colors"
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
              <p className="font-medium">{t("errors.title")}</p>
              <p>{generateError}</p>
            </div>
          )}
        </>
      )}

      {/* Share panel */}
      {showSharePanel && shareUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-[#0F0F11] rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-2 mb-4">
              <LinkIcon className="h-5 w-5 text-brand" />
              <h3 className="text-lg font-semibold">{t("share.title")}</h3>
            </div>
            <p className="text-sm text-[#A1A1AA] mb-4">
              {t("share.description")}
            </p>
            <div className="flex items-center gap-2 mb-4">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 text-sm border border-[#27272A] rounded-lg bg-[#27272A]"
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
                className="text-sm text-[#A1A1AA] hover:text-[#FAFAFA]"
              >
                {t("share.close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
