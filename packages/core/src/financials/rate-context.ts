// ============================================================
// Cantaia — Rate context loader (Supabase side of the financials core)
// ============================================================
// Loads everything the rate cascade needs in two queries, so the API routes
// stay thin and cannot drift apart again (they did: three routes, three
// different — and all labour-blind — margin formulas).

import {
  buildCrewRateMap,
  resolveOrgHourlyRate,
  resolveOrgMachineRate,
  type RateContext,
} from "./site-financials";

type MinimalClient = { from: (table: string) => any };

/** Org-level rates from `organizations.pricing_config` (JSONB). */
export async function loadOrgRates(
  admin: MinimalClient,
  orgId: string,
): Promise<{ defaultRate: number; machineRate: number | null }> {
  const { data, error } = await (admin as any)
    .from("organizations")
    .select("pricing_config")
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    console.warn("[financials] pricing_config read failed:", error.message);
  }

  return {
    defaultRate: resolveOrgHourlyRate(data?.pricing_config),
    machineRate: resolveOrgMachineRate(data?.pricing_config),
  };
}

/**
 * Per-worker rates. Selects `*` on purpose: `hourly_rate_chf` arrives with
 * migration 093 and an explicit column list would 400 (silently, supabase-js
 * does not throw) on databases where it has not been applied yet.
 */
export async function loadCrewRates(
  admin: MinimalClient,
  projectIds: string[],
): Promise<Record<string, number | null>> {
  if (!projectIds.length) return {};

  const { data, error } = await (admin as any)
    .from("portal_crew_members")
    .select("*")
    .in("project_id", projectIds);

  if (error) {
    console.warn("[financials] crew rates read failed:", error.message);
    return {};
  }

  return buildCrewRateMap(data || []);
}

/** Org rates + crew rates, ready to hand to `aggregateSiteEntries`. */
export async function loadRateContext(
  admin: MinimalClient,
  orgId: string,
  projectIds: string[],
): Promise<RateContext> {
  const [org, crewRates] = await Promise.all([
    loadOrgRates(admin, orgId),
    loadCrewRates(admin, projectIds),
  ]);

  return {
    crewRates,
    defaultRate: org.defaultRate,
    machineRate: org.machineRate,
  };
}
