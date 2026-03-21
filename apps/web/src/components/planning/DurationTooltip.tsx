"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Calculator, Pencil } from "lucide-react";
import type { PlanningTask } from "./planning-types";

interface DurationTooltipProps {
  task: PlanningTask;
  position: { x: number; y: number };
  onEditDuration?: () => void;
}

export default function DurationTooltip({
  task,
  position,
  onEditDuration,
}: DurationTooltipProps) {
  const t = useTranslations("planning");

  const factors = task.adjustment_factors ?? {};
  const hasFactors = Object.keys(factors).length > 0;

  return (
    <div
      className="fixed z-[100] pointer-events-auto"
      style={{ left: position.x, top: position.y }}
    >
      <div className="bg-background rounded-lg shadow-xl border border-border p-3 w-72 text-sm">
        {/* Task name */}
        <div className="font-semibold text-foreground mb-2 truncate">
          {task.name}
        </div>

        {/* Quantity & ratio */}
        {task.quantity != null && task.unit && (
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Calculator className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span>
              {t("tooltip.quantity")}: {task.quantity} {task.unit}
            </span>
          </div>
        )}

        {task.productivity_ratio != null && (
          <div className="text-muted-foreground mb-1 pl-5">
            {t("tooltip.ratio")}: {task.productivity_ratio} {task.unit ?? ""}/
            {t("tooltip.day")}
            {task.productivity_source && (
              <span className="text-muted-foreground ml-1">
                ({task.productivity_source})
              </span>
            )}
          </div>
        )}

        {/* Base calculation */}
        {task.base_duration_days != null &&
          task.quantity != null &&
          task.productivity_ratio != null && (
            <div className="bg-muted rounded px-2 py-1.5 my-2 text-xs text-foreground font-mono">
              {task.quantity} {task.unit ?? ""} &divide;{" "}
              {task.productivity_ratio} &divide; {task.team_size}{" "}
              {t("tooltip.teams")} = {task.base_duration_days}{" "}
              {t("tooltip.baseDays")}
            </div>
          )}

        {/* Adjustment factors */}
        {hasFactors && (
          <div className="mb-2">
            <div className="text-xs text-muted-foreground font-medium mb-1">
              {t("tooltip.adjustments")}
            </div>
            <div className="space-y-0.5">
              {Object.entries(factors).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">{key}</span>
                  <span
                    className={
                      value > 1
                        ? "text-red-600 font-medium"
                        : value < 1
                          ? "text-green-600 font-medium"
                          : "text-muted-foreground"
                    }
                  >
                    &times;{value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Final duration */}
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <span className="font-medium text-foreground">
            {t("tooltip.finalDuration")}
          </span>
          <span className="font-bold text-foreground">
            {task.duration_days} {t("tooltip.days")}
          </span>
        </div>

        {/* Edit link */}
        {onEditDuration && (
          <button
            onClick={onEditDuration}
            className="flex items-center gap-1 mt-2 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Pencil className="h-3 w-3" />
            {t("tooltip.editDuration")}
          </button>
        )}
      </div>
    </div>
  );
}
