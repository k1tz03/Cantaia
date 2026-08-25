// ============================================================
// Ready-made notification messages (FR / EN / DE)
// ============================================================
//
// Email copy lives here, not in `messages/*.json`: an email is rendered on the
// server for ONE recipient in THEIR language (users.preferred_language), which
// is not the request locale next-intl exposes. Same pattern as
// packages/core/src/emails/invite-email.ts.

import { notifyEmail, notifyUser } from "./notify";
import { normalizeNotificationLocale } from "./types";
import type { NotificationDbClient, NotificationLocale } from "./types";

type Dict = Record<NotificationLocale, string>;

function pick(dict: Dict, locale: NotificationLocale): string {
  return dict[locale] || dict.fr;
}

// ── task_assigned ────────────────────────────────────────────────────────────

const TASK_ASSIGNED_SUBJECT: Dict = {
  fr: "Nouvelle tâche vous est assignée",
  en: "A new task is assigned to you",
  de: "Ihnen wurde eine neue Aufgabe zugewiesen",
};

const TASK_ASSIGNED_TITLE: Dict = {
  fr: "Une tâche vous a été assignée",
  en: "A task has been assigned to you",
  de: "Ihnen wurde eine Aufgabe zugewiesen",
};

const TASK_CTA: Dict = { fr: "Ouvrir la tâche", en: "Open the task", de: "Aufgabe öffnen" };
const LABEL_PROJECT: Dict = { fr: "Projet", en: "Project", de: "Projekt" };
const LABEL_DEADLINE: Dict = { fr: "Échéance", en: "Deadline", de: "Termin" };
const LABEL_PRIORITY: Dict = { fr: "Priorité", en: "Priority", de: "Priorität" };

