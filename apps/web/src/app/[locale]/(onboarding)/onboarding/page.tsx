"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import {
  signInWithMicrosoftAction,
  signInWithGoogleAction,
} from "@/app/[locale]/(auth)/actions";
import {
  Mail,
  FolderPlus,
  Rocket,
  ChevronRight,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@cantaia/ui";

const STEPS = [
  { id: 1, label: "Email", icon: Mail },
  { id: 2, label: "Projet", icon: FolderPlus },
  { id: 3, label: "C'est parti", icon: Rocket },
] as const;

interface OnboardingStatus {
  onboarding_completed: boolean;
  has_email_connection: boolean;
  has_project: boolean;
  organization_id: string | null;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);

  // Step 2 form
  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [city, setCity] = useState("");
  const [creating, setCreating] = useState(false);
  const [projectError, setProjectError] = useState("");

  // OAuth loading
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  // Completing
  const [completing, setCompleting] = useState(false);

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
          router.push("/dashboard");
          return;
        }
        setStatus(data);
        // Derive step from actual state
        if (data.has_email_connection && data.has_project) {
          setStep(3);
        } else if (data.has_email_connection) {
          setStep(2);
        } else {
          setStep(1);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [authLoading, user, router]);

  // ── Step 1: Connect email ──
  const handleConnectOutlook = async () => {
    if (!status?.organization_id) return;
    setConnectingProvider("outlook");
    const result = await signInWithMicrosoftAction({
      linkToOrg: status.organization_id,
      next: "/onboarding",
    });
    if (result?.url) {
      window.location.href = result.url;
    } else {
      setConnectingProvider(null);
    }
  };

  const handleConnectGmail = async () => {
    if (!status?.organization_id) return;
    setConnectingProvider("gmail");
    const result = await signInWithGoogleAction({
      linkToOrg: status.organization_id,
      next: "/onboarding",
    });
    if (result?.url) {
      window.location.href = result.url;
    } else {
      setConnectingProvider(null);
    }
  };

  // ── Step 2: Create project ──
  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setProjectError("Le nom du projet est requis.");
      return;
    }
    setProjectError("");
    setCreating(true);
    try {
      const res = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: projectName.trim(),
          client_name: clientName.trim() || null,
          city: city.trim() || null,
          status: "active",
          currency: "CHF",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setProjectError(data.error || "Erreur lors de la création.");
        setCreating(false);
        return;
      }
      setStep(3);
    } catch {
      setProjectError("Erreur réseau.");
    }
    setCreating(false);
  };

  // ── Step 3: Complete ──
  const handleComplete = async () => {
    setCompleting(true);
    await fetch("/api/user/onboarding", { method: "PATCH" });
    router.push("/dashboard");
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#71717A]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-[#1E3A5F]">CANTAIA</h1>
        <p className="mt-1 text-sm text-[#71717A]">L'IA au service du chantier</p>
      </div>

      {/* Step indicator */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors",
                step > s.id
                  ? "bg-green-100 text-green-700"
                  : step === s.id
                  ? "bg-[#1E3A5F] text-white"
                  : "bg-[#27272A] text-[#71717A]"
              )}
            >
              {step > s.id ? <Check className="h-4 w-4" /> : s.id}
            </div>
            <span
              className={cn(
                "hidden text-xs font-medium sm:block",
                step === s.id ? "text-[#FAFAFA]" : "text-[#71717A]"
              )}
            >
              {s.label}
            </span>
            {idx < STEPS.length - 1 && (
              <ChevronRight className="h-4 w-4 text-[#71717A]" />
            )}
          </div>
        ))}
      </div>

      {/* Card */}
      <div className="w-full max-w-md rounded-xl border border-[#27272A] bg-[#0F0F11] p-8 shadow-sm">
        {/* ── STEP 1: Connect email ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <Mail className="h-6 w-6 text-[#1E3A5F]" />
              </div>
              <h2 className="text-lg font-semibold text-[#FAFAFA]">
                Connectez votre boite email
              </h2>
              <p className="mt-2 text-sm text-[#71717A]">
                Cantaia analyse vos emails pour classer les messages par projet
                et extraire les actions importantes.
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleConnectOutlook}
                disabled={!!connectingProvider}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-3 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50 transition-colors"
              >
                {connectingProvider === "outlook" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 23 23">
                    <path fill="#f35325" d="M1 1h10v10H1z" />
                    <path fill="#81bc06" d="M12 1h10v10H12z" />
                    <path fill="#05a6f0" d="M1 12h10v10H1z" />
                    <path fill="#ffba08" d="M12 12h10v10H12z" />
                  </svg>
                )}
                Connecter Outlook
              </button>

              <button
                type="button"
                onClick={handleConnectGmail}
                disabled={!!connectingProvider}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-3 text-sm font-medium text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50 transition-colors"
              >
                {connectingProvider === "gmail" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                Connecter Gmail
              </button>
            </div>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full text-center text-sm text-[#71717A] hover:text-[#FAFAFA] transition-colors"
            >
              Plus tard
            </button>
          </div>
        )}

        {/* ── STEP 2: Create project ── */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
                <FolderPlus className="h-6 w-6 text-[#1E3A5F]" />
              </div>
              <h2 className="text-lg font-semibold text-[#FAFAFA]">
                Creez votre premier projet
              </h2>
              <p className="mt-2 text-sm text-[#71717A]">
                Les emails et documents seront automatiquement classés par projet.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#FAFAFA]">
                  Nom du projet <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Ex: Rénovation École de Morges"
                  className="w-full rounded-lg border border-[#27272A] px-3 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#FAFAFA]">
                  Client
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Ex: Commune de Morges"
                  className="w-full rounded-lg border border-[#27272A] px-3 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#FAFAFA]">
                  Ville
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ex: Morges"
                  className="w-full rounded-lg border border-[#27272A] px-3 py-2.5 text-sm text-[#FAFAFA] placeholder:text-[#71717A] focus:border-[#1E3A5F] focus:outline-none focus:ring-1 focus:ring-[#1E3A5F]"
                />
              </div>

              {projectError && (
                <p className="text-xs text-red-600">{projectError}</p>
              )}

              <button
                type="button"
                onClick={handleCreateProject}
                disabled={creating}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1E3A5F] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#162d4a] disabled:opacity-50 transition-colors"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Créer
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-full text-center text-sm text-[#71717A] hover:text-[#FAFAFA] transition-colors"
              >
                Plus tard
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Done ── */}
        {step === 3 && (
          <div className="space-y-6 text-center">
            <div>
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
                <Rocket className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold text-[#FAFAFA]">
                C'est parti !
              </h2>
              <p className="mt-2 text-sm text-[#71717A]">
                Cantaia analyse vos emails et documents.
                <br />
                Revenez dans 5 minutes pour voir les premiers résultats.
              </p>
            </div>

            <button
              type="button"
              onClick={handleComplete}
              disabled={completing}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1E3A5F] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#162d4a] disabled:opacity-50 transition-colors"
            >
              {completing && <Loader2 className="h-4 w-4 animate-spin" />}
              Aller au dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
