import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/parse-body";

// GET — get meeting detail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: meeting, error } = await admin
      .from("meetings")
      .select("*, projects(id, name, code, color, address, city)")
      .eq("id", id)
      .maybeSingle();

    if (error || !meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, meeting });
  } catch (error) {
    console.error("[PV Detail] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT — update meeting
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json(
        { error: parseError || "Invalid request" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Build update object with only allowed fields
    const updateData: Record<string, any> = {};
    const allowedFields = [
      "title",
      "location",
      "meeting_date",
      "participants",
      "pv_content",
      "pv_html",
      "status",
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from("meetings")
      .update(updateData as any)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("[PV Update] Error:", error);
      return NextResponse.json(
        { error: "Failed to update meeting" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, meeting: data });
  } catch (error) {
    console.error("[PV Update] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE — delete meeting and audio
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Get meeting to find audio file
    const { data: meeting } = await admin
      .from("meetings")
      .select("audio_url, created_by")
      .eq("id", id)
      .maybeSingle();

    if (!meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    if (meeting.created_by !== user.id) {
      return NextResponse.json(
        { error: "Only the creator can delete this meeting" },
        { status: 403 }
      );
    }

    // Delete audio file from storage
    if (meeting.audio_url) {
      await admin.storage.from("meeting-audio").remove([meeting.audio_url]);
    }

    // Delete the meeting
    const { error } = await admin.from("meetings").delete().eq("id", id);

    if (error) {
      console.error("[PV Delete] Error:", error);
      return NextResponse.json(
        { error: "Failed to delete meeting" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PV Delete] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
