/**
 * SceneViewer — top-level orchestrator for the 3D scene page.
 * Owns: scene_data, loading/error state, extraction progress, gate acceptance,
 * level/layer/filter/selection state, tool modes. Composes LeftPanel,
 * SceneCanvas, RightPanel, Toolbar, MeasureTool, SectionCutTool, and the two
 * modals (LowConfidenceGate, ExtractionProgress).
 * Used at: app/[locale]/(app)/projects/[id]/3d/page.tsx
 */

"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Loader2 } from "lucide-react";
import type {
  BuildingScene,
  ConfidenceLevel,
  ExtractionProgressState,
  LayerKey,
  LayerState,
  MeasureMode,
  SceneElement,
  ViewMode,
} from "./types";
import { LeftPanel } from "./LeftPanel";
import { RightPanel } from "./RightPanel";
import { SceneCanvas } from "./SceneCanvas";
import { Toolbar } from "./Toolbar";
import { MeasureTool } from "./MeasureTool";
import { SectionCutTool } from "./SectionCutTool";
import { ExtractionProgress } from "./ExtractionProgress";
import { LowConfidenceGate } from "./LowConfidenceGate";

// Mock reference for type shape during wireframing:
// const MOCK: BuildingScene = {
//   project_id: "proj_123",
//   generated_at: "2026-04-23T08:00:00Z",
//   levels: [
//     { id: "L0", name: "RDC", elevation_m: 0, element_count: 42 },
//     { id: "L1", name: "Étage 1", elevation_m: 3.1, element_count: 38 },
//   ],
//   elements: [],
//   overall_confidence: 0.78,
//   low_confidence_ratio: 0.32,
// };

interface SceneViewerProps {
  projectId: string;
  /** Raw scene from the extraction pipeline. Null while loading/extracting. */
  scene: BuildingScene | null;
  /** Non-null while the 5-pass extraction is running. */
  extraction: ExtractionProgressState | null;
  /** Fatal error preventing viewer init. */
  error: string | null;
  /** Fired when the user clicks "Corriger" on an element. */
  onCorrectElement: (elementId: string) => void;
  /** Fired when user exports a snapshot. */
  onExport: (format: "png" | "gltf" | "pdf") => void;
}

const LOW_CONFIDENCE_GATE_THRESHOLD = 0.3;

