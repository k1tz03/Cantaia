import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/projects/[id]/closure/upload-file
 *
 * Dedicated route for uploading signed PV files.
 * Accepts base64-encoded file in JSON body (compressed client-side to fit under Vercel's 4.5MB limit).
 * Uses admin client to bypass Storage policies.
 */
export const maxDuration = 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Auth check
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Verify org membership
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: project } = await (admin as any)
      .from("projects")
      .select("id, organization_id")
      .eq("id", projectId)
      .maybeSingle();

    if (!project || project.organization_id !== profile.organization_id) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Parse JSON body
    const body = await request.json();
    const { file_base64, filename, content_type, reception_id } = body as {
      file_base64: string;
      filename: string;
      content_type: string;
      reception_id: string | null;
    };

    if (!file_base64) {
      return NextResponse.json({ error: "No file data provided" }, { status: 400 });
    }

    // Decode base64 to buffer
    const buffer = Buffer.from(file_base64, "base64");
    const safeName = (filename || "signed.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `closure/${profile.organization_id}/${projectId}/signed_${Date.now()}_${safeName}`;

    // Ensure the "audio" bucket exists (auto-create if missing)
    try {
      const { data: buckets } = await admin.storage.listBuckets();
      const bucketExists = buckets?.some((b: { name: string }) => b.name === "audio");
      if (!bucketExists) {
        console.log("[UploadFile] Creating missing 'audio' bucket");
        await admin.storage.createBucket("audio", { public: true });
      }
    } catch (bucketErr) {
      console.warn("[UploadFile] Bucket check/create failed:", bucketErr);
    }

    // Upload via admin client (bypasses Storage policies)
    const { error: uploadErr } = await admin.storage
      .from("audio")
      .upload(storagePath, buffer, {
        contentType: content_type || "image/jpeg",
        upsert: true,
      });

    if (uploadErr) {
      console.error("[UploadFile] Storage upload failed:", uploadErr.message);
      return NextResponse.json(
        { error: `Upload échoué: ${uploadErr.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = admin.storage.from("audio").getPublicUrl(storagePath);
    const signedUrl = urlData?.publicUrl || storagePath;

    // Try DB save (non-fatal if table doesn't exist)
    try {
      if (reception_id && !reception_id.startsWith("storage-fallback-") && !reception_id.startsWith("local-fallback-")) {
        await (admin as any)
          .from("project_receptions")
          .update({
            pv_signed_url: signedUrl,
            pv_signed_at: new Date().toISOString(),
            status: "signed",
          })
          .eq("id", reception_id);
      } else {
        await (admin as any)
          .from("project_receptions")
          .insert({
            project_id: projectId,
            organization_id: profile.organization_id,
            reception_type: "provisional",
            reception_date: new Date().toISOString().split("T")[0],
            status: "signed",
            pv_signed_url: signedUrl,
            pv_signed_at: new Date().toISOString(),
          });
      }
    } catch {
      console.warn("[UploadFile] DB save for signed PV failed (table may not exist)");
    }

    return NextResponse.json({ success: true, signed_url: signedUrl });
  } catch (error) {
    console.error("[UploadFile] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
