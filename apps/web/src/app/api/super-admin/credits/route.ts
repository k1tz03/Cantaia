// ============================================================
// GET /api/super-admin/credits — credit balances across all organizations
// ============================================================
// Superadmin only. Returns EVERY organization (including those with no
// `credit_balances` row yet, reported with has_balance=false) so the console
// can spot orgs still running on legacy quotas.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";
import { monthlyAllocationFor } from "@cantaia/config/credit-costs";

const MAX_ORGS = 500;

export async function GET(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) {
      return NextResponse.json({ error: check.error || "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const limitParam = parseInt(new URL(request.url).searchParams.get("limit") || "", 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(Math.max(1, limitParam), MAX_ORGS)
      : MAX_ORGS;

    const { data: orgs, error: orgsError } = await (admin as any)
      .from("organizations")
      .select("id, name, subscription_plan, plan_status, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (orgsError) {
      console.error("[super-admin/credits] organizations query failed:", orgsError.message);
      return NextResponse.json({ error: "Failed to load organizations" }, { status: 500 });
    }

    const { data: balances, error: balancesError } = await (admin as any)
      .from("credit_balances")
      .select("organization_id, subscription_credits, purchased_credits, updated_at");

    if (balancesError) {
      // Migration 090 not applied → report every org as unmetered instead of 500.
      console.warn("[super-admin/credits] credit_balances unavailable:", balancesError.message);
    }

    const byOrg = new Map<string, any>();
    for (const row of balances ?? []) {
      byOrg.set(row.organization_id, row);
    }

    const rows = (orgs ?? []).map((org: any) => {
      const balance = byOrg.get(org.id);
      const subscription = Number(balance?.subscription_credits) || 0;
      const purchased = Number(balance?.purchased_credits) || 0;
      return {
        organization_id: org.id,
        name: org.name,
        subscription_plan: org.subscription_plan ?? null,
        plan_status: org.plan_status ?? null,
        has_balance: !!balance,
        subscription_credits: subscription,
        purchased_credits: purchased,
        total: subscription + purchased,
        monthly_allocation: monthlyAllocationFor(org.subscription_plan),
        updated_at: balance?.updated_at ?? null,
      };
    });

    const totals = rows.reduce(
      (acc: { subscription_credits: number; purchased_credits: number; total: number }, row: any) => {
        acc.subscription_credits += row.subscription_credits;
        acc.purchased_credits += row.purchased_credits;
        acc.total += row.total;
        return acc;
      },
      { subscription_credits: 0, purchased_credits: 0, total: 0 }
    );

    return NextResponse.json({
      organizations: rows,
      totals,
      credits_enabled: !balancesError,
    });
  } catch (error) {
    console.error("[super-admin/credits]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
