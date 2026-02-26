"use client";

import { useTranslations } from "next-intl";
import { useState, useEffect, useRef } from "react";
import { Mail, Clock, BarChart3 } from "lucide-react";
import { AnimatedSection } from "./AnimatedSection";

const painPoints = [
  { key: "1", icon: Mail, accent: "border-l-amber-500" },
  { key: "2", icon: Clock, accent: "border-l-red-500" },
  { key: "3", icon: BarChart3, accent: "border-l-orange-500" },
] as const;

function useCountUp(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted) {
          setHasStarted(true);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;

    const startTime = performance.now();

    function animate(currentTime: number) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(eased * target));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [hasStarted, target, duration]);

  return { count, ref };
}

export function ProblemSection() {
  const t = useTranslations("landing.problem");
  const { count, ref: counterRef } = useCountUp(15, 2000);

  return (
    <section className="bg-[#F8FAFC] px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <AnimatedSection className="text-center">
          <h2 className="font-['Plus_Jakarta_Sans'] text-3xl font-bold text-slate-900 sm:text-4xl lg:text-5xl">
            {t("title")}
          </h2>
        </AnimatedSection>

        {/* Animated counter */}
        <AnimatedSection delay={0.1} className="mt-12 flex justify-center">
          <div
            ref={counterRef}
            className="inline-flex flex-col items-center rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 px-12 py-8 shadow-lg shadow-amber-100/50"
          >
            <div className="flex items-baseline gap-2">
              <span className="font-['Plus_Jakarta_Sans'] text-6xl font-extrabold text-amber-600 sm:text-7xl">
                {count}
              </span>
              <span className="text-2xl font-semibold text-amber-500 sm:text-3xl">
                {t("statUnit")}
              </span>
            </div>
            <p className="mt-3 text-lg font-semibold text-slate-700">
              {t("statLabel")}
            </p>
            <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-slate-500">
              {t("statDescription")}
            </p>
          </div>
        </AnimatedSection>

        {/* Pain point cards */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {painPoints.map((point, index) => {
            const Icon = point.icon;
            return (
              <AnimatedSection key={point.key} delay={0.15 * (index + 1)}>
                <div
                  className={`group h-full rounded-xl border border-slate-200 border-l-4 ${point.accent} bg-white p-8 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 transition-colors group-hover:bg-amber-50">
                    <Icon className="h-6 w-6 text-slate-600 transition-colors group-hover:text-amber-600" />
                  </div>
                  <h3 className="mt-5 font-['Plus_Jakarta_Sans'] text-lg font-bold text-slate-900">
                    {t(`painPoint${point.key}Title`)}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">
                    {t(`painPoint${point.key}Desc`)}
                  </p>
                </div>
              </AnimatedSection>
            );
          })}
        </div>
      </div>
    </section>
  );
}
