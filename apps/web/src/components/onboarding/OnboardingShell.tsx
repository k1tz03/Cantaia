"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { ProgressBar } from "./ProgressBar";

interface OnboardingShellProps {
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
  onSkip?: () => void;
  showSkip?: boolean;
  children: ReactNode;
}

export function OnboardingShell({
  currentStep,
  totalSteps,
  onBack,
  onSkip,
  showSkip = false,
  children,
}: OnboardingShellProps) {
  const t = useTranslations("onboarding.progress");

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0F0F11]">
      {/* Background orbs */}
      <div
        className="pointer-events-none absolute -right-48 -top-48 h-[400px] w-[400px] animate-pulse rounded-full bg-[#F97316]/5 blur-[120px]"
      />
      <div
        className="pointer-events-none absolute -bottom-48 -left-48 h-[400px] w-[400px] animate-pulse rounded-full bg-[#3B82F6]/5 blur-[120px]"
        style={{ animationDelay: "2s" }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-1 flex-col">
        {/* Top bar */}
        <div className="mx-auto w-full max-w-4xl px-6 pt-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#F97316] to-[#EA580C]">
              <span className="text-sm font-bold text-white">C</span>
            </div>
            <span className="font-display text-sm font-bold text-white">Cantaia</span>
          </div>
          <ProgressBar currentStep={currentStep} totalSteps={totalSteps} />
        </div>

        {/* Main content area */}
        <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-8">
          <motion.div
            className="flex-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </div>

        {/* Bottom nav */}
        <div className="mx-auto w-full max-w-4xl px-6 pb-6">
          <div className="flex items-center justify-between">
            <div>
              {currentStep > 1 && onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex items-center gap-1 text-sm text-[#A1A1AA] transition-colors hover:text-[#FAFAFA]"
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t("back")}
                </button>
              )}
            </div>
            <div>
              {showSkip && onSkip && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="text-sm text-[#52525B] transition-colors hover:text-[#A1A1AA]"
                >
                  {t("skip")}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
