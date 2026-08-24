"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Coins, Loader2, ShieldAlert } from "lucide-react";
import { formatNumber } from "@/lib/format";
import {
  CREDIT_PLAN_LIST,
  RECOMMENDED_PLAN_ID,
  planLabelKey,
  savingsVsPacks,
  type CreditPlanView,
} from "./credit-config";
import { startCreditCheckout } from "./credit-checkout";

interface CreditPlansProps {
  /** Org's current subscription_plan, used to mark the active card. */
  currentPlan?: string | null;
}

/**
 * Monthly credit subscriptions (Stripe mode=subscription).
 * Cheaper per credit than packs — the delta is shown on each card.
 */
export function CreditPlans({ currentPlan }: CreditPlansProps) {
  const t = useTranslations("credits");
  const locale = useLocale();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<"forbidden" | "error" | null>(null);

  async function handleSubscribe(plan: CreditPlanView) {
    setPending(plan.id);
    setError(null);
    const result = await startCreditCheckout("subscription", plan.id);
    if (!result.ok) setError(result.reason);
    setPending(null);
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

  function isCurrent(plan: CreditPlanView): boolean {
    // CreditPlanId and organizations.subscription_plan share the same values
    // ("starter" | "pro" | "enterprise"), so an exact match is enough.
    if (!currentPlan) return false;
    return plan.id.toLowerCase() === currentPlan.toLowerCase();
  }

  if (CREDIT_PLAN_LIST.length === 0) return null;

  return (
    <section id="credits-plans" className="scroll-mt-24">
      <div className="mb-3">
        <h3 className="font-display text-[15px] font-bold text-[#FAFAFA]">
          {t("plansTitle")}
        </h3>
        <p className="mt-0.5 text-[11px] text-[#71717A]">{t("plansSubtitle")}</p>
      </div>

      {error && (
        <div
          className={`mb-3 flex items-center gap-2 rounded-lg border px-4 py-3 text-[12px] ${
            error === "forbidden"
              ? "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]"
              : "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]"
          }`}
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {error === "forbidden" ? t("adminOnly") : t("checkoutError")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CREDIT_PLAN_LIST.map((plan) => {
          const current = isCurrent(plan);
          const recommended = plan.id === RECOMMENDED_PLAN_ID;
          const savings = savingsVsPacks(plan);
          const features = planFeatures(plan);

          return (
            <div
              key={plan.id}
              className={`relative rounded-[10px] border p-5 transition-colors ${
                current
                  ? "border-[#10B981]/40 bg-[#10B981]/5"
                  : recommended
                    ? "border-[#F97316]/50 bg-[#18181B] shadow-md shadow-[#F97316]/5"
                    : "border-[#27272A] bg-[#18181B] hover:border-[#3F3F46]"
              }`}
            >
              {current ? (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-[#10B981]/30 bg-[#10B981]/20 px-3 py-0.5 text-[10px] font-semibold text-[#10B981]">
                  {t("currentPlan")}
                </div>
              ) : recommended ? (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-3 py-0.5 text-[10px] font-semibold text-white shadow-lg shadow-[#F97316]/25">
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
                  <span className="ml-1 text-[12px] text-[#71717A]">
                    CHF {t("perMonth")}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-[#F97316]">
                  <Coins className="h-3.5 w-3.5" />
                  {t("creditsPerMonth", {
                    credits: formatNumber(plan.credits, locale),
                  })}
                </div>
                <div className="mt-0.5 text-[10px] text-[#52525B]">
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
                onClick={() => handleSubscribe(plan)}
                disabled={current || pending !== null}
                className={`mt-4 w-full rounded-lg py-2.5 text-[12px] font-medium transition-all disabled:opacity-50 ${
                  current
                    ? "cursor-default border border-[#10B981]/30 bg-[#10B981]/10 text-[#10B981]"
                    : recommended
                      ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] text-white shadow-lg shadow-[#F97316]/25 hover:shadow-xl"
                      : "bg-[#FAFAFA] text-[#0F0F11] hover:bg-[#A1A1AA]"
                }`}
              >
                {pending === plan.id ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : current ? (
                  t("currentPlan")
                ) : (
                  t("subscribe")
                )}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-center text-[11px] text-[#71717A]">
        {t("plansFootnote")}
      </p>
    </section>
  );
}
