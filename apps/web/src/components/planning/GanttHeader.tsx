"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Calendar, AlertTriangle, Clock } from "lucide-react";
import type { ZoomLevel, Planning } from "./planning-types";

interface GanttHeaderProps {
  planning: Planning;
  zoom: ZoomLevel;
  onZoomChange: (zoom: ZoomLevel) => void;
  criticalPathDays: number;
  totalDays: number;
  projectName?: string;
  children?: React.ReactNode; // action buttons (export, share, etc.)
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

      {/* Critical path badge */}
      {criticalPathDays > 0 && (
        <div
          className={[
            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium",
            isCriticalHigh
              ? "bg-red-50 text-red-700"
              : "bg-gray-50 text-gray-600",
          ].join(" ")}
        >
          {isCriticalHigh && <AlertTriangle className="h-3.5 w-3.5" />}
          <span>
            {t("header.criticalPath")}: {criticalPathDays} {t("header.days")}
          </span>
        </div>
      )}

      {/* Action buttons (children) */}
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
