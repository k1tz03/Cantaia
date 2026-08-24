// ============================================================
// POST /api/credits/checkout — buy a credit pack or a subscription
// ============================================================
// Body: { type: "pack" | "subscription", id: CreditPackId | CreditPlanId }
// Returns: { url } — Stripe Checkout Session URL
//
//   pack         → mode "payment"      → webhook grants `purchase` credits
//   subscription → mode "subscription" → webhook grants `subscription_grant`
//                                        credits on every paid invoice
//
// Guard: requireOrgAdmin (admin/director or superadmin) — same as the legacy
// /api/stripe/create-checkout route.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";
import { getAppUrl } from "@/lib/env";
import {
  CREDIT_PACKS,
  CREDIT_PLANS,
  isCreditPackId,
  isCreditPlanId,
} from "@cantaia/config/credit-costs";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

const SUPPORTED_LOCALES = ["fr", "en", "de"];

export async function POST(request: NextRequest) {
  try {
    const check = await requireOrgAdmin();
    if (!check.authorized) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }
    const profile = check.profile;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const type = body?.type;
    const id = body?.id;

    if (type !== "pack" && type !== "subscription") {
      return NextResponse.json(
        { error: "Invalid type — expected 'pack' or 'subscription'" },
        { status: 400 }
      );
    }

    // ── Resolve the Stripe Price ID ──────────────────────────
    let priceId = "";
    let missingEnv = "";
    let mode: "payment" | "subscription";
    let metadata: Record<string, string>;

    if (type === "pack") {
      if (!isCreditPackId(id)) {
        return NextResponse.json({ error: "Unknown credit pack" }, { status: 400 });
      }
      const pack = CREDIT_PACKS[id];
      priceId = process.env[pack.stripe_env] || "";
      missingEnv = pack.stripe_env;
      mode = "payment";
      metadata = {
        organization_id: profile.organization_id,
        credit_pack: pack.id,
      };
    } else {
      if (!isCreditPlanId(id)) {
        return NextResponse.json({ error: "Unknown subscription plan" }, { status: 400 });
      }
      const plan = CREDIT_PLANS[id];
      // New credit-era Price ID first, legacy Price ID as a fallback so billing
      // keeps working before STRIPE_PRICE_SUB_* are provisioned on Vercel.
      priceId = process.env[plan.stripe_env] || process.env[plan.legacy_stripe_env] || "";
      missingEnv = `${plan.stripe_env} (fallback ${plan.legacy_stripe_env})`;
      mode = "subscription";
      metadata = {
        organization_id: profile.organization_id,
        credit_plan: plan.id,
        // `plan` kept for backward compatibility with the existing webhook
        // branches that sync organizations.subscription_plan.
        plan: plan.id,
      };
    }

    if (!priceId) {
      console.error(`[credits/checkout] Missing Stripe price env: ${missingEnv}`);
      return NextResponse.json(
        { error: "Billing not configured", missing_env: missingEnv },
        { status: 500 }
      );
    }

    // ── Get or create the Stripe customer ────────────────────
    const admin = createAdminClient();
    const { data: org } = await (admin as any)
      .from("organizations")
      .select("stripe_customer_id, name")
      .eq("id", profile.organization_id)
      .maybeSingle();

    const stripe = getStripe();
    let customerId: string | null = org?.stripe_customer_id ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || undefined,
        name: org?.name || undefined,
        metadata: { organization_id: profile.organization_id },
      });
      customerId = customer.id;

      await (admin as any)
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", profile.organization_id);
    }

    // Return URLs in the user's preferred language (default: fr)
    const locale = SUPPORTED_LOCALES.includes(profile.preferred_language || "")
      ? profile.preferred_language
      : "fr";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: profile.organization_id,
      success_url: `${getAppUrl()}/${locale}/settings?tab=subscription&credits=success`,
      cancel_url: `${getAppUrl()}/${locale}/settings?tab=subscription&credits=canceled`,
      metadata,
      // Propagate metadata onto the subscription itself so renewal invoices
      // can resolve the org + plan without the checkout session.
      ...(mode === "subscription" ? { subscription_data: { metadata } } : {}),
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[credits/checkout]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
