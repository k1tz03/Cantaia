import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/pricing/upload-for-extraction
 *
 * Upload files to Supabase Storage for the price-extractor agent to process.
 * Accepts FormData with files. Returns storage paths that the agent can use
 * with fetch_file_content.
 *
 * Used only when NEXT_PUBLIC_USE_MANAGED_AGENTS=true.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Get user's org
    const { data: userOrg } = await adminClient
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userOrg?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const orgId = userOrg.organization_id;
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json(
        { error: "No files provided" },
        { status: 400 }
      );
    }

    // Validate file types
    const ALLOWED_EXTENSIONS = new Set([
      "pdf",
      "xlsx",
      "xls",
      "msg",
      "eml",
      "txt",
      "html",
      "htm",
    ]);
    const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

    const uploadedFiles: {
      file_name: string;
      storage_path: string;
      file_type: string;
    }[] = [];
    const errors: string[] = [];

    // Use a full UUID as batch ID to group uploads (avoid collision with truncated IDs)
    const batchId = crypto.randomUUID();

    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        errors.push(`${file.name}: unsupported type .${ext}`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${file.name}: exceeds 25 MB limit`);
        continue;
      }

      // Sanitize filename
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `price-imports/${orgId}/${batchId}/${safeName}`;

      const buffer = Buffer.from(await file.arrayBuffer());

      // Upload to the "plans" bucket (reuse existing bucket — price-imports is just a path prefix)
      const { error: uploadError } = await adminClient.storage
        .from("plans")
        .upload(storagePath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        errors.push(`${file.name}: upload failed — ${uploadError.message}`);
        continue;
      }

      // Map extension to the file_type enum expected by fetch_file_content
      let fileType = ext;
      if (ext === "htm") fileType = "txt"; // treat .htm same as html/txt
      if (ext === "html") fileType = "txt";

      uploadedFiles.push({
        file_name: file.name,
        // Full path including bucket prefix so the agent handler can detect it
        storage_path: `plans/${storagePath}`,
        file_type: fileType,
      });
    }

    return NextResponse.json({
      files: uploadedFiles,
      errors: errors.length > 0 ? errors : undefined,
      batch_id: batchId,
    });
  } catch (err) {
    console.error("[upload-for-extraction] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
