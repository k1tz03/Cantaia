"use client";

import React, { useMemo, useRef, useCallback, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type {
  PlanningPhase,
  PlanningTask,
  PlanningDependency,
  ZoomLevel,
  TaskPosition,
} from "./planning-types";
import {
  ROW_HEIGHT,
  BAR_V_PADDING,
  HEADER_HEIGHT,
  COLUMN_WIDTH,
  PIXELS_PER_DAY,
} from "./planning-types";
import GanttBar from "./GanttBar";
import GanttMilestone from "./GanttMilestone";
import GanttDependencyArrows from "./GanttDependencyArrows";
import GanttBaseline from "./GanttBaseline";
import { toIsoDateLocal } from "./date-utils";

/** Minimum column width in px -- ensures columns are readable even with many months */
const MIN_COLUMN_WIDTH = 30;

interface GanttTimelineProps {
  phases: PlanningPhase[];
  tasks: PlanningTask[];
  milestones: PlanningTask[];
  dependencies: PlanningDependency[];
  criticalPath: string[];
  zoom: ZoomLevel;
  selectedTaskId: string | null;
  selectedTaskIds?: Set<string>;
  timelineStartDate: Date;
  timelineEndDate: Date;
  onSelectTask: (taskId: string, event?: React.MouseEvent) => void;
  onTaskUpdate?: (taskId: string, updates: Partial<PlanningTask>) => void;
  onDependencyCreate?: (from: string, to: string) => void;
  readOnly?: boolean;
  /** Ref to sync scroll with task list */
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  /** Highlighted critical path chain */
  highlightedCriticalChain?: string[];
  /** Baseline data */
  baselineData?: Record<string, { start_date: string; end_date: string; duration_days: number }>;
  showBaseline?: boolean;
}

// --- Date helpers ---

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatWeekLabel(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}

/** Abbreviated month names for the active locale (Jan..Dec). */
function buildMonthNames(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { month: "short" });
  return Array.from({ length: 12 }, (_, m) =>
    fmt.format(new Date(2021, m, 1)),
  );
}

