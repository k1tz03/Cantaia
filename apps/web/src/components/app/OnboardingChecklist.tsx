"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  X,
  FolderKanban,
  Mail,
  FileSpreadsheet,
  Truck,
  Settings,
  Sparkles,
} from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  href: string;
  checkKey: string; // localStorage key to mark complete
}

const STORAGE_KEY = "cantaia_onboarding";

export function OnboardingChecklist() {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const router = useRouter();
  const locale = useLocale();

  const steps: OnboardingStep[] = [
    {
      id: "project",
      title: "Créer votre premier projet",
      description: "Ajoutez une baustelle pour commencer à organiser vos données.",
      icon: FolderKanban,
      href: `/${locale}/projects`,
      checkKey: "project_created",
    },
    {
      id: "outlook",
      title: "Connecter votre boîte Outlook",
      description: "Synchronisez vos emails pour la classification automatique par IA.",
      icon: Mail,
      href: `/${locale}/settings`,
      checkKey: "outlook_connected",
    },
    {
      id: "submission",
      title: "Importer une soumission",
      description: "Glissez un PDF de soumission, l'IA extrait les positions.",
      icon: FileSpreadsheet,
      href: `/${locale}/submissions`,
      checkKey: "submission_imported",
    },
    {
      id: "supplier",
      title: "Ajouter un fournisseur",
      description: "Constituez votre base de fournisseurs pour les appels d'offres.",
      icon: Truck,
      href: `/${locale}/suppliers`,
      checkKey: "supplier_added",
    },
    {
      id: "settings",
      title: "Personnaliser vos paramètres",
      description: "Langue, notifications, préférences de classification.",
      icon: Settings,
      href: `/${locale}/settings`,
      checkKey: "settings_visited",
    },
  ];

  // Load state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.dismissed) {
          setDismissed(true);
          return;
        }
        if (data.completed) {
          setCompletedSteps(new Set(data.completed));
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Save state
  const saveState = useCallback(
    (completed: Set<string>, isDismissed: boolean) => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          completed: Array.from(completed),
          dismissed: isDismissed,
        })
      );
    },
    []
  );

  const markComplete = useCallback(
    (stepId: string) => {
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        next.add(stepId);
        saveState(next, false);
        return next;
      });
    },
    [saveState]
  );

  const handleStepClick = useCallback(
    (step: OnboardingStep) => {
      markComplete(step.id);
      router.push(step.href);
    },
    [markComplete, router]
  );

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    saveState(completedSteps, true);
  }, [completedSteps, saveState]);

  // Don't show if dismissed or all steps complete
  const completedCount = completedSteps.size;
  if (dismissed || completedCount >= steps.length) return null;

  const progress = Math.round((completedCount / steps.length) * 100);

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-xl border border-[#27272A] bg-[#0F0F11] shadow-lg relative">
      {/* Close button */}
      <button
        onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
        className="absolute right-2 top-2 rounded-full p-1 text-[#71717A] hover:bg-[#27272A] hover:text-[#FAFAFA] transition-colors"
        title="Fermer"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {/* Header */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center gap-3 px-4 py-3"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10">
          <Sparkles className="h-4 w-4 text-brand" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-[#FAFAFA]">Prise en main</p>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-[#27272A]">
              <div
                className="h-1.5 rounded-full bg-brand transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[10px] text-[#71717A]">
              {completedCount}/{steps.length}
            </span>
          </div>
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-[#71717A]" />
        ) : (
          <ChevronUp className="h-4 w-4 text-[#71717A]" />
        )}
      </button>

      {/* Steps */}
      {open && (
        <div className="border-t border-[#27272A] px-2 py-2">
          {steps.map((step) => {
            const isDone = completedSteps.has(step.id);
            return (
              <button
                key={step.id}
                onClick={() => handleStepClick(step)}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  isDone ? "opacity-60" : "hover:bg-[#27272A]"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#71717A]" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isDone ? "text-[#71717A] line-through" : "text-[#FAFAFA]"}`}>
                    {step.title}
                  </p>
                  {!isDone && (
                    <p className="text-[11px] text-[#71717A] mt-0.5">{step.description}</p>
                  )}
                </div>
              </button>
            );
          })}
          <button
            onClick={handleDismiss}
            className="mt-1 flex w-full items-center justify-center gap-1 py-1.5 text-[11px] text-[#71717A] hover:text-[#FAFAFA] transition-colors"
          >
            <X className="h-3 w-3" />
            Masquer
          </button>
        </div>
      )}
    </div>
  );
}
