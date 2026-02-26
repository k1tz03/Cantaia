// ============================================================
// Cantaia — Shared Types & Utility Functions
// ============================================================
// Mock data has been removed. All data now comes from Supabase.
// This file retains only reusable interfaces, types, and formatters.

import type { EmailRecord, PlanDiscipline, PlanStatus } from "@cantaia/database";

// ---------- Interfaces & Types ----------

/** Extended email type with read status (not in DB schema yet) */
export interface EmailWithReadStatus extends EmailRecord {
  is_read: boolean;
}

export type DisplayMode = "multi_project" | "mono_project";

export interface MockUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  project_ids: string[];
}

export interface ActivityItem {
  id: string;
  type: "email_classified" | "task_created" | "pv_generated" | "meeting_scheduled" | "task_completed" | "project_created";
  projectId: string;
  projectName: string;
  projectColor: string;
  description: string;
  timestamp: string;
}

export interface MockExtractedTask {
  id: string;
  title: string;
  responsible: string | null;
  deadline: string | null;
}

export interface MockPlan {
  id: string;
  project_id: string;
  plan_number: string;
  plan_title: string;
  discipline: PlanDiscipline | null;
  status: PlanStatus;
  current_version: string;
  version_count: number;
  version_date: string;
  author_company: string | null;
  lot_name: string | null;
  zone: string | null;
  scale: string | null;
}

// ---------- Utility Functions ----------

export function formatCurrency(amount: number, currency: string = "CHF"): string {
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function getRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
  }
  if (isYesterday) {
    return "Hier";
  }

  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays < 7) {
    const days = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
    return days[date.getDay()];
  }

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");

  if (now.getFullYear() !== date.getFullYear()) {
    return `${dd}.${mm}.${date.getFullYear()}`;
  }

  return `${dd}.${mm}`;
}

/** Pluralize helper — returns singular or plural label based on count */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count <= 1 ? singular : plural}`;
}
