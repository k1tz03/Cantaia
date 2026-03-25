"use client";

import { useEffect, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { useTranslations } from "next-intl";
import { ConfettiEffect } from "../ConfettiEffect";

interface CelebrationStepProps {
  emailCount: number;
  hasProject: boolean;
  onLaunch: () => void;
}

function AnimatedNumber({ value, delay: delayMs }: { value: number; delay: number }) {
  const spring = useSpring(0, { stiffness: 50, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
      spring.set(value);
    }, delayMs * 1000);
    return () => clearTimeout(timer);
  }, [value, delayMs, spring]);

  if (!mounted) return <span>0</span>;
  return <motion.span>{display}</motion.span>;
}

export function CelebrationStep({
  emailCount,
  hasProject,
  onLaunch,
}: CelebrationStepProps) {
  const t = useTranslations("onboarding.celebration");
  const [confettiActive, setConfettiActive] = useState(false);

  useEffect(() => {
    setConfettiActive(true);
  }, []);

  const stats = [
    {
      value: emailCount,
      label: emailCount > 0 ? t("emailsImported", { count: emailCount }) : t("noEmails"),
    },
    {
      value: hasProject ? 1 : 0,
      label: hasProject ? t("projectCreated") : t("noProject"),
    },
    {
      value: 12,
      label: t("modulesActive"),
    },
    {
      value: 14,
      label: t("trialDays"),
    },
  ];

  return (
    <div className="flex flex-col items-center py-8 text-center">
      <ConfettiEffect active={confettiActive} />

      {/* Animated checkmark */}
      <motion.div
        className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#10B981]/10"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
      >
        <svg
          className="h-10 w-10"
          viewBox="0 0 24 24"
          fill="none"
        >
          <motion.circle
            cx="12"
            cy="12"
            r="10"
            stroke="#10B981"
            strokeWidth={2}
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
          <motion.path
            d="M8 12.5l2.5 2.5 5.5-5.5"
            stroke="#10B981"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.4, duration: 0.4, ease: "easeOut" }}
          />
        </svg>
      </motion.div>

      {/* Title */}
      <motion.h2
        className="font-display text-3xl font-bold text-[#FAFAFA]"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        {t("title")}
      </motion.h2>

      <motion.p
        className="mt-2 text-[#A1A1AA]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        {t("subtitle")}
      </motion.p>

      {/* Stats grid */}
      <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {stats.map((stat, i) => (
          <motion.div
            key={i}
            className="flex flex-col items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 + i * 0.15 }}
          >
            <span className="text-2xl font-bold text-[#F97316]">
              <AnimatedNumber value={stat.value} delay={0.8 + i * 0.15} />
            </span>
            <span className="mt-1 text-xs text-[#A1A1AA]">{stat.label}</span>
          </motion.div>
        ))}
      </div>

      {/* Launch CTA with glow */}
      <motion.button
        type="button"
        onClick={onLaunch}
        className="mt-10 rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-10 py-4 text-lg font-semibold text-white shadow-lg shadow-[#F97316]/20 transition-shadow hover:shadow-xl hover:shadow-[#F97316]/30"
        initial={{ opacity: 0, y: 20 }}
        animate={{
          opacity: 1,
          y: 0,
          boxShadow: [
            "0 10px 25px -5px rgba(249,115,22,0.2)",
            "0 10px 40px -5px rgba(249,115,22,0.4)",
            "0 10px 25px -5px rgba(249,115,22,0.2)",
          ],
        }}
        transition={{
          opacity: { delay: 1.2 },
          y: { delay: 1.2 },
          boxShadow: { delay: 1.5, duration: 2, repeat: Infinity },
        }}
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
      >
        {t("cta")} →
      </motion.button>
    </div>
  );
}
