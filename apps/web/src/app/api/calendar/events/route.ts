import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { createGraphCalendarEvent } from "@cantaia/core/calendar";

export const maxDuration = 60;

/**
 * GET /api/calendar/events
 * List calendar events for the user's org.
 * Query params: start (ISO), end (ISO), project_id?, user_id?, event_type?
 */
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

    // Get user profile + org
    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const start = searchParams.get("start");
    const end = searchParams.get("end");
    const projectId = searchParams.get("project_id");
    const filterUserId = searchParams.get("user_id");
    const eventType = searchParams.get("event_type");

    if (!start || !end) {
      return NextResponse.json(
        { error: "start and end query params are required (ISO dates)" },
        { status: 400 }
      );
    }

    // Query calendar events with org IDOR protection
    let query = (admin as any)
      .from("calendar_events")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .gte("start_at", start)
      .lte("start_at", end)
      .neq("status", "cancelled")
      .order("start_at", { ascending: true });

    if (projectId) {
      query = query.eq("project_id", projectId);
    }
    if (filterUserId) {
      query = query.eq("user_id", filterUserId);
    }
    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("[calendar/events] List error:", error);
      return NextResponse.json(
        { error: "Failed to fetch events" },
        { status: 500 }
      );
    }

    // Fetch invitations for all events
    const eventIds = (events || []).map((e: any) => e.id);
    let invitationsMap: Record<string, any[]> = {};

    if (eventIds.length > 0) {
      const { data: invitations } = await (admin as any)
        .from("calendar_invitations")
        .select("*")
        .in("event_id", eventIds);

      if (invitations) {
        for (const inv of invitations) {
          const list = invitationsMap[inv.event_id] || [];
          list.push(inv);
          invitationsMap[inv.event_id] = list;
        }
      }
    }

    // Enrich events with invitations + project info
    const projectIds: string[] = Array.from(
      new Set(
        (events || [])
          .map((e: any) => e.project_id)
          .filter(Boolean)
      )
    );
    let projectsMap: Record<string, any> = {};

    if (projectIds.length > 0) {
      const { data: projects } = await admin
        .from("projects")
        .select("id, name, code, color")
        .in("id", projectIds);

      if (projects) {
        for (const p of projects) {
          projectsMap[p.id] = p;
        }
      }
    }

    const enriched = (events || []).map((e: any) => ({
      ...e,
      invitations: invitationsMap[e.id] || [],
      project: e.project_id ? projectsMap[e.project_id] || null : null,
    }));

    return NextResponse.json({ success: true, events: enriched });
  } catch (error) {
    console.error("[calendar/events] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/calendar/events
 * Create a new calendar event.
 * Body: title, start_at, end_at, event_type?, project_id?, location?,
 *       description?, is_all_day?, recurrence_rule?, attendees?: [{email, name}]
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

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      start_at,
      end_at,
      event_type,
      project_id,
      location,
      description,
      is_all_day,
      recurrence_rule,
      attendees,
      sync_to_outlook,
    } = body;

    // Validation
    if (!title?.trim()) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }
    if (!start_at || !end_at) {
      return NextResponse.json(
        { error: "start_at and end_at are required" },
        { status: 400 }
      );
    }

    // Verify project belongs to org if provided
    if (project_id) {
      const { data: project } = await admin
        .from("projects")
        .select("id, organization_id")
        .eq("id", project_id)
        .single();

      if (!project || project.organization_id !== profile.organization_id) {
        return NextResponse.json(
          { error: "Project not found or not in your organization" },
          { status: 403 }
        );
      }
    }

    // Push to Microsoft Graph if user has Microsoft connected and sync_to_outlook !== false
    let outlookEventId: string | null = null;
    let outlookChangeKey: string | null = null;

    if (sync_to_outlook !== false) {
      try {
        const tokenResult = await getValidMicrosoftToken(user.id);
        if (!("error" in tokenResult)) {
          const graphResult = await createGraphCalendarEvent(
            tokenResult.accessToken,
            {
              title: title.trim(),
              start_at,
              end_at,
              description: description || undefined,
              location: location || undefined,
              all_day: is_all_day || false,
              event_type: event_type || "meeting",
              attendees: attendees || [],
            }
          );
          outlookEventId = graphResult.outlookEventId;
          outlookChangeKey = graphResult.changeKey;
        }
      } catch (graphErr) {
        // Non-fatal: event still saved locally
        console.error("[calendar/events] Graph push failed (non-fatal):", graphErr);
      }
    }

    // Insert calendar event
    const { data: event, error: eventError } = await (admin as any)
      .from("calendar_events")
      .insert({
        organization_id: profile.organization_id,
        user_id: user.id,
        project_id: project_id || null,
        title: title.trim(),
        description: description || null,
        location: location || null,
        event_type: event_type || "meeting",
        start_at,
        end_at,
        all_day: is_all_day || false,
        timezone: "Europe/Zurich",
        recurrence_rule: recurrence_rule || null,
        recurrence_end: null,
        parent_event_id: null,
        outlook_event_id: outlookEventId,
        outlook_change_key: outlookChangeKey,
        sync_source: "cantaia",
        last_synced_at: outlookEventId ? new Date().toISOString() : null,
        color: null,
        ai_suggested: false,
        ai_prep_status: "none",
        ai_prep_data: null,
        status: "confirmed",
      })
      .select()
      .single();

    if (eventError || !event) {
      console.error("[calendar/events] Insert error:", eventError);
      return NextResponse.json(
        { error: "Failed to create event" },
        { status: 500 }
      );
    }

    // Insert invitations
    if (attendees?.length) {
      const invitationRows = attendees.map(
        (a: { email: string; name?: string }) => ({
          event_id: event.id,
          attendee_email: a.email.toLowerCase(),
          attendee_name: a.name || null,
          attendee_user_id: null, // resolved later
          response_status: "pending",
          is_organizer: false,
          notified_at: null,
          responded_at: null,
        })
      );

      // Add organizer
      invitationRows.unshift({
        event_id: event.id,
        attendee_email: user.email!.toLowerCase(),
        attendee_name: null,
        attendee_user_id: user.id,
        response_status: "accepted",
        is_organizer: true,
        notified_at: null,
        responded_at: null,
      });

      const { error: invError } = await (admin as any)
        .from("calendar_invitations")
        .insert(invitationRows);

      if (invError) {
        console.error("[calendar/events] Insert invitations error:", invError);
        // Non-fatal: event was created
      }

      // Try to resolve attendee user IDs from org members
      const attendeeEmails = attendees.map((a: { email: string }) =>
        a.email.toLowerCase()
      );
      const { data: orgMembers } = await admin
        .from("users")
        .select("id, email")
        .eq("organization_id", profile.organization_id)
        .in("email", attendeeEmails);

      if (orgMembers?.length) {
        for (const member of orgMembers) {
          await (admin as any)
            .from("calendar_invitations")
            .update({ attendee_user_id: member.id })
            .eq("event_id", event.id)
            .eq("attendee_email", member.email.toLowerCase());
        }
      }
    }

    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (error) {
    console.error("[calendar/events] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
