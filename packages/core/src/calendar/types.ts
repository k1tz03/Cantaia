// ============================================================
// Calendar Types — Cantaia Calendar Hub IA
// ============================================================

// ── Event Types ────────────────────────────────────────────

export type CalendarEventType =
  | "meeting"
  | "site_visit"
  | "call"
  | "deadline"
  | "construction"
  | "milestone"
  | "other";

export type CalendarEventStatus = "tentative" | "confirmed" | "cancelled";
export type CalendarSyncSource = "cantaia" | "outlook" | "external" | "agent";
export type CalendarPrepStatus = "none" | "pending" | "ready" | "delivered";
export type InvitationResponse = "pending" | "accepted" | "declined" | "tentative";
export type ExternalCalendarSource = "microsoft" | "ics" | "manual";

// ── Calendar Event ─────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  organization_id: string;
  user_id: string;
  project_id: string | null;

  title: string;
  description: string | null;
  location: string | null;
  event_type: CalendarEventType;

  start_at: string;
  end_at: string;
  all_day: boolean;
  timezone: string;

  recurrence_rule: string | null;
  recurrence_end: string | null;
  parent_event_id: string | null;

  outlook_event_id: string | null;
  outlook_change_key: string | null;
  sync_source: CalendarSyncSource;
  last_synced_at: string | null;

  color: string | null;

  ai_suggested: boolean;
  ai_prep_status: CalendarPrepStatus;
  ai_prep_data: MeetingPrepData | null;

  status: CalendarEventStatus;

  created_at: string;
  updated_at: string;

  // Joined data (optional)
  invitations?: CalendarInvitation[];
  project?: { name: string; code: string | null; color: string | null } | null;
  meeting_prep?: MeetingPreparation | null;
}

// ── Invitation ─────────────────────────────────────────────

export interface CalendarInvitation {
  id: string;
  event_id: string;
  attendee_email: string;
  attendee_name: string | null;
  attendee_user_id: string | null;
  response_status: InvitationResponse;
  is_organizer: boolean;
  notified_at: string | null;
  responded_at: string | null;
  created_at: string;
}

// ── External Calendar ──────────────────────────────────────

export interface ExternalCalendar {
  id: string;
  organization_id: string;
  added_by: string;
  member_email: string;
  member_name: string | null;
  source: ExternalCalendarSource;
  graph_user_id: string | null;
  ics_url: string | null;
  color: string;
  is_active: boolean;
  last_synced_at: string | null;
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

// ── External Event (read-only, not stored) ─────────────────

export interface ExternalCalendarEvent {
  id: string;
  external_calendar_id: string;
  member_email: string;
  member_name: string | null;
  title: string;
  start_at: string;
  end_at: string;
  all_day: boolean;
  location: string | null;
  is_busy: boolean;
  color: string;
}

// ── Sync State ─────────────────────────────────────────────

export interface CalendarSyncState {
  id: string;
  user_id: string;
  delta_link: string | null;
  last_sync_at: string | null;
  sync_status: "idle" | "syncing" | "error";
  error_message: string | null;
  events_imported: number;
  created_at: string;
  updated_at: string;
}

// ── Project Memory ─────────────────────────────────────────

export interface ProjectMemoryFact {
  fact: string;
  source: string;
  date: string;
  importance: "low" | "medium" | "high";
}

export interface ProjectMemoryRisk {
  risk: string;
  severity: "low" | "medium" | "high" | "critical";
  source: string;
  detected_at: string;
}

export interface ProjectMemoryDecision {
  decision: string;
  context: string;
  deadline: string | null;
  stakeholders: string[];
}

export interface ProjectMemoryOpenItem {
  item: string;
  type: "task" | "email" | "submission" | "reserve" | "document";
  assignee: string | null;
  due_date: string | null;
  source: string;
}

export interface ProjectMemory {
  id: string;
  organization_id: string;
  project_id: string;

  summary: string | null;
  key_facts: ProjectMemoryFact[];
  active_risks: ProjectMemoryRisk[];
  pending_decisions: ProjectMemoryDecision[];
  open_items: ProjectMemoryOpenItem[];
  supplier_status: Record<string, {
    name: string;
    last_contact: string | null;
    pending_items: number;
    score: number | null;
  }>;
  timeline_events: Array<{
    event: string;
    date: string;
    type: string;
    impact: "low" | "medium" | "high";
  }>;

  last_emails_scan: string | null;
  last_tasks_scan: string | null;
  last_submissions_scan: string | null;
  last_meetings_scan: string | null;
  last_plans_scan: string | null;
  last_reports_scan: string | null;

