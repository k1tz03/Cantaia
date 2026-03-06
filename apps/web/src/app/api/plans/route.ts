import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/plans
 * List plans for the authenticated user's organization.
 * Optional query params: ?project_id=... &source_email_id=...
 */
export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("project_id");
  const sourceEmailId = searchParams.get("source_email_id");

  // If filtering by source_email_id, find plan_versions linked to that email
  if (sourceEmailId) {
    const { data: versions } = await (adminClient as any)
      .from("plan_versions")
      .select("id, plan_id, file_url, file_name, file_size, version_code, source_email_id, plan_registry(id, plan_number, plan_title, discipline)")
      .eq("organization_id", userOrg.organization_id)
      .eq("source_email_id", sourceEmailId);

    return NextResponse.json({ plans: versions || [] });
  }

  // Pagination
  const page = parseInt(searchParams.get("page") || "1");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  const offset = (page - 1) * limit;

  // Build query for plan_registry with latest version
  let query = (adminClient as any)
    .from("plan_registry")
    .select(`
      id, plan_number, plan_title, plan_type, discipline, lot_name, cfc_code, zone, scale,
      author_company, status, created_at, project_id,
      projects(id, name, code),
      plan_versions(id, version_code, version_number, version_date, file_url, file_name, file_size, file_type, is_current, ai_detected, validation_status, created_at)
    `, { count: "exact" })
    .eq("organization_id", userOrg.organization_id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data: plans, error, count } = await query;

  if (error) {
    console.error("[plans] Query error:", error);
    return NextResponse.json({ error: "Failed to fetch plans" }, { status: 500 });
  }

  // Transform: pick only the current version for each plan
  const result = (plans || []).map((plan: any) => {
    const versions = plan.plan_versions || [];
    const currentVersion = versions.find((v: any) => v.is_current) || versions[0];
    return {
      ...plan,
      plan_versions: undefined,
      current_version: currentVersion || null,
      version_count: versions.length,
      project: plan.projects || null,
      projects: undefined,
    };
  });

  const response = NextResponse.json({ plans: result });
  if (count !== null) response.headers.set("X-Total-Count", String(count));
  return response;
}
