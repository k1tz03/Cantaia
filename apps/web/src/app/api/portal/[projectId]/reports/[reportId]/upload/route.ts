import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPortalToken } from "@/lib/portal/auth";

const BUCKET = "site-report-photos";
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
// The bucket is private (migration 086). Signed URLs are stored verbatim in
// site_report_entries.photo_url and rendered as <img src> by the assistant and
// public report views, so they must outlive the operational life of a delivery
// note. The `path` is returned alongside so a future job can re-sign them.
const SIGNED_URL_TTL_SECONDS = 10 * 365 * 24 * 60 * 60; // ~10 years

async function checkPortalAuth(projectId: string) {
  const admin = createAdminClient();
  const { data: project } = await (admin as any)
    .from("projects")
    .select("portal_pin_salt, portal_enabled")
    .eq("id", projectId)
    .single();

  if (!project || !project.portal_enabled) return { valid: false as const, admin };
  const auth = await verifyPortalToken(projectId, project.portal_pin_salt || "");
  return { ...auth, admin };
}

/**
 * POST /api/portal/[projectId]/reports/[reportId]/upload
 * Upload a delivery-note photo from the field portal (multipart FormData, field "file").
 * Returns a signed URL (stored as photo_url on the entry) plus the storage path.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; reportId: string }> },
) {
  try {
    const { projectId, reportId } = await params;
    const { valid, admin } = await checkPortalAuth(projectId);
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
      return NextResponse.json({ error: "Report is locked" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Format non supporté. Formats acceptés : JPEG, PNG, WebP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)." }, { status: 400 });
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
      return NextResponse.json({ error: "Échec de l'envoi de la photo." }, { status: 500 });
    }

    const { data: signed, error: signError } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      console.error("[Portal Upload] Signed URL error:", signError);
      return NextResponse.json({ error: "Photo envoyée mais lien indisponible." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      file_url: signed.signedUrl,
      path: storagePath,
      file_name: safeName,
      file_size: file.size,
    });
  } catch (error) {
    console.error("[Portal Upload] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
