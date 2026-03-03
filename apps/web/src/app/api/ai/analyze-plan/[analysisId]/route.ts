import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PATCH /api/ai/analyze-plan/[analysisId]
 * Save manually corrected quantities for a plan analysis.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ analysisId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { analysisId } = await params;
  const adminClient = createAdminClient();

  // Get user's organization
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  // Parse body
  const body = await request.json();
  const { quantities } = body;

  if (!quantities || !Array.isArray(quantities)) {
    return NextResponse.json({ error: "quantities array required" }, { status: 400 });
  }

  // Fetch existing analysis — verify ownership
  const { data: analysis, error: fetchError } = await (adminClient as any)
    .from("plan_analyses")
    .select("id, organization_id, analysis_result")
    .eq("id", analysisId)
    .maybeSingle();

  if (fetchError || !analysis) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  if (analysis.organization_id !== userOrg.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Update quantities in analysis_result JSONB
  const updatedResult = {
    ...analysis.analysis_result,
    quantities,
  };

  const { error: updateError } = await (adminClient as any)
    .from("plan_analyses")
    .update({ analysis_result: updatedResult })
    .eq("id", analysisId);

  if (updateError) {
    console.error("[analyze-plan/PATCH] Update error:", updateError);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
