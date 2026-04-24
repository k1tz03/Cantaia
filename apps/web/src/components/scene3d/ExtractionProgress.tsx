/**
 * ExtractionProgress — modal shown while the 5-pass extraction pipeline runs.
 * Passes: Identification → Métré → Vérification → Chiffrage → Topologie.
 * Expected duration 60–180 s. Displays the current pass, a gradient progress
 * bar, ETA in seconds, and a step list with checkmarks.
 */

"use client";

import { useTranslations } from "next-intl";
import { Loader2, CheckCircle2, Circle } from "lucide-react";
import type { ExtractionPass } from "./types";

const PASS_ORDER: ExtractionPass[] = [
  "identification",
  "metering",
  "verification",
  "pricing",
  "topology",
];

interface ExtractionProgressProps {
  open: boolean;
  currentPass: ExtractionPass;
  passIndex: number; // 0..4
  etaSeconds: number | null;
}

export function ExtractionProgress({
  open,
  currentPass,
  passIndex,
  etaSeconds,
}: ExtractionProgressProps) {
  const t = useTranslations("scene3d");

  if (!open) return null;

  const pct = Math.round(((passIndex + 0.5) / PASS_ORDER.length) * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="extraction-progress-title"
      aria-live="polite"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="w-full max-w-md rounded-lg border border-[#27272A] bg-[#18181B] shadow-lg shadow-black/40">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-[#F97316] animate-spin" aria-hidden="true" />
            <h2
              id="extraction-progress-title"
              className="font-display text-lg font-semibold text-[#FAFAFA]"
            >
              {t("extraction.title")}
            </h2>
          </div>

          <p className="mt-1 text-sm text-[#A1A1AA]">
            {t(`extraction.pass.${currentPass}.label`)}
          </p>

          {/* Progress bar */}
          <div className="mt-5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 w-full rounded-full bg-[#27272A] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] transition-all duration-500 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs font-mono text-[#A1A1AA]">
              <span>
                {t("extraction.step", { current: passIndex + 1, total: PASS_ORDER.length })}
              </span>
              <span>
                {etaSeconds === null
                  ? t("extraction.etaUnknown")
                  : t("extraction.etaSeconds", { s: Math.max(0, Math.round(etaSeconds)) })}
              </span>
            </div>
          </div>

          {/* Step list */}
          <ol className="mt-5 space-y-2" aria-label={t("extraction.stepsAria")}>
            {PASS_ORDER.map((pass, idx) => {
              const done = idx < passIndex;
              const active = idx === passIndex;
              return (
                <li
                  key={pass}
                  className={`flex items-center gap-2 text-sm rounded-md px-2 py-1.5 ${
                    active
                      ? "bg-[#F97316]/10 text-[#FAFAFA]"
                      : done
                        ? "text-[#A1A1AA]"
                        : "text-[#52525B]"
                  }`}
                >
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-[#22C55E] flex-shrink-0" />
                  ) : active ? (
                    <Loader2 className="w-4 h-4 text-[#F97316] animate-spin flex-shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="font-medium">
                    {t(`extraction.pass.${pass}.label`)}
                  </span>
                  <span className="font-mono text-xs text-[#71717A]">
                    {t(`extraction.pass.${pass}.hint`)}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="mt-5 text-xs text-[#71717A]">{t("extraction.footer")}</p>
        </div>
      </div>
    </div>
  );
}
