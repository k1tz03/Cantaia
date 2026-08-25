/**
 * SceneCanvas — 3D viewport.
 *
 * Importe dynamiquement @react-three/fiber, @react-three/drei et la couche
 * `SceneThreeLayer` (le seul module qui touche `three`), pour garder le moteur
 * 3D hors du bundle SSR.
 *
 * Ce fichier orchestre : lumières, grille, contrôles, filtrage des éléments
 * visibles (niveau actif × calques × filtres de confiance) et échelle
 * graphique. La géométrie elle-même est rendue par `SceneThreeLayer`.
 *
 * ── Corrigé après l'audit 2 ───────────────────────────────────────────────
 *   - `confidenceFilters` n'était JAMAIS transmis ici : les trois cases du
 *     panneau gauche étaient sans effet. Elles filtrent maintenant réellement.
 *   - La caméra était figée à [10, 9, 10] : sur une villa de 12 m elle
 *     démarrait à l'intérieur des murs. Elle est cadrée sur la bbox de la
 *     scène (cf. `CameraRig`).
 *   - Une échelle graphique accompagne désormais la vue : une perspective
 *     sans référence métrique invite à lire des longueurs à l'œil, ce qui est
 *     exactement ce qu'il ne faut pas faire ici.
 */

"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type {
  BuildingScene,
  ConfidenceLevel,
  ElementKind,
  LayerState,
  SceneElement,
  ViewMode,
} from "./types";
import { confidenceBand } from "./confidence-visuals";
import { WatermarkOverlay } from "./WatermarkOverlay";

// ---------------------------------------------------------------------------
// Dynamic imports — keep three.js out of the SSR bundle
// ---------------------------------------------------------------------------

const Canvas = dynamic(() => import("@react-three/fiber").then((m) => m.Canvas), {
  ssr: false,
  loading: () => <CanvasLoading />,
});

const OrbitControls = dynamic(
  () => import("@react-three/drei").then((m) => m.OrbitControls),
  { ssr: false },
);

// Rendu de la géométrie + coupe + mesure + cadrage caméra. `ssr: false` :
// c'est ce module qui importe `three`.
const SceneThreeLayer = dynamic(() => import("./SceneThreeLayer"), { ssr: false });

