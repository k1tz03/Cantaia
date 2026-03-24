"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

const features = [
  { emoji: "\uD83D\uDCE7", bg: "rgba(249,115,22,0.1)", titleKey: "f1Title" as const, descKey: "f1Desc" as const },
  { emoji: "\uD83D\uDCCB", bg: "rgba(59,130,246,0.1)", titleKey: "f2Title" as const, descKey: "f2Desc" as const },
  { emoji: "\uD83D\uDCC5", bg: "rgba(16,185,129,0.1)", titleKey: "f3Title" as const, descKey: "f3Desc" as const },
  { emoji: "\uD83D\uDC77", bg: "rgba(245,158,11,0.1)", titleKey: "f4Title" as const, descKey: "f4Desc" as const },
  { emoji: "\uD83E\uDD16", bg: "rgba(139,92,246,0.1)", titleKey: "f5Title" as const, descKey: "f5Desc" as const },
  { emoji: "\uD83D\uDCCA", bg: "rgba(236,72,153,0.1)", titleKey: "f6Title" as const, descKey: "f6Desc" as const },
];

export function FeaturesSection() {
  const t = useTranslations("landing.features");

  return (
    <section id="features" className="mx-auto max-w-[1200px]" style={{ padding: "120px 48px" }}>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature, i) => (
          <motion.div
            key={feature.titleKey}
            initial={{ opacity: 0, y: 36 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.85, delay: 0.05 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="group bg-[#18181B] border border-[#27272A] rounded-[20px] p-9 relative overflow-hidden cursor-default transition-all duration-[400ms] hover:border-[rgba(249,115,22,0.25)] hover:-translate-y-1.5 hover:shadow-[0_20px_60px_rgba(0,0,0,0.3),0_0_40px_rgba(249,115,22,0.05)]"
          >
            {/* Top orange line on hover */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#F97316] to-transparent opacity-0 transition-opacity duration-[400ms] group-hover:opacity-100" />

            <div
              className="w-[52px] h-[52px] rounded-[14px] flex items-center justify-center text-[24px] mb-5"
              style={{ background: feature.bg }}
            >
              {feature.emoji}
            </div>
            <div className="font-display text-[19px] font-bold text-[#FAFAFA] mb-[10px]">
              {t(feature.titleKey)}
            </div>
            <div className="text-[14px] text-[#71717A] leading-[1.65]">
              {t(feature.descKey)}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
