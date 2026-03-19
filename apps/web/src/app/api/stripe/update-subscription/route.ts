import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2026-02-25.clover" });

const PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_PRICE_STARTER || "",
  pro: process.env.STRIPE_PRICE_PRO || "",
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE || "",
};

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const { data: org } = await admin
      .from("organizations")
      .select("stripe_subscription_id")
      .eq("id", profile.organization_id)
      .single();

    if (!org?.stripe_subscription_id) {
      return NextResponse.json({ error: "No active subscription" }, { status: 400 });
    }

    const body = await request.json();
    const { plan } = body;

    if (!plan || !PRICE_IDS[plan]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);
    const mainItem = subscription.items.data[0];

    await stripe.subscriptions.update(org.stripe_subscription_id, {
      items: [{ id: mainItem.id, price: PRICE_IDS[plan] }],
      proration_behavior: "create_prorations",
      metadata: { plan },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[stripe/update-subscription]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