  version: number;
  agent_session_id: string | null;
  generated_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

// ── Meeting Preparation ────────────────────────────────────

export interface MeetingPrepEmail {
  subject: string;
  sender: string;
  received_at: string;
  preview: string;
  urgency: "low" | "medium" | "high";
}

export interface MeetingPrepTask {
  title: string;
  assignee: string | null;
  due_date: string | null;
  lot_code: string | null;
  days_overdue: number;
}

export interface MeetingPrepReserve {
  description: string;
  severity: "minor" | "major" | "blocking";
  location: string | null;
  deadline: string | null;
}

export interface MeetingPrepSubmission {
  title: string;
  status: string;
  deadline: string | null;
  suppliers_pending: number;
}

export interface MeetingPrepKeyPoint {
  point: string;
  source: string;
  priority: "low" | "medium" | "high";
}

export interface MeetingPrepAgendaItem {
  topic: string;
  duration_min: number;
  context: string;
}

export interface MeetingPrepAttendee {
  name: string;
  email: string;
  role: string | null;
  last_interaction: string | null;
}

export interface MeetingPrepData {
  project_summary: string;
  unread_emails: MeetingPrepEmail[];
  overdue_tasks: MeetingPrepTask[];
  open_reserves: MeetingPrepReserve[];
  pending_submissions: MeetingPrepSubmission[];
  key_points: MeetingPrepKeyPoint[];
  suggested_agenda: MeetingPrepAgendaItem[];
  attendee_context: MeetingPrepAttendee[];
}

export interface MeetingPreparation {
  id: string;
  organization_id: string;
  event_id: string;
  project_id: string | null;
  user_id: string;

  project_summary: string | null;
  unread_emails: MeetingPrepEmail[];
  overdue_tasks: MeetingPrepTask[];
  open_reserves: MeetingPrepReserve[];
  pending_submissions: MeetingPrepSubmission[];
  key_points: MeetingPrepKeyPoint[];
  suggested_agenda: MeetingPrepAgendaItem[];
  attendee_context: MeetingPrepAttendee[];

  status: "generating" | "ready" | "delivered" | "viewed";
  delivered_at: string | null;
  viewed_at: string | null;

  agent_session_id: string | null;
  tokens_used: number;
  generation_time_ms: number | null;

  created_at: string;
  updated_at: string;
}

// ── Intelligence Feed (cross-module) ───────────────────────

export interface IntelligenceFeedItem {
  id: string;
  type: "submission_deadline" | "planning_delay" | "email_urgent" | "task_overdue" | "supplier_alert" | "meeting_prep" | "report_pending" | "offer_received";
  module: "soumissions" | "planning" | "mail" | "taches" | "fournisseurs" | "pv" | "rapports";
  title: string;
  description: string;
  urgency: "low" | "medium" | "high" | "critical";
  project_id: string | null;
  project_name: string | null;
  link: string | null;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface TeamMemberAvailability {
  user_id: string;
  name: string;
  email: string;
  avatar_color: string;
  initials: string;
  /** Array of 5 slots (morning blocks) representing half-day availability */
  slots: Array<"free" | "busy" | "meeting" | "partial">;
  events_today: number;
}

export interface CalendarWeather {
  temperature: number;
  description: string;
  location: string;
  alert: string | null;
  icon: string;
}

// ── Create/Update DTOs ─────────────────────────────────────

export interface CreateCalendarEventDTO {
  title: string;
  description?: string;
  location?: string;
  event_type?: CalendarEventType;
  start_at: string;
  end_at: string;
  all_day?: boolean;
  timezone?: string;
  project_id?: string;
  color?: string;
  recurrence_rule?: string;
  recurrence_end?: string;
  status?: CalendarEventStatus;
  attendees?: Array<{
    email: string;
    name?: string;
  }>;
  sync_to_outlook?: boolean;
}

export interface UpdateCalendarEventDTO {
  title?: string;
  description?: string;
  location?: string;
  event_type?: CalendarEventType;
  start_at?: string;
  end_at?: string;
  all_day?: boolean;
  project_id?: string | null;
  color?: string | null;
  status?: CalendarEventStatus;
  sync_to_outlook?: boolean;
}

// ── AI Command ─────────────────────────────────────────────

export interface AICommandResult {
  action: "create_event" | "find_slot" | "optimize_week" | "summary" | "unknown";
  event?: CreateCalendarEventDTO;
  slots?: Array<{ start_at: string; end_at: string; score: number }>;
  summary?: string;
  message: string;
}
