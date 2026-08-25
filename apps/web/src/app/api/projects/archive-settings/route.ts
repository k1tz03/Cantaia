import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

/**
 * POST /api/projects/archive-settings
 * Updates project archive settings (archive_path, archive_enabled, archive_structure, etc.)
 */
export async function POST(request: NextRequest) {
  console.log("[archive-settings] Starting archive settings update...");

  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.log("[archive-settings] ERROR: No authenticated user");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  console.log("[archive-settings] Authenticated user:", user.id, user.email);

  // 2. Parse body
  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const requiredError = validateRequired(body, ["project_id"]);
  if (requiredError) {
    console.log("[archive-settings] ERROR: Missing project_id");
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 }
    );
  }

  const {
    project_id,
    archive_path,
    archive_enabled,
    archive_structure,
    archive_filename_format,
    archive_attachments_mode,
  } = body;

  console.log("[archive-settings] Updating project:", project_id, {
    archive_path,
    archive_enabled,
    archive_structure,
    archive_filename_format,
    archive_attachments_mode,
  });

  // 3. Verify user has access to this project — organization scope.
  //
  // This used to require a project_members row, which is only written by
  // /api/projects/create for the creator: every colleague of the org got a 403
  // on the archiving tab of a project they legitimately work on.
  const admin = createAdminClient();

  const { data: userProfile } = await (admin as any)
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userProfile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const { data: projectRow } = await (admin as any)
    .from("projects")
    .select("id, organization_id")
    .eq("id", project_id)
    .maybeSingle();

  if (!projectRow || projectRow.organization_id !== userProfile.organization_id) {
    console.log("[archive-settings] ERROR: Project not in the user's organization");
    return NextResponse.json(
      { error: "You do not have access to this project" },
      { status: 403 }
    );
  }

  // 4. Update project archive settings
  const updateData: Record<string, unknown> = {};

  if (archive_path !== undefined) {
    updateData.archive_path = archive_path;
  }
  if (archive_enabled !== undefined) {
    updateData.archive_enabled = !!archive_enabled;
  }
  if (archive_structure !== undefined) {
    updateData.archive_structure = archive_structure;
  }
  if (archive_filename_format !== undefined) {
    updateData.archive_filename_format = archive_filename_format;
  }
  if (archive_attachments_mode !== undefined) {
    updateData.archive_attachments_mode = archive_attachments_mode;
  }

  if (Object.keys(updateData).length === 0) {
    console.log("[archive-settings] No fields to update");
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  const { data: project, error: updateErr } = await admin
    .from("projects")
    .update(updateData)
    .eq("id", project_id)
    .select()
    .single();

  if (updateErr) {
    console.error(
      "[archive-settings] ERROR updating project:",
      updateErr.message,
      updateErr.details,
      updateErr.hint
    );
    return NextResponse.json(
      { error: `Failed to update archive settings: ${updateErr.message}` },
      { status: 500 }
    );
  }

  console.log(
    "[archive-settings] Archive settings updated successfully for project:",
    project.id,
    project.name
  );

  return NextResponse.json({ success: true, project });
}
