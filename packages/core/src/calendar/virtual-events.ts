// ============================================================
// Virtual Calendar Events — the "union des échéances"
// ============================================================
// The calendar hub is not a second inbox: everything that already has a
// date somewhere in Cantaia must show up on the agenda without being
// duplicated into `calendar_events`.
//
// These events are DERIVED at read time from the owning module, are
// org-scoped, read-only, and carry a stable synthetic id
// ("virt:<source_type>:<uuid>") plus a `url` so the UI can offer "Ouvrir".
//
// Sources (7 modules):
//   submissions.deadline               → deadline
//   meetings.meeting_date              → meeting
//   tasks.due_date (open tasks)        → deadline
//   planning_tasks (is_milestone)      → milestone
//   project_receptions.reception_date  → milestone
//   project_receptions.guarantee_*_end → milestone
//   reception_reserves.deadline (open) → deadline
//   client_visits.visit_date+time      → site_visit
//
// Every collector is individually try/caught by the caller: a module whose
// migration has not been applied must never take the whole calendar down.

import type { CalendarEvent, CalendarEventType } from "./types";

// ── Types ──────────────────────────────────────────────────

export type CalendarSourceType =
  | "submission"
  | "meeting"
  | "task"
  | "planning_task"
  | "reception"
  | "guarantee_2y"
  | "guarantee_5y"
  | "reserve"
  | "client_visit";

/**
 * A calendar row derived from another module. Shaped like a CalendarEvent so
 * the existing views can render it untouched, plus three extra fields the UI
 * uses to badge it and link back to the owning module.
 */
export interface VirtualCalendarEvent extends CalendarEvent {
  /** Always true — these rows can never be edited from the calendar. */
  readOnly: true;
  source_type: CalendarSourceType;
  source_id: string;
  /** In-app route (locale-less) to open the origin record. */
  url: string | null;
}

export interface VirtualEventsInput {
  /** Supabase admin client (typed `any` to avoid a circular dep on the app). */
  admin: any;
  orgId: string;
  /** Inclusive window start (ISO instant). */
  startIso: string;
  /** Exclusive window end (ISO instant). */
  endIso: string;
  /** Optional project filter, mirrors GET /api/calendar/events. */
  projectId?: string | null;
}

// ── Helpers ────────────────────────────────────────────────

/** Stable synthetic id. Prefixed so the UI can detect virtual rows cheaply. */
export function virtualEventId(sourceType: CalendarSourceType, sourceId: string): string {
  return `virt:${sourceType}:${sourceId}`;
}

export function isVirtualEventId(id: string): boolean {
  return typeof id === "string" && id.startsWith("virt:");
}

const DEFAULT_TIMEZONE = "Europe/Zurich";

/**
 * A DATE column ("2026-08-24") has no time. Materialise it as an all-day
 * event pinned to the Europe/Zurich day so it lands on the right cell in a
 * browser in any timezone.
 */
function dayBounds(dateOnly: string): { start: string; end: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateOnly || "");
  if (!m) return null;
  // Zurich is UTC+1/+2 — building the instant from the local wall clock keeps
  // the calendar day correct on both sides of the DST switch.
  const start = zurichWallToUtc(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
  const end = zurichWallToUtc(`${m[1]}-${m[2]}-${m[3]}T23:59:00`);
  return { start, end };
}

/**
 * Convert a naive Europe/Zurich wall-clock string to a true UTC instant.
 * Two fixed-point iterations resolve the offset even across a DST boundary.
 */
export function zurichWallToUtc(naive: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(naive);
  if (!m) return new Date(naive).toISOString();
  const wallUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));

  let utc = wallUtc;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(utc));
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    const produced = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      p.hour === "24" ? 0 : Number(p.hour),
      Number(p.minute),
      Number(p.second)
    );
    utc += wallUtc - produced;
  }
  return new Date(utc).toISOString();
}

/** Build a full CalendarEvent-shaped virtual row. */
function makeVirtual(params: {
  sourceType: CalendarSourceType;
  sourceId: string;
  orgId: string;
  projectId: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  eventType: CalendarEventType;
  startAt: string;
  endAt: string;
  allDay: boolean;
  url: string | null;
  color?: string | null;
  project?: { name: string; code: string | null; color: string | null } | null;
}): VirtualCalendarEvent {
  const now = new Date().toISOString();
  return {
    id: virtualEventId(params.sourceType, params.sourceId),
    organization_id: params.orgId,
    // Virtual rows belong to the org, not to a single mailbox.
    user_id: "",
    project_id: params.projectId,
    title: params.title,
    description: params.description ?? null,
    location: params.location ?? null,
    event_type: params.eventType,
    start_at: params.startAt,
    end_at: params.endAt,
    all_day: params.allDay,
    timezone: DEFAULT_TIMEZONE,
    recurrence_rule: null,
    recurrence_end: null,
    parent_event_id: null,
    outlook_event_id: null,
    outlook_change_key: null,
    sync_source: "cantaia",
    last_synced_at: null,
    color: params.color ?? null,
    ai_suggested: false,
    ai_prep_status: "none",
    ai_prep_data: null,
    status: "confirmed",
    created_at: now,
    updated_at: now,
    invitations: [],
    project: params.project ?? null,
    readOnly: true,
    source_type: params.sourceType,
    source_id: params.sourceId,
    url: params.url,
  };
}

