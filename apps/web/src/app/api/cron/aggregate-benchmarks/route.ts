import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/cron/aggregate-benchmarks
 * Vercel CRON — runs hourly to process aggregation queue and update C2 benchmarks.
 * Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const admin = createAdminClient();
  const results: { fn: string; status: string; error?: string }[] = [];

  try {
    // Check if there are pending events in the aggregation queue
    const { count } = await (admin as any)
      .from("aggregation_queue")
      .select("*", { count: "exact", head: true })
      .is("processed_at", null);

    if (!count || count === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending events",
        processed: 0,
      });
    }

    if (process.env.NODE_ENV === "development") console.log(`[cron/aggregate] ${count} pending events in queue`);

    // Execute aggregation functions in order
    const aggregations = [
      "aggregate_market_benchmarks",
      "aggregate_supplier_scores",
      "aggregate_email_benchmarks",
      "aggregate_task_benchmarks",
      "aggregate_chat_analytics",
      "aggregate_project_benchmarks",
      "aggregate_regional_price_index",
      "aggregate_pv_benchmarks",
      "aggregate_visit_benchmarks",
    ];

    for (const fn of aggregations) {
      try {
        const { error } = await (admin as any).rpc(fn);
        if (error) {
          console.error(`[cron/aggregate] Error in ${fn}:`, error.message);
          results.push({ fn, status: "error", error: error.message });
        } else {
          results.push({ fn, status: "ok" });
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : "Unknown";
        console.error(`[cron/aggregate] Exception in ${fn}:`, errMsg);
        results.push({ fn, status: "exception", error: errMsg });
      }
    }

    // Mark queue events as processed
    const { error: updateError } = await (admin as any)
      .from("aggregation_queue")
      .update({ processed_at: new Date().toISOString() })
      .is("processed_at", null);

    if (updateError) {
      console.error("[cron/aggregate] Failed to mark events as processed:", updateError);
    }

    const succeeded = results.filter((r) => r.status === "ok").length;
    if (process.env.NODE_ENV === "development") console.log(
      `[cron/aggregate] Done: ${succeeded}/${aggregations.length} functions succeeded, ${count} events processed`
    );

    return NextResponse.json({
      success: true,
      pending_events: count,
      results,
      succeeded,
      total: aggregations.length,
    });
  } catch (err: unknown) {
    console.error("[cron/aggregate] Fatal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Aggregation failed" },
      { status: 500 }
    );
  }
}
