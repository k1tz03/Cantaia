import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/cron/aggregate-benchmarks
 * Vercel Cron invokes scheduled paths with GET — delegate to POST.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

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

    // Mark queue events as processed — but ONLY those whose consumer RPCs succeeded.
    // Events tied to a failed aggregation stay in the queue and are retried next run.
    const succeededFns = new Set(
      results.filter((r) => r.status === "ok").map((r) => r.fn)
    );
    const failedFns = aggregations.filter((fn) => !succeededFns.has(fn));

    // Map each queue source_table (migration 038 triggers) to the aggregation
    // functions that consume its data. Tables absent from this map (e.g.
    // submission_corrections, plan_analysis_corrections — consumed by the C3
    // weekly extract, not by these RPCs) are only marked when ALL RPCs succeed.
    const QUEUE_CONSUMERS: Record<string, string[]> = {
      supplier_offers: [
        "aggregate_market_benchmarks",
        "aggregate_supplier_scores",
        "aggregate_regional_price_index",
      ],
      email_classification_feedback: ["aggregate_email_benchmarks"],
      pv_corrections: ["aggregate_pv_benchmarks"],
      chat_feedback: ["aggregate_chat_analytics"],
      visit_report_corrections: ["aggregate_visit_benchmarks"],
      estimate_accuracy_log: ["aggregate_project_benchmarks"],
      task_status_log: ["aggregate_task_benchmarks"],
    };

    if (failedFns.length === 0) {
      // Full success → mark everything pending as processed
      const { error: updateError } = await (admin as any)
        .from("aggregation_queue")
        .update({ processed_at: new Date().toISOString() })
        .is("processed_at", null);

      if (updateError) {
        console.error("[cron/aggregate] Failed to mark events as processed:", updateError);
      }
    } else {
      // Partial failure → only mark events whose consumer functions ALL succeeded
      const processableTables = Object.entries(QUEUE_CONSUMERS)
        .filter(([, fns]) => fns.every((fn) => succeededFns.has(fn)))
        .map(([table]) => table);

      if (processableTables.length > 0) {
        const { error: updateError } = await (admin as any)
          .from("aggregation_queue")
          .update({ processed_at: new Date().toISOString() })
          .is("processed_at", null)
          .in("source_table", processableTables);

        if (updateError) {
          console.error("[cron/aggregate] Failed to mark events as processed:", updateError);
        }
      }

      const { count: remaining } = await (admin as any)
        .from("aggregation_queue")
        .select("*", { count: "exact", head: true })
        .is("processed_at", null);

      console.error(
        `[cron/aggregate] ${failedFns.length} aggregation(s) failed (${failedFns.join(", ")}) — ${remaining ?? "?"} event(s) left in queue for retry`
      );
    }

    const succeeded = succeededFns.size;
    if (process.env.NODE_ENV === "development") console.log(
      `[cron/aggregate] Done: ${succeeded}/${aggregations.length} functions succeeded, ${count} events pending at start`
    );

    return NextResponse.json({
      success: true,
      pending_events: count,
      results,
      succeeded,
      failed: failedFns,
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
