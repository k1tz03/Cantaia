import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantCredits, getCreditBalance } from "@/lib/credits";
import {
  CREDIT_PACKS,
  CREDIT_PLANS,
  isCreditPackId,
  isCreditPlanId,
  type CreditPackId,
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

  // Idempotence (migration 088): Stripe retries deliveries. The event id is
  // recorded ONLY AFTER the handler succeeds (see the mark-processed block at
  // the end), so a handler that fails — a credit grant that could not be
  // applied, an exception — is replayed on the next Stripe retry instead of
  // being permanently swallowed as a duplicate. Here we only skip events that
  // were already processed successfully.
  try {
    const { data: seen } = await (admin as any)
      .from("stripe_events")
      .select("id")
      .eq("id", event.id)
      .maybeSingle();

    if (seen) {
      return NextResponse.json({ received: true, duplicate: true });
    }
  } catch (err) {
    // stripe_events unreadable (table missing / transient): fall through and
    // process — better to risk a re-process than to drop the event entirely.
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
          if (!granted.granted) {
            // Throw so the event is NOT marked processed and Stripe replays it:
            // a paid pack that failed to credit must not be silently lost.
            throw new Error(
              `pack grant of ${pack.credits} credits failed for org ${packOrgId} (session ${session.id})`
            );
          }
          console.log(
            `[stripe-webhook] Granted ${pack.credits} credits (pack ${pack.id}) to org ${packOrgId}`
          );
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

          // Expire any leftover subscription credits: they are tied to the
          // billing cycle and must not stay consumable after cancellation.
          // Purchased credits (packs, 12-month validity) are untouched.
          try {
            const balance = await getCreditBalance(org.id);
            if (balance.subscription_credits > 0) {
              await grantCredits(
                org.id,
                balance.subscription_credits,
                "subscription_expiry",
                `sub_deleted:${subscription.id}`
              );
            }
          } catch (expiryErr) {
            console.error(
              "[stripe-webhook] Subscription credit expiry failed:",
              expiryErr
            );
          }
        }
        break;
      }

      case "charge.refunded": {
        await handleChargeRefund(event.data.object as Stripe.Charge);
        break;
      }

      case "charge.dispute.created": {
        await handleDispute(event.data.object as Stripe.Dispute);
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
          const billingReason = (invoice as any).billing_reason as string | undefined;
          const isSubscriptionInvoice = !billingReason || billingReason.startsWith("subscription");

          if (isSubscriptionInvoice) {
            // resolveInvoicePlan handles its own Stripe errors and returns null;
            // it never throws, so a null result is "not a Cantaia sub" not "failed".
            const planId = await resolveInvoicePlan(invoice);
            if (planId) {
              const plan = CREDIT_PLANS[planId];
              const granted = await grantCredits(
                org.id,
                plan.monthly_credits,
                "subscription_grant",
                invoice.id ?? undefined
              );
              if (!granted.granted) {
                // Throw so the event stays unmarked and Stripe replays it: a
                // paid renewal invoice whose allocation failed must not be lost.
                throw new Error(
                  `subscription grant of ${plan.monthly_credits} credits failed for org ${org.id} (invoice ${invoice.id})`
                );
              }
              console.log(
                `[stripe-webhook] Granted ${plan.monthly_credits} subscription credits (${plan.id}) to org ${org.id}`
              );

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
        }
        break;
      }

      default:
        // Unhandled event type — log for debugging
        if (process.env.NODE_ENV === "development") {
          console.log(`[stripe-webhook] Unhandled event type: ${event.type}`);
        }
    }

    // Handler succeeded → record the event so Stripe retries are deduped.
    // A failed handler (thrown above) skips this and stays replayable.
    try {
      const { error: markError } = await (admin as any)
        .from("stripe_events")
        .insert({ id: event.id, type: event.type });
      if (markError && markError.code !== "23505") {
        console.error(
          "[stripe-webhook] Event mark-processed failed:",
          markError.message
        );
      }
    } catch (markErr) {
      console.error("[stripe-webhook] Event mark-processed threw:", markErr);
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

/**
 * Resolve the credit pack a charge/dispute relates to from the metadata that
 * `/api/credits/checkout` propagates through `payment_intent_data.metadata`
 * (so it lands on the Charge). Returns null when the charge is not a Cantaia
 * credit-pack purchase (or predates that metadata propagation).
 */
function packFromChargeMetadata(
  metadata: Stripe.Metadata | null | undefined
): { orgId: string; pack: (typeof CREDIT_PACKS)[CreditPackId] } | null {
  const packId = metadata?.credit_pack;
  const orgId = metadata?.organization_id;
  if (!orgId || !packId || !isCreditPackId(packId)) return null;
  return { orgId, pack: CREDIT_PACKS[packId] };
}

/**
 * A refunded credit-pack charge claws back the corresponding credits (prorated
 * to the refunded fraction, so a partial refund removes a partial amount).
 * Throws on a failed clawback so the event stays replayable by Stripe.
 */
async function handleChargeRefund(charge: Stripe.Charge): Promise<void> {
  const resolved = packFromChargeMetadata(charge.metadata);
  if (!resolved) return;

  const amount = charge.amount || 0;
  const refunded = charge.amount_refunded || 0;
  if (amount <= 0 || refunded <= 0) return;

  const clawback = Math.min(
    resolved.pack.credits,
    Math.round(resolved.pack.credits * (refunded / amount))
  );
  if (clawback <= 0) return;

  const res = await grantCredits(
    resolved.orgId,
    -clawback,
    "refund",
    `refund:${charge.id}`
  );
  if (!res.granted) {
    throw new Error(
      `refund clawback of ${clawback} credits failed for org ${resolved.orgId} (charge ${charge.id})`
    );
  }
  console.log(
    `[stripe-webhook] Clawed back ${clawback} credits (refund, pack ${resolved.pack.id}) from org ${resolved.orgId}`
  );
}

/**
 * A dispute (chargeback) freezes the funds — claw back the full pack right away.
 * The dispute object carries only the charge id, so we retrieve the charge to
 * read the credit-pack metadata. Throws on a failed clawback (replayable).
 */
async function handleDispute(dispute: Stripe.Dispute): Promise<void> {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;

  let charge: Stripe.Charge;
  try {
    charge = await getStripe().charges.retrieve(chargeId);
  } catch (err) {
    console.warn(
      `[stripe-webhook] Could not retrieve disputed charge ${chargeId}:`,
      err instanceof Error ? err.message : err
    );
    return;
  }

  const resolved = packFromChargeMetadata(charge.metadata);
  if (!resolved) return;

  const res = await grantCredits(
    resolved.orgId,
    -resolved.pack.credits,
    "refund",
    `dispute:${dispute.id}`
  );
  if (!res.granted) {
    throw new Error(
      `dispute clawback of ${resolved.pack.credits} credits failed for org ${resolved.orgId} (dispute ${dispute.id})`
    );
  }
  console.log(
    `[stripe-webhook] Clawed back ${resolved.pack.credits} credits (dispute, pack ${resolved.pack.id}) from org ${resolved.orgId}`
  );
}
