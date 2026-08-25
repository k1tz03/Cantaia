/**
 * Visit → tasks.
 *
 * Extracted from POST /api/visits/generate-report so the same logic can run a
 * second time when a prospect visit is converted into a project.
 *
 * Why that matters: `tasks.project_id` is NOT NULL, so a prospect visit (no
 * project) generates a report and then silently creates zero tasks. Before the
 * conversion flow existed, that report's "devis à établir" and next steps were
 * simply lost. Converting the visit now replays this function against the new
 * project.
 *
 * The Supabase client is injected — this package must stay free of app-side
 * imports (same convention as analyze-notes-job.ts).
 */

export interface VisitTaskClientRequest {
  description: string;
  category?: string;
  priority?: string;
  details?: string;
  cfc_code?: string;
}

export interface VisitTaskReport {
  title?: string;
  client_requests?: VisitTaskClientRequest[];
  budget?: {
    client_mentioned?: boolean;
    range_min?: number;
    range_max?: number;
    currency?: string;
  };
  timeline?: {
    desired_start?: string;
    desired_end?: string;
    urgency?: string;
  };
  next_steps?: string[];
}

export interface VisitTaskVisit {
  id: string;
  project_id: string | null;
  client_name: string;
  visit_date: string;
  created_by?: string | null;
  title?: string | null;
}

export interface CreateVisitTasksParams {
  /** Supabase admin client (service role) — injected by the caller. */
  admin: any;
  visit: VisitTaskVisit;
  report: VisitTaskReport;
  /** Used as created_by / assigned_to when the visit has no creator. */
  fallbackUserId: string;
  /**
   * Skip the "already has tasks" guard. Only the initial report generation
   * should ever pass true; the conversion path must stay idempotent.
   */
  force?: boolean;
}

export interface CreateVisitTasksResult {
  quoteTaskId: string | null;
  createdTaskIds: string[];
  errors: string[];
  skippedNoProject: boolean;
  skippedAlreadyCreated: boolean;
}

/** Working day N after the visit — quotes are due in 5 business days. */
function businessDaysAfter(from: string | Date, days: number): string {
  const date = new Date(from);
  let counted = 0;
  while (counted < days) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) counted++;
  }
  return date.toISOString().split("T")[0];
}

/**
 * Creates the quote task + the actionable next-step tasks of a visit report.
 *
 * NOTE on the columns used: `source` is the task_source enum
 * ('email' | 'meeting' | 'manual' | 'reserve') — there is no 'visit' value, so
 * tasks carry source='manual' and the visit id in source_id (which is what the
 * visit detail page queries on).
 */
export async function createVisitTasks({
  admin,
  visit,
  report,
  fallbackUserId,
  force = false,
}: CreateVisitTasksParams): Promise<CreateVisitTasksResult> {
  const result: CreateVisitTasksResult = {
    quoteTaskId: null,
    createdTaskIds: [],
    errors: [],
    skippedNoProject: false,
    skippedAlreadyCreated: false,
  };

  if (!visit.project_id) {
    result.skippedNoProject = true;
    return result;
  }

  if (!force) {
    const { data: existing } = await admin
      .from("tasks")
      .select("id")
      .eq("source_id", visit.id)
      .limit(1);

    if (existing && existing.length > 0) {
      result.skippedAlreadyCreated = true;
      return result;
    }
  }

  const owner = visit.created_by || fallbackUserId;
  const sourceReference = `Visite client — ${visit.client_name}`;

  // ── Main task: establish the quote ──
  const requests = report.client_requests || [];
  if (requests.length > 0) {
    const requestsList = requests
      .map((r) => `- ${r.description}${r.category ? ` (${r.category})` : ""}`)
      .join("\n");

    const budgetInfo = report.budget?.client_mentioned
      ? `Budget client : ${report.budget.range_min?.toLocaleString()}-${report.budget.range_max?.toLocaleString()} ${report.budget.currency || "CHF"}`
      : "Budget non évoqué";

    const timelineInfo = report.timeline?.desired_start
      ? `Délai souhaité : ${report.timeline.desired_start}${report.timeline.desired_end ? ` — ${report.timeline.desired_end}` : ""}`
      : "";

    const urgency = report.timeline?.urgency;
    const priority = urgency === "high" || urgency === "critical" ? "high" : "medium";

    const { data: quoteTask, error: quoteTaskErr } = await admin
      .from("tasks")
      .insert({
        title: `Établir devis — ${visit.client_name}${report.title ? ` — ${report.title}` : ""}`,
        description: `Suite à la visite du ${visit.visit_date}.\n\nDemandes du client :\n${requestsList}\n\n${budgetInfo}\n${timelineInfo}`,
        project_id: visit.project_id,
        created_by: owner,
        assigned_to: owner,
        priority,
        due_date: businessDaysAfter(visit.visit_date, 5),
        status: "todo",
        source: "manual",
        source_id: visit.id,
        source_reference: sourceReference,
      })
      .select("id")
      .single();

    if (quoteTaskErr) {
      console.error("[VisitTasks] Quote task insert failed:", quoteTaskErr.message);
      result.errors.push(quoteTaskErr.message);
    } else if (quoteTask) {
      result.quoteTaskId = quoteTask.id;
      const { error: linkErr } = await admin
        .from("client_visits")
        .update({ quote_task_id: quoteTask.id })
        .eq("id", visit.id);
      if (linkErr) {
        console.error("[VisitTasks] Failed to link quote_task_id:", linkErr.message);
      }
    }
  }

  // ── Next steps (the "devis" one is already covered above) ──
  for (const step of report.next_steps || []) {
    if (step.toLowerCase().includes("devis")) continue;

    const { data: stepTask, error: stepTaskErr } = await admin
      .from("tasks")
      .insert({
        title: step,
        description: `Suite à la visite — ${visit.client_name} (${visit.visit_date})`,
        project_id: visit.project_id,
        created_by: owner,
        assigned_to: owner,
        priority: "medium",
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        status: "todo",
        source: "manual",
        source_id: visit.id,
        source_reference: sourceReference,
      })
      .select("id")
      .single();

    if (stepTaskErr) {
      console.error("[VisitTasks] Step task insert failed:", stepTaskErr.message);
      result.errors.push(stepTaskErr.message);
    } else if (stepTask) {
      result.createdTaskIds.push(stepTask.id);
    }
  }

  return result;
}
