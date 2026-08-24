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
  extractSavedCount,
  countToolInputArray,
} from "../agent-cron-utils";

export const maxDuration = 300;

/** Vercel Cron invokes scheduled paths with GET — delegate to POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/cron/followup-engine
 * Morning CRON (6h) — Detects overdue items across the organization:
 *   - Price requests without response (>7 days)
 *   - Overdue tasks
 *   - Approaching submission deadlines (<7 days)
 *   - Reserves without deadline
 * Creates followup_items with suggested actions and draft emails.
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
  const agentConfig = getAgentConfig("followup-engine" as AgentType);
  const now = new Date().toISOString();

  // Get all active organizations (those with at least one active project)
  const { data: activeOrgs } = await (admin as any)
    .from("projects")
    .select("organization_id")
    .in("status", ["active", "planning"])
    .not("organization_id", "is", null);

  if (!activeOrgs || activeOrgs.length === 0) {
    return NextResponse.json({ message: "No active organizations", count: 0 });
  }

  // Deduplicate org IDs
  const orgIds = Array.from(new Set<string>(activeOrgs.map((p: { organization_id: string }) => p.organization_id)));

  // For each org, find a user to attribute the session to (first admin/PM)
  const orgUserMap = new Map<string, string>();
  for (const orgId of orgIds) {
    const { data: user } = await (admin as any)
      .from("users")
      .select("id")
      .eq("organization_id", orgId)
      .in("role", ["admin", "project_manager", "director"])
      .limit(1)
      .maybeSingle();

    if (user) {
      orgUserMap.set(orgId, user.id);
    }
  }

  console.log(`[cron/followup-engine] Processing ${orgUserMap.size} organizations`);

  const results: { orgId: string; followupsCreated: number; status: string; error?: string }[] = [];
  const skippedOrgs: string[] = [];

  for (const [orgId, userId] of orgUserMap) {
    // AGT.H4 — stop cleanly before Vercel kills the function mid-org.
    const orgBudgetMs = nextAgentBudgetMs(cronStart, agentConfig.maxDurationMs);
    if (orgBudgetMs === null) {
      skippedOrgs.push(orgId);
      continue;
    }

    try {
      const sessionId = crypto.randomUUID();
      const dbSessionId = crypto.randomUUID();

      await (admin as any).from("agent_sessions").insert({
        id: dbSessionId,
        organization_id: orgId,
        user_id: userId,
        agent_type: "followup-engine",
        session_id: sessionId,
        title: `Followup Engine CRON — ${now.split("T")[0]}`,
        input_payload: { _initial_message: "Scan and detect", trigger: "cron" },
        status: "running",
        started_at: now,
        model: agentConfig.model,
      });

      const startTime = Date.now();
      let followupsCreated = 0;

      // AGT.M2 — count what the handler actually persisted, not what the model
      // asked for. `agent.tool_use` records the request; `custom_tool_result`
      // records the outcome.
      const requestedByToolUseId = new Map<string, number>();

      const onEvent = (eventType: string, data: Record<string, unknown>) => {
        if (data.tool_name !== "save_followup_items") return;
        const toolUseId = typeof data.tool_use_id === "string" ? data.tool_use_id : "";

        if (eventType === "agent.tool_use") {
          requestedByToolUseId.set(toolUseId, countToolInputArray(data, "items"));
          return;
        }

        if (eventType === "custom_tool_result") {
          const requested = requestedByToolUseId.get(toolUseId) ?? 0;
          requestedByToolUseId.delete(toolUseId);
          if (!isSuccessfulToolResult(data)) return;
          followupsCreated += extractSavedCount(data) ?? requested;
        }
      };

      const result = await runAgentLoop({
        apiKey,
        model: agentConfig.model,
        systemPrompt: agentConfig.systemPrompt,
        tools: agentConfig.tools,
        initialMessage:
          `Tu es le Followup Engine de Cantaia, exécuté en mode CRON matinal.\n` +
          `Organisation: ${orgId}\n` +
          `Date: ${now.split("T")[0]}\n\n` +
          `Procédure :\n` +
          `1. Appelle scan_overdue_items pour scanner les 4 catégories de retards\n` +
          `2. Analyse les résultats et détermine l'urgence de chaque item\n` +
          `3. Pour les items critiques, appelle fetch_item_context pour plus de détails\n` +
          `4. Appelle save_followup_items avec la liste complète des relances à créer\n` +
          `5. Termine avec un résumé des relances créées par catégorie`,
        toolExecutor: (toolName, toolInput) =>
          executeCustomTool("followup-engine" as AgentType, toolName, toolInput, {
            userId,
            organizationId: orgId,
            sessionId: dbSessionId,
            admin,
          }),
        onEvent,
        maxDurationMs: orgBudgetMs,
      });

      const durationMs = Date.now() - startTime;

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

      try {
        await trackApiUsage({
          supabase: admin as any,
          userId,
          organizationId: orgId,
          actionType: "agent_followup-engine",
          apiProvider: "anthropic",
          model: agentConfig.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
      } catch { /* non-critical */ }

      // Notify all org users if followups were found
      if (followupsCreated > 0) {
        try {
          const { data: orgMembers } = await (admin as any)
            .from("users")
            .select("id")
            .eq("organization_id", orgId);

          if (orgMembers) {
            const notifications = orgMembers.map((m: { id: string }) => ({
              organization_id: orgId,
              user_id: m.id,
              agent_type: "followup-engine",
              title: `${followupsCreated} relance${followupsCreated > 1 ? "s" : ""} détectée${followupsCreated > 1 ? "s" : ""}`,
              description: `L'agent Followup Engine a identifié ${followupsCreated} action${followupsCreated > 1 ? "s" : ""} en retard nécessitant un suivi.`,
              metadata: { followups_count: followupsCreated, agent_session_id: dbSessionId },
            }));
            await (admin as any).from("agent_notifications").insert(notifications);
          }
        } catch { /* non-critical */ }
      }

      results.push({ orgId, followupsCreated, status: result.status });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/followup-engine] Error for org ${orgId}:`, errorMsg);
      results.push({ orgId, followupsCreated: 0, status: "failed", error: errorMsg });
    }
  }

  const totalFollowups = results.reduce((sum, r) => sum + r.followupsCreated, 0);
  console.log(
    `[cron/followup-engine] Done in ${Math.round((Date.now() - cronStart) / 1000)}s. ` +
    `${totalFollowups} followups across ${results.length} orgs`
  );

  if (skippedOrgs.length > 0) {
    console.warn(
      `[cron/followup-engine] Time budget exhausted — ${skippedOrgs.length} org(s) not processed: ${skippedOrgs.join(", ")}`
    );
  }

  return NextResponse.json({
    total_orgs: results.length,
    total_followups: totalFollowups,
    skipped_orgs: skippedOrgs,
    duration_ms: Date.now() - cronStart,
    results,
  });
}
