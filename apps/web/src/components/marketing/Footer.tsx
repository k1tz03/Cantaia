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
    <footer className="bg-[#111827]">
      <div className="mx-auto max-w-[1200px] px-6 py-16 lg:py-20">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none">
                <rect x="2" y="8" width="28" height="18" rx="3" stroke="#2563EB" strokeWidth="2" />
                <path d="M8 14h6M8 18h10M8 22h8" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M22 14l4 4-4 4" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="font-display text-lg font-bold tracking-tight text-white">
                Cantaia
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-400">
              {t("description")}
            </p>
            {/* Language switcher */}
            <div className="mt-6 flex items-center gap-1 rounded-lg bg-white/5 p-1">
              {(["fr", "de", "en"] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => switchLocale(lang)}
                  className={`rounded-md px-3 py-1 text-xs font-medium uppercase transition-all ${
                    locale === lang
                      ? "bg-white/15 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-300"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>

          {/* Produit */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t("product")}
            </h4>
            <ul className="mt-4 space-y-3">
              <li><a href="/#features" className="text-sm text-gray-500 transition-colors hover:text-white">{t("features")}</a></li>
              <li><a href="/#pricing" className="text-sm text-gray-500 transition-colors hover:text-white">{t("pricing")}</a></li>
              <li><span className="text-sm text-gray-600">{t("changelog")} <span className="ml-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-gray-600">{t("comingSoon")}</span></span></li>
            </ul>
          </div>

          {/* Ressources */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t("resources")}
            </h4>
            <ul className="mt-4 space-y-3">
              <li><Link href="/about" className="text-sm text-gray-500 transition-colors hover:text-white">{t("about")}</Link></li>
              <li><span className="text-sm text-gray-600">{t("blog")} <span className="ml-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-gray-600">{t("comingSoon")}</span></span></li>
              <li><span className="text-sm text-gray-600">{t("docs")} <span className="ml-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-gray-600">{t("comingSoon")}</span></span></li>
              <li><a href="mailto:support@cantaia.io" className="text-sm text-gray-500 transition-colors hover:text-white">{t("support")}</a></li>
            </ul>
          </div>

          {/* Légal */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              {t("legal")}
            </h4>
            <ul className="mt-4 space-y-3">
              <li><Link href="/legal/cgv" className="text-sm text-gray-500 transition-colors hover:text-white">{t("cgv")}</Link></li>
              <li><Link href="/legal/privacy" className="text-sm text-gray-500 transition-colors hover:text-white">{t("privacy")}</Link></li>
              <li><Link href="/legal/mentions" className="text-sm text-gray-500 transition-colors hover:text-white">{t("mentions")}</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-14 border-t border-white/10 pt-8">
          <p className="text-center text-xs text-gray-600">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
}
