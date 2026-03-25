"use client";

// ============================================================
// Cantaia — Activity Tracking Provider
// ============================================================
// Wraps the app with activity tracking context.
// Uses AuthProvider's user.id to identify the user.

import { createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { useActivityTracker } from "@/lib/hooks/use-activity-tracker";

type TrackEventFn = (
  feature: string,
  action: string,
  metadata?: Record<string, unknown>
) => void;

interface ActivityTrackingContextType {
  trackEvent: TrackEventFn;
}

const noop: TrackEventFn = () => {};

const ActivityTrackingContext = createContext<ActivityTrackingContextType>({
  trackEvent: noop,
});

export function ActivityTrackingProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const { trackEvent } = useActivityTracker(user?.id);

  return (
    <ActivityTrackingContext.Provider value={{ trackEvent }}>
      {children}
    </ActivityTrackingContext.Provider>
  );
}

/**
 * Use this hook to track feature usage events from any component.
 * Example: `const { trackEvent } = useTrackEvent();`
 *          `trackEvent("submissions", "create_submission", { project_id: "..." });`
 */
export function useTrackEvent() {
  return useContext(ActivityTrackingContext);
}
