"use client";

import { useTranslations } from "next-intl";
import { AnimatedSection } from "./AnimatedSection";

const stepIcons = [
  <svg key="1" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
  </svg>,
  <svg key="2" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>,
  <svg key="3" className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
  </svg>,
];

export function HowItWorksSection() {
  const t = useTranslations("landing.howItWorks");

  const steps = [
    { number: "1", title: t("step1Title"), description: t("step1Desc"), icon: stepIcons[0] },
    { number: "2", title: t("step2Title"), description: t("step2Desc"), icon: stepIcons[1] },
    { number: "3", title: t("step3Title"), description: t("step3Desc"), icon: stepIcons[2] },
  ];

  return (
    <section id="how-it-works" className="bg-[#FAFAFA]">
      <div className="mx-auto max-w-[1200px] px-6 py-20 lg:py-28">
        <AnimatedSection>
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-500 mb-5 shadow-sm">
              Comment ça marche
            </div>
            <h2 className="font-display text-3xl font-bold text-[#111827] sm:text-4xl">
              {t("title")}
            </h2>
          </div>
        </AnimatedSection>

        <div className="relative">
          {/* Gradient line connecting steps (desktop) */}
          <div className="hidden md:block absolute top-14 left-[16.67%] right-[16.67%] h-0.5">
            <div className="h-full bg-gradient-to-r from-[#2563EB]/20 via-[#2563EB]/40 to-[#2563EB]/20 rounded-full" />
          </div>

          <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
            {steps.map((step, i) => (
              <AnimatedSection key={i} delay={i * 0.15}>
                <div className="flex flex-col items-center text-center">
                  {/* Circle with ring */}
                  <div className="relative z-10">
                    <div className="absolute inset-0 rounded-full bg-[#2563EB]/10 scale-[1.2]" />
                    <div className="relative flex h-28 w-28 flex-col items-center justify-center rounded-full bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] shadow-xl shadow-blue-500/25">
                      {step.icon}
                      <span className="mt-1 text-xs font-bold text-white/80">{step.number}</span>
                    </div>
                  </div>

                  <h3 className="mt-6 font-display text-lg font-bold text-[#111827]">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-[#6B7280] max-w-[260px] leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
