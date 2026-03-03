"use client";

import { useTranslations } from "next-intl";
import { TrendingUp, Lightbulb, Trophy } from "lucide-react";
import { AnimatedSection } from "./AnimatedSection";

const columns = [
  { key: "col1", icon: TrendingUp },
  { key: "col2", icon: Lightbulb },
  { key: "col3", icon: Trophy },
] as const;

export function SpotlightSection() {
  const t = useTranslations("landing.spotlight");

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-gold-50 via-parchment to-gold-50 px-6 py-24">
      {/* Decorative background elements */}
      <div className="absolute -left-32 top-0 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />
      <div className="absolute -right-32 bottom-0 h-64 w-64 rounded-full bg-gold/20 blur-3xl" />

      <div className="relative mx-auto max-w-6xl">
        {/* Badge */}
        <AnimatedSection className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-white/80 px-5 py-2 text-sm font-semibold text-gold-dark shadow-sm backdrop-blur-sm">
            <span className="text-lg" role="img">
              {"\u{1F525}"}
            </span>
            {t("badge")}
          </span>
        </AnimatedSection>

        {/* Title */}
        <AnimatedSection delay={0.1} className="mt-6 text-center">
          <h2 className="font-heading text-3xl font-bold text-slate-900 sm:text-4xl lg:text-5xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-600">
            {t("subtitle")}
          </p>
        </AnimatedSection>

        {/* 3 columns */}
        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {columns.map((col, index) => {
            const Icon = col.icon;
            return (
              <AnimatedSection
                key={col.key}
                delay={0.15 * (index + 1)}
              >
                <div className="group flex h-full flex-col items-center rounded-2xl border border-gold/20 bg-white/70 p-8 text-center shadow-sm backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-gold/10">
                  {/* Icon */}
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gold-light to-gold-dark shadow-lg shadow-gold/30 transition-transform duration-300 group-hover:scale-110">
                    <Icon className="h-8 w-8 text-white" />
                  </div>

                  {/* Title */}
                  <h3 className="mt-6 font-heading text-lg font-bold text-slate-900">
                    {t(`${col.key}Title`)}
                  </h3>

                  {/* Description */}
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {t(`${col.key}Desc`)}
                  </p>
                </div>
              </AnimatedSection>
            );
          })}
        </div>
      </div>
    </section>
  );
}
