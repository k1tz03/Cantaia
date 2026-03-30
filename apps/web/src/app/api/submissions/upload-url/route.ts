import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "submissions";

/**
 * GET /api/submissions/upload-url?filename=xxx.pdf&project_id=yyy
 *
 * Returns a Supabase Storage signed upload URL so the browser can upload
 * the file directly — bypassing Vercel's 4.5 MB serverless body limit.
 *
 * Flow:
 *   1. Browser calls this route to get { signed_url, storage_path, token }
 *   2. Browser PUTs the file directly to signed_url (no binary through Vercel)
 *   3. Browser calls POST /api/submissions with { storage_path, file_name, file_type, project_id }
 *
 * Prerequisites (apply migration 068 if not done):
 *   - Supabase bucket "submissions" must exist (private, 50 MB limit, MIME types: null)
 *   - Storage policies: see packages/database/migrations/068_submissions_bucket_setup.sql
 *   - CORS: Supabase Dashboard → Settings → API → allow your domain (default * is fine)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 400 });
    }

    const filename = request.nextUrl.searchParams.get("filename");
    const projectId = request.nextUrl.searchParams.get("project_id");

    if (!filename) {
      return NextResponse.json({ error: "filename is required" }, { status: 400 });
    }

    // Validate file extension
    const ext = filename.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "xlsx", "xls"].includes(ext)) {
      return NextResponse.json(
        { error: "Format non supporté. Utilisez PDF, XLSX ou XLS." },
        { status: 400 }
      );
    }

    // Build a unique storage path scoped to this org
    const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pid = projectId || "no-project";
    const storagePath = `${profile.organization_id}/${pid}/${Date.now()}_${sanitizedName}`;

    // ── Pre-flight: verify the bucket exists ───────────────────────────────
    // This gives a clear error if migration 068 was not yet applied.
    const { data: bucketData, error: bucketError } = await admin.storage.getBucket(BUCKET);
    if (bucketError || !bucketData) {
      const hint = bucketError?.message?.includes("not found")
        ? `Le bucket "${BUCKET}" n'existe pas dans Supabase Storage. Appliquez la migration 068 : packages/database/migrations/068_submissions_bucket_setup.sql`
        : `Bucket "${BUCKET}" inaccessible : ${bucketError?.message || "inconnu"}`;
      console.error("[upload-url] Bucket check failed:", hint);
      return NextResponse.json({ error: hint }, { status: 500 });
    }

    // ── Check file size limit set on the bucket ────────────────────────────
    const bucketLimit = (bucketData as any).file_size_limit;
    if (bucketLimit && bucketLimit < 1_000_000) {
      // bucket limit is suspiciously small (< 1 MB) — log a warning but continue
      console.warn(
        `[upload-url] Bucket "${BUCKET}" file_size_limit is very small: ${bucketLimit} bytes. ` +
        "Apply migration 068 to set it to 52428800 (50 MB)."
      );
    }

    // ── Create a signed upload URL (valid for 5 minutes) ──────────────────
    const { data, error } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (error) {
      console.error("[upload-url] createSignedUploadUrl error:", {
        message: error.message,
        storagePath,
        bucket: BUCKET,
      });

      // Diagnose common errors
      let userMessage = `Impossible de générer l'URL d'upload : ${error.message}`;
      if (error.message?.includes("Bucket not found") || error.message?.includes("not found")) {
        userMessage =
          `Le bucket "${BUCKET}" est introuvable dans Supabase Storage. ` +
          "Appliquez la migration 068 : packages/database/migrations/068_submissions_bucket_setup.sql";
      } else if (error.message?.includes("policy") || error.message?.includes("permission")) {
        userMessage =
          `Permissions insuffisantes sur le bucket "${BUCKET}". ` +
          "Vérifiez les RLS policies (migration 068).";
      }

      return NextResponse.json({ error: userMessage }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      signed_url: data.signedUrl,
      storage_path: storagePath,
      token: data.token,
    });
  } catch (err: any) {
    console.error("[upload-url] Unexpected error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
