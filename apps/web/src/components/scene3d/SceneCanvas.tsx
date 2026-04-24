/**
 * SceneCanvas — 3D viewport.
 *
 * Dynamically imports @react-three/fiber and @react-three/drei so three.js
 * stays out of the SSR bundle. Renders lights, a grid, OrbitControls, and one
 * mesh per visible element (filtered by active level + layer toggles).
 *
 * Spike note (Phase 1 — 2.5D):
 *   Every element currently renders as a unit cube positioned/rotated/scaled
 *   from its pre-computed `bbox = [cx, cy, cz, w, h, d]` (emitted by the
 *   IR→UI adapter, already in Three.js space — see adapter.ts for the coord
 *   swap rationale). Confidence drives a tint (green ≥0.8 / amber ≥0.6 /
 *   red otherwise); the currently selected element gets the orange brand
 *   override plus a wireframe halo.
 *
 * Not in this file (deliberate):
 *   - Extrusion geometry, CSG for wall-opening cutouts → Phase 2.
 *   - Measure / section-cut HUDs — passed via `children` slot.
 *   - Low-confidence gate, level switcher, layer panel — live in SceneViewer.
 *   - PNG export — html2canvas captures this DOM subtree + WatermarkOverlay.
 */

"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import type {
  BuildingScene,
  ElementKind,
  LayerState,
  SceneElement,
  ViewMode,
} from "./types";
import { WatermarkOverlay } from "./WatermarkOverlay";

// ---------------------------------------------------------------------------
// Dynamic imports — keep three.js out of the SSR bundle
// ---------------------------------------------------------------------------
// (Now that `r3f.d.ts` augments JSX.IntrinsicElements with ThreeElements, the
// children of <Canvas> type-check without any @ts-expect-error directive.)

const Canvas = dynamic(() => import("@react-three/fiber").then((m) => m.Canvas), {
  ssr: false,
  loading: () => <CanvasLoading />,
});

const OrbitControls = dynamic(
  () => import("@react-three/drei").then((m) => m.OrbitControls),
  { ssr: false },
);

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
  viewMode: ViewMode;
  selectedId: string | null;
  onSelect: (element: SceneElement | null) => void;
  /** Measure / section-cut HUDs slot here (absolute-positioned overlays). */
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Confidence → color
// ---------------------------------------------------------------------------
// Thresholds mirror the adapter's MODEL_AGREEMENT_THRESHOLD (0.7) and the
// SceneViewer's LOW_CONFIDENCE_GATE_THRESHOLD (0.3 ratio). Using the same
// break-points keeps the canvas, the confidence badges, and the disclaimer
// gate all telling one story.

function confidenceTint(confidence: number): string {
  if (confidence >= 0.8) return "#10B981"; // green — high
  if (confidence >= 0.6) return "#F59E0B"; // amber — medium
  return "#EF4444"; // red — low
}

