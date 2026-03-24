"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { AlertTriangle, Clock, TrendingDown, Check } from "lucide-react";

export function ProblemSection() {
  const t = useTranslations("landing.problem");

  const painPoints = [
    {
      icon: AlertTriangle,
      color: "#EF4444",
      titleKey: "painPoint1Title" as const,
      descKey: "painPoint1Desc" as const,
    },
    {
      icon: Clock,
      color: "#F59E0B",
      titleKey: "painPoint2Title" as const,
      descKey: "painPoint2Desc" as const,
    },
    {
      icon: TrendingDown,
      color: "#F59E0B",
      titleKey: "painPoint3Title" as const,
      descKey: "painPoint3Desc" as const,
    },
  ];

  const solutions = [
    "Emails classés automatiquement par projet et priorité",
    "PV de séance générés en 5 minutes au lieu de 2 heures",
    "Comparaison fournisseurs et prix en temps réel",
  ];

  return (
    <section className="relative bg-[#0F0F11]">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27272A] to-transparent" />

      <div className="mx-auto max-w-[1200px] px-6 py-24 lg:py-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-[#EF4444]/20 bg-[#EF4444]/5 px-4 py-1.5 text-xs font-semibold text-[#EF4444] mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-[#EF4444] animate-pulse" />
            Le probleme
          </div>
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            {t("title")}
          </h2>
          <p className="mt-4 text-lg text-[#71717A]">
            {t("subtitle")}
          </p>
        </motion.div>

        {/* Pain points */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 mb-16">
          {painPoints.map((point, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="rounded-2xl border border-[#27272A] bg-[#18181B] p-7 transition-all duration-300 hover:border-[#3F3F46]"
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${point.color}15` }}
              >
                <point.icon className="w-5 h-5" style={{ color: point.color }} />
              </div>
              <h3 className="mt-5 font-display text-lg font-bold text-white">
                {t(point.titleKey)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#71717A]">
                {t(point.descKey)}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Solution */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl border border-[#22C55E]/20 bg-[#22C55E]/5 p-8 lg:p-10"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#22C55E]/10">
              <Check className="w-5 h-5 text-[#22C55E]" />
            </div>
            <h3 className="font-display text-xl font-bold text-white">Avec Cantaia</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {solutions.map((solution, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22C55E]/10 flex-shrink-0 mt-0.5">
                  <Check className="h-3 w-3 text-[#22C55E]" />
                </div>
                <span className="text-sm text-[#A1A1AA] leading-relaxed">{solution}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
