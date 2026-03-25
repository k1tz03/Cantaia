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

    // Verify user's organization
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    const { data: meeting, error } = await admin
      .from("meetings")
      .select("*, projects(id, name, code, color, address, city, organization_id)")
      .eq("id", id)
      .maybeSingle();

    if (error || !meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    // Verify meeting's project belongs to user's org
    const proj = (meeting as any).projects;
    if (proj && userProfile?.organization_id && proj.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

    // Verify meeting's project belongs to user's org
    const { data: userOrg } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    const { data: meetingCheck } = await (admin as any)
      .from("meetings")
      .select("project_id, pv_content")
      .eq("id", id)
      .maybeSingle();

    if (meetingCheck?.project_id && userOrg?.organization_id) {
      const { data: projCheck } = await (admin as any)
        .from("projects")
        .select("organization_id")
        .eq("id", meetingCheck.project_id)
        .maybeSingle();
      if (projCheck && projCheck.organization_id !== userOrg.organization_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Log PV content correction if pv_content changed (fire-and-forget)
    if (body.pv_content && meetingCheck?.pv_content && userOrg?.organization_id) {
      const existingJson = JSON.stringify(meetingCheck.pv_content);
      const newJson = JSON.stringify(body.pv_content);
      if (existingJson !== newJson) {
        try {
          await (admin as any).from("pv_corrections").insert({
            organization_id: userOrg.organization_id,
            meeting_id: id,
            original_content: meetingCheck.pv_content,
            corrected_content: body.pv_content,
            corrected_by: user.id,
            corrected_at: new Date().toISOString(),
          });
        } catch (pvLogErr) {
          console.error("[PV Update] pv_corrections insert failed (non-blocking):", pvLogErr);
        }
      }
    }

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
      "audio_url",
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

    // Delete related tasks (created from PV finalization)
    await admin
      .from("tasks")
      .delete()
      .eq("source", "meeting" as any)
      .eq("source_id", id);

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
