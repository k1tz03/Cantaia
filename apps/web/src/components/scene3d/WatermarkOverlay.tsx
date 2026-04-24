/**
 * WatermarkOverlay — permanent, non-interactive disclaimer anchored bottom-right
 * of the 3D canvas. Reinforces that the scene is indicative, not contractual.
 * Also stamped into PNG exports by SceneCanvas snapshot logic (Dev B).
 */

"use client";

import { useTranslations } from "next-intl";

interface WatermarkOverlayProps {
  /** Where to render inside the canvas viewport. Default: bottom-right. */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
}

export function WatermarkOverlay({ position = "bottom-right" }: WatermarkOverlayProps) {
  const t = useTranslations("scene3d");

  const positionClass = {
    "bottom-right": "bottom-3 right-3",
    "bottom-left": "bottom-3 left-3",
    "top-right": "top-3 right-3",
    "top-left": "top-3 left-3",
  }[position];

  return (
    <div
      className={`pointer-events-none absolute ${positionClass} select-none font-mono text-[11px] tracking-tight text-[#FAFAFA]`}
      style={{ opacity: 0.4 }}
      aria-hidden="true"
    >
      <span className="inline-block rounded-sm bg-black/40 px-2 py-1 backdrop-blur-sm">
        {t("watermark")}
      </span>
    </div>
  );
}
