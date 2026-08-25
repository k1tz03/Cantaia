/**
 * Inspector — panneau de détail de l'élément sélectionné.
 *
 * Affiche l'identité, la confiance, les passes d'extraction, l'auto-évaluation
 * du modèle, les défauts de validation relevés sur cet élément, et le bouton
 * de correction.
 *
 * ── Renommage volontaire ──────────────────────────────────────────────────
 * Le panneau « Consensus modèles » a été renommé « Auto-évaluation du
 * modèle ». En Phase 1 un SEUL modèle tourne : parler de consensus, avec des
 * puces « Accord » et « Divergence », laissait croire à trois modèles qui se
 * seraient mis d'accord. C'est l'auto-notation d'un modèle sur son propre
 * travail — une information utile, mais qui doit s'annoncer comme telle.
 */

"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Hash,
  Tag,
  GitBranch,
  Gauge,
  PencilLine,
  ChevronRight,
  AlertOctagon,
  AlertTriangle,
  Info,
  UserCheck,
  Square,
} from "lucide-react";
import type { SceneElement, ValidationIssue } from "./types";
import type { ExtrusionFootprint } from "./adapter";
import { ConfidenceBadge } from "./ConfidenceBadge";

interface InspectorProps {
  element: SceneElement;
  /** Défauts de validation de la scène entière ; filtrés sur cet élément. */
  validationIssues?: ValidationIssue[];
  onCorrect: (elementId: string) => void;
}

const PASS_KEYS = ["identification", "metering", "verification", "pricing", "topology"] as const;

const SEVERITY_STYLE: Record<ValidationIssue["severity"], { icon: typeof Info; color: string }> = {
  error: { icon: AlertOctagon, color: "text-[#EF4444]" },
  warning: { icon: AlertTriangle, color: "text-[#F59E0B]" },
  info: { icon: Info, color: "text-[#3B82F6]" },
};

