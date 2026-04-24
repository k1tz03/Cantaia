"use client";

import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUpRight } from "lucide-react";
import { Hazard } from "@/components/chantier/primitives";

type FooterLink = {
  key: string;
  href?: string;
  external?: boolean;
  comingSoon?: boolean;
  mailto?: boolean;
};

type FooterColumn = {
  code: string;
  titleKey: string;
  links: FooterLink[];
};

const COLUMNS: FooterColumn[] = [
  {
    code: "01",
    titleKey: "columns.product.title",
    links: [
      { key: "columns.product.links.products", href: "/produits" },
      { key: "columns.product.links.modules", href: "/modules" },
      { key: "columns.product.links.pricing", href: "/pricing" },
      { key: "columns.product.links.changelog", comingSoon: true },
    ],
  },
  {
    code: "02",
    titleKey: "columns.resources.title",
    links: [
      { key: "columns.resources.links.about", href: "/about" },
      { key: "columns.resources.links.blog", comingSoon: true },
      { key: "columns.resources.links.docs", comingSoon: true },
      { key: "columns.resources.links.support", href: "support@cantaia.io", mailto: true },
    ],
  },
  {
    code: "03",
    titleKey: "columns.legal.title",
    links: [
      { key: "columns.legal.links.terms", href: "/legal/cgv" },
      { key: "columns.legal.links.privacy", href: "/legal/privacy" },
      { key: "columns.legal.links.mentions", href: "/legal/mentions" },
    ],
  },
];

export function MarketingFooter() {
  const t = useTranslations("chantier.footer");
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  const switchLocale = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t border-[#27272A] bg-[#09090B] text-[#FAFAFA]">
      {/* Top hazard strip */}
      <Hazard height="h-[6px]" />

      {/* Subtle orange site grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #F97316 1px, transparent 1px), linear-gradient(to bottom, #F97316 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1400px] px-6 py-16 sm:px-10 lg:px-14 lg:py-20">
        {/* Top bar — site placard */}
        <div className="flex flex-col items-start justify-between gap-5 border-b border-dashed border-[#27272A] pb-10 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="font-tech text-[10px] font-bold tracking-[0.28em] text-[#F97316]">
              {t("placard.lot")}
            </span>
            <span className="h-px w-10 bg-[#27272A]" />
            <span className="font-condensed text-[13px] font-700 uppercase tracking-[0.22em] text-[#A1A1AA]">
              {t("placard.title")}
            </span>
            <span className="h-px w-10 bg-[#27272A]" />
            <span className="font-tech text-[10px] font-semibold tracking-[0.18em] text-[#52525B]">
              {t("placard.cfc")}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-1.5 w-1.5 animate-pulse rounded-full bg-[#22C55E]" />
            <span className="font-tech text-[10px] font-semibold tracking-[0.22em] text-[#71717A]">
              {t("placard.status")}
            </span>
          </div>
        </div>

        {/* Main grid */}
        <div className="mt-12 grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)] lg:gap-10">
          {/* Brand column */}
          <div>
            <Link href="/" className="group inline-flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center bg-[#F97316]">
                <span className="font-condensed text-[16px] font-900 leading-none text-[#0A0A0C]">
                  C
                </span>
              </div>
              <span className="font-condensed text-[26px] font-900 uppercase leading-none tracking-[-0.01em] text-[#FAFAFA]">
                Cant<i className="not-italic text-[#F97316]">ai</i>a
              </span>
            </Link>

            <p className="mt-6 max-w-[320px] font-sans text-[13px] leading-relaxed text-[#A1A1AA]">
              {t("brand.description")}
            </p>

            {/* Language switcher — chantier style */}
            <div className="mt-8">
              <div className="mb-2 flex items-center gap-2">
                <span className="font-tech text-[9px] font-bold uppercase tracking-[0.28em] text-[#52525B]">
                  {t("language.label")}
                </span>
                <span className="h-px flex-1 bg-[#27272A]" />
              </div>
              <div className="inline-flex items-stretch border border-[#27272A] bg-[#111114]">
                {(["fr", "de", "en"] as const).map((lang, i) => (
                  <button
                    key={lang}
                    onClick={() => switchLocale(lang)}
                    className={`${i > 0 ? "border-l border-[#27272A]" : ""} px-3.5 py-2 font-condensed text-[11px] font-700 uppercase tracking-[0.22em] transition-colors ${
                      locale === lang
                        ? "bg-[#F97316] text-[#0A0A0C]"
                        : "text-[#71717A] hover:bg-[#18181B] hover:text-[#FAFAFA]"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.code}>
              <div className="mb-5 flex items-baseline gap-3">
                <span className="font-tech text-[10px] font-bold tracking-[0.22em] text-[#F97316]">
                  {col.code}
                </span>
                <span className="font-condensed text-[12px] font-800 uppercase tracking-[0.26em] text-[#FAFAFA]">
                  {t(col.titleKey)}
                </span>
              </div>
              <ul className="space-y-3">
                {col.links.map((link) => {
                  const label = t(link.key);
                  if (link.comingSoon) {
                    return (
                      <li key={link.key} className="flex items-center gap-2">
                        <span className="font-sans text-[13px] text-[#3F3F46]">
                          {label}
                        </span>
                        <span className="border border-[#27272A] bg-[#111114] px-1.5 py-0.5 font-tech text-[9px] font-semibold uppercase tracking-[0.18em] text-[#52525B]">
                          {t("comingSoon")}
                        </span>
                      </li>
                    );
                  }
                  if (link.mailto) {
                    return (
                      <li key={link.key}>
                        <a
                          href={`mailto:${link.href}`}
                          className="group inline-flex items-center gap-1.5 font-sans text-[13px] text-[#A1A1AA] transition-colors hover:text-[#F97316]"
                        >
                          <span>{label}</span>
                          <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                        </a>
                      </li>
                    );
                  }
                  return (
                    <li key={link.key}>
                      <Link
                        href={link.href!}
                        className="group inline-flex items-center gap-1.5 font-sans text-[13px] text-[#A1A1AA] transition-colors hover:text-[#F97316]"
                      >
                        <span>{label}</span>
                        <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom strip — site identification */}
        <div className="mt-16 border-t border-[#27272A] pt-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-tech text-[10px] font-semibold tracking-[0.18em] text-[#52525B]">
              <span>{t("bottom.copyright", { year })}</span>
              <span className="hidden h-3 w-px bg-[#27272A] sm:inline-block" />
              <span>{t("bottom.build")}</span>
              <span className="hidden h-3 w-px bg-[#27272A] sm:inline-block" />
              <span>{t("bottom.region")}</span>
              <span className="hidden h-3 w-px bg-[#27272A] sm:inline-block" />
              <span className="text-[#F97316]">{t("bottom.status")}</span>
            </div>
            <div className="flex items-center gap-3 font-tech text-[10px] font-semibold tracking-[0.22em] text-[#71717A]">
              <span>{t("bottom.hosting")}</span>
              <span className="h-px w-6 bg-[#27272A]" />
              <span>{t("bottom.compliance")}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
