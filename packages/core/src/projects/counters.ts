// ============================================================
// Task counters — THE single definition of "open" / "overdue"
// ============================================================
//
// Before this module the product carried FOUR divergent definitions of an
// overdue task (components/tasks/task-utils.ts, /api/ai/generate-alerts,
// /api/ai/executive-summary, /api/admin/team-health), two of which compared a
// DATE column against a full ISO timestamp — so a task due *today* counted as
// late from 00:00 onwards in some surfaces and not in others.
//
// Rules enforced here, once:
//   - "open"    = status is neither done nor cancelled
//   - "overdue" = open AND due_date (date-only, local) is strictly before today
//   - every comparison happens on a `YYYY-MM-DD` string in the LOCAL timezone,
//     never on a Date built from a bare date string (which is parsed as UTC and
//     shifts the day for every timezone west of Greenwich).
//
// Consumers: /api/tasks (count_only), /api/cron/task-reminders,
// /api/admin/team-health, /api/ai/*, components/tasks/*.

export const OPEN_TASK_STATUSES = ["todo", "in_progress", "waiting"] as const;

export type OpenTaskStatus = (typeof OPEN_TASK_STATUSES)[number];

/** Statuses that take a task out of the active workload. */
export const CLOSED_TASK_STATUSES = ["done", "cancelled"] as const;

/** Minimal shape every counter works on — deliberately structural. */
export interface CountableTask {
  status: string;
  due_date?: string | null;
}

/** `YYYY-MM-DD` for *today* in the runtime's local timezone. */
export function todayDateOnly(now: Date = new Date()): string {
  return toDateOnly(now);
}

/** `YYYY-MM-DD` for a Date, local time (never `toISOString()`, which is UTC). */
export function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Normalises whatever the DB / API hands us into `YYYY-MM-DD`.
 * Accepts "2026-04-22", "2026-04-22T00:00:00+02:00", null.
 */
export function dueDateOnly(due: string | null | undefined): string | null {
  if (!due) return null;
  const s = String(due);
  return s.length >= 10 ? s.slice(0, 10) : null;
}

/** Adds `days` to today and returns the local `YYYY-MM-DD`. */
export function dateOnlyFromNow(days: number, now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

/** A task still consuming attention (not done, not cancelled). */
export function isTaskOpen(t: { status: string }): boolean {
  return (OPEN_TASK_STATUSES as readonly string[]).includes(t.status);
}

/** Open AND past its due date (date-only, local). */
export function isTaskOverdue(t: CountableTask, now: Date = new Date()): boolean {
  if (!isTaskOpen(t)) return false;
  const due = dueDateOnly(t.due_date);
  if (!due) return false;
  return due < todayDateOnly(now);
}

/** Open AND due exactly today. */
export function isTaskDueToday(t: CountableTask, now: Date = new Date()): boolean {
  if (!isTaskOpen(t)) return false;
  const due = dueDateOnly(t.due_date);
  if (!due) return false;
  return due === todayDateOnly(now);
}

/**
 * Open AND due between today and the end of the current week (Sunday).
 * Overdue tasks are NOT counted here — they have their own bucket.
 */
export function isTaskDueThisWeek(t: CountableTask, now: Date = new Date()): boolean {
  if (!isTaskOpen(t)) return false;
  const due = dueDateOnly(t.due_date);
  if (!due) return false;
  return due >= todayDateOnly(now) && due <= endOfWeekDateOnly(now);
}

/** Open AND due strictly after the end of the current week (or with no due date). */
export function isTaskLater(t: CountableTask, now: Date = new Date()): boolean {
  if (!isTaskOpen(t)) return false;
  const due = dueDateOnly(t.due_date);
  if (!due) return true; // no deadline → "later", never overdue
  return due > endOfWeekDateOnly(now);
}

/** Open AND due exactly `days` from now (used by the reminder cron). */
export function isTaskDueInDays(t: CountableTask, days: number, now: Date = new Date()): boolean {
  if (!isTaskOpen(t)) return false;
  const due = dueDateOnly(t.due_date);
  if (!due) return false;
  return due === dateOnlyFromNow(days, now);
}

/** Local `YYYY-MM-DD` of the coming Sunday (today included when today IS Sunday). */
export function endOfWeekDateOnly(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // getDay(): 0 = Sunday … 6 = Saturday
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  return toDateOnly(d);
}

export interface TaskCounts {
  total: number;
  open: number;
  overdue: number;
  today: number;
  week: number;
  later: number;
  done: number;
}

/**
 * The canonical counter set. Every tile/badge that shows a task number must go
 * through this so the sidebar, the project hub and /tasks agree.
 */
export function computeTaskCounts(tasks: CountableTask[], now: Date = new Date()): TaskCounts {
  const counts: TaskCounts = { total: 0, open: 0, overdue: 0, today: 0, week: 0, later: 0, done: 0 };
  for (const t of tasks) {
    counts.total++;
    if (t.status === "done") counts.done++;
    if (!isTaskOpen(t)) continue;
    counts.open++;
    if (isTaskOverdue(t, now)) counts.overdue++;
    else if (isTaskDueToday(t, now)) counts.today++;
    if (isTaskDueThisWeek(t, now)) counts.week++;
    if (isTaskLater(t, now)) counts.later++;
  }
  return counts;
}
