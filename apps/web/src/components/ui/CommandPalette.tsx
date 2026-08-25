"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useDebounce } from "@/lib/hooks/use-debounce";
import type { SearchResult, SearchResultType } from "@/app/api/search/types";
import {
  Search,
  Loader2,
  FolderKanban,
  CheckSquare,
  Mail,
  // Aliased: the bare `Map` export shadows the global `Map` constructor.
  Map as MapIcon,
  FileSpreadsheet,
  Truck,
  FileText,
  MessageSquare,
  Settings,
  LayoutDashboard,
  Newspaper,
  CalendarDays,
  ClipboardList,
  HardHat,
  BarChart3,
  LifeBuoy,
  LayoutList,
} from "lucide-react";

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

/**
 * UI copy for the palette. Navigation labels come from the shared `nav`
 * namespace; only the strings specific to this component live here.
 * Canonical keys are proposed in `i18n-pending/J.json` for the i18n owner to
 * merge into `messages/{fr,en,de}.json` — this map is the interim bridge so
 * all three locales read correctly today.
 */
const COPY = {
  fr: {
    placeholder: "Rechercher un projet, un email, une tâche…",
    sectionNavigation: "Navigation",
    noResults: (q: string) => `Aucun résultat pour « ${q} »`,
    hintMinChars: "Tapez au moins 2 caractères pour lancer la recherche",
    partial: "Certaines sources n'ont pas répondu",
    hintNavigate: "↑↓ naviguer",
    hintOpen: "↵ ouvrir",
    hintClose: "esc fermer",
    ariaLabel: "Recherche globale",
    searching: "Recherche en cours",
    untitled: "(Sans objet)",
  },
  en: {
    placeholder: "Search a project, an email, a task…",
    sectionNavigation: "Navigation",
    noResults: (q: string) => `No results for “${q}”`,
    hintMinChars: "Type at least 2 characters to search",
    partial: "Some sources did not respond",
    hintNavigate: "↑↓ navigate",
    hintOpen: "↵ open",
    hintClose: "esc close",
    ariaLabel: "Global search",
    searching: "Searching",
    untitled: "(No subject)",
  },
  de: {
    placeholder: "Projekt, E-Mail oder Aufgabe suchen…",
    sectionNavigation: "Navigation",
    noResults: (q: string) => `Keine Ergebnisse für „${q}“`,
    hintMinChars: "Mindestens 2 Zeichen eingeben",
    partial: "Einige Quellen haben nicht geantwortet",
    hintNavigate: "↑↓ navigieren",
    hintOpen: "↵ öffnen",
    hintClose: "esc schliessen",
    ariaLabel: "Globale Suche",
    searching: "Suche läuft",
    untitled: "(Ohne Betreff)",
  },
} as const;

const TYPE_ICON: Record<SearchResultType, React.ComponentType<any>> = {
  project: FolderKanban,
  email: Mail,
  task: CheckSquare,
  submission: FileSpreadsheet,
  supplier: Truck,
  plan: MapIcon,
  meeting: FileText,
};

/** Key inside the shared `nav` namespace used as the group heading. */
const TYPE_NAV_KEY: Record<SearchResultType, string> = {
  project: "projects",
  email: "emails",
  task: "tasks",
  submission: "submissions",
  supplier: "suppliers",
  plan: "plans",
  meeting: "meetings",
};

interface NavCommand {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  path: string;
  keywords: string[];
}

/** One selectable option. `index` is its position in the flat keyboard order. */
interface PaletteItem {
  key: string;
  index: number;
  label: string;
  subtitle: string | null;
  icon: React.ComponentType<any>;
  path: string;
}

