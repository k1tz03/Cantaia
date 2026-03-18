"use client";

import React, { useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Layers,
  ListPlus,
  Diamond,
  MousePointer2,
  Undo2,
  Redo2,
  Clock,
} from "lucide-react";

// ─── Props ───────────────────────────────────────────────────────────────────

interface GanttToolbarProps {
  onAddPhase: () => void;
  onAddTask: () => void;
  onAddMilestone: () => void;
  isSelectionMode: boolean;
  onToggleSelectionMode: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  totalDuration: number;
  endDate: string | null;
  readOnly?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSwissDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GanttToolbar({
  onAddPhase,
  onAddTask,
  onAddMilestone,
  isSelectionMode,
  onToggleSelectionMode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  totalDuration,
  endDate,
  readOnly,
}: GanttToolbarProps) {
  const t = useTranslations("planning");

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (readOnly) return;
      // Don't intercept when user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) onUndo();
      } else if (isCtrl && (e.key === "y" || (e.key === "z" && e.shiftKey))) {
        e.preventDefault();
        if (canRedo) onRedo();
      } else if (isCtrl && e.shiftKey && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        onAddPhase();
      } else if (isCtrl && e.shiftKey && (e.key === "T" || e.key === "t")) {
        e.preventDefault();
        onAddTask();
      }
    },
    [readOnly, canUndo, canRedo, onUndo, onRedo, onAddPhase, onAddTask],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  if (readOnly) return null;

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 bg-gray-50/50">
      {/* Add buttons */}
      <button
        type="button"
        onClick={onAddPhase}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 rounded-md hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all"
        title="Ctrl+Shift+P"
      >
        <Layers className="h-3.5 w-3.5 text-violet-500" />
        {t("toolbar.addPhase")}
      </button>

      <button
        type="button"
        onClick={onAddTask}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 rounded-md hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all"
        title="Ctrl+Shift+T"
      >
        <ListPlus className="h-3.5 w-3.5 text-blue-500" />
        {t("toolbar.addTask")}
      </button>

      <button
        type="button"
        onClick={onAddMilestone}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-700 rounded-md hover:bg-white hover:shadow-sm border border-transparent hover:border-gray-200 transition-all"
      >
        <Diamond className="h-3.5 w-3.5 text-amber-500" />
        {t("toolbar.addMilestone")}
      </button>

      <button
        type="button"
        onClick={onToggleSelectionMode}
        className={[
          "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all border",
          isSelectionMode
            ? "bg-blue-50 text-blue-700 border-blue-200"
            : "text-gray-700 border-transparent hover:bg-white hover:shadow-sm hover:border-gray-200",
        ].join(" ")}
      >
        <MousePointer2 className="h-3.5 w-3.5" />
        {t("toolbar.selectionMode")}
      </button>

      {/* Separator */}
      <div className="h-5 w-px bg-gray-200 mx-1" />

      {/* Undo/Redo */}
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        className={[
          "flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all border border-transparent",
          canUndo
            ? "text-gray-700 hover:bg-white hover:shadow-sm hover:border-gray-200"
            : "text-gray-300 cursor-not-allowed",
        ].join(" ")}
        title="Ctrl+Z"
      >
        <Undo2 className="h-3.5 w-3.5" />
        {t("toolbar.undo")}
      </button>

      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        className={[
          "flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all border border-transparent",
          canRedo
            ? "text-gray-700 hover:bg-white hover:shadow-sm hover:border-gray-200"
            : "text-gray-300 cursor-not-allowed",
        ].join(" ")}
        title="Ctrl+Y"
      >
        <Redo2 className="h-3.5 w-3.5" />
        {t("toolbar.redo")}
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Duration info */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <Clock className="h-3.5 w-3.5" />
        <span>
          {t("header.totalDuration")}: {totalDuration}{t("taskList.daysShort")}
          {endDate && (
            <>
              <span className="mx-1 text-gray-300">&middot;</span>
              {t("header.end")}: {formatSwissDate(endDate)}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
