"use client";
import { useState, useCallback, useEffect, useMemo } from "react";
import { TOUR_STEPS, type TourStep } from "./tour-steps";

const STORAGE_KEY = "cantaia_tour_completed";
const STEP_KEY = "cantaia_tour_step";
/** The tour points at the desktop sidebar, so it needs the desktop layout. */
const MIN_WIDTH = 1024;

export function useTour() {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  /** Steps whose target actually exists in the DOM right now. */
  const [visibleSteps, setVisibleSteps] = useState<TourStep[]>(TOUR_STEPS);

  // Auto-start gate: desktop only, not already completed, and only once
  // the server says onboarding is finished. Starting mid-onboarding put a
  // spotlight overlay on top of the wizard.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < MIN_WIDTH) return;
    if (localStorage.getItem(STORAGE_KEY) === "true") return;

    let cancelled = false;

    (async () => {
      let onboarded = false;
      try {
        const res = await fetch("/api/user/onboarding");
        if (res.ok) {
          const data = await res.json();
          onboarded = data?.onboarding_completed === true;
        }
      } catch {
        // Network failure: stay silent rather than launching a tour over
        // a page whose state we can't confirm.
        return;
      }
      if (cancelled || !onboarded) return;

      const savedStep = localStorage.getItem(STEP_KEY);
      setCurrentStep(savedStep ? parseInt(savedStep, 10) : 0);
      setActive(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep only steps whose target is really on the page. A step with no
  // target used to render an overlay anchored at 0,0 with no spotlight.
  useEffect(() => {
    if (!active) return;
    function recompute() {
      setVisibleSteps(
        TOUR_STEPS.filter((s) => !!document.querySelector(s.target))
      );
    }
    recompute();
    // Nav items mount lazily (role-gated links, badges) — re-check shortly.
    const timer = setTimeout(recompute, 600);
    return () => clearTimeout(timer);
  }, [active]);

  // Stop the tour if the window shrinks below the desktop breakpoint.
  useEffect(() => {
    if (!active) return;
    function onResize() {
      if (window.innerWidth < MIN_WIDTH) setActive(false);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active]);

  const steps = useMemo(
    () => (visibleSteps.length > 0 ? visibleSteps : TOUR_STEPS),
    [visibleSteps]
  );
  const totalSteps = steps.length;
  const safeIndex = Math.min(currentStep, totalSteps - 1);

  const finish = useCallback(() => {
    setActive(false);
    localStorage.setItem(STORAGE_KEY, "true");
    localStorage.removeItem(STEP_KEY);
  }, []);

  const next = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev < totalSteps - 1) {
        const newStep = prev + 1;
        localStorage.setItem(STEP_KEY, String(newStep));
        return newStep;
      }
      finish();
      return prev;
    });
  }, [totalSteps, finish]);

  const prev = useCallback(() => {
    setCurrentStep((p) => {
      if (p <= 0) return p;
      const newStep = p - 1;
      localStorage.setItem(STEP_KEY, String(newStep));
      return newStep;
    });
  }, []);

  const skip = useCallback(() => {
    finish();
  }, [finish]);

  const restart = useCallback(() => {
    setCurrentStep(0);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(STEP_KEY, "0");
    setActive(true);
  }, []);

  return {
    active,
    currentStep: safeIndex,
    totalSteps,
    step: steps[safeIndex] || steps[0],
    next,
    prev,
    skip,
    restart,
  };
}
