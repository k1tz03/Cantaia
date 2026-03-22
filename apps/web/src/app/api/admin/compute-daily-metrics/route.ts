import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";

/**
 * POST /api/admin/compute-daily-metrics
 * Computes daily metrics for a given date (default: yesterday) by aggregating data
 * from api_usage_logs, admin_activity_logs, users, and organizations tables.
 * Protected: superadmin only.
 * Can also be called via cron (with CRON_SECRET header).
 */
export async function POST(request: NextRequest) {
  // Auth: either superadmin or cron secret
  const cronSecret = request.headers.get("x-cron-secret");
  const isCron = cronSecret && cronSecret === process.env.CRON_SECRET;

  if (!isCron) {
    const check = await requireSuperadmin();
    if (!check.authorized) {
      return NextResponse.json({ error: check.error }, { status: 403 });
    }
  }

  const admin = createAdminClient();

  // Parse target date (default: yesterday)
  let body: { date?: string } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional for this route
  }
  const targetDate = body.date || getYesterdayDate();

  // Compute start/end of day in UTC
  const dayStart = `${targetDate}T00:00:00Z`;
  const dayEnd = `${targetDate}T23:59:59.999Z`;

  try {
    // 1. Total users and orgs
    const { count: totalUsers } = await (admin as any)
      .from("users")
      .select("id", { count: "exact", head: true });

    const { count: totalOrgs } = await (admin as any)
      .from("organizations")
      .select("id", { count: "exact", head: true });

    // 2. New users today
    const { count: newUsersToday } = await (admin as any)
      .from("users")
      .select("id", { count: "exact", head: true })
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    // 3. Active users and orgs (from admin_activity_logs)
    const { data: activeUserRows } = await (admin as any)
      .from("admin_activity_logs")
      .select("user_id")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    const uniqueActiveUsers = new Set(
      (activeUserRows || []).map((r: { user_id: string }) => r.user_id)
    );

    const { data: activeOrgRows } = await (admin as any)
      .from("admin_activity_logs")
      .select("organization_id")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    const uniqueActiveOrgs = new Set(
      (activeOrgRows || [])
        .map((r: { organization_id: string }) => r.organization_id)
        .filter(Boolean)
    );

    // 4. Activity counts by action type
    const { data: activityLogs } = await (admin as any)
      .from("admin_activity_logs")
      .select("action")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    const actionCounts: Record<string, number> = {};
    for (const log of activityLogs || []) {
      actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
    }

    // 5. API costs from api_usage_logs
    const { data: usageLogs } = await (admin as any)
      .from("api_usage_logs")
      .select("api_provider, estimated_cost_chf")
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd);

    let totalApiCost = 0;
    let anthropicCost = 0;
    let openaiCost = 0;

    for (const log of usageLogs || []) {
      const cost = log.estimated_cost_chf || 0;
      totalApiCost += cost;
      if (log.api_provider === "anthropic") anthropicCost += cost;
      else if (log.api_provider === "openai_whisper") openaiCost += cost;
    }

    // 6. Revenue estimate (sum of plan pricing for all active orgs)
    const { data: orgPlans } = await (admin as any)
      .from("organizations")
      .select("plan")
      .in("plan", ["starter", "pro", "enterprise"]);

    const PLAN_MRR: Record<string, number> = {
      starter: 149,
      pro: 349,
      enterprise: 790,
    };

    const totalMrr = (orgPlans || []).reduce(
      (sum: number, o: { plan: string }) => sum + (PLAN_MRR[o.plan] || 0),
      0
    );
    // Daily revenue = monthly MRR / 30
    const dailyRevenue = Number((totalMrr / 30).toFixed(4));

    // 7. Upsert into admin_daily_metrics
    const metricsRow = {
      metric_date: targetDate,
      total_users: totalUsers || 0,
      active_users_today: uniqueActiveUsers.size,
      new_users_today: newUsersToday || 0,
      total_organizations: totalOrgs || 0,
      active_organizations_today: uniqueActiveOrgs.size,
      emails_synced: actionCounts["sync_emails"] || 0,
      emails_classified: actionCounts["classify_email"] || 0,
      replies_generated: actionCounts["generate_reply"] || 0,
      tasks_created: actionCounts["create_task"] || 0,
      pv_generated: actionCounts["generate_pv"] || 0,
      pv_transcribed: actionCounts["transcribe_audio"] || 0,
      briefings_generated: actionCounts["generate_briefing"] || 0,
      total_api_cost_chf: Number(totalApiCost.toFixed(4)),
      anthropic_cost_chf: Number(anthropicCost.toFixed(4)),
      openai_cost_chf: Number(openaiCost.toFixed(4)),
      total_revenue_chf: dailyRevenue,
    };

    const { data: stored, error: upsertError } = await (admin as any)
      .from("admin_daily_metrics")
      .upsert(metricsRow, { onConflict: "metric_date" })
      .select()
      .single();

    if (upsertError) {
      console.error("[compute-daily-metrics] Upsert error:", upsertError);
      return NextResponse.json(
        { error: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      date: targetDate,
      metrics: stored,
    });
  } catch (err: unknown) {
    console.error("[compute-daily-metrics] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

/** GET: Fetch stored daily metrics for a period */
export async function GET(request: NextRequest) {
  const check = await requireSuperadmin();
  if (!check.authorized) {
    return NextResponse.json({ error: check.error }, { status: 403 });
  }

  const admin = createAdminClient();
  const days = Number(request.nextUrl.searchParams.get("days") || "30");
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().split("T")[0];

  const { data: metrics, error } = await (admin as any)
    .from("admin_daily_metrics")
    .select("*")
    .gte("metric_date", sinceDate)
    .order("metric_date", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ metrics: metrics || [] });
}

function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}
