import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";
import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

export async function GET() {
  try {
    // Only org admins (admin/director) or superadmins can view billing
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
      return NextResponse.json({ invoices: [] });
    }

    const invoices = await getStripe().invoices.list({
      customer: org.stripe_customer_id,
      limit: 24,
    });

    const formatted = invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      date: inv.created,
      amount: inv.amount_paid / 100,
      currency: inv.currency,
      status: inv.status,
      pdf_url: inv.invoice_pdf,
      hosted_url: inv.hosted_invoice_url,
    }));

    return NextResponse.json({ invoices: formatted });
  } catch (error) {
    console.error("[stripe/invoices]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
