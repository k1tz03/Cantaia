"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const steps = [
  {
    number: "01",
    titleKey: "step1Title" as const,
    descKey: "step1Desc" as const,
  },
  {
    number: "02",
    titleKey: "step2Title" as const,
    descKey: "step2Desc" as const,
  },
  {
    number: "03",
    titleKey: "step3Title" as const,
    descKey: "step3Desc" as const,
  },
];

export function HowItWorksSection() {
  const t = useTranslations("landing.howItWorks");

  return (
    <section id="how-it-works" className="relative bg-[#0F0F11]">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27272A] to-transparent" />

      <div className="mx-auto max-w-[1200px] px-6 py-24 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#27272A] bg-[#18181B] px-4 py-1.5 text-xs font-semibold text-[#A1A1AA] mb-6">
            Comment ça marche
          </div>
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            {t("title")}
          </h2>
        </motion.div>

        <div className="relative">
          {/* Connecting line (desktop) */}
          <div className="hidden md:block absolute top-[60px] left-[16.67%] right-[16.67%] h-px">
            <div className="h-full bg-gradient-to-r from-[#F97316]/0 via-[#F97316]/40 to-[#F97316]/0" />
          </div>

          <div className="grid grid-cols-1 gap-12 md:grid-cols-3 md:gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
                className="flex flex-col items-center text-center"
              >
                {/* Numbered circle */}
                <div className="relative z-10">
                  <div className="absolute -inset-3 rounded-full bg-[#F97316]/10 blur-md" />
                  <div className="relative flex h-[120px] w-[120px] items-center justify-center rounded-full bg-gradient-to-br from-[#F97316] to-[#EA580C] shadow-xl shadow-[#F97316]/20">
                    <span className="font-display text-4xl font-extrabold text-white">{step.number}</span>
                  </div>
                </div>

                <h3 className="mt-8 font-display text-xl font-bold text-white">
                  {t(step.titleKey)}
                </h3>
                <p className="mt-3 text-sm text-[#71717A] max-w-[280px] leading-relaxed">
                  {t(step.descKey)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
