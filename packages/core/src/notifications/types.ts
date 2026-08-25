// ============================================================
// Notification events + shared types
// ============================================================
//
// Cantaia sent exactly TWO transactional emails in the whole product before
// this module (invitation + daily briefing). Every other "notification" was a
// localStorage toggle that piloted nothing. These are the standard event keys —
// they double as the preference keys stored in `users.notification_prefs`
// (migration 092, JSONB, DEFAULT '{}' → an absent key means ENABLED).

export const NOTIFICATION_EVENTS = [
  "task_assigned",
  "report_submitted",
  "offer_received",
  "support_reply",
  "deadline_soon",
  "credits_low",
  "pv_sent",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export type NotificationLocale = "fr" | "en" | "de";

/** Normalises whatever `users.preferred_language` holds into a supported locale. */
export function normalizeNotificationLocale(input?: string | null): NotificationLocale {
  const l = (input || "").toLowerCase().slice(0, 2);
  return l === "en" || l === "de" ? l : "fr";
}

/**
 * Minimal structural type for the Supabase admin client, so `@cantaia/core`
 * does not have to depend on `@supabase/supabase-js` (the package is imported
 * by both server routes and — via the barrel — client bundles).
 *
 * `from()` is deliberately declared with method syntax and an `any` return:
 * the generated `Database` types make the real PostgREST builder chain
 * invariant on table/column literals, and every call site in the app already
 * goes through `(admin as any)` for the same reason.
 */
export interface NotificationDbClient {
  from(table: string): any;
}
