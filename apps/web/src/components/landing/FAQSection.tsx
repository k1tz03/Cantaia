"use client";

import { useTranslations } from "next-intl";
import { AnimatedSection } from "./AnimatedSection";

export function TrustSection() {
  const t = useTranslations("landing.proof");

  const cards = [
    { emoji: t("card1Emoji"), title: t("card1Title"), description: t("card1Desc") },
    { emoji: t("card2Emoji"), title: t("card2Title"), description: t("card2Desc") },
    { emoji: t("card3Emoji"), title: t("card3Title"), description: t("card3Desc") },
  ];

  const bottomStats = [
    { value: t("stat1Value"), label: t("stat1Label") },
    { value: t("stat2Value"), label: t("stat2Label") },
    { value: t("stat3Value"), label: t("stat3Label") },
    { value: t("stat4Value"), label: t("stat4Label") },
  ];

  return (
    <section className="relative bg-[#111827] overflow-hidden">
      {/* Decorative gradient orbs */}
      <div className="absolute top-0 left-1/4 h-[400px] w-[400px] rounded-full bg-[#2563EB]/5 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 h-[300px] w-[300px] rounded-full bg-[#10B981]/5 blur-3xl" />

      <div className="relative mx-auto max-w-[1200px] px-6 py-20 lg:py-28">
        <AnimatedSection>
          <h2 className="text-center font-display text-3xl font-bold text-white sm:text-4xl">
            {t("title")}
          </h2>
        </AnimatedSection>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {cards.map((card, i) => (
            <AnimatedSection key={i} delay={i * 0.1}>
              <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-7 h-full transition-all duration-300 hover:bg-white/[0.08] hover:border-white/20">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-2xl mb-5">{card.emoji}</div>
                <h3 className="font-display text-lg font-bold text-white">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{card.description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>

        <AnimatedSection delay={0.3}>
          <div className="mt-16 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm py-8 px-4">
            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-0 md:divide-x md:divide-white/10">
              {bottomStats.map((stat, i) => (
                <div key={i} className="flex flex-col items-center px-8 md:px-12">
                  <div className="font-display text-2xl font-bold text-white">{stat.value}</div>
                  <div className="mt-1.5 text-sm font-medium text-gray-400">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
