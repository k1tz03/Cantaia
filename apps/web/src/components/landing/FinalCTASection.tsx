"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function FinalCTASection() {
  const t = useTranslations("landing.finalCta");

  return (
    <section className="relative text-center overflow-hidden" style={{ padding: "160px 48px" }}>
      {/* Background image */}
      <div className="absolute inset-0">
        <Image
          src="/landing/cta-manager.png"
          alt=""
          fill
          className="object-cover object-center opacity-10"
          style={{ filter: "saturate(0.5)" }}
          sizes="100vw"
        />
      </div>

      {/* Overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at center bottom, rgba(249,115,22,0.08), transparent), linear-gradient(180deg, #0F0F11, rgba(15,15,17,0.85), #0F0F11)",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 36 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-[2]"
      >
        <h2 className="font-display text-[52px] font-extrabold text-[#FAFAFA] tracking-[-1.5px] leading-[1.1] mb-4">
          {t("titleLine1")}{" "}
          <br />
          {t("titleLine2")}
        </h2>

        <p className="text-[18px] text-[#52525B] mb-10">
          {t("subtitle")}
        </p>

        <Link
          href="/register"
          className="inline-flex items-center gap-2 px-12 py-[18px] rounded-[14px] bg-gradient-to-br from-[#F97316] to-[#EA580C] text-white text-[18px] font-semibold shadow-[0_0_50px_rgba(249,115,22,0.3)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_0_70px_rgba(249,115,22,0.4)]"
        >
          {t("cta")}
        </Link>

        <div className="text-[13px] text-[#3F3F46] mt-5">
          {t("note")}
        </div>
      </motion.div>
    </section>
  );
}
