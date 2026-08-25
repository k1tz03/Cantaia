// ============================================================
// Per-user notification preferences
// ============================================================
//
// Stored in `users.notification_prefs` (JSONB, migration 092, DEFAULT '{}').
// Semantics: opt-OUT. An absent key means the event is ENABLED — so a freshly
// migrated org receives notifications without anyone having to click anything,
// and a user who unticks one box stores `{"deadline_soon": false}`.

import { NOTIFICATION_EVENTS } from "./types";
import type { NotificationDbClient, NotificationEvent } from "./types";

/** All events enabled — the shape returned when nothing is stored. */
export function defaultNotificationPrefs(): Record<string, boolean> {
  const prefs: Record<string, boolean> = {};
  for (const key of NOTIFICATION_EVENTS) prefs[key] = true;
  return prefs;
}

/**
 * Merges the stored JSONB over the defaults.
 * Anything that is not a strict `false` is treated as enabled — a corrupted or
 * partially-written blob must never silence a notification by accident.
 */
export function mergeNotificationPrefs(stored: unknown): Record<string, boolean> {
  const prefs = defaultNotificationPrefs();
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
      prefs[key] = value !== false;
    }
  }
  return prefs;
}

/**
 * Reads a user's preferences. Defaults to "everything enabled" on any failure
 * (missing column when migration 092 is not applied yet, RLS, network).
 */
export async function getUserNotificationPrefs(
  admin: NotificationDbClient,
  userId: string
): Promise<Record<string, boolean>> {
  try {
    const { data, error } = await admin
      .from("users")
      .select("notification_prefs")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      // Column absent (migration 092 not applied) → notifications stay on.
      console.warn("[notifications] prefs read failed, defaulting to enabled:", error.message);
      return defaultNotificationPrefs();
    }

    return mergeNotificationPrefs(data?.notification_prefs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[notifications] prefs read threw, defaulting to enabled:", message);
    return defaultNotificationPrefs();
  }
}

/** True when the user has not explicitly opted out of this event. */
export function isNotificationEnabled(
  prefs: Record<string, boolean> | null | undefined,
  event: NotificationEvent | string
): boolean {
  if (!prefs) return true;
  return prefs[event] !== false;
}

/**
 * Keeps only the known event keys and coerces to booleans — used by the
 * settings route so a client cannot stuff arbitrary JSON into the column.
 */
export function sanitizeNotificationPrefs(input: unknown): Record<string, boolean> {
  const clean: Record<string, boolean> = {};
  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const key of NOTIFICATION_EVENTS) {
      const value = (input as Record<string, unknown>)[key];
      if (typeof value === "boolean") clean[key] = value;
    }
  }
  return clean;
}
