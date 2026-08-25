"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X, Check, Loader2, Coins, ShieldAlert } from "lucide-react";
import { formatNumber } from "@/lib/format";
import {
  CREDIT_PLAN_LIST,
  RECOMMENDED_PLAN_ID,
  planLabelKey,
  savingsVsPacks,
  type CreditPlanView,
} from "@/components/credits/credit-config";
import { startCreditCheckout } from "@/components/credits/credit-checkout";

/**
 * Plan picker modal (Admin → Abonnement → "Changer de plan").
 *
 * ONE pricing grid. The cards are built from CREDIT_PLAN_LIST — i.e. from
 * `CREDIT_PLANS` in @cantaia/config/credit-costs, the same source the Settings
 * → Abonnement tab, the paywall and the Stripe checkout routes read. There is
 * NO per-user price, no minimum-seat multiplication and no "X CHF/utilisateur"
 * anywhere: Cantaia bills one flat price per ORGANIZATION plus a monthly
 * credit allocation.
 *
 * Two flows:
 *   - no subscription yet → Stripe Checkout   (/api/credits/checkout)
 *   - already subscribed  → prorated in-place plan change
 *                           (/api/stripe/update-subscription)
 */

interface PlanSelectorProps {
  currentPlan: string;
  hasSubscription: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function PlanSelector({
  currentPlan,
  hasSubscription,
  onClose,
  onSuccess,
}: PlanSelectorProps) {
  const t = useTranslations("credits");
  const tAdmin = useTranslations("admin");
  const locale = useLocale();
  const [pending, setPending] = useState<string | null>(null);
  // `already_subscribed` cannot occur here (this branch only runs when the org
  // has no subscription yet), but startCreditCheckout's result type includes it
  // — widen the state so the assignment type-checks, treated as a generic error.
  const [error, setError] = useState<
    "forbidden" | "error" | "already_subscribed" | null
  >(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSelectPlan(plan: CreditPlanView) {
    setPending(plan.id);
    setError(null);

    try {
      if (hasSubscription) {
        const res = await fetch("/api/stripe/update-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: plan.id }),
        });

        if (res.status === 403) {
          setError("forbidden");
          return;
        }
        if (!res.ok) {
          setError("error");
          return;
        }

        onSuccess();
        onClose();
        return;
      }

      // No subscription yet → Stripe Checkout. On success the browser navigates
      // away, so nothing after this line runs.
      const result = await startCreditCheckout("subscription", plan.id);
      if (!result.ok) setError(result.reason);
    } catch {
      setError("error");
    } finally {
      setPending(null);
    }
  }

  function planName(plan: CreditPlanView): string {
    const key = planLabelKey(plan);
    return key ? t(key) : plan.id;
  }

  function planFeatures(plan: CreditPlanView): string[] {
    const key = planLabelKey(plan);
    if (key) {
      // planStarter → planFeatures.starter
      const slug = key.replace(/^plan/, "").toLowerCase();
      try {
        const raw = t.raw(`planFeatures.${slug}`);
        if (Array.isArray(raw) && raw.length > 0) return raw as string[];
      } catch {
        // fall through to the config-provided list
      }
    }
    return plan.features;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-xl border border-[#27272A] bg-[#0F0F11] p-6 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-start justify-between">
          <h3 className="font-display text-[16px] font-bold text-[#FAFAFA]">
            {tAdmin("changePlan")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("paywallClose")}
            className="rounded-md p-1 text-[#A1A1AA] transition-colors hover:bg-[#27272A] hover:text-[#FAFAFA]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-5 text-[11px] text-[#A1A1AA]">{t("plansSubtitle")}</p>

        {error && (
          <div
            className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-[12px] ${
              error === "forbidden"
                ? "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]"
                : "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]"
            }`}
          >
            <ShieldAlert className="h-4 w-4 shrink-0" />
            {error === "forbidden" ? t("adminOnly") : t("checkoutError")}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {CREDIT_PLAN_LIST.map((plan) => {
            const isCurrent =
              !!currentPlan && plan.id.toLowerCase() === currentPlan.toLowerCase();
            const recommended = plan.id === RECOMMENDED_PLAN_ID;
            const savings = savingsVsPacks(plan);
            const features = planFeatures(plan);

            return (
              <div
                key={plan.id}
                className={`relative rounded-[10px] border p-5 transition-colors ${
                  isCurrent
                    ? "border-[#10B981]/40 bg-[#10B981]/5"
                    : recommended
                      ? "border-[#F97316]/50 bg-[#18181B] shadow-md shadow-[#F97316]/5"
                      : "border-[#27272A] bg-[#18181B] hover:border-[#3F3F46]"
                }`}
              >
                {isCurrent ? (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#10B981]/30 bg-[#10B981]/20 px-3 py-0.5 text-[10px] font-semibold text-[#10B981]">
                    {t("currentPlan")}
                  </div>
                ) : recommended ? (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-3 py-0.5 text-[10px] font-semibold text-[#0F0F11] shadow-lg shadow-[#F97316]/25">
                    {t("recommended")}
                  </div>
                ) : null}

                <div className="mb-4 mt-1 text-center">
                  <div className="font-display text-[15px] font-bold text-[#FAFAFA]">
                    {planName(plan)}
                  </div>

                  <div className="mt-2">
                    <span className="font-display text-[30px] font-extrabold text-[#FAFAFA]">
                      {plan.priceCHF}
                    </span>
                    <span className="ml-1 text-[12px] text-[#A1A1AA]">
                      CHF {t("perMonth")}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-[#F97316]">
                    <Coins className="h-3.5 w-3.5" />
                    {t("creditsPerMonth", {
                      credits: formatNumber(plan.credits, locale),
                    })}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#A1A1AA]">
                    {t("perCredit", {
                      price: formatNumber(plan.pricePerCredit, locale, {
                        minimumFractionDigits: 3,
                        maximumFractionDigits: 3,
                      }),
                    })}
                  </div>
                  {savings > 0 && (
                    <div className="mt-1 text-[10px] font-medium text-[#10B981]">
                      {t("vsPacks", { percent: savings })}
                    </div>
                  )}
                </div>

                {features.length > 0 && (
                  <ul className="space-y-1.5">
                    {features.map((feature) => (
                      <li
                        key={feature}
                        className="flex items-start gap-2 text-[11px] text-[#A1A1AA]"
                      >
                        <Check className="mt-[2px] h-3 w-3 shrink-0 text-[#22C55E]" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  onClick={() => handleSelectPlan(plan)}
                  disabled={isCurrent || pending !== null}
                  className={`mt-4 w-full rounded-lg py-2.5 text-[12px] font-medium transition-all disabled:opacity-50 ${
                    isCurrent
                      ? "cursor-default border border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]"
                      : recommended
                        ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] text-[#0F0F11] shadow-lg shadow-[#F97316]/25 hover:shadow-xl"
                        : "bg-[#FAFAFA] text-[#0F0F11] hover:bg-[#A1A1AA]"
                  }`}
                >
                  {pending === plan.id ? (
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  ) : isCurrent ? (
                    t("currentPlan")
                  ) : (
                    t("subscribe")
                  )}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-center text-[11px] text-[#A1A1AA]">
          {t("plansFootnote")}
        </p>
      </div>
    </div>
  );
}
