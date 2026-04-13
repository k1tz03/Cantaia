import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentConfig, runAgentLoop } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";
import { executeCustomTool } from "../../agents/[type]/stream/tool-handlers";
import { trackApiUsage } from "@cantaia/core/tracking";

export const maxDuration = 300; // 5 min per org

/**
 * POST /api/cron/meeting-prep
 * CRON every 30 minutes — Checks for meetings in the next 2-3 hours
 * and generates AI preparation briefs for each.
 * Runs the "meeting-prep" agent once per org that has upcoming meetings.
 * Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const admin = createAdminClient();
  const agentConfig = getAgentConfig("meeting-prep" as AgentType);
  const now = new Date().toISOString();

  // Find all organizations with calendar events in the next 3 hours needing prep
  const threeHoursFromNow = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

  const { data: upcomingEvents } = await (admin as any)
    .from("calendar_events")
    .select("organization_id, user_id")
    .gte("start_at", now)
    .lte("start_at", threeHoursFromNow)
    .neq("status", "cancelled")
    .in("ai_prep_status", ["pending", "failed"]);

  if (!upcomingEvents || upcomingEvents.length === 0) {
    return NextResponse.json({ message: "No upcoming meetings needing prep", count: 0 });
  }

  // Deduplicate by organization — pick the first user as context
  const orgMap = new Map<string, string>();
  for (const row of upcomingEvents) {
    if (!orgMap.has(row.organization_id)) {
      orgMap.set(row.organization_id, row.user_id);
    }
  }

  const orgIds = [...orgMap.keys()];
  console.log(`[cron/meeting-prep] Processing ${orgIds.length} organizations with upcoming meetings`);

  const results: { orgId: string; prepsGenerated: number; status: string; error?: string }[] = [];

  for (const [orgId, userId] of orgMap) {
    try {
      // Create an agent session record
      const sessionId = crypto.randomUUID();
      const dbSessionId = crypto.randomUUID();

      await (admin as any).from("agent_sessions").insert({
        id: dbSessionId,
        organization_id: orgId,
        user_id: userId,
        agent_type: "meeting-prep",
        session_id: sessionId,
        title: `Meeting Prep CRON — ${now.split("T")[0]}`,
        input_payload: { _initial_message: "Prepare upcoming meetings", trigger: "cron" },
        status: "running",
        started_at: now,
        model: agentConfig.model,
      });

      const startTime = Date.now();
      let prepsGenerated = 0;

      // onEvent: log-only (no SSE in CRON context)
      const onEvent = (eventType: string, data: Record<string, unknown>) => {
        if (eventType === "agent.tool_use" && data.tool_name === "save_meeting_prep") {
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
          `Date et heure: ${now}\n\n` +
          `Procédure :\n` +
          `1. Appelle fetch_meetings_needing_prep pour obtenir les réunions dans les 2-3 prochaines heures sans préparation\n` +
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
        maxDurationMs: agentConfig.maxDurationMs,
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
          actionType: "agent_meeting-prep",
          apiProvider: "anthropic",
          model: agentConfig.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
      } catch { /* non-critical */ }

      // Create notification if preps were generated
      if (prepsGenerated > 0) {
        try {
          const { data: orgMembers } = await (admin as any)
            .from("users")
            .select("id")
            .eq("organization_id", orgId);

          if (orgMembers) {
            const notifications = orgMembers.map((m: { id: string }) => ({
              organization_id: orgId,
              user_id: m.id,
              agent_type: "meeting-prep",
              title: `${prepsGenerated} préparation${prepsGenerated > 1 ? "s" : ""} de réunion prête${prepsGenerated > 1 ? "s" : ""}`,
              description: `L'agent Meeting Prep a préparé ${prepsGenerated} brief${prepsGenerated > 1 ? "s" : ""} pour vos réunions à venir.`,
              metadata: { preps_count: prepsGenerated, agent_session_id: dbSessionId },
            }));
            await (admin as any).from("agent_notifications").insert(notifications);
          }
        } catch { /* non-critical */ }
      }

      results.push({ orgId, prepsGenerated, status: result.status });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/meeting-prep] Error for org ${orgId}:`, errorMsg);
      results.push({ orgId, prepsGenerated: 0, status: "failed", error: errorMsg });
    }
  }

  const totalPreps = results.reduce((sum, r) => sum + r.prepsGenerated, 0);
  console.log(`[cron/meeting-prep] Done. ${totalPreps} preps across ${results.length} orgs`);

  return NextResponse.json({
    total_orgs: results.length,
    total_preps: totalPreps,
    results,
  });
}
