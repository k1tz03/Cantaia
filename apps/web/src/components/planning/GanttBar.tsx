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
  onDragEnd: (newStartDate: Date) => void;
  onResizeEnd: (newDuration: number) => void;
  readOnly?: boolean;
  rowIndex: number;
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
  onDragEnd: _onDragEnd,
  onResizeEnd,
  readOnly,
  rowIndex,
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
  const rawWidth = task.duration_days * pixelsPerDay;
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

  // Handle drag end (called from parent DndContext)
  // Note: actual drag end is handled in GanttTimeline via DndContext onDragEnd

  // Tooltip handlers
  const handleMouseEnter = useCallback(
    (_e: React.MouseEvent) => {
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

  const effectiveWidth = Math.max(barWidth + resizeDelta, 4);
  const progressWidth =
    task.progress > 0 ? effectiveWidth * (task.progress / 100) : 0;

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
        animate={{ scaleX: 1, opacity: 1 }}
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

        {/* Task name inside bar — only when bar is wide enough */}
        {showLabelInside && (
          <div
            className="absolute inset-0 flex items-center px-2 text-xs font-medium overflow-hidden whitespace-nowrap text-ellipsis"
            style={{ color: darkenColor(phaseColor, 0.35) }}
          >
            <span className="truncate">{task.name}</span>
          </div>
        )}

        {/* Resize handle (right edge) */}
        {!readOnly && (
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize opacity-0 group-hover/bar:opacity-100 transition-opacity"
            style={{ backgroundColor: darkenColor(phaseColor, 0.2) }}
            onPointerDown={handleResizeStart}
          />
        )}

        {/* Connection points */}
        {showConnectionPoints && !readOnly && (
          <>
            {/* Left connection point */}
            <div className="absolute left-[-5px] top-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full bg-white border-2 border-gray-400 hover:border-blue-500 hover:bg-blue-50 transition-colors z-10" />
            {/* Right connection point */}
            <div className="absolute right-[-5px] top-1/2 -translate-y-1/2 w-[10px] h-[10px] rounded-full bg-white border-2 border-gray-400 hover:border-blue-500 hover:bg-blue-50 transition-colors z-10" />
          </>
        )}
      </motion.div>

      {/* Tooltip */}
      {showTooltip && !isDragging && !isResizing && (
        <DurationTooltip
          task={task}
          position={tooltipPos}
          onEditDuration={readOnly ? undefined : () => {}}
        />
      )}
    </>
  );
}
