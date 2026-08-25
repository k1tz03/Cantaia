// ============================================================
// GET /api/stripe/subscription-status — the billing snapshot the UI needs
// ============================================================
// The subscription tabs used to read these fields from
// GET /api/organization/branding, which (a) returns them under `branding`
// (the client read `.organization`) and (b) does not even select the Stripe
// columns — so `stripe_subscription_id` was always undefined and the
// "Payment method" / "Cancel" buttons never appeared for a paying org.
//
// This route returns exactly the billing fields, under a stable `organization`
// key, guarded by requireOrgAdmin (same as the rest of the billing surface).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrgAdmin } from "@/lib/admin/require-org-admin";

export async function GET() {
  const check = await requireOrgAdmin();
  if (!check.authorized) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const admin = createAdminClient();
  const { data: org, error } = await (admin as any)
    .from("organizations")
    .select(
      "subscription_plan, plan, plan_status, stripe_customer_id, stripe_subscription_id, trial_ends_at, name"
    )
    .eq("id", check.profile.organization_id)
    .maybeSingle();

  if (error || !org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json({
    organization: {
      // `plan` is the authoritative credits-era column; fall back to the legacy
      // subscription_plan so both eras resolve the current plan correctly.
      subscription_plan: org.plan || org.subscription_plan || "trial",
      plan_status: org.plan_status ?? null,
      stripe_customer_id: org.stripe_customer_id ?? null,
      stripe_subscription_id: org.stripe_subscription_id ?? null,
      trial_ends_at: org.trial_ends_at ?? null,
      name: org.name ?? "",
    },
  });
}
