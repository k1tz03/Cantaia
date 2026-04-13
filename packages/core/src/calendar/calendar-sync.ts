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

interface GraphCalendarResponse {
  value: GraphCalendarEvent[];
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

export class GraphCalendarRateLimitError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.name = "GraphCalendarRateLimitError";
    this.retryAfterSeconds = retryAfter;
  }
}

// ── Sync: Import from Graph ────────────────────────────────

/**
 * Fetch calendar events from Microsoft Graph.
 * Uses delta sync if deltaLink is provided (incremental),
 * otherwise fetches full date range (initial sync).
 */
export async function fetchGraphCalendarEvents(
  accessToken: string,
  options: {
    deltaLink?: string;
    startDate?: string;  // ISO date
    endDate?: string;    // ISO date
  }
): Promise<{
  events: GraphCalendarEvent[];
  deltaLink: string | null;
}> {
  const allEvents: GraphCalendarEvent[] = [];
  let nextLink: string | null = null;
  let deltaLink: string | null = null;

  // Use delta link for incremental sync, or calendarView for initial
  let url: string;
  if (options.deltaLink) {
    url = options.deltaLink;
  } else {
    const start = options.startDate || new Date(Date.now() - 180 * 86400000).toISOString();
    const end = options.endDate || new Date(Date.now() + 365 * 86400000).toISOString();
    url = `/me/calendarView?startDateTime=${start}&endDateTime=${end}&$select=id,subject,body,start,end,location,isAllDay,isCancelled,showAs,importance,attendees,organizer,recurrence,changeKey,createdDateTime,lastModifiedDateTime&$top=100`;
  }

  do {
    const data: GraphCalendarResponse = await graphCalendarFetch<GraphCalendarResponse>(
      accessToken,
      nextLink || url
    );

    allEvents.push(...data.value);
    nextLink = data["@odata.nextLink"] || null;
    deltaLink = data["@odata.deltaLink"] || null;
  } while (nextLink);

  return { events: allEvents, deltaLink };
}

/**
 * Convert a Graph event to Cantaia CalendarEvent shape for DB insert.
 */
export function graphEventToCalendarEvent(
  graphEvent: GraphCalendarEvent,
  userId: string,
  orgId: string
): Omit<CalendarEvent, "id" | "created_at" | "updated_at" | "invitations" | "project" | "meeting_prep"> {
  const startDate = graphEvent.start.dateTime.endsWith("Z")
    ? graphEvent.start.dateTime
    : `${graphEvent.start.dateTime}Z`;
  const endDate = graphEvent.end.dateTime.endsWith("Z")
    ? graphEvent.end.dateTime
    : `${graphEvent.end.dateTime}Z`;

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
    timezone: graphEvent.start.timeZone || "Europe/Zurich",
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
  if (changes.start_at !== undefined) {
    graphChanges.start = { dateTime: changes.start_at, timeZone: changes.timezone || "Europe/Zurich" };
  }
  if (changes.end_at !== undefined) {
    graphChanges.end = { dateTime: changes.end_at, timeZone: changes.timezone || "Europe/Zurich" };
  }
  if (changes.all_day !== undefined) graphChanges.isAllDay = changes.all_day;

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
  const url = `/users/${encodeURIComponent(memberEmail)}/calendarView?startDateTime=${startDate}&endDateTime=${endDate}&$select=id,subject,start,end,location,isAllDay,isCancelled,showAs&$top=100`;

  const data = await graphCalendarFetch<GraphCalendarResponse>(accessToken, url);
  return data.value;
}

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

function calendarEventToGraphFormat(event: CreateCalendarEventDTO): Record<string, unknown> {
  const graphEvent: Record<string, unknown> = {
    subject: event.title,
    start: {
      dateTime: event.start_at,
      timeZone: event.timezone || "Europe/Zurich",
    },
    end: {
      dateTime: event.end_at,
      timeZone: event.timezone || "Europe/Zurich",
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

  return graphEvent;
}
