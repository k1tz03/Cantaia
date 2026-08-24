import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentConfig, runAgentLoop } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";
import { executeCustomTool } from "../../agents/[type]/stream/tool-handlers";
import { trackApiUsage } from "@cantaia/core/tracking";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  nextAgentBudgetMs,
  isSuccessfulToolResult,
} from "../agent-cron-utils";

export const maxDuration = 300; // 5 min for the whole run (see agent-cron-utils)

/** Vercel Cron invokes scheduled paths with GET — delegate to POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/cron/email-drafter
 * Nightly CRON (23h) — Scans emails needing a response and generates
 * AI draft replies using project context + thread history.
 * Runs once per USER with an active email connection (drafts are per-mailbox),
 * within a global time budget.
 * Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cronStart = Date.now();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const admin = createAdminClient();
  const agentConfig = getAgentConfig("email-drafter" as AgentType);
  const now = new Date().toISOString();

  // Find all organizations that have users with active email connections
  const { data: orgUsers } = await (admin as any)
    .from("email_connections")
    .select("user_id, organization_id")
    .eq("status", "active");

  if (!orgUsers || orgUsers.length === 0) {
    return NextResponse.json({ message: "No active email connections", count: 0 });
  }

  // AGT.H4 — one agent run per USER with an active connection (previously only
  // the first user of each org was processed, so every other mailbox in the org
  // never got drafts). Deduplicated because a user may hold several connections.
  const seenPairs = new Set<string>();
  const pairs: Array<{ orgId: string; userId: string }> = [];
  for (const row of orgUsers) {
    if (!row.organization_id || !row.user_id) continue;
    const key = `${row.organization_id}|${row.user_id}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    pairs.push({ orgId: row.organization_id, userId: row.user_id });
  }

  const orgCount = new Set(pairs.map((p) => p.orgId)).size;
  console.log(
    `[cron/email-drafter] Processing ${pairs.length} mailbox(es) across ${orgCount} organizations`
  );

  const results: { orgId: string; userId: string; draftsGenerated: number; status: string; error?: string }[] = [];
  const skipped: Array<{ orgId: string; userId: string }> = [];

  for (const { orgId, userId } of pairs) {
    // AGT.H4 — stop cleanly before Vercel kills the function mid-run.
    const runBudgetMs = nextAgentBudgetMs(cronStart, agentConfig.maxDurationMs);
    if (runBudgetMs === null) {
      skipped.push({ orgId, userId });
      continue;
    }

    try {
      // Create an agent session record
      const sessionId = crypto.randomUUID();
      const dbSessionId = crypto.randomUUID();

      await (admin as any).from("agent_sessions").insert({
        id: dbSessionId,
        organization_id: orgId,
        user_id: userId,
        agent_type: "email-drafter",
        session_id: sessionId,
        title: `Email Drafter CRON — ${now.split("T")[0]}`,
        input_payload: { _initial_message: "Scan and draft", trigger: "cron" },
        status: "running",
        started_at: now,
        model: agentConfig.model,
      });

      const startTime = Date.now();
      let draftsGenerated = 0;

      // onEvent: log-only (no SSE in CRON context)
      // AGT.M2 — count drafts the handler actually saved. Counting
      // `agent.tool_use` counted attempts, including the ones that returned
      // `{ error: true }` (access denied, insert failed).
      const onEvent = (eventType: string, data: Record<string, unknown>) => {
        if (
          eventType === "custom_tool_result" &&
          data.tool_name === "save_email_draft" &&
          isSuccessfulToolResult(data)
        ) {
          draftsGenerated++;
        }
      };

      const result = await runAgentLoop({
        apiKey,
        model: agentConfig.model,
        systemPrompt: agentConfig.systemPrompt,
        tools: agentConfig.tools,
        initialMessage:
          `Tu es le Email Drafter de Cantaia, exécuté en mode CRON nocturne.\n` +
          `Organisation: ${orgId}\n` +
          `Boîte mail traitée (utilisateur): ${userId}\n` +
          `Date: ${now.split("T")[0]}\n\n` +
          `Procédure :\n` +
          `1. Appelle fetch_emails_needing_response pour obtenir les emails nécessitant une réponse\n` +
          `2. Pour chaque email important, appelle fetch_email_thread pour le contexte du thread\n` +
          `3. Appelle fetch_project_context si un projet est associé\n` +
          `4. Rédige un brouillon et appelle save_email_draft pour chaque email\n` +
          `5. Termine avec un résumé des brouillons créés`,
        toolExecutor: (toolName, toolInput) =>
          executeCustomTool("email-drafter" as AgentType, toolName, toolInput, {
            userId,
            organizationId: orgId,
            sessionId: dbSessionId,
            admin,
          }),
        onEvent,
        maxDurationMs: runBudgetMs,
      });

      const durationMs = Date.now() - startTime;

      // Update session record
      await (admin as any)
        .from("agent_sessions")
        .update({
          status: result.status,
          completed_at: new Date().toISOString(),
          duration_ms: durationMs,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          tool_calls_count: result.toolCallsCount,
          custom_tool_calls_count: result.customToolCallsCount,
          events_count: result.eventsCount,
          tools_used: result.toolsUsed,
          last_event_type: `cron.${result.status}`,
          last_event_at: new Date().toISOString(),
        })
        .eq("id", dbSessionId);

      // Track API usage
      try {
        await trackApiUsage({
          supabase: admin as any,
          userId,
          organizationId: orgId,
          actionType: "agent_email-drafter",
          apiProvider: "anthropic",
          model: agentConfig.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
      } catch { /* non-critical */ }

      // Notify the mailbox owner only — drafts are user-scoped
      // (email_drafts.user_id, and GET /api/agents/drafts filters on it),
      // so notifying every org member would advertise drafts they cannot open.
      if (draftsGenerated > 0) {
        try {
          await (admin as any).from("agent_notifications").insert({
            organization_id: orgId,
            user_id: userId,
            agent_type: "email-drafter",
            title: `${draftsGenerated} brouillon${draftsGenerated > 1 ? "s" : ""} de réponse créé${draftsGenerated > 1 ? "s" : ""}`,
            description: `L'agent Email Drafter a préparé ${draftsGenerated} brouillon${draftsGenerated > 1 ? "s" : ""} de réponse pour vos emails en attente.`,
            metadata: { drafts_count: draftsGenerated, agent_session_id: dbSessionId },
          });
        } catch { /* non-critical */ }
      }

      results.push({ orgId, userId, draftsGenerated, status: result.status });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/email-drafter] Error for user ${userId} (org ${orgId}):`, errorMsg);
      results.push({ orgId, userId, draftsGenerated: 0, status: "failed", error: errorMsg });
    }
  }

  const totalDrafts = results.reduce((sum, r) => sum + r.draftsGenerated, 0);
  console.log(
    `[cron/email-drafter] Done in ${Math.round((Date.now() - cronStart) / 1000)}s. ` +
    `${totalDrafts} drafts across ${results.length} mailbox(es)`
  );

  if (skipped.length > 0) {
    console.warn(
      `[cron/email-drafter] Time budget exhausted — ${skipped.length} mailbox(es) not processed: ` +
      skipped.map((s) => `${s.userId}@${s.orgId}`).join(", ")
    );
  }

  return NextResponse.json({
    total_mailboxes: results.length,
    total_orgs: new Set(results.map((r) => r.orgId)).size,
    total_drafts: totalDrafts,
    skipped_mailboxes: skipped,
    duration_ms: Date.now() - cronStart,
    results,
  });
}
