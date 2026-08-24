import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

function getPriceIds() {
  return {
    starter: process.env.STRIPE_PRICE_STARTER || "",
    pro: process.env.STRIPE_PRICE_PRO || "",
    enterprise: process.env.STRIPE_PRICE_ENTERPRISE || "",
  };
}

export async function POST(request: NextRequest) {
  try {
    // Only org admins (admin/director) or superadmins can manage billing
    const check = await requireOrgAdmin();
    if (!check.authorized) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select("stripe_subscription_id")
      .eq("id", check.profile.organization_id)
      .single();

    if (!org?.stripe_subscription_id) {
      return NextResponse.json({ error: "No active subscription" }, { status: 400 });
    }

    const body = await request.json();
    const { plan } = body;

    const PRICE_IDS = getPriceIds();
    if (!plan || !PRICE_IDS[plan as keyof typeof PRICE_IDS]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
    const mainItem = subscription.items.data[0];

    await stripe.subscriptions.update(org.stripe_subscription_id, {
      items: [{ id: mainItem.id, price: PRICE_IDS[plan as keyof typeof PRICE_IDS] }],
      proration_behavior: "create_prorations",
      metadata: { organization_id: check.profile.organization_id, plan },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[stripe/update-subscription]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
