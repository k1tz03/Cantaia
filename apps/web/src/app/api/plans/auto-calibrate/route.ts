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

    // Anti-IDOR : le core résout le project_id depuis submission_id sans filtre
    // org. On vérifie donc ICI que projet ET soumission appartiennent bien à
    // l'organisation de l'appelant avant de déclencher la calibration.
    const [{ data: projCheck }, { data: subCheck }] = await Promise.all([
      (adminClient as any)
        .from("projects")
        .select("organization_id")
        .eq("id", project_id)
        .maybeSingle(),
      (adminClient as any)
        .from("submissions")
        .select("organization_id")
        .eq("id", submission_id)
        .maybeSingle(),
    ]);

    if (
      !projCheck ||
      projCheck.organization_id !== userOrg.organization_id ||
      !subCheck ||
      subCheck.organization_id !== userOrg.organization_id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
