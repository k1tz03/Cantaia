"use client";

import { useTranslations } from "next-intl";
import { AnimatedSection } from "./AnimatedSection";

function InboxMockup() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F9FAFB] border-b border-gray-200">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
        </div>
        <div className="flex-1 text-center text-[10px] text-gray-400">CANTAIA — Emails</div>
      </div>

      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-[#111827]">Boîte de réception</span>
          <div className="flex gap-2 text-[10px] text-gray-400">
            <span className="font-medium text-[#2563EB]">Tous</span>
            <span>Non lus</span>
          </div>
        </div>

        {/* Email rows */}
        <div className="rounded-lg border border-[#10B981]/20 bg-[#10B981]/5 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#111827]">Marc Dupont</span>
            <span className="text-[10px] text-gray-400">il y a 12m</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">Réservation grue — semaine 14</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="rounded-full bg-[#10B981]/15 px-2.5 py-0.5 text-[9px] font-semibold text-[#10B981]">HRS Lausanne</span>
            <span className="rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[9px] font-medium text-[#10B981]">87%</span>
          </div>
        </div>

        <div className="rounded-lg border border-[#EF4444]/20 bg-[#EF4444]/5 p-3 opacity-50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-gray-400 line-through">Hilti AG — Catalogue 2026</span>
            <span className="rounded-full bg-[#EF4444]/10 px-2.5 py-0.5 text-[9px] font-semibold text-[#EF4444]">Spam</span>
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#111827]">Julie Favre — Arch.</span>
            <span className="text-[10px] text-gray-400">il y a 1h</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">Plans façade rév. C</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="rounded-full bg-[#2563EB]/10 px-2.5 py-0.5 text-[9px] font-semibold text-[#2563EB]">Cèdres</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] text-gray-500 flex items-center gap-1">
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
              PDF
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-gray-100 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-[#111827]">Schaller SARL</span>
            <span className="text-[10px] text-gray-400">il y a 3h</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">RE: Offre garde-corps</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="rounded-full bg-[#F59E0B]/10 px-2.5 py-0.5 text-[9px] font-semibold text-[#F59E0B]">EMS L&apos;Orée</span>
            <span className="rounded-full bg-[#F59E0B]/10 px-2 py-0.5 text-[9px] font-medium text-[#F59E0B]">72%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BulletPoint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <svg className="h-5 w-5 flex-shrink-0 text-[#10B981] mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
      <span className="text-[#6B7280]">{children}</span>
    </div>
  );
}

export function FeaturesSection() {
  const t = useTranslations("landing.features");

  return (
    <section id="features" className="bg-white">
      <div className="mx-auto max-w-[1200px] px-6 py-20 lg:py-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Text left */}
          <AnimatedSection>
            <div>
              <h2 className="font-display text-3xl font-bold text-[#111827] sm:text-4xl">
                {t("emailTitle")}
              </h2>
              <p className="mt-4 text-lg text-[#6B7280] leading-relaxed">
                {t("emailSubtitle")}
              </p>

              <div className="mt-8 space-y-4">
                <BulletPoint>{t("emailBullet1")}</BulletPoint>
                <BulletPoint>{t("emailBullet2")}</BulletPoint>
                <BulletPoint>{t("emailBullet3")}</BulletPoint>
              </div>

              <a href="#how-it-works" className="group mt-8 inline-flex items-center gap-1 text-[#2563EB] font-medium hover:underline">
                {t("emailCta")}
                <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </a>
            </div>
          </AnimatedSection>

          {/* Mockup right */}
          <AnimatedSection delay={0.2}>
            <InboxMockup />
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
