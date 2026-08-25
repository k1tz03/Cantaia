// ============================================================
// Cantaia — Briefing Sources (shared fetcher)
// ============================================================
// Single source of truth for "what goes into a briefing".
//
// Both `/api/briefing/generate` (on-demand) and `/api/cron/briefing`
// (scheduled) call this. They used to each carry their own copy of the
// queries, which drifted: the cron never pulled C2 market trends and never
// applied the "filtered projects came back empty → fall back to all org
// projects" rule, so a scheduled briefing could silently be thinner than the
// one the same user got by clicking Regenerate.
//
// Dependency-injected client (same pattern as the rest of @cantaia/core) so
// this file stays free of Supabase imports.

import type { SubmissionDeadlineInput } from "./briefing-collector";
import type {
  CalendarEventInput,
  FollowupInput,
  SupplierAlertInput,
} from "./briefing-collector";

/** Minimal shape we need from a Supabase-like client. */
export interface BriefingSourceClient {
  from: (table: string) => any;
}

export interface FetchBriefingSourcesInput {
  client: BriefingSourceClient;
  userId: string;
  organizationId: string;
  /** Optional per-user project filter (users.briefing_projects). */
  briefingProjects?: string[] | null;
}

export interface BriefingSources {
  projects: any[];
  emails: any[];
  tasks: any[];
  meetings: any[];
  submissions: SubmissionDeadlineInput[];
  calendarEvents: CalendarEventInput[];
  followups: FollowupInput[];
  supplierAlerts: SupplierAlertInput[];
  /** Pre-formatted C2 benchmark block appended to the AI prompt ("" if none). */
  marketTrends: string;
}

const OPEN_TASK_STATUSES = ["todo", "in_progress", "waiting"];
const OPEN_SUBMISSION_STATUSES = ["draft", "sent", "responses", "comparing"];
const ACTIVE_PROJECT_STATUSES = ["active", "planning"];

/**
 * Date `YYYY-MM-DD` in the product timezone (Europe/Zurich).
 * `toISOString().split("T")[0]` yields the UTC date — between midnight and
 * ~02:00 Zurich it would report the previous day, shifting "today"'s bounds.
 */
function isoDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Collect every data source a briefing draws on, for one user.
 *
 * Every sub-query is individually fault-tolerant: a table that does not exist
 * yet (a migration not applied on this environment) degrades that one section
 * to empty rather than failing the whole briefing.
 */
