import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  fetchExternalMemberCalendar,
  graphDateTimeToUtcIso,
  isPrivateGraphCalendarEvent,
} from "@cantaia/core/calendar";

export const maxDuration = 60;

/**
 * GET /api/calendar/external/events?start=ISO&end=ISO
 *
 * Read the calendars of non-Cantaia members registered in
 * `external_calendars`. These events are NEVER stored: they are fetched live
 * from Microsoft Graph (`/users/{email}/calendarView`) and returned read-only
 * so the team panel can overlay them.
 *
 * Until this route existed, TeamCalendarsPanel could register an external
 * calendar but nothing ever read it — the panel was a list of rows with no
 * effect on the agenda.
 *
 * ICS sources are listed but not fetched (see `unsupported` in the response):
 * pulling an arbitrary URL server-side is an SSRF vector and needs its own
 * allowlist design.
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
    if (!start || !end) {
      return NextResponse.json(
        { error: "start and end query params are required (ISO dates)" },
        { status: 400 }
      );
    }
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

    // Org-scoped list of registered calendars (IDOR).
    const { data: calendars } = await (admin as any)
      .from("external_calendars")
      .select("id, member_email, member_name, source, color, is_active")
      .eq("organization_id", profile.organization_id)
      .eq("is_active", true);

    if (!calendars?.length) {
      return NextResponse.json({ success: true, events: [], unsupported: [] });
    }

    const microsoftCalendars = calendars.filter((c: any) => c.source === "microsoft");
    const unsupported = calendars
      .filter((c: any) => c.source !== "microsoft")
      .map((c: any) => ({
        id: c.id,
        member_email: c.member_email,
        source: c.source,
        reason: "ics_not_supported",
      }));

    if (microsoftCalendars.length === 0) {
      return NextResponse.json({ success: true, events: [], unsupported });
    }

    // Reading another mailbox requires the caller's own Graph token plus
    // tenant-wide admin consent (Calendars.Read). Without it Graph answers
    // 403 and the calendar is reported as errored, not silently empty.
    const tokenResult = await getValidMicrosoftToken(user.id);
    if ("error" in tokenResult) {
      return NextResponse.json({
        success: true,
        events: [],
        unsupported,
        errors: microsoftCalendars.map((c: any) => ({
          id: c.id,
          member_email: c.member_email,
          error: "microsoft_not_connected",
        })),
      });
    }

    const errors: Array<{ id: string; member_email: string; error: string }> = [];
    const events: any[] = [];

    const settled = await Promise.allSettled(
      microsoftCalendars.map(async (cal: any) => {
        const graphEvents = await fetchExternalMemberCalendar(
          tokenResult.accessToken,
          cal.member_email,
          startIso,
          endIso
        );
        return { cal, graphEvents };
      })
    );

    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i];
      const cal = microsoftCalendars[i];

      if (outcome.status === "rejected") {
        const message =
          outcome.reason instanceof Error ? outcome.reason.message : "graph_error";
        errors.push({ id: cal.id, member_email: cal.member_email, error: message });
        await (admin as any)
          .from("external_calendars")
          .update({ sync_error: message.slice(0, 300) })
          .eq("id", cal.id)
          .eq("organization_id", profile.organization_id);
        continue;
      }

      for (const ge of outcome.value.graphEvents) {
        // Never surface a colleague's private/personal entries — only the
        // busy block matters for scheduling.
        const isPrivate = isPrivateGraphCalendarEvent(ge);
        if (ge.isCancelled) continue;

        events.push({
          id: `ext:${cal.id}:${ge.id}`,
          external_calendar_id: cal.id,
          member_email: cal.member_email,
          member_name: cal.member_name,
          title: isPrivate ? "Occupé" : ge.subject || "(Sans objet)",
          start_at: graphDateTimeToUtcIso(ge.start.dateTime, ge.start.timeZone),
          end_at: graphDateTimeToUtcIso(ge.end.dateTime, ge.end.timeZone),
          all_day: ge.isAllDay,
          location: isPrivate ? null : ge.location?.displayName || null,
          is_busy: ge.showAs !== "free",
          color: cal.color,
          readOnly: true,
        });
      }

      await (admin as any)
        .from("external_calendars")
        .update({ last_synced_at: new Date().toISOString(), sync_error: null })
        .eq("id", cal.id)
        .eq("organization_id", profile.organization_id);
    }

    events.sort(
      (a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
    );

    return NextResponse.json({ success: true, events, unsupported, errors });
  } catch (error) {
    console.error("[calendar/external/events] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
