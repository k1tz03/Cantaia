"use client";

import { Link } from "@/i18n/navigation";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";

export function MarketingFooter() {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("landing.footer");

  const switchLocale = (newLocale: string) => {
    router.replace(pathname, { locale: newLocale });
  };

  return (
    <footer className="bg-[#09090B] border-t border-[#27272A]">
      <div className="mx-auto max-w-[1200px] px-6 py-16 lg:py-20">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#F97316] to-[#EA580C]">
                <span className="font-display text-base font-extrabold text-white leading-none">C</span>
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-white">
                Cantaia
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-[#71717A]">
              {t("description")}
            </p>
            {/* Language switcher */}
            <div className="mt-6 flex items-center gap-1 rounded-lg bg-[#18181B] border border-[#27272A] p-1">
              {(["fr", "de", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => switchLocale(lang)}
                  className={`rounded-md px-3 py-1 text-xs font-medium uppercase transition-all ${
                    locale === lang
                      ? "bg-[#27272A] text-white"
                      : "text-[#52525B] hover:text-[#A1A1AA]"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Produit */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#71717A]">
              {t("product")}
            </h4>
            <ul className="mt-4 space-y-3">
              <li>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/#features" className="text-sm text-[#52525B] transition-colors hover:text-white">
                  {t("features")}
                </a>
              </li>
              <li>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/#pricing" className="text-sm text-[#52525B] transition-colors hover:text-white">
                  {t("pricing")}
                </a>
              </li>
              <li>
                <span className="text-sm text-[#3F3F46]">
                  {t("changelog")}{" "}
                  <span className="ml-1 rounded-full bg-[#18181B] border border-[#27272A] px-2 py-0.5 text-[10px] text-[#52525B]">
                    {t("comingSoon")}
                  </span>
                </span>
              </li>
            </ul>
          </div>

          {/* Ressources */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#71717A]">
              {t("resources")}
            </h4>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href="/about" className="text-sm text-[#52525B] transition-colors hover:text-white">
                  {t("about")}
                </Link>
              </li>
              <li>
                <span className="text-sm text-[#3F3F46]">
                  {t("blog")}{" "}
                  <span className="ml-1 rounded-full bg-[#18181B] border border-[#27272A] px-2 py-0.5 text-[10px] text-[#52525B]">
                    {t("comingSoon")}
                  </span>
                </span>
              </li>
              <li>
                <span className="text-sm text-[#3F3F46]">
                  {t("docs")}{" "}
                  <span className="ml-1 rounded-full bg-[#18181B] border border-[#27272A] px-2 py-0.5 text-[10px] text-[#52525B]">
                    {t("comingSoon")}
                  </span>
                </span>
              </li>
              <li>
                <a href="mailto:support@cantaia.io" className="text-sm text-[#52525B] transition-colors hover:text-white">
                  {t("support")}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#71717A]">
              {t("legal")}
            </h4>
            <ul className="mt-4 space-y-3">
              <li>
                <Link href="/legal/cgv" className="text-sm text-[#52525B] transition-colors hover:text-white">
                  {t("cgv")}
                </Link>
              </li>
              <li>
                <Link href="/legal/privacy" className="text-sm text-[#52525B] transition-colors hover:text-white">
                  {t("privacy")}
                </Link>
              </li>
              <li>
                <Link href="/legal/mentions" className="text-sm text-[#52525B] transition-colors hover:text-white">
                  {t("mentions")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-14 border-t border-[#27272A] pt-8">
          <p className="text-center text-xs text-[#3F3F46]">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
}
