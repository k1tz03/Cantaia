/**
 * QualityBanner — verdict des contrôles déterministes, au-dessus de la scène.
 *
 * Le visualiseur affichait une géométrie et un pourcentage de confiance
 * auto-déclaré par le modèle, sans jamais dire ce qui avait été VÉRIFIÉ. Une
 * scène dont la somme des dalles s'écarte de 28 % du métré, dont l'échelle
 * n'a pu être calibrée par aucune cote, et dont 14 éléments ont été rejetés,
 * s'affichait exactement comme une scène propre.
 *
 * Ce bandeau rend ce travail visible : trois contrôles globaux, la calibration
 * d'échelle, et le compte des défauts. Replié par défaut quand tout passe,
 * déployé d'office dès qu'un contrôle est rouge.
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Ruler,
  MinusCircle,
} from "lucide-react";
import type { QualityCheck, ScaleCalibration, ValidationIssue } from "./types";

interface QualityBannerProps {
  qualityChecks?: QualityCheck[];
  validationIssues?: ValidationIssue[];
  scaleCalibration?: ScaleCalibration | null;
  overallConfidence: number;
}

const STATUS_STYLE: Record<
  QualityCheck["status"],
  { icon: typeof CheckCircle2; color: string; bg: string; border: string }
> = {
  pass: { icon: CheckCircle2, color: "text-[#22C55E]", bg: "bg-[#22C55E]/10", border: "border-[#22C55E]/30" },
  warn: { icon: AlertTriangle, color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/30" },
  fail: { icon: AlertOctagon, color: "text-[#EF4444]", bg: "bg-[#EF4444]/10", border: "border-[#EF4444]/30" },
  skipped: { icon: MinusCircle, color: "text-[#A1A1AA]", bg: "bg-[#27272A]", border: "border-[#3F3F46]" },
};

const SEVERITY_STYLE: Record<ValidationIssue["severity"], { icon: typeof Info; color: string }> = {
  error: { icon: AlertOctagon, color: "text-[#EF4444]" },
  warning: { icon: AlertTriangle, color: "text-[#F59E0B]" },
  info: { icon: Info, color: "text-[#3B82F6]" },
};

export function QualityBanner({
  qualityChecks = [],
  validationIssues = [],
  scaleCalibration,
  overallConfidence,
}: QualityBannerProps) {
  const t = useTranslations("scene3d");

  const hasFailure = qualityChecks.some((c) => c.status === "fail");
  const hasWarning =
    qualityChecks.some((c) => c.status === "warn") ||
    validationIssues.some((i) => i.severity === "error" || i.severity === "warning");

  const [expanded, setExpanded] = useState(hasFailure);

  // Scène héritée (schéma 1.0.0) : aucun contrôle n'a été enregistré. Ne rien
  // afficher vaut mieux qu'un bandeau vert mensonger.
  if (qualityChecks.length === 0 && validationIssues.length === 0 && !scaleCalibration) {
    return null;
  }

  const errors = validationIssues.filter((i) => i.severity === "error");
  const warnings = validationIssues.filter((i) => i.severity === "warning");

  const tone = hasFailure
    ? { border: "border-[#EF4444]/40", bg: "bg-[#EF4444]/5", icon: AlertOctagon, color: "text-[#EF4444]" }
    : hasWarning
      ? { border: "border-[#F59E0B]/40", bg: "bg-[#F59E0B]/5", icon: AlertTriangle, color: "text-[#F59E0B]" }
      : { border: "border-[#22C55E]/30", bg: "bg-[#22C55E]/5", icon: CheckCircle2, color: "text-[#22C55E]" };

  const ToneIcon = tone.icon;

  return (
    <section
      className={`flex-shrink-0 border-b ${tone.border} ${tone.bg}`}
      aria-labelledby="scene3d-quality-heading"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316]"
      >
        <ToneIcon className={`h-4 w-4 flex-shrink-0 ${tone.color}`} aria-hidden="true" />
        <h2 id="scene3d-quality-heading" className="text-xs font-semibold text-[#FAFAFA]">
          {t("quality.title")}
        </h2>
        <span className="font-mono text-[11px] text-[#A1A1AA]">
          {t("quality.summary", {
            confidence: Math.round(overallConfidence * 100),
            errors: errors.length,
            warnings: warnings.length,
          })}
        </span>
        <span className="ml-auto text-[#A1A1AA]">
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded && (
        <div className="space-y-4 px-4 pb-4 pt-1">
          {/* Contrôles globaux */}
          {qualityChecks.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                {t("quality.globalChecks")}
              </h3>
              <ul className="grid gap-1.5 md:grid-cols-3">
                {qualityChecks.map((check) => {
                  const style = STATUS_STYLE[check.status];
                  const Icon = style.icon;
                  return (
                    <li
                      key={check.code}
                      className={`flex items-start gap-2 rounded-md border ${style.border} ${style.bg} px-2.5 py-2`}
                    >
                      <Icon className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${style.color}`} aria-hidden="true" />
                      <span className="text-[11px] leading-relaxed text-[#A1A1AA]">{check.message}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Calibration d'échelle */}
          {scaleCalibration && (
            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                <Ruler className="mr-1 -mt-0.5 inline h-3.5 w-3.5" aria-hidden="true" />
                {t("quality.scaleCalibration")}
              </h3>
              <div className="rounded-md border border-[#27272A] bg-[#18181B] px-3 py-2 text-[11px] text-[#A1A1AA]">
                <p>
                  {scaleCalibration.applied_factor !== 1
                    ? t("quality.scaleFactorApplied", {
                        factor: scaleCalibration.applied_factor.toFixed(4),
                        checks: scaleCalibration.checks.length,
                      })
                    : scaleCalibration.method === "none"
                      ? t("quality.scaleNotCalibrated")
                      : t("quality.scaleConfirmed", { checks: scaleCalibration.checks.length })}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-[#A1A1AA]">
                  {scaleCalibration.median_door_width_m !== null && (
                    <span>
                      {t("quality.doorMedian", {
                        value: scaleCalibration.median_door_width_m.toFixed(2),
                      })}
                    </span>
                  )}
                  {scaleCalibration.median_storey_height_m !== null && (
                    <span>
                      {t("quality.storeyMedian", {
                        value: scaleCalibration.median_storey_height_m.toFixed(2),
                      })}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Défauts de validation, hors info */}
          {(errors.length > 0 || warnings.length > 0) && (
            <div>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                {t("quality.issues")}
              </h3>
              <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
                {[...errors, ...warnings].slice(0, 30).map((issue, i) => {
                  const style = SEVERITY_STYLE[issue.severity];
                  const Icon = style.icon;
                  return (
                    <li key={`${issue.code}-${issue.element_id ?? "scene"}-${i}`} className="flex items-start gap-2">
                      <Icon className={`mt-0.5 h-3 w-3 flex-shrink-0 ${style.color}`} aria-hidden="true" />
                      <span className="text-[11px] leading-relaxed text-[#A1A1AA]">
                        {issue.element_id && (
                          <span className="mr-1 font-mono text-[10px] text-[#A1A1AA]">{issue.element_id}</span>
                        )}
                        {issue.message}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {errors.length + warnings.length > 30 && (
                <p className="mt-1 text-[10px] text-[#52525B]">
                  {t("quality.moreIssues", { count: errors.length + warnings.length - 30 })}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
