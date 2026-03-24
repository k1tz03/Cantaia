"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, Check, Mail } from "lucide-react";

const TRIAL_DAYS_TOTAL = 14;
const TRIAL_DAYS_REMAINING = 12;

interface PlanFeature {
  text: string;
}

export function SubscriptionTab() {
  const t = useTranslations("settings");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const progress =
    ((TRIAL_DAYS_TOTAL - TRIAL_DAYS_REMAINING) / TRIAL_DAYS_TOTAL) * 100;

  const starterFeatures: PlanFeature[] = [
    { text: t("planStarterF1") },
    { text: t("planStarterF2") },
    { text: t("planStarterF3") },
    { text: t("planStarterF4") },
  ];

  const proFeatures: PlanFeature[] = [
    { text: t("planProF1") },
    { text: t("planProF2") },
    { text: t("planProF3") },
    { text: t("planProF4") },
    { text: t("planProF5") },
  ];

  const enterpriseFeatures: PlanFeature[] = [
    { text: t("planEnterpriseF1") },
    { text: t("planEnterpriseF2") },
    { text: t("planEnterpriseF3") },
    { text: t("planEnterpriseF4") },
  ];

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-[#FAFAFA]">
            {t("currentPlan")}
          </h3>
        </div>

        <div className="mb-3">
          <p className="text-lg font-semibold text-[#FAFAFA]">
            {t("trialPlan")}
          </p>
          <p className="text-sm text-[#71717A]">
            {t("trialDaysRemaining", { days: TRIAL_DAYS_REMAINING })}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#27272A]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-brand transition-all"
              style={{ width: `${100 - progress}%` }}
            />
          </div>
        </div>
        <p className="text-xs text-[#71717A]">
          {TRIAL_DAYS_REMAINING} / {TRIAL_DAYS_TOTAL} {t("daysLeft")}
        </p>
      </div>

      {/* Pricing plans */}
      <div>
        <p className="mb-4 text-sm font-medium text-[#FAFAFA]">
          {t("choosePlanAfterTrial")}
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Starter */}
          <div className="rounded-xl border border-[#27272A] bg-[#0F0F11] p-5">
            <h4 className="text-sm font-semibold text-[#FAFAFA]">Starter</h4>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-[#FAFAFA]">149</span>
              <span className="text-sm text-[#71717A]">CHF</span>
              <span className="text-sm text-[#71717A]">/{t("month")}</span>
            </div>
            <ul className="mt-4 space-y-2">
              {starterFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#71717A]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                  {f.text}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="mt-4 w-full rounded-md border border-[#27272A] py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
            >
              {t("choosePlan")}
            </button>
          </div>

          {/* Pro */}
          <div className="relative rounded-xl border-2 border-[#F97316] bg-[#0F0F11] p-5">
            <div className="absolute -top-2.5 left-4 rounded-full bg-[#F97316] px-2.5 py-0.5 text-xs font-medium text-white">
              {t("popular")}
            </div>
            <h4 className="text-sm font-semibold text-[#FAFAFA]">Pro</h4>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-[#FAFAFA]">349</span>
              <span className="text-sm text-[#71717A]">CHF</span>
              <span className="text-sm text-[#71717A]">/{t("month")}</span>
            </div>
            <ul className="mt-4 space-y-2">
              {proFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#71717A]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#F97316]" />
                  {f.text}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="mt-4 w-full rounded-md bg-cta py-2 text-sm font-medium text-white hover:bg-[#EA580C]"
            >
              {t("choosePlan")}
            </button>
          </div>

          {/* Enterprise */}
          <div className="rounded-xl border border-[#27272A] bg-[#0F0F11] p-5">
            <h4 className="text-sm font-semibold text-[#FAFAFA]">Enterprise</h4>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-[#FAFAFA]">790</span>
              <span className="text-sm text-[#71717A]">CHF</span>
              <span className="text-sm text-[#71717A]">/{t("month")}</span>
            </div>
            <ul className="mt-4 space-y-2">
              {enterpriseFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[#71717A]">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                  {f.text}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="mt-4 w-full rounded-md border border-[#27272A] py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
            >
              {t("contactUs")}
            </button>
          </div>
        </div>
      </div>

      {/* Support */}
      <div className="flex items-center gap-2 rounded-lg border border-[#27272A] bg-[#27272A] p-4">
        <Mail className="h-4 w-4 text-[#71717A]" />
        <p className="text-sm text-[#71717A]">
          {t("needHelp")} —{" "}
          <span className="font-medium text-brand">support@cantaia.io</span>
        </p>
      </div>

      {/* Upgrade modal placeholder */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-lg bg-[#0F0F11] p-6 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold text-[#FAFAFA]">
              {t("upgradeTitle")}
            </h3>
            <p className="mb-4 text-sm text-[#71717A]">
              {t("upgradeComingSoon")}
            </p>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
              className="w-full rounded-md bg-[#27272A] px-4 py-2 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A]"
            >
              {t("understood")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
