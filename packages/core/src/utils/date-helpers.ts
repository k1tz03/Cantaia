import { format, formatDistanceToNow, isAfter, isBefore, addDays } from "date-fns";
import { fr, de, enUS } from "date-fns/locale";

const localeMap = {
  fr,
  de,
  en: enUS,
} as const;

type LocaleKey = keyof typeof localeMap;

/**
 * Format a date for display (e.g., "16 février 2026")
 */
export function formatDate(
  date: string | Date,
  locale: LocaleKey = "fr"
): string {
  return format(new Date(date), "d MMMM yyyy", {
    locale: localeMap[locale],
  });
}

/**
 * Format a date as short (e.g., "16.02.2026")
 */
export function formatDateShort(date: string | Date): string {
  return format(new Date(date), "dd.MM.yyyy");
}

/**
 * Format a datetime (e.g., "16.02.2026 14:30")
 */
export function formatDateTime(date: string | Date): string {
  return format(new Date(date), "dd.MM.yyyy HH:mm");
}

/**
 * Format relative time (e.g., "il y a 3 heures")
 */
export function formatRelative(
  date: string | Date,
  locale: LocaleKey = "fr"
): string {
  return formatDistanceToNow(new Date(date), {
    addSuffix: true,
    locale: localeMap[locale],
  });
}

/**
 * Check if a task deadline is overdue
 */
export function isOverdue(dueDate: string | Date): boolean {
  return isBefore(new Date(dueDate), new Date());
}

/**
 * Check if a deadline is approaching (within N days)
 */
export function isApproaching(
  dueDate: string | Date,
  withinDays = 3
): boolean {
  const deadline = new Date(dueDate);
  const threshold = addDays(new Date(), withinDays);
  return isAfter(deadline, new Date()) && isBefore(deadline, threshold);
}
