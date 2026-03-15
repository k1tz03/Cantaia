import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/x-icon"];
const MAX_SIZE = 2 * 1024 * 1024; // 2 MB

/**
 * POST /api/organization/upload-logo
 * Uploads a logo image to Supabase Storage and updates the organization record.
 * Body: FormData with "file" (image) and optional "variant" ("light" | "dark")
 */
export async function POST(request: NextRequest) {
  console.log("[upload-logo] Starting logo upload...");

  // 1. Auth check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Get user's organization
  const admin = createAdminClient();
  const { data: userRow, error: userErr } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (userErr || !userRow?.organization_id) {
    return NextResponse.json(
      { error: "No organization found" },
      { status: 404 }
    );
  }

  const orgId = userRow.organization_id;

  // 3. Check plan (only Pro and Enterprise can upload logos)
  const { data: org } = await admin
    .from("organizations")
    .select("subscription_plan, branding_enabled")
    .eq("id", orgId)
    .maybeSingle();

  if (
    org &&
    org.subscription_plan !== "pro" &&
    org.subscription_plan !== "enterprise"
  ) {
    return NextResponse.json(
      { error: "Logo upload requires Pro or Enterprise plan" },
      { status: 403 }
    );
  }

  // 4. Parse form data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const variant = (formData.get("variant") as string) || "light";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type: ${file.type}. Allowed: PNG, JPEG, ICO` },
      { status: 400 }
    );
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum: 2 MB" },
      { status: 400 }
    );
  }

  // 5. Upload to Supabase Storage
  const ext = file.name.split(".").pop() || "png";
  const fileName = `${orgId}/${variant === "dark" ? "logo-dark" : "logo"}.${ext}`;

  console.log(`[upload-logo] Uploading ${fileName} (${(file.size / 1024).toFixed(1)} KB)`);

  const buffer = await file.arrayBuffer();
  const { error: uploadErr } = await admin.storage
    .from("organization-assets")
    .upload(fileName, buffer, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadErr) {
    console.error("[upload-logo] Storage upload error:", uploadErr.message);
    return NextResponse.json(
      { error: "Upload failed: " + uploadErr.message },
      { status: 500 }
    );
  }

  // 6. Get public URL
  const { data: urlData } = admin.storage
    .from("organization-assets")
    .getPublicUrl(fileName);

  const publicUrl = urlData.publicUrl;
  console.log("[upload-logo] Public URL:", publicUrl);

  // 7. Update organization record
  const updateField = variant === "dark" ? "logo_dark_url" : "logo_url";
  const { error: updateErr } = await admin
    .from("organizations")
    .update({ [updateField]: publicUrl, branding_enabled: true } as Record<string, unknown>)
    .eq("id", orgId);

  if (updateErr) {
    console.error("[upload-logo] DB update error:", updateErr.message);
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 }
    );
  }

  console.log(`[upload-logo] Success: ${updateField} updated for org ${orgId}`);

  return NextResponse.json({
    success: true,
    url: publicUrl,
    variant,
  });
}
