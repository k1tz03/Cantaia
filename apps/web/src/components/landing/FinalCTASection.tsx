"use client";

import { Link } from "@/i18n/navigation";
import { AnimatedSection } from "./AnimatedSection";

export function FinalCTASection() {
  return (
    <section className="bg-gradient-to-br from-[#2563EB] to-[#1D4ED8]">
      <div className="mx-auto max-w-[1200px] px-6 py-20 lg:py-28">
        <AnimatedSection>
          <div className="text-center">
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
              Prêt à gagner 2 heures par jour ?
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-lg text-white/80">
              Rejoignez les chefs de projet qui ont transformé leur gestion de chantier.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/register"
                className="rounded-lg bg-white px-8 py-3.5 text-base font-semibold text-[#2563EB] shadow-lg transition-all hover:bg-gray-50 hover:shadow-xl"
              >
                Essai gratuit — 14 jours
              </Link>
              <a
                href="mailto:demo@cantaia.ch"
                className="rounded-lg border-2 border-white/30 px-8 py-3.5 text-base font-semibold text-white transition-all hover:border-white/60 hover:bg-white/10"
              >
                Demander une démo
              </a>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
