import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoCalibrate } from "@cantaia/core/plans/estimation/auto-calibration";

/**
 * POST /api/plans/auto-calibrate
 * Déclenché quand une offre fournisseur est adjugée dans le module Soumissions
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: userOrg } = await adminClient
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userOrg?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const body = await request.json();
    const { project_id, submission_id, offer_id } = body;

    if (!project_id || !submission_id || !offer_id) {
      return NextResponse.json({ error: "project_id, submission_id, and offer_id are required" }, { status: 400 });
    }

    const result = await autoCalibrate({
      org_id: userOrg.organization_id,
      project_id,
      submission_id,
      offer_id,
      supabase: adminClient,
    });

    return NextResponse.json({ result });
  } catch (err) {
    console.error("[auto-calibrate] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
