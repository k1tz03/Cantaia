import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  createGraphCalendarEvent,
  collectVirtualEvents,
  expandRecurringEvents,
  shouldQueuePrep,
} from "@cantaia/core/calendar";
import { createMeetingForEvent } from "./create-meeting";

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

    // Validate + normalize to safe ISO strings (also sanitizes the values
    // interpolated into the PostgREST .or() filter below)
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: "start and end must be valid ISO dates" },
        { status: 400 }
      );
    }
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    // Query calendar events with org IDOR protection.
    // CAL.M2: proper overlap test (start_at < end AND coalesce(end_at, start_at) >= start)
    // so multi-day events spanning the range boundary are included.
    let query = (admin as any)
      .from("calendar_events")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .lt("start_at", endIso)
      .or(`end_at.gt.${startIso},and(end_at.is.null,start_at.gte.${startIso})`)
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

    // CAL — Recurring masters store the start/end of their FIRST occurrence.
    // A weekly meeting created in June has end_at in June, so the overlap
    // filter above never returns it for an August window and none of its
    // occurrences would ever appear. Fetch the masters of any series that
    // starts before the window end and has not ended before the window start,
    // then merge them (deduped) so expandRecurringEvents can generate the
    // occurrences that fall inside the window.
    let recurringQuery = (admin as any)
      .from("calendar_events")
      .select("*")
      .eq("organization_id", profile.organization_id)
      .not("recurrence_rule", "is", null)
      .lt("start_at", endIso)
      .or(`recurrence_end.is.null,recurrence_end.gte.${startIso}`)
      .neq("status", "cancelled");

    if (projectId) recurringQuery = recurringQuery.eq("project_id", projectId);
    if (filterUserId) recurringQuery = recurringQuery.eq("user_id", filterUserId);
    if (eventType) recurringQuery = recurringQuery.eq("event_type", eventType);

    const { data: recurringMasters, error: recurringError } =
      await recurringQuery;
    if (recurringError) {
      console.error(
        "[calendar/events] Recurring masters error:",
        recurringError
      );
    }

    const mergedEvents: any[] = [...(events || [])];
    if (recurringMasters?.length) {
      const seen = new Set(mergedEvents.map((e: any) => e.id));
      for (const master of recurringMasters) {
        if (!seen.has(master.id)) {
          mergedEvents.push(master);
          seen.add(master.id);
        }
      }
    }

    // Fetch invitations for all events
    const eventIds = mergedEvents.map((e: any) => e.id);
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
        mergedEvents
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

    const enriched = mergedEvents.map((e: any) => ({
      ...e,
      invitations: invitationsMap[e.id] || [],
      project: e.project_id ? projectsMap[e.project_id] || null : null,
      readOnly: false,
      source_type: e.source_type ?? null,
      source_id: e.source_id ?? null,
    }));

    // CAL — recurring events used to be returned as a single master row, so a
    // weekly site meeting appeared once per month instead of once per week.
    // Simple DAILY/WEEKLY/MONTHLY rules are expanded over the window.
    const expanded = expandRecurringEvents(enriched as any, startDate, endDate);

    // ── Union des échéances ───────────────────────────────────
    // Everything already dated elsewhere in Cantaia (submission deadlines,
    // PVs, tasks, planning milestones, receptions & guarantees, reserves,
    // client visits) is derived live and merged in as read-only rows.
    // Never fatal: a missing module degrades to "no virtual events".
    let virtualEvents: any[] = [];
    if (searchParams.get("include_sources") !== "false") {
      try {
        virtualEvents = await collectVirtualEvents({
          admin,
          orgId: profile.organization_id,
          startIso,
          endIso,
          projectId,
        });
      } catch (virtErr) {
        console.error("[calendar/events] Virtual events failed:", virtErr);
      }

      // A promoted event (migration 096: source_type/source_id) already
      // occupies the agenda — drop its virtual twin.
      const promoted = new Set(
        enriched
          .filter((e: any) => e.source_type && e.source_id)
          .map((e: any) => `${e.source_type}:${e.source_id}`)
      );
      if (promoted.size > 0) {
        virtualEvents = virtualEvents.filter(
          (v) => !promoted.has(`${v.source_type}:${v.source_id}`)
        );
      }

      if (eventType) {
        virtualEvents = virtualEvents.filter((v) => v.event_type === eventType);
      }
      // A virtual event has no owner mailbox, so a user filter excludes them.
      if (filterUserId) virtualEvents = [];
    }

    const all = [...expanded, ...virtualEvents].sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );

    return NextResponse.json({
      success: true,
      events: all,
      counts: {
        calendar: expanded.length,
        derived: virtualEvents.length,
      },
    });
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
      recurrence_end,
      attendees,
      sync_to_outlook,
      /** Create the matching `meetings` row (PV de séance) — see §4. */
      create_pv,
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
              // CAL: the RRULE used to be dropped here, so a recurring
              // Cantaia event became a one-off in Outlook.
              recurrence_rule: recurrence_rule || undefined,
              recurrence_end: recurrence_end || undefined,
              timezone: "Europe/Zurich",
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
        recurrence_end: recurrence_end || null,
        parent_event_id: null,
        outlook_event_id: outlookEventId,
        outlook_change_key: outlookChangeKey,
        sync_source: "cantaia",
        last_synced_at: outlookEventId ? new Date().toISOString() : null,
        color: null,
        ai_suggested: false,
        // AGT — this is the trigger the meeting-prep agent was waiting for.
        // Its selector filters on ai_prep_status='pending', a value nothing
        // ever set, so the agent had no work and its schedule was removed.
        ai_prep_status: shouldQueuePrep({
          eventType: event_type || "meeting",
          projectId: project_id || null,
          startAt: start_at,
          currentStatus: "none",
          now: Date.now(),
        })
          ? "pending"
          : "none",
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

    // ── Optional: create the PV de séance alongside the event ──
    // Liaison Calendrier ↔ PV: a project-linked meeting can spawn its
    // `meetings` row directly, prefilled with the event's date and title.
    let pvMeetingId: string | null = null;
    if (create_pv && project_id && (event_type || "meeting") === "meeting") {
      const created = await createMeetingForEvent(admin, {
        projectId: project_id,
        userId: user.id,
        title: title.trim(),
        meetingDate: start_at,
        location: location || null,
      });
      if ("error" in created) {
        console.error("[calendar/events] PV creation failed (non-fatal):", created.error);
      } else {
        pvMeetingId = created.meetingId;
      }
    }

    return NextResponse.json(
      { success: true, event, pv_meeting_id: pvMeetingId },
      { status: 201 }
    );
  } catch (error) {
    console.error("[calendar/events] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
