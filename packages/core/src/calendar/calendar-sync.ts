// ============================================================
// Calendar Sync — Microsoft Graph Calendar bidirectional sync
// ============================================================
// Uses Microsoft Graph API to sync calendar events between
// Cantaia and Outlook/Microsoft 365.
// Dependency-injected: accessToken and DB client passed in.

import type {
  CalendarEvent,
  CreateCalendarEventDTO,
  CalendarSyncSource,
} from "./types";
import { rruleToGraphRecurrence } from "./recurrence";

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

// ── Graph API Types ────────────────────────────────────────

interface GraphCalendarEvent {
  id: string;
  subject: string;
  body?: { contentType: string; content: string };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  location?: { displayName: string };
  isAllDay: boolean;
  isCancelled: boolean;
  showAs: string;
  importance: string;
  sensitivity: string;
  categories: string[];
  attendees?: Array<{
    emailAddress: { name: string; address: string };
    status: { response: string };
    type: string;
  }>;
  organizer?: {
    emailAddress: { name: string; address: string };
  };
  recurrence?: {
    pattern: { type: string; interval: number; daysOfWeek?: string[] };
    range: { type: string; startDate: string; endDate?: string };
  };
  changeKey: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

/**
 * A row returned by /me/calendarView/delta for an event that no longer
 * belongs to the window (deleted, moved out, or cancelled). Only `id` and
 * `@removed` are present.
 */
interface GraphRemovedEvent {
  id: string;
  "@removed": { reason?: string };
}

type GraphDeltaRow = GraphCalendarEvent | GraphRemovedEvent;

function isRemovedRow(row: GraphDeltaRow): row is GraphRemovedEvent {
  return "@removed" in row && !!(row as GraphRemovedEvent)["@removed"];
}

interface GraphCalendarResponse {
  value: GraphDeltaRow[];
  "@odata.deltaLink"?: string;
  "@odata.nextLink"?: string;
}

// ── Graph Fetch Helper ─────────────────────────────────────

async function graphCalendarFetch<T>(
  accessToken: string,
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const fullUrl = url.startsWith("http") ? url : `${GRAPH_BASE_URL}${url}`;

  const response = await fetch(fullUrl, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    if (response.status === 401) {
      throw new GraphCalendarTokenExpiredError("Calendar token expired");
    }
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new GraphCalendarRateLimitError(
        `Rate limited, retry after ${retryAfter}s`,
        Number(retryAfter) || 60
      );
    }
    // Graph invalidates delta tokens (410 Gone / syncStateNotFound). The
    // caller must drop the stored deltaLink and replay the full window.
    if (response.status === 410 || /resyncRequired|syncStateNotFound/i.test(errorText)) {
      throw new GraphCalendarResyncRequiredError(
        "Delta token expired — full resync required"
      );
    }
    throw new Error(`Graph Calendar API error ${response.status}: ${errorText}`);
  }

  if (response.status === 204) return {} as T;
  return response.json();
}

export class GraphCalendarTokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphCalendarTokenExpiredError";
  }
}

export class GraphCalendarResyncRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphCalendarResyncRequiredError";
  }
}

export class GraphCalendarRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = "GraphCalendarRateLimitError";
    this.retryAfterSeconds = retryAfter;
  }
}

// ── Timezone Helpers (CAL.C1) ──────────────────────────────
// Product timezone is Europe/Zurich. The DB stores timestamptz (UTC
// instants); Microsoft Graph expects/returns WALL-CLOCK dateTimes paired
// with a `timeZone` field (no offset in the string). These helpers convert
// between the two representations without shifting the actual instant.

const DEFAULT_TIMEZONE = "Europe/Zurich";

/** Common Windows timezone names → IANA (Graph may return either form). */
const WINDOWS_TO_IANA: Record<string, string> = {
  "W. Europe Standard Time": "Europe/Zurich",
  "Central Europe Standard Time": "Europe/Zurich",
  "Central European Standard Time": "Europe/Warsaw",
  "Romance Standard Time": "Europe/Paris",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "UTC",
  "E. Europe Standard Time": "Europe/Bucharest",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
};

/** Resolve to a usable IANA zone, or null when the zone is UTC/unknown. */
function resolveIanaTimeZone(timeZone: string | undefined): string | null {
  if (!timeZone || timeZone.toUpperCase() === "UTC") return null;
  const mapped = WINDOWS_TO_IANA[timeZone] || timeZone;
  try {
    // Throws RangeError on invalid IANA names
    new Intl.DateTimeFormat("en-US", { timeZone: mapped });
    return mapped;
  } catch {
    return null;
  }
}

