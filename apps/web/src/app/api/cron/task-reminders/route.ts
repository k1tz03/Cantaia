import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { notifyTaskDeadline } from "@cantaia/core/notifications";
import {
  dateOnlyFromNow,
  dueDateOnly,
  isTaskOpen,
  todayDateOnly,
} from "@cantaia/core/projects/counters";

// ============================================================
// GET|POST /api/cron/task-reminders
// ============================================================
//
// ⚠️ NOT YET SCHEDULED. This handler is complete, but apps/web/vercel.json has
// no entry for `/api/cron/task-reminders`, so Vercel never invokes it and the
// `deadline_soon` notification does not fire in production. To activate, add a
// cron entry (suggested: "0 6 * * *", mind the plan's cron cap) — a vercel.json
// change owned by the deployment/infra workstream. Until then this route only
// runs on a manual trigger from /super-admin/operations.
//
// Sends the `deadline_soon` notification. Three trigger windows, evaluated on
// the SAME date-only definition the whole product uses (@cantaia/core/projects):
//
//   1. J-3  — standard "your deadline is in three days" sweep
//   2. J-0  — "due today"
//   3. the task's own `reminder` field (none | 1_day | 3_days | 1_week),
//      which the create/edit modal has been writing since migration 006 and
//      which NOTHING had ever read.
//
// Recipient: `assigned_to` when set, else `created_by` (the person who wrote
// the task down still owns it until it is handed over).
//
// Idempotence: `tasks.reminder_sent_at` (migration 092) — one reminder per task
// per day, so a re-run (manual trigger from /super-admin/operations, Vercel
// retry) never double-sends.

export const maxDuration = 300;

/** Lead time in days encoded by `tasks.reminder`. */
const REMINDER_LEAD_DAYS: Record<string, number> = {
  "1_day": 1,
  "3_days": 3,
  "1_week": 7,
};

/** Fixed sweeps, independent of the per-task reminder setting. */
const STANDARD_LEAD_DAYS = [0, 3];

/** Widest window we ever need to scan (the 1_week reminder). */
const MAX_LEAD_DAYS = 7;

/** Safety cap — an unbounded sweep could blow the function budget. */
const MAX_TASKS_PER_RUN = 500;

interface ReminderTask {
  id: string;
  project_id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  reminder: string | null;
  assigned_to: string | null;
  created_by: string | null;
  reminder_sent_at: string | null;
}

/** Vercel Cron invokes scheduled paths with GET — delegate to POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const today = todayDateOnly(now);
  const horizon = dateOnlyFromNow(MAX_LEAD_DAYS, now);

  // ── 1. Candidate tasks: open, with a deadline inside the widest window ────
  const SELECT =
    "id, project_id, title, status, priority, due_date, reminder, assigned_to, created_by, reminder_sent_at";
  const FALLBACK_SELECT =
    "id, project_id, title, status, priority, due_date, reminder, assigned_to, created_by";

  let tasks: ReminderTask[] = [];
  let hasReminderLedger = true;

  const baseQuery = () =>
    (admin as any)
      .from("tasks")
      .select(SELECT)
      .not("status", "in", '("done","cancelled")')
      .gte("due_date", today)
      .lte("due_date", horizon)
      .order("due_date", { ascending: true })
      .limit(MAX_TASKS_PER_RUN);

  const { data, error } = await baseQuery();

  if (error) {
    // Migration 092 not applied yet → run without the idempotence ledger
    // rather than skipping the whole sweep.
    console.warn("[cron/task-reminders] select failed, retrying without reminder_sent_at:", error.message);
    hasReminderLedger = false;
    const retry = await (admin as any)
      .from("tasks")
      .select(FALLBACK_SELECT)
      .not("status", "in", '("done","cancelled")')
      .gte("due_date", today)
      .lte("due_date", horizon)
      .order("due_date", { ascending: true })
      .limit(MAX_TASKS_PER_RUN);

    if (retry.error) {
      console.error("[cron/task-reminders] select failed:", retry.error.message);
      return NextResponse.json({ error: "Failed to load tasks" }, { status: 500 });
    }
    tasks = (retry.data || []) as ReminderTask[];
  } else {
    tasks = (data || []) as ReminderTask[];
  }

  if (tasks.length === 0) {
    return NextResponse.json({ ok: true, scanned: 0, sent: 0, skipped: 0 });
  }

  // ── 2. Project names for the email body ──────────────────────────────────
  const projectIds = Array.from(new Set(tasks.map((t) => t.project_id).filter(Boolean)));
  const projectNames = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projects, error: projectError } = await (admin as any)
      .from("projects")
      .select("id, name")
      .in("id", projectIds);
    if (projectError) {
      console.warn("[cron/task-reminders] project names unavailable:", projectError.message);
    }
    for (const p of projects || []) projectNames.set(p.id, p.name);
  }

  // ── 3. Decide, send, mark ────────────────────────────────────────────────
  let sent = 0;
  let skipped = 0;
  const sentTaskIds: string[] = [];

  for (const task of tasks) {
    if (!isTaskOpen(task)) {
      skipped++;
      continue;
    }

    const due = dueDateOnly(task.due_date);
    if (!due) {
      skipped++;
      continue;
    }

    // Already reminded today → nothing to do (idempotent re-run).
    if (task.reminder_sent_at && task.reminder_sent_at.slice(0, 10) === today) {
      skipped++;
      continue;
    }

    const leads = new Set<number>(STANDARD_LEAD_DAYS);
    const custom = task.reminder ? REMINDER_LEAD_DAYS[task.reminder] : undefined;
    if (custom !== undefined) leads.add(custom);

    const matchedLead = Array.from(leads).find((lead) => due === dateOnlyFromNow(lead, now));
    if (matchedLead === undefined) {
      skipped++;
      continue;
    }

    const recipientId = task.assigned_to || task.created_by;
    if (!recipientId) {
      skipped++;
      continue;
    }

    const ok = await notifyTaskDeadline(admin, {
      task: {
        id: task.id,
        title: task.title,
        due_date: task.due_date,
        priority: task.priority,
      },
      recipientId,
      daysAhead: matchedLead,
      projectName: projectNames.get(task.project_id) || null,
    });

    if (ok) {
      sent++;
      sentTaskIds.push(task.id);
    } else {
      // Opted out / no address / Resend down — do NOT mark as sent, so a
      // re-run after the incident still delivers.
      skipped++;
    }
  }

  // ── 4. Ledger update (one batched write) ─────────────────────────────────
  if (hasReminderLedger && sentTaskIds.length > 0) {
    const { error: markError } = await (admin as any)
      .from("tasks")
      .update({ reminder_sent_at: now.toISOString() })
      .in("id", sentTaskIds);
    if (markError) {
      console.error("[cron/task-reminders] failed to mark reminders as sent:", markError.message);
    }
  }

  console.log(
    `[cron/task-reminders] scanned=${tasks.length} sent=${sent} skipped=${skipped} ledger=${hasReminderLedger}`
  );

  return NextResponse.json({ ok: true, scanned: tasks.length, sent, skipped });
}
