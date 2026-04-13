import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentConfig, runAgentLoop } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";
import { executeCustomTool } from "../../agents/[type]/stream/tool-handlers";
import { trackApiUsage } from "@cantaia/core/tracking";

export const maxDuration = 300; // 5 min per org

/**
 * POST /api/cron/email-drafter
 * Nightly CRON (23h) — Scans emails needing a response and generates
 * AI draft replies using project context + thread history.
 * Runs once per organization that has active email connections.
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

  // Deduplicate by organization — run one agent per org, pick the first user as context
  const orgMap = new Map<string, string>();
  for (const row of orgUsers) {
    if (!orgMap.has(row.organization_id)) {
      orgMap.set(row.organization_id, row.user_id);
    }
  }

  console.log(`[cron/email-drafter] Processing ${orgMap.size} organizations`);

  const results: { orgId: string; draftsGenerated: number; status: string; error?: string }[] = [];

  for (const [orgId, userId] of orgMap) {
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
      const onEvent = (eventType: string, data: Record<string, unknown>) => {
        if (eventType === "agent.tool_use" && data.tool_name === "save_email_draft") {
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
          actionType: "agent_email-drafter",
          apiProvider: "anthropic",
          model: agentConfig.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
      } catch { /* non-critical */ }

      // Create notification if drafts were generated
      if (draftsGenerated > 0) {
        try {
          // Get all users in this org for notifications
          const { data: orgMembers } = await (admin as any)
            .from("users")
            .select("id")
            .eq("organization_id", orgId);

          if (orgMembers) {
            const notifications = orgMembers.map((m: { id: string }) => ({
              organization_id: orgId,
              user_id: m.id,
              agent_type: "email-drafter",
              title: `${draftsGenerated} brouillon${draftsGenerated > 1 ? "s" : ""} de réponse créé${draftsGenerated > 1 ? "s" : ""}`,
              description: `L'agent Email Drafter a préparé ${draftsGenerated} brouillon${draftsGenerated > 1 ? "s" : ""} de réponse pour vos emails en attente.`,
              metadata: { drafts_count: draftsGenerated, agent_session_id: dbSessionId },
            }));
            await (admin as any).from("agent_notifications").insert(notifications);
          }
        } catch { /* non-critical */ }
      }

      results.push({ orgId, draftsGenerated, status: result.status });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/email-drafter] Error for org ${orgId}:`, errorMsg);
      results.push({ orgId, draftsGenerated: 0, status: "failed", error: errorMsg });
    }
  }

  const totalDrafts = results.reduce((sum, r) => sum + r.draftsGenerated, 0);
  console.log(`[cron/email-drafter] Done. ${totalDrafts} drafts across ${results.length} orgs`);

  return NextResponse.json({
    total_orgs: results.length,
    total_drafts: totalDrafts,
    results,
  });
}
