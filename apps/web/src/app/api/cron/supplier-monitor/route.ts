import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAgentConfig, runAgentLoop } from "@cantaia/core/agents";
import type { AgentType } from "@cantaia/core/agents";
import { executeCustomTool } from "../../agents/[type]/stream/tool-handlers";
import { trackApiUsage } from "@cantaia/core/tracking";

export const maxDuration = 300;

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

  for (const [orgId, userId] of orgUserMap) {
    try {
      const sessionId = crypto.randomUUID();
      const dbSessionId = crypto.randomUUID();
      const supplierCount = orgCounts.get(orgId) || 0;

      await (admin as any).from("agent_sessions").insert({
        id: dbSessionId,
        organization_id: orgId,
        user_id: userId,
        agent_type: "supplier-monitor",
        session_id: sessionId,
        title: `Supplier Monitor CRON — ${now.split("T")[0]}`,
        input_payload: { _initial_message: "Analyze suppliers", trigger: "cron", supplier_count: supplierCount },
        status: "running",
        started_at: now,
        model: agentConfig.model,
      });

      const startTime = Date.now();
      let alertsGenerated = 0;

      const onEvent = (eventType: string, data: Record<string, unknown>) => {
        if (eventType === "agent.tool_use" && data.tool_name === "save_supplier_alerts") {
          try {
            const alerts = typeof data.tool_input === "object" && data.tool_input
              ? (data.tool_input as Record<string, unknown>).alerts
              : null;
            if (typeof alerts === "string") {
              alertsGenerated += JSON.parse(alerts).length;
            }
          } catch { /* count stays 0 */ }
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
        maxDurationMs: agentConfig.maxDurationMs,
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

      // Notify if alerts were generated
      if (alertsGenerated > 0) {
        try {
          const { data: orgMembers } = await (admin as any)
            .from("users")
            .select("id")
            .eq("organization_id", orgId);

          if (orgMembers) {
            const notifications = orgMembers.map((m: { id: string }) => ({
              organization_id: orgId,
              user_id: m.id,
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
  console.log(`[cron/supplier-monitor] Done. ${totalAlerts} alerts for ${totalSuppliers} suppliers across ${results.length} orgs`);

  return NextResponse.json({
    total_orgs: results.length,
    total_alerts: totalAlerts,
    total_suppliers_analyzed: totalSuppliers,
    results,
  });
}
