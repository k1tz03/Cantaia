"use client";

import { useTranslations } from "next-intl";
import { AnimatedSection } from "./AnimatedSection";

interface FeatureCard {
  key: string;
  emoji: string;
  row: number;
  hasBadge?: boolean;
}

const features: FeatureCard[] = [
  // Row 1 - Gestion quotidienne
  { key: "f1", emoji: "\u{1F4E7}", row: 1 },
  { key: "f2", emoji: "\u{1F4DD}", row: 1 },
  { key: "f3", emoji: "\u2705", row: 1 },
  { key: "f4", emoji: "\u2600\uFE0F", row: 1 },
  // Row 2 - Pilotage projet
  { key: "f5", emoji: "\u{1F4CA}", row: 2 },
  { key: "f6", emoji: "\u{1F4D0}", row: 2 },
  { key: "f7", emoji: "\u{1F3D7}\uFE0F", row: 2 },
  { key: "f8", emoji: "\u{1F399}\uFE0F", row: 2 },
  // Row 3 - Intelligence & soumissions
  { key: "f9", emoji: "\u{1F4B0}", row: 3 },
  { key: "f10", emoji: "\u{1F4CA}", row: 3 },
  { key: "f11", emoji: "\u{1F525}", row: 3, hasBadge: true },
  { key: "f12", emoji: "\u{1F465}", row: 3 },
  // Row 4 - Administration
  { key: "f13", emoji: "\u{1F3E2}", row: 4 },
];

const rowKeys = ["row1", "row2", "row3", "row4"] as const;

const emojiBgColors: Record<number, string> = {
  1: "bg-blue-500/10",
  2: "bg-emerald-500/10",
  3: "bg-gold/10",
  4: "bg-violet-500/10",
};

export function FeaturesSection() {
  const t = useTranslations("landing.features");

  const featuresByRow = rowKeys.map((_, idx) => {
    const rowNum = idx + 1;
    return features.filter((f) => f.row === rowNum);
  });

  return (
    <section className="bg-[#0A1F30] px-6 py-24">
      <div className="mx-auto max-w-7xl">
        <AnimatedSection className="text-center">
          <h2 className="font-heading text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-400">
            {t("subtitle")}
          </p>
        </AnimatedSection>

        {featuresByRow.map((rowFeatures, rowIdx) => (
          <div key={rowKeys[rowIdx]} className="mt-12 first:mt-16">
            {/* Row label */}
            <AnimatedSection delay={0.05}>
              <div className="mb-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-700/50" />
                <span className="font-heading text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {t(rowKeys[rowIdx])}
                </span>
                <div className="h-px flex-1 bg-slate-700/50" />
              </div>
            </AnimatedSection>

            {/* Feature cards grid */}
            <div
              className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
                rowFeatures.length === 1
                  ? "lg:grid-cols-1 lg:max-w-sm lg:mx-auto"
                  : "lg:grid-cols-4"
              }`}
            >
              {rowFeatures.map((feature, featureIdx) => {
                return (
                  <AnimatedSection
                    key={feature.key}
                    delay={0.08 * featureIdx + 0.1}
                  >
                    <div className="group relative h-full rounded-xl border border-slate-700/50 bg-slate-800/50 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-600 hover:shadow-xl hover:shadow-black/20">
                      {/* Badge for f11 */}
                      {feature.hasBadge && (
                        <span className="absolute -top-2.5 right-4 rounded-full bg-gradient-to-r from-gold to-gold-dark px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg shadow-gold/25">
                          {t("f11Badge")}
                        </span>
                      )}

                      {/* Emoji icon */}
                      <div
                        className={`flex h-12 w-12 items-center justify-center rounded-lg ${emojiBgColors[feature.row]} transition-transform duration-300 group-hover:scale-110`}
                      >
                        <span className="text-2xl" role="img">
                          {feature.emoji}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="mt-4 font-heading text-base font-semibold text-white">
                        {t(`${feature.key}Title`)}
                      </h3>

                      {/* Description */}
                      <p className="mt-2 text-sm leading-relaxed text-slate-400">
                        {t(`${feature.key}Desc`)}
                      </p>
                    </div>
                  </AnimatedSection>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
