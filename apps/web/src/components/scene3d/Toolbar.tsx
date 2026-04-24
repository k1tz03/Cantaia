/**
 * Toolbar — floating toolbar pinned bottom-center of the canvas. Groups:
 *   1. Measure modes (distance / surface)
 *   2. Section cut toggle
 *   3. Layers popover trigger (Dev B wires popover; UIX ships button only)
 *   4. Level nav (up / down)
 *   5. Export menu (PNG watermarked / glTF / PDF snapshot)
 */

"use client";

import { useTranslations } from "next-intl";
import {
  Ruler,
  Square,
  Scissors,
  Layers,
  ChevronUp,
  ChevronDown,
  Download,
  FileImage,
  FileBox,
  FileText,
} from "lucide-react";
import { useState } from "react";
import type { MeasureMode } from "./types";

interface ToolbarProps {
  measureMode: MeasureMode;
  onMeasureModeChange: (mode: MeasureMode) => void;
  sectionCutActive: boolean;
  onSectionCutToggle: () => void;
  onLayersClick: () => void;
  onLevelUp: () => void;
  onLevelDown: () => void;
  canLevelUp: boolean;
  canLevelDown: boolean;
  onExport: (format: "png" | "gltf" | "pdf") => void;
}

export function Toolbar({
  measureMode,
  onMeasureModeChange,
  sectionCutActive,
  onSectionCutToggle,
  onLayersClick,
  onLevelUp,
  onLevelDown,
  canLevelUp,
  canLevelDown,
  onExport,
}: ToolbarProps) {
  const t = useTranslations("scene3d");
  const [exportOpen, setExportOpen] = useState(false);

  const iconBtn =
    "inline-flex items-center justify-center w-9 h-9 rounded-md text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-[#27272A] transition-colors focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent";

  const activeBtn = "bg-[#F97316]/10 text-[#F97316] hover:bg-[#F97316]/15 hover:text-[#F97316]";

  return (
    <div
      role="toolbar"
      aria-label={t("toolbar.aria")}
      className="pointer-events-auto absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-lg border border-[#27272A] bg-[#18181B]/95 backdrop-blur-xl px-2 py-1.5 shadow-lg shadow-black/40"
    >
      {/* Measure group */}
      <div className="flex items-center" role="group" aria-label={t("toolbar.measureGroup")}>
        <button
          type="button"
          onClick={() =>
            onMeasureModeChange(measureMode === "distance" ? "none" : "distance")
          }
          aria-pressed={measureMode === "distance"}
          aria-label={t("toolbar.measureDistance")}
          title={t("toolbar.measureDistance")}
          className={`${iconBtn} ${measureMode === "distance" ? activeBtn : ""}`}
        >
          <Ruler className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() =>
            onMeasureModeChange(measureMode === "surface" ? "none" : "surface")
          }
          aria-pressed={measureMode === "surface"}
          aria-label={t("toolbar.measureSurface")}
          title={t("toolbar.measureSurface")}
          className={`${iconBtn} ${measureMode === "surface" ? activeBtn : ""}`}
        >
          <Square className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <span className="w-px h-6 bg-[#27272A] mx-1" aria-hidden="true" />

      {/* Section cut */}
      <button
        type="button"
        onClick={onSectionCutToggle}
        aria-pressed={sectionCutActive}
        aria-label={t("toolbar.sectionCut")}
        title={t("toolbar.sectionCut")}
        className={`${iconBtn} ${sectionCutActive ? activeBtn : ""}`}
      >
        <Scissors className="w-4 h-4" aria-hidden="true" />
      </button>

      {/* Layers */}
      <button
        type="button"
        onClick={onLayersClick}
        aria-label={t("toolbar.layers")}
        title={t("toolbar.layers")}
        className={iconBtn}
      >
        <Layers className="w-4 h-4" aria-hidden="true" />
      </button>

      <span className="w-px h-6 bg-[#27272A] mx-1" aria-hidden="true" />

      {/* Level nav */}
      <div className="flex items-center" role="group" aria-label={t("toolbar.levelGroup")}>
        <button
          type="button"
          onClick={onLevelUp}
          disabled={!canLevelUp}
          aria-label={t("toolbar.levelUp")}
          title={t("toolbar.levelUp")}
          className={iconBtn}
        >
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onLevelDown}
          disabled={!canLevelDown}
          aria-label={t("toolbar.levelDown")}
          title={t("toolbar.levelDown")}
          className={iconBtn}
        >
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <span className="w-px h-6 bg-[#27272A] mx-1" aria-hidden="true" />

      {/* Export */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setExportOpen((v) => !v)}
          aria-label={t("toolbar.export")}
          aria-expanded={exportOpen}
          aria-haspopup="menu"
          title={t("toolbar.export")}
          className={`${iconBtn} ${exportOpen ? activeBtn : ""}`}
        >
          <Download className="w-4 h-4" aria-hidden="true" />
        </button>
        {exportOpen && (
          <div
            role="menu"
            aria-label={t("toolbar.exportMenu")}
            className="absolute bottom-full right-0 mb-2 w-56 rounded-md border border-[#27272A] bg-[#18181B] shadow-lg shadow-black/40 py-1"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onExport("png");
                setExportOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FAFAFA] hover:bg-[#27272A] focus-visible:bg-[#27272A] focus-visible:outline-none"
            >
              <FileImage className="w-4 h-4 text-[#A1A1AA]" aria-hidden="true" />
              <span className="flex-1 text-left">{t("toolbar.exportPng")}</span>
              <span className="text-[10px] font-mono text-[#71717A]">
                {t("toolbar.watermarkedTag")}
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onExport("gltf");
                setExportOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FAFAFA] hover:bg-[#27272A] focus-visible:bg-[#27272A] focus-visible:outline-none"
            >
              <FileBox className="w-4 h-4 text-[#A1A1AA]" aria-hidden="true" />
              <span className="flex-1 text-left">{t("toolbar.exportGltf")}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onExport("pdf");
                setExportOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#FAFAFA] hover:bg-[#27272A] focus-visible:bg-[#27272A] focus-visible:outline-none"
            >
              <FileText className="w-4 h-4 text-[#A1A1AA]" aria-hidden="true" />
              <span className="flex-1 text-left">{t("toolbar.exportPdf")}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
