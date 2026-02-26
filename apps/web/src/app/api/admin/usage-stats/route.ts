import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/usage-stats
 * Returns API usage stats for the admin dashboard.
 * Query params: period=7d|30d|90d (default: 30d)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify admin role
  const adminClient = createAdminClient();
  const { data: userData } = await adminClient
    .from("users")
    .select("role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userData || !["admin", "superadmin"].includes(userData.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const orgId = userData.organization_id;
  if (!orgId) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  // Parse period
  const period = request.nextUrl.searchParams.get("period") || "30d";
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  // Fetch all logs for the period
  const { data: logs, error } = await adminClient
    .from("api_usage_logs")
    .select("*")
    .eq("organization_id", orgId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const allLogs = logs || [];

  // --- Overview totals ---
  const totalCostChf = allLogs.reduce((sum, l) => sum + (l.estimated_cost_chf || 0), 0);
  const totalCalls = allLogs.length;
  const totalInputTokens = allLogs.reduce((sum, l) => sum + (l.input_tokens || 0), 0);
  const totalOutputTokens = allLogs.reduce((sum, l) => sum + (l.output_tokens || 0), 0);

  // --- Per-user breakdown ---
  const userMap = new Map<string, { calls: number; cost: number; inputTokens: number; outputTokens: number }>();
  for (const log of allLogs) {
    const uid = log.user_id || "unknown";
    const existing = userMap.get(uid) || { calls: 0, cost: 0, inputTokens: 0, outputTokens: 0 };
    existing.calls++;
    existing.cost += log.estimated_cost_chf || 0;
    existing.inputTokens += log.input_tokens || 0;
    existing.outputTokens += log.output_tokens || 0;
    userMap.set(uid, existing);
  }

  // Fetch user names
  const userIds = [...userMap.keys()].filter(id => id !== "unknown");
  const { data: users } = userIds.length > 0
    ? await adminClient
        .from("users")
        .select("id, first_name, last_name, email")
        .in("id", userIds)
    : { data: [] };

  const userNameMap = new Map((users || []).map(u => [u.id, `${u.first_name} ${u.last_name}`]));
  const userEmailMap = new Map((users || []).map(u => [u.id, u.email]));

  const perUser = [...userMap.entries()].map(([uid, data]) => ({
    user_id: uid,
    user_name: userNameMap.get(uid) || "Inconnu",
    user_email: userEmailMap.get(uid) || "",
    ...data,
  })).sort((a, b) => b.cost - a.cost);

  // --- Per-action breakdown ---
  const actionMap = new Map<string, { calls: number; cost: number }>();
  for (const log of allLogs) {
    const action = log.action_type;
    const existing = actionMap.get(action) || { calls: 0, cost: 0 };
    existing.calls++;
    existing.cost += log.estimated_cost_chf || 0;
    actionMap.set(action, existing);
  }

  const perAction = [...actionMap.entries()].map(([action, data]) => ({
    action_type: action,
    ...data,
  })).sort((a, b) => b.cost - a.cost);

  // --- Daily trend ---
  const dailyMap = new Map<string, { calls: number; cost: number }>();
  for (const log of allLogs) {
    const day = log.created_at.substring(0, 10); // YYYY-MM-DD
    const existing = dailyMap.get(day) || { calls: 0, cost: 0 };
    existing.calls++;
    existing.cost += log.estimated_cost_chf || 0;
    dailyMap.set(day, existing);
  }

  const dailyTrend = [...dailyMap.entries()]
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // --- Cost alerts ---
  const alerts: Array<{ type: "warning" | "danger"; message: string }> = [];
  const dailyCostAvg = days > 0 ? totalCostChf / days : 0;
  const projectedMonthly = dailyCostAvg * 30;

  if (projectedMonthly > 50) {
    alerts.push({ type: "danger", message: `Coût mensuel projeté élevé : CHF ${projectedMonthly.toFixed(2)}` });
  } else if (projectedMonthly > 20) {
    alerts.push({ type: "warning", message: `Coût mensuel projeté : CHF ${projectedMonthly.toFixed(2)}` });
  }

  // Check for any user consuming > 50% of total
  for (const u of perUser) {
    if (totalCostChf > 0 && u.cost / totalCostChf > 0.5) {
      alerts.push({
        type: "warning",
        message: `${u.user_name} représente ${((u.cost / totalCostChf) * 100).toFixed(0)}% des coûts`,
      });
    }
  }

  return NextResponse.json({
    period,
    days,
    overview: {
      total_cost_chf: Math.round(totalCostChf * 1000) / 1000,
      total_calls: totalCalls,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      avg_cost_per_call: totalCalls > 0 ? Math.round((totalCostChf / totalCalls) * 10000) / 10000 : 0,
      projected_monthly_chf: Math.round(projectedMonthly * 100) / 100,
    },
    per_user: perUser,
    per_action: perAction,
    daily_trend: dailyTrend,
    alerts,
  });
}
