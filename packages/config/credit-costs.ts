// ============================================================
// Cantaia — Credit system: cost grid, packs and subscription plans
// ============================================================
// Single source of truth for the credits-based metering that replaced the
// per-plan `aiCalls` quota enforcement (see plan-features.ts → checkUsageLimit).
//
// Pricing anchor: 1 credit ≈ 0.19 CHF bought as a pack, ≈ 0.08 CHF included
// in a subscription. Costs below are calibrated on the real API cost of each
// action multiplied by a 3-5x margin.

/**
 * Credits consumed per `action_type`.
 *
 * IMPORTANT — the keys are the REAL `action_type` values written to
 * `api_usage_logs` (`ApiActionType` in @cantaia/database), NOT the prose
 * labels used in the pricing spec. Where the spec label differs from the
 * enum value, an alias key is added so both spell the same price
 * (e.g. `submission_parse` is the enum, `submission_analyze` the spec label).
 *
 * A `0` cost means "included, not metered" — email classification and the
 * nightly agents are bundled into the plan rather than charged per call.
 *
 * Unknown actions fall back to DEFAULT_CREDIT_COST (1) via creditCostFor().
 */
export const CREDIT_COSTS: Record<string, number> = {
  // ---- Mail ----
  chat_message: 1,
  email_reply: 2,
  compose_email: 2,
  // Classification is bundled (fair-use). Sync is only blocked when the org
  // has a zero balance AND is far above the free classification allowance.
  email_classify: 0,
  reclassify: 0,
  task_extract: 1,
  // Mail summaries are generated in batches of 10 → 5 credits per batch.
  email_summary: 5,
  briefing_generate: 0,

  // ---- Submissions ----
  submission_parse: 20,
  submission_analyze: 20,
  submission_filter_items: 2,
  offer_parse: 5,
  negotiation_email: 2,
  price_estimate: 10,
  estimate_budget: 10,

  // ---- PV & site visits ----
  // Covers transcription + drafting: charged once on generation so the
  // preceding `pv_transcribe` call stays free.
  pv_generate: 15,
  pv_transcribe: 0,
  visit_report: 10,
  handwritten_notes: 5,
  // Site-visit audio → Whisper. Unlike `pv_transcribe` (bundled into
  // `pv_generate`) a visit transcription is a standalone, user-triggered
  // action that can be run without ever generating a report, so it is
  // metered on its own.
  visit_transcribe: 3,

  // ---- Plans ----
  plan_analyze: 10,
  plan_detect: 0,
  plan_version_check: 0,
  estimate_v2: 30,
  plan_3d_extract: 40,

  // ---- Planning ----
  planning_generate: 10,
  planning_generation: 10,

  // ---- Intelligence ----
  ai_alerts: 2,
  executive_summary: 5,

  // ---- Pricing & suppliers ----
  price_extract: 5,
  supplier_search: 3,
  supplier_enrichment: 3,
  supplier_match: 3,

  // ---- Calendar ----
  calendar_ai_command: 1,
  calendar_sync: 0,

  // ---- Agents ----
  // Interactive agent sessions are metered; the nightly autonomous agents are
  // included in Pro+ subscriptions (and disabled for pay-as-you-go orgs, which
  // is enforced at the plan level, not here).
  agent_session: 10,
  "agent_submission-analyzer": 10,
  "agent_plan-estimator": 10,
  "agent_email-classifier": 0,
  "agent_price-extractor": 10,
  "agent_briefing-generator": 0,
  "agent_email-drafter": 0,
  "agent_followup-engine": 0,
  "agent_supplier-monitor": 0,
  "agent_project-memory": 0,
  "agent_meeting-prep": 0,
};

/** Charged when an action_type has no entry in CREDIT_COSTS. */
export const DEFAULT_CREDIT_COST = 1;

/**
 * Resolve the credit cost of an action. Unknown actions cost
 * DEFAULT_CREDIT_COST so a new AI route is never accidentally free.
 */
export function creditCostFor(actionType: string | null | undefined): number {
  if (!actionType) return DEFAULT_CREDIT_COST;
  const cost = CREDIT_COSTS[actionType];
  return typeof cost === "number" ? cost : DEFAULT_CREDIT_COST;
}

/**
 * Metering key for an agent run.
 *
 * Every agent type has its own `agent_<type>` entry above (0 for the bundled
 * ones such as `email-classifier` / `briefing-generator`, 10 for the heavy
 * interactive ones). A type that is NOT in the grid must fall back to the
 * generic `agent_session` price — NOT to DEFAULT_CREDIT_COST, which would
 * silently sell a 25-iteration Sonnet run for 1 credit.
 */
export function agentActionType(agentType: string): string {
  const key = `agent_${agentType}`;
  return key in CREDIT_COSTS ? key : "agent_session";
}

/** Credits granted once, when an organization is created. */
// 300 ≈ 3-4 heavy actions (a submission analysis at 20 + a plan estimation at
// 30 + a PV at 15 still leaves room), so an evaluator can genuinely try the
// product before hitting the paywall. Marketing copy must match this number.
export const SIGNUP_BONUS_CREDITS = 300;

