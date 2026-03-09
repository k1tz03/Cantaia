"use client";

import { Link } from "@/i18n/navigation";
import { AnimatedSection } from "./AnimatedSection";

const features = [
  "Triage intelligent des emails",
  "PV de séance automatiques",
  "Gestion des tâches IA",
  "Briefing quotidien",
  "Estimation de prix sur données réelles",
  "Support prioritaire",
];

export function PricingSection() {
  return (
    <section id="pricing" className="bg-white">
      <div className="mx-auto max-w-[1200px] px-6 py-20 lg:py-24">
        <AnimatedSection>
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl font-bold text-[#111827] sm:text-4xl">
              Un seul plan. Tout inclus.
            </h2>
            <p className="mt-3 text-lg text-[#6B7280]">
              Pas de modules payants cachés.
            </p>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <div className="mx-auto max-w-[480px]">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-xl border-t-4 border-t-[#2563EB] overflow-hidden">
              <div className="p-8">
                <div className="text-center">
                  <h3 className="font-display text-xl font-bold text-[#111827]">CANTAIA Fondateur</h3>
                  <div className="mt-4 flex items-baseline justify-center gap-1">
                    <span className="font-display text-5xl font-extrabold text-[#111827]">99</span>
                    <span className="text-xl text-[#6B7280]">CHF / mois</span>
                  </div>
                  <p className="mt-2 text-sm text-[#2563EB] font-medium">
                    Prix bloqué 12 mois pour les premiers utilisateurs
                  </p>
                </div>

                <div className="mt-8 space-y-3">
                  {features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <svg className="h-5 w-5 flex-shrink-0 text-[#10B981]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-[#111827]">{feature}</span>
                    </div>
                  ))}
                </div>

                <Link
                  href="/register"
                  className="mt-8 block w-full rounded-lg bg-[#2563EB] py-3.5 text-center text-base font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:bg-[#1D4ED8] hover:shadow-xl"
                >
                  Essai gratuit — 14 jours
                </Link>

                <p className="mt-3 text-center text-sm text-[#6B7280]">
                  Sans engagement. Sans carte bancaire.
                </p>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
