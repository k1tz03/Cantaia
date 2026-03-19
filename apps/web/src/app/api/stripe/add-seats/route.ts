import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

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
      .select("stripe_subscription_id, subscription_plan")
      .eq("id", profile.organization_id)
      .single();

    if (!org?.stripe_subscription_id) {
      return NextResponse.json({ error: "No active subscription" }, { status: 400 });
    }

    if (org.subscription_plan !== "pro") {
      return NextResponse.json({ error: "Extra seats only available on Pro plan" }, { status: 400 });
    }

    const body = await request.json();
    const { additionalSeats } = body;

    if (!additionalSeats || additionalSeats < 1) {
      return NextResponse.json({ error: "Invalid seat count" }, { status: 400 });
    }

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(org.stripe_subscription_id);

    const extraUserPriceId = process.env.STRIPE_PRICE_PRO_EXTRA_USER || "";
    const existingItem = subscription.items.data.find(
      (item) => item.price.id === extraUserPriceId
    );

    if (existingItem) {
      await stripe.subscriptionItems.update(existingItem.id, {
        quantity: (existingItem.quantity || 0) + additionalSeats,
      });
    } else {
      await stripe.subscriptionItems.create({
        subscription: org.stripe_subscription_id,
        price: extraUserPriceId,
        quantity: additionalSeats,
      });
    }

    await admin
      .from("organizations")
      .update({ max_users: 3 + additionalSeats + (existingItem?.quantity || 0) })
      .eq("id", profile.organization_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[stripe/add-seats]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