/** Wall-clock parts of a UTC instant in a given IANA zone. */
function getWallParts(utcMs: number, ianaZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ianaZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  return {
    y: Number(parts.year),
    mo: Number(parts.month),
    d: Number(parts.day),
    h: parts.hour === "24" ? 0 : Number(parts.hour),
    mi: Number(parts.minute),
    s: Number(parts.second),
  };
}

const HAS_OFFSET_RE = /Z$|[+-]\d{2}:?\d{2}$/;

/**
 * Convert a Graph dateTime (wall time expressed in `timeZone`, no offset,
 * e.g. "2026-08-24T14:00:00.0000000" + "UTC") to a UTC ISO string suitable
 * for a Postgres timestamptz column.
 */
export function graphDateTimeToUtcIso(
  dateTime: string,
  timeZone: string | undefined
): string {
  // Already carries an explicit offset or Z → trust it
  if (HAS_OFFSET_RE.test(dateTime)) {
    const d = new Date(dateTime);
    return isNaN(d.getTime()) ? dateTime : d.toISOString();
  }
  // Strip Graph's 7-digit fractional seconds for parsing
  const clean = dateTime.replace(/(\.\d{3})\d+$/, "$1");
  const m = clean.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) {
    const d = new Date(`${clean}Z`);
    return isNaN(d.getTime()) ? dateTime : d.toISOString();
  }
  const wallUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));

  const iana = resolveIanaTimeZone(timeZone);
  if (!iana) {
    // Zone is UTC (Graph default) or unknown → the wall time IS UTC
    return new Date(wallUtc).toISOString();
  }

  // Fixed-point iteration: find the UTC instant whose wall time in `iana`
  // matches the input (handles DST offsets correctly)
  let utc = wallUtc;
  for (let i = 0; i < 2; i++) {
    const wp = getWallParts(utc, iana);
    const produced = Date.UTC(wp.y, wp.mo - 1, wp.d, wp.h, wp.mi, wp.s);
    utc += wallUtc - produced;
  }
  return new Date(utc).toISOString();
}

/**
 * Convert an ISO timestamp (with offset or Z, e.g. "2026-08-24T12:00:00+00:00"
 * from the DB) to the wall-clock "YYYY-MM-DDTHH:mm:ss" string in `timeZone`
 * that the Graph API expects next to its `timeZone` field.
 * A naive input (no offset) is treated as already-local and passed through.
 */