const PRIORITY_LABELS: Record<NotificationLocale, Record<string, string>> = {
  fr: { urgent: "Urgente", high: "Haute", medium: "Moyenne", low: "Basse" },
  en: { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" },
  de: { urgent: "Dringend", high: "Hoch", medium: "Mittel", low: "Niedrig" },
};

export interface TaskNotificationInput {
  id: string;
  title: string;
  due_date?: string | null;
  priority?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
}

function taskBodyLines(
  task: TaskNotificationInput,
  projectName: string | null,
  locale: NotificationLocale
): string {
  const lines: string[] = [`« ${task.title} »`];
  if (projectName) lines.push(`${pick(LABEL_PROJECT, locale)} : ${projectName}`);
  if (task.due_date) lines.push(`${pick(LABEL_DEADLINE, locale)} : ${task.due_date.slice(0, 10)}`);
  if (task.priority) {
    const label = PRIORITY_LABELS[locale]?.[task.priority] || task.priority;
    lines.push(`${pick(LABEL_PRIORITY, locale)} : ${label}`);
  }
  return lines.join("\n");
}

/**
 * Emails the assignee of a task. Skipped when the assignee is the actor
 * (assigning something to yourself must not spam your inbox) or when they
 * opted out of `task_assigned`.
 */
export async function notifyTaskAssigned(
  admin: NotificationDbClient,
  opts: {
    task: TaskNotificationInput;
    actorId?: string | null;
    projectName?: string | null;
    locale?: string | null;
  }
): Promise<boolean> {
  const assigneeId = opts.task.assigned_to;
  if (!assigneeId) return false;

  const locale = normalizeNotificationLocale(opts.locale);

  return notifyUser(admin, {
    userId: assigneeId,
    actorId: opts.actorId ?? null,
    event: "task_assigned",
    subject: pick(TASK_ASSIGNED_SUBJECT, locale),
    title: pick(TASK_ASSIGNED_TITLE, locale),
    body: taskBodyLines(opts.task, opts.projectName ?? null, locale),
    ctaLabel: pick(TASK_CTA, locale),
    ctaPath: "/tasks",
    locale: opts.locale ?? null,
  });
}

// ── deadline_soon ────────────────────────────────────────────────────────────

const DEADLINE_SUBJECT_TODAY: Dict = {
  fr: "Tâche à échéance aujourd'hui",
  en: "Task due today",
  de: "Aufgabe heute fällig",
};

const DEADLINE_SUBJECT_SOON: Dict = {
  fr: "Tâche à échéance prochaine",
  en: "Task due soon",
  de: "Aufgabe bald fällig",
};

const DEADLINE_TITLE_TODAY: Dict = {
  fr: "Échéance aujourd'hui",
  en: "Due today",
  de: "Heute fällig",
};

function deadlineTitleIn(days: number, locale: NotificationLocale): string {
  if (days <= 0) return pick(DEADLINE_TITLE_TODAY, locale);
  if (locale === "en") return `Due in ${days} day${days > 1 ? "s" : ""}`;
  if (locale === "de") return `Fällig in ${days} Tag${days > 1 ? "en" : ""}`;
  return `Échéance dans ${days} jour${days > 1 ? "s" : ""}`;
}

/**
 * Deadline reminder sent by /api/cron/task-reminders.
 * `daysAhead` is 0 for "due today", 3 for the J-3 sweep, or whatever the task's
 * own `reminder` field (1_day / 3_days / 1_week) asked for.
 */
export async function notifyTaskDeadline(
  admin: NotificationDbClient,
  opts: {
    task: TaskNotificationInput;
    recipientId: string;
    daysAhead: number;
    projectName?: string | null;
    locale?: string | null;
  }
): Promise<boolean> {
  const locale = normalizeNotificationLocale(opts.locale);

  return notifyUser(admin, {
    userId: opts.recipientId,
    event: "deadline_soon",
    subject: pick(opts.daysAhead <= 0 ? DEADLINE_SUBJECT_TODAY : DEADLINE_SUBJECT_SOON, locale),
    title: deadlineTitleIn(opts.daysAhead, locale),
    body: taskBodyLines(opts.task, opts.projectName ?? null, locale),
    ctaLabel: pick(TASK_CTA, locale),
    ctaPath: "/tasks",
    locale: opts.locale ?? null,
  });
}

// ── support_reply ────────────────────────────────────────────────────────────

const SUPPORT_REPLY_SUBJECT: Dict = {
  fr: "Réponse du support Cantaia",
  en: "Reply from Cantaia support",
  de: "Antwort vom Cantaia-Support",
};

const SUPPORT_REPLY_TITLE: Dict = {
  fr: "Le support vous a répondu",
  en: "Support has replied",
  de: "Der Support hat geantwortet",
};

const SUPPORT_CTA: Dict = {
  fr: "Voir le ticket",
  en: "View the ticket",
  de: "Ticket ansehen",
};

const SUPPORT_NEW_SUBJECT: Dict = {
  fr: "Nouveau ticket support",
  en: "New support ticket",
  de: "Neues Support-Ticket",
};

const SUPPORT_NEW_TITLE: Dict = {
  fr: "Un nouveau ticket a été ouvert",
  en: "A new ticket has been opened",
  de: "Ein neues Ticket wurde eröffnet",
};

const SUPPORT_USER_REPLY_SUBJECT: Dict = {
  fr: "Nouvelle réponse sur un ticket support",
  en: "New reply on a support ticket",
  de: "Neue Antwort auf ein Support-Ticket",
};

/** Truncates a message body for the email preview. */
function excerpt(text: string, max = 400): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

/** Admin answered a user's ticket → email the ticket owner. */
export async function notifySupportReply(
  admin: NotificationDbClient,
  opts: {
    recipientId: string;
    actorId?: string | null;
    ticketId: string;
    ticketSubject: string;
    message: string;
    locale?: string | null;
  }
): Promise<boolean> {
  const locale = normalizeNotificationLocale(opts.locale);

  return notifyUser(admin, {
    userId: opts.recipientId,
    actorId: opts.actorId ?? null,
    event: "support_reply",
    subject: `${pick(SUPPORT_REPLY_SUBJECT, locale)} — ${opts.ticketSubject}`,
    title: pick(SUPPORT_REPLY_TITLE, locale),
    body: `« ${opts.ticketSubject} »\n\n${excerpt(opts.message)}`,
    ctaLabel: pick(SUPPORT_CTA, locale),
    ctaPath: `/support/${opts.ticketId}`,
    locale: opts.locale ?? null,
  });
}

/**
 * A user opened a ticket (or replied on one) → alert the org admins.
 * Recipients are raw addresses: they may be superadmins outside the org, and
 * an internal alert must not be silenced by the recipient's product prefs.
 */
export async function notifySupportTeam(
  opts: {
    to: string[];
    ticketId: string;
    ticketSubject: string;
    message: string;
    kind: "created" | "replied";
    authorName?: string | null;
    locale?: string | null;
  }
): Promise<number> {
  const locale = normalizeNotificationLocale(opts.locale);
  const subject = pick(
    opts.kind === "created" ? SUPPORT_NEW_SUBJECT : SUPPORT_USER_REPLY_SUBJECT,
    locale
  );

  const bodyHeader = opts.authorName ? `${opts.authorName} — « ${opts.ticketSubject} »` : `« ${opts.ticketSubject} »`;

  const recipients = Array.from(new Set(opts.to.filter((a) => a && a.includes("@"))));
  let sent = 0;

  for (const to of recipients) {
    const ok = await notifyEmail({
      to,
      subject: `${subject} — ${opts.ticketSubject}`,
      title: pick(opts.kind === "created" ? SUPPORT_NEW_TITLE : SUPPORT_REPLY_TITLE, locale),
      body: `${bodyHeader}\n\n${excerpt(opts.message)}`,
      ctaLabel: pick(SUPPORT_CTA, locale),
      ctaPath: `/super-admin/support/${opts.ticketId}`,
      locale: opts.locale ?? null,
    });
    if (ok) sent++;
  }

  return sent;
}
