// ============================================================
// Virtual event helpers — shared by AgendaStream, TimelineView and
// EventDetailPanel.
// ============================================================
// GET /api/calendar/events returns two kinds of rows: real `calendar_events`
// and read-only projections of the other modules (submission deadlines, PVs,
// tasks, planning milestones, receptions & guarantees, reserves, client
// visits). The projections carry `readOnly`, `source_type`, `source_id` and a
// `url`, so the UI can badge them and offer "Ouvrir" instead of an editor
// that would have nothing to write to.

import type { CalendarEvent } from "@cantaia/core/calendar";

export interface CalendarEventWithSource extends CalendarEvent {
  readOnly?: boolean;
  source_type?: string | null;
  source_id?: string | null;
  url?: string | null;
}

// i18n-pending: labels listed under `calendar.source*` in i18n-pending/H.json.
export const SOURCE_META: Record<string, { label: string; color: string }> = {
  submission: { label: "Soumission", color: "#EF4444" },
  meeting: { label: "PV", color: "#3B82F6" },
  task: { label: "Tâche", color: "#F59E0B" },
  planning_task: { label: "Planning", color: "#F97316" },
  reception: { label: "Réception", color: "#10B981" },
  guarantee_2y: { label: "Garantie 2 ans", color: "#A855F7" },
  guarantee_5y: { label: "Garantie 5 ans", color: "#A855F7" },
  reserve: { label: "Réserve", color: "#F59E0B" },
  client_visit: { label: "Visite", color: "#10B981" },
  // Live read of a non-Cantaia member's Outlook calendar — never stored.
  external: { label: "Externe", color: "#A855F7" },
};

/**
 * Map a row of GET /api/calendar/external/events onto the CalendarEvent shape
 * the three calendar views consume. External events are read-only and carry
 * no invitations, project or prep.
 */
export function externalEventToCalendarEvent(raw: {
  id: string;
  member_email: string;
  member_name: string | null;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  color: string;
}): CalendarEventWithSource {
  const now = new Date().toISOString();
  return {
    id: raw.id,
    organization_id: "",
    user_id: "",
    project_id: null,
    title: raw.member_name ? `${raw.title} — ${raw.member_name}` : raw.title,
    description: null,
    location: raw.location,
    event_type: "other",
    start_at: raw.start_at,
    end_at: raw.end_at,
    all_day: raw.all_day,
    timezone: "Europe/Zurich",
    recurrence_rule: null,
    recurrence_end: null,
    parent_event_id: null,
    outlook_event_id: null,
    outlook_change_key: null,
    sync_source: "external",
    last_synced_at: now,
    color: raw.color,
    ai_suggested: false,
    ai_prep_status: "none",
    ai_prep_data: null,
    status: "confirmed",
    created_at: now,
    updated_at: now,
    invitations: [],
    project: null,
    readOnly: true,
    source_type: "external",
    source_id: raw.member_email,
    url: null,
  };
}

/** True for a derived row that has no `calendar_events` id behind it. */
export function isVirtualEvent(event: CalendarEvent | null | undefined): boolean {
  if (!event) return false;
  const e = event as CalendarEventWithSource;
  return e.readOnly === true || (typeof e.id === "string" && e.id.startsWith("virt:"));
}

/** True for an occurrence generated from a recurring master ("<id>@<iso>"). */
export function isRecurringOccurrence(event: CalendarEvent | null | undefined): boolean {
  return !!event && typeof event.id === "string" && event.id.includes("@");
}

export function sourceMetaFor(
  event: CalendarEvent | null | undefined
): { label: string; color: string } | null {
  if (!event) return null;
  const sourceType = (event as CalendarEventWithSource).source_type;
  if (!sourceType) return null;
  return SOURCE_META[sourceType] || { label: sourceType, color: "#71717A" };
}

export function sourceUrlFor(event: CalendarEvent | null | undefined): string | null {
  return (event as CalendarEventWithSource | null)?.url ?? null;
}
