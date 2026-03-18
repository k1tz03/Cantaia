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

  return (
    <motion.g
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 20, delay: rowIndex * 0.03 }}
      style={{ transformOrigin: `${x}px ${cy}px` }}
      className="cursor-pointer"
      onClick={onSelect}
    >
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

      {/* Diamond shape */}
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

      {/* Pulse animation on critical milestones */}
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

      {/* Label */}
      <text
        x={x + DIAMOND_SIZE / 2 + 8}
        y={cy + 4}
        className="fill-gray-700 text-xs"
        style={{ fontSize: 11, fontFamily: "var(--font-sans)" }}
      >
        {task.name}
      </text>
    </motion.g>
  );
}