/** A labelled `role="group"` inside the listbox. */
interface PaletteSection {
  key: string;
  label: string;
  items: PaletteItem[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [partial, setPartial] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Guards against an out-of-order response overwriting fresher results. */
  const requestSeqRef = useRef(0);

  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("nav");
  const copy = COPY[locale as keyof typeof COPY] ?? COPY.fr;

  const debouncedQuery = useDebounce(query, SEARCH_DEBOUNCE_MS);
  const trimmedQuery = query.trim();

  // ── Static navigation entries ────────────────────────────────────────────
  // Only routes that actually exist under `[locale]/(app)` are listed — a
  // palette entry landing on a 404 is worse than no entry at all.
  const navCommands: NavCommand[] = useMemo(
    () => [
      { id: "dashboard", label: t("dashboard"), icon: LayoutDashboard, path: "/dashboard", keywords: ["accueil", "home", "übersicht"] },
      { id: "mail", label: t("mail"), icon: Mail, path: "/mail", keywords: ["email", "inbox", "posteingang", "courrier"] },
      { id: "calendar", label: t("calendar"), icon: CalendarDays, path: "/calendar", keywords: ["agenda", "kalender", "rendez-vous"] },
      { id: "briefing", label: t("briefing"), icon: Newspaper, path: "/briefing", keywords: ["résumé", "matin", "daily", "zusammenfassung"] },
      { id: "tasks", label: t("tasks"), icon: CheckSquare, path: "/tasks", keywords: ["tâche", "aufgabe", "todo"] },
      { id: "action-board", label: t("actionBoard"), icon: LayoutList, path: "/action-board", keywords: ["actions", "board", "kanban"] },
      { id: "projects", label: t("projects"), icon: FolderKanban, path: "/projects", keywords: ["projet", "baustelle", "chantier"] },
      { id: "plans", label: t("plans"), icon: MapIcon, path: "/plans", keywords: ["plan", "dessin", "zeichnung"] },
      { id: "submissions", label: t("submissions"), icon: FileSpreadsheet, path: "/submissions", keywords: ["soumission", "submission", "offre"] },
      { id: "suppliers", label: t("suppliers"), icon: Truck, path: "/suppliers", keywords: ["fournisseur", "lieferant", "entreprise"] },
      { id: "site-reports", label: t("siteReports"), icon: ClipboardList, path: "/site-reports", keywords: ["rapport", "heures", "livraison", "regie"] },
      { id: "visits", label: t("visits"), icon: HardHat, path: "/visits", keywords: ["visite", "client", "besuch", "prospect"] },
      { id: "pv", label: t("pv"), icon: FileText, path: "/pv-chantier", keywords: ["protocole", "protokoll", "procès-verbal", "séance"] },
      { id: "direction", label: t("direction"), icon: BarChart3, path: "/direction", keywords: ["rentabilité", "marge", "kpi", "geschäftsleitung"] },
      { id: "chat", label: t("assistantAi"), icon: MessageSquare, path: "/chat", keywords: ["chat", "assistant", "jm", "ia", "ai"] },
      { id: "support", label: t("support"), icon: LifeBuoy, path: "/support", keywords: ["ticket", "aide", "hilfe", "bug"] },
      { id: "settings", label: t("settings"), icon: Settings, path: "/settings", keywords: ["paramètre", "einstellung", "configuration", "profil"] },
    ],
    [t]
  );

  const filteredNav = useMemo(() => {
    if (!trimmedQuery) return navCommands;
    const q = trimmedQuery.toLowerCase();
    return navCommands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.id.includes(q) ||
        cmd.keywords.some((k) => k.includes(q))
    );
  }, [navCommands, trimmedQuery]);

  // ── Federated search ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return; // closing already tears down any in-flight request

    const term = debouncedQuery.trim();

    // The debounced value lags the input by design. While it is behind, leave
    // the current results on screen (no flicker) and wait for it to catch up.
    // This also swallows the stale term left over when the palette is reopened
    // within the debounce window.
    if (term !== trimmedQuery) return;

    // Cancel whatever is still in flight before starting (or skipping) a call.
    abortRef.current?.abort();
    abortRef.current = null;

