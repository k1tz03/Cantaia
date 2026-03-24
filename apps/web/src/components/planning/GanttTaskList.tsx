"use client";

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  Diamond,
  Pencil,
} from "lucide-react";
import type { PlanningPhase, PlanningTask } from "./planning-types";
import { ROW_HEIGHT } from "./planning-types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GanttTaskListProps {
  phases: PlanningPhase[];
  milestones: PlanningTask[];
  selectedTaskId: string | null;
  selectedTaskIds?: Set<string>;
  onSelectTask: (taskId: string, event?: React.MouseEvent) => void;
  onTogglePhase: (phaseId: string) => void;
  onUpdateTask?: (taskId: string, updates: Partial<PlanningTask>) => void;
  onUpdatePhase?: (phaseId: string, updates: { name?: string }) => void;
  onOpenSidePanel?: (taskId: string) => void;
  onTaskDurationEdit?: (taskId: string, newDuration: number) => void;
  onContextMenu?: (e: React.MouseEvent, type: "phase" | "task" | "empty", data?: any) => void;
  readOnly?: boolean;
  /** Ref to sync scroll with timeline */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Highlighted critical path chain -- rows in chain get subtle red background */
  highlightedCriticalChain?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear()).slice(2); // "26", "27", etc.
  return `${day}.${month}.${year}`;
}

function toDateInputValue(dateStr: string): string {
  return dateStr?.slice(0, 10) ?? "";
}

function phaseTotalDuration(phase: PlanningPhase): number {
  if (!phase.tasks?.length) return 0;
  const start = new Date(phase.start_date);
  const end = new Date(phase.end_date);
  const days = Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(days, 0);
}

function addDaysToDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

/** Safe days suffix — falls back to literal "j" if translation missing */
function daysSuffix(t: (key: string) => string): string {
  try {
    const val = t("taskList.daysShort");
    return val || "j";
  } catch {
    return "j";
  }
}

// ---------------------------------------------------------------------------
// WBS calculation
// ---------------------------------------------------------------------------

/** Calculate WBS numbers for phases and tasks */
function calculateWBS(phases: PlanningPhase[]): Map<string, string> {
  const wbs = new Map<string, string>();
  let milestoneCount = 0;

  phases.forEach((phase, pi) => {
    wbs.set(phase.id, `${pi + 1}`);
    if (phase.isExpanded) {
      let taskIndex = 0;
      phase.tasks.forEach((task) => {
        if (task.is_milestone) {
          milestoneCount++;
          wbs.set(task.id, `J${milestoneCount}`);
        } else {
          taskIndex++;
          wbs.set(task.id, `${pi + 1}.${taskIndex}`);
        }
      });
    }
  });

  return wbs;
}

// ---------------------------------------------------------------------------
// Editing cell type
// ---------------------------------------------------------------------------

