import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { syncAndClassifyConnection, loadActiveConnection, loadConnectionBySubscriptionId } from "@/lib/email/connection-sync";
import { createOutlookWebhook } from "@/lib/email/webhook-subscription";
import { timingSafeEqual } from "node:crypto";

/**
 * Graph demands a response within 3 s, so the notification handler only ACKs
 * and hands the real work to `after()`. Give that background pass room.
 */
export const maxDuration = 300;

/** Per-notification classification budget for the targeted mini-sync. */
const NOTIFICATION_BUDGET_MS = 120_000;

/**
 * Constant-time comparison of a notification clientState against the configured
 * secret. Returns false when either side is missing — a webhook without a
 * verifiable clientState must never be trusted (B8).
 */
function clientStateMatches(received: unknown, expected: string): boolean {
  if (typeof received !== "string" || received.length === 0) return false;
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/outlook/webhook
 * Microsoft Graph webhook for real-time email notifications.
 *
 * Flow:
 * 1. When creating a subscription, Graph sends a validation request with ?validationToken=...
 * 2. For change notifications, Graph POSTs a JSON payload with changed resources
 * 3. We trigger a sync for the affected user
 */
export async function POST(request: NextRequest) {
  // B8: without the shared secret we cannot authenticate ANY notification.
  // Previously an undefined secret made `notification.clientState !== undefined`
  // pass for payloads with no clientState at all — i.e. fully spoofable.
  const webhookSecret = process.env.OUTLOOK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[outlook-webhook] OUTLOOK_WEBHOOK_SECRET is not configured — refusing notifications");
    return NextResponse.json(
      { error: "OUTLOOK_WEBHOOK_SECRET not configured" },
      { status: 500 }
    );
  }

  // Step 1: Handle subscription validation
  const validationToken = request.nextUrl.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Step 2: Handle change notifications
  try {
    const body = await request.json();
    const notifications = body.value as GraphNotification[] | undefined;

    if (!notifications || !Array.isArray(notifications)) {
      return NextResponse.json({ status: "no notifications" }, { status: 202 });
    }

    const admin = createAdminClient();
    // Map each affected user to the exact subscription (i.e. the exact mailbox)
    // that fired the notification, so the mini-sync targets THAT connection and
    // never the user's newest (possibly unrelated Gmail/IMAP) connection.
    const subscriptionByUser = new Map<string, string>();

    // Process each notification
    for (const notification of notifications) {
      if (!clientStateMatches(notification.clientState, webhookSecret)) {
        // Missing or invalid client state — reject (prevents spoofed notifications)
        console.warn(`[outlook-webhook] Rejected notification with invalid clientState (subscription ${notification.subscriptionId})`);
        continue;
      }

      // Extract user mapping from subscriptionId
      const { data: connection } = await (admin as any)
        .from("email_connections")
        .select("user_id")
        .eq("webhook_subscription_id", notification.subscriptionId)
        .maybeSingle();

      if (!connection?.user_id) continue;

      // Mark user as needing sync (kept for observability / legacy consumers)
      const { error: markErr } = await (admin as any)
        .from("users")
        .update({ outlook_needs_sync: true })
        .eq("id", connection.user_id);
      if (markErr) {
        console.warn(`[outlook-webhook] outlook_needs_sync update failed for ${connection.user_id}: ${markErr.message}`);
      }

      subscriptionByUser.set(connection.user_id, notification.subscriptionId);
    }

    // D-FIX4 — a notification now actually DOES something: a targeted mini-sync
    // through the same shared pipeline as the cron. Deduplicated per user so a
    // burst of notifications produces one pass, and deferred with `after()` so
    // Graph still gets its 202 within 3 s.
    if (subscriptionByUser.size > 0) {
      const entries = Array.from(subscriptionByUser.entries());
      after(async () => {
        const deadlineAt = Date.now() + NOTIFICATION_BUDGET_MS;
        for (const [userId, subscriptionId] of entries) {
          if (Date.now() > deadlineAt) break;
          try {
            // Resolve the connection the notification actually targeted; fall
            // back to the newest active connection only if the subscription row
            // has since disappeared.
            const connection =
              (await loadConnectionBySubscriptionId(admin, subscriptionId)) ||
              (await loadActiveConnection(admin, userId));
            if (!connection) continue;
            const result = await syncAndClassifyConnection(admin, connection, {
              deadlineAt,
              classify: true,
              classifyLimit: 50,
            });
            const { error: clearErr } = await (admin as any)
              .from("users")
              .update({ outlook_needs_sync: false })
              .eq("id", userId);
            if (clearErr) {
              console.warn(`[outlook-webhook] could not clear outlook_needs_sync for ${userId}: ${clearErr.message}`);
            }
            console.log(
              `[outlook-webhook] notification sync for ${userId}: ${result.synced} synced, ${result.classified} classified`
            );
          } catch (syncErr) {
            console.error(`[outlook-webhook] notification sync failed for ${userId}:`, syncErr);
          }
        }
      });
    }

    // Return 202 quickly — Graph requires response within 3 seconds
    return NextResponse.json({ status: "accepted" }, { status: 202 });
  } catch (err) {
    console.error("[outlook-webhook] Error processing notification:", err);
    // Always return 202 to prevent Graph from retrying
    return NextResponse.json({ status: "error" }, { status: 202 });
  }
}

/**
 * PUT /api/outlook/webhook
 * Create a Graph change-notification subscription for the caller's mailbox.
 *
 * `accessToken` is now optional: when omitted the route resolves a valid token
 * server-side. Handing a raw Graph token through the browser was the only way
 * to call this endpoint, which is one reason nothing ever did.
 */
export async function PUT(request: NextRequest) {
  // Auth check — only authenticated users can create webhook subscriptions
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const userId = (body as { userId?: string }).userId || user.id;
  let accessToken = (body as { accessToken?: string }).accessToken;

  // Ensure user can only create subscriptions for themselves
  if (userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.OUTLOOK_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "OUTLOOK_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  if (!accessToken) {
    const tokenResult = await getValidMicrosoftToken(user.id);
    if ("error" in tokenResult || !tokenResult.accessToken) {
      return NextResponse.json(
        { error: ("error" in tokenResult && tokenResult.error) || "No valid Microsoft token" },
        { status: 400 }
      );
    }
    accessToken = tokenResult.accessToken;
  }

  const admin = createAdminClient();
  const outcome = await createOutlookWebhook(admin, user.id, accessToken);

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.reason || "Failed to create webhook subscription" }, { status: 502 });
  }

  return NextResponse.json({
    subscriptionId: outcome.subscriptionId,
    expirationDateTime: outcome.expiration,
  });
}

interface GraphNotification {
  subscriptionId: string;
  /** Optional in practice — a spoofed payload may omit it entirely. */
  clientState?: string;
  changeType: string;
  resource: string;
  resourceData?: {
    id: string;
  };
}
