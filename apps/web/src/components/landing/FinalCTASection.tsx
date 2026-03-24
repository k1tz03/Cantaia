"use client";

import { Link } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

export function FinalCTASection() {
  const t = useTranslations("landing.finalCta");

  return (
    <section className="relative bg-[#0F0F11] overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#27272A] to-transparent" />

      {/* Orange radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-[radial-gradient(ellipse_at_center,_rgba(249,115,22,0.08)_0%,_transparent_60%)]" />

      <div className="relative mx-auto max-w-[1200px] px-6 py-24 lg:py-36">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="text-center"
        >
          <h2 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl max-w-[700px] mx-auto leading-tight">
            {t("title")}
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-lg text-[#71717A] leading-relaxed">
            {t("subtitle")}
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-10 py-4 text-base font-semibold text-white shadow-lg shadow-[#F97316]/25 transition-all hover:shadow-xl hover:shadow-[#F97316]/30 hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("ctaPrimary")}
            </Link>
            <a
              href="mailto:demo@cantaia.io"
              className="rounded-xl border border-[#27272A] px-10 py-4 text-base font-semibold text-white transition-all hover:bg-[#18181B] hover:border-[#3F3F46]"
            >
              {t("ctaSecondary")}
            </a>
          </div>

          <p className="mt-8 text-sm text-[#52525B]">
            14 jours d&apos;essai · Sans carte bancaire · Annulation en un clic
          </p>
        </motion.div>
      </div>
    </section>
  );
}
