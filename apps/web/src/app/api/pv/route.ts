import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

// GET — list meetings with optional project_id filter
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const projectId = request.nextUrl.searchParams.get("project_id");

    // Get user's projects via project_members
    const { data: memberships } = await admin
      .from("project_members")
      .select("project_id")
      .eq("user_id", user.id);

    const projectIds = (memberships || []).map((m: any) => m.project_id);

    if (projectIds.length === 0) {
      return NextResponse.json({ success: true, meetings: [] });
    }

    let query = admin
      .from("meetings")
      .select("*, projects(id, name, code, color)")
      .in("project_id", projectIds)
      .order("meeting_date", { ascending: false });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[PV List] Error:", error);
      return NextResponse.json(
        { error: "Failed to fetch meetings" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, meetings: data || [] });
  } catch (error) {
    console.error("[PV List] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST — create a new meeting
export async function POST(request: NextRequest) {
  try {
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

    const validationError = validateRequired(body, [
      "project_id",
      "title",
      "meeting_date",
    ]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const admin = createAdminClient();

    // Calculate meeting_number if not provided
    let meetingNumber = body.meeting_number;
    if (!meetingNumber) {
      const { data: lastMeeting } = await admin
        .from("meetings")
        .select("meeting_number")
        .eq("project_id", body.project_id)
        .order("meeting_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      meetingNumber = ((lastMeeting as any)?.meeting_number || 0) + 1;
    }

    const { data, error } = await admin
      .from("meetings")
      .insert({
        project_id: body.project_id,
        created_by: user.id,
        title: body.title,
        meeting_number: meetingNumber,
        meeting_date: body.meeting_date,
        location: body.location || null,
        participants: body.participants || [],
        status: "scheduled",
        agenda: [],
        transcription_language: "fr",
        pv_version: 1,
        sent_to: [],
        audio_retained: false,
      } as any)
      .select()
      .single();

    if (error) {
      console.error("[PV Create] Error:", error);
      return NextResponse.json(
        { error: "Failed to create meeting" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, meeting: data });
  } catch (error) {
    console.error("[PV Create] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
