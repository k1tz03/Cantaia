"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Search,
  FolderKanban,
  CheckSquare,
  Mail,
  Map,
  FileSpreadsheet,
  Truck,
  FileText,
  MessageSquare,
  Settings,
  LayoutDashboard,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href: string;
  section: string;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("nav");

  const commands: CommandItem[] = useMemo(
    () => [
      { id: "dashboard", label: t("dashboard"), icon: LayoutDashboard, href: `/${locale}/dashboard`, section: "Navigation", keywords: ["accueil", "home", "übersicht"] },
      { id: "projects", label: t("projects"), icon: FolderKanban, href: `/${locale}/projects`, section: "Navigation", keywords: ["projet", "baustelle", "chantier"] },
      { id: "mail", label: t("mail"), icon: Mail, href: `/${locale}/mail`, section: "Navigation", keywords: ["email", "inbox", "posteingang", "courrier"] },
      { id: "tasks", label: t("tasks"), icon: CheckSquare, href: `/${locale}/tasks`, section: "Navigation", keywords: ["tâche", "aufgabe", "todo"] },
      { id: "plans", label: t("plans"), icon: Map, href: `/${locale}/plans`, section: "Navigation", keywords: ["plan", "dessin", "zeichnung"] },
      { id: "submissions", label: t("submissions"), icon: FileSpreadsheet, href: `/${locale}/submissions`, section: "Navigation", keywords: ["soumission", "submission", "offre"] },
      { id: "suppliers", label: t("suppliers"), icon: Truck, href: `/${locale}/suppliers`, section: "Navigation", keywords: ["fournisseur", "lieferant", "entreprise"] },
      // Cantaia Prix hidden — feature not yet ready for production, DB enrichment continues in background
      // { id: "cantaia-prix", label: t("cantaiaPrix"), icon: TrendingUp, href: `/${locale}/cantaia-prix`, section: "Navigation", keywords: ["prix", "preis", "chiffrage", "estimation"] },
      { id: "pv", label: t("pv"), icon: FileText, href: `/${locale}/pv-chantier`, section: "Navigation", keywords: ["protocole", "protokoll", "procès-verbal", "sitzung"] },
      { id: "chat", label: t("chat"), icon: MessageSquare, href: `/${locale}/chat`, section: "Navigation", keywords: ["chat", "assistant", "jm", "ia", "ai"] },
      { id: "settings", label: t("settings"), icon: Settings, href: `/${locale}/settings`, section: "Navigation", keywords: ["paramètre", "einstellung", "configuration"] },
    ],
    [t, locale]
  );

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.id.includes(q) ||
        cmd.keywords?.some((k) => k.includes(q))
    );
  }, [commands, query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered.length]);

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          navigate(filtered[selectedIndex].href);
        }
      }
    },
    [filtered, selectedIndex, navigate]
  );

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Command palette">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Dialog */}
      <div className="absolute left-1/2 top-[20%] w-full max-w-lg -translate-x-1/2">
        <div className="mx-4 overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B] shadow-2xl">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-[#27272A] px-4 py-3">
            <Search className="h-5 w-5 shrink-0 text-[#71717A]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Rechercher..."
              className="flex-1 bg-transparent text-sm text-[#FAFAFA] placeholder:text-[#71717A] outline-none"
            />
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-[#27272A] px-1.5 py-0.5 text-[10px] font-medium text-[#71717A]">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-72 overflow-y-auto px-2 py-2">
            {filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#71717A]">
                Aucun résultat
              </div>
            ) : (
              filtered.map((cmd, index) => {
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    data-index={index}
                    onClick={() => navigate(cmd.href)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      index === selectedIndex
                        ? "bg-[#F97316]/10 text-[#F97316]"
                        : "text-[#FAFAFA] hover:bg-[#27272A]"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left">{cmd.label}</span>
                    {index === selectedIndex && (
                      <kbd className="text-[10px] text-[#71717A]">↵</kbd>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[#27272A] px-4 py-2 text-[10px] text-[#71717A]">
            <span>↑↓ naviguer</span>
            <span>↵ ouvrir</span>
            <span>esc fermer</span>
          </div>
        </div>
      </div>
    </div>
  );
}
