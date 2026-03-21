import { Mail, FileText, Hand, Shield } from "lucide-react";
import type { Task, TaskStatus, TaskPriority, TaskSource } from "@cantaia/database";

export type ViewMode = "list" | "kanban";
export type SortField = "title" | "due_date" | "priority" | "status" | "created_at";
export type SortDir = "asc" | "desc";

export const PRIORITY_ORDER: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
export const STATUS_ORDER: Record<TaskStatus, number> = { todo: 0, in_progress: 1, waiting: 2, done: 3, cancelled: 4 };

export const KANBAN_COLUMNS: TaskStatus[] = ["todo", "in_progress", "waiting", "done", "cancelled"];

export function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === "done" || task.status === "cancelled") return false;
  return task.due_date < new Date().toISOString().split("T")[0];
}

export function isDueToday(task: Task): boolean {
  if (!task.due_date || task.status === "done" || task.status === "cancelled") return false;
  return task.due_date === new Date().toISOString().split("T")[0];
}

export function isDueThisWeek(task: Task): boolean {
  if (!task.due_date || task.status === "done" || task.status === "cancelled") return false;
  const today = new Date();
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
  const dd = task.due_date;
  const todayStr = today.toISOString().split("T")[0];
  const endStr = endOfWeek.toISOString().split("T")[0];
  return dd >= todayStr && dd <= endStr;
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

export const SOURCE_CONFIG: Record<TaskSource, { icon: React.ElementType; label: string }> = {
  email: { icon: Mail, label: "Email" },
  meeting: { icon: FileText, label: "PV" },
  manual: { icon: Hand, label: "Manuel" },
  reserve: { icon: Shield, label: "Reserve" },
};
