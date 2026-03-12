"use client";

import { useTranslations } from "next-intl";
import { AnimatedSection } from "./AnimatedSection";

function PVMockup() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F9FAFB] border-b border-gray-200">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
        </div>
        <div className="flex-1 text-center text-[10px] text-gray-400">PV de chantier — Cèdres — Séance #12</div>
      </div>

      <div className="p-5 space-y-4">
        {/* Audio bar */}
        <div className="flex items-center gap-3 rounded-lg bg-[#F9FAFB] p-3 border border-gray-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB]">
            <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
          <div className="flex-1">
            <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-full w-[85%] rounded-full bg-[#2563EB]" />
            </div>
          </div>
          <span className="text-xs text-gray-400 font-mono">45:12</span>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#10B981]">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <span className="text-sm text-[#111827]">Transcription terminée</span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#10B981]">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <span className="text-sm text-[#111827]">PV généré — <span className="text-[#2563EB] font-medium">12 décisions, 8 actions</span></span>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#10B981]">
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <span className="text-sm text-[#111827]">Envoyé à 5 participants</span>
          </div>
        </div>

        {/* Time badge */}
        <div className="inline-flex items-center gap-2 rounded-full bg-[#10B981]/10 px-3 py-1.5">
          <svg className="w-4 h-4 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span className="text-sm font-semibold text-[#10B981]">5 min au lieu de 2h</span>
        </div>

        {/* PV preview */}
        <div className="rounded-lg border border-gray-200 p-4 bg-[#F9FAFB]">
          <div className="text-[11px] font-semibold text-[#111827] mb-2">3. Décisions</div>
          <div className="space-y-2.5 text-[10px] text-[#6B7280] leading-relaxed">
            <p>
              <span className="font-medium text-[#111827]">3.1</span> Le béton du radier sera coulé semaine 15. Pompage confirmé par Holcim.
            </p>
            <p>
              <span className="font-medium text-[#111827]">3.2</span> Les plans façade rév. C sont approuvés. Distribution par l&apos;architecte d&apos;ici vendredi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SpotlightSection() {
  const t = useTranslations("landing.spotlight");

  return (
    <section className="bg-[#FAFAFA]">
      <div className="mx-auto max-w-[1200px] px-6 py-20 lg:py-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Mockup left */}
          <AnimatedSection>
            <PVMockup />
          </AnimatedSection>

          {/* Text right */}
          <AnimatedSection delay={0.2}>
            <div>
              <h2 className="font-display text-3xl font-bold text-[#111827] sm:text-4xl">
                {t("pvTitle")}
              </h2>
              <p className="mt-4 text-lg text-[#6B7280] leading-relaxed">
                {t("pvSubtitle")}
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg">🎙️</span>
                  <span className="text-[#6B7280]">{t("pvBullet1")}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">📋</span>
                  <span className="text-[#6B7280]">{t("pvBullet2")}</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">📧</span>
                  <span className="text-[#6B7280]">{t("pvBullet3")}</span>
                </div>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
