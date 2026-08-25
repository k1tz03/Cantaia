import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  ensureOutlookWebhook,
  RENEW_WINDOW_MS,
  type SubscriptionOutcome,
} from "@/lib/email/webhook-subscription";

export const maxDuration = 120;

/**
 * GET /api/cron/renew-webhooks
 * Vercel Cron invokes scheduled paths with GET — delegate to POST.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/cron/renew-webhooks
 *
 * Microsoft Graph mail subscriptions expire after ~3 days (4230 min max). This
 * sweep renews everything expiring within the next 24 h and creates a
 * subscription for active Microsoft connections that never had one.
 *
 * Suggested schedule: `0 * / 12 * * *` (twice a day) — a 12 h cadence leaves two
 * chances to renew before any subscription lapses.
 *
 * Protected by CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OUTLOOK_WEBHOOK_SECRET) {
    // Fail loudly-but-softly: without the shared secret the webhook route
    // refuses every notification anyway, so a subscription would be useless.
    console.warn("[cron/renew-webhooks] OUTLOOK_WEBHOOK_SECRET not configured — nothing to renew");
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "OUTLOOK_WEBHOOK_SECRET not configured",
    });
  }

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() + RENEW_WINDOW_MS).toISOString();

  // Active Microsoft connections whose subscription is missing or expiring soon.
  const { data: connections, error } = await (admin as any)
    .from("email_connections")
    .select("id, user_id, provider, webhook_subscription_id, webhook_expiration")
    .eq("status", "active")
    .eq("provider", "microsoft");

  if (error) {
    console.error("[cron/renew-webhooks] Connection lookup failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (connections || []).filter((c: any) => {
    if (!c.webhook_subscription_id) return true;
    if (!c.webhook_expiration) return true;
    return c.webhook_expiration <= cutoff;
  });

  console.log(
    `[cron/renew-webhooks] ${(connections || []).length} microsoft connections, ${due.length} due for renewal`
  );

  const results: Array<{ user_id: string; action: SubscriptionOutcome["action"]; reason?: string }> = [];
  let renewed = 0;
  let created = 0;
  let failed = 0;

  for (const connection of due) {
    try {
      const tokenResult = await getValidMicrosoftToken(connection.user_id);
      if ("error" in tokenResult || !tokenResult.accessToken) {
        failed++;
        results.push({
          user_id: connection.user_id,
          action: "failed",
          reason: ("error" in tokenResult && tokenResult.error) || "no valid token",
        });
        continue;
      }

      const outcome = await ensureOutlookWebhook(admin, connection.user_id, tokenResult.accessToken);
      results.push({ user_id: connection.user_id, action: outcome.action, reason: outcome.reason });
      if (outcome.action === "renewed") renewed++;
      else if (outcome.action === "created") created++;
      else if (outcome.action === "failed") failed++;
    } catch (err) {
      failed++;
      results.push({
        user_id: connection.user_id,
        action: "failed",
        reason: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  console.log(
    `[cron/renew-webhooks] Done: ${created} created, ${renewed} renewed, ${failed} failed`
  );

  return NextResponse.json({
    success: true,
    checked: (connections || []).length,
    due: due.length,
    created,
    renewed,
    failed,
    results,
  });
}
