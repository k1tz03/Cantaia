"use client";

import Image from "next/image";
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

      <div className="relative mx-auto max-w-[1200px] px-6 py-24 lg:py-32">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text content */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7 }}
          >
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl leading-tight">
              {t("title")}
            </h2>
            <p className="mt-6 max-w-lg text-lg text-[#71717A] leading-relaxed">
              {t("subtitle")}
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
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

          {/* Project manager image */}
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="relative hidden lg:block"
          >
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-[#F97316]/10 via-transparent to-[#22C55E]/5 blur-2xl" />
            <div className="relative rounded-2xl overflow-hidden border border-[#27272A] shadow-2xl shadow-black/40">
              <Image
                src="/landing/cta-manager.png"
                alt="Chef de projet construction utilisant Cantaia sur tablette"
                width={600}
                height={450}
                className="w-full h-auto object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0F0F11]/60 via-transparent to-transparent" />
              {/* Floating badge */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3 rounded-xl bg-[#0F0F11]/80 backdrop-blur-md border border-[#27272A] p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#F97316] to-[#EA580C] flex-shrink-0">
                  <span className="font-display text-sm font-bold text-white">C</span>
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Cantaia</div>
                  <div className="text-xs text-[#A1A1AA]">+2h gagnées par jour en moyenne</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
