"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  signInWithMicrosoftAction,
  signInWithGoogleAction,
} from "@/app/[locale]/(auth)/actions";
import { Loader2 } from "lucide-react";
import { OnboardingShell } from "@/components/onboarding/OnboardingShell";
import { StepTransition } from "@/components/onboarding/StepTransition";
import { WelcomeStep } from "@/components/onboarding/steps/WelcomeStep";
import { ProfileStep } from "@/components/onboarding/steps/ProfileStep";
import type { ProfileData } from "@/components/onboarding/steps/ProfileStep";
import { EmailConnectionStep } from "@/components/onboarding/steps/EmailConnectionStep";
import { FirstProjectStep } from "@/components/onboarding/steps/FirstProjectStep";
import { FeatureDiscoveryStep } from "@/components/onboarding/steps/FeatureDiscoveryStep";
import { CelebrationStep } from "@/components/onboarding/steps/CelebrationStep";

const TOTAL_STEPS = 6;

interface OnboardingStatus {
  onboarding_completed: boolean;
  has_email_connection: boolean;
  has_project: boolean;
  organization_id: string | null;
  current_step?: number;
  first_name?: string;
  last_name?: string;
  job_title?: string;
  org_name?: string;
  email_count?: number;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  // Profile state
  const [profile, setProfile] = useState<ProfileData>({
    firstName: "",
    lastName: "",
    jobTitle: "",
    companySize: "",
    projectTypes: [],
    orgName: "",
  });

  // Email / project state
  const [emailCount, setEmailCount] = useState(0);
  const [hasConnection, setHasConnection] = useState(false);
  const [hasProject, setHasProject] = useState(false);

  // Fetch onboarding status on mount
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }

    fetch("/api/user/onboarding")
      .then((r) => r.json())
      .then((data: OnboardingStatus) => {
        if (data.onboarding_completed) {
          router.push("/mail");
          return;
        }
        setStatus(data);
        setHasConnection(data.has_email_connection);
        setHasProject(data.has_project);
        setEmailCount(data.email_count || 0);

        // Populate profile from server data
        setProfile((prev) => ({
          ...prev,
          firstName: data.first_name || user.user_metadata?.first_name || "",
          lastName: data.last_name || user.user_metadata?.last_name || "",
          jobTitle: data.job_title || "",
          orgName: data.org_name || "",
        }));

        // Restore step if saved
        if (data.current_step && data.current_step >= 1 && data.current_step <= TOTAL_STEPS) {
          setStep(data.current_step);
        }

        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [authLoading, user, router]);

  // Save step to server
  const saveStep = useCallback(
    async (newStep: number) => {
      try {
        await fetch("/api/user/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ current_step: newStep }),
        });
      } catch {
        // Non-critical
      }
    },
    []
  );

  const goNext = useCallback(() => {
    setDirection(1);
    setStep((prev) => {
      const next = Math.min(prev + 1, TOTAL_STEPS);
      saveStep(next);
      return next;
    });
  }, [saveStep]);

  const goBack = useCallback(() => {
    setDirection(-1);
    setStep((prev) => {
      const next = Math.max(prev - 1, 1);
      saveStep(next);
      return next;
    });
  }, [saveStep]);

  // --- Step handlers ---

  const handleProfileContinue = useCallback(
    async (data: ProfileData) => {
      setProfile(data);
      try {
        await fetch("/api/user/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: data.firstName,
            last_name: data.lastName,
            job_title: data.jobTitle,
          }),
        });
      } catch {
        // Non-critical
      }
      goNext();
    },
    [goNext]
  );

  const handleEmailConnect = useCallback(
    async (provider: "microsoft" | "google") => {
      if (!status?.organization_id) return;

      // Save current step before OAuth redirect
      await saveStep(3);

      const action =
        provider === "microsoft"
          ? signInWithMicrosoftAction
          : signInWithGoogleAction;

      const result = await action({
        linkToOrg: status.organization_id,
        next: "/onboarding",
      });

      if (result?.url) {
        window.location.href = result.url;
      }
    },
    [status, saveStep]
  );

  const handleProjectContinue = useCallback(
    async (project: {
      name: string;
      client: string;
      city: string;
      type: string;
      color: string;
    }) => {
      try {
        const res = await fetch("/api/projects/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: project.name,
            client_name: project.client || null,
            city: project.city || null,
            color: project.color,
            status: "active",
            currency: "CHF",
          }),
        });
        if (res.ok) {
          setHasProject(true);
        }
      } catch {
        // Non-critical
      }
      goNext();
    },
    [goNext]
  );

  const handleLaunch = useCallback(async () => {
    try {
      await fetch("/api/user/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarding_completed: true }),
      });
    } catch {
      // Non-critical
    }
    router.push("/mail");
  }, [router]);

  // --- Loading ---
  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F0F11]">
        <Loader2 className="h-8 w-8 animate-spin text-[#F97316]" />
      </div>
    );
  }

  // --- Render ---
  const showSkip = step === 3 || step === 4;

  return (
    <OnboardingShell
      currentStep={step}
      totalSteps={TOTAL_STEPS}
      onBack={step > 1 ? goBack : undefined}
      onSkip={showSkip ? goNext : undefined}
      showSkip={showSkip}
    >
      <StepTransition stepKey={step} direction={direction}>
        {step === 1 && (
          <WelcomeStep firstName={profile.firstName} onContinue={goNext} />
        )}
        {step === 2 && (
          <ProfileStep profile={profile} onContinue={handleProfileContinue} />
        )}
        {step === 3 && (
          <EmailConnectionStep
            hasConnection={hasConnection}
            emailCount={emailCount}
            onConnect={handleEmailConnect}
            onContinue={goNext}
            onSkip={goNext}
          />
        )}
        {step === 4 && (
          <FirstProjectStep onContinue={handleProjectContinue} onSkip={goNext} />
        )}
        {step === 5 && <FeatureDiscoveryStep onContinue={goNext} />}
        {step === 6 && (
          <CelebrationStep
            emailCount={emailCount}
            hasProject={hasProject}
            onLaunch={handleLaunch}
          />
        )}
      </StepTransition>
    </OnboardingShell>
  );
}
