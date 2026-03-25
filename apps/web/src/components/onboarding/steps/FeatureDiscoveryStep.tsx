"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Mail, FileText, CalendarRange, Bot, ChevronLeft, ChevronRight } from "lucide-react";
import { FeatureCard } from "../FeatureCard";

interface FeatureDiscoveryStepProps {
  onContinue: () => void;
}

const FEATURES = [
  { key: "mail" as const, icon: Mail, animationType: "mail" as const },
  { key: "submissions" as const, icon: FileText, animationType: "submissions" as const },
  { key: "planning" as const, icon: CalendarRange, animationType: "planning" as const },
  { key: "chat" as const, icon: Bot, animationType: "chat" as const },
];

export function FeatureDiscoveryStep({ onContinue }: FeatureDiscoveryStepProps) {
  const t = useTranslations("onboarding.features");
  const tProgress = useTranslations("onboarding.progress");
  const [activeIndex, setActiveIndex] = useState(0);
  const [userInteracted, setUserInteracted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goTo = useCallback((idx: number) => {
    setActiveIndex(idx);
    setUserInteracted(true);
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % FEATURES.length);
  }, []);

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + FEATURES.length) % FEATURES.length);
    setUserInteracted(true);
  }, []);

  // Auto-advance
  useEffect(() => {
    if (userInteracted) return;
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % FEATURES.length);
    }, 5000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [userInteracted]);

  return (
    <div className="flex flex-col items-center py-4">
      <motion.div
        className="mb-6 text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="font-display text-2xl font-bold text-[#FAFAFA]">
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-[#A1A1AA]">{t("subtitle")}</p>
      </motion.div>

      {/* Carousel container */}
      <div className="relative w-full max-w-2xl">
        {/* Navigation arrows */}
        <button
          type="button"
          onClick={goPrev}
          className="absolute -left-4 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#27272A] bg-[#18181B] text-[#A1A1AA] transition-colors hover:text-[#FAFAFA] sm:-left-10"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => { goNext(); setUserInteracted(true); }}
          className="absolute -right-4 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-[#27272A] bg-[#18181B] text-[#A1A1AA] transition-colors hover:text-[#FAFAFA] sm:-right-10"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Cards - desktop shows 2, mobile shows 1 */}
        <motion.div
          className="flex gap-4 overflow-hidden px-2"
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={(_, info) => {
            if (info.offset.x < -50) { goNext(); setUserInteracted(true); }
            if (info.offset.x > 50) goPrev();
          }}
        >
          {/* Mobile: single card */}
          <div className="block lg:hidden w-full">
            <FeatureCard
              title={t(`${FEATURES[activeIndex].key}.title`)}
              description={t(`${FEATURES[activeIndex].key}.description`)}
              icon={FEATURES[activeIndex].icon}
              animationType={FEATURES[activeIndex].animationType}
              isActive={true}
            />
          </div>

          {/* Desktop: two cards */}
          <div className="hidden lg:flex gap-4 w-full">
            {[0, 1].map((offset) => {
              const idx = (activeIndex + offset) % FEATURES.length;
              const feature = FEATURES[idx];
              return (
                <div key={`${feature.key}-${idx}`} className="flex-1">
                  <FeatureCard
                    title={t(`${feature.key}.title`)}
                    description={t(`${feature.key}.description`)}
                    icon={feature.icon}
                    animationType={feature.animationType}
                    isActive={true}
                  />
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* Dot indicators */}
      <div className="mt-6 flex gap-2">
        {FEATURES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            className={`h-2 rounded-full transition-all ${
              i === activeIndex ? "w-6 bg-[#F97316]" : "w-2 bg-[#27272A]"
            }`}
          />
        ))}
      </div>

      <motion.button
        type="button"
        onClick={onContinue}
        className="mt-8 rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-8 py-3 font-medium text-white transition-shadow hover:shadow-lg hover:shadow-[#F97316]/25"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        {tProgress("continue")}
      </motion.button>
    </div>
  );
}
