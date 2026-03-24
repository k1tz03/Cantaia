"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 40 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: "easeOut" as const },
});

function AppMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 1, delay: 0.7, ease: "easeOut" }}
      className="relative mx-auto w-full max-w-[1100px]"
    >
      {/* Mockup frame */}
      <div className="relative rounded-2xl overflow-hidden border border-[#27272A] shadow-[0_40px_100px_rgba(0,0,0,0.6),0_0_80px_rgba(249,115,22,0.04)]">
        {/* Gradient border overlay */}
        <div className="absolute -inset-px rounded-[17px] bg-gradient-to-br from-[rgba(249,115,22,0.18)] via-transparent to-[rgba(249,115,22,0.08)] pointer-events-none z-[5]" />

        <div className="w-full aspect-video bg-[#111113] relative overflow-hidden">
          {/* Top bar */}
          <div className="h-10 bg-[#09090B] border-b border-[#27272A] flex items-center px-4 gap-2">
            <div className="w-[10px] h-[10px] rounded-full bg-[#EF4444]" />
            <div className="w-[10px] h-[10px] rounded-full bg-[#F59E0B]" />
            <div className="w-[10px] h-[10px] rounded-full bg-[#10B981]" />
            <div className="ml-4 flex items-center gap-1.5">
              <div className="w-5 h-5 bg-gradient-to-br from-[#F97316] to-[#EF4444] rounded-[5px] flex items-center justify-center text-[10px] text-white font-extrabold font-display">
                C
              </div>
              <span className="font-display text-xs font-bold text-[#FAFAFA]">Cantaia</span>
              <small className="text-[10px] text-[#52525B] ml-2">{`Menetrey SA \u203A Dashboard`}</small>
            </div>
          </div>

          {/* Body */}
          <div className="flex h-[calc(100%-40px)]">
            {/* Sidebar */}
            <div className="w-[200px] bg-[#111113] border-r border-[#27272A] p-4 px-[10px] hidden sm:block">
              {[
                { bg: "#F97316", w: "70%", delay: 0.6 },
                { bg: "#3F3F46", w: "85%", delay: 0.7 },
                { bg: "#3F3F46", w: "55%", delay: 0.8 },
                { bg: "#3F3F46", w: "75%", delay: 0.9 },
              ].map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: item.delay, ease: "easeOut" }}
                  className="h-[10px] rounded-[5px] mb-2"
                  style={{ background: item.bg, width: item.w }}
                />
              ))}
              <div className="h-5" />
              {[
                { bg: "#3F3F46", w: "90%", delay: 1.0 },
                { bg: "#3F3F46", w: "60%", delay: 1.1 },
                { bg: "#3F3F46", w: "80%", delay: 1.2 },
              ].map((item, i) => (
                <motion.div
                  key={i + 4}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: item.delay, ease: "easeOut" }}
                  className="h-[10px] rounded-[5px] mb-2"
                  style={{ background: item.bg, width: item.w }}
                />
              ))}
            </div>

            {/* Main content */}
            <div className="flex-1 p-5 bg-[#18181B]">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.8, ease: "easeOut" }}
                className="font-display text-[22px] font-bold text-[#FAFAFA] mb-[3px]"
              >
                Bon après-midi, <span className="bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">Julien</span>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.9, ease: "easeOut" }}
                className="text-[11px] text-[#52525B] mb-[14px]"
              >
                {"\uD83D\uDCC5"} lundi, 24 mars 2026
              </motion.div>

              {/* KPIs */}
              <div className="grid grid-cols-4 gap-2 mb-[14px]">
                {[
                  { val: "25", label: "Emails", color: "from-[#F97316] to-[#FB923C]", valColor: "#FAFAFA", delay: 1.0 },
                  { val: "16", label: "Tâches", color: "from-[#EF4444] to-[#F87171]", valColor: "#F87171", delay: 1.1 },
                  { val: "1", label: "Soumissions", color: "from-[#3B82F6] to-[#60A5FA]", valColor: "#FAFAFA", delay: 1.2 },
                  { val: "5", label: "Projets", color: "from-[#10B981] to-[#34D399]", valColor: "#34D399", delay: 1.3 },
                ].map((kpi, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: kpi.delay, ease: "easeOut" }}
                    className="bg-[#27272A] rounded-[10px] p-[10px_12px] relative overflow-hidden"
                  >
                    <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${kpi.color}`} />
                    <div className="font-display text-[22px] font-extrabold" style={{ color: kpi.valColor }}>{kpi.val}</div>
                    <div className="text-[9px] text-[#52525B] mt-[2px]">{kpi.label}</div>
                  </motion.div>
                ))}
              </div>

              {/* Project cards */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: "Central Malley", sub: "9240302 \u00B7 Implenia \u00B7 Prilly", borderColor: "#3B82F6", delay: 1.4 },
                  { name: "Les Cèdres", sub: "9250475 \u00B7 Edifea \u00B7 Chavannes", borderColor: "#10B981", delay: 1.5 },
                ].map((card, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, delay: card.delay, ease: "easeOut" }}
                    className="bg-[#27272A] rounded-lg h-[72px] relative overflow-hidden"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: card.borderColor }} />
                    <div className="text-[11px] font-semibold text-[#FAFAFA] p-[10px_12px_0]">{card.name}</div>
                    <div className="text-[8px] text-[#52525B] p-[2px_12px]">{card.sub}</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating badge — right side */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 1.6, ease: "easeOut" }}
        className="absolute top-[30%] -right-[30px] z-[6] hidden lg:block"
        style={{ animation: "float 4s ease-in-out infinite" }}
      >
        <div className="bg-[rgba(24,24,27,0.92)] border border-[#27272A] rounded-[10px] px-[14px] py-2 flex items-center gap-2 text-xs text-[#D4D4D8] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.5)] whitespace-nowrap">
          <div className="w-2 h-2 rounded-full bg-[#34D399] flex-shrink-0" />
          IA active — 5 emails classés
        </div>
      </motion.div>

      {/* Float + orbit keyframes */}
      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
      `}</style>
    </motion.div>
  );
}

