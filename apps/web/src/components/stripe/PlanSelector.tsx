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
    price: 149,
    features: [
      "5 utilisateurs",
      "10 projets",
      "Classification emails IA",
      "PV de chantier",
      "Support email",
    ],
  },
  {
    id: "pro",
    price: 349,
    popular: true,
    features: [
      "20 utilisateurs",
      "Projets illimites",
      "Classification + analyse prix IA",
      "PV + soumissions + plans",
      "Briefing quotidien",
      "Support prioritaire",
    ],
  },
  {
    id: "enterprise",
    price: 0, // Custom
    features: [
      "Utilisateurs illimites",
      "Projets illimites",
      "Toutes les fonctionnalites",
      "SSO + integrations custom",
      "Accompagnement personnalise",
      "SLA garanti",
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
      // Open contact form or mailto
      window.open("mailto:contact@cantaia.ch?subject=Cantaia Enterprise", "_blank");
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
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else if (data.success) {
        // Plan updated successfully
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
      <div className="w-full max-w-3xl rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {t("changePlan")}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
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
                    ? "border-blue-500 shadow-md"
                    : isCurrent
                      ? "border-green-300 bg-green-50/30"
                      : "border-gray-200"
                }`}
              >
                {/* Popular badge */}
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-medium text-white">
                      <Sparkles className="h-3 w-3" />
                      Populaire
                    </span>
                  </div>
                )}

                {/* Current badge */}
                {isCurrent && (
                  <span className="mb-2 inline-block rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                    {t("currentPlan")}
                  </span>
                )}

                <h4 className="text-lg font-bold text-gray-900">
                  {t(`plan${plan.id.charAt(0).toUpperCase() + plan.id.slice(1)}`)}
                </h4>

                <div className="mt-2">
                  {isEnterprise ? (
                    <p className="text-2xl font-bold text-gray-900">
                      {t("onQuote")}
                    </p>
                  ) : (
                    <p className="text-2xl font-bold text-gray-900">
                      {plan.price} CHF
                      <span className="text-sm font-normal text-gray-500">
                        {t("perMonth")}
                      </span>
                    </p>
                  )}
                </div>

                <ul className="mt-4 space-y-2">
                  {plan.features.map((feature, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-gray-600"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={isCurrent || loading !== null}
                  className={`mt-5 w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                    isCurrent
                      ? "cursor-default border border-green-300 bg-green-50 text-green-700"
                      : isEnterprise
                        ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        : plan.popular
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "bg-gray-900 text-white hover:bg-gray-800"
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