// ------------------------------------------------------------
// Credit packs — one-shot purchase, Stripe mode=payment, 12 months validity
// ------------------------------------------------------------

export type CreditPackId = "discovery" | "standard" | "plus" | "enterprise";

export interface CreditPack {
  id: CreditPackId;
  credits: number;
  price_chf: number;
  /** Name of the env var holding the Stripe Price ID for this pack. */
  stripe_env: string;
}

export const CREDIT_PACKS: Record<CreditPackId, CreditPack> = {
  discovery:  { id: "discovery",  credits: 100,   price_chf: 19,  stripe_env: "STRIPE_PRICE_CREDIT_100" },
  standard:   { id: "standard",   credits: 500,   price_chf: 79,  stripe_env: "STRIPE_PRICE_CREDIT_500" },
  plus:       { id: "plus",       credits: 1_000, price_chf: 139, stripe_env: "STRIPE_PRICE_CREDIT_1000" },
  enterprise: { id: "enterprise", credits: 5_000, price_chf: 590, stripe_env: "STRIPE_PRICE_CREDIT_5000" },
};

export const CREDIT_PACK_IDS = Object.keys(CREDIT_PACKS) as CreditPackId[];

export function isCreditPackId(value: unknown): value is CreditPackId {
  return typeof value === "string" && value in CREDIT_PACKS;
}

// ------------------------------------------------------------
// Subscriptions — per organization/month, Stripe mode=subscription
// ------------------------------------------------------------

export type CreditPlanId = "starter" | "pro" | "enterprise";

export interface CreditPlan {
  id: CreditPlanId;
  price_chf: number;
  /** Credits granted on every successful invoice payment. */
  monthly_credits: number;
  /** Name of the env var holding the Stripe Price ID for this subscription. */
  stripe_env: string;
  /**
   * Name of the pre-credits env var for the same plan. Used as a fallback so
   * billing keeps working before the new Price IDs are provisioned.
   */
  legacy_stripe_env: string;
  features: string[];
}

export const CREDIT_PLANS: Record<CreditPlanId, CreditPlan> = {
  starter: {
    id: "starter",
    price_chf: 49,
    monthly_credits: 600,
    stripe_env: "STRIPE_PRICE_SUB_STARTER",
    legacy_stripe_env: "STRIPE_PRICE_STARTER",
    features: ["5 utilisateurs max", "Tous les modules"],
  },
  pro: {
    id: "pro",
    price_chf: 149,
    monthly_credits: 2_200,
    stripe_env: "STRIPE_PRICE_SUB_PRO",
    legacy_stripe_env: "STRIPE_PRICE_PRO",
    features: ["20 utilisateurs", "Agents nocturnes", "Branding personnalisé"],
  },
  enterprise: {
    id: "enterprise",
    price_chf: 399,
    monthly_credits: 7_000,
    stripe_env: "STRIPE_PRICE_SUB_ENTERPRISE",
    legacy_stripe_env: "STRIPE_PRICE_ENTERPRISE",
    features: ["Utilisateurs illimités", "Data intelligence", "Support dédié"],
  },
};

export const CREDIT_PLAN_IDS = Object.keys(CREDIT_PLANS) as CreditPlanId[];

export function isCreditPlanId(value: unknown): value is CreditPlanId {
  return typeof value === "string" && value in CREDIT_PLANS;
}

/**
 * Monthly credit allocation for a plan name as stored in
 * `organizations.subscription_plan`. Returns 0 for trial / unknown plans.
 */
export function monthlyAllocationFor(plan: string | null | undefined): number {
  if (!plan) return 0;
  return CREDIT_PLANS[plan as CreditPlanId]?.monthly_credits ?? 0;
}

/**
 * Monthly recurring revenue (CHF) an organization on `plan` generates.
 *
 * Flat price PER ORGANIZATION — the credits model has no per-seat component,
 * so MRR never depends on the member count. Trial / unknown plans → 0.
 *
 * This is THE function every MRR/ARR figure must go through (super-admin
 * dashboard, billing page, analytics) so a price change in CREDIT_PLANS
 * propagates everywhere at once.
 */
export function subscriptionRevenueFor(plan: string | null | undefined): number {
  if (!plan) return 0;
  return CREDIT_PLANS[plan as CreditPlanId]?.price_chf ?? 0;
}

// ------------------------------------------------------------
// Transactions
// ------------------------------------------------------------

/** Ledger entry kinds recorded in `credit_transactions.kind`. */
export const CREDIT_TRANSACTION_KINDS = [
  "signup_bonus",
  "purchase",
  "subscription_grant",
  "subscription_expiry",
  "consumption",
  "refund",
  "admin_adjust",
] as const;

export type CreditTransactionKind = (typeof CREDIT_TRANSACTION_KINDS)[number];

export function isCreditTransactionKind(value: unknown): value is CreditTransactionKind {
  return typeof value === "string" && (CREDIT_TRANSACTION_KINDS as readonly string[]).includes(value);
}

/** Balance threshold under which the UI shows a "low credits" warning. */
export const LOW_CREDIT_THRESHOLD = 20;