function formatMonthLabel(date: Date, monthNames: string[]): string {
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function formatDayLabel(date: Date): string {
  return String(date.getDate());
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

// --- Time columns generator ---

interface TimeColumn {
  label: string;
  subLabel?: string;
  x: number;
  width: number;
  isWeekend?: boolean;
}

function generateColumns(
  start: Date,
  end: Date,
  zoom: ZoomLevel,
  monthNames: string[],
): TimeColumn[] {
  const cols: TimeColumn[] = [];
  const totalDays = daysBetween(start, end) + 1;

  if (zoom === "day") {
    const colW = Math.max(COLUMN_WIDTH.day, MIN_COLUMN_WIDTH);
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(start, i);
      cols.push({
        label: formatDayLabel(d),
        subLabel: d.getDate() === 1 ? monthNames[d.getMonth()] : undefined,
        x: i * colW,
        width: colW,
        isWeekend: isWeekend(d),
      });
    }
  } else if (zoom === "week") {
    const colW = Math.max(COLUMN_WIDTH.week, MIN_COLUMN_WIDTH);
    let current = startOfWeek(start);
    while (current <= end) {
      const offsetDays = daysBetween(start, current);
      const x = Math.max(0, offsetDays * PIXELS_PER_DAY.week);
      cols.push({
        label: formatWeekLabel(current),
        x,
        width: colW,
      });
      current = addDays(current, 7);
    }
  } else {
    // month -- enforce minimum column width
    const colW = Math.max(COLUMN_WIDTH.month, MIN_COLUMN_WIDTH);
    let current = startOfMonth(start);
    while (current <= end) {
      const offsetDays = Math.max(0, daysBetween(start, current));
      const x = offsetDays * PIXELS_PER_DAY.month;
      cols.push({
        label: formatMonthLabel(current, monthNames),
        x,
        width: colW,
      });
      current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }
  }

  return cols;
}

// --- Build flat row list (phases + their tasks + milestones) ---

interface RowItem {
  type: "phase" | "task" | "milestone" | "section";
  id: string;
  task?: PlanningTask;
  phaseColor?: string;
  phaseId?: string;
}

function buildRowItems(
  phases: PlanningPhase[],
  milestones: PlanningTask[],
): RowItem[] {
  const items: RowItem[] = [];
  for (const phase of phases) {
    items.push({
      type: "phase",
      id: phase.id,
      phaseColor: phase.color,
    });
    if (phase.isExpanded) {
      for (const task of phase.tasks) {
        if (!task.is_milestone) {
          items.push({
            type: "task",
            id: task.id,
            task,
            phaseColor: phase.color,
            phaseId: phase.id,
          });
        }
      }
    }
  }
  // The task list renders a "Milestones" header row before the milestone block.
  // Mirror it here as an empty section row so every milestone lands on the SAME
  // y as its list counterpart (otherwise diamonds were one row too high).
  if (milestones.length > 0) {
    items.push({ type: "section", id: "__milestones_header__" });
    for (const ms of milestones) {
      items.push({
        type: "milestone",
        id: ms.id,
        task: ms,
      });
    }
  }
  return items;
}

// --- Dependency drag state ---

interface DepDragState {
  fromTaskId: string;
  fromSide: "left" | "right";
  mouseX: number;
  mouseY: number;
}

// --- Component ---

export default function GanttTimeline({
  phases,
  tasks,
  milestones,
  dependencies,
  criticalPath,
  zoom,
  selectedTaskId,
  selectedTaskIds,
  timelineStartDate,
  timelineEndDate,
  onSelectTask,
  onTaskUpdate,
  onDependencyCreate,
  readOnly,
  scrollContainerRef,
  highlightedCriticalChain,
  baselineData,
  showBaseline,
}: GanttTimelineProps) {
  const t = useTranslations("planning");
  const locale = useLocale();
  const monthNames = useMemo(() => buildMonthNames(locale), [locale]);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const bodyContainerRef = useRef<HTMLDivElement>(null);

  // Dependency drag state
  const [depDrag, setDepDrag] = useState<DepDragState | null>(null);

  const ppd = PIXELS_PER_DAY[zoom];
  const totalDays = daysBetween(timelineStartDate, timelineEndDate) + 1;
  const totalWidth = totalDays * ppd;

  // Generate time columns
  const columns = useMemo(
    () => generateColumns(timelineStartDate, timelineEndDate, zoom, monthNames),
    [timelineStartDate, timelineEndDate, zoom, monthNames],
  );

  // Build flat row list
  const rowItems = useMemo(
    () => buildRowItems(phases, milestones),
    [phases, milestones],
  );

  // buildRowItems already includes the "Milestones" header as a section row, so
  // the body height is simply one ROW_HEIGHT per row item.
  const totalBodyHeight = rowItems.length * ROW_HEIGHT;

  // Calculate "today" line position
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = daysBetween(timelineStartDate, today);
  const todayX = todayOffset * ppd;
  const showTodayLine =
    todayOffset >= 0 && todayOffset <= totalDays;

  // Task positions for dependency arrows
  const taskPositions = useMemo(() => {
    const map = new Map<string, TaskPosition>();
    rowItems.forEach((item, idx) => {
      if (item.task && (item.type === "task" || item.type === "milestone")) {
        const taskStart = new Date(item.task.start_date);
        const offsetD = daysBetween(timelineStartDate, taskStart);
        const x = offsetD * ppd;
        // Match GanttBar: width spans calendar days (start → end inclusive), not
        // the working-day duration, so dependency arrows land on the bar's end.
        const spanDays = Math.max(
          1,
          daysBetween(taskStart, new Date(item.task.end_date)) + 1,
        );
        const width = item.task.is_milestone
          ? 16
          : Math.max(spanDays * ppd, 4);
        map.set(item.id, {
          x,
          y: idx * ROW_HEIGHT + BAR_V_PADDING,
          width,
          height: ROW_HEIGHT - BAR_V_PADDING * 2,
        });
      }
    });
    return map;
  }, [rowItems, timelineStartDate, ppd]);

  // Row positions for baseline
  const rowPositions = useMemo(() => {
    const map = new Map<string, number>();
    rowItems.forEach((item, idx) => {
      if (item.task && (item.type === "task" || item.type === "milestone")) {
        map.set(item.id, idx * ROW_HEIGHT + BAR_V_PADDING);
      }
    });
    return map;
  }, [rowItems]);

  // Sync horizontal scroll between header and body
  const handleBodyScroll = useCallback(() => {
    if (bodyScrollRef.current && headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = bodyScrollRef.current.scrollLeft;
    }
    // Sync vertical scroll with task list
    if (bodyScrollRef.current && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = bodyScrollRef.current.scrollTop;
    }
  }, [scrollContainerRef]);

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  // Handle bar drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (readOnly || !onTaskUpdate) return;
      const { active, delta } = event;
      const data = active.data.current;
      if (!data || data.type !== "gantt-bar") return;

      const taskId = data.taskId as string;
      const daysDelta = Math.round(delta.x / ppd);
      if (daysDelta === 0) return;

      const task = tasks.find((tk) => tk.id === taskId);
      if (!task) return;

      const newStart = addDays(new Date(task.start_date), daysDelta);
      const newEnd = addDays(new Date(task.end_date), daysDelta);
      onTaskUpdate(taskId, {
        start_date: toIsoDateLocal(newStart),
        end_date: toIsoDateLocal(newEnd),
      });
    },
    [readOnly, onTaskUpdate, ppd, tasks],
  );

  const criticalSet = useMemo(() => new Set(criticalPath), [criticalPath]);
  const highlightedSet = useMemo(
    () => new Set(highlightedCriticalChain || []),
    [highlightedCriticalChain],
  );
  const hasHighlightedChain = highlightedSet.size > 0;

  // --- Dependency drag handlers ---

  const handleDependencyDragStart = useCallback(
    (taskId: string, side: "left" | "right") => {
      if (readOnly) return;
      setDepDrag({ fromTaskId: taskId, fromSide: side, mouseX: 0, mouseY: 0 });

      // Start tracking mouse globally
      const handleMouseMove = (e: MouseEvent) => {
        if (!bodyContainerRef.current) return;
        const rect = bodyContainerRef.current.getBoundingClientRect();
        setDepDrag((prev) =>
          prev ? { ...prev, mouseX: e.clientX - rect.left + (bodyScrollRef.current?.scrollLeft || 0), mouseY: e.clientY - rect.top + (bodyScrollRef.current?.scrollTop || 0) } : null,
        );
      };

      const handleMouseUp = () => {
        // If we end up here (not on a target), cancel
        setDepDrag(null);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [readOnly],
  );

  const handleDependencyDragEnd = useCallback(
    (targetTaskId: string | null) => {
      if (depDrag && targetTaskId && targetTaskId !== depDrag.fromTaskId && onDependencyCreate) {
        // Create dependency: from right = FS (predecessor -> successor)
        if (depDrag.fromSide === "right") {
          onDependencyCreate(depDrag.fromTaskId, targetTaskId);
        } else {
          // From left = reverse: targetTask is predecessor
          onDependencyCreate(targetTaskId, depDrag.fromTaskId);
        }
      }
      setDepDrag(null);
    },
    [depDrag, onDependencyCreate],
  );

  // Get the SVG start point for the temp dependency line
  const depDragStartPos = useMemo(() => {
    if (!depDrag) return null;
    const pos = taskPositions.get(depDrag.fromTaskId);
    if (!pos) return null;
    return {
      x: depDrag.fromSide === "right" ? pos.x + pos.width : pos.x,
      y: pos.y + pos.height / 2,
    };
  }, [depDrag, taskPositions]);

  return (
    <div className="flex flex-col h-full">
      {/* Timeline header (scrolls horizontally in sync) */}
      <div
        ref={headerScrollRef}
        className="overflow-hidden border-b border-[#27272A] bg-[#27272A] shrink-0"
        style={{ height: HEADER_HEIGHT }}
      >
        <div className="relative" style={{ width: totalWidth, height: HEADER_HEIGHT }}>
          {columns.map((col, i) => (
            <div
              key={i}
              className="absolute top-0 flex flex-col items-center justify-center border-r border-[#27272A] text-xs text-[#A1A1AA]"
              style={{
                left: col.x,
                width: col.width,
                height: HEADER_HEIGHT,
              }}
            >
              {col.subLabel && (
                <span className="text-[10px] text-[#A1A1AA] leading-none">
                  {col.subLabel}
                </span>
              )}
              <span className="font-medium">{col.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timeline body (scrolls both ways) */}
      <div
        ref={bodyScrollRef}
        className="flex-1 overflow-auto"
        onScroll={handleBodyScroll}
      >
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div
            ref={bodyContainerRef}
            className="relative"
            style={{
              width: totalWidth,
              height: totalBodyHeight,
              minHeight: "100%",
            }}
          >
            {/* Vertical grid lines */}
            {columns.map((col, i) => (
              <div
                key={`grid-${i}`}
                className={[
                  "absolute top-0 bottom-0 border-r",
                  col.isWeekend
                    ? "bg-[#27272A]/60 border-[#27272A]"
                    : "border-[#27272A]",
                ].join(" ")}
                style={{ left: col.x, width: col.width }}
              />
            ))}

            {/* Horizontal row lines */}
            {rowItems.map((_, idx) => (
              <div
                key={`row-${idx}`}
                className="absolute left-0 right-0 border-b border-[#27272A]"
                style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}
              />
            ))}

            {/* Today line */}
            {showTodayLine && (
              <div
                className="absolute top-0 bottom-0 w-[2px] bg-red-500 z-30 pointer-events-none"
                style={{ left: todayX }}
              >
                {/* Label at top of today line */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-b whitespace-nowrap shadow-sm">
                  {t("timeline.today")}
                </div>
              </div>
            )}

            {/* Baseline ghost bars (rendered behind actual bars) */}
            {showBaseline && baselineData && (
              <GanttBaseline
                baselineData={baselineData}
                tasks={tasks}
                pixelsPerDay={ppd}
                timelineStartDate={timelineStartDate}
                rowPositions={rowPositions}
                isVisible={true}
              />
            )}

            {/* Dependency arrows */}
            <GanttDependencyArrows
              dependencies={dependencies}
              taskPositions={taskPositions}
              criticalPath={criticalPath}
              totalWidth={totalWidth}
              totalHeight={totalBodyHeight}
              highlightedChain={highlightedCriticalChain}
            />

            {/* Temporary dependency drag line */}
            {depDrag && depDragStartPos && depDrag.mouseX > 0 && (
              <svg
                className="absolute inset-0 pointer-events-none overflow-visible"
                width={totalWidth}
                height={totalBodyHeight}
                style={{ zIndex: 40 }}
              >
                <line
                  x1={depDragStartPos.x}
                  y1={depDragStartPos.y}
                  x2={depDrag.mouseX}
                  y2={depDrag.mouseY}
                  stroke="#3B82F6"
                  strokeWidth={2}
                  strokeDasharray="6,3"
                />
                {/* Circle at start */}
                <circle
                  cx={depDragStartPos.x}
                  cy={depDragStartPos.y}
                  r={4}
                  fill="#3B82F6"
                />
                {/* Circle at cursor */}
                <circle
                  cx={depDrag.mouseX}
                  cy={depDrag.mouseY}
                  r={4}
                  fill="#3B82F6"
                  fillOpacity={0.5}
                />
              </svg>
            )}

            {/* Task bars */}
            {rowItems.map((item, idx) => {
              if (item.type === "task" && item.task) {
                const isInChain = highlightedSet.has(item.id);
                return (
                  <GanttBar
                    key={item.id}
                    task={item.task}
                    phaseColor={item.phaseColor ?? "#3B82F6"}
                    isCriticalPath={criticalSet.has(item.id)}
                    isSelected={selectedTaskId === item.id || (selectedTaskIds?.has(item.id) ?? false)}
                    pixelsPerDay={ppd}
                    timelineStartDate={timelineStartDate}
                    onSelect={() => onSelectTask(item.id)}
                    onResizeEnd={(newDuration) => {
                      if (onTaskUpdate) {
                        const newEnd = addDays(
                          new Date(item.task!.start_date),
                          newDuration,
                        );
                        onTaskUpdate(item.id, {
                          duration_days: newDuration,
                          end_date: toIsoDateLocal(newEnd),
                        });
                      }
                    }}
                    readOnly={readOnly}
                    rowIndex={idx}
                    onDependencyDragStart={handleDependencyDragStart}
                    onDependencyDragEnd={handleDependencyDragEnd}
                    isDependencyTarget={depDrag !== null && depDrag.fromTaskId !== item.id}
                    dimmed={hasHighlightedChain && !isInChain}
                    criticalGlow={hasHighlightedChain && isInChain}
                  />
                );
              }
              return null;
            })}

            {/* Milestones (rendered as SVG) -- pointer-events auto on children so clicks work */}
            <svg
              className="absolute inset-0 overflow-visible"
              width={totalWidth}
              height={totalBodyHeight}
              style={{ zIndex: 15, pointerEvents: "none" }}
            >
              {rowItems.map((item, idx) => {
                if (item.type === "milestone" && item.task) {
                  const msDate = new Date(item.task.start_date);
                  const msOffset = daysBetween(timelineStartDate, msDate);
                  const msX = msOffset * ppd;
                  return (
                    <GanttMilestone
                      key={item.id}
                      task={item.task}
                      x={msX}
                      rowIndex={idx}
                      isSelected={selectedTaskId === item.id || (selectedTaskIds?.has(item.id) ?? false)}
                      onSelect={() => onSelectTask(item.id)}
                    />
                  );
                }
                return null;
              })}
            </svg>
          </div>
        </DndContext>
      </div>
    </div>
  );
}
