"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import type { PlanningTask } from "./planning-types";
import { ROW_HEIGHT, BAR_V_PADDING } from "./planning-types";

interface GanttBaselineProps {
  baselineData: Record<string, { start_date: string; end_date: string; duration_days: number }>;
  tasks: PlanningTask[];
  pixelsPerDay: number;
  timelineStartDate: Date;
  rowPositions: Map<string, number>; // taskId -> y position (top of bar area)
  isVisible: boolean;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

const BASELINE_HEIGHT = 6;
const BASELINE_OFFSET = 20; // offset below bar center

export default function GanttBaseline({
  baselineData,
  tasks,
  pixelsPerDay,
  timelineStartDate,
  rowPositions,
  isVisible,
}: GanttBaselineProps) {
  const bars = useMemo(() => {
    if (!isVisible || !baselineData) return [];

    return tasks
      .filter((task) => !task.is_milestone && baselineData[task.id])
      .map((task) => {
        const baseline = baselineData[task.id];
        const rowY = rowPositions.get(task.id);
        if (rowY === undefined) return null;

        const barHeight = ROW_HEIGHT - BAR_V_PADDING * 2;

        // Baseline bar position
        const blStart = new Date(baseline.start_date);
        const blEnd = new Date(baseline.end_date);
        const blOffsetDays = daysBetween(timelineStartDate, blStart);
        const blDurationDays = daysBetween(blStart, blEnd);
        const blX = blOffsetDays * pixelsPerDay;
        const blWidth = Math.max(blDurationDays * pixelsPerDay, 4);
        const blY = rowY + barHeight / 2 + BASELINE_OFFSET - BASELINE_HEIGHT / 2;

        // Actual bar end for delay detection
        const actualEnd = new Date(task.end_date);
        const actualEndDays = daysBetween(timelineStartDate, actualEnd);
        const blEndDays = daysBetween(timelineStartDate, blEnd);

        // Delay zone: if actual END exceeds baseline END
        const hasDelay = actualEndDays > blEndDays;
        const delayStartX = blEndDays * pixelsPerDay;
        const delayWidth = hasDelay ? (actualEndDays - blEndDays) * pixelsPerDay : 0;

        return {
          taskId: task.id,
          blX,
          blY,
          blWidth,
          hasDelay,
          delayStartX,
          delayWidth,
        };
      })
      .filter(Boolean);
  }, [baselineData, tasks, pixelsPerDay, timelineStartDate, rowPositions, isVisible]);

  if (!isVisible || bars.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
      {bars.map((bar) => {
        if (!bar) return null;
        return (
          <React.Fragment key={`baseline-${bar.taskId}`}>
            {/* Baseline ghost bar */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
              className="absolute bg-muted-foreground/30 rounded-full"
              style={{
                left: bar.blX,
                top: bar.blY,
                width: bar.blWidth,
                height: BASELINE_HEIGHT,
                transformOrigin: "left center",
              }}
            />
            {/* Delay indicator (red zone) */}
            {bar.hasDelay && bar.delayWidth > 0 && (
              <motion.div
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.2 }}
                className="absolute bg-red-200 rounded-full"
                style={{
                  left: bar.delayStartX,
                  top: bar.blY,
                  width: bar.delayWidth,
                  height: BASELINE_HEIGHT,
                  transformOrigin: "left center",
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
