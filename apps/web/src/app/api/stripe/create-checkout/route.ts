import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";
import { getAppUrl } from "@/lib/env";
import { CREDIT_PLANS, isCreditPlanId } from "@cantaia/config/credit-costs";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

/**
 * Credit-era Price IDs (STRIPE_PRICE_SUB_*) with the pre-credits ones
 * (STRIPE_PRICE_*) as fallback, so this legacy route keeps working during the
 * transition and bills the same prices as /api/credits/checkout.
 */
function getPriceIds() {
  return {
    starter:
      process.env[CREDIT_PLANS.starter.stripe_env] || process.env.STRIPE_PRICE_STARTER || "",
    pro: process.env[CREDIT_PLANS.pro.stripe_env] || process.env.STRIPE_PRICE_PRO || "",
    enterprise:
      process.env[CREDIT_PLANS.enterprise.stripe_env] || process.env.STRIPE_PRICE_ENTERPRISE || "",
  };
}

const SUPPORTED_LOCALES = ["fr", "en", "de"];

export async function POST(request: NextRequest) {
  try {
    // Only org admins (admin/director) or superadmins can manage billing
    const check = await requireOrgAdmin();
    if (!check.authorized) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    const profile = check.profile;

    const body = await request.json();
    const { plan } = body;

    const PRICE_IDS = getPriceIds();
    if (!plan || !PRICE_IDS[plan as keyof typeof PRICE_IDS]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Get or create Stripe customer
    const { data: org } = await admin
      .from("organizations")
      .select("stripe_customer_id, name")
      .eq("id", profile.organization_id)
      .single();

    let customerId = org?.stripe_customer_id;
    const stripe = getStripe();

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || undefined,
        name: org?.name || undefined,
        metadata: { organization_id: profile.organization_id },
      });
      customerId = customer.id;

      await admin
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", profile.organization_id);
    }

    // Return URLs in the user's preferred language (default: fr)
    const locale = SUPPORTED_LOCALES.includes(profile.preferred_language || "")
      ? profile.preferred_language
      : "fr";

    // NOTE: quantity stays at 1 on purpose — the per-user quantity sync was
    // deliberately NOT built because billing moved to a credits-based model.
    //
    // `credit_plan` is added next to the legacy `plan` key so the Stripe
    // webhook can grant the monthly credit allocation on every paid invoice
    // (same contract as /api/credits/checkout).
    const checkoutMetadata: Record<string, string> = {
      organization_id: profile.organization_id,
      plan,
      ...(isCreditPlanId(plan) ? { credit_plan: plan } : {}),
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      currency: "chf",
      line_items: [{ price: PRICE_IDS[plan as keyof typeof PRICE_IDS], quantity: 1 }],
      success_url: `${getAppUrl()}/${locale}/admin?tab=subscription&success=true`,
      cancel_url: `${getAppUrl()}/${locale}/admin?tab=subscription&canceled=true`,
      metadata: checkoutMetadata,
      // Propagate metadata onto the subscription itself so renewal webhooks
      // (customer.subscription.updated, invoice.payment_succeeded) can resolve
      // the org + plan without relying on the checkout session.
      subscription_data: {
        metadata: checkoutMetadata,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[stripe/create-checkout]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
