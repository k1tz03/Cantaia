import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/**
 * Server-side Sentry (Node + Edge runtimes).
 *
 * RGPD note — why there is no cookie-consent gate here:
 * consent is stored in the `cantaia_cookies_consent` cookie and read by the
 * client bundle (see CookieConsent.tsx), which can enable/disable the browser
 * SDK per visitor. The server SDK is initialised ONCE per serverless instance,
 * before any request exists, and is shared by every visitor hitting that
 * instance — there is no per-request switch to flip. Gating it on consent is
 * therefore not implementable at this layer.
 *
 * The retained mitigation is aggressive PII scrubbing: `sendDefaultPii` stays
 * off, and `beforeSend` strips request headers/cookies/body, query strings and
 * every user field except the opaque id before the event leaves the process.
 */

/** Strip everything that can carry personal data out of a server event. */
function scrubPii(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // Request: drop headers (auth tokens, cookies), cookies, body and query string.
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (typeof event.request.url === "string") {
      // Keep the path for triage, drop the query (can carry emails, tokens…)
      event.request.url = event.request.url.split("?")[0];
    }
  }

  // User: keep only the opaque id — no email, username, ip.
  if (event.user) {
    event.user = event.user.id ? { id: String(event.user.id) } : {};
  }

  // Free-form context bags frequently hold request payloads.
  delete event.extra;

  return event;
}

const sentryOptions = {
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production",
  tracesSampleRate: 0.1,
  debug: false,
  // Never let the SDK attach IP / cookies / headers on its own.
  sendDefaultPii: false,
  beforeSend: scrubPii,
};

export async function register() {
  // No DSN configured → do not initialise the SDK at all.
  if (!sentryOptions.dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init(sentryOptions);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sentryOptions);
  }
}

export const onRequestError = Sentry.captureRequestError;
