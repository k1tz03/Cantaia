import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get user's org
    const { data: userRow } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!userRow?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }
    const orgId = userRow.organization_id;

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const visitId = formData.get("visit_id") as string | null;
    const photoType = (formData.get("photo_type") as string) || "site";
    const caption = formData.get("caption") as string | null;
    const locationDescription = formData.get("location_description") as string | null;

    if (!file || !visitId) {
      return NextResponse.json({ error: "file and visit_id required" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Accepted: JPEG, PNG, WebP" }, { status: 400 });
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
    }

    if (!["site", "handwritten_notes"].includes(photoType)) {
      return NextResponse.json({ error: "Invalid photo_type" }, { status: 400 });
    }

    // Verify visit belongs to user's org
    const { data: visit } = await ((admin as any).from("client_visits"))
      .select("id, organization_id")
      .eq("id", visitId)
      .eq("organization_id", orgId)
      .maybeSingle();

    if (!visit) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    // Sanitize filename
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const ext = safeName.split(".").pop() || "jpg";
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `photos/${orgId}/${visitId}/${uniqueName}`;

    // Upload to storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadErr } = await admin.storage
      .from("audio")
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadErr) {
      console.error("[PhotoUpload] Storage error:", uploadErr);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    // Get current photo count for sort_order
    const { count } = await ((admin as any).from("visit_photos"))
      .select("id", { count: "exact", head: true })
      .eq("visit_id", visitId);

    // Insert DB record
    const { data: photo, error: insertErr } = await ((admin as any).from("visit_photos"))
      .insert({
        visit_id: visitId,
        organization_id: orgId,
        photo_type: photoType,
        file_url: storagePath,
        file_name: safeName,
        file_size: file.size,
        mime_type: file.type,
        sort_order: (count || 0),
        caption: caption || null,
        location_description: locationDescription || null,
        ai_analysis_status: photoType === "handwritten_notes" ? "pending" : "pending",
        created_by: user.id,
      })
      .select("id, file_url, photo_type, sort_order, ai_analysis_status")
      .single();

    if (insertErr) {
      console.error("[PhotoUpload] DB error:", insertErr);
      return NextResponse.json({ error: "Failed to save photo record" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      photo,
    });
  } catch (error) {
    console.error("[PhotoUpload] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
