"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronRight,
  Diamond,
} from "lucide-react";
import type { PlanningPhase, PlanningTask } from "./planning-types";
import { ROW_HEIGHT } from "./planning-types";

interface GanttTaskListProps {
  phases: PlanningPhase[];
  milestones: PlanningTask[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onTogglePhase: (phaseId: string) => void;
  onTaskDurationEdit?: (taskId: string, newDuration: number) => void;
  readOnly?: boolean;
  /** Ref to sync scroll with timeline */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}

function phaseTotalDuration(phase: PlanningPhase): number {
  if (!phase.tasks?.length) return 0;
  // Phase duration = span from phase start to phase end (NOT sum of task durations)
  const start = new Date(phase.start_date);
  const end = new Date(phase.end_date);
  const days = Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(days, 0);
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

export default function GanttTaskList({
  phases,
  milestones,
  selectedTaskId,
  onSelectTask,
  onTogglePhase,
  onTaskDurationEdit,
  readOnly,
  scrollContainerRef,
}: GanttTaskListProps) {
  const t = useTranslations("planning");
  const [editingDuration, setEditingDuration] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingDuration && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingDuration]);

  const handleDurationDoubleClick = useCallback(
    (taskId: string, currentDuration: number) => {
      if (readOnly) return;
      setEditingDuration(taskId);
      setEditValue(String(currentDuration));
    },
    [readOnly],
  );

  const handleDurationSave = useCallback(
    (taskId: string) => {
      const val = parseInt(editValue, 10);
      if (!isNaN(val) && val > 0 && onTaskDurationEdit) {
        onTaskDurationEdit(taskId, val);
      }
      setEditingDuration(null);
    },
    [editValue, onTaskDurationEdit],
  );

  const handleDurationKeyDown = useCallback(
    (e: React.KeyboardEvent, taskId: string) => {
      if (e.key === "Enter") handleDurationSave(taskId);
      if (e.key === "Escape") setEditingDuration(null);
    },
    [handleDurationSave],
  );

  return (
    <div
      ref={scrollContainerRef}
      className="overflow-y-auto overflow-x-hidden"
      style={{ height: "100%" }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-20 flex items-center bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 uppercase tracking-wider"
        style={{ height: ROW_HEIGHT + 8 }}
      >
        <div className="flex-1 px-3">{t("taskList.name")}</div>
        <div className="w-16 text-center">{t("taskList.duration")}</div>
        <div className="w-20 text-center">{t("taskList.start")}</div>
        <div className="w-20 text-center">{t("taskList.end")}</div>
      </div>

      {/* Phases + tasks */}
      {phases.map((phase) => (
        <React.Fragment key={phase.id}>
          {/* Phase row */}
          <div
            className={[
              "flex items-center border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors",
              selectedTaskId === phase.id ? "bg-blue-50" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ height: ROW_HEIGHT }}
            onClick={() => onTogglePhase(phase.id)}
          >
            <div className="flex items-center flex-1 px-2 gap-1.5 min-w-0">
              {/* Expand/collapse */}
              {phase.isExpanded ? (
                <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
              )}
              {/* Phase color dot */}
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: phase.color }}
              />
              {/* Phase name */}
              <span className="text-sm font-semibold text-gray-900 truncate">
                {phase.name}
              </span>
            </div>
            <div className="w-16 text-center text-xs text-gray-500 font-medium">
              {phaseTotalDuration(phase)}{daysSuffix(t)}
            </div>
            <div className="w-20 text-center text-xs text-gray-500">
              {formatShortDate(phase.start_date)}
            </div>
            <div className="w-20 text-center text-xs text-gray-500">
              {formatShortDate(phase.end_date)}
            </div>
          </div>

          {/* Task rows (visible when phase expanded) */}
          {phase.isExpanded &&
            phase.tasks
              .filter((tk) => !tk.is_milestone)
              .map((task) => (
                <div
                  key={task.id}
                  className={[
                    "flex items-center border-b border-gray-50 cursor-pointer hover:bg-gray-50/80 transition-colors",
                    selectedTaskId === task.id ? "bg-blue-50/70" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => onSelectTask(task.id)}
                >
                  <div className="flex items-center flex-1 px-2 pl-8 gap-1.5 min-w-0">
                    {/* Indent + task name */}
                    <span className="text-sm text-gray-700 truncate">
                      {task.name}
                    </span>
                  </div>

                  {/* Duration (editable) */}
                  <div className="w-16 text-center">
                    {editingDuration === task.id ? (
                      <input
                        ref={inputRef}
                        type="number"
                        min={1}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleDurationSave(task.id)}
                        onKeyDown={(e) => handleDurationKeyDown(e, task.id)}
                        className="w-12 text-center text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    ) : (
                      <span
                        className="text-xs text-gray-600 cursor-text hover:text-blue-600 hover:underline"
                        onDoubleClick={() =>
                          handleDurationDoubleClick(task.id, task.duration_days)
                        }
                      >
                        {task.duration_days}{daysSuffix(t)}
                      </span>
                    )}
                  </div>

                  {/* Start date */}
                  <div className="w-20 text-center text-xs text-gray-500">
                    {formatShortDate(task.start_date)}
                  </div>

                  {/* End date */}
                  <div className="w-20 text-center text-xs text-gray-500">
                    {formatShortDate(task.end_date)}
                  </div>
                </div>
              ))}
        </React.Fragment>
      ))}

      {/* Milestones section */}
      {milestones.length > 0 && (
        <>
          <div
            className="flex items-center border-b border-gray-200 bg-amber-50/50"
            style={{ height: ROW_HEIGHT }}
          >
            <div className="flex items-center flex-1 px-3 gap-2">
              <Diamond className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              <span className="text-sm font-semibold text-amber-800">
                {t("taskList.milestones")}
              </span>
            </div>
          </div>
          {milestones.map((ms) => (
            <div
              key={ms.id}
              className={[
                "flex items-center border-b border-gray-50 cursor-pointer hover:bg-amber-50/30 transition-colors",
                selectedTaskId === ms.id ? "bg-blue-50/70" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ height: ROW_HEIGHT }}
              onClick={() => onSelectTask(ms.id)}
            >
              <div className="flex items-center flex-1 px-2 pl-8 gap-1.5 min-w-0">
                <Diamond className="h-3 w-3 text-amber-500 shrink-0" />
                <span className="text-sm text-gray-700 truncate">
                  {ms.name}
                </span>
              </div>
              <div className="w-16 text-center text-xs text-amber-600 font-medium">
                &mdash;
              </div>
              <div className="w-20 text-center text-xs text-gray-500">
                {formatShortDate(ms.start_date)}
              </div>
              <div className="w-20" />
            </div>
          ))}
        </>
      )}
    </div>
  );
}
