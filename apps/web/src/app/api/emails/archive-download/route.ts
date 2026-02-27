import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { determineArchivePath, type ArchiveEmailInput } from "@cantaia/core/emails";
import type { ArchiveStructure, ArchiveFilenameFormat } from "@cantaia/database";

/**
 * GET /api/emails/archive-download?project_id=xxx
 * Returns a JSON manifest of the archive structure.
 * In web mode, this manifest is used by the client to display the folder tree.
 * Future: actual ZIP download will be implemented with Tauri or server-side zip generation.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get project
  const { data: project } = await admin
    .from("projects")
    .select("id, name, organization_id, archive_path, archive_structure, archive_filename_format, archive_attachments_mode")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Verify membership
  const { data: membership } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Get archived emails
  const { data: archives } = await admin
    .from("email_archives")
    .select("id, email_id, local_path, folder_name, file_name, status, archived_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  // Get emails for this project
  const { data: emails } = await admin
    .from("emails")
    .select("id, subject, sender_email, sender_name, received_at, classification")
    .eq("project_id", projectId)
    .eq("is_processed", true)
    .order("received_at", { ascending: false });

  const basePath = project.archive_path || `C:\\Chantiers\\${project.name}`;
  const structure = (project.archive_structure || "by_category") as ArchiveStructure;
  const filenameFormat = (project.archive_filename_format || "date_sender_subject") as ArchiveFilenameFormat;

  // Build manifest for unarchived emails
  const archivedEmailIds = new Set(
    (archives || []).map((a: { email_id: string }) => a.email_id)
  );

  const manifest = (emails || []).map((email: {
    id: string;
    subject: string;
    sender_email: string;
    sender_name: string | null;
    received_at: string;
    classification: string | null;
  }) => {
    const input: ArchiveEmailInput = {
      emailId: email.id,
      projectName: project.name,
      senderEmail: email.sender_email,
      senderName: email.sender_name,
      subject: email.subject,
      receivedAt: email.received_at,
      classification: email.classification,
      attachmentNames: [],
    };

    const pathResult = determineArchivePath(input, structure, filenameFormat);
    const fullPath = pathResult.folder
      ? `${basePath}\\${pathResult.folder}\\${pathResult.fileName}.eml`
      : `${basePath}\\${pathResult.fileName}.eml`;

    return {
      email_id: email.id,
      subject: email.subject,
      sender: email.sender_email,
      received_at: email.received_at,
      archive_path: fullPath,
      folder: pathResult.folder || "",
      file_name: pathResult.fileName,
      is_archived: archivedEmailIds.has(email.id),
    };
  });

  return NextResponse.json({
    project_name: project.name,
    base_path: basePath,
    structure,
    total_emails: (emails || []).length,
    archived_count: (archives || []).filter((a: { status: string }) => a.status === "saved" || a.status === "pending").length,
    manifest,
  });
}
