"use client";

import { Link } from "@/i18n/navigation";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";

export function MarketingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const t = useTranslations("landing.nav");

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "/#features", label: t("features") },
    { href: "/#trust", label: t("security") },
    { href: "/about", label: t("about") },
  ];

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#09090B]/95 backdrop-blur-xl border-b border-[#27272A] shadow-lg shadow-black/20"
          : "bg-[#09090B]/80 backdrop-blur-xl border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#F97316] to-[#EA580C] shadow-lg shadow-[#F97316]/20">
            <span className="font-display text-base font-extrabold text-white leading-none">C</span>
          </div>
          <span className="font-display text-xl font-bold tracking-tight text-white">
            Cantaia
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[#A1A1AA] transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-medium text-[#A1A1AA] transition-colors hover:text-white"
          >
            {t("login")}
          </Link>
          <Link
            href="/register"
            className="rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#F97316]/25 transition-all hover:shadow-xl hover:shadow-[#F97316]/30 hover:scale-[1.02] active:scale-[0.98]"
          >
            {t("freeTrial")} →
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="rounded-lg p-2 text-[#A1A1AA] transition-colors hover:text-white lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Menu"
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden border-t border-[#27272A] bg-[#09090B] lg:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link, i) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-lg px-4 py-3 text-sm font-medium text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </motion.a>
              ))}
              <hr className="my-2 border-[#27272A]" />
              <Link
                href="/login"
                className="rounded-lg px-4 py-3 text-sm font-medium text-[#A1A1AA] transition-colors hover:bg-[#18181B] hover:text-white"
              >
                {t("login")}
              </Link>
              <Link
                href="/register"
                className="mt-1 rounded-xl bg-gradient-to-r from-[#F97316] to-[#EA580C] px-5 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-[#F97316]/25"
              >
                {t("freeTrial")}
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
