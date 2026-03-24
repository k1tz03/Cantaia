"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function ProblemSection() {
  const t = useTranslations("landing.problem");

  return (
    <section className="mx-auto max-w-[1200px]" style={{ padding: "120px 48px" }}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
        {/* Left — Image */}
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          className="relative"
        >
          <div className="rounded-[20px] overflow-hidden border border-[#27272A] shadow-[0_30px_80px_rgba(0,0,0,0.5)] -rotate-2 transition-transform duration-500 hover:rotate-0 hover:scale-[1.02] relative">
            <Image
              src="/landing/problem-bg.png"
              alt={t("imageAlt")}
              width={600}
              height={400}
              className="w-full block"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            {/* Gradient border overlay */}
            <div className="absolute -inset-[2px] rounded-[22px] pointer-events-none" style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.2), transparent, rgba(245,158,11,0.15))" }} />
          </div>

          {/* Floating stat */}
          <div
            className="absolute -bottom-5 -right-5 z-[2] bg-[rgba(24,24,27,0.95)] border border-[#27272A] rounded-[14px] px-5 py-[14px] backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
            style={{ animation: "float 4s ease-in-out infinite" }}
          >
            <div className="font-display text-[28px] font-extrabold text-[#EF4444]">{t("floatValue")}</div>
            <div className="text-[11px] text-[#52525B]">{t("floatLabel")}</div>
          </div>

          <style jsx>{`
            @keyframes float {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-12px); }
            }
          `}</style>
        </motion.div>

        {/* Right — Pain points */}
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="font-display text-[42px] font-extrabold text-[#FAFAFA] tracking-[-1px] mb-7 leading-[1.1]">
            {t("titlePre")} <span className="text-[#F87171]">{t("titleRed")}</span>
            <br />
            {t("titlePost")}
          </h2>

          {/* Pain cards */}
          {[
            { emoji: "\uD83D\uDCE7", bg: "rgba(239,68,68,0.1)", titleKey: "pain1Title" as const, descKey: "pain1Desc" as const },
            { emoji: "\uD83D\uDCCB", bg: "rgba(245,158,11,0.1)", titleKey: "pain2Title" as const, descKey: "pain2Desc" as const },
            { emoji: "\u23F0", bg: "rgba(239,68,68,0.1)", titleKey: "pain3Title" as const, descKey: "pain3Desc" as const },
          ].map((pain, i) => (
            <div
              key={i}
              className="flex gap-[14px] items-start mb-3 p-[16px_18px] bg-[#18181B] border border-[#27272A] rounded-[14px] transition-all duration-300 hover:border-[#3F3F46] hover:translate-x-1"
            >
              <div
                className="w-10 h-10 rounded-[10px] flex items-center justify-center text-[18px] flex-shrink-0"
                style={{ background: pain.bg }}
              >
                {pain.emoji}
              </div>
              <div className="text-[14px] text-[#A1A1AA] leading-[1.55]">
                <b className="text-[#FAFAFA] font-semibold">{t(pain.titleKey)}</b> — {t(pain.descKey)}
              </div>
            </div>
          ))}

          {/* Solution strip */}
          <div className="mt-7 p-[20px_24px] border border-[rgba(16,185,129,0.15)] rounded-[14px]" style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.06), rgba(16,185,129,0.02))" }}>
            <h3 className="font-display text-[18px] font-bold text-[#10B981] mb-[14px]">
              {t("solutionTitle")}
            </h3>
            {["sol1", "sol2", "sol3", "sol4"].map((key) => (
              <div key={key} className="flex gap-[10px] items-start mb-2">
                <div className="w-[22px] h-[22px] rounded-full bg-[rgba(16,185,129,0.12)] flex items-center justify-center text-[#34D399] text-[12px] font-bold flex-shrink-0 mt-[1px]">
                  {"\u2713"}
                </div>
                <div className="text-[14px] text-[#D4D4D8] leading-[1.5]">{t(key)}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
