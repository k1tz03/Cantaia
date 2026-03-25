"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { CantaiaLogo } from "../CantaiaLogo";

interface WelcomeStepProps {
  firstName: string;
  onContinue: () => void;
}

export function WelcomeStep({ firstName, onContinue }: WelcomeStepProps) {
  const t = useTranslations("onboarding.welcome");

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <CantaiaLogo size="lg" />
      </motion.div>

      <motion.h1
        className="mt-8 font-display text-3xl font-bold text-[#FAFAFA] sm:text-4xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.5 }}
      >
        {firstName
          ? t("greeting", { name: firstName })
          : t("greetingNoName")}
      </motion.h1>

      <motion.p
        className="mt-3 font-display text-lg text-[#F97316]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.5 }}
      >
        {t("tagline")}
      </motion.p>

      <motion.p
        className="mt-2 text-[#A1A1AA]"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.5 }}
      >
        {t("subtitle")}
      </motion.p>

      <motion.button
        type="button"
        onClick={onContinue}
        className="mt-8 rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-8 py-3 font-medium text-white transition-shadow hover:shadow-lg hover:shadow-[#F97316]/25"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.4, duration: 0.5 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {t("cta")}
      </motion.button>
    </div>
  );
}
