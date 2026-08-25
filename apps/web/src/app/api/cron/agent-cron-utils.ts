// ============================================================
// Shared helpers for the autonomous-agent CRON routes
// (email-drafter, followup-engine, supplier-monitor).
//
// Not a route file — Next.js only routes `route.ts`, so this module is
// colocated with the routes that use it.
// ============================================================

import { orgHasNightlyAgents } from "@cantaia/config/plan-features";

/**
 * Gate for every nightly agent run.
 *
 * Two independent switches, both must be on:
 *   1. PLAN   — `orgHasNightlyAgents()` (Pro+). Owned by plan-features; it
 *      fails open on a DB hiccup so an outage never stops every customer's
 *      automation.
 *   2. ORG    — `organizations.settings.nightly_agents`. The org toggle
 *      exposed on /agents; a missing key means "on" (opt-out, not opt-in),
 *      so nothing changes for existing organizations.
 *
 * Until this existed the crons ran for EVERY organization, including trials,
 * burning Sonnet loops for orgs whose plan does not include the feature.
 */
export async function canRunNightlyAgents(
  admin: any,
  organizationId: string
): Promise<{ allowed: boolean; reason?: "plan" | "org_disabled" }> {
  if (!organizationId) return { allowed: false, reason: "plan" };

  // Org-level opt-out first — cheapest and most explicit.
  try {
    const { data: org } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", organizationId)
      .maybeSingle();
    if (org?.settings && org.settings.nightly_agents === false) {
      return { allowed: false, reason: "org_disabled" };
    }
  } catch {
    // Unreadable settings must not disable automation — fall through.
  }

  const planAllows = await orgHasNightlyAgents(admin, organizationId);
  return planAllows ? { allowed: true } : { allowed: false, reason: "plan" };
}

/**
 * Everyone who should hear about a nightly agent result: admins, directors
 * and superadmins of the org.
 *
 * The crons used to notify either the single "first user found" (so nobody
 * else knew the run happened) or every member (so field users got alerts
 * about supplier scores they cannot act on).
 */
export async function fetchOrgNotifiees(
  admin: any,
  organizationId: string
): Promise<string[]> {
  try {
    const { data } = await admin
      .from("users")
      .select("id, role, is_superadmin")
      .eq("organization_id", organizationId);

    const targets = (data || [])
      .filter(
        (u: any) =>
          u.role === "admin" || u.role === "director" || u.is_superadmin === true
      )
      .map((u: any) => u.id);

    // No admin/director configured yet → fall back to the whole org rather
    // than dropping the notification entirely.
    if (targets.length === 0) return (data || []).map((u: any) => u.id);
    return targets;
  } catch {
    return [];
  }
}

/**
 * AGT.H4 — Global time budget for a whole CRON run.
 *
 * The routes declare `maxDuration = 300`, but the agent loops were being
 * handed `agentConfig.maxDurationMs` (10–15 min). A single slow organization
 * could therefore be killed by Vercel mid-run, leaving its session row stuck
 * on "running" and every following organization unprocessed and unlogged.
 *
 * 240s leaves ~60s to persist session metrics, notifications and the HTTP
 * response after the last agent finishes.
 */
export const GLOBAL_BUDGET_MS = 240_000;

/** Hard ceiling for a single agent loop, whatever the registry declares. */
export const AGENT_BUDGET_MS = 240_000;

/**
 * Minimum runway required before starting another organization's loop.
 * Starting an agent with a few seconds left only burns tokens for a result
 * that will be discarded.
 */
export const MIN_ORG_BUDGET_MS = 30_000;

/**
 * Budget to hand `runAgentLoop` for the next unit of work, or `null` when the
 * global budget is exhausted and the caller must stop the loop.
 */
export function nextAgentBudgetMs(
  startedAt: number,
  configuredMaxDurationMs: number
): number | null {
  const remaining = GLOBAL_BUDGET_MS - (Date.now() - startedAt);
  if (remaining < MIN_ORG_BUDGET_MS) return null;
  return Math.min(configuredMaxDurationMs, AGENT_BUDGET_MS, remaining);
}

/**
 * AGT.M2 — True when a `custom_tool_result` event reports a successful
 * handler run.
 *
 * Counting `agent.tool_use` events (the previous behaviour) counted
 * *intentions*: a tool that returned `{ error: true, … }` — access denied,
 * insert failed, unknown tool — still produced a notification claiming the
 * work had been done.
 */
export function isSuccessfulToolResult(data: Record<string, unknown>): boolean {
  if (data.is_error === true) return false;
  const preview = typeof data.result_preview === "string" ? data.result_preview : "";
  if (preview.startsWith("Error:")) return false;
  return !/"error"\s*:\s*true/.test(preview);
}

/** Read `"saved": N` out of a tool result preview, when the handler reports it. */
export function extractSavedCount(data: Record<string, unknown>): number | null {
  const preview = typeof data.result_preview === "string" ? data.result_preview : "";
  const match = preview.match(/"saved"\s*:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

/** Number of entries in a tool input array field (`items`, `alerts`, …). */
export function countToolInputArray(
  data: Record<string, unknown>,
  field: string
): number {
  try {
    const input =
      typeof data.tool_input === "object" && data.tool_input
        ? (data.tool_input as Record<string, unknown>)[field]
        : null;
    const parsed = typeof input === "string" ? JSON.parse(input) : input;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}