interface EditingCell {
  taskId: string;
  field: "name" | "duration" | "start" | "end" | "phase_name";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GanttTaskList({
  phases,
  milestones,
  selectedTaskId,
  selectedTaskIds,
  onSelectTask,
  onTogglePhase,
  onUpdateTask,
  onUpdatePhase,
  onOpenSidePanel,
  onTaskDurationEdit,
  onContextMenu,
  readOnly,
  scrollContainerRef,
  highlightedCriticalChain,
}: GanttTaskListProps) {
  const t = useTranslations("planning");

  // WBS numbers (recalculates on phase/task reorder)
  const wbsMap = useMemo(() => calculateWBS(phases), [phases]);

  // Critical chain set
  const chainSet = useMemo(
    () => new Set(highlightedCriticalChain || []),
    [highlightedCriticalChain],
  );
  const hasChain = chainSet.size > 0;

  // Count milestones inside phases for continuing numbering in milestones section
  const phaseMilestoneCount = useMemo(() => {
    let count = 0;
    phases.forEach((phase) => {
      phase.tasks.forEach((task) => {
        if (task.is_milestone) count++;
      });
    });
    return count;
  }, [phases]);

  // Inline editing state
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus and select when entering edit mode
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // ── Enter edit mode ────────────────────────────────────────────────────

  const startEditing = useCallback(
    (taskId: string, field: EditingCell["field"], currentValue: string) => {
      if (readOnly) return;
      setEditingCell({ taskId, field });
      setEditValue(currentValue);
    },
    [readOnly],
  );

  // ── Cancel edit ────────────────────────────────────────────────────────

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setEditValue("");
  }, []);

  // ── Save edit ──────────────────────────────────────────────────────────

  const saveEdit = useCallback(() => {
    if (!editingCell) return;
    const { taskId, field } = editingCell;

    if (field === "phase_name") {
      if (editValue.trim() && onUpdatePhase) {
        onUpdatePhase(taskId, { name: editValue.trim() });
      }
      cancelEdit();
      return;
    }

    // Find the task in phases or milestones
    let task: PlanningTask | undefined;
    for (const phase of phases) {
      task = phase.tasks.find((t) => t.id === taskId);
      if (task) break;
    }
    if (!task) {
      task = milestones.find((m) => m.id === taskId);
    }
    if (!task) {
      cancelEdit();
      return;
    }

    switch (field) {
      case "name": {
        if (editValue.trim() && editValue.trim() !== task.name && onUpdateTask) {
          onUpdateTask(taskId, { name: editValue.trim() });
        }
        break;
      }
      case "duration": {
        const val = parseInt(editValue, 10);
        if (!isNaN(val) && val > 0) {
          if (onUpdateTask) {
            const newEnd = addDaysToDate(task.start_date, val);
            onUpdateTask(taskId, { duration_days: val, end_date: newEnd });
          } else if (onTaskDurationEdit) {
            onTaskDurationEdit(taskId, val);
          }
        }
        break;
      }
      case "start": {
        if (editValue && onUpdateTask) {
          const newEnd = addDaysToDate(editValue, task.duration_days);
          onUpdateTask(taskId, { start_date: editValue, end_date: newEnd });
        }
        break;
      }
      case "end": {
        if (editValue && onUpdateTask) {
          const newDur = Math.max(1, daysBetween(task.start_date, editValue));
          onUpdateTask(taskId, { end_date: editValue, duration_days: newDur });
        }
        break;
      }
    }

    cancelEdit();
  }, [
    editingCell,
    editValue,
    phases,
    milestones,
    onUpdateTask,
    onUpdatePhase,
    onTaskDurationEdit,
    cancelEdit,
  ]);

  // ── Key handler ────────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveEdit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
      }
    },
    [saveEdit, cancelEdit],
  );

  // ── Selection helpers ──────────────────────────────────────────────────

  const isTaskSelected = useCallback(
    (taskId: string) => {
      if (selectedTaskIds && selectedTaskIds.size > 0) {
        return selectedTaskIds.has(taskId);
      }
      return selectedTaskId === taskId;
    },
    [selectedTaskId, selectedTaskIds],
  );

  // ── Render helpers ─────────────────────────────────────────────────────

  /** Inline editable cell (text) */
  const renderEditableText = (
    taskId: string,
    field: EditingCell["field"],
    value: string,
    className: string,
  ) => {
    if (editingCell?.taskId === taskId && editingCell?.field === field) {
      return (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleKeyDown}
          className="w-full text-sm border border-blue-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[#0F0F11]"
        />
      );
    }
    return (
      <span
        className={className}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditing(taskId, field, value);
        }}
      >
        {value}
      </span>
    );
  };

  /** Inline editable cell (number with suffix) */
  const renderEditableDuration = (task: PlanningTask) => {
    if (
      editingCell?.taskId === task.id &&
      editingCell?.field === "duration"
    ) {
      return (
        <input
          ref={inputRef}
          type="number"
          min={1}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleKeyDown}
          className="w-12 text-center text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      );
    }
    return (
      <span
        className="text-xs text-[#71717A] cursor-text hover:text-[#F97316] hover:underline"
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditing(task.id, "duration", String(task.duration_days));
        }}
      >
        {task.duration_days}{daysSuffix(t)}
      </span>
    );
  };

  /** Inline editable date */
  const renderEditableDate = (
    task: PlanningTask,
    field: "start" | "end",
  ) => {
    const dateStr = field === "start" ? task.start_date : task.end_date;
    if (editingCell?.taskId === task.id && editingCell?.field === field) {
      return (
        <input
          ref={inputRef}
          type="date"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={saveEdit}
          onKeyDown={handleKeyDown}
          className="w-full text-[11px] border border-blue-400 rounded px-0.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      );
    }
    return (
      <span
        className="text-xs text-[#71717A] cursor-text hover:text-[#F97316] hover:underline"
        onDoubleClick={(e) => {
          e.stopPropagation();
          startEditing(task.id, field, toDateInputValue(dateStr));
        }}
      >
        {formatShortDate(dateStr)}
      </span>
    );
  };

  return (
    <div
      ref={scrollContainerRef}
      className="overflow-y-auto overflow-x-hidden"
      style={{ height: "100%" }}
      onContextMenu={onContextMenu ? (e) => {
        // Only trigger if clicking on the container itself (not on a row)
        if (e.target === e.currentTarget) {
          onContextMenu(e, "empty");
        }
      } : undefined}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-20 flex items-center bg-[#27272A] border-b border-[#27272A] text-xs font-medium text-[#71717A] uppercase tracking-wider"
        style={{ height: ROW_HEIGHT + 8 }}
      >
        <div className="w-12 text-center shrink-0 px-1">{t("wbs.column")}</div>
        <div className="flex-1 px-3">{t("taskList.name")}</div>
        <div className="w-16 text-center">{t("taskList.duration")}</div>
        <div className="w-[68px] text-center">{t("taskList.start")}</div>
        <div className="w-[68px] text-center">{t("taskList.end")}</div>
        {/* Edit icon column spacer */}
        {!readOnly && onOpenSidePanel && <div className="w-7" />}
      </div>

      {/* Phases + tasks */}
      {phases.map((phase) => (
        <React.Fragment key={phase.id}>
          {/* Phase row */}
          <div
            className={[
              "group flex items-center border-b border-[#27272A] cursor-pointer hover:bg-[#27272A] transition-colors",
              isTaskSelected(phase.id) ? "bg-[#F97316]/10" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ height: ROW_HEIGHT }}
            onClick={() => onTogglePhase(phase.id)}
            onContextMenu={onContextMenu ? (e) => onContextMenu(e, "phase", phase) : undefined}
          >
            {/* WBS column */}
            <div className="w-12 text-center shrink-0 px-1">
              <span className="text-xs font-bold text-[#FAFAFA] font-mono">
                {wbsMap.get(phase.id) || ""}
              </span>
            </div>
            <div className="flex items-center flex-1 px-2 gap-1.5 min-w-0">
              {/* Expand/collapse */}
              {phase.isExpanded ? (
                <ChevronDown className="h-4 w-4 text-[#71717A] shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-[#71717A] shrink-0" />
              )}
              {/* Phase color dot */}
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: phase.color }}
              />
              {/* Phase name — editable on double-click */}
              {editingCell?.taskId === phase.id &&
              editingCell?.field === "phase_name" ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={saveEdit}
                  onKeyDown={handleKeyDown}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 text-sm font-semibold border border-blue-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-[#0F0F11]"
                />
              ) : (
                <span
                  className="text-sm font-semibold text-[#FAFAFA] truncate"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    startEditing(phase.id, "phase_name", phase.name);
                  }}
                >
                  {phase.name}
                </span>
              )}
            </div>
            <div className="w-16 text-center text-xs text-[#71717A] font-medium">
              {phaseTotalDuration(phase)}{daysSuffix(t)}
            </div>
            <div className="w-[68px] text-center text-xs text-[#71717A]">
              {formatShortDate(phase.start_date)}
            </div>
            <div className="w-[68px] text-center text-xs text-[#71717A]">
              {formatShortDate(phase.end_date)}
            </div>
            {!readOnly && onOpenSidePanel && <div className="w-7" />}
          </div>

          {/* Task rows (visible when phase expanded) */}
          {phase.isExpanded &&
            phase.tasks
              .filter((tk) => !tk.is_milestone)
              .map((task) => {
                const isInChain = chainSet.has(task.id);
                return (
                <div
                  key={task.id}
                  className={[
                    "group flex items-center border-b border-[#27272A] cursor-pointer hover:bg-[#27272A]/80 transition-colors",
                    isTaskSelected(task.id) ? "bg-[#F97316]/10/70" : "",
                    hasChain && isInChain ? "bg-red-50/50" : "",
                    hasChain && !isInChain ? "opacity-50" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ height: ROW_HEIGHT }}
                  onClick={(e) => onSelectTask(task.id, e)}
                  onContextMenu={onContextMenu ? (e) => onContextMenu(e, "task", task) : undefined}
                >
                  {/* WBS column */}
                  <div className="w-12 text-center shrink-0 px-1">
                    <span className="text-[11px] text-[#71717A] font-mono">
                      {wbsMap.get(task.id) || ""}
                    </span>
                  </div>
                  <div
                    className="flex items-center flex-1 px-2 pl-6 gap-1 min-w-0"
                    title={task.cfc_code ? `CFC ${task.cfc_code}` : undefined}
                  >
                    {/* Task name — editable on double-click */}
                    {renderEditableText(
                      task.id,
                      "name",
                      task.name,
                      "text-sm text-[#FAFAFA] truncate cursor-text min-w-0 flex-1",
                    )}
                  </div>

                  {/* Duration (editable) */}
                  <div className="w-16 text-center">
                    {renderEditableDuration(task)}
                  </div>

                  {/* Start date (editable) */}
                  <div className="w-[68px] text-center">
                    {renderEditableDate(task, "start")}
                  </div>

                  {/* End date (editable) */}
                  <div className="w-[68px] text-center">
                    {renderEditableDate(task, "end")}
                  </div>

                  {/* Edit icon — opens side panel */}
                  {!readOnly && onOpenSidePanel && (
                    <div className="w-7 flex items-center justify-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSidePanel(task.id);
                        }}
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#F97316]/10 text-[#71717A] hover:text-[#F97316] transition-all"
                        title={t("contextMenu.edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                );
              })}
        </React.Fragment>
      ))}

      {/* Milestones section */}
      {milestones.length > 0 && (
        <>
          <div
            className="flex items-center border-b border-[#27272A] bg-amber-50/50"
            style={{ height: ROW_HEIGHT }}
          >
            <div className="w-12 shrink-0" />
            <div className="flex items-center flex-1 px-3 gap-2">
              <Diamond className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-sm font-semibold text-amber-800">
                {t("taskList.milestones")}
              </span>
            </div>
          </div>
          {milestones.map((ms, msIdx) => (
            <div
              key={ms.id}
              className={[
                "group flex items-center border-b border-[#27272A] cursor-pointer hover:bg-amber-50/30 transition-colors",
                isTaskSelected(ms.id) ? "bg-[#F97316]/10/70" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ height: ROW_HEIGHT }}
              onClick={(e) => onSelectTask(ms.id, e)}
              onContextMenu={onContextMenu ? (e) => onContextMenu(e, "task", ms) : undefined}
            >
              {/* WBS column */}
              <div className="w-12 text-center shrink-0 px-1">
                <span className="text-[11px] text-amber-600 font-mono font-medium">
                  J{phaseMilestoneCount + msIdx + 1}
                </span>
              </div>
              <div className="flex items-center flex-1 px-2 pl-8 gap-1.5 min-w-0">
                <Diamond className="h-3 w-3 text-amber-500 shrink-0" />
                {/* Milestone name — editable on double-click */}
                {renderEditableText(
                  ms.id,
                  "name",
                  ms.name,
                  "text-sm text-[#FAFAFA] truncate cursor-text",
                )}
              </div>
              <div className="w-16 text-center text-xs text-amber-600 font-medium">
                &mdash;
              </div>
              <div className="w-[68px] text-center text-xs text-[#71717A]">
                {formatShortDate(ms.start_date)}
              </div>
              <div className="w-20" />
              {!readOnly && onOpenSidePanel && (
                <div className="w-7 flex items-center justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenSidePanel(ms.id);
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-[#F97316]/10 text-[#71717A] hover:text-[#F97316] transition-all"
                    title={t("contextMenu.edit")}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
