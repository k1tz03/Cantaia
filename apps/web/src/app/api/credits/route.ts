// ============================================================
// GET /api/credits — current organization balance
// ============================================================
// Consumed by apps/web/src/lib/hooks/use-credits.ts (header badge, low-balance
// banner, subscription tab). Shape is FLAT on purpose so the hook can read
// `total` without unwrapping.
//
// 404 `credits_unavailable` is a first-class answer: it means the organization
// has no `credit_balances` row (migration 090 not applied, or an org still on
// the legacy quota model). The client falls back to the legacy quota UI
// instead of rendering a misleading "0 credits".

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreditBalance } from "@/lib/credits";
import { monthlyAllocationFor } from "@cantaia/config/credit-costs";

const RECENT_TRANSACTIONS_LIMIT = 20;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: profile } = await (admin as any)
      .from("users")
      .select("organization_id, is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    // Superadmins may inspect another org's balance (?organization_id=…).
    // Everyone else is hard-scoped to their own organization.
    const requestedOrgId = new URL(request.url).searchParams.get("organization_id");
    const organizationId: string =
      requestedOrgId && profile.is_superadmin === true
        ? requestedOrgId
        : (profile.organization_id as string);

    const [{ data: org }, balance] = await Promise.all([
      (admin as any)
        .from("organizations")
        .select("subscription_plan")
        .eq("id", organizationId)
        .maybeSingle(),
      getCreditBalance(organizationId),
    ]);

    if (!balance.exists) {
      return NextResponse.json(
        { error: "credits_unavailable", plan: org?.subscription_plan ?? null },
        { status: 404 }
      );
    }

    const plan: string | null = org?.subscription_plan ?? null;

    const { data: transactions, error: txError } = await (admin as any)
      .from("credit_transactions")
      .select("id, amount, balance_after, kind, action_type, reference, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(RECENT_TRANSACTIONS_LIMIT);

    if (txError) {
      console.error("[api/credits] transactions fetch failed:", txError.message);
    }

    return NextResponse.json({
      subscription_credits: balance.subscription_credits,
      purchased_credits: balance.purchased_credits,
      total: balance.total,
      plan,
      monthly_allocation: monthlyAllocationFor(plan),
      recent_transactions: transactions ?? [],
    });
  } catch (error) {
    console.error("[api/credits]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