function CanvasLoading() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0F0F11]">
      <div className="flex items-center gap-3 text-[#A1A1AA]">
        <Loader2 className="w-4 h-4 animate-spin text-[#F97316]" aria-hidden="true" />
        <span className="text-sm">Initialisation du moteur 3D…</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SceneCanvasProps {
  scene: BuildingScene;
  activeLevelId: string | null;
  layers: LayerState;
  /** Filtres de confiance du panneau gauche. Appliqués au rendu. */
  confidenceFilters: Record<ConfidenceLevel, boolean>;
  viewMode: ViewMode;
  selectedId: string | null;
  onSelect: (element: SceneElement | null) => void;
  /** Mode mesure : verrouille la vue de dessus et arme le plan de saisie. */
  measureActive: boolean;
  measurePoints: Array<[number, number, number]>;
  onMeasurePoint: (point: [number, number, number]) => void;
  section: { active: boolean; axis: "x" | "y" | "z"; elevation: number };
  /** Measure / section-cut HUDs slot here (absolute-positioned overlays). */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Layer visibility
// ---------------------------------------------------------------------------
// LayerState keys mirror ElementKind with a plural-ise (wall → walls). An
// explicit switch keeps TypeScript exhaustive if a new kind is ever added.

function layerVisible(kind: ElementKind, layers: LayerState): boolean {
  switch (kind) {
    case "wall":
      return layers.walls;
    case "slab":
      return layers.slabs;
    case "opening":
      return layers.openings;
    case "structure":
      return layers.structure;
    case "annotation":
      return layers.annotations;
  }
}

// ---------------------------------------------------------------------------
// Échelle graphique
// ---------------------------------------------------------------------------

/**
 * Barre d'échelle indicative, calée sur la plus grande dimension de la scène.
 *
 * Elle ne prétend pas à l'exactitude au pixel — la vue est en perspective —
 * mais elle donne l'ordre de grandeur, et surtout elle rappelle en permanence
 * que ce qui est affiché a une échelle. Sans repère métrique, on lit des
 * proportions comme si c'étaient des mesures.
 */
function ScaleBar({ bbox }: { bbox?: BuildingScene["bbox"] }) {
  const span = useMemo(() => {
    if (!bbox) return null;
    const [minX, , minZ, maxX, , maxZ] = bbox;
    return Math.max(maxX - minX, maxZ - minZ);
  }, [bbox]);

  if (!span || !Number.isFinite(span) || span <= 0) return null;

  // Pas « rond » le plus proche du quart de l'emprise (1, 2, 5 × 10^n).
  const target = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const normalized = target / magnitude;
  const step = (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 select-none" aria-hidden="true">
      <div className="flex items-end gap-2">
        <div className="flex flex-col items-start">
          <span className="font-mono text-[10px] text-[#A1A1AA]">
            ~{step >= 1 ? step.toFixed(0) : step.toFixed(2)} m
          </span>
          <div className="mt-0.5 h-1.5 w-24 border-x border-b border-[#A1A1AA]/70" />
        </div>
        <span className="font-mono text-[10px] text-[#52525B]">
          emprise ~{span.toFixed(1)} m
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------

export function SceneCanvas({
  scene,
  activeLevelId,
  layers,
  confidenceFilters,
  viewMode,
  selectedId,
  onSelect,
  measureActive,
  measurePoints,
  onMeasurePoint,
  section,
  children,
}: SceneCanvasProps) {
  const t = useTranslations("scene3d");

  // Niveau actif × calques × filtres de confiance.
  //
  // Les trois filtres de confiance étaient purement décoratifs : l'état vivait
  // dans SceneViewer et n'arrivait jamais jusqu'ici. Décocher « Faible » ne
  // masquait rien.
  const visibleElements = useMemo(() => {
    return scene.elements.filter((el) => {
      if (activeLevelId && el.level_id !== activeLevelId) return false;
      if (!layerVisible(el.kind, layers)) return false;
      return confidenceFilters[confidenceBand(el.confidence)];
    });
  }, [scene.elements, activeLevelId, layers, confidenceFilters]);

  // Altitude du plan de mesure : le sol du niveau affiché.
  const measurePlaneY = useMemo(() => {
    const level = scene.levels.find((l) => l.id === activeLevelId) ?? scene.levels[0];
    return level?.elevation_m ?? 0;
  }, [scene.levels, activeLevelId]);

  // La caméra ne tourne pas en vue plan ni pendant une mesure : mesurer une
  // distance planimétrique depuis une vue en perspective inclinée invite à
  // cliquer à côté.
  const lockedTopView = measureActive || viewMode === "plan";

  return (
    <div
      className="relative w-full h-full bg-[#0F0F11] overflow-hidden"
      role="region"
      aria-label={t("canvas.aria")}
    >
      <Canvas
        // Position initiale volontairement lointaine : `CameraRig` la recadre
        // dès que la bbox de la scène est connue. Partir de loin évite le
        // flash « caméra dans les murs » sur la première frame.
        camera={{ position: [40, 32, 40], fov: 45, near: 0.1, far: 5000 }}
        // `preserveDrawingBuffer: true` est requis pour que html2canvas /
        // canvas.toDataURL() puissent lire le back buffer WebGL à l'export.
        // Sans lui le navigateur est libre de le jeter après compositing et
        // les captures reviennent transparentes.
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true }}
        dpr={[1, 2]}
        shadows
        onPointerMissed={() => onSelect(null)}
      >
        {/* Lights */}
        <ambientLight intensity={0.45} />
        <directionalLight
          position={[10, 12, 6]}
          intensity={0.85}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        {/* Hemi light gives a dark-theme-friendly ambient gradient. */}
        <hemisphereLight args={[0xffffff, 0x1c1c1f, 0.25]} />

        {/* Grille au mètre : repère métrique dans la scène elle-même. */}
        <gridHelper args={[200, 200, "#27272A", "#18181B"]} />

        <SceneThreeLayer
          elements={visibleElements}
          selectedId={selectedId}
          onSelect={onSelect}
          bbox={scene.bbox}
          topView={lockedTopView}
          section={section}
          measureActive={measureActive}
          measurePlaneY={measurePlaneY}
          measurePoints={measurePoints}
          onMeasurePoint={onMeasurePoint}
        />

        <OrbitControls
          enableDamping
          dampingFactor={0.08}
          enablePan
          makeDefault
          // Pas de tumbling en vue plan ni pendant une mesure.
          enableRotate={!lockedTopView}
          // Keep the camera above the ground plane — no inside-out views.
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>

      {/* Tool HUDs (measure / section) slot in via children */}
      <div className="pointer-events-none absolute inset-0">{children}</div>

      <ScaleBar bbox={scene.bbox} />

      {/* Permanent SIA disclaimer watermark */}
      <WatermarkOverlay position="bottom-right" />
    </div>
  );
}
