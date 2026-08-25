// ============================================================
// Calendrier ↔ PV — create the `meetings` row for a calendar event
//
// Not a route file (Next.js only routes `route.ts`), colocated with the two
// callers: POST /api/calendar/events (checkbox "préparer un PV") and
// POST /api/calendar/events/[id]/create-pv (button in EventDetailPanel).
//
// Mirrors the insert of POST /api/pv so both paths produce identical rows:
// same defaults, same meeting_number sequence per project.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CreateMeetingForEventInput {
  projectId: string;
  userId: string;
  title: string;
  /** ISO instant — the event's start_at. */
  meetingDate: string;
  location?: string | null;
  /** Attendee emails carried over from the calendar invitations. */
  participants?: Array<{ name?: string; email: string; role?: string }>;
}

export type CreateMeetingResult =
  | { meetingId: string }
  | { error: string };

export async function createMeetingForEvent(
  admin: SupabaseClient,
  input: CreateMeetingForEventInput
): Promise<CreateMeetingResult> {
  try {
    // Next meeting number for this project (same rule as POST /api/pv).
    const { data: lastMeeting } = await (admin as any)
      .from("meetings")
      .select("meeting_number")
      .eq("project_id", input.projectId)
      .order("meeting_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const meetingNumber = ((lastMeeting as any)?.meeting_number || 0) + 1;

    const { data, error } = await (admin as any)
      .from("meetings")
      .insert({
        project_id: input.projectId,
        created_by: input.userId,
        title: input.title,
        meeting_number: meetingNumber,
        meeting_date: input.meetingDate,
        location: input.location || null,
        participants: input.participants || [],
        status: "scheduled",
        agenda: [],
        transcription_language: "fr",
        pv_version: 1,
        sent_to: [],
        audio_retained: false,
      })
      .select("id")
      .single();

    if (error || !data) {
      return { error: error?.message || "Insert failed" };
    }

    return { meetingId: data.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Unknown error" };
  }
}