// Kind-dependent opacity: slabs are floors/ceilings (users look through them),
// openings feel ghostly (they're cut-outs, rendered as translucent blocks
// until we have CSG in Phase 2), walls/structure stay mostly solid.
function kindOpacity(kind: ElementKind, selected: boolean): number {
  if (selected) return 1;
  switch (kind) {
    case "slab":
      return 0.35;
    case "opening":
      return 0.5;
    case "annotation":
      return 0.8;
    case "wall":
    case "structure":
      return 0.88;
  }
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
// Single-element mesh
// ---------------------------------------------------------------------------

interface ElementMeshProps {
  element: SceneElement;
  selected: boolean;
  onSelect: (el: SceneElement) => void;
}

function ElementMesh({ element, selected, onSelect }: ElementMeshProps) {
  if (!element.bbox) return null;
  const [cx, cy, cz, w, h, d] = element.bbox;
  const rotationY = (element.metadata?.rotation_y as number | undefined) ?? 0;
  const color = selected ? "#F97316" : confidenceTint(element.confidence);
  const opacity = kindOpacity(element.kind, selected);

  return (
    <mesh
      position={[cx, cy, cz]}
      rotation={[0, rotationY, 0]}
      scale={[Math.max(w, 0.01), Math.max(h, 0.01), Math.max(d, 0.01)]}
      onClick={(event) => {
        // Stop bubbling so the Canvas' onPointerMissed doesn't clear the
        // selection we just set.
        event.stopPropagation();
        onSelect(element);
      }}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        roughness={0.75}
        metalness={0.05}
      />
      {selected && (
        // Wireframe halo — sized relative to parent (Three.js inherits the
        // parent mesh's scale, so [1.02, 1.02, 1.02] = 2 % larger).
        <mesh>
          <boxGeometry args={[1.02, 1.02, 1.02]} />
          <meshBasicMaterial color="#F97316" wireframe transparent opacity={0.9} />
        </mesh>
      )}
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Main canvas
// ---------------------------------------------------------------------------

export function SceneCanvas({
  scene,
  activeLevelId,
  layers,
  viewMode,
  selectedId,
  onSelect,
  children,
}: SceneCanvasProps) {
  const t = useTranslations("scene3d");

  // Filter elements by active level + layer visibility. Memoised so we don't
  // re-filter on every unrelated SceneViewer render.
  const visibleElements = useMemo(() => {
    return scene.elements.filter((el) => {
      if (activeLevelId && el.level_id !== activeLevelId) return false;
      return layerVisible(el.kind, layers);
    });
  }, [scene.elements, activeLevelId, layers]);

  // Camera target — average centre of visible elements so OrbitControls
  // rotates around the content rather than a fixed world origin. Makes level
  // switching feel "natural" (camera re-focuses on the new floor).
  const cameraTarget = useMemo<[number, number, number]>(() => {
    if (visibleElements.length === 0) return [0, 0, 0];
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let n = 0;
    for (const el of visibleElements) {
      if (!el.bbox) continue;
      sx += el.bbox[0];
      sy += el.bbox[1];
      sz += el.bbox[2];
      n++;
    }
    if (n === 0) return [0, 0, 0];
    return [sx / n, sy / n, sz / n];
  }, [visibleElements]);

  return (
    <div
      className="relative w-full h-full bg-[#0F0F11] overflow-hidden"
      role="region"
      aria-label={t("canvas.aria")}
    >
      <Canvas
        camera={{ position: [10, 9, 10], fov: 45, near: 0.1, far: 500 }}
        // `preserveDrawingBuffer: true` is required so html2canvas /
        // canvas.toDataURL() can read the WebGL back buffer for the PNG
        // export. Without it the browser is free to discard the framebuffer
        // after compositing and snapshots come back transparent. The perf
        // cost (blocks the browser's swap-chain optimization) is negligible
        // for our scene sizes — Phase 1 budgets ≤200 elements.
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

        {/* Grid helps ground the floating geometry visually. */}
        <gridHelper args={[50, 50, "#27272A", "#18181B"]} />

        {/* One mesh per visible element. */}
        {visibleElements.map((el) => (
          <ElementMesh
            key={el.id}
            element={el}
            selected={el.id === selectedId}
            onSelect={onSelect}
          />
        ))}

        <OrbitControls
          target={cameraTarget}
          enableDamping
          dampingFactor={0.08}
          enablePan
          makeDefault
          // Disable rotation in pure plan view so users don't tumble the axes.
          enableRotate={viewMode !== "plan"}
          // Keep the camera above the ground plane — no inside-out views.
          maxPolarAngle={Math.PI / 2.05}
        />
      </Canvas>

      {/* Tool HUDs (measure / section) slot in via children */}
      <div className="pointer-events-none absolute inset-0">{children}</div>

      {/* Permanent SIA disclaimer watermark */}
      <WatermarkOverlay position="bottom-right" />
    </div>
  );
}
