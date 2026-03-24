"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";

const TRIAL_DAYS_TOTAL = 14;
const TRIAL_DAYS_REMAINING = 12;

export function SubscriptionTab() {
  const t = useTranslations("settings");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const progress =
    ((TRIAL_DAYS_TOTAL - TRIAL_DAYS_REMAINING) / TRIAL_DAYS_TOTAL) * 100;

  const plans = [
    {
      name: "Starter",
      price: "149",
      features: [
        t("planStarterF1"),
        t("planStarterF2"),
        t("planStarterF3"),
        t("planStarterF4"),
      ],
      badge: null,
      btnLabel: t("choosePlan"),
      btnStyle: "default" as const,
    },
    {
      name: "Pro",
      price: "349",
      features: [
        t("planProF1"),
        t("planProF2"),
        t("planProF3"),
        t("planProF4"),
        t("planProF5"),
        "Data intelligence",
      ],
      badge: "popular" as const,
      btnLabel: t("choosePlan") + " Pro",
      btnStyle: "primary" as const,
    },
    {
      name: "Enterprise",
      price: "790",
      features: [
        t("planEnterpriseF1"),
        t("planEnterpriseF2"),
        t("planEnterpriseF3"),
        t("planEnterpriseF4"),
        "Support d\u00e9di\u00e9 + SLA",
        "Int\u00e9grations sur mesure",
      ],
      badge: null,
      btnLabel: t("contactUs"),
      btnStyle: "default" as const,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Trial banner */}
      <div className="flex items-center gap-3 rounded-[10px] border border-[#F9731630] bg-gradient-to-r from-[#1C1209] to-[#18130A] px-[18px] py-[14px]">
        <div className="text-[24px] shrink-0">&#10024;</div>
        <div className="flex-1 min-w-0">
          <div className="font-display text-[14px] font-bold text-[#FAFAFA]">
            {t("currentPlan")} : {t("trialPlan")}
          </div>
          <div className="text-[11px] text-[#A1A1AA] mt-[2px]">
            {t("trialFullAccess") || "Acc\u00e8s complet pendant 14 jours. Aucune carte requise."}
          </div>
          <div className="h-1 w-[200px] bg-[#27272A] rounded-sm mt-[6px] overflow-hidden">
            <div
              className="h-full rounded-sm bg-gradient-to-r from-[#F97316] to-[#FB923C]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="text-[12px] font-semibold text-[#FB923C] shrink-0">
          {TRIAL_DAYS_REMAINING} {t("daysLeft") || "jours restants"}
        </div>
      </div>

      {/* 3-column plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-[10px]">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative rounded-[10px] border bg-[#18181B] p-4 text-center transition-all cursor-pointer hover:border-[#3F3F46] ${
              plan.badge === "popular"
                ? "border-[#3B82F6]"
                : "border-[#27272A]"
            }`}
          >
            {/* Badge */}
            {plan.badge === "popular" && (
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-[4px] bg-[#3B82F6] px-2 py-[2px] text-[9px] font-semibold text-white">
                {t("popular")}
              </div>
            )}

            <div className="font-display text-[16px] font-bold text-[#FAFAFA]">
              {plan.name}
            </div>
            <div className="font-display text-[28px] font-extrabold text-[#FAFAFA] mt-1">
              {plan.price}{" "}
              <span className="text-[12px] font-normal text-[#71717A]">
                CHF/{t("month")}
              </span>
            </div>

            <ul className="mt-3 text-left space-y-0">
              {plan.features.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center gap-[6px] py-[3px] text-[11px] text-[#A1A1AA]"
                >
                  <span className="text-[12px] font-bold text-[#34D399]">
                    &#10003;
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className={`mt-[14px] w-full rounded-[7px] py-2 text-[11px] font-medium cursor-pointer ${
                plan.btnStyle === "primary"
                  ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white border-transparent hover:opacity-90"
                  : "border border-[#3F3F46] bg-[#27272A] text-[#D4D4D8] hover:bg-[#3F3F46]"
              }`}
            >
              {plan.btnLabel}
            </button>
          </div>
        ))}
      </div>

      {/* Support */}
      <div className="flex items-center gap-2 rounded-[10px] border border-[#27272A] bg-[#18181B] px-4 py-3">
        <Mail className="h-4 w-4 text-[#71717A]" />
        <p className="text-[11px] text-[#71717A]">
          {t("needHelp")} &mdash;{" "}
          <span className="font-medium text-[#F97316]">support@cantaia.io</span>
        </p>
      </div>

      {/* Upgrade modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-[10px] bg-[#18181B] border border-[#27272A] p-6 shadow-xl">
            <h3 className="mb-2 font-display text-[14px] font-bold text-[#FAFAFA]">
              {t("upgradeTitle")}
            </h3>
            <p className="mb-4 text-[13px] text-[#71717A]">
              {t("upgradeComingSoon")}
            </p>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
              className="w-full rounded-[7px] border border-[#3F3F46] bg-[#27272A] px-4 py-2 text-[13px] font-medium text-[#D4D4D8] hover:bg-[#3F3F46]"
            >
              {t("understood")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
