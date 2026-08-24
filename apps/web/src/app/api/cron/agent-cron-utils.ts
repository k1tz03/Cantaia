// ============================================================
// Shared helpers for the autonomous-agent CRON routes
// (email-drafter, followup-engine, supplier-monitor).
//
// Not a route file — Next.js only routes `route.ts`, so this module is
// colocated with the routes that use it.
// ============================================================

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
