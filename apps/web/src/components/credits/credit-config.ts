import {
  CREDIT_PACKS,
  CREDIT_PLANS,
  LOW_CREDIT_THRESHOLD,
  SIGNUP_BONUS_CREDITS,
  creditCostFor,
} from "@cantaia/config/credit-costs";

/**
 * UI view over the shared credit config.
 *
 * `packages/config/credit-costs.ts` keys packs/plans by id and stores prices in
 * `price_chf`; the UI wants ordered lists plus a derived CHF-per-credit figure.
 * This module is the single place that does that mapping, so a config change
 * surfaces here (at compile time) rather than in five components.
 */

export interface CreditPackView {
  id: string;
  credits: number;
  priceCHF: number;
  /** priceCHF / credits — drives the "CHF / crédit" line and the best-price badge. */
  pricePerCredit: number;
}

export interface CreditPlanView extends CreditPackView {
  /** Feature bullets from the config, used when no i18n list exists. */
  features: string[];
}

export const CREDIT_PACK_LIST: CreditPackView[] = Object.values(CREDIT_PACKS)
  .map((pack) => ({
    id: pack.id,
    credits: pack.credits,
    priceCHF: pack.price_chf,
    pricePerCredit: pack.credits > 0 ? pack.price_chf / pack.credits : 0,
  }))
  .sort((a, b) => a.credits - b.credits);

export const CREDIT_PLAN_LIST: CreditPlanView[] = Object.values(CREDIT_PLANS)
  .map((plan) => ({
    id: plan.id,
    credits: plan.monthly_credits,
    priceCHF: plan.price_chf,
    pricePerCredit:
      plan.monthly_credits > 0 ? plan.price_chf / plan.monthly_credits : 0,
    features: plan.features ?? [],
  }))
  .sort((a, b) => a.credits - b.credits);

/** Cheapest CHF/credit pack — carries the "Meilleur prix" badge (the 5 000 pack). */
export const BEST_PRICE_PACK_ID: string | null =
  CREDIT_PACK_LIST.length > 0
    ? CREDIT_PACK_LIST.reduce((best, pack) =>
        pack.pricePerCredit < best.pricePerCredit ? pack : best
      ).id
    : null;

/** Highlighted subscription — Pro when present, otherwise the middle tier. */
export const RECOMMENDED_PLAN_ID: string | null = (() => {
  if (CREDIT_PLAN_LIST.length === 0) return null;
  const pro = CREDIT_PLAN_LIST.find((plan) => plan.id.toLowerCase().includes("pro"));
  if (pro) return pro.id;
  return CREDIT_PLAN_LIST[Math.floor(CREDIT_PLAN_LIST.length / 2)]!.id;
})();

/** Average CHF/credit across packs — baseline for the "~X% cheaper" plan line. */
export const AVERAGE_PACK_PRICE_PER_CREDIT: number =
  CREDIT_PACK_LIST.length > 0
    ? CREDIT_PACK_LIST.reduce((sum, pack) => sum + pack.pricePerCredit, 0) /
      CREDIT_PACK_LIST.length
    : 0;

/** How much cheaper (in %) a subscription credit is versus the pack average. */
export function savingsVsPacks(plan: CreditPlanView): number {
  if (AVERAGE_PACK_PRICE_PER_CREDIT <= 0 || plan.pricePerCredit <= 0) return 0;
  return Math.max(
    0,
    Math.round((1 - plan.pricePerCredit / AVERAGE_PACK_PRICE_PER_CREDIT) * 100)
  );
}

/**
 * i18n key for a pack name, keyed by size rather than by config id so the
 * translations survive an id rename.
 */
const PACK_LABEL_KEYS: Record<number, string> = {
  100: "packDiscovery",
  500: "packStandard",
  1000: "packPlus",
  5000: "packEnterprise",
};

export function packLabelKey(pack: CreditPackView): string | null {
  return PACK_LABEL_KEYS[pack.credits] ?? null;
}

const PLAN_LABEL_KEYS: Record<string, string> = {
  starter: "planStarter",
  pro: "planPro",
  enterprise: "planEnterprise",
};

export function planLabelKey(plan: CreditPlanView): string | null {
  const id = plan.id.toLowerCase();
  for (const [needle, key] of Object.entries(PLAN_LABEL_KEYS)) {
    if (id.includes(needle)) return key;
  }
  return null;
}

export { SIGNUP_BONUS_CREDITS, creditCostFor };

// ── Balance thresholds driving badge / banner colours ───────

/** Shared with the server (`LOW_CREDIT_THRESHOLD` in @cantaia/config). */
export const CREDIT_THRESHOLD_LOW = LOW_CREDIT_THRESHOLD;
export const CREDIT_THRESHOLD_HEALTHY = 100;

export type CreditLevel = "healthy" | "warning" | "critical";

export function creditLevel(total: number): CreditLevel {
  if (total > CREDIT_THRESHOLD_HEALTHY) return "healthy";
  if (total >= CREDIT_THRESHOLD_LOW) return "warning";
  return "critical";
}

export const CREDIT_LEVEL_COLORS: Record<
  CreditLevel,
  { text: string; bg: string; border: string; hex: string }
> = {
  healthy: {
    text: "text-[#10B981]",
    bg: "bg-[#10B981]/10",
    border: "border-[#10B981]/30",
    hex: "#10B981",
  },
  warning: {
    text: "text-[#F59E0B]",
    bg: "bg-[#F59E0B]/10",
    border: "border-[#F59E0B]/30",
    hex: "#F59E0B",
  },
  critical: {
    text: "text-[#EF4444]",
    bg: "bg-[#EF4444]/10",
    border: "border-[#EF4444]/30",
    hex: "#EF4444",
  },
};
