import { Mail, FileText, Hand, Shield } from "lucide-react";
import {
  isTaskDueThisWeek,
  isTaskDueToday,
  isTaskLater,
  isTaskOpen,
  isTaskOverdue,
} from "@cantaia/core/projects/counters";
import type { Task, TaskStatus, TaskPriority, TaskSource } from "@cantaia/database";

// "Open" / "overdue" / "due today" now come from @cantaia/core/projects/counters —
// the single definition shared with /api/tasks?count_only=true, the reminder
// cron, team-health and the AI routes. The local copies that used to live here
// compared a DATE against `new Date().toISOString()` (UTC), which drifted by a
// day for any user west of Greenwich and disagreed with the server counters.
export {
  OPEN_TASK_STATUSES,
  isTaskOpen,
  isTaskOverdue,
  isTaskDueToday,
  isTaskDueThisWeek,
  isTaskLater,
  computeTaskCounts,
} from "@cantaia/core/projects/counters";
export type { TaskCounts } from "@cantaia/core/projects/counters";

export type ViewMode = "list" | "kanban";
export type SortField = "title" | "due_date" | "priority" | "status" | "created_at";
export type SortDir = "asc" | "desc";

export const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, waiting: 2, done: 3, cancelled: 4 };

export const KANBAN_COLUMNS: TaskStatus[] = ["todo", "in_progress", "waiting", "done", "cancelled"];

// Thin `Task`-typed aliases kept for the existing call sites.
export function isOverdue(task: Task): boolean {
  return isTaskOverdue(task);
}

export function isDueToday(task: Task): boolean {
  return isTaskDueToday(task);
}

export function isDueThisWeek(task: Task): boolean {
  return isTaskDueThisWeek(task);
}

export function isLater(task: Task): boolean {
  return isTaskLater(task);
}

export function isOpen(task: Task): boolean {
  return isTaskOpen(task);
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string; dot: string }> = {
  urgent: { label: "Urgente", color: "text-red-700 dark:text-red-400", bg: "bg-red-500/10", dot: "bg-red-500" },
  high: { label: "Haute", color: "text-red-600", bg: "bg-red-500/10", dot: "bg-red-400" },
  medium: { label: "Moyenne", color: "text-amber-600", bg: "bg-amber-500/10", dot: "bg-amber-400" },
  low: { label: "Basse", color: "text-green-600", bg: "bg-green-500/10", dot: "bg-green-400" },
};

export const SOURCE_CONFIG: Record<TaskSource, { icon: React.ComponentType<any>; label: string }> = {
  email: { icon: Mail, label: "Email" },
  meeting: { icon: FileText, label: "PV" },
  manual: { icon: Hand, label: "Manuel" },
  reserve: { icon: Shield, label: "Reserve" },
};
