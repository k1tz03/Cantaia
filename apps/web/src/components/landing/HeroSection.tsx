"use client";

import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";

function CheckIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-[#10B981]" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function DashboardMockup() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
      {/* Browser bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F9FAFB] border-b border-gray-200">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#EF4444]" />
          <div className="w-3 h-3 rounded-full bg-[#F59E0B]" />
          <div className="w-3 h-3 rounded-full bg-[#10B981]" />
        </div>
        <div className="flex-1 mx-4">
          <div className="mx-auto max-w-[200px] rounded-md bg-white px-3 py-1 text-[11px] text-gray-400 text-center border border-gray-100">
            app.cantaia.ch
          </div>
        </div>
      </div>

      <div className="flex min-h-[320px]">
        {/* Sidebar */}
        <div className="hidden sm:flex w-12 flex-col items-center gap-3 border-r border-gray-100 bg-[#F9FAFB] py-3">
          <div className="w-7 h-7 rounded-lg bg-[#2563EB] flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          </div>
        </div>

        {/* Email inbox */}
        <div className="flex-1 p-3 space-y-1.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#111827] font-display">Boîte de réception</span>
            <span className="text-[10px] text-gray-400">12 non lus</span>
          </div>

          <div className="rounded-lg border border-[#2563EB]/20 bg-[#EFF6FF]/50 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#111827]">Marc Dupont</span>
              <span className="text-[10px] text-gray-400">12 min</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">Réservation grue — semaine 14</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="rounded-full bg-[#10B981]/10 px-2 py-0.5 text-[9px] font-medium text-[#10B981]">HRS Lausanne</span>
              <span className="text-[9px] font-medium text-[#10B981]">87%</span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-2.5 opacity-60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Hilti AG</span>
              <span className="rounded-full bg-[#EF4444]/10 px-2 py-0.5 text-[9px] font-medium text-[#EF4444]">Spam</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">Catalogue 2026 — Offre spéciale</p>
          </div>

          <div className="rounded-lg border border-gray-100 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#111827]">Julie Favre — Arch.</span>
              <span className="text-[10px] text-gray-400">1h</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">Plans façade rév. C</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="rounded-full bg-[#2563EB]/10 px-2 py-0.5 text-[9px] font-medium text-[#2563EB]">Cèdres</span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[9px] text-gray-500">PDF</span>
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#111827]">Schaller SARL</span>
              <span className="text-[10px] text-gray-400">3h</span>
            </div>
            <p className="text-[10px] text-gray-500 mt-0.5">RE: Offre garde-corps</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="rounded-full bg-[#F59E0B]/10 px-2 py-0.5 text-[9px] font-medium text-[#F59E0B]">EMS L'Orée</span>
              <span className="text-[9px] font-medium text-[#F59E0B]">72%</span>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="hidden md:block w-[130px] border-l border-gray-100 bg-[#F9FAFB] p-2.5">
          <div className="rounded-lg bg-white border border-gray-100 p-2">
            <div className="text-[9px] font-semibold text-[#111827]">PV en cours</div>
            <div className="text-[8px] text-gray-400 mt-0.5">Cèdres — Séance #12</div>
            <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full w-3/4 rounded-full bg-[#2563EB]" />
            </div>
            <div className="text-[8px] text-[#2563EB] mt-1">3 min restantes</div>
          </div>
          <div className="mt-2 rounded-lg bg-white border border-gray-100 p-2">
            <div className="text-[9px] font-semibold text-[#111827]">Tâches</div>
            <div className="mt-1 space-y-1">
              <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#EF4444]" /><span className="text-[8px] text-gray-500">3 urgentes</span></div>
              <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" /><span className="text-[8px] text-gray-500">7 en cours</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section className="bg-[#FAFAFA] overflow-hidden">
      <div className="mx-auto max-w-[1200px] px-6 py-16 lg:py-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16">
          <motion.div
            className="lg:col-span-7"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-[#EFF6FF] px-4 py-2 text-sm font-medium text-[#2563EB]">
              <span>🇨🇭</span> Conçu en Suisse pour la construction
            </div>

            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.1] text-[#111827] sm:text-5xl lg:text-[52px]">
              Vos emails triés.<br />
              Vos PV rédigés.<br />
              Vos prix vérifiés.
            </h1>

            <p className="mt-6 max-w-[520px] text-lg leading-relaxed text-[#6B7280]">
              CANTAIA analyse vos emails de chantier, génère vos procès-verbaux et estime vos prix depuis des données réelles. Vous gagnez 2 heures par jour.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/register" className="rounded-lg bg-[#2563EB] px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-[#1D4ED8] hover:shadow-xl">
                Essai gratuit — 14 jours
              </Link>
              <a href="#features" className="rounded-lg border border-[#E5E7EB] px-6 py-3.5 text-base font-semibold text-[#111827] transition-colors hover:bg-gray-50">
                Voir la démo
              </a>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#6B7280]">
              <span className="flex items-center gap-1.5"><CheckIcon /> Normes SIA</span>
              <span className="flex items-center gap-1.5"><CheckIcon /> Données en Europe</span>
              <span className="flex items-center gap-1.5"><CheckIcon /> Sans carte bancaire</span>
            </div>
          </motion.div>

          <motion.div
            className="lg:col-span-5"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="lg:rotate-1 lg:scale-105">
              <DashboardMockup />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