    if (term.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      setPartial(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++requestSeqRef.current;
    setSearching(true);

    fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`search failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (seq !== requestSeqRef.current) return; // stale response
        setResults(Array.isArray(data.results) ? data.results : []);
        setPartial(Array.isArray(data.failed) && data.failed.length > 0);
        setSearching(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        if (seq !== requestSeqRef.current) return;
        console.warn("[CommandPalette] search error:", err);
        setResults([]);
        setPartial(true);
        setSearching(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, trimmedQuery, open]);

  // ── Build grouped sections with a flat keyboard order ────────────────────
  const sections = useMemo<PaletteSection[]>(() => {
    const out: PaletteSection[] = [];
    let index = 0;

    if (filteredNav.length > 0) {
      out.push({
        key: "nav",
        label: copy.sectionNavigation,
        items: filteredNav.map((cmd) => ({
          key: `nav-${cmd.id}`,
          index: index++,
          label: cmd.label,
          subtitle: null,
          icon: cmd.icon,
          path: cmd.path,
        })),
      });
    }

    // The API already orders results (projects first, then relevance), so
    // grouping by first appearance preserves that ordering.
    const seen: SearchResultType[] = [];
    const grouped = new Map<SearchResultType, SearchResult[]>();
    for (const r of results) {
      if (!grouped.has(r.type)) {
        grouped.set(r.type, []);
        seen.push(r.type);
      }
      grouped.get(r.type)!.push(r);
    }

    for (const type of seen) {
      out.push({
        key: type,
        label: t(TYPE_NAV_KEY[type]),
        items: grouped.get(type)!.map((r) => ({
          key: `${type}-${r.id}`,
          index: index++,
          label: r.title || copy.untitled,
          subtitle: r.subtitle,
          icon: TYPE_ICON[type],
          path: r.href,
        })),
      });
    }

    return out;
  }, [filteredNav, results, copy.sectionNavigation, copy.untitled, t]);

  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const itemCount = items.length;

  // Keep the highlight in range whenever the result set changes.
  useEffect(() => {
    setSelectedIndex((i) => (i < itemCount ? i : 0));
  }, [itemCount]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery]);

  // ── Open / close ─────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setPartial(false);
      setSelectedIndex(0);
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
    // Drop any in-flight request when the palette closes.
    abortRef.current?.abort();
    abortRef.current = null;
    setSearching(false);
  }, [open]);

  const navigate = useCallback(
    (path: string) => {
      setOpen(false);
      router.push(`/${locale}${path}`);
    },
    [router, locale]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (itemCount === 0 ? 0 : (i + 1) % itemCount));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => (itemCount === 0 ? 0 : (i - 1 + itemCount) % itemCount));
      } else if (e.key === "Home") {
        e.preventDefault();
        setSelectedIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setSelectedIndex(Math.max(itemCount - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const target = items[selectedIndex];
        if (target) navigate(target.path);
      }
    },
    [items, itemCount, selectedIndex, navigate]
  );

  // Scroll the highlighted option into view.
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, sections]);

  if (!open) return null;

  const activeItem = items[selectedIndex];
  const activeId = activeItem ? `cmdk-opt-${activeItem.key}` : undefined;
  const showEmptyState = itemCount === 0 && !searching && trimmedQuery.length >= MIN_QUERY_LENGTH;
  const showMinCharsHint = itemCount === 0 && trimmedQuery.length > 0 && trimmedQuery.length < MIN_QUERY_LENGTH;

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={copy.ariaLabel}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

      {/* Dialog */}
      <div className="absolute left-1/2 top-[20%] w-full max-w-lg -translate-x-1/2">
        <div className="mx-4 overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B] shadow-2xl">
          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-[#27272A] px-4 py-3">
            <Search className="h-5 w-5 shrink-0 text-[#A1A1AA]" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls="cmdk-listbox"
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              aria-label={copy.ariaLabel}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={copy.placeholder}
              className="flex-1 bg-transparent text-sm text-[#FAFAFA] placeholder:text-[#A1A1AA] outline-none"
            />
            {searching && (
              <Loader2
                className="h-4 w-4 shrink-0 animate-spin text-[#A1A1AA]"
                role="status"
                aria-label={copy.searching}
              />
            )}
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-[#27272A] px-1.5 py-0.5 text-[10px] font-medium text-[#A1A1AA]">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            id="cmdk-listbox"
            role="listbox"
            aria-label={copy.ariaLabel}
            aria-busy={searching}
            className="max-h-80 overflow-y-auto px-2 py-2"
          >
            {showEmptyState && (
              <div className="py-8 text-center text-sm text-[#A1A1AA]">
                {copy.noResults(trimmedQuery)}
              </div>
            )}

            {showMinCharsHint && (
              <div className="py-8 text-center text-sm text-[#A1A1AA]">{copy.hintMinChars}</div>
            )}

            {sections.map((section) => (
              <div key={section.key} role="group" aria-label={section.label}>
                <div
                  aria-hidden="true"
                  className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-[#A1A1AA]"
                >
                  {section.label}
                </div>
                {section.items.map((item) => (
                  <button
                    key={item.key}
                    id={`cmdk-opt-${item.key}`}
                    role="option"
                    aria-selected={item.index === selectedIndex}
                    data-index={item.index}
                    type="button"
                    onClick={() => navigate(item.path)}
                    onMouseEnter={() => setSelectedIndex(item.index)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      item.index === selectedIndex
                        ? "bg-[#F97316]/10 text-[#F97316]"
                        : "text-[#FAFAFA] hover:bg-[#27272A]"
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate">{item.label}</span>
                      {item.subtitle && (
                        <span className="block truncate text-[11px] text-[#A1A1AA]">{item.subtitle}</span>
                      )}
                    </span>
                    {item.index === selectedIndex && (
                      <kbd className="text-[10px] text-[#A1A1AA]" aria-hidden="true">
                        ↵
                      </kbd>
                    )}
                  </button>
                ))}
              </div>
            ))}

            {partial && !searching && (
              <div className="px-3 py-2 text-[11px] text-[#A1A1AA]">{copy.partial}</div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[#27272A] px-4 py-2 text-[10px] text-[#A1A1AA]">
            <span>{copy.hintNavigate}</span>
            <span>{copy.hintOpen}</span>
            <span>{copy.hintClose}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
