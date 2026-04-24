/**
 * MeasureTool — placeholder for in-canvas measure interactions.
 * UIX ships the activation HUD; Dev B implements the R3F pointer capture,
 * snap targets, and readout rendering in the THREE scene graph.
 */

"use client";

import { useTranslations } from "next-intl";
import { Ruler, Square } from "lucide-react";
import type { MeasureMode } from "./types";

interface MeasureToolProps {
  mode: MeasureMode;
  onCancel: () => void;
  /** TODO: Dev B logic — measured value to display (mm / m² / etc.) */
  readout?: string | null;
}

export function MeasureTool({ mode, onCancel, readout }: MeasureToolProps) {
  const t = useTranslations("scene3d");

  if (mode === "none") return null;

  const Icon = mode === "distance" ? Ruler : Square;
  const modeKey = mode === "distance" ? "measureDistance" : "measureSurface";

  // TODO: Dev B logic — pointer events, snap detection, polyline/area drawing,
  // readout computation. This component only renders the HUD.

  return (
    <div className="pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-3 rounded-lg border border-[#F97316]/30 bg-[#18181B]/95 backdrop-blur-xl px-3 py-2 shadow-lg shadow-black/40">
      <Icon className="w-4 h-4 text-[#F97316] flex-shrink-0" aria-hidden="true" />
      <div className="flex flex-col">
        <span className="text-xs font-medium text-[#FAFAFA]">
          {t(`toolbar.${modeKey}`)}
        </span>
        <span className="text-[11px] text-[#A1A1AA]">{t("measure.hint")}</span>
      </div>
      {readout && (
        <span className="font-mono text-sm font-semibold text-[#F97316] px-2 py-1 bg-[#F97316]/10 rounded border border-[#F97316]/30">
          {readout}
        </span>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="ml-2 text-xs px-2 py-1 rounded-md bg-[#27272A] text-[#FAFAFA] hover:bg-[#3F3F46] focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:outline-none"
      >
        {t("measure.cancel")}
      </button>
    </div>
  );
}
