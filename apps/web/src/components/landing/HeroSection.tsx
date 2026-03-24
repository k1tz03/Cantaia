"use client";

import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Mail, ClipboardList, BarChart3, Shield } from "lucide-react";

function DashboardMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
      className="relative mx-auto max-w-[900px]"
    >
      {/* Glow behind mockup */}
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-[#F97316]/10 via-[#F97316]/5 to-transparent blur-2xl" />

      <div className="relative rounded-2xl border border-[#27272A] bg-[#18181B] shadow-2xl shadow-black/50 overflow-hidden ring-1 ring-white/5">
        {/* Browser bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-[#0F0F11] border-b border-[#27272A]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#EF4444]/80" />
            <div className="w-3 h-3 rounded-full bg-[#F59E0B]/80" />
            <div className="w-3 h-3 rounded-full bg-[#22C55E]/80" />
          </div>
          <div className="flex-1 mx-8">
            <div className="mx-auto max-w-[220px] rounded-md bg-[#27272A] px-3 py-1 text-[11px] text-[#71717A] text-center">
              app.cantaia.io
            </div>
          </div>
        </div>

        <div className="flex min-h-[300px] lg:min-h-[360px]">
          {/* Sidebar */}
          <div className="hidden sm:flex w-14 flex-col items-center gap-3 border-r border-[#27272A] bg-[#0F0F11] py-4">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#F97316] to-[#EA580C] flex items-center justify-center">
              <span className="font-display text-xs font-bold text-white">C</span>
            </div>
            <div className="w-8 h-8 rounded-lg bg-[#F97316]/10 flex items-center justify-center">
              <Mail className="w-3.5 h-3.5 text-[#F97316]" />
            </div>
            <div className="w-8 h-8 rounded-lg bg-[#27272A] flex items-center justify-center">
              <ClipboardList className="w-3.5 h-3.5 text-[#71717A]" />
            </div>
            <div className="w-8 h-8 rounded-lg bg-[#27272A] flex items-center justify-center">
              <BarChart3 className="w-3.5 h-3.5 text-[#71717A]" />
            </div>
          </div>

          {/* Email inbox */}
          <div className="flex-1 p-4 space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-white font-display">Boite de reception</span>
              <span className="rounded-full bg-[#F97316]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#F97316]">12 non lus</span>
            </div>

            <div className="rounded-xl border border-[#F97316]/30 bg-[#F97316]/5 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white">Marc Dupont</span>
                <span className="text-[10px] text-[#71717A]">12 min</span>
              </div>
              <p className="text-[10px] text-[#A1A1AA] mt-0.5">Reservation grue — semaine 14</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="rounded-full bg-[#22C55E]/10 px-2 py-0.5 text-[9px] font-semibold text-[#22C55E]">HRS Lausanne</span>
                <span className="text-[9px] font-semibold text-[#22C55E]">87%</span>
              </div>
            </div>

            <div className="rounded-xl border border-[#27272A] bg-[#27272A]/30 p-3 opacity-50">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-[#71717A]">Hilti AG</span>
                <span className="rounded-full bg-[#EF4444]/10 px-2 py-0.5 text-[9px] font-semibold text-[#EF4444]">Spam</span>
              </div>
              <p className="text-[10px] text-[#52525B] mt-0.5">Catalogue 2026 — Offre speciale</p>
            </div>

            <div className="rounded-xl border border-[#27272A] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white">Julie Favre — Arch.</span>
                <span className="text-[10px] text-[#71717A]">1h</span>
              </div>
              <p className="text-[10px] text-[#A1A1AA] mt-0.5">Plans facade rev. C</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="rounded-full bg-[#3B82F6]/10 px-2 py-0.5 text-[9px] font-semibold text-[#3B82F6]">Cedres</span>
                <span className="rounded-full bg-[#27272A] px-2 py-0.5 text-[9px] text-[#71717A]">PDF</span>
              </div>
            </div>

            <div className="rounded-xl border border-[#27272A] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white">Schaller SARL</span>
                <span className="text-[10px] text-[#71717A]">3h</span>
              </div>
              <p className="text-[10px] text-[#A1A1AA] mt-0.5">RE: Offre garde-corps</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="rounded-full bg-[#F59E0B]/10 px-2 py-0.5 text-[9px] font-semibold text-[#F59E0B]">EMS L&apos;Oree</span>
                <span className="text-[9px] font-semibold text-[#F59E0B]">72%</span>
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="hidden lg:block w-[140px] border-l border-[#27272A] bg-[#0F0F11] p-3">
            <div className="rounded-xl bg-[#18181B] border border-[#27272A] p-3">
              <div className="text-[9px] font-semibold text-white">PV en cours</div>
              <div className="text-[8px] text-[#71717A] mt-0.5">Cedres — Seance #12</div>
              <div className="mt-2 h-1.5 rounded-full bg-[#27272A] overflow-hidden">
                <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C]" />
              </div>
              <div className="text-[8px] text-[#F97316] mt-1">3 min restantes</div>
            </div>
            <div className="mt-3 rounded-xl bg-[#18181B] border border-[#27272A] p-3">
              <div className="text-[9px] font-semibold text-white">Taches</div>
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" /><span className="text-[8px] text-[#A1A1AA]">3 urgentes</span></div>
                <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" /><span className="text-[8px] text-[#A1A1AA]">7 en cours</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: "easeOut" as const },
});

export function HeroSection() {
  const t = useTranslations("landing.hero");

  return (
    <section className="relative bg-[#0F0F11] overflow-hidden">
      {/* Radial gradient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-[radial-gradient(ellipse_at_center,_rgba(249,115,22,0.12)_0%,_transparent_70%)]" />
      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMjcyNzJBIiBzdHJva2Utd2lkdGg9IjAuNSIgc3Ryb2tlLW9wYWNpdHk9IjAuMyIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIvPjwvc3ZnPg==')] opacity-40" />

      <div className="relative mx-auto max-w-[1200px] px-6 pt-20 pb-8 lg:pt-28 lg:pb-12">
        {/* Text content centered */}
        <div className="text-center max-w-[800px] mx-auto">
          <motion.div {...fadeUp(0)}>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F97316]/20 bg-[#F97316]/5 px-4 py-2 text-sm font-medium text-[#F97316]">
              <span className="text-base leading-none">🇨🇭</span>
              {t("badge")}
            </div>
          </motion.div>

          <motion.h1
            {...fadeUp(0.15)}
            className="mt-8 font-display text-5xl font-extrabold leading-[1.05] text-white sm:text-6xl lg:text-[72px]"
          >
            {t("titleLine1")}{" "}
            <span className="bg-gradient-to-r from-[#F97316] via-[#FB923C] to-[#F97316] bg-clip-text text-transparent">
              {t("titleLine3")}
            </span>
          </motion.h1>

          <motion.p
            {...fadeUp(0.3)}
            className="mt-6 mx-auto max-w-[600px] text-lg leading-relaxed text-[#A1A1AA] lg:text-xl"
          >
            {t("subtitle")}
          </motion.p>

          <motion.div {...fadeUp(0.45)} className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#F97316]/25 transition-all duration-200 hover:shadow-xl hover:shadow-[#F97316]/30 hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("cta")} →
            </Link>
            <a
              href="#features"
              className="rounded-xl border border-[#27272A] bg-transparent px-8 py-4 text-base font-semibold text-white transition-all duration-200 hover:bg-[#18181B] hover:border-[#3F3F46] hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("ctaSecondary")}
            </a>
          </motion.div>

          <motion.div {...fadeUp(0.55)} className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <span className="flex items-center gap-2 text-sm text-[#71717A]">
              <span className="text-base leading-none">🇨🇭</span> {t("trust1")}
            </span>
            <span className="hidden sm:block h-4 w-px bg-[#27272A]" />
            <span className="flex items-center gap-2 text-sm text-[#71717A]">
              <span className="text-base leading-none">🤖</span> {t("trust2")}
            </span>
            <span className="hidden sm:block h-4 w-px bg-[#27272A]" />
            <span className="flex items-center gap-2 text-sm text-[#71717A]">
              <Shield className="h-4 w-4 text-[#71717A]" /> {t("trust3")}
            </span>
          </motion.div>
        </div>

        {/* Dashboard mockup */}
        <div className="mt-16 lg:mt-20">
          <DashboardMockup />
        </div>
      </div>

      {/* Bottom fade to next section */}
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0F0F11] to-transparent" />
    </section>
  );
}
