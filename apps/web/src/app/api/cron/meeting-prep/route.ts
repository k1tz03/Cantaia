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
  canRunNightlyAgents,
} from "../agent-cron-utils";

export const maxDuration = 300; // 5 min for the whole run (see agent-cron-utils)

// ============================================================
// AGT.C1 — RESOLVED. This route is schedulable again.
//
// Two things were broken:
//   1. The four custom tools (fetch_meetings_needing_prep,
//      fetch_project_memory_for_prep, fetch_meeting_specific_data,
//      save_meeting_prep) had NO handler — every call returned
//      "Unknown custom tool" and `meeting_preparations` was never written.
//   2. The selector filtered on ai_prep_status IN ('pending','failed'):
//      nothing ever SET 'pending', and 'failed' is not even a legal value of
//      the CHECK constraint (migration 075 allows none|pending|ready|
//      delivered), so the query could only ever return rows nobody created.
//
// Both are fixed: the handlers exist in tool-handlers.ts, the setter lives in
// POST/PATCH /api/calendar/events and in the Outlook sync runner
// (`shouldQueuePrep`), and the filter below is now a plain equality on
// 'pending'.
//
// SCHEDULE TO ADD to apps/web/vercel.json (owned by another agent):
//   { "path": "/api/cron/meeting-prep", "schedule": "30 6 * * *" }
// A 30-minute cadence would be closer to the product intent ("2h before the
// meeting") but costs 48 runs/day; the daily morning slot covers the day's
// meetings within the current budget.
// ============================================================

