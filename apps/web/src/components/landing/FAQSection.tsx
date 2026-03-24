"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function TrustSection() {
  const t = useTranslations("landing.proof");

  const cards = [
    { emoji: t("card1Emoji"), title: t("card1Title"), description: t("card1Desc"), image: null },
    { emoji: t("card2Emoji"), title: t("card2Title"), description: t("card2Desc"), image: null },
    { emoji: t("card3Emoji"), title: t("card3Title"), description: t("card3Desc"), image: "/landing/trust-datacenter.png" },
  ];

  const bottomStats = [
    { value: t("stat1Value"), label: t("stat1Label") },
    { value: t("stat2Value"), label: t("stat2Label") },
    { value: t("stat3Value"), label: t("stat3Label") },
    { value: t("stat4Value"), label: t("stat4Label") },
  ];

  return (
    <section id="trust" className="relative bg-[#0F0F11] overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27272A] to-transparent" />

      {/* Decorative gradient orbs */}
      <div className="absolute top-0 left-1/4 h-[400px] w-[400px] rounded-full bg-[#F97316]/5 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 h-[300px] w-[300px] rounded-full bg-[#22C55E]/5 blur-3xl" />

      <div className="relative mx-auto max-w-[1200px] px-6 py-24 lg:py-32">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="text-center font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl"
        >
          {t("title")}
        </motion.h2>

        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          {cards.map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group relative rounded-2xl border border-[#27272A] bg-[#18181B]/80 backdrop-blur-sm overflow-hidden h-full transition-all duration-300 hover:border-[#3F3F46]"
            >
              {/* Background image for datacenter card */}
              {card.image && (
                <div className="relative h-40 w-full overflow-hidden">
                  <Image
                    src={card.image}
                    alt={card.title}
                    fill
                    className="object-cover object-center transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#18181B] via-[#18181B]/60 to-transparent" />
                </div>
              )}
              <div className="p-7">
                {!card.image && (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#27272A] text-2xl mb-5">
                    {card.emoji}
                  </div>
                )}
                <h3 className="font-display text-lg font-bold text-white">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#71717A]">{card.description}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mt-16 rounded-2xl border border-[#27272A] bg-[#18181B]/80 backdrop-blur-sm py-8 px-4"
        >
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-0 md:divide-x md:divide-[#27272A]">
            {bottomStats.map((stat, i) => (
              <div key={i} className="flex flex-col items-center px-8 md:px-12">
                <div className="font-display text-2xl font-bold bg-gradient-to-r from-[#F97316] to-[#FB923C] bg-clip-text text-transparent">{stat.value}</div>
                <div className="mt-1.5 text-sm font-medium text-[#71717A]">{stat.label}</div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
