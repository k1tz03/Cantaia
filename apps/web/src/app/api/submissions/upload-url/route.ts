import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

    // Build a unique storage path
    const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pid = projectId || "no-project";
    const storagePath = `${profile.organization_id}/${pid}/${Date.now()}_${sanitizedName}`;

    // Create a signed upload URL (valid for 5 minutes)
    const { data, error } = await admin.storage
      .from("submissions")
      .createSignedUploadUrl(storagePath);

    if (error) {
      console.error("[upload-url] Supabase signed URL error:", error);
      return NextResponse.json(
        { error: "Impossible de générer l'URL d'upload: " + error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      signed_url: data.signedUrl,
      storage_path: storagePath,
      token: data.token,
    });
  } catch (err: any) {
    console.error("[upload-url] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
