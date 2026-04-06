import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  archiveEmail,
  type ArchiveableEmail,
  type ArchiveProjectConfig,
} from "@cantaia/core/emails";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

export const maxDuration = 300;

/**
 * POST /api/emails/archive
 * Archives emails for a project: generates .eml files and uploads to Supabase Storage.
 *
 * Body:
 *  - project_id: string (required)
 *  - email_ids?: string[] (optional — if omitted, archives all unarchived project emails)
 *
 * Returns immediately with 202, then processes in background via after().
 * Client polls GET /api/emails/archive-download?project_id=xxx to track progress.
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
  const { data: project, error: projErr } = await (admin as any)
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
  let emailQuery = (admin as any)
    .from("email_records")
    .select("id, outlook_message_id, subject, sender_email, sender_name, recipients, received_at, body_text, body_html, body_preview, classification, has_attachments")
    .eq("project_id", project_id);

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

  // 5. Check which emails are already archived (status=saved)
  const { data: existingArchives } = await admin
    .from("email_archives")
    .select("email_id")
    .eq("project_id", project_id)
    .eq("status", "saved")
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
      already_archived: alreadyArchivedIds.size,
      message: "All emails already archived",
    });
  }

  // 6. Get Microsoft Graph token for attachment download
  let graphToken: string | null = null;
  try {
    const tokenResult = await getValidMicrosoftToken(user.id);
    if (!("error" in tokenResult)) {
      graphToken = tokenResult.accessToken;
    }
  } catch {
    // No Graph token — archive without attachments
  }

  // 7. Return 202 immediately, process in background
  const totalToArchive = emailsToArchive.length;

  after(async () => {
    await processArchiveBatch(
      admin,
      emailsToArchive as ArchiveableEmail[],
      project as ArchiveProjectConfig,
      graphToken
    );
  });

  return NextResponse.json({
    success: true,
    accepted: totalToArchive,
    already_archived: alreadyArchivedIds.size,
    total_emails: emails.length,
    message: `Archiving ${totalToArchive} emails in background`,
  });
}

// ── Background processing ──

async function processArchiveBatch(
  admin: SupabaseClient,
  emails: ArchiveableEmail[],
  project: ArchiveProjectConfig,
  graphToken: string | null
) {
  let archived = 0;
  let failed = 0;

  for (const email of emails) {
    try {
      const result = await archiveEmail(admin, email, project, graphToken);

      // Delete any previous failed/pending records for this email
      await (admin as any)
        .from("email_archives")
        .delete()
        .eq("email_id", email.id)
        .eq("project_id", project.id)
        .in("status", ["pending", "failed"]);

      // Insert the new archive record
      await (admin as any)
        .from("email_archives")
        .insert({
          email_id: email.id,
          project_id: project.id,
          organization_id: project.organization_id,
          local_path: result.storage_path,
          folder_name: result.folder_name,
          file_name: result.file_name,
          storage_path: result.storage_path,
          storage_bucket: "email-archives",
          file_size: result.file_size,
          attachments_saved: result.attachments_saved,
          status: result.status,
          error_message: result.error_message || null,
          archived_at: result.status === "saved" ? new Date().toISOString() : null,
        });

      if (result.status === "saved") {
        archived++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`[archive] Failed to archive email ${email.id}:`, err);
      failed++;

      // Record the failure
      try {
        await (admin as any)
          .from("email_archives")
          .upsert({
            email_id: email.id,
            project_id: project.id,
            organization_id: project.organization_id,
            local_path: "",
            file_name: email.subject.slice(0, 200),
            status: "failed",
            error_message: err instanceof Error ? err.message : String(err),
          }, { onConflict: "email_id,project_id" });
      } catch {
        // Silently fail — don't block the batch
      }
    }
  }

  console.log(
    `[archive] Batch complete for project ${project.name}: ${archived} saved, ${failed} failed out of ${emails.length}`
  );
}

// Import type for TS
type SupabaseClient = ReturnType<typeof createAdminClient>;
