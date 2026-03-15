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

export interface BriefingDataInput {
  user_name: string;
  projects: Project[];
  emails: EmailRecord[];
  tasks: Task[];
  meetings: Meeting[];
  submissions?: SubmissionDeadlineInput[];
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
}

// ---------- Collector function ----------

export function collectBriefingData(input: BriefingDataInput): BriefingRawData {
  const today = new Date().toISOString().split("T")[0];

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
      time: new Date(m.meeting_date).toLocaleTimeString("fr-CH", {
        hour: "2-digit",
        minute: "2-digit",
      }),
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
      meetings_today: meetingsToday.length,
    },
    projects: projectData,
    meetings_today: meetingsToday,
    overdue_tasks: overdueTasks,
    urgent_emails: urgentEmails,
    submission_deadlines: submissionDeadlines,
  };
}