export function SceneViewer({
  projectId,
  scene,
  extraction,
  error,
  onCorrectElement,
  onExport,
}: SceneViewerProps) {
  const t = useTranslations("scene3d");

  // UI state
  const [gateAccepted, setGateAccepted] = useState(false);
  const [activeLevelId, setActiveLevelId] = useState<string | null>(
    scene?.levels[0]?.id ?? null,
  );
  const [layers, setLayers] = useState<LayerState>({
    walls: true,
    slabs: true,
    openings: true,
    structure: true,
    annotations: false,
  });
  const [confidenceFilters, setConfidenceFilters] = useState<
    Record<ConfidenceLevel, boolean>
  >({ high: true, medium: true, low: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [measureMode, setMeasureMode] = useState<MeasureMode>("none");
  const [sectionCutActive, setSectionCutActive] = useState(false);
  const [sectionAxis, setSectionAxis] = useState<"x" | "y" | "z">("z");
  const [sectionElevation, setSectionElevation] = useState(1.2);
  const [viewMode] = useState<ViewMode>("2.5d");

  const selected: SceneElement | null = useMemo(() => {
    if (!scene || !selectedId) return null;
    return scene.elements.find((e) => e.id === selectedId) ?? null;
  }, [scene, selectedId]);

  const gateOpen =
    !!scene &&
    !gateAccepted &&
    scene.low_confidence_ratio > LOW_CONFIDENCE_GATE_THRESHOLD;

  const levels = scene?.levels ?? [];
  const levelIdx = levels.findIndex((l) => l.id === activeLevelId);
  const canLevelUp = levelIdx > 0;
  const canLevelDown = levelIdx >= 0 && levelIdx < levels.length - 1;

  // ── Extraction state ───────────────────────────────────────────────────────
  if (extraction) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0F0F11]">
        <ExtractionProgress
          open
          currentPass={extraction.currentPass}
          passIndex={extraction.passIndex}
          etaSeconds={extraction.etaSeconds}
        />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0F0F11] p-6">
        <div className="max-w-md text-center">
          <div className="inline-flex w-12 h-12 rounded-full bg-[#EF4444]/10 border border-[#EF4444]/30 items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-[#EF4444]" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-display text-lg font-semibold text-[#FAFAFA]">
            {t("error.title")}
          </h2>
          <p className="mt-2 text-sm text-[#A1A1AA]">{error}</p>
        </div>
      </div>
    );
  }

  // ── Empty state (no scene yet) ─────────────────────────────────────────────
  if (!scene) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#0F0F11]">
        <div className="inline-flex items-center gap-3 text-[#A1A1AA]">
          <Loader2 className="w-4 h-4 animate-spin text-[#F97316]" aria-hidden="true" />
          <span className="text-sm">{t("loading")}</span>
        </div>
      </div>
    );
  }

  // ── Main layout ────────────────────────────────────────────────────────────
  const handleLayerToggle = (key: LayerKey) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleConfFilterToggle = (key: ConfidenceLevel) =>
    setConfidenceFilters((prev) => ({ ...prev, [key]: !prev[key] }));

  const minElev = Math.min(...levels.map((l) => l.elevation_m), 0);
  const maxElev = Math.max(...levels.map((l) => l.elevation_m + 3), 10);

  return (
    <div className="flex-1 flex flex-col bg-[#0F0F11] overflow-hidden">
      {/* 3-panel layout: 280 | flex-1 | 360 */}
      <div className="flex-1 flex overflow-hidden" data-project-id={projectId}>
        <LeftPanel
          levels={levels}
          activeLevelId={activeLevelId}
          onLevelChange={setActiveLevelId}
          layers={layers}
          onLayerToggle={handleLayerToggle}
          confidenceFilters={confidenceFilters}
          onConfidenceFilterToggle={handleConfFilterToggle}
        />

        <main className="relative flex-1 overflow-hidden">
          <SceneCanvas
            scene={scene}
            activeLevelId={activeLevelId}
            layers={layers}
            viewMode={viewMode}
            selectedId={selectedId}
            onSelect={(el) => setSelectedId(el?.id ?? null)}
          >
            <MeasureTool
              mode={measureMode}
              onCancel={() => setMeasureMode("none")}
            />
            <SectionCutTool
              active={sectionCutActive}
              axis={sectionAxis}
              elevation={sectionElevation}
              onAxisChange={setSectionAxis}
              onElevationChange={setSectionElevation}
              onClose={() => setSectionCutActive(false)}
              minElevation={minElev}
              maxElevation={maxElev}
            />
          </SceneCanvas>

          <Toolbar
            measureMode={measureMode}
            onMeasureModeChange={setMeasureMode}
            sectionCutActive={sectionCutActive}
            onSectionCutToggle={() => setSectionCutActive((v) => !v)}
            onLayersClick={() => {
              /* TODO: Dev B logic — open layers popover or focus LeftPanel */
            }}
            onLevelUp={() => {
              if (canLevelUp) setActiveLevelId(levels[levelIdx - 1].id);
            }}
            onLevelDown={() => {
              if (canLevelDown) setActiveLevelId(levels[levelIdx + 1].id);
            }}
            canLevelUp={canLevelUp}
            canLevelDown={canLevelDown}
            onExport={onExport}
          />
        </main>

        <RightPanel selected={selected} onCorrect={onCorrectElement} />
      </div>

      {/* First-load disclaimer gate */}
      <LowConfidenceGate
        open={gateOpen}
        lowConfidenceRatio={scene.low_confidence_ratio}
        overallConfidence={scene.overall_confidence}
        elementCount={scene.elements.length}
        onAccept={() => setGateAccepted(true)}
        onCancel={() => setGateAccepted(false)}
      />
    </div>
  );
}
