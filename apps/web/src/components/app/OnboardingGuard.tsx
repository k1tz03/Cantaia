"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";

/**
 * Client-side guard that redirects to /onboarding if the user
 * has not completed onboarding. Runs once on mount.
 */
export function OnboardingGuard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const checked = useRef(false);

  useEffect(() => {
    if (loading || !user || checked.current) return;
    checked.current = true;

    fetch("/api/user/onboarding")
      .then((r) => r.json())
      .then((data) => {
        if (data.onboarding_completed === false) {
          router.push("/onboarding");
        }
      })
      .catch(() => {});
  }, [loading, user, router]);

  return null;
}
