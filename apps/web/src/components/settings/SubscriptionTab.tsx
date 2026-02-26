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
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            {t("currentPlan")}
          </h3>
        </div>

        <div className="mb-3">
          <p className="text-lg font-semibold text-gray-900">
            {t("trialPlan")}
          </p>
          <p className="text-sm text-gray-500">
            {t("trialDaysRemaining", { days: TRIAL_DAYS_REMAINING })}
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 to-brand transition-all"
              style={{ width: `${100 - progress}%` }}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          {TRIAL_DAYS_REMAINING} / {TRIAL_DAYS_TOTAL} {t("daysLeft")}
        </p>
      </div>

      {/* Pricing plans */}
      <div>
        <p className="mb-4 text-sm font-medium text-gray-700">
          {t("choosePlanAfterTrial")}
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Starter */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h4 className="text-sm font-semibold text-gray-900">Starter</h4>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900">79</span>
              <span className="text-sm text-gray-500">CHF</span>
              <span className="text-sm text-gray-400">/{t("month")}</span>
            </div>
            <ul className="mt-4 space-y-2">
              {starterFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                  {f.text}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="mt-4 w-full rounded-md border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t("choosePlan")}
            </button>
          </div>

          {/* Pro */}
          <div className="relative rounded-lg border-2 border-blue-500 bg-white p-5">
            <div className="absolute -top-2.5 left-4 rounded-full bg-blue-500 px-2.5 py-0.5 text-xs font-medium text-white">
              {t("popular")}
            </div>
            <h4 className="text-sm font-semibold text-gray-900">Pro</h4>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-2xl font-bold text-gray-900">149</span>
              <span className="text-sm text-gray-500">CHF</span>
              <span className="text-sm text-gray-400">/{t("month")}</span>
            </div>
            <ul className="mt-4 space-y-2">
              {proFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                  {f.text}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="mt-4 w-full rounded-md bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              {t("choosePlan")}
            </button>
          </div>

          {/* Enterprise */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h4 className="text-sm font-semibold text-gray-900">Enterprise</h4>
            <div className="mt-2">
              <span className="text-lg font-bold text-gray-900">
                {t("customPrice")}
              </span>
            </div>
            <ul className="mt-4 space-y-2">
              {enterpriseFeatures.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                  {f.text}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(true)}
              className="mt-4 w-full rounded-md border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t("contactUs")}
            </button>
          </div>
        </div>
      </div>

      {/* Support */}
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <Mail className="h-4 w-4 text-gray-400" />
        <p className="text-sm text-gray-500">
          {t("needHelp")} —{" "}
          <span className="font-medium text-brand">support@cantaia.ch</span>
        </p>
      </div>

      {/* Upgrade modal placeholder */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-sm font-semibold text-gray-900">
              {t("upgradeTitle")}
            </h3>
            <p className="mb-4 text-sm text-gray-500">
              {t("upgradeComingSoon")}
            </p>
            <button
              type="button"
              onClick={() => setShowUpgradeModal(false)}
              className="w-full rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              {t("understood")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
