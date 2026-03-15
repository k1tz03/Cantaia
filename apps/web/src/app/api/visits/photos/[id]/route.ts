import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { id } = await params;

    const { data: userRow } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!userRow?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Verify photo belongs to user's org
    const { data: photo } = await ((admin as any).from("visit_photos"))
      .select("id, organization_id")
      .eq("id", id)
      .eq("organization_id", userRow.organization_id)
      .maybeSingle();

    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (typeof body.caption === "string") updateData.caption = body.caption;
    if (typeof body.location_description === "string") updateData.location_description = body.location_description;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { error } = await ((admin as any).from("visit_photos"))
      .update(updateData)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to update" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PhotoUpdate] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { id } = await params;

    const { data: userRow } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!userRow?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Verify photo belongs to user's org
    const { data: photo } = await ((admin as any).from("visit_photos"))
      .select("id, organization_id, file_url")
      .eq("id", id)
      .eq("organization_id", userRow.organization_id)
      .maybeSingle();

    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    // Delete from storage
    if (photo.file_url) {
      await admin.storage.from("audio").remove([photo.file_url]);
    }

    // Delete DB record (trigger updates photos_count)
    const { error } = await ((admin as any).from("visit_photos"))
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PhotoDelete] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
