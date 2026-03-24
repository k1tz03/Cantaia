"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function HowItWorksSection() {
  const t = useTranslations("landing.howItWorks");

  const steps = [
    { num: "1", titleKey: "step1Title" as const, descKey: "step1Desc" as const },
    { num: "2", titleKey: "step2Title" as const, descKey: "step2Desc" as const },
    { num: "3", titleKey: "step3Title" as const, descKey: "step3Desc" as const },
  ];

  return (
    <section style={{ padding: "120px 48px", background: "linear-gradient(180deg, #18181B, #0F0F11)" }}>
      <div className="mx-auto max-w-[1000px]">
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          className="text-[12px] uppercase tracking-[0.2em] text-[#F97316] font-semibold text-center mb-3"
        >
          {t("label")}
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.85, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-[46px] font-extrabold text-[#FAFAFA] text-center tracking-[-1.5px] leading-[1.1] mb-4"
        >
          {t("title")}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.85, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-[18px] text-[#52525B] text-center max-w-[560px] mx-auto leading-[1.6] mb-16"
        >
          {t("desc")}
        </motion.p>

        {/* Steps */}
        <div className="relative flex flex-col md:flex-row gap-10 md:gap-0 items-start mt-16">
          {/* Connecting gradient line (desktop only) */}
          <div className="hidden md:block absolute top-8 left-[15%] right-[15%] h-[2px] bg-gradient-to-r from-[#F97316] via-[#27272A] to-[#F97316]" />

          {steps.map((step, i) => (
            <motion.div
              key={step.num}
              initial={{ opacity: 0, y: 36 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.85, delay: 0.1 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 text-center relative z-[1]"
            >
              <div className="group w-16 h-16 rounded-full bg-gradient-to-br from-[#F97316] to-[#EA580C] flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(249,115,22,0.3)] transition-all duration-300 hover:scale-110 hover:shadow-[0_0_60px_rgba(249,115,22,0.4)]">
                <span className="font-display text-[24px] font-extrabold text-white">{step.num}</span>
              </div>
              <div className="font-display text-[22px] font-bold text-[#FAFAFA] mb-[10px]">
                {t(step.titleKey)}
              </div>
              <div className="text-[14px] text-[#71717A] leading-[1.6] max-w-[260px] mx-auto">
                {t(step.descKey)}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
