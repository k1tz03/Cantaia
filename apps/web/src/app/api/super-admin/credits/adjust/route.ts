// ============================================================
// POST /api/super-admin/credits/adjust — manual credit adjustment
// ============================================================
// Body: { organization_id: string, amount: number (±, non-zero), note?: string }
//
// Superadmin only. Writes a `admin_adjust` ledger row through grant_credits()
// (positive = gift/compensation, negative = clawback, floored at 0) and an
// admin_activity_logs entry for the audit trail.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";
import { grantCredits } from "@/lib/credits";

/** Safety rail against a fat-fingered adjustment. */
const MAX_ABS_ADJUSTMENT = 1_000_000;
const MAX_NOTE_LENGTH = 500;

export async function POST(request: NextRequest) {
  try {
    const check = await requireSuperadmin();
    if (!check.authorized) {
      return NextResponse.json({ error: check.error || "Forbidden" }, { status: 403 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const organizationId = typeof body?.organization_id === "string" ? body.organization_id : "";
    const rawAmount = Number(body?.amount);
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : "";

    if (!organizationId) {
      return NextResponse.json({ error: "organization_id is required" }, { status: 400 });
    }
    if (!Number.isFinite(rawAmount) || !Number.isInteger(rawAmount) || rawAmount === 0) {
      return NextResponse.json(
        { error: "amount must be a non-zero integer" },
        { status: 400 }
      );
    }
    if (Math.abs(rawAmount) > MAX_ABS_ADJUSTMENT) {
      return NextResponse.json(
        { error: `amount must be within ±${MAX_ABS_ADJUSTMENT}` },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data: org } = await (admin as any)
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle();

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    const result = await grantCredits(
      organizationId,
      rawAmount,
      "admin_adjust",
      note || "super-admin adjustment",
      check.userId ?? undefined
    );

    if (!result.granted) {
      return NextResponse.json(
        { error: "Credit adjustment failed — is migration 090 applied?" },
        { status: 500 }
      );
    }

    const { error: logError } = await (admin as any).from("admin_activity_logs").insert({
      user_id: check.userId,
      organization_id: organizationId,
      action: "credits_adjust",
      metadata: {
        organization_id: organizationId,
        organization_name: org.name,
        amount: rawAmount,
        note,
        balance_after: result.total,
      },
    });
    if (logError) {
      console.error("[super-admin/credits/adjust] Audit log error:", logError.message);
    }

    return NextResponse.json({
      success: true,
      organization_id: organizationId,
      amount: rawAmount,
      subscription_credits: result.subscription_credits,
      purchased_credits: result.purchased_credits,
      total: result.total,
    });
  } catch (error) {
    console.error("[super-admin/credits/adjust]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
