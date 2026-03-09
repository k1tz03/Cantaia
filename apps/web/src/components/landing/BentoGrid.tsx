"use client";

import { AnimatedSection } from "./AnimatedSection";

function EstimationMockup() {
  const rows = [
    { cfc: "215.1", desc: "Béton armé C30/37", qty: "145", unit: "m³", pu: "350", total: "50'750", badge: "real", badgeText: "Données réelles", badgeDetail: "37 offres" },
    { cfc: "215.3", desc: "Coffrage dalles", qty: "620", unit: "m²", pu: "55", total: "34'100", badge: "real", badgeText: "Données réelles", badgeDetail: "28 offres" },
    { cfc: "215.6", desc: "Ferraillage B500", qty: "18'000", unit: "kg", pu: "2.80", total: "50'400", badge: "crb", badgeText: "Réf. CRB 2025", badgeDetail: "" },
    { cfc: "271.0", desc: "Chape ciment 70mm", qty: "340", unit: "m²", pu: "45", total: "15'300", badge: "real", badgeText: "Données réelles", badgeDetail: "6 offres" },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#F9FAFB] border-b border-gray-200">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
        </div>
        <div className="flex-1 text-center text-[10px] text-gray-400">Estimation — Résidence Les Cèdres</div>
      </div>

      <div className="p-4 space-y-4">
        {/* Score */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6B7280]">Score de fiabilité</span>
            <div className="w-24 h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full w-[78%] rounded-full bg-[#10B981]" />
            </div>
            <span className="text-sm font-bold text-[#10B981]">78%</span>
          </div>
          <span className="text-[10px] text-[#10B981] font-medium">Estimation fiable</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-gray-100 text-[10px] text-[#6B7280]">
                <th className="text-left py-2 pr-2 font-medium">CFC</th>
                <th className="text-left py-2 pr-2 font-medium">Description</th>
                <th className="text-right py-2 pr-2 font-medium">Qté</th>
                <th className="text-left py-2 pr-2 font-medium">Un.</th>
                <th className="text-right py-2 pr-2 font-medium">PU</th>
                <th className="text-right py-2 pr-2 font-medium">Total CHF</th>
                <th className="text-left py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.cfc} className="border-b border-gray-50">
                  <td className="py-2 pr-2 font-mono text-[#111827]">{row.cfc}</td>
                  <td className="py-2 pr-2 text-[#111827]">{row.desc}</td>
                  <td className="py-2 pr-2 text-right font-mono">{row.qty}</td>
                  <td className="py-2 pr-2 text-[#6B7280]">{row.unit}</td>
                  <td className="py-2 pr-2 text-right font-mono">{row.pu}</td>
                  <td className="py-2 pr-2 text-right font-mono font-semibold text-[#111827]">{row.total}</td>
                  <td className="py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                      row.badge === "real"
                        ? "bg-[#10B981]/10 text-[#10B981]"
                        : "bg-[#F59E0B]/10 text-[#F59E0B]"
                    }`}>
                      {row.badge === "real" ? "●" : "●"} {row.badgeText}
                    </span>
                    {row.badgeDetail && (
                      <span className="block text-[8px] text-[#6B7280] mt-0.5 pl-0.5">{row.badgeDetail}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-[#111827]">TOTAL ESTIMÉ</span>
            <div className="text-[10px] text-[#6B7280] mt-0.5">Fourchette : 1'250'000 — 1'720'000 CHF</div>
          </div>
          <span className="text-lg font-bold text-[#111827] font-mono">1'480'000 <span className="text-xs font-normal text-[#6B7280]">CHF</span></span>
        </div>
      </div>
    </div>
  );
}

export function FeaturePrixSection() {
  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1200px] px-6 py-20 lg:py-24">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Text left */}
          <AnimatedSection>
            <div>
              <h2 className="font-display text-3xl font-bold text-[#111827] sm:text-4xl">
                Vos estimations vérifiées contre 2'500 offres réelles
              </h2>
              <p className="mt-4 text-lg text-[#6B7280] leading-relaxed">
                Chaque prix est comparé à notre base de données du marché suisse. Vous voyez d'où vient chaque chiffre — fini les estimations au doigt mouillé.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg">📊</span>
                  <span className="text-[#6B7280]">Prix médians par code CFC et par région</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">🟢</span>
                  <span className="text-[#6B7280]">Badge "Données réelles" sur chaque ligne vérifiée</span>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-lg">📈</span>
                  <span className="text-[#6B7280]">Score de fiabilité transparent (pas de boîte noire)</span>
                </div>
              </div>
            </div>
          </AnimatedSection>

          {/* Mockup right */}
          <AnimatedSection delay={0.2}>
            <EstimationMockup />
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