/** Vercel Cron invokes scheduled paths with GET — delegate to POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/cron/meeting-prep
 * Checks for meetings queued for preparation (ai_prep_status='pending')
 * and generates the AI brief for each. Runs the "meeting-prep" agent once
 * per org that has such meetings.
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
  const agentConfig = getAgentConfig("meeting-prep" as AgentType);
  const now = new Date().toISOString();

  // How far ahead to look. Defaults to 24h so a single morning run covers the
  // whole day; ?hours_ahead=3 reproduces the original "2h before" behaviour
  // for a 30-minute schedule.
  const hoursAhead = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("hours_ahead")) || 24, 1),
    48
  );
  const horizon = new Date(Date.now() + hoursAhead * 3600_000).toISOString();

  const { data: upcomingEvents } = await (admin as any)
    .from("calendar_events")
    .select("organization_id, user_id, start_at")
    .gte("start_at", now)
    .lte("start_at", horizon)
    .neq("status", "cancelled")
    // 'failed' is NOT a value of the ai_prep_status CHECK constraint —
    // including it in an .in() made the filter describe a state that cannot
    // exist. Only 'pending' is queued work.
    .eq("ai_prep_status", "pending")
    .order("start_at", { ascending: true });

  if (!upcomingEvents || upcomingEvents.length === 0) {
    return NextResponse.json({
      message: "No meetings queued for preparation",
      count: 0,
      hours_ahead: hoursAhead,
    });
  }

  // One agent run per org; the earliest meeting's owner attributes the run
  // (the prep itself is stored against each event's own owner).
  const orgMap = new Map<string, string>();
  const orgEventCount = new Map<string, number>();
  for (const row of upcomingEvents) {
    if (!row.organization_id) continue;
    if (!orgMap.has(row.organization_id)) orgMap.set(row.organization_id, row.user_id);
    orgEventCount.set(
      row.organization_id,
      (orgEventCount.get(row.organization_id) || 0) + 1
    );
  }

  console.log(
    `[cron/meeting-prep] ${upcomingEvents.length} meeting(s) queued across ${orgMap.size} organizations`
  );

  const results: {
    orgId: string;
    prepsGenerated: number;
    meetingsQueued: number;
    status: string;
    error?: string;
  }[] = [];
  const skippedOrgs: string[] = [];
  const gatedOrgs: Array<{ orgId: string; reason: string }> = [];

  for (const [orgId, userId] of orgMap) {
    // Nightly agents are a Pro+ feature and can be switched off per org.
    const gate = await canRunNightlyAgents(admin, orgId);
    if (!gate.allowed) {
      gatedOrgs.push({ orgId, reason: gate.reason || "plan" });
      continue;
    }

    // AGT.H4 — stop cleanly before Vercel kills the function mid-org.
    const orgBudgetMs = nextAgentBudgetMs(cronStart, agentConfig.maxDurationMs);
    if (orgBudgetMs === null) {
      skippedOrgs.push(orgId);
      continue;
    }

    const meetingsQueued = orgEventCount.get(orgId) || 0;

    try {
      const sessionId = crypto.randomUUID();
      const dbSessionId = crypto.randomUUID();

      const { error: sessErr } = await (admin as any).from("agent_sessions").insert({
        id: dbSessionId,
        organization_id: orgId,
        user_id: userId,
        agent_type: "meeting-prep",
        session_id: sessionId,
        title: `Meeting Prep CRON — ${now.split("T")[0]}`,
        input_payload: {
          _initial_message: "Prepare upcoming meetings",
          trigger: "cron",
          hours_ahead: hoursAhead,
        },
        status: "running",
        started_at: now,
        last_event_at: now,
        model: agentConfig.model,
      });
      if (sessErr) {
        console.error(`[cron/meeting-prep] Session insert failed for org ${orgId}:`, sessErr.message);
        continue;
      }

      const startTime = Date.now();
      let prepsGenerated = 0;

      // AGT.M2 — count preps the handler actually persisted, not tool calls.
      const onEvent = (eventType: string, data: Record<string, unknown>) => {
        if (
          eventType === "custom_tool_result" &&
          data.tool_name === "save_meeting_prep" &&
          isSuccessfulToolResult(data)
        ) {
          prepsGenerated++;
        }
      };

      const result = await runAgentLoop({
        apiKey,
        model: agentConfig.model,
        systemPrompt: agentConfig.systemPrompt,
        tools: agentConfig.tools,
        initialMessage:
          `Tu es l'agent Meeting Prep de Cantaia, exécuté en mode CRON.\n` +
          `Organisation: ${orgId}\n` +
          `Date et heure: ${now}\n` +
          `Fenêtre: ${hoursAhead} heures\n\n` +
          `Procédure :\n` +
          `1. Appelle fetch_meetings_needing_prep avec hours_ahead=${hoursAhead}\n` +
          `2. Pour chaque réunion, appelle fetch_project_memory_for_prep pour obtenir le contexte projet\n` +
          `3. Appelle fetch_meeting_specific_data pour les données spécifiques (emails récents, tâches, réserves, soumissions)\n` +
          `4. Génère un brief de préparation et appelle save_meeting_prep pour sauvegarder\n` +
          `5. Termine avec un résumé des préparations générées`,
        toolExecutor: (toolName, toolInput) =>
          executeCustomTool("meeting-prep" as AgentType, toolName, toolInput, {
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
          result_payload: {
            preps_generated: prepsGenerated,
            meetings_queued: meetingsQueued,
            trigger: "cron",
          },
          last_event_type: `cron.${result.status}`,
          last_event_at: new Date().toISOString(),
        })
        .eq("id", dbSessionId);

      try {
        await trackApiUsage({
          supabase: admin as any,
          userId,
          organizationId: orgId,
          actionType: "agent_meeting-prep",
          apiProvider: "anthropic",
          model: agentConfig.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
      } catch { /* non-critical */ }

      // Notify the OWNERS of the prepared meetings — a prep is only useful to
      // whoever attends. Broadcasting to the whole org (previous behaviour)
      // advertised briefs most members will never open.
      if (prepsGenerated > 0) {
        try {
          // Scoped to THIS run: filtering on ai_prep_status='ready' would
          // also match briefs prepared on an earlier day and re-notify.
          const { data: preparedPreps } = await (admin as any)
            .from("meeting_preparations")
            .select("user_id")
            .eq("organization_id", orgId)
            .eq("agent_session_id", dbSessionId);

          const owners = Array.from(
            new Set<string>((preparedPreps || []).map((p: any) => p.user_id).filter(Boolean))
          );

          if (owners.length > 0) {
            await (admin as any).from("agent_notifications").insert(
              owners.map((ownerId) => ({
                organization_id: orgId,
                user_id: ownerId,
                agent_type: "meeting-prep",
                title: `${prepsGenerated} préparation${prepsGenerated > 1 ? "s" : ""} de réunion prête${prepsGenerated > 1 ? "s" : ""}`,
                description: `L'agent Meeting Prep a préparé ${prepsGenerated} brief${prepsGenerated > 1 ? "s" : ""} pour vos réunions à venir.`,
                metadata: { preps_count: prepsGenerated, agent_session_id: dbSessionId },
              }))
            );
          }
        } catch { /* non-critical */ }
      }

      results.push({ orgId, prepsGenerated, meetingsQueued, status: result.status });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/meeting-prep] Error for org ${orgId}:`, errorMsg);
      results.push({
        orgId,
        prepsGenerated: 0,
        meetingsQueued,
        status: "failed",
        error: errorMsg,
      });
    }
  }

  const totalPreps = results.reduce((sum, r) => sum + r.prepsGenerated, 0);
  console.log(
    `[cron/meeting-prep] Done in ${Math.round((Date.now() - cronStart) / 1000)}s. ` +
      `${totalPreps} preps across ${results.length} orgs`
  );

  if (skippedOrgs.length > 0) {
    console.warn(
      `[cron/meeting-prep] Time budget exhausted — ${skippedOrgs.length} org(s) not processed: ${skippedOrgs.join(", ")}`
    );
  }

  return NextResponse.json({
    total_orgs: results.length,
    total_preps: totalPreps,
    hours_ahead: hoursAhead,
    skipped_orgs: skippedOrgs,
    gated_orgs: gatedOrgs,
    duration_ms: Date.now() - cronStart,
    results,
  });
}
