/**
 * SceneViewer — orchestrateur de la page de scène 3D.
 *
 * Détient : scene_data, états de chargement/erreur, progression d'extraction,
 * acceptation du disclaimer, niveau/calques/filtres/sélection, modes d'outils.
 * Compose LeftPanel, SceneCanvas, RightPanel, Toolbar, MeasureTool,
 * SectionCutTool, et les deux modales (LowConfidenceGate, ExtractionProgress).
 *
 * Utilisé par : app/[locale]/(app)/projects/[id]/3d/page.tsx
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import { CONFIDENCE_THRESHOLDS } from "@cantaia/core/plans/scene/constants";
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
import { QualityBanner } from "./QualityBanner";

interface SceneViewerProps {
  projectId: string;
  /**
   * Id du plan affiché (`?plan=`). Sert au retour depuis le gate SIA vers la
   * fiche du plan. `null` en mode démo.
   */
  planId?: string | null;
  /**
   * Id de la ligne `plan_scenes` affichée. Requis pour tracer l'acceptation
   * du disclaimer SIA et pour poster les corrections d'éléments.
   * `null` en mode démo (`?demo=1`).
   */
  sceneId?: string | null;
  /** Raw scene from the extraction pipeline. Null while loading/extracting. */
  scene: BuildingScene | null;
  /** Non-null while the 5-pass extraction is running. */
  extraction: ExtractionProgressState | null;
  /** Fatal error preventing viewer init. */
  error: string | null;
  /**
   * L'utilisateur a-t-il DÉJÀ accepté le disclaimer pour cette scène ?
   * Renseigné par `GET /api/plans/[id]/scene` : sans ça, le gate se
   * ré-affichait à chaque rafraîchissement, alors même que l'acceptation
   * était bien consignée au registre.
   */
  disclaimerAccepted?: boolean;
  /** Fired when the user clicks "Corriger" on an element. */
  onCorrectElement: (elementId: string) => void;
  /** Fired when user exports a snapshot. */
  onExport: (format: "png" | "gltf" | "pdf") => void;
}

/**
 * Part d'éléments sous le seuil au-delà de laquelle le disclaimer devient
 * bloquant. Même valeur que le critère de refus serveur
 * (`REFUSAL.maxLowConfidenceRatio`) : entre 30 % de refus côté serveur et un
 * gate qui s'ouvrirait à un autre seuil, l'utilisateur ne comprendrait plus
 * rien à ce qui déclenche quoi.
 */
const LOW_CONFIDENCE_GATE_THRESHOLD = 0.3;

