import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

export async function POST(_request: NextRequest) {
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
      .select("stripe_customer_id")
      .eq("id", profile.organization_id)
      .single();

    if (!org?.stripe_customer_id) {
      return NextResponse.json({ error: "No Stripe customer" }, { status: 400 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.io";

    const session = await getStripe().billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${appUrl}/fr/admin?tab=subscription`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[stripe/create-portal-session]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
