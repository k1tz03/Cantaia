"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  signInWithMicrosoftAction,
  signInWithGoogleAction,
} from "@/app/[locale]/(auth)/actions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
  // GET /api/user/onboarding nests the profile under `user_profile` — reading
  // first_name/last_name at the top level never worked (always undefined).
  user_profile?: {
    first_name?: string;
    last_name?: string;
    job_title?: string;
    company_size?: string | null;
    project_types?: string[] | null;
  };
  org_name?: string;
  email_count?: number;
}

export default function OnboardingPage() {
  const router = useRouter();
  const t = useTranslations("onboarding");
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

  // Failures used to be swallowed, so a broken step looked like a working
  // one. Each is surfaced in its step and blocks the advance.
  const [emailError, setEmailError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [projectSaving, setProjectSaving] = useState(false);
  const [imapPending, setImapPending] = useState(false);

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

        // Populate profile from server data (nested under user_profile)
        setProfile((prev) => ({
          ...prev,
          firstName:
            data.user_profile?.first_name ||
            user.user_metadata?.first_name ||
            "",
          lastName:
            data.user_profile?.last_name ||
            user.user_metadata?.last_name ||
            "",
          jobTitle: data.user_profile?.job_title || "",
          companySize: data.user_profile?.company_size || "",
          projectTypes: data.user_profile?.project_types || [],
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
        // The API reads `step` (not `current_step`) — the old key was ignored,
        // so onboarding resume never persisted the progress.
        await fetch("/api/user/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: newStep }),
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
        const res = await fetch("/api/user/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            first_name: data.firstName,
            last_name: data.lastName,
            job_title: data.jobTitle,
          }),
        });
        // The profile is editable later from Settings, so a failure here
        // shouldn't trap the user on step 2 — but it must not pass silently
        // either, or they'd reach the end wondering where their name went.
        if (!res.ok) {
          toast.error(t("errProfileSave"));
        }
      } catch {
        toast.error(t("errProfileSave"));
      }
      // Persist the extra step-2 fields — company size, project types and the
      // org name — which /api/user/profile does not accept. Without this they
      // were collected and then dropped. Non-critical: editable later.
      try {
        await fetch("/api/user/onboarding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile_updates: {
              company_size: data.companySize,
              project_types: data.projectTypes,
            },
            ...(data.orgName ? { org_name: data.orgName } : {}),
          }),
        });
      } catch {
        // Non-critical — refinements the user can complete from Settings.
      }
      goNext();
    },
    [goNext, t]
  );

  const handleEmailConnect = useCallback(
    async (provider: "microsoft" | "google") => {
      setEmailError(null);

      if (!status?.organization_id) {
        setEmailError(t("errOrgNotReady"));
        return;
      }

      // Save current step before OAuth redirect
      await saveStep(3);

      const action =
        provider === "microsoft"
          ? signInWithMicrosoftAction
          : signInWithGoogleAction;

      try {
        const result = await action({
          linkToOrg: status.organization_id,
          next: "/onboarding",
        });

        if (result?.url) {
          window.location.href = result.url;
          return;
        }
        setEmailError(
          (result as { error?: string })?.error || t("errConnectFailed")
        );
      } catch {
        setEmailError(t("errConnectNetwork"));
      }
    },
    [status, saveStep, t]
  );

  // IMAP is configured in Settings, not here — remember the intent and
  // route there once onboarding finishes.
  const handleChooseImap = useCallback(() => {
    setImapPending(true);
    try {
      localStorage.setItem("cantaia_onboarding_imap_pending", "true");
    } catch {
      // Private mode / storage disabled — the in-memory flag still works.
    }
    goNext();
  }, [goNext]);

  const handleProjectContinue = useCallback(
    async (project: {
      name: string;
      code: string;
      client: string;
      city: string;
      type: string;
      color: string;
    }) => {
      setProjectError(null);
      setProjectSaving(true);
      try {
        const res = await fetch("/api/projects/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: project.name,
            code: project.code || undefined,
            client_name: project.client || null,
            city: project.city || null,
            color: project.color,
            status: "active",
            currency: "CHF",
          }),
        });

        if (!res.ok) {
          // Stay on the step: advancing here used to hide the failure and
          // land the user on a celebration screen for a project that
          // never existed.
          let message = t("errProjectCreate", { status: res.status });
          try {
            const body = await res.json();
            if (body?.error) message = body.error;
          } catch {
            /* non-JSON error body */
          }
          setProjectError(message);
          setProjectSaving(false);
          return;
        }

        setHasProject(true);
      } catch {
        setProjectError(t("errProjectNetwork"));
        setProjectSaving(false);
        return;
      }
      setProjectSaving(false);
      goNext();
    },
    [goNext, t]
  );

  const handleLaunch = useCallback(async () => {
    try {
      await fetch("/api/user/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complete: true }),
      });
    } catch {
      // Non-critical
    }

    let wantsImap = imapPending;
    try {
      wantsImap =
        wantsImap ||
        localStorage.getItem("cantaia_onboarding_imap_pending") === "true";
      localStorage.removeItem("cantaia_onboarding_imap_pending");
    } catch {
      /* storage disabled */
    }

    // Everyone lands on /mail — except the IMAP path, which needs Settings.
    router.push(wantsImap ? "/settings?tab=outlook&imap=1" : "/mail");
  }, [router, imapPending]);

  // --- Loading ---
  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F0F11]">
        <Loader2 className="h-8 w-8 animate-spin text-[#F97316]" />
      </div>
    );
  }

  // --- Render ---
  // Steps 3 and 4 are optional. The shell header is the ONE place that
  // offers to skip them — the steps themselves no longer carry their own
  // "plus tard" link.
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
            onChooseImap={handleChooseImap}
            error={emailError}
          />
        )}
        {step === 4 && (
          <FirstProjectStep
            onContinue={handleProjectContinue}
            error={projectError}
            saving={projectSaving}
          />
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
