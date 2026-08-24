import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";
import { getAppUrl } from "@/lib/env";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

const SUPPORTED_LOCALES = ["fr", "en", "de"];

export async function POST() {
  try {
    // Only org admins (admin/director) or superadmins can manage billing
    const check = await requireOrgAdmin();
    if (!check.authorized) {
      return NextResponse.json({ error: check.error }, { status: check.status });
    }

    const admin = createAdminClient();
    const { data: org } = await admin
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", check.profile.organization_id)
      .single();

    if (!org?.stripe_customer_id) {
      return NextResponse.json({ error: "No Stripe customer" }, { status: 400 });
    }

    // Return URL in the user's preferred language (default: fr)
    const locale = SUPPORTED_LOCALES.includes(check.profile.preferred_language || "")
      ? check.profile.preferred_language
      : "fr";

    const session = await getStripe().billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: `${getAppUrl()}/${locale}/admin?tab=subscription`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[stripe/create-portal-session]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
