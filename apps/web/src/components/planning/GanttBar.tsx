"use client";

import React, { useState, useRef, useCallback } from "react";
import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import type { PlanningTask } from "./planning-types";
import { ROW_HEIGHT, BAR_V_PADDING } from "./planning-types";
import DurationTooltip from "./DurationTooltip";

interface GanttBarProps {
  task: PlanningTask;
  phaseColor: string;
  isCriticalPath: boolean;
  isSelected: boolean;
  pixelsPerDay: number;
  timelineStartDate: Date;
  onSelect: () => void;
  onResizeEnd: (newDuration: number) => void;
  readOnly?: boolean;
  rowIndex: number;
  /** Dependency drag — called when user starts dragging from a connection point */
  onDependencyDragStart?: (taskId: string, side: "left" | "right") => void;
  /** Dependency drag — called when user finishes dragging (null = cancelled) */
  onDependencyDragEnd?: (targetTaskId: string | null) => void;
  /** True when another bar is being dragged and this bar is a valid drop target */
  isDependencyTarget?: boolean;
  /** Critical path chain highlighting — dim when chain is active but task is not in it */
  dimmed?: boolean;
  /** Critical path chain highlighting — glow when task is part of highlighted chain */
  criticalGlow?: boolean;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

/** Darken a hex color by a given amount (0-1) */
function darkenColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0x00ff) - Math.round(255 * amount));
  const b = Math.max(0, (num & 0x0000ff) - Math.round(255 * amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export default function GanttBar({
  task,
  phaseColor,
  isCriticalPath,
  isSelected,
  pixelsPerDay,
  timelineStartDate,
  onSelect,
  onResizeEnd,
  readOnly,
  rowIndex,
  onDependencyDragStart,
  onDependencyDragEnd,
  isDependencyTarget,
  dimmed,
  criticalGlow,
}: GanttBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDelta, setResizeDelta] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [showConnectionPoints, setShowConnectionPoints] = useState(false);

  // Position calculation
  const taskStart = new Date(task.start_date);
  const offsetDays = daysBetween(timelineStartDate, taskStart);
  const barX = offsetDays * pixelsPerDay;
  // Width spans CALENDAR days (start → end inclusive), matching the calendar-day
  // timeline axis. duration_days is WORKING days, so using it here made a bar
  // visually stop several days before its own end_date. duration_days stays the
  // value shown/edited in the panels.
  const taskEnd = new Date(task.end_date);
  const spanDays = Math.max(1, daysBetween(taskStart, taskEnd) + 1);
  const rawWidth = spanDays * pixelsPerDay;
  // Minimum 4px so bars are always visible; if label would show, ensure at least 20px
  const barWidth = Math.max(rawWidth, 4);
  const barHeight = ROW_HEIGHT - BAR_V_PADDING * 2;
  const barY = rowIndex * ROW_HEIGHT + BAR_V_PADDING;
  // Only show label inside the bar if wide enough (100px+)
  const showLabelInside = barWidth >= 100;

  // dnd-kit draggable
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `bar-${task.id}`,
      data: { type: "gantt-bar", taskId: task.id, barX, pixelsPerDay },
      disabled: readOnly || isResizing,
    });

  // Transform from drag
  const dragOffsetX = transform?.x ?? 0;

  // Resize handlers
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      if (readOnly) return;
      e.stopPropagation();
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;

      const handleMove = (me: PointerEvent) => {
        const delta = me.clientX - startX;
        setResizeDelta(delta);
      };

      const handleUp = (ue: PointerEvent) => {
        const delta = ue.clientX - startX;
        const daysDelta = Math.round(delta / pixelsPerDay);
        const newDuration = Math.max(1, task.duration_days + daysDelta);
        setIsResizing(false);
        setResizeDelta(0);
        onResizeEnd(newDuration);
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
    },
    [readOnly, pixelsPerDay, task.duration_days, onResizeEnd],
  );

  // Connection point drag start (for dependency creation)
  const handleConnectionPointerDown = useCallback(
    (e: React.PointerEvent, side: "left" | "right") => {
      if (readOnly) return;
      e.stopPropagation();
      e.preventDefault();
      onDependencyDragStart?.(task.id, side);
    },
    [readOnly, task.id, onDependencyDragStart],
  );

  // Handle drag end (called from parent DndContext)
  // Note: actual drag end is handled in GanttTimeline via DndContext onDragEnd

  // Tooltip handlers
  const handleMouseEnter = useCallback(
    (_e: React.MouseEvent) => { // eslint-disable-line @typescript-eslint/no-unused-vars
      if (isDragging || isResizing) return;
      const rect = barRef.current?.getBoundingClientRect();
      if (rect) {
        setTooltipPos({
          x: rect.left + rect.width / 2 - 144, // center tooltip (w-72 = 288/2)
          y: rect.bottom + 8,
        });
      }
      setShowTooltip(true);
      setShowConnectionPoints(true);
    },
    [isDragging, isResizing],
  );

  const handleMouseLeave = useCallback(() => {
    setShowTooltip(false);
    setShowConnectionPoints(false);
  }, []);

  // Handle mouse up on connection point — used as drop target for dependency drag
  const handleConnectionMouseUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDependencyDragEnd?.(task.id);
    },
    [task.id, onDependencyDragEnd],
  );

  const effectiveWidth = Math.max(barWidth + resizeDelta, 4);
  const progressWidth =
    task.progress > 0 ? effectiveWidth * (task.progress / 100) : 0;

  // Real execution overlay (migration 094). Offsets are relative to the bar,
  // so a lot that started late renders to the right of the planned bar and a
  // lot that started early spills to its left — the drift is the point.
  const actualStart = task.actual_start_date
    ? new Date(task.actual_start_date)
    : null;
  const actualEnd = task.actual_end_date ? new Date(task.actual_end_date) : null;
  const actualLeft = actualStart
    ? daysBetween(timelineStartDate, actualStart) * pixelsPerDay - barX
    : 0;
  const actualWidth = actualStart
    ? Math.max(
        ((actualEnd ? daysBetween(actualStart, actualEnd) : 0) + 1) *
          pixelsPerDay,
        3,
      )
    : 0;

  return (
    <>
      <motion.div
        ref={(node) => {
          // Merge refs: dnd-kit + local
          setNodeRef(node);
          (barRef as React.MutableRefObject<HTMLDivElement | null>).current =
            node;
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: dimmed ? 0.4 : 1 }}
        transition={{
          type: "spring",
          stiffness: 300,
          damping: 25,
          delay: rowIndex * 0.02,
        }}
        style={{
          position: "absolute",
          left: barX + dragOffsetX,
          top: barY,
          width: effectiveWidth,
          minWidth: 4,
          height: barHeight,
          transformOrigin: "left center",
          zIndex: isDragging ? 50 : isSelected ? 10 : 1,
        }}
        className={[
          "rounded-md cursor-pointer select-none group/bar",
          isDragging ? "opacity-80 shadow-lg" : "",
          isSelected ? "ring-2 ring-blue-500 ring-offset-1" : "",
          isDependencyTarget ? "ring-2 ring-green-500 ring-offset-1" : "",
          criticalGlow ? "shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={onSelect}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...(readOnly ? {} : { ...attributes, ...listeners })}
      >
        {/* Critical path left border */}
        {isCriticalPath && (
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-red-500 rounded-l-md" />
        )}

        {/* Background bar */}
        <div
          className="absolute inset-0 rounded-md"
          style={{ backgroundColor: phaseColor, opacity: 0.3 }}
        />

        {/* Progress fill */}
        {progressWidth > 0 && (
          <div
            className="absolute left-0 top-0 bottom-0 rounded-l-md"
            style={{
              width: progressWidth,
              backgroundColor: darkenColor(phaseColor, 0.1),
              opacity: 0.7,
              borderRadius:
                progressWidth >= effectiveWidth
                  ? "0.375rem"
                  : "0.375rem 0 0 0.375rem",
            }}
          />
        )}

        {/* Real execution liseré — sits on top of the planned bar */}
        {actualStart && (
          <div
            className="absolute rounded-full pointer-events-none"
            title={`${task.actual_start_date}${
              task.actual_end_date ? ` → ${task.actual_end_date}` : ""
            }`}
            style={{
              left: actualLeft,
              width: actualWidth,
              top: -3,
              height: 3,
              backgroundColor: "#FAFAFA",
              opacity: 0.85,
            }}
          />
        )}

        {/* Task name inside bar -- only when bar is wide enough */}
        {showLabelInside && (
          <div
            className="absolute inset-0 flex items-center px-2 text-xs font-medium overflow-hidden whitespace-nowrap text-ellipsis"
            style={{ color: darkenColor(phaseColor, 0.35) }}
          >
            <span className="truncate">{task.name}</span>
          </div>
        )}

        {/* Assigned supplier, parked just after the bar */}
        {task.supplier_name && !dimmed && (
          <span
            className="absolute top-1/2 -translate-y-1/2 text-[10px] text-[#A1A1AA] whitespace-nowrap pointer-events-none"
            style={{ left: effectiveWidth + 6 }}
          >
            {task.supplier_name}
          </span>
        )}

        {/* Resize handle (right edge) */}
        {!readOnly && (
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover/bar:opacity-100 transition-opacity"
            style={{ backgroundColor: darkenColor(phaseColor, 0.2) }}
            onPointerDown={handleResizeStart}
          />
        )}

        {/* Connection points for dependency creation */}
        {(showConnectionPoints || isDependencyTarget) && !readOnly && (
          <>
            {/* Left connection point */}
            <div
              className="absolute left-[-6px] top-1/2 -translate-y-1/2 w-[12px] h-[12px] rounded-full bg-[#0F0F11] border-2 border-muted-foreground hover:border-blue-500 hover:bg-[#F97316]/10 transition-colors z-10 cursor-crosshair"
              onPointerDown={(e) => handleConnectionPointerDown(e, "left")}
              onMouseUp={handleConnectionMouseUp}
            >
              <div className="absolute inset-[-4px]" />
            </div>
            {/* Right connection point */}
            <div
              className="absolute right-[-6px] top-1/2 -translate-y-1/2 w-[12px] h-[12px] rounded-full bg-[#0F0F11] border-2 border-muted-foreground hover:border-blue-500 hover:bg-[#F97316]/10 transition-colors z-10 cursor-crosshair"
              onPointerDown={(e) => handleConnectionPointerDown(e, "right")}
              onMouseUp={handleConnectionMouseUp}
            >
              <div className="absolute inset-[-4px]" />
            </div>
          </>
        )}
      </motion.div>

      {/* Tooltip — read-only breakdown. Editing happens in the side panel and the
          task list, so no edit affordance is offered here (the old one was a no-op). */}
      {showTooltip && !isDragging && !isResizing && (
        <DurationTooltip task={task} position={tooltipPos} />
      )}
    </>
  );
}
