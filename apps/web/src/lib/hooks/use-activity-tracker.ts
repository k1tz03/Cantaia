"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

// ============================================================
// Cantaia — User Activity Tracker Hook
// ============================================================
// Tracks page views and feature usage events client-side.
// Batches events and flushes via POST /api/tracking/events.
// Respects GDPR cookie consent (cantaia_cookies_consent=accepted).

interface TrackingEvent {
  event_type: string;
  page: string;
  feature: string;
  action: string;
  metadata?: Record<string, unknown>;
  session_id: string;
  duration_ms?: number;
  referrer_page?: string;
}

type TrackEventFn = (
  feature: string,
  action: string,
  metadata?: Record<string, unknown>
) => void;

const FLUSH_INTERVAL_MS = 5_000;
const MAX_BATCH_SIZE = 10;
const API_ENDPOINT = "/api/tracking/events";

/** Map pathname segments to feature names */
const FEATURE_MAP: Record<string, string> = {
  mail: "mail",
  dashboard: "dashboard",
  projects: "projects",
  tasks: "tasks",
  submissions: "submissions",
  plans: "plans",
  chat: "chat",
  suppliers: "suppliers",
  "cantaia-prix": "cantaia-prix",
  briefing: "briefing",
  visits: "visits",
  "pv-chantier": "pv",
  settings: "settings",
  support: "support",
  "site-reports": "site-reports",
  direction: "direction",
  admin: "admin",
};

/** Project sub-page tabs map to their own feature */
const PROJECT_SUB_FEATURES: Record<string, string> = {
  plans: "plans",
  emails: "mail",
  tasks: "tasks",
  submissions: "submissions",
  meetings: "pv",
  visits: "visits",
  planning: "planning",
  closure: "closure",
  "site-reports": "site-reports",
  settings: "settings",
};

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = sessionStorage.getItem("cantaia_session_id");
  if (!sid) {
    sid = `s_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("cantaia_session_id", sid);
  }
  return sid;
}

function hasConsent(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.includes("cantaia_cookies_consent=accepted");
}

function resolveFeature(pathname: string): string {
  // Strip locale prefix: /fr/mail → /mail
  const withoutLocale = pathname.replace(/^\/[a-z]{2}\//, "/");
  const segments = withoutLocale.split("/").filter(Boolean);

  if (segments.length === 0) return "dashboard";

  // Project sub-pages: /projects/[id]/plans → "plans"
  if (segments[0] === "projects" && segments.length >= 3) {
    const subPage = segments[2];
    if (PROJECT_SUB_FEATURES[subPage]) {
      return PROJECT_SUB_FEATURES[subPage];
    }
    return "projects";
  }

  return FEATURE_MAP[segments[0]] || segments[0];
}

function flushEvents(events: TrackingEvent[]): void {
  if (events.length === 0) return;
  const payload = JSON.stringify({ events });

  // Try sendBeacon first (works during unload)
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    const sent = navigator.sendBeacon(
      API_ENDPOINT,
      new Blob([payload], { type: "application/json" })
    );
    if (sent) return;
  }

  // Fallback to fetch with keepalive
  try {
    fetch(API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Fire-and-forget — never throw
    });
  } catch {
    // Silently ignore
  }
}

export function useActivityTracker(userId?: string): {
  trackEvent: TrackEventFn;
} {
  const pathname = usePathname();
  const queueRef = useRef<TrackingEvent[]>([]);
  const pageEnteredAtRef = useRef<number>(Date.now());
  const prevPathRef = useRef<string>("");
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable flush function
  const doFlush = useCallback(() => {
    if (queueRef.current.length === 0) return;
    const batch = queueRef.current.splice(0);
    flushEvents(batch);
  }, []);

  // Enqueue an event
  const enqueue = useCallback(
    (event: TrackingEvent) => {
      queueRef.current.push(event);
      if (queueRef.current.length >= MAX_BATCH_SIZE) {
        doFlush();
      }
    },
    [doFlush]
  );

  // Public trackEvent
  const trackEvent: TrackEventFn = useCallback(
    (feature: string, action: string, metadata?: Record<string, unknown>) => {
      if (!hasConsent() || !userId) return;
      enqueue({
        event_type: "feature_use",
        page: pathname,
        feature,
        action,
        metadata,
        session_id: getSessionId(),
      });
    },
    [userId, pathname, enqueue]
  );

  // Flush interval setup
  useEffect(() => {
    flushTimerRef.current = setInterval(doFlush, FLUSH_INTERVAL_MS);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, [doFlush]);

  // Unload / visibilitychange flush
  useEffect(() => {
    const handleUnload = () => {
      // Send duration for current page before leaving
      if (userId && hasConsent() && prevPathRef.current) {
        const duration = Date.now() - pageEnteredAtRef.current;
        queueRef.current.push({
          event_type: "page_leave",
          page: prevPathRef.current,
          feature: resolveFeature(prevPathRef.current),
          action: "page_leave",
          session_id: getSessionId(),
          duration_ms: duration,
        });
      }
      // Flush remaining
      if (queueRef.current.length > 0) {
        const payload = JSON.stringify({ events: queueRef.current.splice(0) });
        if (navigator.sendBeacon) {
          navigator.sendBeacon(
            API_ENDPOINT,
            new Blob([payload], { type: "application/json" })
          );
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        handleUnload();
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [userId]);

  // Track page_view on route change
  useEffect(() => {
    if (!hasConsent() || !userId) return;
    if (pathname === prevPathRef.current) return;

    const now = Date.now();

    // Send duration for previous page
    if (prevPathRef.current) {
      const duration = now - pageEnteredAtRef.current;
      enqueue({
        event_type: "page_duration",
        page: prevPathRef.current,
        feature: resolveFeature(prevPathRef.current),
        action: "page_duration",
        session_id: getSessionId(),
        duration_ms: duration,
        referrer_page: undefined,
      });
    }

    // Track page_view for new page
    enqueue({
      event_type: "page_view",
      page: pathname,
      feature: resolveFeature(pathname),
      action: "page_view",
      session_id: getSessionId(),
      referrer_page: prevPathRef.current || undefined,
    });

    pageEnteredAtRef.current = now;
    prevPathRef.current = pathname;
  }, [pathname, userId, enqueue]);

  return { trackEvent };
}
