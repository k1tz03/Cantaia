"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function TrustSection() {
  const t = useTranslations("landing.trust");

  const cards = [
    { emoji: "\uD83C\uDDEA\uD83C\uDDFA", valKey: "card1Val" as const, labelKey: "card1Label" as const },
    { emoji: "\uD83D\uDD12", valKey: "card2Val" as const, labelKey: "card2Label" as const },
    { emoji: "\uD83D\uDCDC", valKey: "card3Val" as const, labelKey: "card3Label" as const },
    { emoji: "\uD83D\uDD10", valKey: "card4Val" as const, labelKey: "card4Label" as const },
  ];

  return (
    <section id="trust" className="relative overflow-hidden" style={{ padding: "120px 48px" }}>
      {/* Datacenter background image */}
      <div className="absolute inset-0">
        <Image
          src="/landing/trust-datacenter.png"
          alt=""
          fill
          className="object-cover object-center opacity-[0.08]"
          style={{ filter: "saturate(0.4)" }}
          sizes="100vw"
        />
      </div>

      {/* Overlay gradient */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, #0F0F11, rgba(15,15,17,0.92), #0F0F11)" }}
      />

      <div className="relative z-[2] mx-auto max-w-[1000px] text-center">
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
          className="text-[12px] uppercase tracking-[0.2em] text-[#F97316] font-semibold text-center mb-3"
        >
          {t("label")}
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.85, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-[46px] font-extrabold text-[#FAFAFA] text-center tracking-[-1.5px] leading-[1.1] mb-4"
        >
          {t("title")}
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 36 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.85, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="text-[18px] text-[#52525B] text-center max-w-[560px] mx-auto leading-[1.6] mb-14"
        >
          {t("desc")}
        </motion.p>

        {/* 4 trust cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 36 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.85, delay: 0.05 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="bg-[rgba(24,24,27,0.6)] border border-[#27272A] rounded-[20px] py-8 px-6 text-center backdrop-blur-lg transition-all duration-300 hover:border-[rgba(249,115,22,0.2)] hover:-translate-y-1"
            >
              <div className="text-[32px] mb-[14px]">{card.emoji}</div>
              <div className="font-display text-[28px] font-extrabold text-[#FAFAFA]">
                {t(card.valKey)}
              </div>
              <div className="text-[13px] text-[#52525B] mt-1">{t(card.labelKey)}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
