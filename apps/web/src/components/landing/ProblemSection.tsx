"use client";

import { useTranslations } from "next-intl";
import { AnimatedSection } from "./AnimatedSection";

export function ProblemSection() {
  const t = useTranslations("landing.problem");

  return (
    <section className="bg-[#FAFAFA]">
      <div className="mx-auto max-w-[1200px] px-6 py-20 lg:py-24">
        <AnimatedSection>
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="font-display text-3xl font-bold text-[#111827] sm:text-4xl">
              {t("title")}
            </h2>
            <p className="mt-4 text-lg text-[#6B7280]">
              {t("subtitle")}
            </p>
          </div>
        </AnimatedSection>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Main card — big */}
          <AnimatedSection delay={0.1}>
            <div className="h-full rounded-xl border border-gray-200 bg-white p-8 border-l-4 border-l-[#EF4444] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EF4444]/10">
                  <svg className="w-5 h-5 text-[#EF4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-display text-xl font-bold text-[#111827]">{t("painPoint1Title")}</h3>
              </div>
              <p className="text-[#6B7280] leading-relaxed">
                {t("painPoint1Desc")}
              </p>
            </div>
          </AnimatedSection>

          {/* 2 stacked cards */}
          <div className="flex flex-col gap-6">
            <AnimatedSection delay={0.2}>
              <div className="rounded-xl border border-gray-200 bg-white p-6 border-l-4 border-l-[#F59E0B] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F59E0B]/10">
                    <svg className="w-4.5 h-4.5 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="font-display text-lg font-bold text-[#111827]">{t("painPoint2Title")}</h3>
                </div>
                <p className="text-sm text-[#6B7280] leading-relaxed">
                  {t("painPoint2Desc")}
                </p>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.3}>
              <div className="rounded-xl border border-gray-200 bg-white p-6 border-l-4 border-l-[#EAB308] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAB308]/10">
                    <svg className="w-4.5 h-4.5 text-[#EAB308]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="font-display text-lg font-bold text-[#111827]">{t("painPoint3Title")}</h3>
                </div>
                <p className="text-sm text-[#6B7280] leading-relaxed">
                  {t("painPoint3Desc")}
                </p>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </div>
    </section>
  );
}
