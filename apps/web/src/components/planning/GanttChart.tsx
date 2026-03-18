"use client";

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import type {
  Planning,
  PlanningPhase,
  PlanningTask,
  ZoomLevel,
} from "./planning-types";
import GanttHeader from "./GanttHeader";
import GanttTaskList from "./GanttTaskList";
import GanttTimeline from "./GanttTimeline";

// ─── Props ───────────────────────────────────────────────────────────────────

interface GanttChartProps {
  planning: Planning;
  criticalPath: string[];
  /** If not provided, auto-selects based on the planning date range */
  zoom?: ZoomLevel;
  onTaskUpdate?: (taskId: string, updates: Partial<PlanningTask>) => void;
  onDependencyCreate?: (from: string, to: string) => void;
  onDependencyDelete?: (depId: string) => void;
  readOnly?: boolean;
  projectName?: string;
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
  onDependencyCreate,
  onDependencyDelete: _onDependencyDelete,
  readOnly,
  projectName,
  children,
}: GanttChartProps) {
  // Zoom — auto-select best zoom level based on planning date range if not provided
  const [zoom, setZoom] = useState<ZoomLevel>(() =>
    initialZoom ?? computeAutoZoom(planning.start_date, planning.calculated_end_date),
  );

  // Selected task
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Phases with expand state
  const [phases, setPhases] = useState<PlanningPhase[]>(() =>
    planning.phases.map((p) => ({ ...p, isExpanded: true })),
  );

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

  // Task duration edit (from task list)
  const handleTaskDurationEdit = useCallback(
    (taskId: string, newDuration: number) => {
      if (!onTaskUpdate) return;
      const task = planning.tasks.find((tk) => tk.id === taskId);
      if (!task) return;
      const newEnd = new Date(task.start_date);
      newEnd.setDate(newEnd.getDate() + newDuration);
      onTaskUpdate(taskId, {
        duration_days: newDuration,
        end_date: newEnd.toISOString().split("T")[0],
      });
    },
    [onTaskUpdate, planning.tasks],
  );

  // Timeline start/end dates (add padding)
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

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header toolbar */}
      <GanttHeader
        planning={planning}
        zoom={zoom}
        onZoomChange={setZoom}
        criticalPathDays={criticalPathDays}
        totalDays={totalDays}
        projectName={projectName}
      >
        {children}
      </GanttHeader>

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
            onSelectTask={setSelectedTaskId}
            onTogglePhase={handleTogglePhase}
            onTaskDurationEdit={
              readOnly ? undefined : handleTaskDurationEdit
            }
            readOnly={readOnly}
            scrollContainerRef={taskListScrollRef}
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
            timelineStartDate={timelineStartDate}
            timelineEndDate={timelineEndDate}
            onSelectTask={setSelectedTaskId}
            onTaskUpdate={onTaskUpdate}
            onDependencyCreate={onDependencyCreate}
            readOnly={readOnly}
            scrollContainerRef={taskListScrollRef}
          />
        </div>
      </div>
    </div>
  );
}
