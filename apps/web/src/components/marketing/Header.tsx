"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const SOLUTION_LINKS = [
  { href: "/solutions/soumissions-cfc", key: "index.s1Name" },
  { href: "/solutions/pv-chantier", key: "index.s2Name" },
  { href: "/solutions/planning-chantier", key: "index.s3Name" },
  { href: "/solutions/rapports-chantier", key: "index.s4Name" },
];

export function MarketingHeader() {
  const t = useTranslations("chantier.header");
  const tSol = useTranslations("chantier.solutionsPage");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const solutionsRef = useRef<HTMLDivElement>(null);

  const navLinks = [
    { href: "/produits", label: t("nav.product") },
    { href: "/modules", label: t("nav.modules") },
    { href: "/pricing", label: t("nav.pricing") },
  ];

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close the Solutions dropdown on outside click / Escape.
  useEffect(() => {
    if (!solutionsOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (solutionsRef.current && !solutionsRef.current.contains(e.target as Node)) {
        setSolutionsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSolutionsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [solutionsOpen]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-[#27272A] bg-[#0A0A0C]/95 backdrop-blur-xl"
          : "border-b border-transparent bg-[#0A0A0C]/80 backdrop-blur-xl"
      }`}
    >
      <nav className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-3 sm:px-8 sm:py-4">
        {/* Brand */}
        <Link href="/" className="group flex min-h-[44px] items-center gap-3">
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
          {/* Solutions dropdown */}
          <div
            ref={solutionsRef}
            className="relative"
            onMouseEnter={() => setSolutionsOpen(true)}
            onMouseLeave={() => setSolutionsOpen(false)}
          >
            <button
              type="button"
              aria-expanded={solutionsOpen}
              aria-haspopup="true"
              onClick={() => setSolutionsOpen((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 font-condensed text-[13px] font-700 uppercase tracking-[0.22em] text-[#A1A1AA] transition-colors hover:text-[#F97316]"
            >
              {t("nav.solutions")}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${solutionsOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>

            {solutionsOpen && (
              <div className="absolute left-0 top-full w-[280px] border border-[#27272A] bg-[#0A0A0C] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]">
                <Link
                  href="/solutions"
                  onClick={() => setSolutionsOpen(false)}
                  className="block border-b border-[#27272A] px-4 py-3 font-tech text-[10px] uppercase tracking-[0.18em] text-[#A1A1AA] transition-colors hover:text-[#F97316]"
                >
                  {tSol("index.sectionMarker")}
                </Link>
                {SOLUTION_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setSolutionsOpen(false)}
                    className="block px-4 py-3 font-condensed text-[13px] font-700 uppercase tracking-[0.12em] text-[#A1A1AA] transition-colors hover:bg-[#111114] hover:text-[#F97316]"
                  >
                    {tSol(link.key)}
                  </Link>
                ))}
              </div>
            )}
          </div>

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

        {/* Mobile menu button — 48px touch target */}
        <button
          type="button"
          className="-mr-2 flex h-12 w-12 items-center justify-center text-[#A1A1AA] transition-colors hover:text-[#F97316] lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-label={t("mobile.menuAria")}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu — every row is at least 44px tall */}
      {mobileMenuOpen && (
        <div className="overflow-hidden border-t border-[#27272A] bg-[#0A0A0C] lg:hidden">
          <div className="flex flex-col px-4 py-3">
            <Link
              href="/solutions"
              className="flex min-h-[48px] items-center px-3 font-condensed text-[14px] font-700 uppercase tracking-[0.2em] text-[#FAFAFA] transition-colors hover:bg-[#111114] hover:text-[#F97316]"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t("nav.solutions")}
            </Link>
            <div className="mb-1 border-l border-[#27272A] pl-3">
              {SOLUTION_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex min-h-[44px] items-center px-3 font-sans text-[14px] text-[#A1A1AA] transition-colors hover:bg-[#111114] hover:text-[#F97316]"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {tSol(link.key)}
                </Link>
              ))}
            </div>

            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex min-h-[48px] items-center px-3 font-condensed text-[14px] font-700 uppercase tracking-[0.2em] text-[#A1A1AA] transition-colors hover:bg-[#111114] hover:text-[#F97316]"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}

            <hr className="my-2 border-[#27272A]" />

            <Link
              href="/login"
              className="flex min-h-[48px] items-center px-3 font-condensed text-[14px] font-700 uppercase tracking-[0.2em] text-[#A1A1AA] transition-colors hover:text-[#F97316]"
              onClick={() => setMobileMenuOpen(false)}
            >
              {t("auth.login")}
            </Link>
            <Link
              href="/register"
              className="mt-1 flex min-h-[48px] items-center justify-center gap-2 border border-[#F97316] bg-[#F97316] px-5 font-condensed text-[13px] font-800 uppercase tracking-[0.2em] text-[#0A0A0C]"
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
