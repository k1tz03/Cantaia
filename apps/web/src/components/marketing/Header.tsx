"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { LanguageSwitcher } from "@cantaia/ui";
import { useRouter } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";

export function MarketingHeader() {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "/#features", label: t("landing.nav.features") },
    { href: "/#spotlight", label: t("landing.nav.intelligence") },
    { href: "/#pricing", label: t("landing.nav.pricing") },
    { href: "/about", label: t("landing.nav.about") },
  ];

  return (
    <header
      className={`sticky top-0 z-50 bg-[#0A1F30]/95 backdrop-blur-xl transition-all duration-300 ${
        scrolled
          ? "border-b border-white/10 shadow-lg shadow-black/10"
          : ""
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2.5">
          <svg viewBox="0 0 40 40" className="h-8 w-8" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="20" cy="20" rx="14" ry="6" stroke="#C4A661" strokeWidth="1.5" transform="rotate(0 20 20)" opacity="0.9"/>
            <ellipse cx="20" cy="20" rx="14" ry="6" stroke="#C4A661" strokeWidth="1.5" transform="rotate(60 20 20)" opacity="0.7"/>
            <ellipse cx="20" cy="20" rx="14" ry="6" stroke="#C4A661" strokeWidth="1.5" transform="rotate(-60 20 20)" opacity="0.5"/>
            <circle cx="20" cy="20" r="2.5" fill="#C4A661"/>
          </svg>
          <span className="font-heading text-xl font-bold tracking-tight text-white">
            Cantaia
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitcher
            currentLocale={locale}
            onLocaleChange={(newLocale) =>
              router.replace(pathname, { locale: newLocale })
            }
          />
          <Link
            href="/login"
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
          >
            {t("landing.nav.login")}
          </Link>
          <Link
            href="/register"
            className="rounded-xl bg-gradient-to-r from-gold-light to-gold px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-gold/25 transition-all hover:from-gold hover:to-gold-light hover:shadow-gold/40"
          >
            {t("landing.nav.demo")}
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          className="rounded-lg p-2 text-slate-300 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
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
            className="overflow-hidden border-t border-white/10 bg-[#0A1F30]/98 backdrop-blur-xl lg:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link, index) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-lg px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </motion.a>
              ))}
              <hr className="my-2 border-white/10" />
              <Link
                href="/login"
                className="rounded-lg px-4 py-3 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {t("landing.nav.login")}
              </Link>
              <Link
                href="/register"
                className="mt-1 rounded-xl bg-gradient-to-r from-gold-light to-gold px-5 py-3 text-center text-sm font-semibold text-slate-900 shadow-lg shadow-gold/25"
              >
                {t("landing.nav.demo")}
              </Link>
              <div className="mt-2">
                <LanguageSwitcher
                  currentLocale={locale}
                  onLocaleChange={(newLocale) =>
                    router.replace(pathname, { locale: newLocale })
                  }
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
