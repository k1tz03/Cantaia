// ============================================================
// notifyUser / notifyEmail — the two entry points routes call
// ============================================================
//
// A trigger site should never have to know about Resend, locales, templates or
// preference storage. It calls:
//
//   await notifyUser(admin, {
//     userId, event: "task_assigned", title, body, ctaLabel, ctaPath: "/tasks",
//   });
//
// …and gets `false` back if anything (prefs off, no email, no API key) stopped
// the send. Fire-and-forget is fine — nothing here throws.

import { renderNotificationEmail, renderNotificationText } from "./email-template";
import { isNotificationEnabled, mergeNotificationPrefs } from "./prefs";
import { sendNotificationEmail } from "./send";
import { normalizeNotificationLocale } from "./types";
import type { NotificationDbClient, NotificationEvent, NotificationLocale } from "./types";

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://cantaia.io").replace(/\/+$/, "");
}

/** Builds a locale-prefixed absolute URL from an app path such as `/tasks`. */
export function buildAppUrl(path: string, locale: NotificationLocale): string {
  if (/^https?:\/\//i.test(path)) return path;
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${appBaseUrl()}/${locale}${clean}`;
}

export interface NotifyEmailOptions {
  to: string;
  subject: string;
  title: string;
  body: string;
  ctaLabel?: string;
  /** App path (`/tasks`) or absolute URL. */
  ctaPath?: string;
  footnote?: string;
  locale?: string | null;
  replyTo?: string;
}

/**
 * Renders + sends to a raw address. Used when the recipient has no Cantaia
 * account (external assignee, supplier) — no preference check is possible.
 */
export async function notifyEmail(opts: NotifyEmailOptions): Promise<boolean> {
  const locale = normalizeNotificationLocale(opts.locale);
  const ctaUrl = opts.ctaPath ? buildAppUrl(opts.ctaPath, locale) : undefined;

  const renderOpts = {
    title: opts.title,
    body: opts.body,
    ctaLabel: opts.ctaLabel,
    ctaUrl,
    footnote: opts.footnote,
    locale,
  };

  return sendNotificationEmail({
    to: opts.to,
    subject: opts.subject,
    html: renderNotificationEmail(renderOpts),
    text: renderNotificationText(renderOpts),
    replyTo: opts.replyTo,
  });
}

export interface NotifyUserOptions extends Omit<NotifyEmailOptions, "to"> {
  userId: string;
  event: NotificationEvent;
  /** Skip the send when the recipient is the actor (never notify yourself). */
  actorId?: string | null;
}

/**
 * Resolves the recipient (email + locale), honours `users.notification_prefs`,
 * then sends. Returns false when the notification was intentionally skipped.
 */
export async function notifyUser(
  admin: NotificationDbClient,
  opts: NotifyUserOptions
): Promise<boolean> {
  try {
    if (!opts.userId) return false;
    if (opts.actorId && opts.actorId === opts.userId) return false;

    const { data: recipient, error } = await admin
      .from("users")
      .select("id, email, preferred_language, notification_prefs")
      .eq("id", opts.userId)
      .maybeSingle();

    if (error || !recipient?.email) {
      if (error) {
        // Retry without the JSONB column: migration 092 may not be applied yet.
        const fallback = await admin
          .from("users")
          .select("id, email, preferred_language")
          .eq("id", opts.userId)
          .maybeSingle();
        if (!fallback.data?.email) return false;
        return notifyEmail({
          ...opts,
          to: fallback.data.email,
          locale: opts.locale ?? fallback.data.preferred_language,
        });
      }
      return false;
    }

    // Preferences came back with the recipient row — no second round-trip.
    const prefs = mergeNotificationPrefs(recipient.notification_prefs);
    if (!isNotificationEnabled(prefs, opts.event)) return false;

    return notifyEmail({
      ...opts,
      to: recipient.email,
      locale: opts.locale ?? recipient.preferred_language,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notifications] notifyUser(${opts.event}) failed: ${message}`);
    return false;
  }
}
