"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

export function ProgressBar({ currentStep, totalSteps }: ProgressBarProps) {
  const t = useTranslations("onboarding.progress");
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className="w-full">
      <p className="mb-2 text-xs font-medium text-[#A1A1AA]">
        {t("stepOf", { step: currentStep, total: totalSteps })}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#27272A]">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C]"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
