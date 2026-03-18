"use client";

import React from "react";
import type { PlanningDependency, TaskPosition } from "./planning-types";
// ROW_HEIGHT available from planning-types if needed

interface GanttDependencyArrowsProps {
  dependencies: PlanningDependency[];
  taskPositions: Map<string, TaskPosition>;
  criticalPath: string[];
}

/** Build a smooth bezier path from predecessor end to successor start (FS dependency) */
function buildArrowPath(
  dep: PlanningDependency,
  from: TaskPosition,
  to: TaskPosition,
): string {
  let x1: number, y1: number, x2: number, y2: number;

  switch (dep.dependency_type) {
    case "FS":
      x1 = from.x + from.width;
      y1 = from.y + from.height / 2;
      x2 = to.x;
      y2 = to.y + to.height / 2;
      break;
    case "SS":
      x1 = from.x;
      y1 = from.y + from.height / 2;
      x2 = to.x;
      y2 = to.y + to.height / 2;
      break;
    case "FF":
      x1 = from.x + from.width;
      y1 = from.y + from.height / 2;
      x2 = to.x + to.width;
      y2 = to.y + to.height / 2;
      break;
    case "SF":
      x1 = from.x;
      y1 = from.y + from.height / 2;
      x2 = to.x + to.width;
      y2 = to.y + to.height / 2;
      break;
    default:
      x1 = from.x + from.width;
      y1 = from.y + from.height / 2;
      x2 = to.x;
      y2 = to.y + to.height / 2;
  }

  // Horizontal distance determines control point spread
  const dx = x2 - x1;
  const midX = dx > 0 ? dx * 0.4 : 20;

  return `M ${x1} ${y1} C ${x1 + midX} ${y1}, ${x2 - midX} ${y2}, ${x2} ${y2}`;
}

/** Build a small arrowhead at the end point */
function buildArrowhead(
  dep: PlanningDependency,
  to: TaskPosition,
): string {
  let x: number, y: number;
  let dx: number;

  switch (dep.dependency_type) {
    case "FF":
    case "SF":
      x = to.x + to.width;
      y = to.y + to.height / 2;
      dx = 1; // arrow pointing right
      break;
    default:
      x = to.x;
      y = to.y + to.height / 2;
      dx = -1; // arrow pointing left (into the bar)
      break;
  }

  const size = 5;
  // For FS/SS the arrow points right toward the bar, so triangle opens left
  // For FF/SF the arrow points left away
  return `M ${x} ${y} L ${x - size * dx} ${y - size} L ${x - size * dx} ${y + size} Z`;
}

export default function GanttDependencyArrows({
  dependencies,
  taskPositions,
  criticalPath,
}: GanttDependencyArrowsProps) {
  const criticalSet = new Set(criticalPath);

  return (
    <svg className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: 5 }}>
      <defs>
        {/* Arrowhead marker for non-critical */}
        <marker
          id="arrow-gray"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M 0 0 L 8 4 L 0 8 Z" fill="#9CA3AF" />
        </marker>
        {/* Arrowhead marker for critical */}
        <marker
          id="arrow-red"
          markerWidth="8"
          markerHeight="8"
          refX="6"
          refY="4"
          orient="auto"
        >
          <path d="M 0 0 L 8 4 L 0 8 Z" fill="#EF4444" />
        </marker>
      </defs>

      {dependencies.map((dep) => {
        const fromPos = taskPositions.get(dep.predecessor_id);
        const toPos = taskPositions.get(dep.successor_id);
        if (!fromPos || !toPos) return null;

        const isCritical =
          criticalSet.has(dep.predecessor_id) &&
          criticalSet.has(dep.successor_id);

        const pathD = buildArrowPath(dep, fromPos, toPos);
        const arrowD = buildArrowhead(dep, toPos);

        return (
          <g key={dep.id}>
            {/* Arrow path */}
            <path
              d={pathD}
              fill="none"
              stroke={isCritical ? "#EF4444" : "#9CA3AF"}
              strokeWidth={isCritical ? 2 : 1.5}
              strokeDasharray={dep.source === "auto" ? "6,3" : undefined}
              markerEnd={`url(#arrow-${isCritical ? "red" : "gray"})`}
            />
            {/* Arrowhead fill */}
            <path
              d={arrowD}
              fill={isCritical ? "#EF4444" : "#9CA3AF"}
            />
          </g>
        );
      })}
    </svg>
  );
}