/** Keep only rows whose [start,end] actually overlaps the requested window. */
function overlapsWindow(ev: VirtualCalendarEvent, startIso: string, endIso: string): boolean {
  const s = new Date(ev.start_at).getTime();
  const e = new Date(ev.end_at).getTime();
  const ws = new Date(startIso).getTime();
  const we = new Date(endIso).getTime();
  return s < we && e >= ws;
}

/** Date-only bounds of the window, used for DATE column filters. */
function windowDays(startIso: string, endIso: string): { from: string; to: string } {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  return { from: fmt(startIso), to: fmt(endIso) };
}

// ── Main collector ─────────────────────────────────────────

/**
 * Collect every dated record of the org that overlaps the window.
 * Each source is isolated: a failing collector logs and yields nothing.
 */
export async function collectVirtualEvents(
  input: VirtualEventsInput
): Promise<VirtualCalendarEvent[]> {
  const results = await Promise.all([
    safe("submissions", () => collectSubmissionDeadlines(input)),
    safe("meetings", () => collectMeetings(input)),
    safe("tasks", () => collectTaskDeadlines(input)),
    safe("planning", () => collectPlanningMilestones(input)),
    safe("receptions", () => collectReceptions(input)),
    safe("reserves", () => collectReserveDeadlines(input)),
    safe("visits", () => collectClientVisits(input)),
  ]);

  const all = results.flat();
  return all
    .filter((ev) => overlapsWindow(ev, input.startIso, input.endIso))
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
}