export function toGraphDateTime(
  iso: string,
  timeZone: string = DEFAULT_TIMEZONE
): string {
  if (!HAS_OFFSET_RE.test(iso)) {
    // Naive local datetime — normalize to seconds precision
    const m = iso.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    return m ? `${m[1]}T${m[2]}:${m[3]}:${m[4] || "00"}` : iso;
  }
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  const iana = resolveIanaTimeZone(timeZone) || "UTC";
  const wp = getWallParts(date.getTime(), iana);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${wp.y}-${pad(wp.mo)}-${pad(wp.d)}T${pad(wp.h)}:${pad(wp.mi)}:${pad(wp.s)}`;
}

/**
 * CAL.H1 — Private/confidential Outlook events must never be imported into
 * the org-visible calendar_events table.
 *
 * Graph's `sensitivity` enum is normal | personal | private | confidential.
 * `personal` was missing: an event a user marked "Personal" in Outlook was
 * imported and shown to the whole organization.
 */
export function isPrivateGraphCalendarEvent(event: {
  sensitivity?: string;
}): boolean {
  return (
    event.sensitivity === "personal" ||
    event.sensitivity === "private" ||
    event.sensitivity === "confidential"
  );
}

// ── Sync: Import from Graph ────────────────────────────────

const CALENDAR_SELECT =
  "id,subject,body,start,end,location,isAllDay,isCancelled,showAs,importance,sensitivity,attendees,organizer,recurrence,changeKey,createdDateTime,lastModifiedDateTime";

export interface GraphCalendarFetchResult {
  events: GraphCalendarEvent[];
  /** Outlook ids that left the window (deleted / moved out / cancelled). */
  removedIds: string[];
  /** Token for the next incremental run, when Graph provided one. */
  deltaLink: string | null;
}

/**
 * Fetch calendar changes from Microsoft Graph using the **delta** endpoint.
 *
 * Previous behaviour was broken in two ways:
 *   • the initial call hit `/me/calendarView`, which never returns an
 *     `@odata.deltaLink` — so every run was a full re-import of 18 months;
 *   • deletions were invisible, so an event cancelled in Outlook stayed on
 *     the Cantaia calendar forever.
 *
 * `/me/calendarView/delta` requires startDateTime/endDateTime on the FIRST
 * call only; the returned deltaLink already carries the window, so it must
 * be used verbatim. Paging uses `@odata.nextLink` until the final page
 * carries `@odata.deltaLink`.
 */
export async function fetchGraphCalendarEvents(
  accessToken: string,
  options: {
    deltaLink?: string;
    startDate?: string;  // ISO instant
    endDate?: string;    // ISO instant
    /** Safety valve so a huge mailbox cannot run past the function budget. */
    maxPages?: number;
  }
): Promise<GraphCalendarFetchResult> {
  const allEvents: GraphCalendarEvent[] = [];
  const removedIds: string[] = [];
  let deltaLink: string | null = null;
  const maxPages = options.maxPages ?? 25;

  let url: string;
  if (options.deltaLink) {
    // The delta link is opaque and already encodes the window + state.
    url = options.deltaLink;
  } else {
    const start =
      options.startDate || new Date(Date.now() - 180 * 86400000).toISOString();
    const end =
      options.endDate || new Date(Date.now() + 365 * 86400000).toISOString();
    url =
      `/me/calendarView/delta?startDateTime=${encodeURIComponent(start)}` +
      `&endDateTime=${encodeURIComponent(end)}&$select=${CALENDAR_SELECT}`;
  }

  let pages = 0;
  let nextUrl: string | null = url;

  while (nextUrl && pages < maxPages) {
    const data: GraphCalendarResponse =
      await graphCalendarFetch<GraphCalendarResponse>(accessToken, nextUrl, {
        // The delta endpoint rejects $top; page size is negotiated by header.
        headers: { Prefer: "odata.maxpagesize=100" },
      });

    for (const row of data.value || []) {
      if (isRemovedRow(row)) {
        // Graph uses `@removed` for two different things: the event was
        // DELETED, or it merely moved out of the requested window
        // ("changed"). Only a deletion may remove the local copy — treating
        // a reschedule past the window as a deletion would silently drop a
        // real appointment. Graph omits `reason` on plain deletions.
        const reason = row["@removed"]?.reason;
        if (!reason || reason === "deleted") {
          if (row.id) removedIds.push(row.id);
        }
      } else {
        allEvents.push(row);
      }
    }

    deltaLink = data["@odata.deltaLink"] || deltaLink;
    nextUrl = data["@odata.nextLink"] || null;
    pages++;
  }

  if (nextUrl) {
    // Stopped on the page cap: keep the OLD delta link (do not persist a
    // partial one) so the next run resumes instead of skipping changes.
    console.warn(
      `[calendar-sync] Delta paging hit the ${maxPages}-page cap — deltaLink not advanced.`
    );
    deltaLink = null;
  }

  return { events: allEvents, removedIds, deltaLink };
}

/**
 * Full-window read WITHOUT delta state. Used for external (other member)
 * calendars and as a recovery path when a delta token is rejected.
 */
export async function fetchGraphCalendarWindow(
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<GraphCalendarEvent[]> {
  const events: GraphCalendarEvent[] = [];
  let nextUrl: string | null =
    `/me/calendarView?startDateTime=${encodeURIComponent(startDate)}` +
    `&endDateTime=${encodeURIComponent(endDate)}&$select=${CALENDAR_SELECT}&$top=100`;
  let pages = 0;

  while (nextUrl && pages < 25) {
    const data: GraphCalendarResponse =
      await graphCalendarFetch<GraphCalendarResponse>(accessToken, nextUrl);
    for (const row of data.value || []) {
      if (!isRemovedRow(row)) events.push(row);
    }
    nextUrl = data["@odata.nextLink"] || null;
    pages++;
  }

  return events;
}

/**
 * Convert a Graph event to Cantaia CalendarEvent shape for DB insert.
 */
export function graphEventToCalendarEvent(
  graphEvent: GraphCalendarEvent,
  userId: string,
  orgId: string
): Omit<CalendarEvent, "id" | "created_at" | "updated_at" | "invitations" | "project" | "meeting_prep"> {
  // CAL.C1: Graph returns wall-clock dateTimes paired with a timeZone
  // (UTC by default for calendarView). Convert to true UTC instants.
  const startDate = graphDateTimeToUtcIso(
    graphEvent.start.dateTime,
    graphEvent.start.timeZone
  );
  const endDate = graphDateTimeToUtcIso(
    graphEvent.end.dateTime,
    graphEvent.end.timeZone
  );

  return {
    organization_id: orgId,
    user_id: userId,
    project_id: null,
    title: graphEvent.subject || "(Sans objet)",
    description: graphEvent.body?.content || null,
    location: graphEvent.location?.displayName || null,
    event_type: guessEventType(graphEvent) as CalendarEvent["event_type"],
    start_at: startDate,
    end_at: endDate,
    all_day: graphEvent.isAllDay,
    // start_at/end_at are true UTC instants; the display timezone of the
    // product is Europe/Zurich (Graph returns "UTC" as the wire zone).
    timezone:
      resolveIanaTimeZone(graphEvent.start.timeZone) || DEFAULT_TIMEZONE,
    recurrence_rule: graphEvent.recurrence
      ? buildRRuleFromGraph(graphEvent.recurrence)
      : null,
    recurrence_end: null,
    parent_event_id: null,
    outlook_event_id: graphEvent.id,
    outlook_change_key: graphEvent.changeKey,
    sync_source: "outlook" as CalendarSyncSource,
    last_synced_at: new Date().toISOString(),
    color: null,
    ai_suggested: false,
    ai_prep_status: "none" as const,
    ai_prep_data: null,
    status: graphEvent.isCancelled ? "cancelled" as const : "confirmed" as const,
  };
}

/**
 * Extract attendees from a Graph event.
 */
export function extractAttendeesFromGraphEvent(
  graphEvent: GraphCalendarEvent
): Array<{
  email: string;
  name: string | null;
  response_status: string;
  is_organizer: boolean;
}> {
  const attendees: Array<{
    email: string;
    name: string | null;
    response_status: string;
    is_organizer: boolean;
  }> = [];

  const organizerEmail = graphEvent.organizer?.emailAddress?.address?.toLowerCase();

  for (const a of graphEvent.attendees || []) {
    const email = a.emailAddress.address?.toLowerCase();
    if (!email) continue;

    const graphResponse = a.status?.response || "none";
    let responseStatus: string;
    switch (graphResponse) {
      case "accepted": responseStatus = "accepted"; break;
      case "declined": responseStatus = "declined"; break;
      case "tentativelyAccepted": responseStatus = "tentative"; break;
      default: responseStatus = "pending";
    }

    attendees.push({
      email,
      name: a.emailAddress.name || null,
      response_status: responseStatus,
      is_organizer: email === organizerEmail,
    });
  }

  return attendees;
}

// ── Sync: Push to Graph ────────────────────────────────────

/**
 * Create a new event in Microsoft Graph (push from Cantaia to Outlook).
 */
export async function createGraphCalendarEvent(
  accessToken: string,
  event: CreateCalendarEventDTO
): Promise<{ outlookEventId: string; changeKey: string }> {
  const graphEvent = calendarEventToGraphFormat(event);
  const result = await graphCalendarFetch<GraphCalendarEvent>(
    accessToken,
    "/me/events",
    { method: "POST", body: JSON.stringify(graphEvent) }
  );
  return { outlookEventId: result.id, changeKey: result.changeKey };
}

/**
 * Update an existing event in Microsoft Graph.
 */
export async function updateGraphCalendarEvent(
  accessToken: string,
  outlookEventId: string,
  changes: Partial<CreateCalendarEventDTO>
): Promise<{ changeKey: string }> {
  const graphChanges: Record<string, unknown> = {};

  if (changes.title !== undefined) graphChanges.subject = changes.title;
  if (changes.description !== undefined) {
    graphChanges.body = { contentType: "html", content: changes.description };
  }
  if (changes.location !== undefined) {
    graphChanges.location = { displayName: changes.location };
  }
  const timeZone = changes.timezone || DEFAULT_TIMEZONE;
  // CAL.C1: DB timestamps carry an offset — Graph expects local wall time
  // (no offset) alongside the timeZone field.
  let startDateTime =
    changes.start_at !== undefined
      ? toGraphDateTime(changes.start_at, timeZone)
      : undefined;
  let endDateTime =
    changes.end_at !== undefined
      ? toGraphDateTime(changes.end_at, timeZone)
      : undefined;

  // Graph requires all-day events to span whole days (midnight to midnight)
  if (changes.all_day && startDateTime && endDateTime) {
    const whole = normalizeAllDayRange(startDateTime, endDateTime);
    startDateTime = whole.start;
    endDateTime = whole.end;
  }

  if (startDateTime !== undefined) {
    graphChanges.start = { dateTime: startDateTime, timeZone };
  }
  if (endDateTime !== undefined) {
    graphChanges.end = { dateTime: endDateTime, timeZone };
  }
  if (changes.all_day !== undefined) graphChanges.isAllDay = changes.all_day;

  // CAL: push the recurrence too. An RRULE edited in Cantaia used to stay
  // local, so Outlook kept showing the old (or no) series.
  if (changes.recurrence_rule !== undefined) {
    if (changes.recurrence_rule && changes.start_at) {
      const recurrence = rruleToGraphRecurrence(
        changes.recurrence_rule,
        changes.start_at,
        timeZone,
        changes.recurrence_end ?? null
      );
      if (recurrence) graphChanges.recurrence = recurrence;
    } else if (!changes.recurrence_rule) {
      graphChanges.recurrence = null; // series → single occurrence
    }
  }

  const result = await graphCalendarFetch<GraphCalendarEvent>(
    accessToken,
    `/me/events/${outlookEventId}`,
    { method: "PATCH", body: JSON.stringify(graphChanges) }
  );
  return { changeKey: result.changeKey };
}

/**
 * Delete an event from Microsoft Graph.
 */
export async function deleteGraphCalendarEvent(
  accessToken: string,
  outlookEventId: string
): Promise<void> {
  await graphCalendarFetch<void>(
    accessToken,
    `/me/events/${outlookEventId}`,
    { method: "DELETE" }
  );
}

// ── Team Availability (Graph) ──────────────────────────────

/**
 * Get free/busy status for multiple users via Graph findMeetingTimes or schedules.
 */
export async function getTeamSchedules(
  accessToken: string,
  emails: string[],
  startDate: string,
  endDate: string
): Promise<
  Array<{
    email: string;
    busy_slots: Array<{ start: string; end: string; status: string }>;
  }>
> {
  const body = {
    schedules: emails,
    startTime: { dateTime: startDate, timeZone: "Europe/Zurich" },
    endTime: { dateTime: endDate, timeZone: "Europe/Zurich" },
    availabilityViewInterval: 30,
  };

  const data = await graphCalendarFetch<{
    value: Array<{
      scheduleId: string;
      scheduleItems: Array<{
        status: string;
        start: { dateTime: string };
        end: { dateTime: string };
        subject?: string;
      }>;
    }>;
  }>(accessToken, "/me/calendar/getSchedule", {
    method: "POST",
    body: JSON.stringify(body),
  });

  return data.value.map((schedule) => ({
    email: schedule.scheduleId,
    busy_slots: schedule.scheduleItems.map((item) => ({
      start: item.start.dateTime,
      end: item.end.dateTime,
      status: item.status,
    })),
  }));
}

// ── External Calendar (other org members) ──────────────────

/**
 * Fetch calendar events for an external member (requires admin consent).
 * Uses /users/{email}/calendarView
 */
export async function fetchExternalMemberCalendar(
  accessToken: string,
  memberEmail: string,
  startDate: string,
  endDate: string
): Promise<GraphCalendarEvent[]> {
  const url =
    `/users/${encodeURIComponent(memberEmail)}/calendarView` +
    `?startDateTime=${encodeURIComponent(startDate)}&endDateTime=${encodeURIComponent(endDate)}` +
    `&$select=id,subject,start,end,location,isAllDay,isCancelled,showAs,sensitivity&$top=100`;

  const data = await graphCalendarFetch<GraphCalendarResponse>(accessToken, url);
  return (data.value || []).filter(
    (row): row is GraphCalendarEvent => !isRemovedRow(row)
  );
}

/** Public alias so callers outside this module can type external events. */
export type ExternalGraphEvent = GraphCalendarEvent;

/**
 * Search org members via Microsoft Graph (for adding external calendars).
 */
export async function searchOrgMembers(
  accessToken: string,
  query: string
): Promise<Array<{ id: string; displayName: string; mail: string; jobTitle: string | null }>> {
  const url = `/users?$filter=startswith(displayName,'${query.replace(/'/g, "''")}') or startswith(mail,'${query.replace(/'/g, "''")}')&$select=id,displayName,mail,jobTitle&$top=15`;

  const data = await graphCalendarFetch<{
    value: Array<{
      id: string;
      displayName: string;
      mail: string;
      jobTitle: string | null;
    }>;
  }>(accessToken, url);

  return data.value;
}

// ── Helpers ────────────────────────────────────────────────

function guessEventType(event: GraphCalendarEvent): string {
  const subject = (event.subject || "").toLowerCase();
  const location = (event.location?.displayName || "").toLowerCase();

  if (subject.includes("visite") || subject.includes("chantier") || location.includes("chantier")) {
    return "site_visit";
  }
  if (subject.includes("appel") || subject.includes("call") || subject.includes("telephone")) {
    return "call";
  }
  if (subject.includes("deadline") || subject.includes("echeance") || subject.includes("delai")) {
    return "deadline";
  }
  if (subject.includes("jalon") || subject.includes("milestone")) {
    return "milestone";
  }
  return "meeting";
}

function buildRRuleFromGraph(
  recurrence: NonNullable<GraphCalendarEvent["recurrence"]>
): string | null {
  const { pattern, range } = recurrence;
  const parts: string[] = [];

  switch (pattern.type) {
    case "daily": parts.push("FREQ=DAILY"); break;
    case "weekly": parts.push("FREQ=WEEKLY"); break;
    case "absoluteMonthly":
    case "relativeMonthly": parts.push("FREQ=MONTHLY"); break;
    case "absoluteYearly":
    case "relativeYearly": parts.push("FREQ=YEARLY"); break;
    default: return null;
  }

  if (pattern.interval && pattern.interval > 1) {
    parts.push(`INTERVAL=${pattern.interval}`);
  }

  if (pattern.daysOfWeek?.length) {
    const dayMap: Record<string, string> = {
      sunday: "SU", monday: "MO", tuesday: "TU", wednesday: "WE",
      thursday: "TH", friday: "FR", saturday: "SA",
    };
    const days = pattern.daysOfWeek.map((d) => dayMap[d] || d.slice(0, 2).toUpperCase());
    parts.push(`BYDAY=${days.join(",")}`);
  }

  if (range.endDate) {
    parts.push(`UNTIL=${range.endDate.replace(/-/g, "")}`);
  }

  return parts.join(";");
}

/**
 * Graph requires all-day events to run midnight-to-midnight (exclusive end).
 * Input wall times like 00:00:00 → 23:59:59 become 00:00:00 → next day 00:00:00.
 */
function normalizeAllDayRange(
  startDateTime: string,
  endDateTime: string
): { start: string; end: string } {
  const startDay = startDateTime.split("T")[0];
  const [endDay, endTime] = endDateTime.split("T");
  let exclusiveEnd: string;
  if (endTime === "00:00:00" && endDay > startDay) {
    // Already an exclusive midnight end
    exclusiveEnd = endDay;
  } else {
    const d = new Date(`${endDay}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    exclusiveEnd = d.toISOString().split("T")[0];
  }
  return { start: `${startDay}T00:00:00`, end: `${exclusiveEnd}T00:00:00` };
}

