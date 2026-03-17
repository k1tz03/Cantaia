"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { AnimatedSection } from "./AnimatedSection";

export function PricingSection() {
  const t = useTranslations("landing.pricing");

  const features = [
    t("feature1"),
    t("feature2"),
    t("feature3"),
    t("feature4"),
    t("feature5"),
    t("feature6"),
  ];

  return (
    <section id="pricing" className="relative bg-gradient-to-b from-white to-[#F8FAFC]">
      <div className="mx-auto max-w-[1200px] px-6 py-20 lg:py-28">
        <AnimatedSection>
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-500 mb-5 shadow-sm">
              Tarification simple
            </div>
            <h2 className="font-display text-3xl font-bold text-[#111827] sm:text-4xl">
              {t("singleTitle")}
            </h2>
            <p className="mt-3 text-lg text-[#6B7280]">
              {t("singleSubtitle")}
            </p>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <div className="mx-auto max-w-[480px]">
            <div className="relative rounded-2xl border border-gray-100 bg-white shadow-2xl shadow-gray-200/60 overflow-hidden transition-all duration-300 hover:shadow-[0_20px_60px_rgba(37,99,235,0.12)]">
              {/* Top gradient accent */}
              <div className="h-1.5 bg-gradient-to-r from-[#2563EB] via-[#3B82F6] to-[#10B981]" />
              <div className="p-8 pt-7">
                <div className="text-center">
                  <h3 className="font-display text-xl font-bold text-[#111827]">{t("planName")}</h3>
                  <div className="mt-5 flex items-baseline justify-center gap-1">
                    <span className="font-display text-6xl font-extrabold bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] bg-clip-text text-transparent">{t("price")}</span>
                    <span className="text-xl text-[#6B7280]">{t("priceCurrency")}</span>
                  </div>
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-3 py-1 text-sm text-[#2563EB] font-medium">
                    {t("priceNote")}
                  </p>
                </div>

                <div className="mt-8 space-y-3.5">
                  {features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#10B981]/10 flex-shrink-0">
                        <svg className="h-3 w-3 text-[#10B981]" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <span className="text-[#374151]">{feature}</span>
                    </div>
                  ))}
                </div>

                <Link
                  href="/register"
                  className="mt-8 block w-full rounded-xl bg-[#2563EB] py-3.5 text-center text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:bg-[#1D4ED8] hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                >
                  {t("cta")}
                </Link>

                <p className="mt-3 text-center text-sm text-[#6B7280]">
                  {t("noCommitment")}
                </p>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
