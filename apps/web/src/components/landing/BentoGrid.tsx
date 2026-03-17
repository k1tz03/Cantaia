"use client";

import { useTranslations } from "next-intl";
import { AnimatedSection } from "./AnimatedSection";

function EstimationMockup() {
  const rows = [
    { cfc: "215.1", desc: "Béton armé C30/37", qty: "145", unit: "m³", pu: "350", total: "50'750", badge: "real", badgeText: "Données réelles", badgeDetail: "37 offres" },
    { cfc: "215.3", desc: "Coffrage dalles", qty: "620", unit: "m²", pu: "55", total: "34'100", badge: "real", badgeText: "Données réelles", badgeDetail: "28 offres" },
    { cfc: "215.6", desc: "Ferraillage B500", qty: "18'000", unit: "kg", pu: "2.80", total: "50'400", badge: "crb", badgeText: "Réf. CRB 2025", badgeDetail: "" },
    { cfc: "271.0", desc: "Chape ciment 70mm", qty: "340", unit: "m²", pu: "45", total: "15'300", badge: "real", badgeText: "Données réelles", badgeDetail: "6 offres" },
  ];

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-xl shadow-gray-200/50 overflow-hidden ring-1 ring-gray-900/5">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-b from-gray-50 to-gray-100/80 border-b border-gray-200/60">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444] shadow-sm shadow-red-200" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] shadow-sm shadow-amber-200" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#10B981] shadow-sm shadow-emerald-200" />
        </div>
        <div className="flex-1 text-center text-[10px] font-medium text-gray-400">Estimation — Résidence Les Cèdres</div>
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
            <div className="text-[10px] text-[#6B7280] mt-0.5">Fourchette : 1&apos;250&apos;000 — 1&apos;720&apos;000 CHF</div>
          </div>
          <span className="text-lg font-bold text-[#111827] font-mono">1&apos;480&apos;000 <span className="text-xs font-normal text-[#6B7280]">CHF</span></span>
        </div>
      </div>
    </div>
  );
}

export function FeaturePrixSection() {
  const t = useTranslations("landing.features");

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-[1200px] px-6 py-20 lg:py-28">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Text left */}
          <AnimatedSection>
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 mb-5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                Cantaia Prix
              </div>
              <h2 className="font-display text-3xl font-bold text-[#111827] sm:text-4xl">
                {t("priceTitle")}
              </h2>
              <p className="mt-4 text-lg text-[#6B7280] leading-relaxed">
                {t("priceSubtitle")}
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 border border-gray-100">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-gray-100 shrink-0"><span className="text-base">📊</span></span>
                  <span className="text-sm text-[#6B7280] leading-relaxed pt-1">{t("priceBullet1")}</span>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 border border-gray-100">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-gray-100 shrink-0"><span className="text-base">🟢</span></span>
                  <span className="text-sm text-[#6B7280] leading-relaxed pt-1">{t("priceBullet2")}</span>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3 border border-gray-100">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-gray-100 shrink-0"><span className="text-base">📈</span></span>
                  <span className="text-sm text-[#6B7280] leading-relaxed pt-1">{t("priceBullet3")}</span>
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
