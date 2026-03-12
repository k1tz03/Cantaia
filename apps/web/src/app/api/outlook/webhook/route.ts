import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

    // Process each notification
    for (const notification of notifications) {
      if (notification.clientState !== process.env.OUTLOOK_WEBHOOK_SECRET) {
        // Invalid client state — skip (prevents spoofed notifications)
        continue;
      }

      // Extract user mapping from subscriptionId
      const { data: connection } = await (admin as any)
        .from("email_connections")
        .select("user_id")
        .eq("webhook_subscription_id", notification.subscriptionId)
        .maybeSingle();

      if (!connection?.user_id) continue;

      // Mark user as needing sync (debounced — don't sync inline)
      await (admin as any)
        .from("users")
        .update({ outlook_needs_sync: true })
        .eq("id", connection.user_id);
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
 * POST /api/outlook/webhook/subscribe
 * Create a webhook subscription for a user's mailbox.
 */
export async function PUT(request: NextRequest) {
  // Auth check — only authenticated users can create webhook subscriptions
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId, accessToken } = await request.json();

  if (!userId || !accessToken) {
    return NextResponse.json({ error: "Missing userId or accessToken" }, { status: 400 });
  }

  // Ensure user can only create subscriptions for themselves
  if (userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/outlook/webhook`;
  const clientState = process.env.OUTLOOK_WEBHOOK_SECRET;

  if (!clientState) {
    return NextResponse.json({ error: "OUTLOOK_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  // Subscription expires after max 4230 minutes (~3 days) for mail
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + 4200);

  try {
    const response = await fetch("https://graph.microsoft.com/v1.0/subscriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: webhookUrl,
        resource: "me/mailFolders/inbox/messages",
        expirationDateTime: expiration.toISOString(),
        clientState,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.error?.message || "Failed to create subscription" },
        { status: response.status }
      );
    }

    const subscription = await response.json();

    // Store subscription ID for notification → user mapping
    const admin = createAdminClient();
    await (admin as any)
      .from("email_connections")
      .update({
        webhook_subscription_id: subscription.id,
        webhook_expiration: subscription.expirationDateTime,
      })
      .eq("user_id", userId);

    return NextResponse.json({
      subscriptionId: subscription.id,
      expirationDateTime: subscription.expirationDateTime,
    });
  } catch (err) {
    console.error("[outlook-webhook] Subscription error:", err);
    return NextResponse.json(
      { error: "Failed to create webhook subscription" },
      { status: 500 }
    );
  }
}

interface GraphNotification {
  subscriptionId: string;
  clientState: string;
  changeType: string;
  resource: string;
  resourceData?: {
    id: string;
  };
}
