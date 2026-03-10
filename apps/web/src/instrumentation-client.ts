import * as Sentry from "@sentry/nextjs";

// Check if cookie consent was given
function hasConsent(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.includes("cantaia_cookies_consent=accepted");
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: process.env.NODE_ENV === "production" && hasConsent(),
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