export function SceneViewer({
  projectId,
  planId,
  sceneId,
  scene,
  extraction,
  error,
  disclaimerAccepted = false,
  onCorrectElement,
  onExport,
}: SceneViewerProps) {
  const t = useTranslations("scene3d");
  const router = useRouter();

  // UI state
  const [gateAccepted, setGateAccepted] = useState(disclaimerAccepted);
  const [activeLevelId, setActiveLevelId] = useState<string | null>(
    scene?.levels[0]?.id ?? null,
  );

  // Re-synchronise le niveau actif quand la scène arrive APRÈS le montage
  // (extraction in-place : SceneViewer est monté pendant `extracting` avec
  // scene=null, puis reçoit la scène au même emplacement d'arbre). Sans ça,
  // activeLevelId restait null : tous les niveaux se superposaient et les
  // boutons haut/bas restaient désactivés.
  useEffect(() => {
    const levelIds = scene?.levels?.map((l) => l.id) ?? [];
    if (levelIds.length === 0) return;
    if (activeLevelId === null || !levelIds.includes(activeLevelId)) {
      setActiveLevelId(levelIds[0]);
    }
  }, [scene, activeLevelId]);

  // Le gate suit l'acceptation persistée quand elle bascule à true côté serveur.
  useEffect(() => {
    if (disclaimerAccepted) setGateAccepted(true);
  }, [disclaimerAccepted]);
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
  const [measurePoints, setMeasurePoints] = useState<Array<[number, number, number]>>([]);
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

  /**
   * Un clic de mesure. Deux points forment une mesure ; le troisième
   * recommence — c'est le comportement d'un décamètre, pas d'une polyligne,
   * et c'est ce que le HUD annonce.
   */
  const handleMeasurePoint = useCallback((point: [number, number, number]) => {
    setMeasurePoints((prev) => (prev.length >= 2 ? [point] : [...prev, point]));
  }, []);

  /** Distance planimétrique entre les deux points, en mètres. */
  const measureReadout = useMemo(() => {
    if (measurePoints.length < 2) return null;
    const [a, b] = measurePoints;
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const distance = Math.hypot(dx, dz);
    return `${distance.toFixed(2)} m`;
  }, [measurePoints]);

  const handleMeasureModeChange = useCallback((mode: MeasureMode) => {
    setMeasureMode(mode);
    setMeasurePoints([]);
  }, []);

  // Escape : le panneau de droite PROMET « Esc pour désélectionner » — on
  // l'honore, et on l'étend à la sortie du mode mesure / à la fermeture de la
  // coupe (priorité : mesure → coupe → sélection).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMeasureMode((prevMode) => {
        if (prevMode !== "none") {
          setMeasurePoints([]);
          return "none";
        }
        setSectionCutActive((prevSection) => {
          if (prevSection) return false;
          setSelectedId(null);
          return prevSection;
        });
        return prevMode;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // Bornes du curseur de coupe — DÉPENDANTES DE L'AXE. bbox est plat
  // [minX, minElev(Y↑), minY, maxX, maxElev, maxY] ; une coupe X ou Y (verticale)
  // se compare aux coordonnées HORIZONTALES, pas à la plage d'altitudes. Une
  // plage figée sur l'altitude empêchait le plan de coupe X/Y de traverser le
  // bâtiment.
  const bbox = scene.bbox;
  let minElev: number;
  let maxElev: number;
  if (bbox) {
    if (sectionAxis === "x") {
      minElev = bbox[0];
      maxElev = bbox[3];
    } else if (sectionAxis === "y") {
      minElev = bbox[2];
      maxElev = bbox[5];
    } else {
      minElev = bbox[1];
      maxElev = bbox[4];
    }
  } else {
    minElev = Math.min(...levels.map((l) => l.elevation_m), 0);
    maxElev = Math.max(...levels.map((l) => l.elevation_m + 3), 10);
  }

  /** Change l'axe de coupe et recentre le plan sur la nouvelle plage. */
  const handleSectionAxisChange = (axis: "x" | "y" | "z") => {
    setSectionAxis(axis);
    let lo: number;
    let hi: number;
    if (bbox && axis === "x") {
      lo = bbox[0];
      hi = bbox[3];
    } else if (bbox && axis === "y") {
      lo = bbox[2];
      hi = bbox[5];
    } else if (bbox) {
      lo = bbox[1];
      hi = bbox[4];
    } else {
      lo = 0;
      hi = 10;
    }
    setSectionElevation((lo + hi) / 2);
  };

  return (
    <div className="flex-1 flex flex-col bg-[#0F0F11] overflow-hidden">
      {/* Contrôles globaux + défauts de validation, au-dessus de la scène. */}
      <QualityBanner
        qualityChecks={scene.quality_checks}
        validationIssues={scene.validation_issues}
        scaleCalibration={scene.scale_calibration}
        overallConfidence={scene.overall_confidence}
      />

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
            confidenceFilters={confidenceFilters}
            viewMode={viewMode}
            selectedId={selectedId}
            onSelect={(el) => setSelectedId(el?.id ?? null)}
            measureActive={measureMode === "distance"}
            measurePoints={measurePoints}
            onMeasurePoint={handleMeasurePoint}
            section={{
              active: sectionCutActive,
              axis: sectionAxis,
              elevation: sectionElevation,
            }}
          >
            <MeasureTool
              mode={measureMode}
              pointCount={measurePoints.length}
              readout={measureReadout}
              onReset={() => setMeasurePoints([])}
              onCancel={() => handleMeasureModeChange("none")}
            />
            <SectionCutTool
              active={sectionCutActive}
              axis={sectionAxis}
              elevation={sectionElevation}
              onAxisChange={handleSectionAxisChange}
              onElevationChange={setSectionElevation}
              onClose={() => setSectionCutActive(false)}
              minElevation={minElev}
              maxElevation={maxElev}
            />
          </SceneCanvas>

          <Toolbar
            measureMode={measureMode}
            onMeasureModeChange={handleMeasureModeChange}
            sectionCutActive={sectionCutActive}
            onSectionCutToggle={() => setSectionCutActive((v) => !v)}
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

        <RightPanel
          selected={selected}
          validationIssues={scene.validation_issues}
          onCorrect={onCorrectElement}
        />
      </div>

      {/* First-load disclaimer gate */}
      <LowConfidenceGate
        open={gateOpen}
        lowConfidenceRatio={scene.low_confidence_ratio}
        overallConfidence={scene.overall_confidence}
        elementCount={scene.elements.length}
        threshold={CONFIDENCE_THRESHOLDS.mid}
        sceneId={sceneId ?? null}
        onAccept={() => setGateAccepted(true)}
        // « Annuler » / croix : `gateAccepted` est DÉJÀ false quand le gate est
        // ouvert — le remettre à false ne faisait rien (utilisateur piégé). On
        // quitte le viewer vers la fiche du plan (ou l'écran précédent).
        onCancel={() => (planId ? router.push(`/plans/${planId}`) : router.back())}
      />
    </div>
  );
}
