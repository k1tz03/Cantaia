"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Mic, FileText, Send } from "lucide-react";

function PVMockup() {
  return (
    <div className="rounded-2xl border border-[#27272A] bg-[#18181B] shadow-2xl shadow-black/40 overflow-hidden ring-1 ring-white/5">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0F0F11] border-b border-[#27272A]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#22C55E]/80" />
        </div>
        <div className="flex-1 text-center text-[10px] font-medium text-[#71717A]">PV de chantier — Cedres — Seance #12</div>
      </div>

      <div className="p-5 space-y-4">
        {/* Audio bar */}
        <div className="flex items-center gap-3 rounded-lg bg-[#0F0F11] p-3 border border-[#27272A]">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#F97316] to-[#EA580C]">
            <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-[#27272A] overflow-hidden">
              <div className="h-full w-[85%] rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C]" />
            </div>
          </div>
          <span className="text-xs text-[#71717A] font-mono">45:12</span>
        </div>

        {/* Steps */}
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22C55E]">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <span className="text-sm text-white">Transcription terminee</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22C55E]">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <span className="text-sm text-white">PV genere — <span className="text-[#F97316] font-medium">12 decisions, 8 actions</span></span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#22C55E]">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <span className="text-sm text-white">Envoye a 5 participants</span>
          </div>
        </div>

        {/* Time badge */}
        <div className="inline-flex items-center gap-2 rounded-full bg-[#22C55E]/10 border border-[#22C55E]/20 px-3 py-1.5">
          <svg className="w-4 h-4 text-[#22C55E]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-sm font-semibold text-[#22C55E]">5 min au lieu de 2h</span>
        </div>

        {/* PV preview */}
        <div className="rounded-lg border border-[#27272A] p-4 bg-[#0F0F11]">
          <div className="text-[11px] font-semibold text-white mb-2">3. Decisions</div>
          <div className="space-y-2.5 text-[10px] text-[#A1A1AA] leading-relaxed">
            <p>
              <span className="font-medium text-white">3.1</span> Le beton du radier sera coule semaine 15. Pompage confirme par Holcim.
            </p>
            <p>
              <span className="font-medium text-white">3.2</span> Les plans facade rev. C sont approuves. Distribution par l&apos;architecte d&apos;ici vendredi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SpotlightSection() {
  const t = useTranslations("landing.spotlight");

  const bullets = [
    { icon: Mic, textKey: "pvBullet1" as const },
    { icon: FileText, textKey: "pvBullet2" as const },
    { icon: Send, textKey: "pvBullet3" as const },
  ];

  return (
    <section className="relative bg-[#0F0F11]">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27272A] to-transparent" />

      <div className="mx-auto max-w-[1200px] px-6 py-24 lg:py-32">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Mockup left */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <PVMockup />
          </motion.div>

          {/* Text right */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[#22C55E]/20 bg-[#22C55E]/5 px-3 py-1 text-xs font-semibold text-[#22C55E] mb-5">
              <Mic className="w-3.5 h-3.5" />
              Cantaia PV
            </div>
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              {t("pvTitle")}
            </h2>
            <p className="mt-4 text-lg text-[#71717A] leading-relaxed">
              {t("pvSubtitle")}
            </p>

            <div className="mt-8 space-y-4">
              {bullets.map((bullet, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl bg-[#18181B] border border-[#27272A] p-4 transition-all duration-300 hover:border-[#3F3F46]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#F97316]/10 shrink-0">
                    <bullet.icon className="w-4 h-4 text-[#F97316]" />
                  </span>
                  <span className="text-sm text-[#A1A1AA] leading-relaxed pt-1.5">{t(bullet.textKey)}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
