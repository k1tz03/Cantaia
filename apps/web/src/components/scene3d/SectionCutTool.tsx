/**
 * SectionCutTool — contrôles du plan de coupe.
 *
 * Le HUD existait déjà ; ce qu'il pilotait n'existait pas. L'axe et
 * l'altitude sont désormais transmis à `SceneThreeLayer`, qui construit un
 * vrai `THREE.Plane` et l'applique à tous les matériaux via le clipping local
 * du renderer.
 *
 * Convention d'axes (documentée ici parce qu'elle n'est pas devinable) :
 *   - « Z » : coupe HORIZONTALE — on conserve ce qui est sous l'altitude
 *     réglée. C'est le plan de coupe de l'architecte.
 *   - « X » / « Y » : coupes VERTICALES le long des axes du monde.
 */

"use client";

import { useTranslations } from "next-intl";
import { Scissors } from "lucide-react";

type Axis = "x" | "y" | "z";

interface SectionCutToolProps {
  active: boolean;
  axis: Axis;
  elevation: number; // m
  onAxisChange: (axis: Axis) => void;
  onElevationChange: (v: number) => void;
  onClose: () => void;
  minElevation: number;
  maxElevation: number;
}

export function SectionCutTool({
  active,
  axis,
  elevation,
  onAxisChange,
  onElevationChange,
  onClose,
  minElevation,
  maxElevation,
}: SectionCutToolProps) {
  const t = useTranslations("scene3d");

  if (!active) return null;

  const axes: Array<{ key: Axis; label: string }> = [
    { key: "x", label: t("section.axisX") },
    { key: "y", label: t("section.axisY") },
    { key: "z", label: t("section.axisZ") },
  ];

  return (
    <div className="pointer-events-auto absolute top-4 right-4 w-60 rounded-lg border border-[#27272A] bg-[#18181B]/95 backdrop-blur-xl p-3 shadow-lg shadow-black/40">
      <header className="flex items-center justify-between mb-3">
        <div className="inline-flex items-center gap-2">
          <Scissors className="w-4 h-4 text-[#F97316]" aria-hidden="true" />
          <h4 className="font-display text-sm font-semibold text-[#FAFAFA]">
            {t("section.title")}
          </h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("section.close")}
          className="text-xs text-[#A1A1AA] hover:text-[#FAFAFA] focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:outline-none rounded"
        >
          {t("section.close")}
        </button>
      </header>

      <fieldset>
        <legend className="text-[11px] uppercase tracking-wider text-[#A1A1AA] mb-2">
          {t("section.axis")}
        </legend>
        <div className="grid grid-cols-3 gap-1" role="radiogroup">
          {axes.map(({ key, label }) => {
            const selected = axis === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onAxisChange(key)}
                className={`px-2 py-1.5 text-xs font-mono rounded-md border transition-colors focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:outline-none ${
                  selected
                    ? "bg-[#F97316]/10 border-[#F97316]/40 text-[#F97316]"
                    : "bg-[#0F0F11] border-[#27272A] text-[#A1A1AA] hover:border-[#3F3F46]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor="section-elev" className="text-[11px] uppercase tracking-wider text-[#A1A1AA]">
            {t("section.elevation")}
          </label>
          <span className="font-mono text-xs text-[#FAFAFA]">{elevation.toFixed(2)} m</span>
        </div>
        <input
          id="section-elev"
          type="range"
          min={minElevation}
          max={maxElevation}
          step={0.05}
          value={elevation}
          onChange={(e) => onElevationChange(Number(e.target.value))}
          className="w-full accent-[#F97316] focus-visible:outline-none"
        />
      </div>
    </div>
  );
}
