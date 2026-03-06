import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { determineArchivePath, type ArchiveEmailInput } from "@cantaia/core/emails";
import type { ArchiveStructure, ArchiveFilenameFormat } from "@cantaia/database";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

/**
 * POST /api/emails/archive
 * Archives emails for a specific project.
 *
 * Body:
 *  - project_id: string (required)
 *  - email_ids?: string[] (optional — if omitted, archives all unarchived project emails)
 *
 * In web mode: creates email_archives records with computed paths (for future Tauri desktop sync).
 * Returns archive manifest (list of paths) that can be used for ZIP download or Tauri filesystem write.
 */
export async function POST(request: NextRequest) {
  // 1. Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 2. Parse body
  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const requiredError = validateRequired(body, ["project_id"]);
  if (requiredError) {
    return NextResponse.json({ error: requiredError }, { status: 400 });
  }

  const { project_id, email_ids } = body;

  // 3. Verify access + get project archive settings
  const { data: project, error: projErr } = await admin
    .from("projects")
    .select("id, name, organization_id, archive_enabled, archive_path, archive_structure, archive_filename_format, archive_attachments_mode")
    .eq("id", project_id)
    .maybeSingle();

  if (projErr || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Verify membership
  const { data: membership } = await admin
    .from("project_members")
    .select("role")
    .eq("project_id", project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (!project.archive_enabled) {
    return NextResponse.json({ error: "Archiving is not enabled for this project" }, { status: 400 });
  }

  // 4. Get emails to archive
  let emailQuery = admin
    .from("email_records")
    .select("id, subject, sender_email, sender_name, received_at, classification, has_attachments, body_preview")
    .eq("project_id", project_id)
    .eq("is_processed", true);

  if (email_ids && email_ids.length > 0) {
    emailQuery = emailQuery.in("id", email_ids);
  }

  const { data: emails, error: emailErr } = await emailQuery;

  if (emailErr) {
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 });
  }

  if (!emails || emails.length === 0) {
    return NextResponse.json({ success: true, archived: 0, message: "No emails to archive" });
  }

  // 5. Check which emails are already archived
  const { data: existingArchives } = await admin
    .from("email_archives")
    .select("email_id")
    .eq("project_id", project_id)
    .in("status", ["saved", "pending"])
    .in(
      "email_id",
      emails.map((e: { id: string }) => e.id)
    );

  const alreadyArchivedIds = new Set(
    (existingArchives || []).map((a: { email_id: string }) => a.email_id)
  );
  const emailsToArchive = emails.filter(
    (e: { id: string }) => !alreadyArchivedIds.has(e.id)
  );

  if (emailsToArchive.length === 0) {
    return NextResponse.json({
      success: true,
      archived: 0,
      message: "All emails already archived",
    });
  }

  // 6. Compute archive paths and create records
  const basePath = project.archive_path || `C:\\Chantiers\\${project.name}`;
  const structure = (project.archive_structure || "by_category") as ArchiveStructure;
  const filenameFormat = (project.archive_filename_format || "date_sender_subject") as ArchiveFilenameFormat;

  const archiveRecords: {
    email_id: string;
    project_id: string;
    organization_id: string;
    local_path: string;
    folder_name: string | null;
    file_name: string;
    attachments_saved: { name: string; local_path: string; size: number }[];
    status: "pending" | "saved" | "failed" | "skipped";
    archived_at: string | null;
  }[] = [];

  let archived = 0;
  let failed = 0;

  for (const email of emailsToArchive) {
    try {
      const input: ArchiveEmailInput = {
        emailId: email.id,
        projectName: project.name,
        senderEmail: email.sender_email,
        senderName: email.sender_name || null,
        subject: email.subject,
        receivedAt: email.received_at,
        classification: email.classification || null,
        attachmentNames: [], // Attachment names would come from attachments table — for now empty
      };

      const pathResult = determineArchivePath(input, structure, filenameFormat);

      const fullPath = pathResult.folder
        ? `${basePath}\\${pathResult.folder}\\${pathResult.fileName}.eml`
        : `${basePath}\\${pathResult.fileName}.eml`;

      archiveRecords.push({
        email_id: email.id,
        project_id: project.id,
        organization_id: project.organization_id,
        local_path: fullPath,
        folder_name: pathResult.folder || null,
        file_name: pathResult.fileName,
        attachments_saved: [],
        status: "pending",
        archived_at: null,
      });

      archived++;
    } catch (err) {
      console.error(`[archive] Failed to compute path for email ${email.id}:`, err);
      failed++;
    }
  }

  // 7. Batch insert archive records
  if (archiveRecords.length > 0) {
    const { error: insertErr } = await admin
      .from("email_archives")
      .insert(archiveRecords);

    if (insertErr) {
      console.error("[archive] Failed to insert archive records:", insertErr.message);
      return NextResponse.json(
        { error: "Failed to create archive records: " + insertErr.message },
        { status: 500 }
      );
    }
  }

  if (process.env.NODE_ENV === "development") console.log(
    `[archive] Created ${archived} archive records for project ${project.name}, ${failed} failed`
  );

  return NextResponse.json({
    success: true,
    archived,
    failed,
    total_emails: emails.length,
    already_archived: alreadyArchivedIds.size,
  });
}
