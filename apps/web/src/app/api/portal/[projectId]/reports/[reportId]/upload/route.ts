import { NextRequest, NextResponse } from "next/server";
import { requirePortalSession } from "@/lib/portal/session";

const BUCKET = "site-report-photos";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
// The bucket is private (migration 086). We store the storage `path` on the
// entry (site_report_entries.photo_url) and re-sign it on the fly at read time
// (app, public view, régie), so revoking or expiring a share link really cuts
// off access. A short-lived signed URL is returned here only for the immediate
// optimistic preview in the field form.
const PREVIEW_TTL_SECONDS = 60 * 60; // 1 h — enough for the capture round-trip

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> },
) {
  try {
    const { projectId, reportId } = await params;
    const { valid, admin } = await requirePortalSession(projectId);
    if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // The report must belong to this project and still be editable
    const { data: report } = await (admin as any)
      .from("site_reports")
      .select("id, status")
      .eq("id", reportId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (report.status === "locked") {
      return NextResponse.json({ error: "Report is locked", code: "LOCKED" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required", code: "FILE_REQUIRED" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Unsupported format. Accepted: JPEG, PNG, WebP.", code: "UNSUPPORTED_FORMAT" },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 10 MB).", code: "TOO_LARGE" },
        { status: 400 },
      );
    }

    // Sanitize filename (no path traversal, no exotic characters)
    const safeName = (file.name || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = (safeName.split(".").pop() || "jpg").toLowerCase().slice(0, 8);
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${projectId}/${reportId}/${uniqueName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(storagePath, buffer, { contentType: file.type, upsert: false });

    if (uploadError) {
      console.error("[Portal Upload] Storage error:", uploadError);
      return NextResponse.json(
        { error: "Photo upload failed.", code: "UPLOAD_FAILED" },
        { status: 500 },
      );
    }

    // The persisted value is the PATH (re-signed at read time). The preview URL
    // is short-lived and only used by the capturing device right now.
    const { data: signed, error: signError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, PREVIEW_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      console.error("[Portal Upload] Signed URL error:", signError);
      return NextResponse.json(
        { error: "Photo uploaded but its link is unavailable.", code: "SIGNED_URL_UNAVAILABLE" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      // The entry must store the path; the URL is a transient preview only.
      file_url: storagePath,
      preview_url: signed.signedUrl,
      path: storagePath,
      file_name: safeName,
      file_size: file.size,
    });
  } catch (error) {
    console.error("[Portal Upload] Error:", error);
    return NextResponse.json({ error: "Internal server error", code: "INTERNAL" }, { status: 500 });
  }
}
