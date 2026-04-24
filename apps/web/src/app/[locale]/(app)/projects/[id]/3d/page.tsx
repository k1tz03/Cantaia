/**
 * /projects/[id]/3d — Phase 1 2.5D scene viewer (SPIKE).
 *
 * ── Why this page exists ───────────────────────────────────────────────────
 *
 * Ship-to-learn gate for the 3D visualization feature. Renders SceneViewer
 * against the hand-crafted MOCK_BUILDING_SCENE fixture so we can:
 *
 *   1. Confirm the IR → UI adapter pipeline is wired end-to-end.
 *   2. Verify @react-three/fiber 8 renders correctly under React 19 at
 *      runtime (type-check passing only proves compile compat — R3F v8
 *      was authored pre-React-19 and its internal reconciler integration
 *      needs actual mounting to validate).
 *   3. Exercise the 3-panel layout, confidence tints, layer toggles, and
 *      LowConfidenceGate against a deterministic scene.
 *
 * Not wired to Supabase yet. Replace the MOCK_BUILDING_SCENE import with a
 * fetch of `GET /api/projects/[id]/scene` once Dev A's route goes live.
 *
 * ── Why "use client" at the page level ─────────────────────────────────────
 *
 * SceneCanvas already wraps @react-three/fiber in `dynamic({ ssr: false })`,
 * so the actual three.js bundle is deferred. But the SceneViewer tree uses
 * hooks (useState, useMemo, useTranslations) throughout — so the tree must
 * execute in a client context from this page down. We match the sibling
 * planning/page.tsx pattern: plain "use client" with useParams(), no
 * server wrapper.
 *
 * ── Layout gotcha ──────────────────────────────────────────────────────────
 *
 * The (app) layout renders `<main className="flex-1 overflow-auto">`, which
 * is NOT a flex container. SceneViewer's outer is `flex-1 flex flex-col`.
 * Without an `h-full flex flex-col` wrapper here, SceneViewer's `flex-1`
 * resolves against nothing and collapses to content height — the 3D canvas
 * renders at 0×0 with no error. Keep the wrapper.
 */

"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { SceneViewer } from "@/components/scene3d";
import { buildingSceneToViewModel } from "@/components/scene3d/adapter";
import { MOCK_BUILDING_SCENE } from "@/components/scene3d/mock-scene";

export default function Scene3dSpikePage() {
  const params = useParams<{ locale: string; id: string }>();
  const projectId = params.id;

  // Memoise the adapter conversion so we don't re-swap coordinates on every
  // render (the adapter is pure but still O(elements) — no reason to redo it
  // when React re-renders for state changes inside SceneViewer).
  const scene = useMemo(
    () => buildingSceneToViewModel(MOCK_BUILDING_SCENE),
    [],
  );

  // Spike stub — correction modal lands post-spike (Dev B, requires the
  // /api/plans/scene/elements/[id] patch route to exist).
  const handleCorrectElement = (elementId: string) => {
    // eslint-disable-next-line no-console
    console.log("[scene3d spike] correct element:", elementId);
  };

  /**
   * PNG export — captures the entire SceneViewer DOM subtree via html2canvas.
   *
   * ── Why this works here ────────────────────────────────────────────────
   *
   * html2canvas normally can't read WebGL canvases — the browser is free to
   * discard the back buffer after compositing, so reads come back blank.
   * SceneCanvas is configured with `gl={{ preserveDrawingBuffer: true }}`
   * which keeps the framebuffer alive long enough for `toDataURL()` /
   * html2canvas to read it. Without that flag on the GL context this
   * function would quietly produce a transparent PNG.
   *
   * ── What gets captured ─────────────────────────────────────────────────
   *
   * The #scene3d-export-root wrapper contains:
   *   - the three.js canvas (3D scene)
   *   - Toolbar overlay (export/measure/level controls)
   *   - WatermarkOverlay ("Visualisation indicative…")
   *   - Left/Right panels (layer toggles, correction panel)
   *
   * We WANT the watermark and toolbar in the screenshot — that's the whole
   * point of the permanent disclaimer. We'd probably want to hide the side
   * panels in a Phase 2 "clean export" mode, but for the spike the full
   * UI state is evidence that the feature works end-to-end.
   *
   * ── Dynamic import ─────────────────────────────────────────────────────
   *
   * html2canvas is ~45KB minified; pulling it into the initial page bundle
   * would slow the first render. A dynamic `import()` inside the handler
   * only loads it when the user actually clicks export.
   *
   * gltf/pdf formats land in Phase 2 (gltf via GLTFExporter, pdf via jspdf
   * wrapping the PNG). For now they log and no-op so the button surface
   * stays functional.
   */
  const handleExport = async (format: "png" | "gltf" | "pdf") => {
    if (format !== "png") {
      // eslint-disable-next-line no-console
      console.log(`[scene3d spike] export "${format}" not implemented yet`);
      return;
    }

    const root = document.getElementById("scene3d-export-root");
    if (!root) {
      // eslint-disable-next-line no-console
      console.error("[scene3d export] #scene3d-export-root not found");
      return;
    }

    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(root, {
        // Match the app's dark theme — white background would bleed through
        // any transparent regions (e.g. gaps between panels).
        backgroundColor: "#0F0F11",
        // Respect DPR so exports look sharp on high-DPI displays without
        // forcing a 4× capture on regular screens.
        scale: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
        // The WebGL canvas is same-origin (it's our own bundle), so these
        // are technically redundant — but setting them explicitly guards
        // against future cross-origin texture loads (e.g. loading a logo
        // from a CDN into the watermark).
        useCORS: true,
        allowTaint: false,
        logging: false,
      });

      canvas.toBlob((blob) => {
        if (!blob) {
          // eslint-disable-next-line no-console
          console.error("[scene3d export] toBlob returned null");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `scene-${projectId}-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Let the download kick off before revoking; a 0ms timeout is enough
        // in practice (the browser starts the download synchronously).
        setTimeout(() => URL.revokeObjectURL(url), 0);
      }, "image/png");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[scene3d export] html2canvas failed:", err);
    }
  };

  return (
    // id is read by handleExport() above — the handler does querySelector
    // on this id rather than a ref because the SceneViewer component tree
    // is deep and we don't want to thread a ref through every layer just
    // for the spike.
    <div id="scene3d-export-root" className="h-full flex flex-col overflow-hidden">
      <SceneViewer
        projectId={projectId}
        scene={scene}
        extraction={null}
        error={null}
        onCorrectElement={handleCorrectElement}
        onExport={handleExport}
      />
    </div>
  );
}
