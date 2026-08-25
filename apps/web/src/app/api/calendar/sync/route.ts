import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { syncUserCalendar } from "@cantaia/core/calendar";
import { trackApiUsage } from "@cantaia/core/tracking";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 120;

/**
 * POST /api/calendar/sync
 *
 * Manual Microsoft Graph calendar sync for the current user.
 * The whole reconciliation lives in `syncUserCalendar` (packages/core) so the
 * nightly cron (/api/cron/calendar-sync) behaves identically.
 *
 * Query params:
 *   ?full=1  — ignore the stored delta token and replay the whole window.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Rate limit: ?full=1 replays a −180d/+365d window (up to 25 Graph pages
    // × 100 events + N+1 upserts) under a 120s budget, so cap it per user the
    // same way the email sync is capped (§8).
    const limitResult = await rateLimit(`calendar-sync:user:${user.id}`, {
      limit: 6,
      windowSec: 3600,
    });
    if (!limitResult.allowed) {
      return rateLimitResponse(limitResult) as unknown as NextResponse;
    }

    const tokenResult = await getValidMicrosoftToken(user.id);
    if ("error" in tokenResult) {
      return NextResponse.json(
        { error: "Microsoft not connected", detail: tokenResult.error },
        { status: 400 }
      );
    }

    const forceFull = request.nextUrl.searchParams.get("full") === "1";

    let result;
    try {
      result = await syncUserCalendar({
        admin: admin as any,
        accessToken: tokenResult.accessToken,
        userId: user.id,
        orgId: profile.organization_id,
        forceFull,
      });
    } catch (graphErr: any) {
      console.error("[calendar/sync] Graph fetch error:", graphErr);
      return NextResponse.json(
        { error: "Failed to fetch calendar from Microsoft" },
        { status: 502 }
      );
    }

    trackApiUsage({
      supabase: admin as any,
      userId: user.id,
      organizationId: profile.organization_id,
      actionType: "calendar_sync" as any,
      apiProvider: "microsoft" as any,
      model: "graph-calendar",
      metadata: {
        events_fetched: result.totalFetched,
        imported: result.imported,
        updated: result.updated,
        removed: result.removed,
        skipped_private: result.skippedPrivate,
        used_delta: result.usedDelta,
      },
    }).catch(() => {});

    console.log(
      `[calendar/sync] ${result.imported} imported, ${result.updated} updated, ` +
        `${result.removed} removed, ${result.skippedPrivate} private skipped ` +
        `(${result.usedDelta ? "delta" : "full"})`
    );

    return NextResponse.json({
      success: true,
      imported: result.imported,
      updated: result.updated,
      removed: result.removed,
      skipped_private: result.skippedPrivate,
      total_fetched: result.totalFetched,
      used_delta: result.usedDelta,
      prep_queued: result.prepQueued,
    });
  } catch (error) {
    console.error("[calendar/sync] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
