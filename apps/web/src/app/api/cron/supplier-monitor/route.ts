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
  canRunNightlyAgents,
  fetchOrgNotifiees,
} from "../agent-cron-utils";

export const maxDuration = 300;

/** Vercel Cron invokes scheduled paths with GET — delegate to POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/cron/supplier-monitor
 * Weekly CRON (Sunday 22h) — Analyzes all suppliers per organization:
 *   - Score trends and evolution
 *   - Response time analysis
 *   - Price competitiveness
 *   - Reliability patterns
 * Generates supplier_alerts and updates last_monitored_at.
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
  const agentConfig = getAgentConfig("supplier-monitor" as AgentType);
  const now = new Date().toISOString();

  // Get all organizations that have suppliers
  const { data: orgSuppliers } = await (admin as any)
    .from("suppliers")
    .select("organization_id")
    .not("organization_id", "is", null);

  if (!orgSuppliers || orgSuppliers.length === 0) {
    return NextResponse.json({ message: "No organizations with suppliers", count: 0 });
  }

  // Deduplicate and count suppliers per org
  const orgCounts = new Map<string, number>();
  for (const row of orgSuppliers) {
    orgCounts.set(row.organization_id, (orgCounts.get(row.organization_id) || 0) + 1);
  }

  // Skip orgs with fewer than 3 suppliers (not enough data for meaningful analysis)
  const eligibleOrgs = Array.from(orgCounts.entries()).filter(([, count]) => count >= 3);

  // Get a user per org for session attribution
  const orgUserMap = new Map<string, string>();
  for (const [orgId] of eligibleOrgs) {
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

  console.log(`[cron/supplier-monitor] Processing ${orgUserMap.size} organizations (${eligibleOrgs.length} eligible, ${orgCounts.size} total)`);

  const results: { orgId: string; alertsGenerated: number; suppliersAnalyzed: number; status: string; error?: string }[] = [];

  const skippedOrgs: string[] = [];
  const gatedOrgs: Array<{ orgId: string; reason: string }> = [];

  for (const [orgId, userId] of orgUserMap) {
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
      const supplierCount = orgCounts.get(orgId) || 0;

      const { error: sessErr } = await (admin as any).from("agent_sessions").insert({
        id: dbSessionId,
        organization_id: orgId,
        user_id: userId,
        agent_type: "supplier-monitor",
        session_id: sessionId,
        title: `Supplier Monitor CRON — ${now.split("T")[0]}`,
        input_payload: { _initial_message: "Analyze suppliers", trigger: "cron", supplier_count: supplierCount },
        status: "running",
        started_at: now,
        last_event_at: now,
        model: agentConfig.model,
      });
      if (sessErr) {
        console.error(`[cron/supplier-monitor] Session insert failed for org ${orgId}:`, sessErr.message);
        continue;
      }

      const startTime = Date.now();
      let alertsGenerated = 0;

      // AGT.M2 — count alerts the handler actually persisted. A tool call that
      // was rejected (e.g. supplier_id outside the org) must not produce a
      // notification claiming alerts were created.
      const requestedByToolUseId = new Map<string, number>();

      const onEvent = (eventType: string, data: Record<string, unknown>) => {
        if (data.tool_name !== "save_supplier_alerts") return;
        const toolUseId = typeof data.tool_use_id === "string" ? data.tool_use_id : "";

        if (eventType === "agent.tool_use") {
          requestedByToolUseId.set(toolUseId, countToolInputArray(data, "alerts"));
          return;
        }

        if (eventType === "custom_tool_result") {
          const requested = requestedByToolUseId.get(toolUseId) ?? 0;
          requestedByToolUseId.delete(toolUseId);
          if (!isSuccessfulToolResult(data)) return;
          alertsGenerated += extractSavedCount(data) ?? requested;
        }
      };

      const result = await runAgentLoop({
        apiKey,
        model: agentConfig.model,
        systemPrompt: agentConfig.systemPrompt,
        tools: agentConfig.tools,
        initialMessage:
          `Tu es le Supplier Monitor de Cantaia, exécuté en mode CRON hebdomadaire.\n` +
          `Organisation: ${orgId}\n` +
          `Date: ${now.split("T")[0]}\n` +
          `Nombre de fournisseurs: ${supplierCount}\n\n` +
          `Procédure :\n` +
          `1. Appelle fetch_all_suppliers_data pour obtenir la vue d'ensemble de tous les fournisseurs\n` +
          `2. Pour chaque fournisseur avec des signaux d'alerte, appelle fetch_supplier_history\n` +
          `3. Analyse les tendances : scores en baisse, temps de réponse en hausse, prix anormaux\n` +
          `4. Appelle save_supplier_alerts avec toutes les alertes détectées\n` +
          `5. Termine avec un résumé : X fournisseurs analysés, Y alertes (par type et sévérité)`,
        toolExecutor: (toolName, toolInput) =>
          executeCustomTool("supplier-monitor" as AgentType, toolName, toolInput, {
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
          actionType: "agent_supplier-monitor",
          apiProvider: "anthropic",
          model: agentConfig.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
      } catch { /* non-critical */ }

      // Notify every admin/director — supplier scores are a management
      // signal; the whole org used to be pinged, including field users who
      // cannot act on them.
      if (alertsGenerated > 0) {
        try {
          const notifiees = await fetchOrgNotifiees(admin, orgId);

          if (notifiees.length > 0) {
            const notifications = notifiees.map((notifieeId: string) => ({
              organization_id: orgId,
              user_id: notifieeId,
              agent_type: "supplier-monitor",
              title: `${alertsGenerated} alerte${alertsGenerated > 1 ? "s" : ""} fournisseur${alertsGenerated > 1 ? "s" : ""}`,
              description: `L'agent Supplier Monitor a détecté ${alertsGenerated} alerte${alertsGenerated > 1 ? "s" : ""} lors de l'analyse hebdomadaire de vos fournisseurs.`,
              metadata: { alerts_count: alertsGenerated, suppliers_analyzed: supplierCount, agent_session_id: dbSessionId },
            }));
            await (admin as any).from("agent_notifications").insert(notifications);
          }
        } catch { /* non-critical */ }
      }

      results.push({ orgId, alertsGenerated, suppliersAnalyzed: supplierCount, status: result.status });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`[cron/supplier-monitor] Error for org ${orgId}:`, errorMsg);
      results.push({ orgId, alertsGenerated: 0, suppliersAnalyzed: 0, status: "failed", error: errorMsg });
    }
  }

  const totalAlerts = results.reduce((sum, r) => sum + r.alertsGenerated, 0);
  const totalSuppliers = results.reduce((sum, r) => sum + r.suppliersAnalyzed, 0);
  console.log(
    `[cron/supplier-monitor] Done in ${Math.round((Date.now() - cronStart) / 1000)}s. ` +
    `${totalAlerts} alerts for ${totalSuppliers} suppliers across ${results.length} orgs`
  );

  if (skippedOrgs.length > 0) {
    console.warn(
      `[cron/supplier-monitor] Time budget exhausted — ${skippedOrgs.length} org(s) not processed: ${skippedOrgs.join(", ")}`
    );
  }

  return NextResponse.json({
    total_orgs: results.length,
    total_alerts: totalAlerts,
    total_suppliers_analyzed: totalSuppliers,
    skipped_orgs: skippedOrgs,
    gated_orgs: gatedOrgs,
    duration_ms: Date.now() - cronStart,
    results,
  });
}
