"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Calendar,
  AlertTriangle,
  Clock,
  Crosshair,
  Bookmark,
  Eye,
  EyeOff,
  RotateCcw,
} from "lucide-react";
import type { ZoomLevel, Planning } from "./planning-types";

interface GanttHeaderProps {
  planning: Planning;
  zoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
  criticalPathDays: number;
  totalDays: number;
  projectName?: string;
  children?: React.ReactNode; // action buttons (export, share, etc.)
  /** Critical path highlight toggle */
  isCriticalPathHighlighted?: boolean;
  onToggleCriticalPathHighlight?: () => void;
  /** Baseline controls */
  showBaseline?: boolean;
  hasBaseline?: boolean;
  onSaveBaseline?: () => void;
  onToggleBaseline?: () => void;
  onResetBaseline?: () => void;
  readOnly?: boolean;
}

function formatSwissDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export default function GanttHeader({
  planning,
  zoom,
  onZoomChange,
  criticalPathDays,
  totalDays,
  projectName,
  children,
  isCriticalPathHighlighted,
  onToggleCriticalPathHighlight,
  showBaseline,
  hasBaseline,
  onSaveBaseline,
  onToggleBaseline,
  onResetBaseline,
  readOnly,
}: GanttHeaderProps) {
  const t = useTranslations("planning");

  const criticalRatio = totalDays > 0 ? criticalPathDays / totalDays : 0;
  const isCriticalHigh = criticalRatio > 0.8;

  const zoomOptions: { value: ZoomLevel; label: string }[] = [
    { value: "day", label: t("header.zoomDay") },
    { value: "week", label: t("header.zoomWeek") },
    { value: "month", label: t("header.zoomMonth") },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
      {/* Title + project */}
      <div className="flex items-center gap-2 min-w-0 mr-auto">
        <Calendar className="h-5 w-5 text-blue-600 shrink-0" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 truncate">
            {planning.title}
          </h2>
          {projectName && (
            <p className="text-xs text-gray-500 truncate">{projectName}</p>
          )}
        </div>
      </div>

      {/* Zoom buttons */}
      <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5">
        {zoomOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onZoomChange(opt.value)}
            className={[
              "px-3 py-1 text-xs font-medium rounded-md transition-colors",
              zoom === opt.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700",
            ].join(" ")}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Duration badge */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 rounded-lg text-xs text-blue-700">
        <Clock className="h-3.5 w-3.5" />
        <span>
          {t("header.totalDuration")}: {totalDays} {t("header.days")}
          <span className="mx-1 text-blue-400">&middot;</span>
          {t("header.end")}: {formatSwissDate(planning.calculated_end_date)}
        </span>
      </div>

      {/* Critical path badge (clickable) */}
      {criticalPathDays > 0 && (
        <button
          onClick={onToggleCriticalPathHighlight}
          className={[
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
            isCriticalPathHighlighted
              ? "bg-red-100 text-red-800 ring-2 ring-red-300"
              : isCriticalHigh
                ? "bg-red-50 text-red-700 hover:bg-red-100"
                : "bg-gray-50 text-gray-600 hover:bg-gray-100",
          ].join(" ")}
          title={t("criticalPathHighlight")}
        >
          {isCriticalHigh || isCriticalPathHighlighted ? (
            <Crosshair className="h-3.5 w-3.5" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5" />
          )}
          <span>
            {t("header.criticalPath")}: {criticalPathDays} {t("header.days")}
          </span>
        </button>
      )}

      {/* Baseline controls */}
      {!readOnly && (
        <div className="flex items-center gap-1">
          {/* Save baseline */}
          <button
            onClick={onSaveBaseline}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            title={t("baseline.save")}
          >
            <Bookmark className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">{t("baseline.save")}</span>
          </button>

          {/* Toggle baseline visibility */}
          {hasBaseline && (
            <>
              <button
                onClick={onToggleBaseline}
                className={[
                  "flex items-center gap-1 px-2 py-1 text-xs border rounded-md transition-colors",
                  showBaseline
                    ? "text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100"
                    : "text-gray-600 border-gray-200 hover:bg-gray-50",
                ].join(" ")}
                title={showBaseline ? t("baseline.hide") : t("baseline.show")}
              >
                {showBaseline ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                <span className="hidden lg:inline">
                  {showBaseline ? t("baseline.hide") : t("baseline.show")}
                </span>
              </button>

              {/* Reset baseline */}
              <button
                onClick={onResetBaseline}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
                title={t("baseline.reset")}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      )}

      {/* Action buttons (children) */}
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
