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
      plan_versions: undefined,
      projects: undefined,
      project: plan.projects || null,
      versions,
    },
  });
}
