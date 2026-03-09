"use client";

import { AnimatedSection } from "./AnimatedSection";

const stats = [
  { number: "2'500+", label: "offres analysées" },
  { number: "60+", label: "fournisseurs référencés" },
  { number: "3 ans", label: "de données réelles" },
  { number: "🇨🇭", label: "Made in Switzerland" },
];

export function ProofSection() {
  return (
    <section className="bg-white border-y border-[#E5E7EB]">
      <div className="mx-auto max-w-[1200px] px-6 py-12">
        <AnimatedSection>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-0 md:divide-x md:divide-[#E5E7EB]">
            {stats.map((stat, i) => (
              <div key={i} className="flex flex-col items-center px-8 md:px-12">
                <div className="font-display text-3xl font-bold text-[#2563EB]">{stat.number}</div>
                <div className="mt-1 text-sm text-[#6B7280]">{stat.label}</div>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
