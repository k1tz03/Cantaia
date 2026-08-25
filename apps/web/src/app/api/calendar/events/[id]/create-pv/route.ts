import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createMeetingForEvent } from "../../create-meeting";

export const maxDuration = 30;

/**
 * POST /api/calendar/events/[id]/create-pv
 *
 * Liaison Calendrier ↔ PV: turn a project-linked meeting event into a
 * `meetings` row (procès-verbal de séance), prefilled with the event's date,
 * title, location and attendees. Returns the meeting id so the client can
 * navigate straight to /pv-chantier/{id}.
 *
 * Idempotent: an event whose slot already has a meeting for the same project
 * at the same instant returns that meeting instead of creating a duplicate.
 */
export async function POST(
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

    const { data: profile } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Virtual events (id "virt:…") are read-only projections of another
    // module — a PV cannot be created from one.
    if (id.startsWith("virt:")) {
      return NextResponse.json(
        { error: "Cet élément provient d'un autre module et ne peut pas générer de PV." },
        { status: 400 }
      );
    }

    // A recurring occurrence carries "<masterId>@<iso>"; the PV belongs to
    // that occurrence's date but the event row is the master.
    const [eventId, occurrenceIso] = id.split("@");

    // IDOR: the event must belong to the caller's organization.
    const { data: event } = await (admin as any)
      .from("calendar_events")
      .select("id, organization_id, project_id, title, start_at, location, event_type")
      .eq("id", eventId)
      .eq("organization_id", profile.organization_id)
      .maybeSingle();

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (!event.project_id) {
      return NextResponse.json(
        { error: "Cet événement n'est rattaché à aucun projet." },
        { status: 400 }
      );
    }

    const meetingDate = occurrenceIso || event.start_at;

    // Already created? Return it rather than piling up PVs. Use limit(1)+order
    // (not maybeSingle): if two meetings already share this (project, date),
    // maybeSingle errors and returns null, which would create yet another
    // duplicate. Destructure {error} so a real query failure surfaces.
    const { data: existingList, error: existingError } = await (admin as any)
      .from("meetings")
      .select("id")
      .eq("project_id", event.project_id)
      .eq("meeting_date", meetingDate)
      .order("created_at", { ascending: true })
      .limit(1);

    if (existingError) {
      console.error(
        "[calendar/events/create-pv] Idempotency lookup failed:",
        existingError.message
      );
      return NextResponse.json(
        { error: "Impossible de créer le PV" },
        { status: 500 }
      );
    }

    const existing = existingList?.[0];
    if (existing?.id) {
      return NextResponse.json({
        success: true,
        meeting_id: existing.id,
        already_existed: true,
      });
    }

    // Carry the calendar attendees over as PV participants.
    const { data: invitations } = await (admin as any)
      .from("calendar_invitations")
      .select("attendee_email, attendee_name, is_organizer")
      .eq("event_id", event.id);

    const participants = (invitations || []).map((inv: any) => ({
      name: inv.attendee_name || inv.attendee_email.split("@")[0],
      email: inv.attendee_email,
      role: inv.is_organizer ? "organisateur" : "participant",
    }));

    const created = await createMeetingForEvent(admin, {
      projectId: event.project_id,
      userId: user.id,
      title: event.title,
      meetingDate,
      location: event.location,
      participants,
    });

    if ("error" in created) {
      console.error("[calendar/events/create-pv] Insert failed:", created.error);
      return NextResponse.json(
        { error: "Impossible de créer le PV" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      meeting_id: created.meetingId,
      already_existed: false,
    });
  } catch (error) {
    console.error("[calendar/events/create-pv] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
