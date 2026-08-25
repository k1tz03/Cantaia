import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { syncAndClassifyConnection, type ConnectionSyncResult } from "@/lib/email/connection-sync";
import { resetExpiredSnoozes } from "@/lib/email/classification-pipeline";
import { ensureOutlookWebhook } from "@/lib/email/webhook-subscription";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

// Allow up to 5 minutes for bulk cron syncs across many connections
export const maxDuration = 300;

/**
 * Total wall-clock budget for the fetch+classify sweep. Leaves ~60 s of the
 * 300 s function limit for the snooze reset and the response.
 */
const SWEEP_BUDGET_MS = 240_000;

/**
 * GET /api/email/sync/cron
 * Vercel Cron invokes scheduled paths with GET — delegate to POST.
 * (Without this, the scheduled sync 405s and never runs.)
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/email/sync/cron
 * Syncs all active email connections, runs the SAME classification cascade as
 * the interactive `/api/outlook/sync` route (D-FIX3 — the cron used to insert
 * emails and stop there, so scheduled users woke up to an untriaged inbox),
 * keeps Graph webhook subscriptions alive, and resets expired snoozes.
 *
 * Protected by CRON_SECRET (Authorization: Bearer … or x-cron-secret).
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const deadlineAt = startedAt + SWEEP_BUDGET_MS;
  const admin = createAdminClient();
  const results: ConnectionSyncResult[] = [];

  // 1. All active connections with sync enabled
  const { data: connections, error: connectionsErr } = await (admin as any)
    .from("email_connections")
    .select("*")
    .eq("status", "active")
    .eq("sync_enabled", true);

  if (connectionsErr) {
    console.error("[cron/sync] Could not list connections:", connectionsErr.message);
    return NextResponse.json({ error: connectionsErr.message }, { status: 500 });
  }

  const all = connections || [];
  console.log(`[cron/sync] Found ${all.length} active connections to sync`);

  let budgetExhausted = false;
  let connectionsSkipped = 0;

  for (const connection of all) {
    if (Date.now() > deadlineAt) {
      budgetExhausted = true;
      connectionsSkipped++;
      continue;
    }

    // Per-connection budget: never let one huge mailbox starve the rest.
    const remaining = deadlineAt - Date.now();
    const perConnectionDeadline = Date.now() + Math.min(remaining, 90_000);

    const result = await syncAndClassifyConnection(admin, connection, {
      deadlineAt: perConnectionDeadline,
      classify: true,
      classifyLimit: 100,
    });
    results.push(result);

    // D-FIX4 — keep the Graph change-notification subscription alive so the
    // webhook stays useful between cron runs.
    if (connection.provider === "microsoft") {
      try {
        const tokenResult = await getValidMicrosoftToken(connection.user_id);
        if (tokenResult.accessToken) {
          await ensureOutlookWebhook(admin, connection.user_id, tokenResult.accessToken);
        }
      } catch {
        /* webhook upkeep is best-effort */
      }
    }
  }

  // 2. Reset expired snoozes across ALL users
  const snoozesReset = await resetExpiredSnoozes(admin);

  const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
  const totalClassified = results.reduce((sum, r) => sum + r.classified, 0);
  const totalTasks = results.reduce((sum, r) => sum + r.tasksCreated, 0);
  const totalPlans = results.reduce((sum, r) => sum + r.plansSaved, 0);
  const totalQuotes = results.reduce((sum, r) => sum + r.quotesExtracted, 0);

  console.log(
    `[cron/sync] Done in ${Math.round((Date.now() - startedAt) / 1000)}s: ${results.length} connections, ` +
      `${totalSynced} emails synced, ${totalClassified} classified, ${totalTasks} tasks, ` +
      `${totalPlans} plans, ${snoozesReset} snoozes reset` +
      (budgetExhausted ? ` — ${connectionsSkipped} connections deferred (time budget)` : "")
  );

  return NextResponse.json({
    success: true,
    connections_synced: results.length,
    connections_skipped: connectionsSkipped,
    budget_exhausted: budgetExhausted,
    total_emails_synced: totalSynced,
    total_emails_classified: totalClassified,
    total_tasks_created: totalTasks,
    total_plans_saved: totalPlans,
    total_quotes_extracted: totalQuotes,
    results,
    snoozes_reset: snoozesReset,
  });
}