export function Inspector({ element, validationIssues = [], onCorrect }: InspectorProps) {
  const t = useTranslations("scene3d");

  const elementIssues = useMemo(
    () => validationIssues.filter((issue) => issue.element_id === element.id),
    [validationIssues, element.id],
  );

  const footprint = element.metadata?.footprint as ExtrusionFootprint | undefined;
  const humanCorrected = element.metadata?.human_corrected === true;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="px-4 py-4 border-b border-[#27272A] bg-[#18181B]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider font-medium text-[#A1A1AA]">
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
            className="font-display text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-2"
          >
            {t("inspector.identity")}
          </h3>
          <dl className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Hash className="w-3.5 h-3.5 text-[#A1A1AA] flex-shrink-0" aria-hidden="true" />
              <dt className="text-[#A1A1AA] w-20 flex-shrink-0">{t("inspector.id")}</dt>
              <dd className="font-mono text-[#FAFAFA] truncate">{element.id}</dd>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Tag className="w-3.5 h-3.5 text-[#A1A1AA] flex-shrink-0" aria-hidden="true" />
              <dt className="text-[#A1A1AA] w-20 flex-shrink-0">{t("inspector.type")}</dt>
              <dd className="text-[#FAFAFA]">{t(`elementKind.${element.kind}`)}</dd>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
              <dt className="text-[#A1A1AA] w-20 flex-shrink-0">{t("inspector.level")}</dt>
              <dd className="font-mono text-[#FAFAFA]">{element.level_id}</dd>
            </div>
            {/* Aire RÉELLE du lacet, pas l'aire de la bbox : une dalle en L
                affichait jusqu'ici la surface de son rectangle englobant. */}
            {footprint && (
              <div className="flex items-center gap-2 text-sm">
                <Square className="w-3.5 h-3.5 text-[#A1A1AA] flex-shrink-0" aria-hidden="true" />
                <dt className="text-[#A1A1AA] w-20 flex-shrink-0">{t("inspector.area")}</dt>
                <dd className="font-mono text-[#FAFAFA]">
                  {footprint.area_m2.toFixed(2)} m²
                </dd>
              </div>
            )}
          </dl>

          {humanCorrected && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#22C55E]/30 bg-[#22C55E]/10 px-2 py-1 text-[11px] text-[#22C55E]">
              <UserCheck className="w-3 h-3" aria-hidden="true" />
              {t("inspector.humanCorrected")}
            </p>
          )}
        </section>

        {/* Défauts relevés par le validator sur CET élément */}
        {elementIssues.length > 0 && (
          <section aria-labelledby="inspector-issues-heading">
            <h3
              id="inspector-issues-heading"
              className="font-display text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-2"
            >
              <AlertTriangle className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />
              {t("inspector.validationIssues")}
            </h3>
            <ul className="space-y-1.5">
              {elementIssues.map((issue, i) => {
                const style = SEVERITY_STYLE[issue.severity];
                const Icon = style.icon;
                return (
                  <li
                    key={`${issue.code}-${i}`}
                    className="flex items-start gap-2 rounded-md border border-[#27272A] bg-[#1C1C1F] px-2.5 py-2"
                  >
                    <Icon className={`mt-0.5 w-3.5 h-3.5 flex-shrink-0 ${style.color}`} aria-hidden="true" />
                    <span className="text-[11px] leading-relaxed text-[#A1A1AA]">{issue.message}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Source passes */}
        <section aria-labelledby="inspector-passes-heading">
          <h3
            id="inspector-passes-heading"
            className="font-display text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-2"
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
                    seen ? "bg-[#1C1C1F] text-[#FAFAFA]" : "text-[#A1A1AA]"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      seen ? "bg-[#F97316]" : "bg-[#3F3F46]"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="flex-1">{t(`extraction.pass.${pass}.label`)}</span>
                  <span className="font-mono text-xs text-[#A1A1AA]">
                    {seen ? t("inspector.passSeen") : t("inspector.passSkipped")}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Auto-évaluation du modèle (ex-« Consensus modèles ») */}
        <section aria-labelledby="inspector-self-assessment-heading">
          <h3
            id="inspector-self-assessment-heading"
            className="font-display text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-2"
          >
            <Gauge className="inline w-3.5 h-3.5 mr-1 -mt-0.5" aria-hidden="true" />
            {t("inspector.selfAssessment")}
          </h3>
          <div className="rounded-md border border-[#27272A] bg-[#1C1C1F] p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[...element.model_consensus.agreed, ...element.model_consensus.divergent].length === 0 ? (
                <span className="text-xs italic text-[#A1A1AA]">{t("inspector.none")}</span>
              ) : (
                <>
                  {element.model_consensus.agreed.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center rounded-sm bg-[#22C55E]/10 border border-[#22C55E]/30 text-[#22C55E] px-1.5 py-0.5 text-[11px] font-mono font-medium"
                    >
                      {m}
                    </span>
                  ))}
                  {element.model_consensus.divergent.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center rounded-sm bg-[#F59E0B]/10 border border-[#F59E0B]/30 text-[#F59E0B] px-1.5 py-0.5 text-[11px] font-mono font-medium"
                    >
                      {m}
                    </span>
                  ))}
                </>
              )}
            </div>
            {/* Le point essentiel : ce chiffre vient du modèle, pas d'une
                mesure. C'est écrit, pas sous-entendu. */}
            <p className="text-[11px] text-[#A1A1AA] leading-relaxed pt-1 border-t border-[#27272A]">
              {t("inspector.selfAssessmentHint")}
            </p>
            {element.model_consensus.notes && (
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
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
          className="w-full inline-flex items-center justify-between px-4 py-2.5 rounded-md bg-[#F97316] text-[#0F0F11] text-sm font-medium hover:bg-[#EA580C] transition-colors focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2 focus-visible:ring-offset-[#18181B] focus-visible:outline-none"
          aria-label={t("inspector.correctAria", { label: element.label })}
        >
          <span className="inline-flex items-center gap-2">
            <PencilLine className="w-4 h-4" aria-hidden="true" />
            {t("inspector.correct")}
          </span>
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </button>
        <p className="mt-2 text-[11px] text-[#A1A1AA] text-center leading-relaxed">
          {t("inspector.correctHint")}
        </p>
      </footer>
    </div>
  );
}
