"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { AnimatedSection } from "./AnimatedSection";

const PLANS = [
  {
    key: "starter" as const,
    featuresKeys: [
      "users",
      "projects",
      "emailClassification",
      "basicPV",
      "tasks",
      "plans",
      "emailSupport",
    ],
    highlight: false,
  },
  {
    key: "pro" as const,
    featuresKeys: [
      "users",
      "projects",
      "emailClassification",
      "advancedPV",
      "dailyBriefing",
      "submissions",
      "intelligence",
      "visits",
      "archiving",
      "prioritySupport",
    ],
    highlight: true,
  },
  {
    key: "enterprise" as const,
    featuresKeys: [
      "users",
      "projects",
      "allProFeatures",
      "subdomain",
      "branding",
      "customIntegrations",
      "dedicatedSupport",
      "training",
    ],
    highlight: false,
  },
];

export function PricingSection() {
  const t = useTranslations("landing.pricing");

  return (
    <section id="pricing" className="relative bg-gradient-to-b from-white to-[#F8FAFC]">
      <div className="mx-auto max-w-[1200px] px-6 py-20 lg:py-28">
        <AnimatedSection>
          <div className="text-center mb-14">
            <h2 className="font-display text-3xl font-bold text-[#111827] sm:text-4xl">
              {t("title")}
            </h2>
            <p className="mt-3 text-lg text-[#6B7280]">
              {t("subtitle")}
            </p>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <div className="grid w-full max-w-5xl mx-auto grid-cols-1 gap-8 sm:grid-cols-3">
            {PLANS.map(({ key, featuresKeys, highlight }) => {
              const nameKey = `${key}Name` as const;
              const descKey = `${key}Desc` as const;
              const priceKey = `${key}Price` as const;
              const isEnterprise = key === "enterprise";

              return (
                <div
                  key={key}
                  className={`relative rounded-2xl border bg-white p-8 shadow-sm transition-shadow duration-200 hover:shadow-lg ${
                    highlight
                      ? "border-[#2563EB] border-2 shadow-md"
                      : "border-slate-200"
                  }`}
                >
                  {highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#2563EB] px-4 py-1 text-xs font-semibold text-white">
                      {t("popular")}
                    </div>
                  )}

                  <h3 className="text-lg font-semibold text-[#111827]">
                    {t(nameKey)}
                  </h3>
                  <p className="mt-2 text-sm text-[#6B7280]">{t(descKey)}</p>

                  <p className="mt-6 text-3xl font-bold text-[#111827]">
                    {t("currency")} {t(priceKey)}
                    <span className="text-sm font-normal text-[#6B7280]">
                      {t("perMonth")}
                    </span>
                  </p>

                  <ul className="mt-8 space-y-3">
                    {featuresKeys.map((fk) => (
                      <li key={fk} className="flex items-start gap-3 text-sm">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#10B981]/10 flex-shrink-0 mt-0.5">
                          <svg
                            className="h-3 w-3 text-[#10B981]"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                        <span className="text-[#374151]">
                          {t(`${key}Features.${fk}`)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={isEnterprise ? "mailto:contact@cantaia.io" : "/register"}
                    className={`mt-8 block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all duration-200 ${
                      highlight
                        ? "bg-[#2563EB] text-white shadow-lg shadow-blue-500/25 hover:bg-[#1D4ED8]"
                        : "border border-slate-200 bg-white text-[#111827] hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {isEnterprise ? t("contactUs") : t("choosePlan")}
                  </Link>
                </div>
              );
            })}
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.3}>
          <p className="mt-8 text-center text-sm text-[#6B7280]">
            {t("noCommitment")}
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
}
