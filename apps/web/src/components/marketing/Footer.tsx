"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function MarketingFooter() {
  const t = useTranslations("landing");

  return (
    <footer className="border-t border-white/5 bg-[#061018]">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 40 40" className="h-8 w-8" fill="none" xmlns="http://www.w3.org/2000/svg">
                <ellipse cx="20" cy="20" rx="14" ry="6" stroke="#C4A661" strokeWidth="1.5" transform="rotate(0 20 20)" opacity="0.9"/>
                <ellipse cx="20" cy="20" rx="14" ry="6" stroke="#C4A661" strokeWidth="1.5" transform="rotate(60 20 20)" opacity="0.7"/>
                <ellipse cx="20" cy="20" rx="14" ry="6" stroke="#C4A661" strokeWidth="1.5" transform="rotate(-60 20 20)" opacity="0.5"/>
                <circle cx="20" cy="20" r="2.5" fill="#C4A661"/>
              </svg>
              <span className="font-heading text-lg font-bold tracking-tight text-white">
                Cantaia
              </span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              {t("footer.description")}
            </p>
            <p className="mt-4 text-sm text-slate-500">
              {t("footer.madeIn")} 🇨🇭
            </p>
          </div>

          {/* Product column */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("footer.product")}
            </h4>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href="/#features"
                  className="text-sm text-slate-500 transition-colors hover:text-gold"
                >
                  {t("footer.features")}
                </a>
              </li>
              <li>
                <a
                  href="/#spotlight"
                  className="text-sm text-slate-500 transition-colors hover:text-gold"
                >
                  {t("footer.intelligence")}
                </a>
              </li>
              <li>
                <a
                  href="/#pricing"
                  className="text-sm text-slate-500 transition-colors hover:text-gold"
                >
                  {t("footer.pricing")}
                </a>
              </li>
              <li>
                <span className="text-sm text-slate-600">
                  {t("footer.changelog")}{" "}
                  <span className="ml-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    {t("footer.comingSoon")}
                  </span>
                </span>
              </li>
            </ul>
          </div>

          {/* Resources column */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("footer.resources")}
            </h4>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-slate-500 transition-colors hover:text-gold"
                >
                  {t("footer.about")}
                </Link>
              </li>
              <li>
                <span className="text-sm text-slate-600">
                  {t("footer.blog")}{" "}
                  <span className="ml-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    {t("footer.comingSoon")}
                  </span>
                </span>
              </li>
              <li>
                <span className="text-sm text-slate-600">
                  {t("footer.docs")}{" "}
                  <span className="ml-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    {t("footer.comingSoon")}
                  </span>
                </span>
              </li>
              <li>
                <a
                  href="/#faq"
                  className="text-sm text-slate-500 transition-colors hover:text-gold"
                >
                  {t("footer.faq")}
                </a>
              </li>
            </ul>
          </div>

          {/* Legal column */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("footer.legal")}
            </h4>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/legal/cgv"
                  className="text-sm text-slate-500 transition-colors hover:text-gold"
                >
                  {t("footer.cgv")}
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/privacy"
                  className="text-sm text-slate-500 transition-colors hover:text-gold"
                >
                  {t("footer.privacy")}
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/mentions"
                  className="text-sm text-slate-500 transition-colors hover:text-gold"
                >
                  {t("footer.mentions")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 border-t border-white/5 pt-8">
          <p className="text-center text-xs text-slate-600">
            {t("footer.copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>
    </footer>
  );
}
