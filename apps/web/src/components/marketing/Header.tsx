"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";

export function MarketingHeader() {
  const t = useTranslations("chantier.header");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const navLinks = [
    { href: "/produits", label: t("nav.product") },
    { href: "/modules", label: t("nav.modules") },
    { href: "/pricing", label: t("nav.pricing") },
    { href: "/fondateur", label: t("nav.founder") },
  ];

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-[#27272A] bg-[#0A0A0C]/95 backdrop-blur-xl"
          : "border-b border-transparent bg-[#0A0A0C]/80 backdrop-blur-xl"
      }`}
    >
      <nav className="mx-auto flex max-w-[1400px] items-center justify-between px-8 py-4">
        {/* Brand */}
        <Link href="/" className="group flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center bg-[#F97316]">
            <span className="font-condensed text-[14px] font-900 leading-none text-[#0A0A0C]">
              C
            </span>
          </div>
          <span className="font-condensed text-[22px] font-900 uppercase tracking-[-0.01em] text-[#FAFAFA]">
            Cant<i className="not-italic text-[#F97316]">ai</i>a
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2 font-condensed text-[13px] font-700 uppercase tracking-[0.22em] text-[#A1A1AA] transition-colors hover:text-[#F97316]"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side — meta nav + CTAs */}
        <div className="hidden items-center gap-4 lg:flex">
          <div className="flex items-center gap-3 border-r border-[#27272A] pr-4">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#22C55E]" />
              <span className="font-tech text-[10px] font-semibold tracking-[0.14em] text-[#71717A]">
                {t("status.latency")}
              </span>
            </div>
            <span className="font-tech text-[10px] tracking-[0.14em] text-[#3F3F46]">
              {t("status.version")}
            </span>
          </div>
          <Link
            href="/login"
            className="font-condensed text-[12px] font-700 uppercase tracking-[0.22em] text-[#A1A1AA] transition-colors hover:text-[#F97316]"
          >
            {t("auth.login")}
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 border border-[#F97316] bg-[#F97316] px-5 py-2.5 font-condensed text-[12px] font-800 uppercase tracking-[0.22em] text-[#0A0A0C] transition-colors hover:border-[#EA580C] hover:bg-[#EA580C]"
          >
            {t("auth.register")}
            <span className="font-tech text-[11px] opacity-70">→</span>
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="p-2 text-[#A1A1AA] transition-colors hover:text-[#F97316] lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={t("mobile.menuAria")}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="overflow-hidden border-t border-[#27272A] bg-[#0A0A0C] lg:hidden">
          <div className="flex flex-col gap-1 px-6 py-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-3 font-condensed text-[13px] font-700 uppercase tracking-[0.22em] text-[#A1A1AA] transition-colors hover:bg-[#111114] hover:text-[#F97316]"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <hr className="my-2 border-[#27272A]" />
            <Link
              href="/login"
              className="px-4 py-3 font-condensed text-[13px] font-700 uppercase tracking-[0.22em] text-[#A1A1AA] transition-colors hover:text-[#F97316]"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t("auth.login")}
            </Link>
            <Link
              href="/register"
              className="mt-1 inline-flex items-center justify-center gap-2 border border-[#F97316] bg-[#F97316] px-5 py-3 font-condensed text-[12px] font-800 uppercase tracking-[0.22em] text-[#0A0A0C]"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t("auth.register")}
              <span className="font-tech text-[11px] opacity-70">→</span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
