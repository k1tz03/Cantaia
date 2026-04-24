/**
 * LeftPanel — 280px sidebar for the 3D viewer: level navigation, layer toggles
 * (walls / slabs / openings / structure / annotations), and confidence filters.
 * All interactions are state-only here; parent (SceneViewer) owns the state.
 */

"use client";

import { useTranslations } from "next-intl";
import {
  Layers,
  Building2,
  DoorOpen,
  Construction,
  MessageSquare,
  Square,
  SlidersHorizontal,
} from "lucide-react";
import type { LayerKey, LayerState, SceneLevel, ConfidenceLevel } from "./types";

interface LeftPanelProps {
  levels: SceneLevel[];
  activeLevelId: string | null;
  onLevelChange: (levelId: string) => void;
  layers: LayerState;
  onLayerToggle: (key: LayerKey) => void;
  confidenceFilters: Record<ConfidenceLevel, boolean>;
  onConfidenceFilterToggle: (level: ConfidenceLevel) => void;
}

const LAYER_CONFIG: Array<{ key: LayerKey; icon: typeof Layers }> = [
  { key: "walls", icon: Square },
  { key: "slabs", icon: Layers },
  { key: "openings", icon: DoorOpen },
  { key: "structure", icon: Construction },
  { key: "annotations", icon: MessageSquare },
];

const CONFIDENCE_FILTERS: Array<{
  key: ConfidenceLevel;
  dotColor: string;
}> = [
  { key: "high", dotColor: "#22C55E" },
  { key: "medium", dotColor: "#F97316" },
  { key: "low", dotColor: "#EF4444" },
];

export function LeftPanel({
  levels,
  activeLevelId,
  onLevelChange,
  layers,
  onLayerToggle,
  confidenceFilters,
  onConfidenceFilterToggle,
}: LeftPanelProps) {
  const t = useTranslations("scene3d");

  return (
    <aside
      className="w-[280px] flex-shrink-0 border-r border-[#27272A] bg-[#111113] flex flex-col overflow-hidden"
      aria-label={t("leftPanel.aria")}
    >
      {/* Levels */}
      <section className="border-b border-[#27272A]" aria-labelledby="scene3d-levels-heading">
        <header className="flex items-center justify-between px-4 py-3">
          <h3
            id="scene3d-levels-heading"
            className="font-display text-xs font-semibold uppercase tracking-wider text-[#71717A]"
          >
            <Building2 className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" aria-hidden="true" />
            {t("leftPanel.levels")}
          </h3>
          <span className="font-mono text-xs text-[#52525B]">{levels.length}</span>
        </header>
        <ul className="px-2 pb-2 space-y-0.5 max-h-48 overflow-y-auto" role="listbox">
          {levels.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[#52525B] italic">
              {t("leftPanel.noLevels")}
            </li>
          ) : (
            levels.map((level) => {
              const active = level.id === activeLevelId;
              return (
                <li key={level.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => onLevelChange(level.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:outline-none ${
                      active
                        ? "bg-[#F97316]/10 text-[#F97316]"
                        : "text-[#FAFAFA] hover:bg-[#27272A]/50"
                    }`}
                  >
                    <span className="truncate font-medium">{level.name}</span>
                    <span className="font-mono text-xs text-[#71717A] ml-2 flex-shrink-0">
                      {level.element_count}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </section>

      {/* Layers */}
      <section className="border-b border-[#27272A]" aria-labelledby="scene3d-layers-heading">
        <header className="flex items-center justify-between px-4 py-3">
          <h3
            id="scene3d-layers-heading"
            className="font-display text-xs font-semibold uppercase tracking-wider text-[#71717A]"
          >
            <Layers className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5" aria-hidden="true" />
            {t("leftPanel.layers")}
          </h3>
        </header>
        <ul className="px-2 pb-2 space-y-0.5" role="group">
          {LAYER_CONFIG.map(({ key, icon: Icon }) => {
            const checked = layers[key];
            return (
              <li key={key}>
                <label className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-[#FAFAFA] cursor-pointer hover:bg-[#27272A]/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onLayerToggle(key)}
                    className="h-4 w-4 rounded border-[#27272A] bg-[#0F0F11] text-[#F97316] focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:outline-none cursor-pointer"
                  />
                  <Icon
                    className={`w-4 h-4 ${checked ? "text-[#F97316]" : "text-[#71717A]"}`}
                    aria-hidden="true"
                  />
                  <span className="flex-1 font-medium">{t(`layers.${key}`)}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Confidence filters */}
      <section className="border-b border-[#27272A]" aria-labelledby="scene3d-conf-heading">
        <header className="flex items-center justify-between px-4 py-3">
          <h3
            id="scene3d-conf-heading"
            className="font-display text-xs font-semibold uppercase tracking-wider text-[#71717A]"
          >
            <SlidersHorizontal
              className="inline w-3.5 h-3.5 mr-1.5 -mt-0.5"
              aria-hidden="true"
            />
            {t("leftPanel.confidenceFilters")}
          </h3>
        </header>
        <ul className="px-2 pb-3 space-y-0.5" role="group">
          {CONFIDENCE_FILTERS.map(({ key, dotColor }) => {
            const checked = confidenceFilters[key];
            return (
              <li key={key}>
                <label className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-[#FAFAFA] cursor-pointer hover:bg-[#27272A]/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onConfidenceFilterToggle(key)}
                    className="h-4 w-4 rounded border-[#27272A] bg-[#0F0F11] text-[#F97316] focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:outline-none cursor-pointer"
                  />
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: dotColor }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 font-medium">
                    {t(`confidence.${key}`)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Footer hint */}
      <div className="mt-auto px-4 py-3 border-t border-[#27272A] bg-[#0F0F11]">
        <p className="text-[11px] text-[#52525B] leading-relaxed">
          {t("leftPanel.footerHint")}
        </p>
      </div>
    </aside>
  );
}
