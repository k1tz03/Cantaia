import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import {
  buildCarryOverSection,
  loadPreviousOpenPoints,
  loadPVTemplate,
} from "./_shared/pv-circulation";

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

    // Scope by organization (same rule as POST). Scoping by project_members
    // hid colleagues' PVs, since only the project creator is a member.
    const { data: userProfile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ success: true, meetings: [] });
    }

    // `projects!inner` + a filter on the embedded org keeps the scoping in a
    // single query (no unbounded .in() list of project ids).
    // Explicit column list: the list view never needs `transcription_raw`
    // (tens of KB per one-hour meeting) nor `pv_html` — shipping them for every
    // PV of the org turned a simple list into a multi-MB payload.
    let query = admin
      .from("meetings")
      .select(
        "id, project_id, title, meeting_number, meeting_date, location, participants, status, sent_at, sent_to, pv_content, created_by, projects!inner(id, name, code, color, organization_id)"
      )
      .eq("projects.organization_id", userProfile.organization_id)
      .order("meeting_date", { ascending: false });

    // A project_id filter is still constrained by the org join above
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

    // Verify user's org and that the project belongs to it
    const { data: userProfile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: projCheck } = await admin
      .from("projects")
      .select("organization_id")
      .eq("id", body.project_id)
      .maybeSingle();

    if (!projCheck || projCheck.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Compute the next free `{meeting_number}` for this project.
    const computeNextNumber = async (): Promise<number> => {
      const { data: lastMeeting } = await admin
        .from("meetings")
        .select("meeting_number")
        .eq("project_id", body.project_id)
        .order("meeting_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      return ((lastMeeting as any)?.meeting_number || 0) + 1;
    };

    // A client-supplied number is validated (integer ≥ 1); a conflict on it is a
    // hard 409 rather than a silent renumber. An auto-computed number races with
    // concurrent creations — the insert loop below retries it against the UNIQUE
    // (project_id, meeting_number) index (migration 114).
    let meetingNumber: number;
    let userProvidedNumber = false;
    if (body.meeting_number !== undefined && body.meeting_number !== null && body.meeting_number !== "") {
      const n = Number(body.meeting_number);
      if (!Number.isInteger(n) || n < 1) {
        return NextResponse.json(
          { error: "meeting_number must be a positive integer" },
          { status: 400 }
        );
      }
      meetingNumber = n;
      userProvidedNumber = true;
    } else {
      meetingNumber = await computeNextNumber();
    }

    // ---- Carry the previous séance's open points forward -------------------
    // A PV that starts from a blank page loses every point that was still
    // hanging: the whole value of a numbered séance series is that nothing
    // falls through between two meetings.
    const { points: carriedPoints, previousMeetingNumber } = await loadPreviousOpenPoints(
      admin,
      body.project_id
    );

    // `manual: true` (bouton "PV manuel") opens the editor on an empty outline
    // instead of waiting for an audio recording.
    const isManual = body.manual === true;
    const { sections: template } = isManual
      ? await loadPVTemplate(admin, userProfile.organization_id)
      : { sections: [] as { titre: string }[] };

    // Rebuilt for the current `num` on each insert attempt: a retry that bumps
    // the séance number must reflect it in the stored point numbers too.
    const buildSeed = (num: number) => {
      const carrySection = buildCarryOverSection(carriedPoints, num);
      const sections: any[] = carrySection ? [carrySection] : [];
      if (isManual) {
        const offset = carrySection ? 1 : 0;
        sections.push(
          ...template.map((tpl, i) => ({
            number: `${num}.${offset + i + 1}`,
            title: tpl.titre,
            content: "",
            decisions: [],
            actions: [],
          }))
        );
      }
      return {
        header: {
          project_name: body.project_name || null,
          project_code: body.project_code || null,
          meeting_number: num,
          date: body.meeting_date,
          location: body.location || null,
          next_meeting_date: null,
          participants: body.participants || [],
        },
        sections,
        summary_fr: "",
      };
    };

    let data: any = null;
    let error: any = null;
    // Insert with retry against the UNIQUE (project_id, meeting_number) index
    // (migration 114). Only an auto-assigned number is renumbered on conflict; a
    // client-supplied duplicate is a 409.
    for (let attempt = 0; attempt < 5; attempt++) {
      const seed = buildSeed(meetingNumber);
      const hasSeed = seed.sections.length > 0;
      const res = await admin
        .from("meetings")
        .insert({
          project_id: body.project_id,
          created_by: user.id,
          title: body.title,
          meeting_number: meetingNumber,
          meeting_date: body.meeting_date,
          location: body.location || null,
          participants: body.participants || [],
          // A manual PV is already in the editor's hands → "review".
          status: isManual ? "review" : "scheduled",
          agenda: [],
          transcription_language: "fr",
          pv_version: 1,
          pv_content: hasSeed ? seed : null,
          sent_to: [],
          audio_retained: false,
        } as any)
        .select()
        .single();

      if (!res.error) {
        data = res.data;
        error = null;
        break;
      }

      // 23505 = unique_violation on (project_id, meeting_number).
      const isConflict = res.error.code === "23505";
      if (isConflict && userProvidedNumber) {
        return NextResponse.json(
          { error: `Une séance n°${meetingNumber} existe déjà pour ce projet.` },
          { status: 409 }
        );
      }
      if (isConflict) {
        meetingNumber = await computeNextNumber();
        error = res.error;
        continue;
      }
      error = res.error;
      break;
    }

    if (error || !data) {
      console.error("[PV Create] Error:", error);
      return NextResponse.json(
        { error: "Failed to create meeting" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      meeting: data,
      carried_points: carriedPoints.length,
      previous_meeting_number: previousMeetingNumber,
    });
  } catch (error) {
    console.error("[PV Create] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
