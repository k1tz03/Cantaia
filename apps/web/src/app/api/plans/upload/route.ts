import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/plans/upload
 * Create plan_registry + plan_versions records from metadata.
 * The file must already be uploaded to Supabase Storage by the client.
 * Body JSON: { project_id, plan_number, plan_title, file_url, file_name, file_size, file_type, ...optional }
 */
export async function POST(request: NextRequest) {
  try {
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

    const body = await request.json();
    const {
      project_id,
      plan_number,
      plan_title,
      file_url,
      file_name,
      file_size,
      file_type,
      plan_type = "execution",
      discipline = null,
      version_code = "A",
      lot_name = null,
      zone = null,
      scale = null,
      format = null,
      author_company = null,
      author_name = null,
      notes = null,
    } = body;

    if (!project_id || !plan_number || !plan_title || !file_url || !file_name) {
      return NextResponse.json(
        { error: "project_id, plan_number, plan_title, file_url, and file_name are required" },
        { status: 400 }
      );
    }

    // Verify that the project belongs to the user's organization
    const { data: projCheck } = await adminClient
      .from("projects")
      .select("organization_id")
      .eq("id", project_id)
      .maybeSingle();

    if (!projCheck || projCheck.organization_id !== userOrg.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const orgId = userOrg.organization_id;

    // Create plan_registry record
    const { data: plan, error: planError } = await (adminClient as any)
      .from("plan_registry")
      .insert({
        project_id,
        organization_id: orgId,
        plan_number: plan_number,
        plan_title: plan_title,
        plan_type: plan_type,
        discipline: discipline || null,
        lot_name,
        zone,
        scale,
        format,
        author_company: author_company,
        author_name: author_name,
        notes,
        status: "active",
      })
      .select("id")
      .single();

    if (planError) {
      console.error("[plans/upload] plan_registry insert error:", planError);
      return NextResponse.json(
        { error: "Failed to create plan record" },
        { status: 500 }
      );
    }

    // Create plan_versions record
    const { error: versionError } = await (adminClient as any)
      .from("plan_versions")
      .insert({
        plan_id: plan.id,
        organization_id: orgId,
        project_id,
        version_code: version_code,
        version_number: 1,
        version_date: new Date().toISOString(),
        file_url,
        file_name,
        file_size: file_size || 0,
        file_type: file_type || "application/pdf",
        source: "manual_upload",
        is_current: true,
        validation_status: "pending",
      });

    if (versionError) {
      console.error("[plans/upload] plan_versions insert error:", versionError);
      return NextResponse.json({
        success: true,
        plan_id: plan.id,
        warning: "Plan created but version record failed",
      });
    }

    return NextResponse.json({
      success: true,
      plan_id: plan.id,
    });
  } catch (error: unknown) {
    console.error("[plans/upload] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
