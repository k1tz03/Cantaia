import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const maxDuration = 120;

/** Vercel Cron invokes scheduled paths with GET — delegate to POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/cron/refresh-intelligence
 * Refreshes materialized views used for collective intelligence (C2/C3).
 * Protected by CRON_SECRET.
 * Scheduled: daily at 3:30 AM.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const results: Array<{ view: string; refreshed: boolean; duration_ms: number; error?: string }> = [];

  // AUDIT 08/2026 — on ne liste QUE des vues réellement définies (043/045/064)
  // et on appelle une RPC réelle (`refresh_materialized_view_safe`, migration
  // 127) qui gère le fallback CONCURRENTLY → refresh simple côté SQL. Les deux
  // vues fantômes (mv_correction_trends, mv_price_calibration_accuracy) et les
  // RPC inexistantes (refresh_materialized_view_concurrently, exec_sql) ont été
  // retirées : le cron faisait un no-op tout en loggant des succès.
  const viewsToRefresh = [
    "mv_supplier_daily_metrics",
    "mv_labor_productivity",
    "mv_reference_prices",
    "mv_calibration_coefficients",
    "mv_qty_calibration",
  ];

  for (const viewName of viewsToRefresh) {
    const start = Date.now();
    // supabase-js ne throw pas : on lit `{error}` explicitement.
    const { error } = await (admin as any).rpc("refresh_materialized_view_safe", {
      p_view: viewName,
    });
    const duration = Date.now() - start;

    if (error) {
      // Vue absente (migration non appliquée) ou RPC 127 manquante — non bloquant.
      console.warn(`[cron/refresh-intelligence] Cannot refresh ${viewName}: ${error.message}`);
      results.push({ view: viewName, refreshed: false, duration_ms: duration, error: error.message });
      continue;
    }

    console.log(`[cron/refresh-intelligence] Refreshed ${viewName} in ${duration}ms`);
    results.push({ view: viewName, refreshed: true, duration_ms: duration });
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
