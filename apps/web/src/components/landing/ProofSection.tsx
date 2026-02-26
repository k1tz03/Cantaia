"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useRef, useCallback } from "react";
import { AnimatedSection } from "./AnimatedSection";

const proofCards = [
  { key: "1", emoji: "\u{1F1E8}\u{1F1ED}" },
  { key: "2", emoji: "\u{1F3D7}\u{FE0F}" },
  { key: "3", emoji: "\u{1F512}" },
] as const;

const stats = ["1", "2", "3", "4"] as const;

function useCountUp(target: string, isVisible: boolean) {
  const [value, setValue] = useState("0");

  useEffect(() => {
    if (!isVisible) return;

    // Extract numeric part and suffix/prefix
    const numericMatch = target.match(/(\d+)/);
    if (!numericMatch) {
      setValue(target);
      return;
    }

    const numericValue = parseInt(numericMatch[1], 10);
    const prefix = target.slice(0, numericMatch.index);
    const suffix = target.slice((numericMatch.index ?? 0) + numericMatch[1].length);

    let current = 0;
    const duration = 1500;
    const steps = 40;
    const increment = numericValue / steps;
    const stepDuration = duration / steps;

    const timer = setInterval(() => {
      current += increment;
      if (current >= numericValue) {
        current = numericValue;
        clearInterval(timer);
      }
      setValue(`${prefix}${Math.round(current)}${suffix}`);
    }, stepDuration);

    return () => clearInterval(timer);
  }, [target, isVisible]);

  return value;
}

function StatCounter({
  targetValue,
  label,
  isVisible,
}: {
  targetValue: string;
  label: string;
  isVisible: boolean;
}) {
  const displayValue = useCountUp(targetValue, isVisible);

  return (
    <div className="text-center">
      <div className="text-3xl font-bold text-amber-400 sm:text-4xl">
        {displayValue}
      </div>
      <div className="mt-2 text-sm text-slate-400">{label}</div>
    </div>
  );
}

export function ProofSection() {
  const t = useTranslations("landing.proof");
  const [isStatsVisible, setIsStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setIsStatsVisible(true);
        }
      }
    },
    []
  );

  useEffect(() => {
    const node = statsRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(handleIntersect, {
      threshold: 0.3,
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, [handleIntersect]);

  return (
    <section className="relative overflow-hidden px-6 py-24" style={{ backgroundColor: "#0F172A" }}>
      {/* Subtle glow */}
      <div className="absolute left-1/2 top-0 h-64 w-64 -translate-x-1/2 rounded-full bg-amber-400/5 blur-3xl" />

      <div className="relative mx-auto max-w-6xl">
        {/* Title */}
        <AnimatedSection className="text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            {t("title")}
          </h2>
        </AnimatedSection>

        {/* Proof cards */}
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          {proofCards.map((card, index) => (
            <AnimatedSection key={card.key} delay={0.1 * (index + 1)}>
              <div className="flex h-full flex-col items-center rounded-xl border border-slate-700/50 bg-slate-800/50 p-8 text-center backdrop-blur-sm transition-all hover:border-slate-600">
                <span className="text-4xl" role="img" aria-hidden="true">
                  {card.emoji}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-white">
                  {t(`card${card.key}Title`)}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">
                  {t(`card${card.key}Desc`)}
                </p>
              </div>
            </AnimatedSection>
          ))}
        </div>

        {/* Stats counter row */}
        <div ref={statsRef} className="mt-16">
          <AnimatedSection delay={0.4}>
            <div className="grid grid-cols-2 gap-8 rounded-2xl border border-slate-700/50 bg-slate-800/30 px-8 py-10 backdrop-blur-sm sm:grid-cols-4">
              {stats.map((stat) => (
                <StatCounter
                  key={stat}
                  targetValue={t(`stat${stat}`)}
                  label={t(`stat${stat}Label`)}
                  isVisible={isStatsVisible}
                />
              ))}
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
