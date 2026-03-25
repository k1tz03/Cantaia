import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 120;

/**
 * POST /api/cron/refresh-intelligence
 * Refreshes materialized views used for collective intelligence (C2/C3).
 * Protected by CRON_SECRET.
 * Scheduled: daily at 3:30 AM.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const results: Array<{ view: string; refreshed: boolean; duration_ms: number; error?: string }> = [];

  const viewsToRefresh = [
    "mv_supplier_daily_metrics",
    "mv_labor_productivity",
    "mv_correction_trends",
    "mv_price_calibration_accuracy",
    "mv_reference_prices",
  ];

  for (const viewName of viewsToRefresh) {
    const start = Date.now();
    try {
      // Use CONCURRENTLY to avoid locking reads during refresh
      // Falls back to non-concurrent if the unique index doesn't exist
      const { error } = await (admin as any).rpc("refresh_materialized_view_concurrently", {
        view_name: viewName,
      });

      if (error) {
        // RPC function may not exist — try direct SQL via admin
        // Supabase doesn't support raw SQL via client, so we use a simpler approach:
        // Just try the refresh and catch if view doesn't exist
        const { error: directError } = await (admin as any).rpc("exec_sql", {
          query: `REFRESH MATERIALIZED VIEW CONCURRENTLY ${viewName}`,
        });

        if (directError) {
          // The exec_sql RPC likely doesn't exist either — log and skip
          const duration = Date.now() - start;
          console.warn(`[cron/refresh-intelligence] Cannot refresh ${viewName}: ${directError.message}`);
          results.push({ view: viewName, refreshed: false, duration_ms: duration, error: directError.message });
          continue;
        }
      }

      const duration = Date.now() - start;
      console.log(`[cron/refresh-intelligence] Refreshed ${viewName} in ${duration}ms`);
      results.push({ view: viewName, refreshed: true, duration_ms: duration });
    } catch (err: any) {
      const duration = Date.now() - start;
      // View may not exist (migration not applied) — non-blocking
      console.warn(`[cron/refresh-intelligence] Failed to refresh ${viewName}:`, err?.message);
      results.push({ view: viewName, refreshed: false, duration_ms: duration, error: err?.message });
    }
  }

  const refreshed = results.filter((r) => r.refreshed).length;
  const failed = results.filter((r) => !r.refreshed).length;
  const totalDuration = results.reduce((s, r) => s + r.duration_ms, 0);

  console.log(`[cron/refresh-intelligence] Done: ${refreshed} refreshed, ${failed} skipped, total ${totalDuration}ms`);

  return NextResponse.json({
    message: `Refreshed ${refreshed} of ${viewsToRefresh.length} views`,
    refreshed,
    failed,
    total_duration_ms: totalDuration,
    results,
  });
}
