"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";
import { BentoGrid } from "./BentoGrid";

export function HeroSection() {
  const t = useTranslations("landing");

  return (
    <section className="relative overflow-hidden bg-[#0F172A] px-6 pb-16 pt-24 sm:pb-20 sm:pt-32 lg:pb-24 lg:pt-40">
      {/* Gradient overlays */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0F172A] via-[#0F172A] to-[#131C31]" />
        <div className="absolute -top-40 right-1/4 h-[500px] w-[500px] rounded-full bg-amber-500/5 blur-[120px]" />
        <div className="absolute -bottom-20 left-1/3 h-[400px] w-[400px] rounded-full bg-blue-500/5 blur-[100px]" />
        <div className="absolute right-0 top-1/2 h-[300px] w-[300px] -translate-y-1/2 rounded-full bg-amber-400/3 blur-[80px]" />
      </div>

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.2) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.2) 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative mx-auto max-w-7xl">
        {/* Text content — centered */}
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-amber-400/20 bg-amber-400/5 px-4 py-2 backdrop-blur-sm"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20">
              <Sparkles className="h-3 w-3 text-amber-400" />
            </span>
            <span className="text-sm font-medium text-amber-300/90">
              {t("hero.badge")}
            </span>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
          >
            <span className="bg-gradient-to-b from-white to-blue-200/80 bg-clip-text text-transparent">
              {t("hero.title")}
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400"
          >
            {t("hero.subtitle")}
          </motion.p>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Link
              href="/register"
              className="group inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-7 py-3.5 text-sm font-semibold text-slate-900 shadow-lg shadow-amber-500/25 transition-all hover:from-amber-300 hover:to-amber-400 hover:shadow-xl hover:shadow-amber-500/30"
            >
              {t("hero.cta")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-7 py-3.5 text-sm font-semibold text-slate-300 backdrop-blur-sm transition-all hover:border-white/20 hover:bg-white/5 hover:text-white"
            >
              {t("hero.ctaSecondary")}
            </a>
          </motion.div>

          {/* Trust banner */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3"
          >
            {(["trust1", "trust2", "trust3"] as const).map((key, index) => (
              <div key={index} className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400/70" />
                <span className="text-sm text-slate-500">
                  {t(`hero.${key}`)}
                  {index === 1 && " 🇨🇭"}
                </span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Bento Grid */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mt-16 lg:mt-20"
        >
          <BentoGrid />
        </motion.div>
      </div>
    </section>
  );
}
