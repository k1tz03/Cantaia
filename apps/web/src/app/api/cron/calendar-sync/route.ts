import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { syncUserCalendar } from "@cantaia/core/calendar";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { GLOBAL_BUDGET_MS, MIN_ORG_BUDGET_MS } from "../agent-cron-utils";

export const maxDuration = 300;

// ============================================================
// SCHEDULE TO ADD to apps/web/vercel.json (owned by another agent):
//   { "path": "/api/cron/calendar-sync", "schedule": "15 5 * * *" }
//
// Without it, the Outlook calendar only refreshes when a user clicks
// "Sync" — so the meeting-prep agent (which runs at night) never sees
// meetings created in Outlook during the day.
// ============================================================

/** Vercel Cron invokes scheduled paths with GET — delegate to POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/cron/calendar-sync
 *
 * Nightly Microsoft Graph calendar sync for every user with an active
 * Microsoft email connection. Delta-based, so a steady-state run is cheap.
 * Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cronStart = Date.now();
  const admin = createAdminClient();

  // Only Microsoft connections carry a Graph calendar.
  const { data: connections } = await (admin as any)
    .from("email_connections")
    .select("user_id, organization_id")
    .eq("provider", "microsoft")
    .eq("status", "active");

  if (!connections || connections.length === 0) {
    return NextResponse.json({ message: "No active Microsoft connections", count: 0 });
  }

  // A user may hold several connection rows — sync each mailbox once.
  const seen = new Set<string>();
  const targets: Array<{ userId: string; orgId: string }> = [];
  for (const row of connections) {
    if (!row.user_id || !row.organization_id) continue;
    const key = `${row.organization_id}|${row.user_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ userId: row.user_id, orgId: row.organization_id });
  }

  const results: Array<{
    userId: string;
    orgId: string;
    status: "ok" | "skipped" | "failed";
    imported?: number;
    updated?: number;
    removed?: number;
    prepQueued?: number;
    error?: string;
  }> = [];
  const skipped: Array<{ userId: string; orgId: string }> = [];

  for (const { userId, orgId } of targets) {
    // Same budget discipline as the agent crons: stop cleanly instead of
    // being killed mid-write by Vercel.
    if (GLOBAL_BUDGET_MS - (Date.now() - cronStart) < MIN_ORG_BUDGET_MS) {
      skipped.push({ userId, orgId });
      continue;
    }

    try {
      const tokenResult = await getValidMicrosoftToken(userId);
      if ("error" in tokenResult) {
        results.push({ userId, orgId, status: "skipped", error: tokenResult.error });
        continue;
      }

      const result = await syncUserCalendar({
        admin: admin as any,
        accessToken: tokenResult.accessToken,
        userId,
        orgId,
      });

      results.push({
        userId,
        orgId,
        status: "ok",
        imported: result.imported,
        updated: result.updated,
        removed: result.removed,
        prepQueued: result.prepQueued,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[cron/calendar-sync] Failed for ${userId}:`, message);
      results.push({ userId, orgId, status: "failed", error: message });
    }
  }

  const totals = results.reduce(
    (acc, r) => ({
      imported: acc.imported + (r.imported || 0),
      updated: acc.updated + (r.updated || 0),
      removed: acc.removed + (r.removed || 0),
      prepQueued: acc.prepQueued + (r.prepQueued || 0),
    }),
    { imported: 0, updated: 0, removed: 0, prepQueued: 0 }
  );

  console.log(
    `[cron/calendar-sync] Done in ${Math.round((Date.now() - cronStart) / 1000)}s — ` +
      `${totals.imported} imported, ${totals.updated} updated, ${totals.removed} removed ` +
      `across ${results.length} mailbox(es); ${skipped.length} skipped (budget)`
  );

  return NextResponse.json({
    total_mailboxes: results.length,
    ...totals,
    skipped_mailboxes: skipped,
    duration_ms: Date.now() - cronStart,
    results,
  });
}
