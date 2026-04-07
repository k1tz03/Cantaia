export type PlanName = "trial" | "starter" | "pro" | "enterprise";

export type FeatureName =
  | "budgetAI"
  | "planning"
  | "dataIntel"
  | "branding"
  | "export";

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
}

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
  },
  starter: {
    maxProjects: 5, maxUsers: 5, aiCalls: 200, maxEmailsSync: 500,
    maxPlanAnalyses: 5, maxSubmissions: 3, maxStorage: 5_000_000_000,
    budgetAI: false, planning: false, dataIntel: false, branding: false, export: true,
  },
  pro: {
    maxProjects: 30, maxUsers: 30, aiCalls: 1000, maxEmailsSync: Infinity,
    maxPlanAnalyses: 50, maxSubmissions: Infinity, maxStorage: 50_000_000_000,
    budgetAI: true, planning: "full", dataIntel: false, branding: false, export: true,
  },
  enterprise: {
    maxProjects: Infinity, maxUsers: Infinity, aiCalls: Infinity, maxEmailsSync: Infinity,
    maxPlanAnalyses: Infinity, maxSubmissions: Infinity, maxStorage: 500_000_000_000,
    budgetAI: true, planning: "full", dataIntel: true, branding: true, export: true,
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
