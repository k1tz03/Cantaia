import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/plans/:id
 * Get plan detail with all its versions.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Get user's org
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Fetch plan with all versions
  const { data: plan, error } = await (adminClient as any)
    .from("plan_registry")
    .select(`
      id, plan_number, plan_title, plan_type, discipline, lot_name, cfc_code, zone, scale, format,
      author_company, author_name, author_email, status, notes, tags, created_at, project_id,
      projects(id, name, code),
      plan_versions(id, version_code, version_number, version_date, file_url, file_name, file_size, file_type,
        source, source_email_id, received_at, ai_detected, ai_confidence, ai_changes_detected,
        validated_by, validated_at, validation_status, validation_notes,
        distributed_to, distribution_date, is_current, created_at)
    `)
    .eq("id", id)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (error || !plan) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  // Sort versions by version_number descending
  const versions = (plan.plan_versions || []).sort(
    (a: any, b: any) => (b.version_number || 0) - (a.version_number || 0)
  );

  return NextResponse.json({
    plan: {
      ...plan,
      projects: undefined,
      plan_versions: versions,
      project: plan.projects || null,
    },
  });
}

/**
 * PATCH /api/plans/:id
 * Update plan metadata (auto-fill from AI analysis or manual edit).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  // Only allow specific fields to be updated
  const allowedFields = [
    "scale", "author_name", "author_company", "discipline",
    "plan_title", "plan_number", "zone", "lot_name", "format",
    "notes", "author_email",
  ];
  const updates: Record<string, any> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { error } = await (adminClient as any)
    .from("plan_registry")
    .update(updates)
    .eq("id", id)
    .eq("organization_id", userOrg.organization_id);

  if (error) {
    console.error("[plans/patch] Update error:", error);
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
