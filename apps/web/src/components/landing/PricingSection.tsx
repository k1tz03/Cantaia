"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@cantaia/ui";
import { AnimatedSection } from "./AnimatedSection";

interface PlanConfig {
  key: "starter" | "pro" | "enterprise";
  featured: boolean;
  featuresKey: "starterFeatures" | "proFeatures" | "enterpriseFeatures";
}

const plans: PlanConfig[] = [
  { key: "starter", featured: false, featuresKey: "starterFeatures" },
  { key: "pro", featured: true, featuresKey: "proFeatures" },
  { key: "enterprise", featured: false, featuresKey: "enterpriseFeatures" },
];

const featureKeys: Record<string, string[]> = {
  starterFeatures: [
    "users",
    "projects",
    "emailClassification",
    "basicPV",
    "tasks",
    "plans",
    "emailSupport",
  ],
  proFeatures: [
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
  enterpriseFeatures: [
    "users",
    "projects",
    "allProFeatures",
    "subdomain",
    "branding",
    "customIntegrations",
    "dedicatedSupport",
    "training",
  ],
};

export function PricingSection() {
  const t = useTranslations("landing.pricing");

  return (
    <section
      id="pricing"
      className="relative overflow-hidden px-6 py-24"
      style={{ backgroundColor: "#F5F2EB" }}
    >
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <AnimatedSection className="text-center">
          <h2 className="font-heading text-3xl font-bold text-slate-900 sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-600">
            {t("subtitle")}
          </p>
        </AnimatedSection>

        {/* Plan cards */}
        <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {plans.map((plan, index) => {
            const features = featureKeys[plan.featuresKey];
            const isEnterprise = plan.key === "enterprise";

            return (
              <AnimatedSection key={plan.key} delay={0.1 * (index + 1)}>
                <div
                  className={cn(
                    "relative flex h-full flex-col rounded-2xl border p-8 transition-shadow",
                    plan.featured
                      ? "border-gold bg-white shadow-xl shadow-gold/20 ring-2 ring-gold/50"
                      : "border-slate-200 bg-white shadow-sm hover:shadow-md"
                  )}
                >
                  {/* Popular badge */}
                  {plan.featured && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-gold-light to-gold px-4 py-1 text-xs font-semibold text-slate-900 shadow-md">
                      {t("popular")}
                    </div>
                  )}

                  {/* Plan name & description */}
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {t(`${plan.key}Name`)}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {t(`${plan.key}Desc`)}
                    </p>
                  </div>

                  {/* Price */}
                  <div className="mt-6">
                    {isEnterprise ? (
                      <span className="text-3xl font-bold text-slate-900">
                        {t("customPrice")}
                      </span>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm text-slate-500">
                          {t("currency")}
                        </span>
                        <span className="text-4xl font-bold text-slate-900">
                          {t(`${plan.key}Price`)}
                        </span>
                        <span className="text-sm text-slate-500">
                          {t("perMonth")}
                        </span>
                      </div>
                    )}
                    {!isEnterprise && (
                      <p className="mt-1 text-xs text-slate-400">
                        {t("perUser")}
                      </p>
                    )}
                  </div>

                  {/* Features list */}
                  <ul className="mt-8 flex-1 space-y-3">
                    {features.map((featureKey) => (
                      <li key={featureKey} className="flex items-start gap-3">
                        <Check
                          className={cn(
                            "mt-0.5 h-4 w-4 flex-shrink-0",
                            plan.featured
                              ? "text-gold"
                              : "text-slate-700"
                          )}
                        />
                        <span className="text-sm text-slate-600">
                          {t(`${plan.featuresKey}.${featureKey}`)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA button */}
                  <div className="mt-8">
                    {isEnterprise ? (
                      <a
                        href="mailto:contact@cantaia.ch"
                        className="block w-full rounded-lg border border-slate-300 px-6 py-3 text-center text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        {t("contactUs")}
                      </a>
                    ) : (
                      <button
                        type="button"
                        className={cn(
                          "block w-full rounded-lg px-6 py-3 text-center text-sm font-semibold transition-colors",
                          plan.featured
                            ? "bg-gold text-slate-900 shadow-lg shadow-gold/25 hover:bg-gold-dark"
                            : "bg-[#0A1F30] text-white hover:bg-slate-800"
                        )}
                      >
                        {t("choosePlan")}
                      </button>
                    )}
                  </div>
                </div>
              </AnimatedSection>
            );
          })}
        </div>

        {/* Trial banner */}
        <AnimatedSection delay={0.4} className="mt-10 text-center">
          <p className="text-sm font-medium text-slate-600">
            {t("subtitle")}
          </p>
        </AnimatedSection>
      </div>
    </section>
  );
}
