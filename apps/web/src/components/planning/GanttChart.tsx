"use client";

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { useTranslations } from "next-intl";
import {
  Trash2,
  Copy,
  ArrowRightLeft,
  XCircle,
  Undo2,
  Redo2,
  Layers,
  ListPlus,
  Diamond,
  Palette,
  PenLine,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import type {
  Planning,
  PlanningPhase,
  PlanningTask,
  PlanningDependency,
  ZoomLevel,
} from "./planning-types";
import { PHASE_COLORS } from "./planning-types";
import GanttHeader from "./GanttHeader";
import GanttToolbar from "./GanttToolbar";
import GanttContextMenu, { ColorPickerRow } from "./GanttContextMenu";
import type { ContextMenuItem } from "./GanttContextMenu";
import GanttTaskList from "./GanttTaskList";
import GanttTimeline from "./GanttTimeline";
import GanttSidePanel from "./GanttSidePanel";
import useUndoRedo from "./useUndoRedo";

// ─── Props ───────────────────────────────────────────────────────────────────

interface GanttChartProps {
  planning: Planning;
  criticalPath: string[];
  /** If not provided, auto-selects based on the planning date range */
  zoom?: ZoomLevel;
  onTaskUpdate?: (taskId: string, updates: Partial<PlanningTask>) => void;
  onPhaseUpdate?: (phaseId: string, updates: { name?: string }) => void;
  onTaskAdd?: (phaseId: string, task: Partial<PlanningTask>) => void;
  onTaskDelete?: (taskId: string) => void;
  onDependencyCreate?: (
    predecessorId: string,
    successorId: string,
    type: string,
    lag: number,
  ) => void;
  onDependencyDelete?: (depId: string) => void;
  onBulkMove?: (taskIds: string[], daysDelta: number) => void;
  onBulkDelete?: (taskIds: string[]) => void;
  onBulkDuplicate?: (taskIds: string[]) => void;
  onAddPhase?: (phase?: Partial<PlanningPhase>) => Promise<any>;
  onAddTask?: (task?: Partial<PlanningTask>) => Promise<any>;
  onDeletePhase?: (phaseId: string) => Promise<any>;
  onDuplicatePhase?: (phaseId: string) => Promise<any>;
  onDuplicateTask?: (taskId: string) => Promise<any>;
  onUpdatePhaseColor?: (phaseId: string, color: string) => Promise<any>;
  readOnly?: boolean;
  projectName?: string;
  planningId?: string;
  suppliers?: Array<{ id: string; company_name: string }>;
  children?: React.ReactNode; // passed to GanttHeader as action buttons
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "cantaia_planning_split_width";

function getStoredSplitWidth(): number {
  if (typeof window === "undefined") return 35;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const val = parseFloat(stored);
    if (!isNaN(val) && val >= 15 && val <= 70) return val;
  }
  return 35;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Calculate the best zoom level for a given date range */
function computeAutoZoom(startDate: string, endDate: string): ZoomLevel {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = daysBetween(start, end);
  if (totalDays < 60) return "day";
  if (totalDays < 365) return "week";
  return "month";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GanttChart({
  planning,
  criticalPath,
  zoom: initialZoom,
  onTaskUpdate,
  onPhaseUpdate,
  onTaskAdd: _onTaskAdd,
  onTaskDelete,
  onDependencyCreate,
  onDependencyDelete,
  onBulkMove,
  onBulkDelete,
  onBulkDuplicate,
  onAddPhase: onAddPhaseProp,
  onAddTask: onAddTaskProp,
  onDeletePhase: onDeletePhaseProp,
  onDuplicatePhase: onDuplicatePhaseProp,
  onDuplicateTask: onDuplicateTaskProp,
  onUpdatePhaseColor: onUpdatePhaseColorProp,
  readOnly,
  projectName,
  planningId,
  suppliers = [],
  children,
}: GanttChartProps) {
  const t = useTranslations("planning");

  // Zoom — auto-select best zoom level based on planning date range if not provided
  const [zoom, setZoom] = useState<ZoomLevel>(() =>
    initialZoom ??
    computeAutoZoom(planning.start_date, planning.calculated_end_date),
  );

  // Selected task (single-click)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Multi-selection
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const lastSelectedRef = useRef<string | null>(null);

  // Side panel
  const [sidePanelTaskId, setSidePanelTaskId] = useState<string | null>(null);

  // Bulk move modal
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [bulkMoveDays, setBulkMoveDays] = useState(0);

  // Phases with expand state
  const [phases, setPhases] = useState<PlanningPhase[]>(() =>
    planning.phases.map((p) => ({ ...p, isExpanded: true })),
  );

  // Undo/redo
  const undoRedo = useUndoRedo(50);

  // Update phases when planning changes
  useEffect(() => {
    setPhases((prev) => {
      const prevExpandMap = new Map(prev.map((p) => [p.id, p.isExpanded]));
      return planning.phases.map((p) => ({
        ...p,
        isExpanded: prevExpandMap.get(p.id) ?? true,
      }));
    });
  }, [planning.phases]);

  // Split panel
  const [splitPercent, setSplitPercent] = useState(getStoredSplitWidth);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);

  // Scroll sync refs
  const taskListScrollRef = useRef<HTMLDivElement>(null);

  // Persist split width
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(splitPercent));
  }, [splitPercent]);

  // Split drag
  const handleSplitPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDraggingSplit.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!isDraggingSplit.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.min(70, Math.max(15, pct)));
    };

    const handleUp = () => {
      isDraggingSplit.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  // Toggle phase expand/collapse
  const handleTogglePhase = useCallback((phaseId: string) => {
    setPhases((prev) =>
      prev.map((p) =>
        p.id === phaseId ? { ...p, isExpanded: !p.isExpanded } : p,
      ),
    );
  }, []);

  // ── Selection handlers ─────────────────────────────────────────────────

  const handleSelectTask = useCallback(
    (taskId: string, event?: React.MouseEvent) => {
      const isCtrl = event?.ctrlKey || event?.metaKey;
      const isShift = event?.shiftKey;

      if (isSelectionMode || isCtrl) {
        // Toggle selection
        setSelectedTaskIds((prev) => {
          const next = new Set(prev);
          if (next.has(taskId)) {
            next.delete(taskId);
          } else {
            next.add(taskId);
          }
          return next;
        });
        lastSelectedRef.current = taskId;
      } else if (isShift && lastSelectedRef.current) {
        // Range select within the same phase
        const allTasksFlat = planning.tasks.filter((t) => !t.is_milestone);
        const lastIdx = allTasksFlat.findIndex(
          (t) => t.id === lastSelectedRef.current,
        );
        const currentIdx = allTasksFlat.findIndex((t) => t.id === taskId);
        if (lastIdx >= 0 && currentIdx >= 0) {
          const start = Math.min(lastIdx, currentIdx);
          const end = Math.max(lastIdx, currentIdx);
          setSelectedTaskIds((prev) => {
            const next = new Set(prev);
            for (let i = start; i <= end; i++) {
              next.add(allTasksFlat[i].id);
            }
            return next;
          });
        }
      } else {
        // Normal click — single select, clear multi
        setSelectedTaskId(taskId);
        setSelectedTaskIds(new Set());
        lastSelectedRef.current = taskId;
      }
    },
    [isSelectionMode, planning.tasks],
  );

  const clearSelection = useCallback(() => {
    setSelectedTaskIds(new Set());
    setIsSelectionMode(false);
  }, []);

  // ── Task update with undo/redo ─────────────────────────────────────────

  const handleTaskUpdate = useCallback(
    (taskId: string, updates: Partial<PlanningTask>) => {
      if (!onTaskUpdate) return;

      // Find original task state for undo
      const originalTask = planning.tasks.find((tk) => tk.id === taskId);
      if (!originalTask) return;

      // Build undo data
      const undoUpdates: Partial<PlanningTask> = {};
      for (const key of Object.keys(updates) as (keyof PlanningTask)[]) {
        (undoUpdates as any)[key] = originalTask[key];
      }

      // Push undo action
      undoRedo.push({
        type: "update_task",
        description: `Update ${originalTask.name}`,
        undo: () => onTaskUpdate(taskId, undoUpdates),
        redo: () => onTaskUpdate(taskId, updates),
      });

      // Execute
      onTaskUpdate(taskId, updates);
    },
    [onTaskUpdate, planning.tasks, undoRedo],
  );

  // Task duration edit (from task list — legacy callback)
  const handleTaskDurationEdit = useCallback(
    (taskId: string, newDuration: number) => {
      const task = planning.tasks.find((tk) => tk.id === taskId);
      if (!task) return;
      const newEnd = addDaysToDateStr(task.start_date, newDuration);
      handleTaskUpdate(taskId, {
        duration_days: newDuration,
        end_date: newEnd,
      });
    },
    [planning.tasks, handleTaskUpdate],
  );

  // Phase update
  const handlePhaseUpdate = useCallback(
    (phaseId: string, updates: { name?: string }) => {
      if (onPhaseUpdate) {
        onPhaseUpdate(phaseId, updates);
      }
    },
    [onPhaseUpdate],
  );

  // ── Side panel ─────────────────────────────────────────────────────────

  const sidePanelTask = useMemo(() => {
    if (!sidePanelTaskId) return null;
    return planning.tasks.find((t) => t.id === sidePanelTaskId) ?? null;
  }, [sidePanelTaskId, planning.tasks]);

  const handleOpenSidePanel = useCallback((taskId: string) => {
    setSidePanelTaskId(taskId);
  }, []);

  const handleCloseSidePanel = useCallback(() => {
    setSidePanelTaskId(null);
  }, []);

  const handleSidePanelUpdate = useCallback(
    (taskId: string, updates: Partial<PlanningTask>) => {
      handleTaskUpdate(taskId, updates);
    },
    [handleTaskUpdate],
  );

  const handleAddDependency = useCallback(
    (predecessorId: string, successorId: string, type: string, lag: number) => {
      if (onDependencyCreate) {
        onDependencyCreate(predecessorId, successorId, type, lag);
      }
    },
    [onDependencyCreate],
  );

  const handleRemoveDependency = useCallback(
    (depId: string) => {
      if (onDependencyDelete) {
        onDependencyDelete(depId);
      }
    },
    [onDependencyDelete],
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      if (!onTaskDelete) return;

      const originalTask = planning.tasks.find((tk) => tk.id === taskId);

      undoRedo.push({
        type: "delete_task",
        description: `Delete ${originalTask?.name ?? "task"}`,
        undo: () => {
          // Re-add would need an add handler — for now, no-op (API-level undo not trivial)
        },
        redo: () => onTaskDelete(taskId),
      });

      onTaskDelete(taskId);
    },
    [onTaskDelete, planning.tasks, undoRedo],
  );

  // ── Bulk actions ───────────────────────────────────────────────────────

  const selectedCount = selectedTaskIds.size;

  const handleBulkMove = useCallback(() => {
    if (selectedCount < 2 || !onBulkMove) return;
    if (bulkMoveDays === 0) {
      setShowBulkMoveModal(false);
      return;
    }
    const ids = Array.from(selectedTaskIds);

    // Build undo
    undoRedo.push({
      type: "bulk_move",
      description: `Move ${ids.length} tasks by ${bulkMoveDays}d`,
      undo: () => onBulkMove(ids, -bulkMoveDays),
      redo: () => onBulkMove(ids, bulkMoveDays),
    });

    onBulkMove(ids, bulkMoveDays);
    setShowBulkMoveModal(false);
    setBulkMoveDays(0);
  }, [selectedCount, selectedTaskIds, bulkMoveDays, onBulkMove, undoRedo]);

  const handleBulkDelete = useCallback(() => {
    if (selectedCount < 2 || !onBulkDelete) return;
    const ids = Array.from(selectedTaskIds);

    undoRedo.push({
      type: "bulk_delete",
      description: `Delete ${ids.length} tasks`,
      undo: () => {}, // Undo of bulk delete requires re-add — non-trivial
      redo: () => onBulkDelete(ids),
    });

    onBulkDelete(ids);
    clearSelection();
  }, [selectedCount, selectedTaskIds, onBulkDelete, undoRedo, clearSelection]);

  const handleBulkDuplicate = useCallback(() => {
    if (selectedCount < 2 || !onBulkDuplicate) return;
    onBulkDuplicate(Array.from(selectedTaskIds));
    clearSelection();
  }, [selectedCount, selectedTaskIds, onBulkDuplicate, clearSelection]);

  // ── Context menu ─────────────────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  // ── CRUD handlers ──────────────────────────────────────────────────

  const handleAddPhase = useCallback(async () => {
    if (onAddPhaseProp) {
      await onAddPhaseProp();
    }
  }, [onAddPhaseProp]);

  const handleAddTask = useCallback(async (phaseId?: string) => {
    if (onAddTaskProp) {
      await onAddTaskProp(phaseId ? { phase_id: phaseId } as any : undefined);
    }
  }, [onAddTaskProp]);

  const handleAddMilestone = useCallback(async (date?: string) => {
    if (onAddTaskProp) {
      await onAddTaskProp({
        is_milestone: true,
        name: t("defaults.newMilestone"),
        start_date: date || new Date().toISOString().split("T")[0],
        end_date: date || new Date().toISOString().split("T")[0],
        duration_days: 0,
      } as any);
    }
  }, [onAddTaskProp, t]);

  const handleDeletePhase = useCallback(async (phaseId: string) => {
    if (onDeletePhaseProp) {
      await onDeletePhaseProp(phaseId);
    }
  }, [onDeletePhaseProp]);

  const handleDuplicatePhase = useCallback(async (phaseId: string) => {
    if (onDuplicatePhaseProp) {
      await onDuplicatePhaseProp(phaseId);
    }
  }, [onDuplicatePhaseProp]);

  const handleDuplicateTask = useCallback(async (taskId: string) => {
    if (onDuplicateTaskProp) {
      await onDuplicateTaskProp(taskId);
    }
  }, [onDuplicateTaskProp]);

  const handleUpdatePhaseColor = useCallback(async (phaseId: string, color: string) => {
    if (onUpdatePhaseColorProp) {
      await onUpdatePhaseColorProp(phaseId, color);
    }
  }, [onUpdatePhaseColorProp]);

  // ── Context menu builders ──────────────────────────────────────────

  const buildPhaseContextMenu = useCallback(
    (phase: PlanningPhase, x: number, y: number) => {
      const items: ContextMenuItem[] = [
        {
          label: t("contextMenu.addTaskInPhase"),
          icon: <ListPlus className="h-4 w-4 text-blue-500" />,
          onClick: () => handleAddTask(phase.id),
        },
        {
          label: t("contextMenu.rename"),
          icon: <PenLine className="h-4 w-4 text-gray-500" />,
          onClick: () => {
            // Trigger inline rename — handled by task list
            if (onPhaseUpdate) {
              const newName = prompt(t("contextMenu.rename"), phase.name);
              if (newName && newName.trim()) {
                onPhaseUpdate(phase.id, { name: newName.trim() });
              }
            }
          },
        },
        {
          label: t("contextMenu.changeColor"),
          icon: <Palette className="h-4 w-4 text-violet-500" />,
          onClick: () => {},
          render: () => (
            <div key="color-picker">
              <div className="px-3 py-1.5 text-xs font-medium text-gray-500">
                {t("contextMenu.changeColor")}
              </div>
              <ColorPickerRow
                colors={PHASE_COLORS}
                currentColor={phase.color}
                onSelect={(c) => handleUpdatePhaseColor(phase.id, c)}
                onClose={closeContextMenu}
              />
            </div>
          ),
        },
        {
          label: t("contextMenu.duplicate"),
          icon: <Copy className="h-4 w-4 text-gray-500" />,
          onClick: () => handleDuplicatePhase(phase.id),
          separator: true,
        },
        {
          label: t("contextMenu.insertBefore"),
          icon: <ArrowUp className="h-4 w-4 text-gray-500" />,
          onClick: () => {
            if (onAddPhaseProp) {
              onAddPhaseProp({ sort_order: phase.sort_order } as any);
            }
          },
        },
        {
          label: t("contextMenu.insertAfter"),
          icon: <ArrowDown className="h-4 w-4 text-gray-500" />,
          onClick: () => {
            if (onAddPhaseProp) {
              onAddPhaseProp({ sort_order: phase.sort_order + 1 } as any);
            }
          },
        },
        {
          label: t("contextMenu.delete"),
          icon: <Trash2 className="h-4 w-4" />,
          variant: "danger" as const,
          separator: true,
          onClick: () => {
            if (phase.tasks.length > 0) {
              if (confirm(t("contextMenu.confirmDeletePhase"))) {
                handleDeletePhase(phase.id);
              }
            } else {
              handleDeletePhase(phase.id);
            }
          },
        },
      ];

      setContextMenu({ x, y, items });
    },
    [t, handleAddTask, handleDeletePhase, handleDuplicatePhase, handleUpdatePhaseColor, onPhaseUpdate, onAddPhaseProp, closeContextMenu],
  );

  const buildTaskContextMenu = useCallback(
    (task: PlanningTask, x: number, y: number) => {
      const items: ContextMenuItem[] = [
        {
          label: t("contextMenu.edit"),
          icon: <PenLine className="h-4 w-4 text-gray-500" />,
          onClick: () => handleOpenSidePanel(task.id),
        },
        {
          label: t("contextMenu.duplicate"),
          icon: <Copy className="h-4 w-4 text-gray-500" />,
          onClick: () => handleDuplicateTask(task.id),
        },
        {
          label: t("contextMenu.convertToMilestone"),
          icon: <Diamond className="h-4 w-4 text-amber-500" />,
          onClick: () => {
            if (onTaskUpdate) {
              onTaskUpdate(task.id, {
                is_milestone: true,
                duration_days: 0,
                end_date: task.start_date,
              });
            }
          },
          disabled: task.is_milestone,
        },
        {
          label: t("contextMenu.delete"),
          icon: <Trash2 className="h-4 w-4" />,
          variant: "danger" as const,
          separator: true,
          onClick: () => {
            if (confirm(t("contextMenu.confirmDeleteTask"))) {
              handleDeleteTask(task.id);
            }
          },
        },
      ];

      setContextMenu({ x, y, items });
    },
    [t, handleOpenSidePanel, handleDuplicateTask, handleDeleteTask, onTaskUpdate],
  );

  const buildEmptyContextMenu = useCallback(
    (x: number, y: number) => {
      const items: ContextMenuItem[] = [
        {
          label: t("contextMenu.addPhaseHere"),
          icon: <Layers className="h-4 w-4 text-violet-500" />,
          onClick: () => handleAddPhase(),
        },
        {
          label: t("contextMenu.addMilestoneHere"),
          icon: <Diamond className="h-4 w-4 text-amber-500" />,
          onClick: () => handleAddMilestone(),
        },
      ];

      setContextMenu({ x, y, items });
    },
    [t, handleAddPhase, handleAddMilestone],
  );

  // ── Right-click handler for task list ──────────────────────────────

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, type: "phase" | "task" | "empty", data?: any) => {
      e.preventDefault();
      e.stopPropagation();

      if (readOnly) return;

      if (type === "phase" && data) {
        buildPhaseContextMenu(data as PlanningPhase, e.clientX, e.clientY);
      } else if (type === "task" && data) {
        buildTaskContextMenu(data as PlanningTask, e.clientX, e.clientY);
      } else {
        buildEmptyContextMenu(e.clientX, e.clientY);
      }
    },
    [readOnly, buildPhaseContextMenu, buildTaskContextMenu, buildEmptyContextMenu],
  );

  // ── Keyboard shortcuts (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z) ───────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undoRedo.undo();
      } else if (e.key === "y" || (e.key === "z" && e.shiftKey)) {
        e.preventDefault();
        undoRedo.redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undoRedo]);

  // ── Timeline dates ─────────────────────────────────────────────────────

  const timelineStartDate = useMemo(() => {
    const d = new Date(planning.start_date);
    d.setDate(d.getDate() - 3); // 3 days padding
    return d;
  }, [planning.start_date]);

  const timelineEndDate = useMemo(() => {
    const d = new Date(planning.calculated_end_date);
    d.setDate(d.getDate() + 7); // 7 days padding
    return d;
  }, [planning.calculated_end_date]);

  // Total days
  const totalDays = useMemo(
    () =>
      daysBetween(
        new Date(planning.start_date),
        new Date(planning.calculated_end_date),
      ),
    [planning.start_date, planning.calculated_end_date],
  );

  // Critical path duration (sum of durations of critical tasks)
  const criticalPathDays = useMemo(() => {
    const criticalSet = new Set(criticalPath);
    return planning.tasks
      .filter((tk) => criticalSet.has(tk.id))
      .reduce((sum, tk) => sum + tk.duration_days, 0);
  }, [criticalPath, planning.tasks]);

  // ── Critical path highlight ──────────────────────────────────────────
  const [highlightedCriticalChain, setHighlightedCriticalChain] = useState<string[]>([]);
  const isCriticalPathHighlighted = highlightedCriticalChain.length > 0;

  /** Build critical chain from a given task: walk dependencies forward and backward */
  const buildCriticalChain = useCallback(
    (taskId: string): string[] => {
      const criticalSet = new Set(criticalPath);
      if (!criticalSet.has(taskId)) return [];

      const chain = new Set<string>();
      const depsByPred = new Map<string, PlanningDependency[]>();
      const depsBySucc = new Map<string, PlanningDependency[]>();
      for (const dep of planning.dependencies) {
        if (!depsByPred.has(dep.predecessor_id)) depsByPred.set(dep.predecessor_id, []);
        depsByPred.get(dep.predecessor_id)!.push(dep);
        if (!depsBySucc.has(dep.successor_id)) depsBySucc.set(dep.successor_id, []);
        depsBySucc.get(dep.successor_id)!.push(dep);
      }

      const walkForward = (id: string) => {
        if (chain.has(id)) return;
        chain.add(id);
        const fwd = depsByPred.get(id) || [];
        for (const dep of fwd) {
          if (criticalSet.has(dep.successor_id)) {
            walkForward(dep.successor_id);
          }
        }
      };

      const walkBackward = (id: string) => {
        if (chain.has(id)) return;
        chain.add(id);
        const bwd = depsBySucc.get(id) || [];
        for (const dep of bwd) {
          if (criticalSet.has(dep.predecessor_id)) {
            walkBackward(dep.predecessor_id);
          }
        }
      };

      walkForward(taskId);
      walkBackward(taskId);
      return Array.from(chain);
    },
    [criticalPath, planning.dependencies],
  );

  const handleToggleCriticalPathHighlight = useCallback(() => {
    if (isCriticalPathHighlighted) {
      setHighlightedCriticalChain([]);
    } else {
      setHighlightedCriticalChain([...criticalPath]);
    }
  }, [isCriticalPathHighlighted, criticalPath]);

  // Override select task to also handle critical path chain highlighting
  const handleSelectTaskWithCritical = useCallback(
    (taskId: string, event?: React.MouseEvent) => {
      const criticalSet = new Set(criticalPath);
      if (criticalSet.has(taskId)) {
        const chain = buildCriticalChain(taskId);
        setHighlightedCriticalChain(chain);
      } else if (!event?.ctrlKey && !event?.metaKey && !event?.shiftKey) {
        setHighlightedCriticalChain([]);
      }
      handleSelectTask(taskId, event);
    },
    [criticalPath, buildCriticalChain, handleSelectTask],
  );

  // ── Baseline ─────────────────────────────────────────────────────────
  const [baselineData, setBaselineData] = useState<Record<string, { start_date: string; end_date: string; duration_days: number }> | null>(null);
  const [showBaseline, setShowBaseline] = useState(false);

  // Load baseline from planning config on mount
  useEffect(() => {
    const config = (planning as any).config;
    if (config?.baseline && typeof config.baseline === "object") {
      setBaselineData(config.baseline);
    }
  }, [(planning as any).config]);

  const handleSaveBaseline = useCallback(async () => {
    if (!planningId) return;
    const snapshot: Record<string, { start_date: string; end_date: string; duration_days: number }> = {};
    for (const task of planning.tasks) {
      if (!task.is_milestone) {
        snapshot[task.id] = {
          start_date: task.start_date,
          end_date: task.end_date,
          duration_days: task.duration_days,
        };
      }
    }
    setBaselineData(snapshot);
    setShowBaseline(true);

    try {
      await fetch(`/api/planning/${planningId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_baseline" }),
      });
    } catch (err) {
      console.error("[planning] save baseline error:", err);
    }
  }, [planningId, planning.tasks]);

  const handleToggleBaseline = useCallback(() => {
    setShowBaseline((prev) => !prev);
  }, []);

  const handleResetBaseline = useCallback(async () => {
    if (!planningId) return;
    const snapshot: Record<string, { start_date: string; end_date: string; duration_days: number }> = {};
    for (const task of planning.tasks) {
      if (!task.is_milestone) {
        snapshot[task.id] = {
          start_date: task.start_date,
          end_date: task.end_date,
          duration_days: task.duration_days,
        };
      }
    }
    setBaselineData(snapshot);

    try {
      await fetch(`/api/planning/${planningId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_baseline" }),
      });
    } catch (err) {
      console.error("[planning] reset baseline error:", err);
    }
  }, [planningId, planning.tasks]);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden relative">
      {/* Header toolbar */}
      <GanttHeader
        planning={planning}
        zoom={zoom}
        onZoomChange={setZoom}
        criticalPathDays={criticalPathDays}
        isCriticalPathHighlighted={isCriticalPathHighlighted}
        onToggleCriticalPathHighlight={handleToggleCriticalPathHighlight}
        showBaseline={showBaseline}
        hasBaseline={baselineData !== null}
        onSaveBaseline={handleSaveBaseline}
        onToggleBaseline={handleToggleBaseline}
        onResetBaseline={handleResetBaseline}
        readOnly={readOnly}
        totalDays={totalDays}
        projectName={projectName}
      >
        {/* Undo / Redo buttons */}
        {!readOnly && (
          <>
            <button
              onClick={undoRedo.undo}
              disabled={!undoRedo.canUndo}
              title={
                undoRedo.undoDescription
                  ? `${t("toolbar.undo")}: ${undoRedo.undoDescription}`
                  : t("toolbar.undo")
              }
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              onClick={undoRedo.redo}
              disabled={!undoRedo.canRedo}
              title={
                undoRedo.redoDescription
                  ? `${t("toolbar.redo")}: ${undoRedo.redoDescription}`
                  : t("toolbar.redo")
              }
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Redo2 className="h-4 w-4" />
            </button>
          </>
        )}
        {children}
      </GanttHeader>

      {/* Editing toolbar */}
      <GanttToolbar
        onAddPhase={handleAddPhase}
        onAddTask={() => handleAddTask()}
        onAddMilestone={() => handleAddMilestone()}
        isSelectionMode={isSelectionMode}
        onToggleSelectionMode={() => setIsSelectionMode((prev) => !prev)}
        canUndo={undoRedo.canUndo}
        canRedo={undoRedo.canRedo}
        onUndo={undoRedo.undo}
        onRedo={undoRedo.redo}
        totalDuration={totalDays}
        endDate={planning.calculated_end_date}
        readOnly={readOnly}
      />

      {/* Main content: split panel */}
      <div ref={containerRef} className="flex flex-1 min-h-0 relative">
        {/* Left panel: task list (hidden on mobile) */}
        <div
          className="hidden md:flex flex-col border-r border-gray-200 overflow-hidden"
          style={{ width: `${splitPercent}%` }}
        >
          <GanttTaskList
            phases={phases}
            milestones={planning.milestones}
            selectedTaskId={selectedTaskId}
            selectedTaskIds={selectedTaskIds}
            onSelectTask={handleSelectTaskWithCritical}
            onTogglePhase={handleTogglePhase}
            onUpdateTask={readOnly ? undefined : handleTaskUpdate}
            onUpdatePhase={readOnly ? undefined : handlePhaseUpdate}
            onOpenSidePanel={readOnly ? undefined : handleOpenSidePanel}
            onTaskDurationEdit={readOnly ? undefined : handleTaskDurationEdit}
            onContextMenu={readOnly ? undefined : handleContextMenu}
            readOnly={readOnly}
            scrollContainerRef={taskListScrollRef}
            highlightedCriticalChain={highlightedCriticalChain}
          />
        </div>

        {/* Drag handle */}
        <div
          className="hidden md:flex items-center justify-center w-1.5 cursor-col-resize hover:bg-blue-100 active:bg-blue-200 transition-colors z-20 shrink-0"
          onPointerDown={handleSplitPointerDown}
        >
          <div className="w-0.5 h-8 bg-gray-300 rounded-full" />
        </div>

        {/* Right panel: timeline */}
        <div
          className="flex-1 min-w-0 overflow-hidden"
          style={{
            width: `calc(${100 - splitPercent}% - 6px)`,
          }}
        >
          <GanttTimeline
            phases={phases}
            tasks={planning.tasks}
            milestones={planning.milestones}
            dependencies={planning.dependencies}
            criticalPath={criticalPath}
            zoom={zoom}
            selectedTaskId={selectedTaskId}
            selectedTaskIds={selectedTaskIds}
            timelineStartDate={timelineStartDate}
            timelineEndDate={timelineEndDate}
            onSelectTask={handleSelectTaskWithCritical}
            onTaskUpdate={handleTaskUpdate}
            onDependencyCreate={onDependencyCreate ? (from: string, to: string) => onDependencyCreate(from, to, "FS", 0) : undefined}
            readOnly={readOnly}
            scrollContainerRef={taskListScrollRef}
            highlightedCriticalChain={highlightedCriticalChain}
            baselineData={baselineData || undefined}
            showBaseline={showBaseline}
          />
        </div>
      </div>

      {/* ── Selection action bar (when 2+ tasks selected) ──────────────── */}
      {selectedCount >= 2 && !readOnly && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2.5 bg-gray-900 text-white rounded-xl shadow-2xl">
          <span className="text-sm font-medium">
            {t("selection.selected", { count: selectedCount })}
          </span>

          <div className="w-px h-5 bg-gray-600" />

          {onBulkMove && (
            <button
              onClick={() => setShowBulkMoveModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {t("selection.move")}
            </button>
          )}

          {onBulkDuplicate && (
            <button
              onClick={handleBulkDuplicate}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              {t("contextMenu.duplicate")}
            </button>
          )}

          {onBulkDelete && (
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("contextMenu.delete")}
            </button>
          )}

          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
          >
            <XCircle className="h-3.5 w-3.5" />
            {t("selection.deselect")}
          </button>
        </div>
      )}

      {/* ── Bulk move modal ─────────────────────────────────────────────── */}
      {showBulkMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              {t("selection.move")}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {t("selection.moveDays")}
            </p>
            <input
              type="number"
              value={bulkMoveDays}
              onChange={(e) =>
                setBulkMoveDays(parseInt(e.target.value, 10) || 0)
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleBulkMove();
                if (e.key === "Escape") setShowBulkMoveModal(false);
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBulkMoveModal(false)}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                {t("config.cancel")}
              </button>
              <button
                onClick={handleBulkMove}
                className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {t("selection.move")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Context menu ────────────────────────────────────────────────── */}
      {contextMenu && (
        <GanttContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      )}

      {/* ── Side Panel ─────────────────────────────────────────────────── */}
      <GanttSidePanel
        task={sidePanelTask}
        phases={phases}
        dependencies={planning.dependencies}
        allTasks={planning.tasks}
        suppliers={suppliers}
        onUpdate={handleSidePanelUpdate}
        onAddDependency={handleAddDependency}
        onRemoveDependency={handleRemoveDependency}
        onDelete={handleDeleteTask}
        onClose={handleCloseSidePanel}
        readOnly={readOnly}
      />
    </div>
  );
}
