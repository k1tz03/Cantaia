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
      .select("organization_id, role, email")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const body = await request.json();
    const { plan } = body;

    if (!plan || !PRICE_IDS[plan]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Get or create Stripe customer
    const { data: org } = await admin
      .from("organizations")
      .select("stripe_customer_id, name")
      .eq("id", profile.organization_id)
      .single();

    let customerId = org?.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email || user.email,
        name: org?.name || undefined,
        metadata: { organization_id: profile.organization_id },
      });
      customerId = customer.id;

      await admin
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", profile.organization_id);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.io";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      currency: "chf",
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      success_url: `${appUrl}/fr/admin?tab=subscription&success=true`,
      cancel_url: `${appUrl}/fr/admin?tab=subscription&canceled=true`,
      metadata: {
        organization_id: profile.organization_id,
        plan,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[stripe/create-checkout]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
