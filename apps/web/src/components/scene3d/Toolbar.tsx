/**
 * Toolbar — barre flottante ancrée en bas du canvas. Groupes :
 *   1. Mesure de distance
 *   2. Coupe de section
 *   3. Navigation entre niveaux
 *   4. Export (PNG filigrané / glTF / PDF)
 *
 * ── Deux boutons retirés ──────────────────────────────────────────────────
 *   - « Mesurer une surface » : aucun calcul d'aire n'existait derrière. Un
 *     bouton qui ne fait rien est pire qu'un bouton absent — il fait douter
 *     de tout le reste de l'outil. Il reviendra avec le calcul.
 *   - « Calques » : son `onClick` portait un TODO vide. Les calques sont
 *     pilotés par le panneau de gauche, qui est toujours visible.
 *
 * Les trois exports fonctionnent réellement (cf. `scene-export.ts`).
 */

"use client";

import { useTranslations } from "next-intl";
import {
  Ruler,
  Scissors,
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
      {/* Mesure de distance */}
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
              <span className="text-[10px] font-mono text-[#A1A1AA]">
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
