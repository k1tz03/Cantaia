"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { DollarSign, BarChart2, TrendingUp } from "lucide-react";

function EstimationMockup() {
  const rows = [
    { cfc: "215.1", desc: "Beton arme C30/37", qty: "145", unit: "m3", pu: "350", total: "50'750", badge: "real", badgeText: "Donnees reelles", badgeDetail: "37 offres" },
    { cfc: "215.3", desc: "Coffrage dalles", qty: "620", unit: "m2", pu: "55", total: "34'100", badge: "real", badgeText: "Donnees reelles", badgeDetail: "28 offres" },
    { cfc: "215.6", desc: "Ferraillage B500", qty: "18'000", unit: "kg", pu: "2.80", total: "50'400", badge: "crb", badgeText: "Ref. CRB 2025", badgeDetail: "" },
    { cfc: "271.0", desc: "Chape ciment 70mm", qty: "340", unit: "m2", pu: "45", total: "15'300", badge: "real", badgeText: "Donnees reelles", badgeDetail: "6 offres" },
  ];

  return (
    <div className="rounded-2xl border border-[#27272A] bg-[#18181B] shadow-2xl shadow-black/40 overflow-hidden ring-1 ring-white/5">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#0F0F11] border-b border-[#27272A]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/80" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#22C55E]/80" />
        </div>
        <div className="flex-1 text-center text-[10px] font-medium text-[#71717A]">Estimation — Residence Les Cedres</div>
      </div>

      <div className="p-4 space-y-4">
        {/* Score */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#71717A]">Score de fiabilite</span>
            <div className="w-24 h-2 rounded-full bg-[#27272A] overflow-hidden">
              <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-[#22C55E] to-[#16A34A]" />
            </div>
            <span className="text-sm font-bold text-[#22C55E]">78%</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[#27272A] text-[10px] text-[#71717A]">
                <th className="text-left py-2 pr-2 font-medium">CFC</th>
                <th className="text-left py-2 pr-2 font-medium">Description</th>
                <th className="text-right py-2 pr-2 font-medium">Qte</th>
                <th className="text-left py-2 pr-2 font-medium">Un.</th>
                <th className="text-right py-2 pr-2 font-medium">PU</th>
                <th className="text-right py-2 pr-2 font-medium">Total CHF</th>
                <th className="text-left py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.cfc} className="border-b border-[#27272A]/50">
                  <td className="py-2 pr-2 font-mono text-white">{row.cfc}</td>
                  <td className="py-2 pr-2 text-[#A1A1AA]">{row.desc}</td>
                  <td className="py-2 pr-2 text-right font-mono text-[#A1A1AA]">{row.qty}</td>
                  <td className="py-2 pr-2 text-[#71717A]">{row.unit}</td>
                  <td className="py-2 pr-2 text-right font-mono text-[#A1A1AA]">{row.pu}</td>
                  <td className="py-2 pr-2 text-right font-mono font-semibold text-white">{row.total}</td>
                  <td className="py-2">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium ${
                      row.badge === "real"
                        ? "bg-[#22C55E]/10 text-[#22C55E]"
                        : "bg-[#F59E0B]/10 text-[#F59E0B]"
                    }`}>
                      {row.badgeText}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total */}
        <div className="border-t border-[#27272A] pt-3 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-white">TOTAL ESTIME</span>
            <div className="text-[10px] text-[#71717A] mt-0.5">Fourchette : 1&apos;250&apos;000 — 1&apos;720&apos;000 CHF</div>
          </div>
          <span className="text-lg font-bold text-white font-mono">1&apos;480&apos;000 <span className="text-xs font-normal text-[#71717A]">CHF</span></span>
        </div>
      </div>
    </div>
  );
}

export function FeaturePrixSection() {
  const t = useTranslations("landing.features");

  const bullets = [
    { icon: BarChart2, textKey: "priceBullet1" as const },
    { icon: DollarSign, textKey: "priceBullet2" as const },
    { icon: TrendingUp, textKey: "priceBullet3" as const },
  ];

  return (
    <section className="relative bg-[#0F0F11]">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27272A] to-transparent" />

      <div className="mx-auto max-w-[1200px] px-6 py-24 lg:py-32">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Text left */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-[#F59E0B]/20 bg-[#F59E0B]/5 px-3 py-1 text-xs font-semibold text-[#F59E0B] mb-5">
              <DollarSign className="w-3.5 h-3.5" />
              Cantaia Prix
            </div>
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl">
              {t("priceTitle")}
            </h2>
            <p className="mt-4 text-lg text-[#71717A] leading-relaxed">
              {t("priceSubtitle")}
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

          {/* Mockup right */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <EstimationMockup />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
