import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantCredits } from "@/lib/credits";
import {
  CREDIT_PACKS,
  CREDIT_PLANS,
  isCreditPackId,
  isCreditPlanId,
  type CreditPlanId,
} from "@cantaia/config/credit-costs";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

/**
 * Which credit plan does this invoice bill?
 *
 * Metadata is written by /api/credits/checkout (and the legacy
 * /api/stripe/create-checkout) onto `subscription_data.metadata`, so it rides
 * along every renewal invoice. Depending on the Stripe API version it surfaces
 * under `parent.subscription_details.metadata`, `subscription_details.metadata`
 * or on the line items — we probe all of them, then fall back to retrieving
 * the subscription object.
 *
 * Returns null when the invoice is not a Cantaia subscription invoice; the
 * caller then skips the credit grant instead of guessing.
 */
async function resolveInvoicePlan(invoice: Stripe.Invoice): Promise<CreditPlanId | null> {
  const raw = invoice as any;

  const candidates: unknown[] = [
    raw.parent?.subscription_details?.metadata?.credit_plan,
    raw.parent?.subscription_details?.metadata?.plan,
    raw.subscription_details?.metadata?.credit_plan,
    raw.subscription_details?.metadata?.plan,
    raw.lines?.data?.[0]?.metadata?.credit_plan,
    raw.lines?.data?.[0]?.metadata?.plan,
  ];

  for (const candidate of candidates) {
    if (isCreditPlanId(candidate)) return candidate;
  }

  const subscriptionId =
    typeof raw.subscription === "string"
      ? raw.subscription
      : typeof raw.parent?.subscription_details?.subscription === "string"
        ? raw.parent.subscription_details.subscription
        : null;

  if (subscriptionId) {
    try {
      const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
      const metadata = subscription.metadata || {};
      if (isCreditPlanId(metadata.credit_plan)) return metadata.credit_plan;
      if (isCreditPlanId(metadata.plan)) return metadata.plan;
    } catch (err) {
      console.warn(
        `[stripe-webhook] Could not retrieve subscription ${subscriptionId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return null;
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

        // ── Credit pack (one-shot payment) ──────────────────
        // Handled first and exclusively: a pack purchase must NEVER touch the
        // subscription columns (no stripe_subscription_id, no plan change).
        const packId = session.metadata?.credit_pack;
        if (session.mode === "payment" && packId) {
          const packOrgId = session.metadata?.organization_id;
          if (!packOrgId) {
            console.error(
              `[stripe-webhook] credit pack session ${session.id} has no organization_id metadata`
            );
            break;
          }
          if (!isCreditPackId(packId)) {
            console.error(`[stripe-webhook] Unknown credit pack "${packId}" on session ${session.id}`);
            break;
          }

          // Keep the customer id in sync (first purchase may have created it).
          if (customerId) {
            await (admin as any)
              .from("organizations")
              .update({ stripe_customer_id: customerId })
              .eq("id", packOrgId);
          }

          const pack = CREDIT_PACKS[packId];
          const granted = await grantCredits(packOrgId, pack.credits, "purchase", session.id);
          if (granted.granted) {
            console.log(
              `[stripe-webhook] Granted ${pack.credits} credits (pack ${pack.id}) to org ${packOrgId}`
            );
          } else {
            console.error(
              `[stripe-webhook] FAILED to grant ${pack.credits} credits (pack ${pack.id}) to org ${packOrgId} — session ${session.id}`
            );
          }
          break;
        }

        if (session.metadata?.organization_id) {
          const plan = session.metadata?.credit_plan || session.metadata?.plan;
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

          // ── Monthly credit allocation ────────────────────
          // Only for subscription invoices (creation + renewals). One-off
          // invoices (credit packs) are handled by checkout.session.completed.
          try {
            const billingReason = (invoice as any).billing_reason as string | undefined;
            const isSubscriptionInvoice = !billingReason || billingReason.startsWith("subscription");

            if (isSubscriptionInvoice) {
              const planId = await resolveInvoicePlan(invoice);
              if (planId) {
                const plan = CREDIT_PLANS[planId];
                const granted = await grantCredits(
                  org.id,
                  plan.monthly_credits,
                  "subscription_grant",
                  invoice.id ?? undefined
                );
                if (granted.granted) {
                  console.log(
                    `[stripe-webhook] Granted ${plan.monthly_credits} subscription credits (${plan.id}) to org ${org.id}`
                  );
                } else {
                  console.error(
                    `[stripe-webhook] FAILED to grant subscription credits (${plan.id}) to org ${org.id} — invoice ${invoice.id}`
                  );
                }

                // Keep the authoritative plan column in sync with what is billed.
                const { error: planSyncError } = await (admin as any)
                  .from("organizations")
                  .update({ subscription_plan: planId, plan: planId, plan_status: "active" })
                  .eq("id", org.id);
                if (planSyncError) {
                  console.error("[stripe-webhook] Plan sync error:", planSyncError.message);
                }
              } else {
                console.warn(
                  `[stripe-webhook] invoice ${invoice.id} has no credit_plan/plan metadata — no credits granted`
                );
              }
            }
          } catch (creditErr) {
            // Never fail the webhook on a credit grant: Stripe would retry the
            // whole event and the dedup table would swallow the retry anyway.
            console.error("[stripe-webhook] Subscription credit grant failed:", creditErr);
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
