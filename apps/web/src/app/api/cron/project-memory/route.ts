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
// It was disabled because the "project-memory" agent declared three custom
// tools (fetch_org_projects, fetch_project_full_state, save_project_memory)
// that had NO handler: every call returned "Unknown custom tool", the loop
// burned its Sonnet iterations per org per run, and `project_memory` was
// never written.
//
// The handlers now exist in
// apps/web/src/app/api/agents/[type]/stream/tool-handlers.ts.
//
// SCHEDULE TO ADD to apps/web/vercel.json (owned by another agent):
//   { "path": "/api/cron/project-memory", "schedule": "0 5 * * *" }
// ============================================================

/** Vercel Cron invokes scheduled paths with GET — delegate to POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/cron/project-memory
 * Nightly CRON — Scans all organizations with active projects and
 * builds/updates the `project_memory` snapshot used by meeting-prep,
 * briefings and the calendar intelligence panel.
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
  const agentConfig = getAgentConfig("project-memory" as AgentType);
  const now = new Date().toISOString();

  // Find all organizations that have active projects
  const { data: orgProjects } = await (admin as any)
    .from("projects")
    .select("organization_id")
    .in("status", ["planning", "active", "paused", "on_hold"])
    .not("organization_id", "is", null);

  if (!orgProjects || orgProjects.length === 0) {
    return NextResponse.json({ message: "No organizations with active projects", count: 0 });
  }

  const orgIds = Array.from(
    new Set<string>(orgProjects.map((p: { organization_id: string }) => p.organization_id))
  );

  // Attribute the run to a stable admin/director of the org (ordered, so the
  // same person owns the session run after run instead of "whoever came
  // first"). Any org member is a fallback for orgs with no admin yet.
  const orgMap = new Map<string, string>();
  for (const orgId of orgIds) {
    const { data: leads } = await (admin as any)
      .from("users")
      .select("id, role, created_at")
      .eq("organization_id", orgId)
      .in("role", ["admin", "director", "project_manager"])
      .order("created_at", { ascending: true })
      .limit(1);

    if (leads?.length) {
      orgMap.set(orgId, leads[0].id);
      continue;
    }

    const { data: anyone } = await (admin as any)
      .from("users")
      .select("id")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (anyone?.length) orgMap.set(orgId, anyone[0].id);
  }

  console.log(`[cron/project-memory] Processing ${orgMap.size} organizations`);

  const results: { orgId: string; projectsUpdated: number; status: string; error?: string }[] = [];
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

    try {
      const sessionId = crypto.randomUUID();
      const dbSessionId = crypto.randomUUID();

      const { error: sessErr } = await (admin as any).from("agent_sessions").insert({
        id: dbSessionId,
        organization_id: orgId,
        user_id: userId,
        agent_type: "project-memory",
        session_id: sessionId,
        title: `Project Memory CRON — ${now.split("T")[0]}`,
        input_payload: { _initial_message: "Scan and update project memory", trigger: "cron" },
        status: "running",
        started_at: now,
        last_event_at: now,
        model: agentConfig.model,
      });
      if (sessErr) {
        console.error(`[cron/project-memory] Session insert failed for org ${orgId}:`, sessErr.message);
        continue;
      }

      const startTime = Date.now();
      let projectsUpdated = 0;

      // AGT.M2 — count what the handler actually persisted. Counting
      // `agent.tool_use` counted attempts, including calls that returned
      // `{ error: true }` (access denied, insert failed).
      const onEvent = (eventType: string, data: Record<string, unknown>) => {
        if (
          eventType === "custom_tool_result" &&
          data.tool_name === "save_project_memory" &&
          isSuccessfulToolResult(data)
        ) {
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
          // Surfaced by the /agents page.
          result_payload: {
            projects_updated: projectsUpdated,
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
  console.log(
    `[cron/project-memory] Done in ${Math.round((Date.now() - cronStart) / 1000)}s. ` +
      `${totalUpdated} projects updated across ${results.length} orgs`
  );

  if (skippedOrgs.length > 0) {
    console.warn(
      `[cron/project-memory] Time budget exhausted — ${skippedOrgs.length} org(s) not processed: ${skippedOrgs.join(", ")}`
    );
  }

  return NextResponse.json({
    total_orgs: results.length,
    total_projects_updated: totalUpdated,
    skipped_orgs: skippedOrgs,
    gated_orgs: gatedOrgs,
    duration_ms: Date.now() - cronStart,
    results,
  });
}
