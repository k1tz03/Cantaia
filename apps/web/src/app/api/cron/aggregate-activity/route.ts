import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ============================================================
// POST /api/cron/aggregate-activity
// ============================================================
// Vercel CRON — runs daily to aggregate raw usage_events into
// user_activity_daily and prune old raw events (>90 days).
// Protected by CRON_SECRET.

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const admin = createAdminClient();

  try {
    // Yesterday's date range (UTC)
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const startOfDay = new Date(
      Date.UTC(
        yesterday.getUTCFullYear(),
        yesterday.getUTCMonth(),
        yesterday.getUTCDate(),
        0, 0, 0, 0
      )
    );
    const endOfDay = new Date(
      Date.UTC(
        yesterday.getUTCFullYear(),
        yesterday.getUTCMonth(),
        yesterday.getUTCDate(),
        23, 59, 59, 999
      )
    );
    const statDate = startOfDay.toISOString().split("T")[0]; // YYYY-MM-DD

    // Fetch raw events for yesterday
    const { data: rawEvents, error: fetchError } = await (admin as any)
      .from("usage_events")
      .select(
        "user_id, organization_id, feature, action, page, session_id, duration_ms"
      )
      .gte("created_at", startOfDay.toISOString())
      .lte("created_at", endOfDay.toISOString())
      .not("feature", "is", null);

    if (fetchError) {
      console.error("[aggregate-activity] Fetch error:", fetchError.message);
      return NextResponse.json(
        { error: "Failed to fetch events", detail: fetchError.message },
        { status: 500 }
      );
    }

    if (!rawEvents || rawEvents.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No events to aggregate",
        stat_date: statDate,
      });
    }

    // Group by user_id + feature
    interface AggBucket {
      user_id: string;
      organization_id: string | null;
      feature: string;
      page_views: number;
      feature_uses: number;
      total_duration_ms: number;
      unique_pages: Set<string>;
      unique_sessions: Set<string>;
    }

    const buckets = new Map<string, AggBucket>();

    for (const evt of rawEvents) {
      const key = `${evt.user_id}::${evt.feature}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          user_id: evt.user_id,
          organization_id: evt.organization_id,
          feature: evt.feature,
          page_views: 0,
          feature_uses: 0,
          total_duration_ms: 0,
          unique_pages: new Set<string>(),
          unique_sessions: new Set<string>(),
        };
        buckets.set(key, bucket);
      }

      if (evt.action === "page_view") {
        bucket.page_views++;
      } else {
        bucket.feature_uses++;
      }

      if (typeof evt.duration_ms === "number" && evt.duration_ms > 0) {
        bucket.total_duration_ms += evt.duration_ms;
      }
      if (evt.page) {
        bucket.unique_pages.add(evt.page);
      }
      if (evt.session_id) {
        bucket.unique_sessions.add(evt.session_id);
      }
    }

    // Upsert into user_activity_daily
    const upsertRows = Array.from(buckets.values()).map((b) => ({
      stat_date: statDate,
      user_id: b.user_id,
      organization_id: b.organization_id,
      feature: b.feature,
      page_views: b.page_views,
      feature_uses: b.feature_uses,
      total_duration_ms: b.total_duration_ms,
      unique_pages: b.unique_pages.size,
      session_count: b.unique_sessions.size,
    }));

    const { error: upsertError } = await (admin as any)
      .from("user_activity_daily")
      .upsert(upsertRows, {
        onConflict: "stat_date,user_id,feature",
      });

    if (upsertError) {
      console.error("[aggregate-activity] Upsert error:", upsertError.message);
      return NextResponse.json(
        { error: "Failed to upsert", detail: upsertError.message },
        { status: 500 }
      );
    }

    // Delete raw events older than 90 days
    const cutoffDate = new Date(now);
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - 90);

    const { error: deleteError, count: deletedCount } = await (admin as any)
      .from("usage_events")
      .delete({ count: "exact" })
      .lt("created_at", cutoffDate.toISOString());

    if (deleteError) {
      console.error(
        "[aggregate-activity] Delete old events error:",
        deleteError.message
      );
    }

    return NextResponse.json({
      success: true,
      stat_date: statDate,
      raw_events_processed: rawEvents.length,
      buckets_upserted: upsertRows.length,
      old_events_deleted: deletedCount ?? 0,
    });
  } catch (err) {
    console.error("[aggregate-activity] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
