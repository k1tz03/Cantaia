"use client";

import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

const PLANS = [
  {
    key: "starter" as const,
    price: 49,
    featuresKeys: [
      "users",
      "projects",
      "mail",
      "chat",
      "briefing",
      "tasks",
      "suppliers",
      "emailSupport",
    ],
    highlight: false,
  },
  {
    key: "pro" as const,
    price: 89,
    featuresKeys: [
      "allStarter",
      "submissions",
      "pv",
      "planning",
      "portal",
      "plans",
      "visits",
      "reports",
      "chat1000",
      "prioritySupport",
    ],
    highlight: true,
  },
  {
    key: "enterprise" as const,
    price: 119,
    featuresKeys: [
      "allPro",
      "direction",
      "dataIntel",
      "branding",
      "api",
      "chatUnlimited",
      "multiOrg",
      "dedicatedSupport",
    ],
    highlight: false,
  },
];

export function PricingSection() {
  const t = useTranslations("landing.pricing");

  return (
    <section id="pricing" className="relative bg-[#0F0F11]">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27272A] to-transparent" />

      <div className="mx-auto max-w-[1200px] px-6 py-24 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg text-[#71717A]">
            {t("subtitle")}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, delay: 0.15 }}
        >
          <div className="grid w-full max-w-5xl mx-auto grid-cols-1 gap-6 sm:grid-cols-3">
            {PLANS.map(({ key, price, featuresKeys, highlight }) => {
              const nameKey = `${key}Name` as const;
              const descKey = `${key}Desc` as const;
              const minKey = `${key}Min` as const;
              const isEnterprise = key === "enterprise";

              return (
                <div
                  key={key}
                  className={`relative rounded-2xl border p-8 transition-all duration-300 ${
                    highlight
                      ? "border-[#F97316] bg-[#18181B] shadow-lg shadow-[#F97316]/10 scale-[1.02]"
                      : "border-[#27272A] bg-[#18181B] hover:border-[#3F3F46]"
                  }`}
                >
                  {highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-4 py-1 text-xs font-semibold text-white shadow-lg shadow-[#F97316]/25">
                      {t("popular")}
                    </div>
                  )}

                  <h3 className="text-lg font-semibold text-white">
                    {t(nameKey)}
                  </h3>
                  <p className="mt-2 text-sm text-[#71717A]">{t(descKey)}</p>

                  <p className="mt-6 flex items-baseline gap-1">
                    <span className="text-4xl font-bold text-white">{t("currency")} {price}</span>
                    <span className="text-sm text-[#71717A]">/{t("perUser")}</span>
                  </p>
                  <p className="mt-1 text-xs text-[#52525B]">{t(minKey)}</p>

                  <ul className="mt-8 space-y-3">
                    {featuresKeys.map((fk) => (
                      <li key={fk} className="flex items-start gap-3 text-sm">
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22C55E]/10 flex-shrink-0 mt-0.5">
                          <Check className="h-3 w-3 text-[#22C55E]" />
                        </div>
                        <span className="text-[#A1A1AA]">
                          {t(`${key}Features.${fk}`)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={isEnterprise ? "mailto:contact@cantaia.io" : "/register"}
                    className={`mt-8 block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all duration-200 ${
                      highlight
                        ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white shadow-lg shadow-[#F97316]/25 hover:shadow-xl hover:shadow-[#F97316]/30"
                        : "border border-[#27272A] bg-transparent text-white hover:bg-[#27272A] hover:border-[#3F3F46]"
                    }`}
                  >
                    {isEnterprise ? t("contactUs") : t("startTrial")}
                  </Link>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-8 text-center text-sm text-[#52525B]"
        >
          {t("noCommitment")}
        </motion.p>
      </div>
    </section>
  );
}
