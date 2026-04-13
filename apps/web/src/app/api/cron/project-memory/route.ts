import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentConfig, runAgentLoop } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";
import { executeCustomTool } from "../../agents/[type]/stream/tool-handlers";
import { trackApiUsage } from "@cantaia/core/tracking";

export const maxDuration = 300; // 5 min per org

/**
 * POST /api/cron/project-memory
 * CRON every 4 hours — Scans all organizations with active projects
 * and builds/updates the project_memory table for each.
 * Runs the "project-memory" agent once per org.
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
  const agentConfig = getAgentConfig("project-memory" as AgentType);
  const now = new Date().toISOString();

  // Find all organizations that have active projects
  const { data: orgProjects } = await (admin as any)
    .from("projects")
    .select("organization_id")
    .in("status", ["planning", "active", "paused", "on_hold"]);

  if (!orgProjects || orgProjects.length === 0) {
    return NextResponse.json({ message: "No organizations with active projects", count: 0 });
  }

  // Deduplicate by organization — pick one user per org as context
  const orgIds = [...new Set<string>(orgProjects.map((p: { organization_id: string }) => p.organization_id))];

  // For each org, find one user to use as context
  const orgMap = new Map<string, string>();
  for (const orgId of orgIds) {
    const { data: users } = await (admin as any)
      .from("users")
      .select("id")
      .eq("organization_id", orgId)
      .limit(1);

    if (users && users.length > 0) {
      orgMap.set(orgId, users[0].id);
    }
  }

  console.log(`[cron/project-memory] Processing ${orgMap.size} organizations`);

  const results: { orgId: string; projectsUpdated: number; status: string; error?: string }[] = [];

  for (const [orgId, userId] of orgMap) {
    try {
      // Create an agent session record
      const sessionId = crypto.randomUUID();
      const dbSessionId = crypto.randomUUID();

      await (admin as any).from("agent_sessions").insert({
        id: dbSessionId,
        organization_id: orgId,
        user_id: userId,
        agent_type: "project-memory",
        session_id: sessionId,
        title: `Project Memory CRON — ${now.split("T")[0]}`,
        input_payload: { _initial_message: "Scan and update project memory", trigger: "cron" },
        status: "running",
        started_at: now,
        model: agentConfig.model,
      });

      const startTime = Date.now();
      let projectsUpdated = 0;

      // onEvent: log-only (no SSE in CRON context)
      const onEvent = (eventType: string, data: Record<string, unknown>) => {
        if (eventType === "agent.tool_use" && data.tool_name === "save_project_memory") {
          projectsUpdated++;
        }
      };

      const result = await runAgentLoop({
        apiKey,
        model: agentConfig.model,
        systemPrompt: agentConfig.systemPrompt,
        tools: agentConfig.tools,
        initialMessage:
          `Tu es l'agent Project Memory de Cantaia, exécuté en mode CRON.\n` +
          `Organisation: ${orgId}\n` +
          `Date: ${now.split("T")[0]}\n\n` +
          `Procédure :\n` +
          `1. Appelle fetch_org_projects pour obtenir tous les projets actifs de l'organisation\n` +
          `2. Pour chaque projet, appelle fetch_project_full_state pour collecter l'état complet (emails récents, tâches ouvertes, soumissions actives, analyses de plans, réunions, rapports de chantier, visites, planning)\n` +
          `3. Synthétise l'état de chaque projet et appelle save_project_memory pour sauvegarder/mettre à jour la mémoire projet\n` +
          `4. Termine avec un résumé des projets mis à jour`,
        toolExecutor: (toolName, toolInput) =>
          executeCustomTool("project-memory" as AgentType, toolName, toolInput, {
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
          actionType: "agent_project-memory",
          apiProvider: "anthropic",
          model: agentConfig.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
      } catch { /* non-critical */ }

      results.push({ orgId, projectsUpdated, status: result.status });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/project-memory] Error for org ${orgId}:`, errorMsg);
      results.push({ orgId, projectsUpdated: 0, status: "failed", error: errorMsg });
    }
  }

  const totalUpdated = results.reduce((sum, r) => sum + r.projectsUpdated, 0);
  console.log(`[cron/project-memory] Done. ${totalUpdated} projects updated across ${results.length} orgs`);

  return NextResponse.json({
    total_orgs: results.length,
    total_projects_updated: totalUpdated,
    results,
  });
}
