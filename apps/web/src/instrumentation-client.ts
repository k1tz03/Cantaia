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

  // Filter out benign browser errors that are not actionable
  ignoreErrors: [
    // Safari/WebKit reports aborted fetches (e.g. during OAuth redirect) as "Load failed"
    "Load failed",
    // Chrome equivalent of the above
    "Failed to fetch",
    // Network errors during page navigation (user clicks link while fetch in flight)
    "NetworkError when attempting to fetch resource",
    // ResizeObserver noise from browser layout recalculations
    "ResizeObserver loop",
    // Next.js RSC navigation cancellations
    "NEXT_REDIRECT",
    // Browser extensions (Google Translate, Grammarly) modify DOM nodes that React owns
    // → removeChild/insertBefore fail because the node was wrapped in <font> tags
    "removeChild",
    "insertBefore",
    // Minified React error #310 = same DOM manipulation issue from extensions
    "Minified React error #310",
    // Google Translate DOM mutations can cause React to see a different hook count
    "Rendered more hooks than during the previous render",
    // Tauri desktop: IPC commands called before ACL permissions are configured
    "not allowed by ACL",
    // Tauri desktop: IPC fetch failures when custom protocol is unavailable
    "Failed to fetch (ipc.localhost)",
    // Tauri desktop: browser APIs (Notification, etc.) missing in WebView
    "Can't find variable: Notification",
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
