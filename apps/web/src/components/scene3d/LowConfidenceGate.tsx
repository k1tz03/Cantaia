/**
 * LowConfidenceGate — blocking modal shown on first load when more than 30% of
 * scene elements have confidence < 0.7. Forces the user to acknowledge (via a
 * mandatory checkbox) that the visualisation is indicative, not contractual,
 * before they can interact with the scene. Acceptance is persisted per project
 * via onAccept (Dev B wires to localStorage / project settings).
 */

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShieldAlert, X } from "lucide-react";

interface LowConfidenceGateProps {
  open: boolean;
  lowConfidenceRatio: number; // 0..1
  overallConfidence: number; // 0..1
  elementCount: number;
  onAccept: () => void;
  onCancel: () => void;
}

export function LowConfidenceGate({
  open,
  lowConfidenceRatio,
  overallConfidence,
  elementCount,
  onAccept,
  onCancel,
}: LowConfidenceGateProps) {
  const t = useTranslations("scene3d");
  const [acknowledged, setAcknowledged] = useState(false);

  if (!open) return null;

  const lowPct = Math.round(lowConfidenceRatio * 100);
  const overallPct = Math.round(overallConfidence * 100);
  const lowCount = Math.round(lowConfidenceRatio * elementCount);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="low-confidence-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <div className="relative w-full max-w-xl rounded-lg border border-[#27272A] bg-[#18181B] shadow-lg shadow-black/40">
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("gate.close")}
          className="absolute top-4 right-4 rounded-md p-1 text-[#71717A] hover:bg-[#27272A] hover:text-[#FAFAFA] focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:outline-none"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[#F97316]/10 border border-[#F97316]/30 flex items-center justify-center">
              <ShieldAlert className="w-5 h-5 text-[#F97316]" />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="low-confidence-gate-title"
                className="font-display text-lg font-semibold text-[#FAFAFA]"
              >
                {t("gate.title")}
              </h2>
              <p className="mt-1 text-sm text-[#A1A1AA]">{t("gate.subtitle")}</p>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div className="rounded-md border border-[#27272A] bg-[#1C1C1F] p-3">
              <div className="text-xs text-[#71717A]">{t("gate.statOverall")}</div>
              <div className="mt-1 font-mono text-xl font-semibold text-[#FAFAFA]">
                {overallPct}%
              </div>
            </div>
            <div className="rounded-md border border-[#EF4444]/30 bg-[#EF4444]/5 p-3">
              <div className="text-xs text-[#71717A]">{t("gate.statLowRatio")}</div>
              <div className="mt-1 font-mono text-xl font-semibold text-[#EF4444]">
                {lowPct}%
              </div>
            </div>
            <div className="rounded-md border border-[#27272A] bg-[#1C1C1F] p-3">
              <div className="text-xs text-[#71717A]">{t("gate.statLowCount")}</div>
              <div className="mt-1 font-mono text-xl font-semibold text-[#FAFAFA]">
                {lowCount}
                <span className="ml-1 text-sm font-normal text-[#71717A]">
                  / {elementCount}
                </span>
              </div>
            </div>
          </div>

          {/* Disclaimer body */}
          <div className="mt-5 rounded-md border border-[#27272A] bg-[#0F0F11] p-4 text-sm leading-relaxed text-[#A1A1AA]">
            <p>{t("gate.bodyP1")}</p>
            <p className="mt-2">{t("gate.bodyP2")}</p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>{t("gate.bullet1")}</li>
              <li>{t("gate.bullet2")}</li>
              <li>{t("gate.bullet3")}</li>
            </ul>
          </div>

          {/* Mandatory acknowledgement */}
          <label className="mt-5 flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[#27272A] bg-[#0F0F11] text-[#F97316] focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:outline-none cursor-pointer"
              aria-required="true"
              aria-describedby="gate-ack-desc"
            />
            <span id="gate-ack-desc" className="text-sm text-[#FAFAFA] group-hover:text-white">
              {t("gate.ackLabel")}
            </span>
          </label>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-md bg-[#27272A] text-[#FAFAFA] text-sm font-medium hover:bg-[#3F3F46] focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:outline-none"
            >
              {t("gate.cancel")}
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={!acknowledged}
              className="px-4 py-2 rounded-md bg-[#F97316] text-white text-sm font-medium hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#F97316] focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:outline-none"
            >
              {t("gate.accept")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