async function safe(
  label: string,
  fn: () => Promise<VirtualCalendarEvent[]>
): Promise<VirtualCalendarEvent[]> {
  try {
    return await fn();
  } catch (err) {
    console.warn(
      `[calendar/virtual-events] ${label} collector skipped:`,
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

// ── 1. Submission deadlines ────────────────────────────────

async function collectSubmissionDeadlines(
  input: VirtualEventsInput
): Promise<VirtualCalendarEvent[]> {
  const { admin, orgId, projectId } = input;
  const { from, to } = windowDays(input.startIso, input.endIso);

  let query = admin
    .from("submissions")
    .select("id, title, reference, deadline, status, project_id, projects!inner(name, code, color, organization_id)")
    .eq("projects.organization_id", orgId)
    .not("deadline", "is", null)
    .gte("deadline", from)
    .lte("deadline", to)
    .limit(200);

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const out: VirtualCalendarEvent[] = [];
  for (const s of data || []) {
    const bounds = dayBounds(s.deadline);
    if (!bounds) continue;
    out.push(
      makeVirtual({
        sourceType: "submission",
        sourceId: s.id,
        orgId,
        projectId: s.project_id || null,
        title: s.title || "Soumission",
        description: s.reference ? `Référence ${s.reference}` : null,
        eventType: "deadline",
        startAt: bounds.start,
        endAt: bounds.end,
        allDay: true,
        url: `/submissions/${s.id}`,
        color: "#EF4444",
        project: s.projects
          ? { name: s.projects.name, code: s.projects.code ?? null, color: s.projects.color ?? null }
          : null,
      })
    );
  }
  return out;
}

// ── 2. Meetings (PV) ───────────────────────────────────────

async function collectMeetings(input: VirtualEventsInput): Promise<VirtualCalendarEvent[]> {
  const { admin, orgId, projectId, startIso, endIso } = input;

  let query = admin
    .from("meetings")
    .select("id, title, meeting_number, meeting_date, location, status, project_id, projects!inner(name, code, color, organization_id)")
    .eq("projects.organization_id", orgId)
    .gte("meeting_date", startIso)
    .lte("meeting_date", endIso)
    .limit(200);

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const out: VirtualCalendarEvent[] = [];
  for (const m of data || []) {
    const start = new Date(m.meeting_date);
    if (isNaN(start.getTime())) continue;
    // meetings has no duration column — 2h is the usual site-meeting slot.
    const end = new Date(start.getTime() + 2 * 3600_000);
    out.push(
      makeVirtual({
        sourceType: "meeting",
        sourceId: m.id,
        orgId,
        projectId: m.project_id || null,
        title: m.meeting_number ? `PV n°${m.meeting_number} — ${m.title}` : m.title || "Séance",
        location: m.location || null,
        eventType: "meeting",
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        allDay: false,
        url: `/pv-chantier/${m.id}`,
        color: "#3B82F6",
        project: m.projects
          ? { name: m.projects.name, code: m.projects.code ?? null, color: m.projects.color ?? null }
          : null,
      })
    );
  }
  return out;
}

// ── 3. Open task due dates ─────────────────────────────────

async function collectTaskDeadlines(
  input: VirtualEventsInput
): Promise<VirtualCalendarEvent[]> {
  const { admin, orgId, projectId } = input;
  const { from, to } = windowDays(input.startIso, input.endIso);

  let query = admin
    .from("tasks")
    .select("id, title, due_date, status, priority, lot_code, project_id, projects!inner(name, code, color, organization_id)")
    .eq("projects.organization_id", orgId)
    .in("status", ["todo", "in_progress", "waiting"])
    .not("due_date", "is", null)
    .gte("due_date", from)
    .lte("due_date", to)
    .limit(300);

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const out: VirtualCalendarEvent[] = [];
  for (const t of data || []) {
    const bounds = dayBounds(t.due_date);
    if (!bounds) continue;
    out.push(
      makeVirtual({
        sourceType: "task",
        sourceId: t.id,
        orgId,
        projectId: t.project_id || null,
        title: t.title || "Tâche",
        description: t.lot_code ? `Lot ${t.lot_code}` : null,
        eventType: "deadline",
        startAt: bounds.start,
        endAt: bounds.end,
        allDay: true,
        url: `/tasks?task=${t.id}`,
        color: t.priority === "urgent" ? "#EF4444" : "#F59E0B",
        project: t.projects
          ? { name: t.projects.name, code: t.projects.code ?? null, color: t.projects.color ?? null }
          : null,
      })
    );
  }
  return out;
}

// ── 4. Planning milestones ─────────────────────────────────

async function collectPlanningMilestones(
  input: VirtualEventsInput
): Promise<VirtualCalendarEvent[]> {
  const { admin, orgId, projectId } = input;
  const { from, to } = windowDays(input.startIso, input.endIso);

  let query = admin
    .from("planning_tasks")
    .select("id, name, cfc_code, start_date, end_date, is_milestone, color, planning_id, project_plannings!inner(id, project_id, organization_id, projects!inner(name, code, color))")
    .eq("project_plannings.organization_id", orgId)
    .eq("is_milestone", true)
    .gte("start_date", from)
    .lte("start_date", to)
    .limit(200);

  if (projectId) query = query.eq("project_plannings.project_id", projectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const out: VirtualCalendarEvent[] = [];
  for (const pt of data || []) {
    const bounds = dayBounds(pt.start_date);
    if (!bounds) continue;
    const planning = pt.project_plannings;
    out.push(
      makeVirtual({
        sourceType: "planning_task",
        sourceId: pt.id,
        orgId,
        projectId: planning?.project_id || null,
        title: pt.name || "Jalon",
        description: pt.cfc_code ? `CFC ${pt.cfc_code}` : null,
        eventType: "milestone",
        startAt: bounds.start,
        endAt: bounds.end,
        allDay: true,
        url: planning?.project_id ? `/projects/${planning.project_id}/planning` : null,
        color: pt.color || "#F97316",
        project: planning?.projects
          ? {
              name: planning.projects.name,
              code: planning.projects.code ?? null,
              color: planning.projects.color ?? null,
            }
          : null,
      })
    );
  }
  return out;
}

// ── 5. Receptions + guarantee expiries ─────────────────────

async function collectReceptions(
  input: VirtualEventsInput
): Promise<VirtualCalendarEvent[]> {
  const { admin, orgId, projectId } = input;
  const { from, to } = windowDays(input.startIso, input.endIso);

  let query = admin
    .from("project_receptions")
    .select("id, project_id, reception_type, reception_date, reception_location, status, guarantee_2y_end, guarantee_5y_end, projects(name, code, color)")
    .eq("organization_id", orgId)
    .limit(200);

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const typeLabel: Record<string, string> = {
    provisional: "Réception provisoire",
    final: "Réception définitive",
    partial: "Réception partielle",
  };

  const out: VirtualCalendarEvent[] = [];
  for (const r of data || []) {
    const project = r.projects
      ? { name: r.projects.name, code: r.projects.code ?? null, color: r.projects.color ?? null }
      : null;
    const url = r.project_id ? `/projects/${r.project_id}/closure` : null;

    // 5a. The reception itself
    if (r.reception_date && r.reception_date >= from && r.reception_date <= to) {
      const bounds = dayBounds(r.reception_date);
      if (bounds) {
        out.push(
          makeVirtual({
            sourceType: "reception",
            sourceId: r.id,
            orgId,
            projectId: r.project_id || null,
            title: typeLabel[r.reception_type] || "Réception",
            location: r.reception_location || null,
            eventType: "milestone",
            startAt: bounds.start,
            endAt: bounds.end,
            allDay: true,
            url,
            color: "#10B981",
            project,
          })
        );
      }
    }

    // 5b/5c. Guarantee expiries (SIA 118 — 2 and 5 years)
    for (const [field, sourceType, label] of [
      ["guarantee_2y_end", "guarantee_2y", "Fin de garantie 2 ans"],
      ["guarantee_5y_end", "guarantee_5y", "Fin de garantie 5 ans"],
    ] as Array<[string, CalendarSourceType, string]>) {
      const value = r[field];
      if (!value || value < from || value > to) continue;
      const bounds = dayBounds(value);
      if (!bounds) continue;
      out.push(
        makeVirtual({
          sourceType,
          sourceId: r.id,
          orgId,
          projectId: r.project_id || null,
          title: label,
          eventType: "milestone",
          startAt: bounds.start,
          endAt: bounds.end,
          allDay: true,
          url,
          color: "#A855F7",
          project,
        })
      );
    }
  }
  return out;
}

// ── 6. Open reserve deadlines ──────────────────────────────

async function collectReserveDeadlines(
  input: VirtualEventsInput
): Promise<VirtualCalendarEvent[]> {
  const { admin, orgId, projectId } = input;
  const { from, to } = windowDays(input.startIso, input.endIso);

  let query = admin
    .from("reception_reserves")
    .select("id, description, location, severity, status, deadline, project_id, projects(name, code, color)")
    .eq("organization_id", orgId)
    .in("status", ["open", "in_progress", "disputed"])
    .not("deadline", "is", null)
    .gte("deadline", from)
    .lte("deadline", to)
    .limit(200);

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const out: VirtualCalendarEvent[] = [];
  for (const r of data || []) {
    const bounds = dayBounds(r.deadline);
    if (!bounds) continue;
    const description = (r.description || "Réserve").slice(0, 120);
    out.push(
      makeVirtual({
        sourceType: "reserve",
        sourceId: r.id,
        orgId,
        projectId: r.project_id || null,
        title: `Réserve — ${description}`,
        description: r.severity ? `Sévérité : ${r.severity}` : null,
        location: r.location || null,
        eventType: "deadline",
        startAt: bounds.start,
        endAt: bounds.end,
        allDay: true,
        url: r.project_id ? `/projects/${r.project_id}/reserves` : null,
        color: r.severity === "blocking" ? "#EF4444" : "#F59E0B",
        project: r.projects
          ? { name: r.projects.name, code: r.projects.code ?? null, color: r.projects.color ?? null }
          : null,
      })
    );
  }
  return out;
}

// ── 7. Client visits ───────────────────────────────────────

async function collectClientVisits(
  input: VirtualEventsInput
): Promise<VirtualCalendarEvent[]> {
  const { admin, orgId, projectId } = input;
  const { from, to } = windowDays(input.startIso, input.endIso);

  let query = admin
    .from("client_visits")
    .select("id, title, client_name, client_company, client_address, client_city, visit_date, visit_time, duration_minutes, project_id, projects(name, code, color)")
    .eq("organization_id", orgId)
    .not("visit_date", "is", null)
    .gte("visit_date", from)
    .lte("visit_date", to)
    .limit(200);

  if (projectId) query = query.eq("project_id", projectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const out: VirtualCalendarEvent[] = [];
  for (const v of data || []) {
    let startAt: string;
    let endAt: string;
    let allDay: boolean;

    if (v.visit_time) {
      // TIME column → "14:30:00"
      const hhmm = String(v.visit_time).slice(0, 5);
      startAt = zurichWallToUtc(`${v.visit_date}T${hhmm}:00`);
      const durationMs = (Number(v.duration_minutes) || 60) * 60_000;
      endAt = new Date(new Date(startAt).getTime() + durationMs).toISOString();
      allDay = false;
    } else {
      const bounds = dayBounds(v.visit_date);
      if (!bounds) continue;
      startAt = bounds.start;
      endAt = bounds.end;
      allDay = true;
    }

    const locationParts = [v.client_address, v.client_city].filter(Boolean);
    out.push(
      makeVirtual({
        sourceType: "client_visit",
        sourceId: v.id,
        orgId,
        projectId: v.project_id || null,
        title: v.title || `Visite — ${v.client_name || v.client_company || "client"}`,
        description: v.client_company || null,
        location: locationParts.length ? locationParts.join(", ") : null,
        eventType: "site_visit",
        startAt,
        endAt,
        allDay,
        url: `/visits/${v.id}`,
        color: "#10B981",
        project: v.projects
          ? { name: v.projects.name, code: v.projects.code ?? null, color: v.projects.color ?? null }
          : null,
      })
    );
  }
  return out;
}
