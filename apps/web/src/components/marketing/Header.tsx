"use client";

import { Link } from "@/i18n/navigation";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function MarketingHeader() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "/#features", label: "Fonctionnalités" },
    { href: "/#pricing", label: "Tarifs" },
    { href: "/about", label: "À propos" },
  ];

  return (
    <header
      className={`sticky top-0 z-50 bg-white/95 backdrop-blur-lg transition-all duration-300 ${
        scrolled ? "border-b border-[#E5E7EB] shadow-sm" : "border-b border-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none">
            <rect x="2" y="8" width="28" height="18" rx="3" stroke="#2563EB" strokeWidth="2" />
            <path d="M8 14h6M8 18h10M8 22h8" stroke="#2563EB" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M22 14l4 4-4 4" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-display text-xl font-bold tracking-tight text-[#111827]">
            Cantaia
          </span>
        </Link>

        {/* Desktop nav — center */}
        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[#6B7280] transition-colors hover:bg-[#FAFAFA] hover:text-[#111827]"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop actions — right */}
        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login"
            className="px-3 py-2 text-sm text-[#6B7280] transition-colors hover:text-[#111827]"
          >
            Connexion
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1D4ED8] hover:shadow-md"
          >
            Essai gratuit
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="rounded-lg p-2 text-[#6B7280] transition-colors hover:bg-[#FAFAFA] hover:text-[#111827] lg:hidden"
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
            className="overflow-hidden border-t border-[#E5E7EB] bg-white lg:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link, i) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="rounded-lg px-4 py-3 text-sm font-medium text-[#6B7280] transition-colors hover:bg-[#FAFAFA] hover:text-[#111827]"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </motion.a>
              ))}
              <hr className="my-2 border-[#E5E7EB]" />
              <Link
                href="/login"
                className="rounded-lg px-4 py-3 text-sm font-medium text-[#6B7280] transition-colors hover:bg-[#FAFAFA] hover:text-[#111827]"
              >
                Connexion
              </Link>
              <Link
                href="/register"
                className="mt-1 rounded-lg bg-[#2563EB] px-5 py-3 text-center text-sm font-semibold text-white shadow-sm"
              >
                Essai gratuit
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