export async function fetchBriefingSources(
  input: FetchBriefingSourcesInput
): Promise<BriefingSources> {
  const { client, userId, organizationId, briefingProjects } = input;

  const today = isoDate(new Date());
  const sevenDaysAgo = daysFromNow(-7);
  const nextWeek = daysFromNow(7);
  const in30Days = daysFromNow(30);

  // ── Projects (respecting the user's per-project briefing filter) ──
  let projectsQuery = client
    .from("projects")
    .select("id, name, code, status, color")
    .eq("organization_id", organizationId)
    .in("status", ACTIVE_PROJECT_STATUSES);

  if (briefingProjects && briefingProjects.length > 0) {
    projectsQuery = projectsQuery.in("id", briefingProjects);
  }

  const { data: projects } = await projectsQuery;
  let projectIds = (projects || []).map((p: { id: string }) => p.id);

  // The filter can point at archived/renamed projects and return nothing —
  // fall back to the whole org so the briefing is never mysteriously empty.
  if (projectIds.length === 0) {
    const { data: allProjects } = await client
      .from("projects")
      .select("id")
      .eq("organization_id", organizationId)
      .in("status", ACTIVE_PROJECT_STATUSES);
    projectIds = (allProjects || []).map((p: { id: string }) => p.id);
  }

  // `.in()` on an empty array matches everything in PostgREST — use a sentinel.
  const scopedIds = projectIds.length > 0 ? projectIds : ["__none__"];

  const [
    emailsRes,
    tasksRes,
    meetingsRes,
    submissionsRes,
    calendarRes,
    followupsRes,
    alertsRes,
  ] = await Promise.all([
    client
      .from("email_records")
      .select(
        "id, project_id, subject, sender_email, sender_name, received_at, classification, is_processed"
      )
      .eq("user_id", userId)
      .gte("received_at", sevenDaysAgo.toISOString())
      .then((r: any) => r, () => ({ data: [] })),

    client
      .from("tasks")
      .select(
        "id, project_id, title, status, due_date, assigned_to_name, priority"
      )
      .in("project_id", scopedIds)
      .in("status", OPEN_TASK_STATUSES)
      .then((r: any) => r, () => ({ data: [] })),

    client
      .from("meetings")
      .select("id, project_id, title, meeting_date, location, status, participants")
      .in("project_id", scopedIds)
      .gte("meeting_date", today)
      .lte("meeting_date", nextWeek.toISOString())
      .then((r: any) => r, () => ({ data: [] })),

    client
      .from("submissions")
      .select("id, title, reference, status, deadline, project_id")
      .in("project_id", scopedIds)
      .in("status", OPEN_SUBMISSION_STATUSES)
      .not("deadline", "is", null)
      .lte("deadline", isoDate(in30Days))
      .order("deadline", { ascending: true })
      .then((r: any) => r, () => ({ data: [] })),

    // Calendar events for TODAY only — the briefing is a "what's on today" view.
    client
      .from("calendar_events")
      .select("id, title, start_at, end_at, all_day, location, event_type, project_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .gte("start_at", `${today}T00:00:00.000Z`)
      .lte("start_at", `${today}T23:59:59.999Z`)
      .neq("status", "cancelled")
      .order("start_at", { ascending: true })
      .then((r: any) => r, () => ({ data: [] })),

    client
      .from("followup_items")
      .select(
        "id, followup_type, title, description, urgency, suggested_action, recipient_name, days_overdue, project_id, status"
      )
      .eq("organization_id", organizationId)
      .eq("status", "pending")
      .order("urgency", { ascending: true })
      .limit(20)
      .then((r: any) => r, () => ({ data: [] })),

    client
      .from("supplier_alerts")
      .select(
        "id, alert_type, category, title, description, recommended_action, supplier_id, status"
      )
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .limit(20)
      .then((r: any) => r, () => ({ data: [] })),
  ]);

  const marketTrends = await fetchMarketTrends(client, organizationId);

  return {
    projects: projects || [],
    emails: emailsRes?.data || [],
    tasks: tasksRes?.data || [],
    meetings: meetingsRes?.data || [],
    submissions: submissionsRes?.data || [],
    calendarEvents: (calendarRes?.data || []).map((e: any) => ({
      id: e.id,
      title: e.title,
      start_at: e.start_at,
      end_at: e.end_at,
      all_day: !!e.all_day,
      location: e.location ?? null,
      event_type: e.event_type ?? null,
      project_id: e.project_id ?? null,
    })),
    followups: (followupsRes?.data || []).map((f: any) => ({
      id: f.id,
      followup_type: f.followup_type,
      title: f.title,
      description: f.description ?? null,
      urgency: f.urgency,
      suggested_action: f.suggested_action ?? null,
      recipient_name: f.recipient_name ?? null,
      days_overdue: f.days_overdue ?? null,
      project_id: f.project_id ?? null,
    })),
    supplierAlerts: (alertsRes?.data || []).map((a: any) => ({
      id: a.id,
      alert_type: a.alert_type,
      category: a.category,
      title: a.title,
      description: a.description,
      recommended_action: a.recommended_action ?? null,
    })),
    marketTrends,
  };
}

/**
 * C2 anonymised regional price trends — only when the org opted in.
 * Never blocks a briefing: any failure yields an empty section.
 */
async function fetchMarketTrends(
  client: BriefingSourceClient,
  organizationId: string
): Promise<string> {
  try {
    const { data: priceConsent } = await client
      .from("aggregation_consent")
      .select("opted_in")
      .eq("organization_id", organizationId)
      .eq("module", "prix")
      .maybeSingle();

    if (priceConsent?.opted_in !== true) return "";

    const { data: trends } = await client
      .from("regional_price_index")
      .select("region, basket_index, trend_pct, period")
      .order("period", { ascending: false })
      .limit(5);

    if (!trends || trends.length === 0) return "";

    return (
      "\n\nMARKET PRICE TRENDS (C2 anonymised benchmarks):\n" +
      trends
        .map(
          (t: { region: string; trend_pct: number; period: string }) =>
            `- ${t.region}: ${t.trend_pct > 0 ? "+" : ""}${t.trend_pct}% (${t.period})`
        )
        .join("\n")
    );
  } catch (err) {
    console.warn("[briefing-sources] C2 market trends skipped:", err);
    return "";
  }
}
