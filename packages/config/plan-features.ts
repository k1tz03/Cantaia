import { creditCostFor } from "./credit-costs";

export type PlanName = "trial" | "starter" | "pro" | "enterprise";

export type FeatureName =
  | "budgetAI"
  | "planning"
  | "dataIntel"
  | "branding"
  | "export"
  | "visualization3d"
  | "nightlyAgents";

export interface PlanLimits {
  maxProjects: number;
  maxUsers: number;
  aiCalls: number;
  maxEmailsSync: number;
  maxPlanAnalyses: number;
  maxSubmissions: number;
  maxStorage: number;
  budgetAI: boolean;
  planning: false | "basic" | "full";
  dataIntel: boolean;
  branding: boolean;
  export: boolean;
  /**
   * 3D viewer (ADR-001, §29-30). Tri-state:
   *   false     → no 3D at all (trial, starter)
   *   "preview" → Pro: read-only 3D viewer, PNG watermarked export, no glTF
   *   "full"    → Enterprise: 3D viewer + glTF export + future BIM integrations
   */
  visualization3d: false | "preview" | "full";
  /**
   * Autonomous nightly agents (email-drafter, followup-engine,
   * supplier-monitor, project-memory, meeting-prep — the `/api/cron/*` jobs).
   *
   * They run unattended and burn tokens every night, so they are a Pro+
   * benefit rather than something a pay-as-you-go org gets by default. The
   * crons enforce this per organization via `orgHasNightlyAgents()` below.
   */
  nightlyAgents: boolean;
  /**
   * Per-month cap on Passe 5 extractions for this org
   * (`action_type = 'plan_3d_extract'` rows in `api_usage_logs`).
   *
   * Gated INDEPENDENTLY of the general `aiCalls` budget because each 3D
   * extraction runs a vision-heavy Claude call worth ~10-30x a normal
   * classify-email call. Rolling the cost into the generic counter would
   * silently kill day-to-day Mail classification once a team extracts a
   * few plans. Keep them separate.
   *
   * `0` means: feature effectively disabled even if `visualization3d !== false`
   * (defence in depth — the route must check BOTH this AND `canAccess`).
   * `Infinity` = unmetered (Enterprise).
   */
  max3dExtractionsPerMonth: number;
}

/**
 * Canonical `action_type` value written to `api_usage_logs` when a Passe 5
 * extraction runs. Kept as a const so routes don't stringify by hand and
 * the 3D-specific `check3dExtractionLimit()` below has a single source of
 * truth to count against.
 *
 * Also listed alongside the other AI action types in §22 of CLAUDE.md.
 */
export const PLAN_3D_EXTRACT_ACTION = "plan_3d_extract" as const;
export type Plan3dExtractAction = typeof PLAN_3D_EXTRACT_ACTION;

/**
 * @deprecated PER-USER PRICING IS DEAD. Cantaia bills ONE flat price per
 * organization plus credits — see `CREDIT_PLANS` in `./credit-costs.ts`
 * (Starter 49 / Pro 149 / Enterprise 399 CHF per ORG per month).
 *
 * Nothing may derive a price, an MRR figure or a customer-facing label from
 * this map: use `subscriptionRevenueFor(plan)` for revenue and `CREDIT_PLANS`
 * for anything a customer reads. It survives only because the `maxUsers` seat
 * caps mirrored in PLAN_FEATURES came from here, and is scheduled for deletion
 * once the legacy per-seat Stripe subscriptions are migrated.
 */
export const PLAN_PRICING: Record<PlanName, { pricePerUser: number; minUsers: number; maxUsers: number }> = {
  trial:      { pricePerUser: 0,   minUsers: 1,  maxUsers: 3 },
  starter:    { pricePerUser: 49,  minUsers: 1,  maxUsers: 5 },
  pro:        { pricePerUser: 89,  minUsers: 5,  maxUsers: 30 },
  enterprise: { pricePerUser: 119, minUsers: 15, maxUsers: Infinity },
};

