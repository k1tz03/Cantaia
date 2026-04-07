"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X, Check, Loader2, Sparkles } from "lucide-react";

interface PlanSelectorProps {
  currentPlan: string;
  hasSubscription: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const PLANS = [
  {
    id: "starter",
    pricePerUser: 49,
    minUsers: 1,
    maxUsers: 5,
    features: [
      "1-5 utilisateurs",
      "5 projets",
      "Mail IA (1 boite)",
      "Chat IA (200 msg/mois)",
      "Briefing quotidien",
      "Fournisseurs (50 max)",
      "Support email (48h)",
    ],
  },
  {
    id: "pro",
    pricePerUser: 89,
    minUsers: 5,
    maxUsers: 30,
    popular: true,
    features: [
      "5-30 utilisateurs",
      "30 projets",
      "Tout le Starter +",
      "Soumissions completes",
      "PV + transcription vocale",
      "Planning IA + Gantt",
      "Portail terrain (PIN)",
      "Plans + analyse IA",
      "Chat IA (1000 msg/mois)",
      "Support prioritaire (24h)",
    ],
  },
  {
    id: "enterprise",
    pricePerUser: 119,
    minUsers: 15,
    maxUsers: Infinity,
    features: [
      "15+ utilisateurs",
      "Projets illimites",
      "Tout le Pro +",
      "Direction & rentabilite",
      "Data Intelligence",
      "Branding custom",
      "API access",
      "Chat IA illimite",
      "Support dedie (<4h)",
    ],
  },
];

export default function PlanSelector({
  currentPlan,
  hasSubscription,
  onClose,
  onSuccess,
}: PlanSelectorProps) {
  const t = useTranslations("admin");
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSelectPlan(planId: string) {
    if (planId === "enterprise") {
      window.open("mailto:contact@cantaia.io?subject=Cantaia Enterprise", "_blank");
      return;
    }

    setLoading(planId);
    try {
      const endpoint = hasSubscription
        ? "/api/stripe/update-subscription"
        : "/api/stripe/create-checkout";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      } else if (data.success) {
        onSuccess();
        onClose();
      }
    } catch (err) {
      console.error("Failed to select plan:", err);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-3xl rounded-lg bg-[#0F0F11] p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[#FAFAFA]">
            {t("changePlan")}
          </h3>
          <button
            onClick={onClose}
            className="text-[#71717A] hover:text-[#FAFAFA]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const isEnterprise = plan.id === "enterprise";

            return (
              <div
                key={plan.id}
                className={`relative rounded-lg border-2 p-5 ${
                  plan.popular
                    ? "border-[#F97316] shadow-md shadow-[#F97316]/10"
                    : isCurrent
                      ? "border-green-300 bg-green-500/10"
                      : "border-[#27272A]"
                }`}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-3 py-0.5 text-xs font-medium text-white">
                      <Sparkles className="h-3 w-3" />
                      Populaire
                    </span>
                  </div>
                )}

                {/* Current badge */}
                {isCurrent && (
                  <span className="mb-2 inline-block rounded-full bg-green-500/10 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                    {t("currentPlan")}
                  </span>
                )}

                <h4 className="text-lg font-bold text-[#FAFAFA]">
                  {t(`plan${plan.id.charAt(0).toUpperCase() + plan.id.slice(1)}`)}
                </h4>

                <div className="mt-2">
                  <p className="text-2xl font-bold text-[#FAFAFA]">
                    {plan.pricePerUser} CHF
                    <span className="text-sm font-normal text-[#71717A]">
                      /utilisateur/mois
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-[#52525B]">
                    {plan.minUsers === 1
                      ? `des ${plan.pricePerUser} CHF/mois`
                      : `min. ${plan.minUsers} utilisateurs = ${plan.pricePerUser * plan.minUsers} CHF/mois`}
                  </p>
                </div>

                <ul className="mt-4 space-y-2">
                  {plan.features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-[#A1A1AA]"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#22C55E]" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={isCurrent || loading !== null}
                  className={`mt-5 w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                    isCurrent
                      ? "cursor-default border border-green-300 bg-green-500/10 text-green-700 dark:text-green-400"
                      : isEnterprise
                        ? "border border-[#27272A] bg-[#0F0F11] text-[#FAFAFA] hover:bg-[#27272A]"
                        : plan.popular
                          ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white shadow-lg shadow-[#F97316]/25 hover:shadow-xl"
                          : "bg-[#FAFAFA] text-[#0F0F11] hover:bg-[#A1A1AA]"
                  } disabled:opacity-50`}
                >
                  {loading === plan.id ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : isCurrent ? (
                    t("currentPlan")
                  ) : isEnterprise ? (
                    t("contact")
                  ) : (
                    t("upgrade")
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