function calendarEventToGraphFormat(event: CreateCalendarEventDTO): Record<string, unknown> {
  const timeZone = event.timezone || DEFAULT_TIMEZONE;
  // CAL.C1: DB timestamps carry an offset — Graph expects local wall time
  // (no offset) alongside the timeZone field.
  let startDateTime = toGraphDateTime(event.start_at, timeZone);
  let endDateTime = toGraphDateTime(event.end_at, timeZone);

  if (event.all_day) {
    const whole = normalizeAllDayRange(startDateTime, endDateTime);
    startDateTime = whole.start;
    endDateTime = whole.end;
  }

  const graphEvent: Record<string, unknown> = {
    subject: event.title,
    start: {
      dateTime: startDateTime,
      timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone,
    },
    isAllDay: event.all_day || false,
  };

  if (event.description) {
    graphEvent.body = { contentType: "html", content: event.description };
  }
  if (event.location) {
    graphEvent.location = { displayName: event.location };
  }
  if (event.attendees?.length) {
    graphEvent.attendees = event.attendees.map((a) => ({
      emailAddress: { address: a.email, name: a.name || a.email },
      type: "required",
    }));
  }

  // CAL: a recurring Cantaia event was created in Outlook as a one-off —
  // the RRULE was never translated. Simple daily/weekly/monthly patterns are
  // now pushed; anything else logs and falls back to a single occurrence.
  if (event.recurrence_rule) {
    const recurrence = rruleToGraphRecurrence(
      event.recurrence_rule,
      event.start_at,
      timeZone,
      event.recurrence_end ?? null
    );
    if (recurrence) graphEvent.recurrence = recurrence;
  }

  return graphEvent;
}
