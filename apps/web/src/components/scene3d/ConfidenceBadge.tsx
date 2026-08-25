/**
 * ConfidenceBadge — badge de confiance 0..1.
 *
 * Les bornes viennent de `CONFIDENCE_THRESHOLDS` (@cantaia/core), comme le
 * canvas, l'adapter et le gate. Elles étaient auparavant recopiées ici
 * (0.85 / 0.70) et là-bas (0.80 / 0.60) : un même élément à 0.75 s'affichait
 * ambre dans la scène et rouge dans l'inspecteur.
 */

"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";
import { CONFIDENCE_THRESHOLDS } from "@cantaia/core/plans/scene/constants";

interface ConfidenceBadgeProps {
  confidence: number; // 0..1
  size?: "sm" | "md";
  showLabel?: boolean;
  className?: string;
}

export function ConfidenceBadge({
  confidence,
  size = "md",
  showLabel = true,
  className = "",
}: ConfidenceBadgeProps) {
  const t = useTranslations("scene3d");

  const pct = Math.round(confidence * 100);

  let bgClass: string;
  let textClass: string;
  let borderClass: string;
  let Icon = CheckCircle2;
  let levelKey: "high" | "medium" | "low";

  if (confidence >= CONFIDENCE_THRESHOLDS.high) {
    bgClass = "bg-[#22C55E]/10";
    textClass = "text-[#22C55E]";
    borderClass = "border-[#22C55E]/30";
    Icon = CheckCircle2;
    levelKey = "high";
  } else if (confidence >= CONFIDENCE_THRESHOLDS.mid) {
    bgClass = "bg-[#F97316]/10";
    textClass = "text-[#F97316]";
    borderClass = "border-[#F97316]/30";
    Icon = AlertTriangle;
    levelKey = "medium";
  } else {
    bgClass = "bg-[#EF4444]/10";
    textClass = "text-[#EF4444]";
    borderClass = "border-[#EF4444]/30";
    Icon = AlertOctagon;
    levelKey = "low";
  }

  const padding = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";
  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border ${bgClass} ${borderClass} ${textClass} ${padding} font-mono font-medium ${className}`}
      role="status"
      aria-label={t("confidence.ariaLabel", {
        level: t(`confidence.${levelKey}`),
        pct,
      })}
    >
      <Icon className={iconSize} aria-hidden="true" />
      <span>{pct}%</span>
      {showLabel && (
        <span className="font-sans font-normal opacity-80">
          {t(`confidence.${levelKey}`)}
        </span>
      )}
    </span>
  );
}
