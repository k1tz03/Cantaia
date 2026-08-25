// ============================================================
// Cantaia — Briefing Data Collector
// ============================================================
// Collects and aggregates data from projects, emails, tasks,
// and meetings to feed the AI briefing generator.
// Uses dependency injection: data is passed in from the API route.

import type {
  Project,
  EmailRecord,
  Task,
  Meeting,
} from "@cantaia/database";

// ---------- Input types (raw data from Supabase) ----------

export interface SubmissionDeadlineInput {
  id: string;
  title: string;
  reference: string | null;
  status: string;
  deadline: string;
  project_id: string;
}

export interface CalendarEventInput {
  id: string;
  title: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  event_type: string | null;
  project_id: string | null;
}

export interface FollowupInput {
  id: string;
  followup_type: string;
  title: string;
  description: string | null;
  urgency: "low" | "medium" | "high" | "critical" | string;
  suggested_action: string | null;
  recipient_name: string | null;
  days_overdue: number | null;
  project_id: string | null;
}

export interface SupplierAlertInput {
  id: string;
  alert_type: string;
  category: string;
  title: string;
  description: string;
  recommended_action: string | null;
}

export interface BriefingDataInput {
  user_name: string;
  projects: Project[];
  emails: EmailRecord[];
  tasks: Task[];
  meetings: Meeting[];
  submissions?: SubmissionDeadlineInput[];
  calendar_events?: CalendarEventInput[];
  followups?: FollowupInput[];
  supplier_alerts?: SupplierAlertInput[];
  locale: "fr" | "en" | "de";
}

// ---------- Aggregated types (for AI consumption) ----------

export interface ProjectBriefingData {
  project_id: string;
  name: string;
  code: string | null;
  status: string;
  color: string;
  emails_total: number;
  emails_unread: number;
  emails_action_required: number;
  emails_urgent: number;
  tasks_total: number;
  tasks_overdue: number;
  tasks_due_today: number;
  tasks_in_progress: number;
  next_meeting: { title: string; date: string; location: string | null } | null;
  recent_email_subjects: string[];
}

export interface BriefingRawData {
  user_name: string;
  date: string;
  locale: "fr" | "en" | "de";
  stats: {
    total_projects: number;
    emails_unread: number;
    emails_action_required: number;
    tasks_overdue: number;
    tasks_due_today: number;
    meetings_today: number;
  };
  projects: ProjectBriefingData[];
  meetings_today: Array<{
    time: string;
    project_name: string;
    title: string;
    location: string | null;
    participants_count: number;
  }>;
  overdue_tasks: Array<{
    title: string;
    project_name: string;
    due_date: string;
    assigned_to: string | null;
    priority: string;
  }>;
  urgent_emails: Array<{
    subject: string;
    sender: string;
    project_name: string | null;
    received_at: string;
  }>;
  submission_deadlines: Array<{
    title: string;
    reference: string | null;
    project_name: string;
    deadline: string;
    days_remaining: number;
    status: string;
  }>;
  /** Today's calendar entries (union feed), independent of `meetings`. */
  calendar_today: Array<{
    id: string;
    time: string;
    title: string;
    location: string | null;
    event_type: string | null;
    project_name: string | null;
    all_day: boolean;
  }>;
  /** Pending follow-ups surfaced by the Followup Engine agent. */
  pending_followups: Array<{
    id: string;
    title: string;
    urgency: string;
    followup_type: string;
    suggested_action: string | null;
    recipient_name: string | null;
    days_overdue: number | null;
    project_name: string | null;
  }>;
  /** Active supplier alerts surfaced by the Supplier Monitor agent. */
  supplier_alerts: Array<{
    id: string;
    alert_type: string;
    category: string;
    title: string;
    description: string;
    recommended_action: string | null;
  }>;
}

// ---------- Collector function ----------

const PRODUCT_TIMEZONE = "Europe/Zurich";

/**
 * Date `YYYY-MM-DD` in the product timezone (Europe/Zurich).
 * `toISOString().split("T")[0]` yields the UTC date — between midnight and
 * ~02:00 Zurich it reports the previous day, so "today"'s filters would drift.
 */
function zurichDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PRODUCT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Wall-clock time `HH:mm` in the product timezone (Europe/Zurich). */
function zurichTimeString(value: string | Date): string {
  return new Date(value).toLocaleTimeString("fr-CH", {
    timeZone: PRODUCT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function collectBriefingData(input: BriefingDataInput): BriefingRawData {
  const today = zurichDateString();

  // Build project lookup
  const projectMap = new Map(input.projects.map((p) => [p.id, p]));

  // Aggregate per-project data
  const projectData: ProjectBriefingData[] = input.projects
    .filter((p) => p.status === "active" || p.status === "planning")
    .map((project) => {
      const projectEmails = input.emails.filter(
        (e) => e.project_id === project.id
      );
      const projectTasks = input.tasks.filter(
        (t) => t.project_id === project.id
      );
      const projectMeetings = input.meetings.filter(
        (m) => m.project_id === project.id
      );

      const overdueTasks = projectTasks.filter(
        (t) =>
          t.due_date &&
          t.due_date < today &&
          t.status !== "done" &&
          t.status !== "cancelled"
      );
      const dueTodayTasks = projectTasks.filter(
        (t) =>
          t.due_date &&
          t.due_date.startsWith(today) &&
          t.status !== "done" &&
          t.status !== "cancelled"
      );

      // Next upcoming meeting
      const futureMeetings = projectMeetings
        .filter((m) => m.meeting_date >= today && m.status !== "sent")
        .sort(
          (a, b) =>
            new Date(a.meeting_date).getTime() -
            new Date(b.meeting_date).getTime()
        );

      const nextMeeting = futureMeetings[0]
        ? {
            title: futureMeetings[0].title,
            date: futureMeetings[0].meeting_date,
            location: futureMeetings[0].location,
          }
        : null;

      // Recent email subjects (last 5)
      const recentSubjects = projectEmails
        .sort(
          (a, b) =>
            new Date(b.received_at).getTime() -
            new Date(a.received_at).getTime()
        )
        .slice(0, 5)
        .map((e) => e.subject);

      return {
        project_id: project.id,
        name: project.name,
        code: project.code,
        status: project.status,
        color: project.color,
        emails_total: projectEmails.length,
        emails_unread: projectEmails.filter((e) => !e.is_processed).length,
        emails_action_required: projectEmails.filter(
          (e) => e.classification === "action_required"
        ).length,
        emails_urgent: projectEmails.filter(
          (e) => e.classification === "urgent"
        ).length,
        tasks_total: projectTasks.filter(
          (t) => t.status !== "done" && t.status !== "cancelled"
        ).length,
        tasks_overdue: overdueTasks.length,
        tasks_due_today: dueTodayTasks.length,
        tasks_in_progress: projectTasks.filter(
          (t) => t.status === "in_progress"
        ).length,
        next_meeting: nextMeeting,
        recent_email_subjects: recentSubjects,
      };
    })
    // Sort by urgency: overdue tasks + urgent emails first
    .sort(
      (a, b) =>
        b.tasks_overdue * 10 +
        b.emails_urgent * 5 +
        b.emails_action_required -
        (a.tasks_overdue * 10 +
          a.emails_urgent * 5 +
          a.emails_action_required)
    );

  // Today's meetings
  const meetingsToday = input.meetings
    .filter((m) => m.meeting_date.startsWith(today))
    .sort(
      (a, b) =>
        new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime()
    )
    .map((m) => ({
      time: zurichTimeString(m.meeting_date),
      project_name: projectMap.get(m.project_id)?.name ?? "—",
      title: m.title,
      location: m.location,
      participants_count: m.participants.length,
    }));

  // All overdue tasks
  const overdueTasks = input.tasks
    .filter(
      (t) =>
        t.due_date &&
        t.due_date < today &&
        t.status !== "done" &&
        t.status !== "cancelled"
    )
    .sort(
      (a, b) =>
        new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime()
    )
    .map((t) => ({
      title: t.title,
      project_name: projectMap.get(t.project_id)?.name ?? "—",
      due_date: t.due_date!,
      assigned_to: t.assigned_to_name,
      priority: t.priority,
    }));

  // Urgent unprocessed emails
  const urgentEmails = input.emails
    .filter(
      (e) =>
        (e.classification === "urgent" ||
          e.classification === "action_required") &&
        !e.is_processed
    )
    .sort(
      (a, b) =>
        new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
    )
    .slice(0, 10)
    .map((e) => ({
      subject: e.subject,
      sender: e.sender_name ?? e.sender_email,
      project_name: e.project_id
        ? (projectMap.get(e.project_id)?.name ?? null)
        : null,
      received_at: e.received_at,
    }));

  // Global stats
  const allUnread = input.emails.filter((e) => !e.is_processed).length;
  const allActionRequired = input.emails.filter(
    (e) => e.classification === "action_required" && !e.is_processed
  ).length;
  const allOverdue = overdueTasks.length;
  const allDueToday = input.tasks.filter(
    (t) =>
      t.due_date &&
      t.due_date.startsWith(today) &&
      t.status !== "done" &&
      t.status !== "cancelled"
  ).length;

  // Submission deadlines (approaching within 30 days)
  const submissionDeadlines = (input.submissions || [])
    .filter((s) => s.deadline && s.deadline >= today)
    .map((s) => {
      const daysRemaining = Math.ceil(
        (new Date(s.deadline).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        title: s.title,
        reference: s.reference,
        project_name: projectMap.get(s.project_id)?.name ?? "—",
        deadline: s.deadline,
        days_remaining: daysRemaining,
        status: s.status,
      };
    })
    .sort((a, b) => a.days_remaining - b.days_remaining)
    .slice(0, 10);

  // Today's calendar entries (union feed from the calendar module).
  const calendarToday = (input.calendar_events || []).map((e) => ({
    id: e.id,
    time: e.all_day ? "—" : zurichTimeString(e.start_at),
    title: e.title,
    location: e.location,
    event_type: e.event_type,
    project_name: e.project_id
      ? (projectMap.get(e.project_id)?.name ?? null)
      : null,
    all_day: e.all_day,
  }));

  // Pending follow-ups, most urgent first.
  const urgencyRank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const pendingFollowups = (input.followups || [])
    .slice()
    .sort(
      (a, b) => (urgencyRank[a.urgency] ?? 9) - (urgencyRank[b.urgency] ?? 9)
    )
    .slice(0, 10)
    .map((f) => ({
      id: f.id,
      title: f.title,
      urgency: f.urgency,
      followup_type: f.followup_type,
      suggested_action: f.suggested_action,
      recipient_name: f.recipient_name,
      days_overdue: f.days_overdue,
      project_name: f.project_id
        ? (projectMap.get(f.project_id)?.name ?? null)
        : null,
    }));

  const supplierAlerts = (input.supplier_alerts || []).slice(0, 10).map((a) => ({
    id: a.id,
    alert_type: a.alert_type,
    category: a.category,
    title: a.title,
    description: a.description,
    recommended_action: a.recommended_action,
  }));

  return {
    user_name: input.user_name,
    date: today,
    locale: input.locale,
    stats: {
      total_projects: projectData.length,
      emails_unread: allUnread,
      emails_action_required: allActionRequired,
      tasks_overdue: allOverdue,
      tasks_due_today: allDueToday,
      // Prefer the calendar feed when it has entries — it is the union of
      // meetings, site visits and deadlines, so it is the honest "today" count.
      meetings_today: Math.max(meetingsToday.length, calendarToday.length),
    },
    projects: projectData,
    meetings_today: meetingsToday,
    overdue_tasks: overdueTasks,
    urgent_emails: urgentEmails,
    submission_deadlines: submissionDeadlines,
    calendar_today: calendarToday,
    pending_followups: pendingFollowups,
    supplier_alerts: supplierAlerts,
  };
}