export const PLAN_FEATURES: Record<PlanName, PlanLimits> = {
  trial: {
    maxProjects: 2, maxUsers: 3, aiCalls: 50, maxEmailsSync: 50,
    maxPlanAnalyses: 2, maxSubmissions: 1, maxStorage: 1_000_000_000,
    budgetAI: false, planning: false, dataIntel: false, branding: false, export: false,
    nightlyAgents: false,
    visualization3d: false, max3dExtractionsPerMonth: 0,
  },
  starter: {
    maxProjects: 5, maxUsers: 5, aiCalls: 200, maxEmailsSync: 500,
    maxPlanAnalyses: 5, maxSubmissions: 3, maxStorage: 5_000_000_000,
    budgetAI: false, planning: false, dataIntel: false, branding: false, export: true,
    nightlyAgents: false,
    visualization3d: false, max3dExtractionsPerMonth: 0,
  },
  pro: {
    maxProjects: 30, maxUsers: 30, aiCalls: 1000, maxEmailsSync: Infinity,
    maxPlanAnalyses: 50, maxSubmissions: Infinity, maxStorage: 50_000_000_000,
    budgetAI: true, planning: "full", dataIntel: false, branding: false, export: true,
    nightlyAgents: true,
    // Pro: 20 extractions/mois — chaque plan architectural peut demander 1-3
    // passes (façades + étages). 20 couvre ~6-10 projets/mois.
    visualization3d: "preview", max3dExtractionsPerMonth: 20,
  },
  enterprise: {
    maxProjects: Infinity, maxUsers: Infinity, aiCalls: Infinity, maxEmailsSync: Infinity,
    maxPlanAnalyses: Infinity, maxSubmissions: Infinity, maxStorage: 500_000_000_000,
    budgetAI: true, planning: "full", dataIntel: true, branding: true, export: true,
    nightlyAgents: true,
    visualization3d: "full", max3dExtractionsPerMonth: Infinity,
  },
};

/**
 * Check if a plan has access to a specific feature.
 */
export function canAccess(plan: PlanName | string, feature: FeatureName): boolean {
  const limits = PLAN_FEATURES[plan as PlanName];
  if (!limits) return false;
  const value = limits[feature];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return true; // "basic" or "full"
  return false;
}

/**
 * Does this organization's plan include the autonomous nightly agents?
 *
 * CONTRACT for the `/api/cron/*` agent jobs (email-drafter, followup-engine,
 * supplier-monitor, project-memory, meeting-prep): call this ONCE per
 * organization inside the loop and `continue` when it returns false, e.g.
 *
 *   for (const orgId of orgIds) {
 *     if (!(await orgHasNightlyAgents(admin, orgId))) continue;
 *     …run the agent for that org…
 *   }
 *
 * `supabase` must be the ADMIN client — the crons run without a user session,
 * so RLS would hide `organizations` from them.
 *
 * FAILS OPEN: an unreadable `organizations` row (missing column, transient DB
 * error) returns `true` so an infrastructure hiccup never silently stops every
 * customer's nightly automation. Only an explicit trial/starter plan is a
 * "no".
 */
export async function orgHasNightlyAgents(
  supabase: any,
  organizationId: string
): Promise<boolean> {
  if (!organizationId) return false;
  try {
    const { data, error } = await supabase
      .from("organizations")
      .select("subscription_plan")
      .eq("id", organizationId)
      .maybeSingle();

    if (error || !data) return true; // fail-open
    return canAccess(data.subscription_plan || "trial", "nightlyAgents");
  } catch {
    return true; // fail-open
  }
}

/**
 * Get the minimum plan required for a feature.
 */
export function requiredPlanFor(feature: FeatureName): PlanName {
  const plans: PlanName[] = ["trial", "starter", "pro", "enterprise"];
  for (const plan of plans) {
    if (canAccess(plan, feature)) return plan;
  }
  return "enterprise";
}

/**
 * Count AI calls for an org this month. Uses admin client to bypass RLS.
 * 3D extractions (`plan_3d_extract`) are EXCLUDED: they are metered on their
 * own axis via `max3dExtractionsPerMonth` (see check3dExtractionLimit) and
 * must not double-count against the generic aiCalls budget.
 */
