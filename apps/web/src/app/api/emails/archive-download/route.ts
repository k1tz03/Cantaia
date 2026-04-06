import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/**
 * GET /api/emails/archive-download?project_id=xxx&format=json|zip
 *
 * format=json (default): Returns archive stats and manifest.
 * format=zip: Downloads a ZIP file containing all archived .eml files.
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  const format = request.nextUrl.searchParams.get("format") || "json";

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
  const { data: project } = await (admin as any)
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

  // Get archive records
  const { data: archives } = await (admin as any)
    .from("email_archives")
    .select("id, email_id, local_path, folder_name, file_name, status, archived_at, storage_path, storage_bucket, file_size, error_message")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  // Get total email count
  const { count: totalEmails } = await admin
    .from("email_records")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("is_processed", true);

  const savedArchives = (archives || []).filter(
    (a: { status: string }) => a.status === "saved"
  );
  const failedArchives = (archives || []).filter(
    (a: { status: string }) => a.status === "failed"
  );
  const pendingArchives = (archives || []).filter(
    (a: { status: string }) => a.status === "pending"
  );

  if (format === "zip") {
    return await generateZipDownload(admin, savedArchives, project.name);
  }

  // Generate signed download URLs for each archived file (10-minute expiry)
  const archivesWithUrls = await Promise.all(
    savedArchives.map(async (a: any) => {
      let download_url: string | null = null;
      if (a.storage_path) {
        try {
          const { data: signedData } = await admin.storage
            .from(a.storage_bucket || "email-archives")
            .createSignedUrl(a.storage_path, 600); // 10 minutes
          download_url = signedData?.signedUrl || null;
        } catch {
          // Silently fail — URL will be null
        }
      }
      return {
        email_id: a.email_id,
        file_name: a.file_name,
        folder_name: a.folder_name,
        storage_path: a.storage_path,
        file_size: a.file_size,
        archived_at: a.archived_at,
        download_url,
      };
    })
  );

  // JSON manifest
  return NextResponse.json({
    project_name: project.name,
    structure: project.archive_structure || "by_category",
    total_emails: totalEmails || 0,
    archived_count: savedArchives.length,
    failed_count: failedArchives.length,
    pending_count: pendingArchives.length,
    archives: archivesWithUrls,
    failed: failedArchives.map((a: any) => ({
      email_id: a.email_id,
      file_name: a.file_name,
      error: a.error_message,
    })),
  });
}

// ── ZIP generation using archiver ──

async function generateZipDownload(
  admin: ReturnType<typeof createAdminClient>,
  archives: any[],
  projectName: string
) {
  if (archives.length === 0) {
    return NextResponse.json(
      { error: "No archived emails to download" },
      { status: 404 }
    );
  }

  // Dynamic import to avoid loading archiver on every request
  const archiver = (await import("archiver")).default;

  // Create a readable stream via a TransformStream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Start the archiver in the background
  const archive = archiver("zip", { zlib: { level: 6 } });

  // Pipe archiver output to our writable stream
  const pipePromise = (async () => {
    try {
      // Collect all chunks from archiver and write to our stream
      archive.on("data", (chunk: Buffer) => {
        writer.write(new Uint8Array(chunk));
      });

      archive.on("end", () => {
        writer.close();
      });

      archive.on("error", (err: Error) => {
        console.error("[archive-download] Archiver error:", err);
        writer.abort(err);
      });

      // Add each archived file to the ZIP
      for (const arc of archives) {
        if (!arc.storage_path) continue;

        try {
          const { data: fileData, error: downloadErr } = await admin.storage
            .from(arc.storage_bucket || "email-archives")
            .download(arc.storage_path);

          if (downloadErr || !fileData) {
            console.warn(`[archive-download] Failed to download ${arc.storage_path}:`, downloadErr?.message);
            continue;
          }

          const buffer = Buffer.from(await fileData.arrayBuffer());

          // Use folder_name/file_name.eml as the path inside the ZIP
          const zipPath = arc.folder_name
            ? `${arc.folder_name}/${arc.file_name}.eml`
            : `${arc.file_name}.eml`;

          archive.append(buffer, { name: zipPath });
        } catch (err) {
          console.warn(`[archive-download] Error adding ${arc.storage_path} to ZIP:`, err);
        }
      }

      await archive.finalize();
    } catch (err) {
      console.error("[archive-download] ZIP generation failed:", err);
      try {
        writer.abort(err instanceof Error ? err : new Error(String(err)));
      } catch {
        // Writer may already be closed
      }
    }
  })();

  // Don't await — let it run in parallel with the response
  pipePromise.catch((err) => console.error("[archive-download] Pipe error:", err));

  const sanitizedName = projectName
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .substring(0, 50);

  return new Response(readable, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="archives_${sanitizedName}_${new Date().toISOString().slice(0, 10)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
