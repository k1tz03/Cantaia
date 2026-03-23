import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPortalToken } from "@/lib/portal/auth";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const admin = createAdminClient();

    const { data: project } = await admin
      .from("projects")
      .select("portal_pin_salt, portal_enabled")
      .eq("id", projectId)
      .single();

    if (!project || !project.portal_enabled) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const auth = await verifyPortalToken(projectId, project.portal_pin_salt || "");
    if (!auth.valid) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: plans } = await (admin as any)
      .from("plan_registry")
      .select("id, plan_number, plan_title, plan_type, discipline, status, is_current_version")
      .eq("project_id", projectId)
      .eq("is_current_version", true)
      .order("plan_number", { ascending: true });

    // Get latest version file_url for each plan
    const enriched = [];
    for (const plan of (plans || [])) {
      const { data: version } = await (admin as any)
        .from("plan_versions")
        .select("file_url, file_name, file_type")
        .eq("plan_id", plan.id)
        .order("version_number", { ascending: false })
        .limit(1)
        .single();

      enriched.push({
        ...plan,
        file_url: version?.file_url || null,
        file_name: version?.file_name || null,
        file_type: version?.file_type || null,
      });
    }

    return NextResponse.json({ plans: enriched });
  } catch (error) {
    console.error("[Portal Plans] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