export async function getUsageCount(
  supabase: any,
  organizationId: string
): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("api_usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .neq("action_type", PLAN_3D_EXTRACT_ACTION)
    .gte("created_at", startOfMonth.toISOString());

  if (error) {
    console.error("[plan-features] Failed to count usage:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Result of `checkUsageLimit`.
 *
 * The legacy fields (`current`, `limit`, `requiredPlan`) are preserved on the
 * denied branch so the ~18 existing AI routes keep compiling and keep returning
 * their `{ error: "usage_limit_reached", current, limit, required_plan }` body.
 * The credit fields are ADDITIVE.
 */
export type UsageLimitResult =
  | {
      allowed: true;
      /** Credits this action cost (0 when bundled / when running on legacy quotas). */
      required_credits: number;
      /** Balance after the debit — `null` when the org is on legacy quotas. */
      remaining_credits: number | null;
      insufficient_credits: false;
    }
  | {
      allowed: false;
      /**
       * Credits mode: remaining balance. Legacy mode: AI calls consumed this month.
       */
      current: number;
      /**
       * Credits mode: credits required by the action. Legacy mode: monthly cap.
       */
      limit: number;
      requiredPlan: PlanName;
      /** `true` → the route should answer 402 insufficient_credits, not 429/403. */
      insufficient_credits: boolean;
      required_credits: number;
      remaining_credits: number;
    };

/** Next plan up from the current one (used as the upgrade hint). */
function nextPlanAfter(plan: PlanName | string): PlanName {
  const plans: PlanName[] = ["trial", "starter", "pro", "enterprise"];
  const idx = plans.indexOf(plan as PlanName);
  return plans[Math.min(idx + 1, plans.length - 1)] as PlanName;
}

/**
 * Does this org run on credits? Presence of a `credit_balances` row is the
 * switch. Returns `false` when the table does not exist (migration 090 not
 * applied) so pre-migration deployments transparently keep the old quotas.
 */
async function hasCreditBalance(supabase: any, organizationId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("credit_balances")
      .select("organization_id")
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

/**
 * Legacy monthly `aiCalls` quota — kept verbatim for organizations that have
 * no credit balance yet.
 */
async function checkLegacyQuota(
  supabase: any,
  organizationId: string,
  plan: PlanName | string
): Promise<UsageLimitResult> {
  const limits = PLAN_FEATURES[plan as PlanName];
  if (!limits) {
    return {
      allowed: false,
      current: 0,
      limit: 0,
      requiredPlan: "starter",
      insufficient_credits: false,
      required_credits: 0,
      remaining_credits: 0,
    };
  }
  if (limits.aiCalls === Infinity) {
    return { allowed: true, required_credits: 0, remaining_credits: null, insufficient_credits: false };
  }

  const current = await getUsageCount(supabase, organizationId);
  if (current >= limits.aiCalls) {
    return {
      allowed: false,
      current,
      limit: limits.aiCalls,
      requiredPlan: nextPlanAfter(plan),
      insufficient_credits: false,
      required_credits: 0,
      remaining_credits: 0,
    };
  }
  return { allowed: true, required_credits: 0, remaining_credits: null, insufficient_credits: false };
}

/**
 * Single entry point for AI metering.
 *
 * TWO regimes, picked automatically per organization:
 *
 *   1. CREDITS (migration 090 applied AND the org has a `credit_balances` row)
 *      → the cost of `actionType` is read from CREDIT_COSTS and DEBITED here
 *        through the `consume_credits` RPC (subscription credits first, then
 *        purchased credits). A cost of 0 (bundled action such as email
 *        classification) is allowed without touching the ledger.
 *      → refusal returns `insufficient_credits: true`; routes should answer
 *        402 with `insufficientCreditsResponse()` (apps/web/src/lib/credits.ts).
 *
 *   2. LEGACY QUOTAS (org without a balance row — pre-migration compatibility)
 *      → unchanged behaviour: counts `api_usage_logs` rows for the month and
 *        compares against `PLAN_FEATURES[plan].aiCalls`.
 *
 * ⚠️ SIDE EFFECT: in credits mode this function DEBITS the balance. Call it
 * exactly once per action, before doing the work (fail-fast). Infrastructure
 * errors fail OPEN — a missing RPC or a DB hiccup never blocks the product.
 *
 * The signature is backward compatible: `actionType` is optional and defaults
 * to DEFAULT_CREDIT_COST (1 credit) when omitted.
 */
export async function checkUsageLimit(
  supabase: any,
  organizationId: string,
  plan: PlanName | string,
  actionType?: string
): Promise<UsageLimitResult> {
  // Regime 1 — credits
  if (organizationId && (await hasCreditBalance(supabase, organizationId))) {
    const required = creditCostFor(actionType);

    if (required === 0) {
      return { allowed: true, required_credits: 0, remaining_credits: null, insufficient_credits: false };
    }

    try {
      const { data, error } = await supabase.rpc("consume_credits", {
        p_org: organizationId,
        p_amount: required,
        p_action: actionType ?? null,
        p_reference: null,
      });

      if (error) {
        console.warn(
          `[plan-features] consume_credits failed (${error.message}) — action allowed without debit (fail-open)`
        );
        return { allowed: true, required_credits: required, remaining_credits: null, insufficient_credits: false };
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        console.warn("[plan-features] consume_credits returned no row — action allowed (fail-open)");
        return { allowed: true, required_credits: required, remaining_credits: null, insufficient_credits: false };
      }

      const remaining =
        (Number(row.remaining_subscription) || 0) + (Number(row.remaining_purchased) || 0);

      if (row.success === true) {
        return {
          allowed: true,
          required_credits: required,
          remaining_credits: remaining,
          insufficient_credits: false,
        };
      }

      return {
        allowed: false,
        // Legacy field mapping for the existing routes' JSON body:
        //   current = credits left, limit = credits needed.
        current: remaining,
        limit: required,
        requiredPlan: nextPlanAfter(plan),
        insufficient_credits: true,
        required_credits: required,
        remaining_credits: remaining,
      };
    } catch (err) {
      console.warn("[plan-features] consume_credits threw — action allowed (fail-open):", err);
      return { allowed: true, required_credits: required, remaining_credits: null, insufficient_credits: false };
    }
  }

  // Regime 2 — legacy monthly quota
  return checkLegacyQuota(supabase, organizationId, plan);
}

/**
 * Count 3D extractions (`action_type = 'plan_3d_extract'`) for an org this
 * month. Uses whichever supabase client the caller hands us — pass the
 * admin client from API routes so RLS doesn't hide other members' runs.
 */
export async function get3dExtractionCount(
  supabase: any,
  organizationId: string
): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from("api_usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("action_type", PLAN_3D_EXTRACT_ACTION)
    .gte("created_at", startOfMonth.toISOString());

  if (error) {
    console.error("[plan-features] Failed to count 3D extractions:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Defence-in-depth gate for POST /api/scenes/extract.
 *
 * Combines TWO checks so the route stays simple:
 *   1. Plan has `visualization3d !== false` (via `canAccess`).
 *   2. Org hasn't blown through its `max3dExtractionsPerMonth` cap.
 *
 * This is deliberately SEPARATE from `checkUsageLimit` — rolling 3D into
 * the generic `aiCalls` counter would silently consume the same budget
 * used by Mail classification and briefings. We cap 3D on its own axis.
 */
export async function check3dExtractionLimit(
  supabase: any,
  organizationId: string,
  plan: PlanName | string
): Promise<
  | { allowed: true }
  | { allowed: false; reason: "feature_not_in_plan" | "quota_exceeded"; current: number; limit: number; requiredPlan: PlanName }
> {
  const limits = PLAN_FEATURES[plan as PlanName];
  if (!limits) {
    return {
      allowed: false,
      reason: "feature_not_in_plan",
      current: 0,
      limit: 0,
      requiredPlan: requiredPlanFor("visualization3d"),
    };
  }

  if (!canAccess(plan, "visualization3d")) {
    return {
      allowed: false,
      reason: "feature_not_in_plan",
      current: 0,
      limit: 0,
      requiredPlan: requiredPlanFor("visualization3d"),
    };
  }

  const cap = limits.max3dExtractionsPerMonth;
  if (cap === Infinity) {
    return { allowed: true };
  }

  const current = await get3dExtractionCount(supabase, organizationId);
  if (current >= cap) {
    // Suggest the next tier that has a strictly larger cap.
    const tiers: PlanName[] = ["trial", "starter", "pro", "enterprise"];
    const idx = tiers.indexOf(plan as PlanName);
    const nextPlan = tiers[Math.min(idx + 1, tiers.length - 1)] as PlanName;
    return {
      allowed: false,
      reason: "quota_exceeded",
      current,
      limit: cap,
      requiredPlan: nextPlan,
    };
  }

  return { allowed: true };
}
