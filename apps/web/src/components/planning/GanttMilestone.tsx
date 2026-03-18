"use client";

import React from "react";
import { motion } from "framer-motion";
import type { PlanningTask } from "./planning-types";
import { ROW_HEIGHT } from "./planning-types";

interface GanttMilestoneProps {
  task: PlanningTask;
  x: number;
  rowIndex: number;
  isSelected: boolean;
  onSelect: () => void;
}

const DIAMOND_SIZE = 16;

export default function GanttMilestone({
  task,
  x,
  rowIndex,
  isSelected,
  onSelect,
}: GanttMilestoneProps) {
  const cy = rowIndex * ROW_HEIGHT + ROW_HEIGHT / 2;

  // Guard against invalid positions
  if (!isFinite(x) || !isFinite(cy)) return null;

  return (
    <motion.g
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 20, delay: Math.min(rowIndex * 0.03, 0.5) }}
      style={{ transformOrigin: `${x}px ${cy}px`, pointerEvents: "auto" }}
      className="cursor-pointer"
      onClick={onSelect}
    >
      {/* Invisible hit area for easier clicking */}
      <rect
        x={x - DIAMOND_SIZE}
        y={cy - DIAMOND_SIZE}
        width={DIAMOND_SIZE * 2}
        height={DIAMOND_SIZE * 2}
        fill="transparent"
      />

      {/* Selected ring */}
      {isSelected && (
        <rect
          x={x - DIAMOND_SIZE / 2 - 3}
          y={cy - DIAMOND_SIZE / 2 - 3}
          width={DIAMOND_SIZE + 6}
          height={DIAMOND_SIZE + 6}
          rx={3}
          fill="none"
          stroke="#3B82F6"
          strokeWidth={2}
          transform={`rotate(45, ${x}, ${cy})`}
        />
      )}

      {/* Diamond shape — 16x16px minimum, amber fill */}
      <rect
        x={x - DIAMOND_SIZE / 2}
        y={cy - DIAMOND_SIZE / 2}
        width={DIAMOND_SIZE}
        height={DIAMOND_SIZE}
        rx={2}
        transform={`rotate(45, ${x}, ${cy})`}
        fill="#F59E0B"
        stroke="#FFFFFF"
        strokeWidth={2}
      />

      {/* Pulse animation */}
      <motion.rect
        x={x - DIAMOND_SIZE / 2}
        y={cy - DIAMOND_SIZE / 2}
        width={DIAMOND_SIZE}
        height={DIAMOND_SIZE}
        rx={2}
        transform={`rotate(45, ${x}, ${cy})`}
        fill="none"
        stroke="#F59E0B"
        strokeWidth={1}
        animate={{ opacity: [0.6, 0], scale: [1, 1.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        style={{ transformOrigin: `${x}px ${cy}px` }}
      />

      {/* Label to the right of diamond */}
      <text
        x={x + DIAMOND_SIZE / 2 + 8}
        y={cy + 4}
        className="fill-gray-700"
        style={{ fontSize: 11, fontFamily: "var(--font-sans)", fontWeight: 500 }}
      >
        {task.name}
      </text>
    </motion.g>
  );
}
