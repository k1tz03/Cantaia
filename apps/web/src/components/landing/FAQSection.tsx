"use client";

import { AnimatedSection } from "./AnimatedSection";

const cards = [
  {
    emoji: "🇨🇭",
    title: "Pensé pour la Suisse",
    description: "Codes CFC, normes SIA, multilingue FR/DE/EN, prix en CHF.",
  },
  {
    emoji: "🏗️",
    title: "Né sur le terrain",
    description: "Développé par un chef de projet qui gère 5+ chantiers simultanément. Chaque feature résout un vrai problème.",
  },
  {
    emoji: "🔒",
    title: "Vos données restent en Europe",
    description: "Hébergement européen. Chiffrement de bout en bout. Conforme RGPD et droit suisse.",
  },
];

const bottomStats = [
  { value: "2'500+", label: "prix réels" },
  { value: "60+", label: "fournisseurs" },
  { value: "3", label: "langues" },
  { value: "5 min", label: "pour démarrer" },
];

export function TrustSection() {
  return (
    <section className="bg-[#111827]">
      <div className="mx-auto max-w-[1200px] px-6 py-20 lg:py-24">
        <AnimatedSection>
          <h2 className="text-center font-display text-3xl font-bold text-white sm:text-4xl">
            Conçu par et pour des chefs de projet construction
          </h2>
        </AnimatedSection>

        <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
          {cards.map((card, i) => (
            <AnimatedSection key={i} delay={i * 0.1}>
              <div className="rounded-xl border border-white/10 bg-white/5 backdrop-blur p-6 h-full">
                <div className="text-3xl mb-4">{card.emoji}</div>
                <h3 className="font-display text-lg font-bold text-white">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">{card.description}</p>
              </div>
            </AnimatedSection>
          ))}
        </div>

        <AnimatedSection delay={0.3}>
          <div className="mt-16 flex flex-wrap items-center justify-center gap-8 md:gap-0 md:divide-x md:divide-white/10">
            {bottomStats.map((stat, i) => (
              <div key={i} className="flex flex-col items-center px-8 md:px-12">
                <div className="font-display text-2xl font-bold text-white">{stat.value}</div>
                <div className="mt-1 text-sm text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
