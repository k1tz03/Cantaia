"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { AnimatedSection } from "./AnimatedSection";

export function FinalCTASection() {
  const t = useTranslations("landing.finalCta");

  return (
    <section className="relative bg-gradient-to-br from-[#2563EB] via-[#1D4ED8] to-[#1E40AF] overflow-hidden">
      {/* Decorative elements */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-0 h-[400px] w-[400px] rounded-full bg-white/5 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full bg-white/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-6 py-20 lg:py-32">
        <AnimatedSection>
          <div className="text-center">
            <h2 className="font-display text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
              {t("title")}
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-lg text-white/80 leading-relaxed">
              {t("subtitle")}
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/register"
                className="rounded-xl bg-white px-8 py-3.5 text-base font-semibold text-[#2563EB] shadow-lg shadow-black/10 transition-all hover:bg-gray-50 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
              >
                {t("ctaPrimary")}
              </Link>
              <a
                href="mailto:demo@cantaia.io"
                className="rounded-xl border-2 border-white/30 px-8 py-3.5 text-base font-semibold text-white transition-all hover:border-white/60 hover:bg-white/10"
              >
                {t("ctaSecondary")}
              </a>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
