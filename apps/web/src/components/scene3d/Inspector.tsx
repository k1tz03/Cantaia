/**
 * Inspector — details panel for a selected 3D element. Shows type, ID,
 * confidence badge, extraction provenance (source_passes), model consensus,
 * and a "Corriger" button wired to the existing learning loop.
 */

"use client";

import { useTranslations } from "next-intl";
import {
  Hash,
  Tag,
  GitBranch,
  Users,
  PencilLine,
  ChevronRight,
} from "lucide-react";
import type { SceneElement } from "./types";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface InspectorProps {
  element: SceneElement;
  onCorrect: (elementId: string) => void;
}

const PASS_KEYS = ["identification", "metering", "verification", "pricing", "topology"] as const;

export function Inspector({ element, onCorrect }: InspectorProps) {
  const t = useTranslations("scene3d");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="px-4 py-4 border-b border-[#27272A] bg-[#18181B]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider font-medium text-[#71717A]">
              {t(`elementKind.${element.kind}`)}
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold text-[#FAFAFA] truncate">
              {element.label}
            </h2>
          </div>
          <ConfidenceBadge confidence={element.confidence} size="md" />
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Identity */}
        <section aria-labelledby="inspector-identity-heading">
          <h3
            id="inspector-identity-heading"
            className="font-display text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2"
          >
            {t("inspector.identity")}
          </h3>
          <dl className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Hash className="w-3.5 h-3.5 text-[#71717A] flex-shrink-0" aria-hidden="true" />
              <dt className="text-[#A1A1AA] w-20 flex-shrink-0">{t("inspector.id")}</dt>
              <dd className="font-mono text-[#FAFAFA] truncate">{element.id}</dd>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Tag className="w-3.5 h-3.5 text-[#71717A] flex-shrink-0" aria-hidden="true" />
              <dt className="text-[#A1A1AA] w-20 flex-shrink-0">{t("inspector.type")}</dt>
              <dd className="text-[#FAFAFA]">{t(`elementKind.${element.kind}`)}</dd>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <dt className="text-[#A1A1AA] w-20 flex-shrink-0">{t("inspector.level")}</dt>
              <dd className="font-mono text-[#FAFAFA]">{element.level_id}</dd>
            </div>
          </dl>
        </section>

        {/* Source passes */}
        <section aria-labelledby="inspector-passes-heading">
          <h3
            id="inspector-passes-heading"
            className="font-display text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2"
          >
            <GitBranch className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />
            {t("inspector.sourcePasses")}
          </h3>
          <ul className="space-y-1">
            {PASS_KEYS.map((pass) => {
              const seen = element.source_passes.includes(pass);
              return (
                <li
                  key={pass}
                  className={`flex items-center gap-2 text-sm rounded-md px-2 py-1 ${
                    seen ? "bg-[#1C1C1F] text-[#FAFAFA]" : "text-[#52525B]"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      seen ? "bg-[#F97316]" : "bg-[#3F3F46]"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="flex-1">{t(`extraction.pass.${pass}.label`)}</span>
                  <span className="font-mono text-xs text-[#71717A]">
                    {seen ? t("inspector.passSeen") : t("inspector.passSkipped")}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Model consensus */}
        <section aria-labelledby="inspector-consensus-heading">
          <h3
            id="inspector-consensus-heading"
            className="font-display text-xs font-semibold uppercase tracking-wider text-[#71717A] mb-2"
          >
            <Users className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />
            {t("inspector.modelConsensus")}
          </h3>
          <div className="rounded-md border border-[#27272A] bg-[#1C1C1F] p-3 space-y-2">
            <div>
              <div className="text-xs text-[#71717A] mb-1">{t("inspector.agreed")}</div>
              <div className="flex flex-wrap gap-1.5">
                {element.model_consensus.agreed.length === 0 ? (
                  <span className="text-xs italic text-[#52525B]">{t("inspector.none")}</span>
                ) : (
                  element.model_consensus.agreed.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center rounded-sm bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E] px-1.5 py-0.5 text-[11px] font-mono font-medium"
                    >
                      {m}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-[#71717A] mb-1">{t("inspector.divergent")}</div>
              <div className="flex flex-wrap gap-1.5">
                {element.model_consensus.divergent.length === 0 ? (
                  <span className="text-xs italic text-[#52525B]">{t("inspector.none")}</span>
                ) : (
                  element.model_consensus.divergent.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center rounded-sm bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] px-1.5 py-0.5 text-[11px] font-mono font-medium"
                    >
                      {m}
                    </span>
                  ))
                )}
              </div>
            </div>
            {element.model_consensus.notes && (
              <p className="text-xs text-[#A1A1AA] leading-relaxed pt-1 border-t border-[#27272A]">
                {element.model_consensus.notes}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Footer — correction CTA */}
      <footer className="px-4 py-3 border-t border-[#27272A] bg-[#18181B] flex-shrink-0">
        <button
          type="button"
          onClick={() => onCorrect(element.id)}
          className="w-full inline-flex items-center justify-between px-4 py-2.5 rounded-md bg-[#F97316] text-white text-sm font-medium hover:bg-[#EA580C] transition-colors focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2 focus-visible:ring-offset-[#18181B] focus-visible:outline-none"
          aria-label={t("inspector.correctAria", { label: element.label })}
        >
          <span className="inline-flex items-center gap-2">
            <PencilLine className="w-4 h-4" aria-hidden="true" />
            {t("inspector.correct")}
          </span>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
        <p className="mt-2 text-[11px] text-[#71717A] text-center leading-relaxed">
          {t("inspector.correctHint")}
        </p>
      </footer>
    </div>
  );
}
