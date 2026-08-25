/**
 * MeasureTool — HUD de l'outil de mesure de distance.
 *
 * Ce composant n'était qu'une coquille : il affichait une aide et un bouton
 * « Annuler », aucune mesure n'était jamais calculée, et un second mode
 * « surface » promettait un calcul d'aire dont aucune ligne n'existait.
 *
 * La mesure de distance est maintenant RÉELLE : la saisie des deux points se
 * fait par lancer de rayon sur le plan du niveau actif (cf.
 * `SceneThreeLayer.MeasureLayer`), la distance planimétrique est calculée par
 * SceneViewer et affichée ici. Le mode « surface » a été retiré plutôt que
 * laissé en décor.
 *
 * L'avertissement de non-contractualité accompagne la valeur : une mesure
 * prise sur une reconstruction IA n'est pas un relevé.
 */

"use client";

import { useTranslations } from "next-intl";
import { Ruler } from "lucide-react";
import type { MeasureMode } from "./types";

interface MeasureToolProps {
  mode: MeasureMode;
  /** Nombre de points déjà posés (0, 1 ou 2). */
  pointCount: number;
  /** Distance formatée, ou `null` tant que les deux points ne sont pas posés. */
  readout: string | null;
  onReset: () => void;
  onCancel: () => void;
}

export function MeasureTool({ mode, pointCount, readout, onReset, onCancel }: MeasureToolProps) {
  const t = useTranslations("scene3d");

  if (mode === "none") return null;

  return (
    <div className="pointer-events-auto absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-[#F97316]/30 bg-[#18181B]/95 px-3 py-2 shadow-lg shadow-black/40 backdrop-blur-xl">
      <Ruler className="h-4 w-4 flex-shrink-0 text-[#F97316]" aria-hidden="true" />

      <div className="flex flex-col">
        <span className="text-xs font-medium text-[#FAFAFA]">
          {t("toolbar.measureDistance")}
        </span>
        <span className="text-[11px] text-[#A1A1AA]">
          {readout ? t("measure.indicative") : t("measure.hint")}
        </span>
      </div>

      <span className="font-mono text-[10px] text-[#A1A1AA]" aria-live="polite">
        {t("measure.points", { count: Math.min(pointCount, 2) })}
      </span>

      {readout && (
        <span
          className="rounded border border-[#F97316]/30 bg-[#F97316]/10 px-2 py-1 font-mono text-sm font-semibold text-[#F97316]"
          aria-live="polite"
        >
          {readout}
        </span>
      )}

      {pointCount > 0 && (
        <button
          type="button"
          onClick={onReset}
          className="rounded-md bg-[#27272A] px-2 py-1 text-xs text-[#FAFAFA] hover:bg-[#3F3F46] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
        >
          {t("measure.reset")}
        </button>
      )}

      <button
        type="button"
        onClick={onCancel}
        className="ml-1 rounded-md bg-[#27272A] px-2 py-1 text-xs text-[#FAFAFA] hover:bg-[#3F3F46] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
      >
        {t("measure.cancel")}
      </button>
    </div>
  );
}
