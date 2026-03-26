"use client";
import { useState, useCallback, useEffect } from "react";
import { TOUR_STEPS } from "./tour-steps";

const STORAGE_KEY = "cantaia_tour_completed";
const STEP_KEY = "cantaia_tour_step";

export function useTour() {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  // Check if tour should auto-start
  useEffect(() => {
    const completed = localStorage.getItem(STORAGE_KEY);
    if (completed !== "true") {
      const savedStep = localStorage.getItem(STEP_KEY);
      setCurrentStep(savedStep ? parseInt(savedStep, 10) : 0);
      // Delay start by 1.5s to let page render
      const timer = setTimeout(() => setActive(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const next = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      const newStep = currentStep + 1;
      setCurrentStep(newStep);
      localStorage.setItem(STEP_KEY, String(newStep));
    } else {
      // Tour complete
      setActive(false);
      localStorage.setItem(STORAGE_KEY, "true");
      localStorage.removeItem(STEP_KEY);
    }
  }, [currentStep]);

  const prev = useCallback(() => {
    if (currentStep > 0) {
      const newStep = currentStep - 1;
      setCurrentStep(newStep);
      localStorage.setItem(STEP_KEY, String(newStep));
    }
  }, [currentStep]);

  const skip = useCallback(() => {
    setActive(false);
    localStorage.setItem(STORAGE_KEY, "true");
    localStorage.removeItem(STEP_KEY);
  }, []);

  const restart = useCallback(() => {
    setCurrentStep(0);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(STEP_KEY, "0");
    setActive(true);
  }, []);

  return {
    active,
    currentStep,
    totalSteps: TOUR_STEPS.length,
    step: TOUR_STEPS[currentStep] || TOUR_STEPS[0],
    next,
    prev,
    skip,
    restart,
  };
}
