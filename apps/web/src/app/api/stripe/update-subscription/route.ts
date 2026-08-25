import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";
import { CREDIT_PLANS, isCreditPlanId } from "@cantaia/config/credit-costs";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

/**
 * Same resolution order as /api/credits/checkout and /api/stripe/create-checkout:
 * the credit-era Price ID first, the pre-credits one as a fallback. Without
 * this, changing plan from the UI silently moved the customer onto the OLD
 * per-seat prices while checkout used the new flat ones.
 */
function priceIdForPlan(plan: string): string {
  if (!isCreditPlanId(plan)) return "";
  const config = CREDIT_PLANS[plan];
  return process.env[config.stripe_env] || process.env[config.legacy_stripe_env] || "";
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

    const priceId = priceIdForPlan(plan);
    if (!priceId) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
    const mainItem = subscription.items.data[0];

    await stripe.subscriptions.update(org.stripe_subscription_id, {
      items: [{ id: mainItem.id, price: priceId, quantity: 1 }],
      proration_behavior: "create_prorations",
      // `credit_plan` mirrors /api/credits/checkout so the webhook resolves the
      // monthly credit allocation the same way on renewal invoices.
      metadata: { organization_id: check.profile.organization_id, plan, credit_plan: plan },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[stripe/update-subscription]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
