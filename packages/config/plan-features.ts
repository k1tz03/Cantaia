export type PlanName = "trial" | "starter" | "pro" | "enterprise";

export type FeatureName =
  | "budgetAI"
  | "planning"
  | "dataIntel"
  | "branding"
  | "export"
  | "visualization3d";

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
 * Pricing (CHF/user/month):
 *   Starter: 49 | Pro: 89 | Enterprise: 119
 *
 * Per-user model — min users: Starter 1, Pro 5, Enterprise 15
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
    visualization3d: false, max3dExtractionsPerMonth: 0,
  },
  starter: {
    maxProjects: 5, maxUsers: 5, aiCalls: 200, maxEmailsSync: 500,
    maxPlanAnalyses: 5, maxSubmissions: 3, maxStorage: 5_000_000_000,
    budgetAI: false, planning: false, dataIntel: false, branding: false, export: true,
    visualization3d: false, max3dExtractionsPerMonth: 0,
  },
  pro: {
    maxProjects: 30, maxUsers: 30, aiCalls: 1000, maxEmailsSync: Infinity,
    maxPlanAnalyses: 50, maxSubmissions: Infinity, maxStorage: 50_000_000_000,
    budgetAI: true, planning: "full", dataIntel: false, branding: false, export: true,
    // Pro: 20 extractions/mois — chaque plan architectural peut demander 1-3
    // passes (façades + étages). 20 couvre ~6-10 projets/mois.
    visualization3d: "preview", max3dExtractionsPerMonth: 20,
  },
  enterprise: {
    maxProjects: Infinity, maxUsers: Infinity, aiCalls: Infinity, maxEmailsSync: Infinity,
    maxPlanAnalyses: Infinity, maxSubmissions: Infinity, maxStorage: 500_000_000_000,
    budgetAI: true, planning: "full", dataIntel: true, branding: true, export: true,
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
    .gte("created_at", startOfMonth.toISOString());

  if (error) {
    console.error("[plan-features] Failed to count usage:", error.message);
    return 0;
  }
  return count ?? 0;
}

/**
 * Check if an org has exceeded its AI usage limit.
 * Returns { allowed: true } if OK, or error details if limit reached.
 */
export async function checkUsageLimit(
  supabase: any,
  organizationId: string,
  plan: PlanName | string
): Promise<{ allowed: true } | { allowed: false; current: number; limit: number; requiredPlan: PlanName }> {
  const limits = PLAN_FEATURES[plan as PlanName];
  if (!limits) {
    return { allowed: false, current: 0, limit: 0, requiredPlan: "starter" };
  }
  if (limits.aiCalls === Infinity) {
    return { allowed: true };
  }

  const current = await getUsageCount(supabase, organizationId);
  if (current >= limits.aiCalls) {
    const plans: PlanName[] = ["trial", "starter", "pro", "enterprise"];
    const currentIdx = plans.indexOf(plan as PlanName);
    const nextPlan = plans[Math.min(currentIdx + 1, plans.length - 1)] as PlanName;
    return { allowed: false, current, limit: limits.aiCalls, requiredPlan: nextPlan };
  }
  return { allowed: true };
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
