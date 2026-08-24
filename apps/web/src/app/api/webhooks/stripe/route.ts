import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  // Validate webhook secret is configured (fail-closed)
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Idempotence: Stripe retries deliveries — record event.id and bail out
  // early if this event was already processed (migration 088).
  try {
    const { error: dedupError } = await (admin as any)
      .from("stripe_events")
      .insert({ id: event.id, type: event.type });

    if (dedupError) {
      if (dedupError.code === "23505") {
        // Unique violation → already processed
        return NextResponse.json({ received: true, duplicate: true });
      }
      // Table missing (migration not applied) or transient error:
      // log and continue — better to risk a re-process than drop the event.
      console.error("[stripe-webhook] Event dedup insert failed:", dedupError.message);
    }
  } catch (err) {
    console.error("[stripe-webhook] Event dedup check failed:", err);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (session.metadata?.organization_id) {
          const plan = session.metadata?.plan;
          if (!plan) {
            // No silent "pro" fallback: without plan metadata we keep the
            // current plan untouched and only sync the Stripe identifiers.
            console.error(
              `[stripe-webhook] checkout.session.completed ${session.id} has no plan metadata — plan left unchanged`
            );
          }
          await (admin as any)
            .from("organizations")
            .update({
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
              ...(plan ? { subscription_plan: plan, plan } : {}),
              plan_status: "active",
            })
            .eq("id", session.metadata.organization_id);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const status = subscription.status;

        const { data: org } = await (admin as any)
          .from("organizations")
          .select("id")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle();

        if (org) {
          // In newer Stripe API versions, current_period_end is on subscription items
          const periodEnd = subscription.items.data[0]?.current_period_end;
          if (!subscription.metadata?.plan) {
            // Subscriptions created before subscription_data.metadata was added
            // at checkout — plan left unchanged (no silent fallback).
            console.warn(
              `[stripe-webhook] subscription.updated ${subscription.id} has no plan metadata — plan left unchanged`
            );
          }
          await (admin as any)
            .from("organizations")
            .update({
              subscription_plan: subscription.metadata?.plan || undefined,
              plan: subscription.metadata?.plan || undefined,
              plan_status: status === "active" ? "active" : status === "past_due" ? "past_due" : "inactive",
              plan_period_end: periodEnd
                ? new Date(periodEnd * 1000).toISOString()
                : null,
            })
            .eq("id", org.id);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const { data: org } = await (admin as any)
          .from("organizations")
          .select("id")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle();

        if (org) {
          await (admin as any)
            .from("organizations")
            .update({
              subscription_plan: "trial",
              plan: "trial",
              plan_status: "canceled",
              stripe_subscription_id: null,
            })
            .eq("id", org.id);
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        const { data: org } = await (admin as any)
          .from("organizations")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (org) {
          await (admin as any)
            .from("organizations")
            .update({ plan_status: "past_due" })
            .eq("id", org.id);
        }
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const { data: org } = await (admin as any)
          .from("organizations")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        if (org) {
          const { error: logError } = await (admin as any).from("admin_activity_logs").insert({
            action: "invoice_paid",
            metadata: { invoice_id: invoice.id, amount: invoice.amount_paid, org_id: org.id },
          });
          if (logError) {
            console.error("[webhooks/stripe] Insert activity log error:", logError);
          }
        }
        break;
      }

      default:
        // Unhandled event type — log for debugging
        if (process.env.NODE_ENV === "development") {
          console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
        }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[stripe-webhook] Error processing ${event.type}:`, err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