export function HeroSection() {
  const t = useTranslations("landing.hero");

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden" style={{ padding: "140px 48px 80px" }}>
      {/* Background image at 12% opacity */}
      <div className="absolute inset-0">
        <Image
          src="/landing/hero-bg.png"
          alt=""
          fill
          className="object-cover object-center opacity-[0.12]"
          style={{ filter: "saturate(0.6)" }}
          priority
          sizes="100vw"
        />
      </div>

      {/* Gradient overlays */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 20%, rgba(249,115,22,0.06), transparent 60%), linear-gradient(180deg, rgba(15,15,17,0.3) 0%, rgba(15,15,17,0.85) 50%, #0F0F11 100%)",
        }}
      />

      {/* Subtle grid */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          maskImage: "radial-gradient(ellipse 60% 50% at center, black, transparent)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 50% at center, black, transparent)",
        }}
      />

      {/* Orbiting particles */}
      <div className="absolute top-1/2 left-1/2 w-0 h-0 pointer-events-none">
        <div className="absolute w-1 h-1 rounded-full bg-[#F97316] opacity-25" style={{ animation: "orbitSlow 22s linear infinite" }} />
        <div className="absolute w-[3px] h-[3px] rounded-full bg-[#F97316] opacity-15" style={{ animation: "orbitSlow 28s linear infinite reverse" }} />
        <div className="absolute w-[5px] h-[5px] rounded-full bg-[#F97316] opacity-10" style={{ animation: "orbitSlow 35s linear infinite" }} />
      </div>

      {/* Content */}
      <div className="relative z-[2] max-w-[800px] text-center">
        {/* Badge */}
        <motion.div {...fadeUp(0)}>
          <div className="inline-flex items-center gap-2 px-5 py-[7px] rounded-full border border-[#27272A] bg-[rgba(24,24,27,0.7)] text-[13px] text-[#A1A1AA] backdrop-blur-lg">
            {"\uD83C\uDDE8\uD83C\uDDED"} <span className="text-[#F97316] font-semibold">{t("badgeHighlight")}</span> {t("badgeSuffix")}
          </div>
        </motion.div>

        {/* Title */}
        <motion.h1
          {...fadeUp(0.15)}
          className="font-display text-[clamp(48px,7vw,80px)] font-extrabold leading-[1.02] tracking-[-3px] mt-8 mb-7"
        >
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: "linear-gradient(135deg, #F97316 0%, #FB923C 40%, #FBBF24 100%)",
              backgroundSize: "200% 200%",
              animation: "gradientShift 4s ease-in-out infinite",
            }}
          >
            {t("titleGrad")}
          </span>
          <span className="block text-[#FAFAFA]">{t("titleWhite")}</span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          {...fadeUp(0.3)}
          className="text-[19px] text-[#71717A] max-w-[580px] leading-[1.7] mx-auto mb-10"
        >
          {t("sub1")} <strong className="text-[#A1A1AA] font-medium">{t("sub1Bold")}</strong>.
          <br />
          {t("sub2")} <strong className="text-[#A1A1AA] font-medium">{t("sub2Bold")}</strong>.
        </motion.p>

        {/* CTAs */}
        <motion.div {...fadeUp(0.45)} className="flex gap-4 justify-center mb-12 flex-wrap">
          <Link
            href="/register"
            className="group relative inline-flex items-center gap-2 px-9 py-[15px] rounded-xl bg-gradient-to-br from-[#F97316] to-[#EA580C] text-white text-base font-semibold shadow-[0_0_40px_rgba(249,115,22,0.25)] overflow-hidden transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_60px_rgba(249,115,22,0.35)]"
          >
            {t("ctaPrimary")}
          </Link>
          <a
            href="#features"
            className="inline-flex items-center gap-2 px-9 py-[15px] rounded-xl border border-[#3F3F46] bg-[rgba(24,24,27,0.4)] text-[#D4D4D8] text-base font-medium backdrop-blur-lg transition-all duration-300 hover:border-[#71717A] hover:text-[#FAFAFA] hover:bg-[rgba(39,39,42,0.4)] hover:-translate-y-0.5"
          >
            {t("ctaSecondary")}
          </a>
        </motion.div>

        {/* Trust items */}
        <motion.div {...fadeUp(0.6)} className="flex gap-9 justify-center flex-wrap">
          {["trust1", "trust2", "trust3", "trust4"].map((key) => (
            <div key={key} className="flex items-center gap-2 text-[13px] text-[#52525B] font-medium transition-colors duration-300 hover:text-[#A1A1AA]">
              {t(key)}
            </div>
          ))}
        </motion.div>
      </div>

      {/* App Mockup */}
      <div className="relative z-[2] mt-16 w-full max-w-[1100px] mx-auto">
        <AppMockup />
      </div>

      {/* Keyframes for orbiting */}
      <style jsx>{`
        @keyframes orbitSlow {
          0% { transform: rotate(0deg) translateX(220px) rotate(0deg); }
          100% { transform: rotate(360deg) translateX(220px) rotate(-360deg); }
        }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </section>
  );
}
