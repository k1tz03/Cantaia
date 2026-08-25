"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import {
  Building2,
  Globe,
  X,
  Loader2,
  Pencil,
  Trash2,
  Users,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { SPECIALTY_LABELS, type SupplierSpecialty } from "@cantaia/core/suppliers";
import type { Supplier, SupplierType } from "@cantaia/database";
import { EmptyState } from "@/components/ui/EmptyState";
import { SupplierFormDialog } from "@/components/suppliers/SupplierFormDialog";
import { SupplierImportDialog } from "@/components/suppliers/SupplierImportDialog";
import { AISearchDialog } from "@/components/suppliers/AISearchDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SupplierAlertsBanner } from "@/components/suppliers/SupplierAlertsBanner";
import { SupplierPriceChart, type PriceTrendPoint } from "@/components/suppliers/SupplierPriceChart";
import { handleInsufficientCredits } from "@/components/credits/PaywallDialog";
import { notifyCreditsChanged } from "@/lib/hooks/use-credits";

/** Timeline item shape returned by GET /api/suppliers/:id/history. */
interface TimelineItem {
  id: string;
  type: "offer" | "request" | "email";
  date: string;
  description: string;
  meta?: Record<string, unknown>;
}

// --- Avatar color palette ---
const AVATAR_COLORS = [
  "#10B981", "#3B82F6", "#8B5CF6", "#F97316", "#EC4899",
  "#EF4444", "#14B8A6", "#F59E0B", "#6366F1", "#84CC16",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();
}

export default function SuppliersPage() {
  const t = useTranslations("suppliers");
  const router = useRouter();
  const searchParams = useSearchParams();

  // Data state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [actionError, setActionError] = useState("");

  // Filter state
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterSpecialty, setFilterSpecialty] = useState<string>("");
  const [filterZone, setFilterZone] = useState<string>("");
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

  // Dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [aiSearchOpen, setAiSearchOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichResult, setEnrichResult] = useState<string | null>(null);

  // History / Timeline
  const [historyItems, setHistoryItems] = useState<TimelineItem[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [priceTrend, setPriceTrend] = useState<PriceTrendPoint[]>([]);
  const [historyAlerts, setHistoryAlerts] = useState<{ type: string; message: string; severity: string }[]>([]);

  // Score recalculation
  const [recalculating, setRecalculating] = useState(false);

  // Fetch suppliers from API — the endpoint paginates (default 50), so page
  // through X-Total-Count until the whole org is loaded (KPIs and client-side
  // filters need the full set, not just the top 50 by score).
  const fetchSuppliers = useCallback(async () => {
    try {
      const PAGE_SIZE = 100;
      const first = await fetch(`/api/suppliers?page=1&limit=${PAGE_SIZE}`);
      if (!first.ok) {
        setFetchError(t("page.loadFailed"));
        setLoading(false);
        return;
      }
      const firstData = await first.json();
      let all: Supplier[] = firstData.suppliers || [];
      const total = parseInt(first.headers.get("X-Total-Count") || "0", 10);

      if (total > all.length) {
        const pages = Math.ceil(total / PAGE_SIZE);
        for (let p = 2; p <= pages; p++) {
          const res = await fetch(`/api/suppliers?page=${p}&limit=${PAGE_SIZE}`);
          if (!res.ok) break;
          const data = await res.json();
          all = all.concat(data.suppliers || []);
        }
      }

      setSuppliers(all);
      setFetchError("");
    } catch (err) {
      console.error("[SuppliersPage] Fetch error:", err);
      setFetchError(t("page.networkError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Deep-link support: /suppliers?supplierId=<id> (from the command palette /
  // global search) opens the detail panel for that supplier once loaded. Handled
  // once per id so closing the panel does not re-trigger it.
  const [deepLinkHandled, setDeepLinkHandled] = useState<string | null>(null);
  useEffect(() => {
    const target = searchParams.get("supplierId");
    if (!target || loading || deepLinkHandled === target) return;
    setDeepLinkHandled(target);
    if (suppliers.some((s) => s.id === target)) {
      setSelectedSupplier(target);
      return;
    }
    // Not in the loaded list (e.g. inactive) — fetch it directly.
    fetch(`/api/suppliers/${target}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.supplier) {
          setSuppliers((prev) =>
            prev.some((s) => s.id === d.supplier.id) ? prev : [d.supplier, ...prev]
          );
          setSelectedSupplier(target);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, loading, suppliers, deepLinkHandled]);

  // Load supplier history when selected
  useEffect(() => {
    if (!selectedSupplier) {
      setHistoryItems([]);
      setPriceTrend([]);
      setHistoryAlerts([]);
      return;
    }
    setHistoryLoading(true);
    fetch(`/api/suppliers/${selectedSupplier}/history`)
      .then((r) => r.json())
      .then((d) => {
        setHistoryItems(d.items || []);
        setHistoryHasMore(d.has_more || false);
        setPriceTrend(d.price_trend || []);
        setHistoryAlerts(d.alerts || []);
      })
      .catch(() => {
        setHistoryItems([]);
        setPriceTrend([]);
        setHistoryAlerts([]);
      })
      .finally(() => setHistoryLoading(false));
  }, [selectedSupplier]);

  // Recalculate supplier score
  async function handleRecalculateScore(supplierId: string) {
    setRecalculating(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/recalculate-score`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchSuppliers();
      } else if (res.status === 401) {
        router.replace("/login");
      } else {
        setActionError(t("page.recalcFailed"));
      }
    } catch (err) {
      console.error("[SuppliersPage] Recalculate error:", err);
      setActionError(t("page.networkError"));
    } finally {
      setRecalculating(false);
    }
  }

  // Client-side filtering
  const filtered = useMemo(() => {
    return suppliers.filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !s.company_name.toLowerCase().includes(q) &&
          !(s.email || "").toLowerCase().includes(q) &&
          !(s.contact_name || "").toLowerCase().includes(q) &&
          !(s.city || "").toLowerCase().includes(q)
        ) return false;
      }
      if (filterType && (s.supplier_type || "fournisseur") !== filterType) return false;
      if (filterSpecialty && !s.specialties.includes(filterSpecialty)) return false;
      if (filterZone && s.geo_zone !== filterZone) return false;
      return true;
    });
  }, [suppliers, search, filterType, filterSpecialty, filterZone]);

  const selected = selectedSupplier ? suppliers.find((s) => s.id === selectedSupplier) : null;

  // Unique specialties and zones from data
  const allSpecialties = useMemo(() => {
    const set = new Set<string>();
    suppliers.forEach((s) => s.specialties.forEach((sp) => set.add(sp)));
    return Array.from(set).sort();
  }, [suppliers]);

  const allZones = useMemo(() => {
    const set = new Set<string>();
    suppliers.forEach((s) => { if (s.geo_zone) set.add(s.geo_zone); });
    return Array.from(set).sort();
  }, [suppliers]);

  function getSpecialtyLabel(key: string): string {
    const labels = SPECIALTY_LABELS[key as SupplierSpecialty];
    return labels?.fr || key;
  }

  // KPIs
  const kpis = useMemo(() => {
    const total = suppliers.length;
    const activeCount = suppliers.filter((s) => s.status === "active" || s.status === "preferred").length;
    const avgResponseRate = total > 0
      ? Math.round(suppliers.reduce((sum, s) => sum + (s.response_rate || 0), 0) / total)
      : 0;
    const totalOffers = suppliers.reduce((sum, s) => sum + (s.total_offers_received || 0), 0);
    return { total, activeCount, avgResponseRate, totalOffers };
  }, [suppliers]);

  // Score helpers
  function getScoreColor(score: number): string {
    if (score >= 80) return "#34D399";
    if (score >= 60) return "#FBBF24";
    return "#F87171";
  }

  function getResponseRateColor(rate: number): string {
    if (rate >= 80) return "#34D399";
    if (rate >= 60) return "#FBBF24";
    return "#F87171";
  }

  function getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      active: "Actif",
      preferred: "Preferred",
      blacklisted: "Blacklisted",
      inactive: "Inactif",
      new: "Nouveau",
    };
    return map[status] || status;
  }

  function getStatusDotColor(status: string): string {
    if (status === "active" || status === "preferred") return "#34D399";
    if (status === "inactive") return "#F59E0B";
    if (status === "blacklisted") return "#F87171";
    return "#71717A";
  }

  // CRUD handlers
  function handleAddNew() {
    setEditSupplier(null);
    setFormOpen(true);
  }

  function handleEdit(supplier: Supplier) {
    setEditSupplier(supplier);
    setFormOpen(true);
  }

  function handleDelete(supplier: Supplier) {
    setDeleteTarget(supplier);
  }

  async function executeDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError("");
    try {
      const res = await fetch(`/api/suppliers/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSelectedSupplier(null);
        setDeleteTarget(null);
        await fetchSuppliers();
      } else if (res.status === 401) {
        router.replace("/login");
      } else {
        setActionError(t("page.deleteFailed"));
      }
    } catch (err) {
      console.error("[SuppliersPage] Delete error:", err);
      setActionError(t("page.networkError"));
    } finally {
      setDeleting(false);
    }
  }

  function handleSaved() {
    fetchSuppliers();
  }

  async function handleEnrich(supplier: Supplier) {
    setEnriching(true);
    setEnrichResult(null);
    try {
      const res = await fetch(`/api/suppliers/${supplier.id}/enrich`, {
        method: "POST",
      });

      if (res.status === 402 && (await handleInsufficientCredits(res))) {
        setEnriching(false);
        return;
      }
      if (res.status === 401) {
        router.replace("/login");
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const count = data.updates_applied?.length || 0;
        setEnrichResult(
          count > 0
            ? t("page.enrichDone", { count })
            : t("page.enrichNothing")
        );
        // AI action consumed credits — refresh the badge and the list.
        notifyCreditsChanged();
        await fetchSuppliers();
      } else {
        const text = await res.text();
        let msg = t("page.httpError", { status: res.status });
        try {
          const parsed = JSON.parse(text);
          if (parsed.error) msg = parsed.error;
        } catch {
          /* non-JSON */
        }
        setEnrichResult(msg);
      }
    } catch (err) {
      console.error("[SuppliersPage] Enrich error:", err);
      setEnrichResult(t("page.networkError"));
    } finally {
      setEnriching(false);
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#F97316]" />
          <p className="text-sm text-[#A1A1AA]">{t("page.loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto bg-[#0F0F11] px-7 py-6">
        {/* Page header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-[#FAFAFA] m-0">
              Fournisseurs
            </h1>
            <p className="text-[13px] text-[#A1A1AA] mt-0.5">
              {filtered.length} fournisseurs et prestataires
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setAiSearchOpen(true)}
              className="text-xs px-4 py-2 rounded-lg border border-[#3F3F46] bg-[#18181B] text-[#D4D4D8] cursor-pointer font-medium flex items-center gap-1.5"
            >
              <span>&#10024;</span> Recherche IA
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="text-xs px-4 py-2 rounded-lg border border-[#3F3F46] bg-[#18181B] text-[#D4D4D8] cursor-pointer font-medium flex items-center gap-1.5"
            >
              <span>&#128229;</span> {t("importCsv")}
            </button>
            <button
              onClick={handleAddNew}
              className="text-xs px-4 py-2 rounded-lg border border-transparent bg-gradient-to-br from-[#F97316] to-[#EA580C] text-[#0F0F11] cursor-pointer font-medium flex items-center gap-1.5"
            >
              {t("page.add")}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {fetchError && (
          <div className="mb-3.5 rounded-lg bg-[#EF4444]/10 px-4 py-2.5 text-[13px] text-[#F87171] border border-[#EF4444]/20">
            {fetchError}
          </div>
        )}
        {actionError && (
          <div
            role="alert"
            className="mb-3.5 flex items-center justify-between rounded-lg bg-[#EF4444]/10 px-4 py-2.5 text-[13px] text-[#F87171] border border-[#EF4444]/20"
          >
            <span>{actionError}</span>
            <button
              onClick={() => setActionError("")}
              className="ml-2 p-0.5 text-[#F87171]"
              aria-label={t("page.dismiss")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* KPIs */}
        {/* 4 fixed columns squeezed the KPI cards to unreadable widths on
            phones — 2 up on small screens, 4 from `sm`. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
          <div className="bg-[#18181B] border border-[#27272A] rounded-[10px] px-3.5 py-3">
            <div className="font-display text-2xl font-extrabold text-[#FAFAFA]">
              {kpis.total}
            </div>
            <div className="text-[10px] text-[#A1A1AA] mt-0.5">{t("page.kpiTotal")}</div>
          </div>
          <div className="bg-[#18181B] border border-[#27272A] rounded-[10px] px-3.5 py-3">
            <div className="font-display text-2xl font-extrabold text-[#34D399]">
              {kpis.avgResponseRate}%
            </div>
            <div className="text-[10px] text-[#A1A1AA] mt-0.5">{t("page.kpiAvgResponseRate")}</div>
          </div>
          <div className="bg-[#18181B] border border-[#27272A] rounded-[10px] px-3.5 py-3">
            <div className="font-display text-2xl font-extrabold text-[#FAFAFA]">
              {kpis.activeCount}
            </div>
            <div className="text-[10px] text-[#A1A1AA] mt-0.5">Fournisseurs actifs</div>
          </div>
          <div className="bg-[#18181B] border border-[#27272A] rounded-[10px] px-3.5 py-3">
            <div className="font-display text-2xl font-extrabold text-[#FAFAFA]">
              {kpis.totalOffers}
            </div>
            <div className="text-[10px] text-[#A1A1AA] mt-0.5">Offres recues</div>
          </div>
        </div>

        {/* Agent alerts banner */}
        <SupplierAlertsBanner />

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3.5">
          {/* Type toggle */}
          <div className="flex bg-[#18181B] border border-[#3F3F46] rounded-lg p-[3px]">
            {[
              { value: "", label: "Tous" },
              { value: "fournisseur", label: "Fournisseurs" },
              { value: "prestataire", label: "Prestataires" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterType(opt.value)}
                className={`text-xs px-3.5 py-[5px] rounded-md border-none cursor-pointer font-medium ${
                  filterType === opt.value
                    ? "bg-[#27272A] text-[#FAFAFA]"
                    : "bg-transparent text-[#A1A1AA]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("page.searchPlaceholder")}
            className="bg-[#18181B] border border-[#3F3F46] rounded-lg px-3.5 py-[7px] text-xs text-[#D4D4D8] flex-1 outline-none focus:border-[#F97316]"
          />

          {/* Specialty filter */}
          <select
            value={filterSpecialty}
            onChange={(e) => setFilterSpecialty(e.target.value)}
            className="bg-[#18181B] border border-[#3F3F46] rounded-lg px-3 py-[7px] text-xs text-[#D4D4D8] outline-none"
          >
            <option value="">{t("allSpecialties")}</option>
            {allSpecialties.map((sp) => (
              <option key={sp} value={sp}>{getSpecialtyLabel(sp)}</option>
            ))}
          </select>

          {/* Zone filter */}
          <select
            value={filterZone}
            onChange={(e) => setFilterZone(e.target.value)}
            className="bg-[#18181B] border border-[#3F3F46] rounded-lg px-3 py-[7px] text-xs text-[#D4D4D8] outline-none"
          >
            <option value="">{t("allZones")}</option>
            {allZones.map((z) => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          suppliers.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t("noSuppliers")}
              description={t("noSuppliersDesc")}
              action={{ label: t("addSupplier"), onClick: handleAddNew }}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-[#27272A] flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-[#A1A1AA]" />
              </div>
              <h3 className="text-lg font-medium text-[#FAFAFA] mb-1">{t("page.noResults")}</h3>
              <p className="text-sm text-[#A1A1AA] max-w-[360px]">{t("page.noResultsHint")}</p>
            </div>
          )
        ) : (
          <div className="w-full overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  {["Entreprise", "Type", "Specialites", "Codes CFC", "Score", "Taux rep.", "Statut"].map((h) => (
                    <th
                      key={h}
                      className="text-[10px] uppercase tracking-[0.06em] text-[#A1A1AA] font-semibold px-3 py-2 text-left border-b border-[#27272A]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((supplier) => {
                  const sType = (supplier.supplier_type || "fournisseur") as SupplierType;
                  const score = Math.round(supplier.overall_score || 0);
                  const rate = Math.round(supplier.response_rate || 0);
                  const scoreColor = getScoreColor(score);
                  const rateColor = getResponseRateColor(rate);
                  const avatarBg = getAvatarColor(supplier.company_name);
                  const isSelected = supplier.id === selectedSupplier;

                  const toggleSelect = () =>
                    setSelectedSupplier(supplier.id === selectedSupplier ? null : supplier.id);

                  return (
                    <tr
                      key={supplier.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onClick={toggleSelect}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleSelect();
                        }
                      }}
                      className={`cursor-pointer transition-colors outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#F97316] ${isSelected ? "bg-[#F97316]/[0.08]" : "hover:bg-[#18181B]"}`}
                    >
                      {/* Entreprise */}
                      <td className="px-3 py-2.5 border-b border-[#1C1C1F] text-xs text-[#D4D4D8] align-middle">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] text-white font-semibold shrink-0"
                            style={{ background: avatarBg }}
                          >
                            {getInitials(supplier.company_name)}
                          </div>
                          <div>
                            <div className="text-[13px] font-semibold text-[#FAFAFA]">{supplier.company_name}</div>
                            <div className="text-[10px] text-[#A1A1AA]">
                              {supplier.contact_name}{supplier.contact_name && supplier.email ? " \u00B7 " : ""}{supplier.email || ""}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-3 py-2.5 border-b border-[#1C1C1F] text-xs align-middle">
                        <span
                          className="text-[9px] px-[7px] py-[2px] rounded font-semibold"
                          style={{
                            background: sType === "fournisseur" ? "rgba(16,185,129,0.09)" : "rgba(59,130,246,0.09)",
                            color: sType === "fournisseur" ? "#34D399" : "#60A5FA",
                          }}
                        >
                          {sType === "fournisseur" ? "Fournisseur" : "Prestataire"}
                        </span>
                      </td>

                      {/* Specialites */}
                      <td className="px-3 py-2.5 border-b border-[#1C1C1F] text-xs align-middle">
                        {supplier.specialties.slice(0, 2).map((sp) => (
                          <span
                            key={sp}
                            className="text-[9px] px-1.5 py-[2px] rounded-[3px] bg-[#27272A] text-[#A1A1AA] mr-[3px] inline-block mb-[2px]"
                          >
                            {getSpecialtyLabel(sp)}
                          </span>
                        ))}
                        {supplier.specialties.length > 2 && (
                          <span className="text-[9px] text-[#A1A1AA]">+{supplier.specialties.length - 2}</span>
                        )}
                      </td>

                      {/* Codes CFC */}
                      <td className="px-3 py-2.5 border-b border-[#1C1C1F] text-xs align-middle">
                        {(supplier.cfc_codes || []).slice(0, 3).map((code) => (
                          <span
                            key={code}
                            className="text-[9px] px-1.5 py-[2px] rounded-[3px] mr-[3px] inline-block"
                            style={{
                              background: "rgba(59,130,246,0.07)",
                              color: "#60A5FA",
                            }}
                          >
                            {code}
                          </span>
                        ))}
                        {(supplier.cfc_codes || []).length > 3 && (
                          <span className="text-[9px] text-[#A1A1AA]">+{supplier.cfc_codes.length - 3}</span>
                        )}
                      </td>

                      {/* Score */}
                      <td className="px-3 py-2.5 border-b border-[#1C1C1F] align-middle">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="font-display text-sm font-bold"
                            style={{ color: scoreColor }}
                          >
                            {score}
                          </span>
                          <div className="w-[50px] h-1 bg-[#27272A] rounded-sm overflow-hidden">
                            <div className="h-full rounded-sm" style={{ width: `${score}%`, background: scoreColor }} />
                          </div>
                        </div>
                      </td>

                      {/* Taux rep. */}
                      <td
                        className="px-3 py-2.5 border-b border-[#1C1C1F] text-xs align-middle font-semibold"
                        style={{ color: rateColor }}
                      >
                        {rate}%
                      </td>

                      {/* Statut */}
                      <td className="px-3 py-2.5 border-b border-[#1C1C1F] text-xs text-[#D4D4D8] align-middle">
                        <span
                          className="inline-block w-[7px] h-[7px] rounded-full mr-1 align-middle"
                          style={{ background: getStatusDotColor(supplier.status) }}
                        />
                        {getStatusLabel(supplier.status)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ====== DETAIL PANEL ====== */}
      {/* A hard 420px panel ran off the side of a phone; cap it to the
          viewport so it becomes a full-width sheet on small screens. */}
      {selected && (
        <div className="fixed top-0 right-0 w-full max-w-full sm:w-[420px] h-screen bg-[#18181B] border-l border-[#27272A] z-20 overflow-y-auto shadow-[-8px_0_32px_rgba(0,0,0,0.5)]">
          {/* Detail header */}
          <div className="px-5 py-4 border-b border-[#27272A] flex justify-between items-start">
            <div>
              <div
                className="w-12 h-12 rounded-[10px] flex items-center justify-center text-base text-white font-bold mb-2"
                style={{ background: getAvatarColor(selected.company_name) }}
              >
                {getInitials(selected.company_name)}
              </div>
              <div className="font-display text-lg font-bold text-[#FAFAFA]">
                {selected.company_name}
              </div>
              <div className="mt-1">
                <span
                  className="text-[9px] px-[7px] py-[2px] rounded font-semibold"
                  style={{
                    background: (selected.supplier_type || "fournisseur") === "fournisseur" ? "rgba(16,185,129,0.09)" : "rgba(59,130,246,0.09)",
                    color: (selected.supplier_type || "fournisseur") === "fournisseur" ? "#34D399" : "#60A5FA",
                  }}
                >
                  {(selected.supplier_type || "fournisseur") === "fournisseur" ? "Fournisseur" : "Prestataire"}
                </span>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => handleEdit(selected)}
                className="w-7 h-7 rounded-md bg-[#27272A] flex items-center justify-center cursor-pointer text-[#A1A1AA] text-sm border-none"
                title={t("page.edit")}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleDelete(selected)}
                disabled={deleting}
                className="w-7 h-7 rounded-md bg-[#27272A] flex items-center justify-center cursor-pointer text-[#A1A1AA] text-sm border-none"
                style={{ opacity: deleting ? 0.5 : 1 }}
                title={t("page.delete")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSelectedSupplier(null)}
                className="w-7 h-7 rounded-md bg-[#27272A] flex items-center justify-center cursor-pointer text-[#A1A1AA] text-sm border-none"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Enrichment result banner */}
          {enrichResult && (
            <div className="mx-5 mt-3 flex items-center justify-between rounded-lg bg-[#F97316]/10 px-3 py-2 text-xs text-[#F97316]">
              <span>{enrichResult}</span>
              <button
                onClick={() => setEnrichResult(null)}
                className="ml-2 bg-transparent border-none cursor-pointer text-[#F97316] p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Score section */}
          <div className="px-5 py-4 border-b border-[#27272A]">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[#A1A1AA] font-semibold mb-2.5">
              Score global
            </div>
            <div className="flex items-center gap-3">
              <div
                className="font-display text-[42px] font-extrabold leading-none"
                style={{ color: getScoreColor(Math.round(selected.overall_score || 0)) }}
              >
                {Math.round(selected.overall_score || 0)}
              </div>
              <div>
                <div className="text-xs text-[#A1A1AA]">/100</div>
                <div className="flex gap-4 mt-2">
                  <div className="text-center">
                    <div className="font-display text-base font-bold text-[#FAFAFA]">
                      {Math.round(selected.response_rate || 0)}%
                    </div>
                    <div className="text-[9px] text-[#A1A1AA]">Taux reponse</div>
                  </div>
                  <div className="text-center">
                    <div className="font-display text-base font-bold text-[#FAFAFA]">
                      {selected.avg_response_days || 0}j
                    </div>
                    <div className="text-[9px] text-[#A1A1AA]">Delai moyen</div>
                  </div>
                  <div className="text-center">
                    <div className="font-display text-base font-bold text-[#FAFAFA]">
                      {selected.total_offers_received || 0}
                    </div>
                    <div className="text-[9px] text-[#A1A1AA]">Offres</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Recalculate button */}
            <button
              onClick={() => handleRecalculateScore(selected.id)}
              disabled={recalculating}
              className="mt-2 bg-transparent border-none cursor-pointer text-[#A1A1AA] text-[10px] flex items-center gap-1"
              style={{ opacity: recalculating ? 0.5 : 1 }}
            >
              <RefreshCw className={`w-2.5 h-2.5 ${recalculating ? "animate-spin" : ""}`} />
              Recalculer
            </button>
          </div>

          {/* Alerts */}
          {historyAlerts.length > 0 && (
            <div className="px-5 pt-3">
              {historyAlerts.map((alert, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 rounded-md px-2.5 py-2 text-[11px] mb-1.5"
                  style={{
                    background: alert.severity === "warning" ? "rgba(245,158,11,0.1)" : "rgba(249,115,22,0.1)",
                    color: alert.severity === "warning" ? "#FBBF24" : "#F97316",
                  }}
                >
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-[1px]" />
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Contact section */}
          <div className="px-5 py-4 border-b border-[#27272A]">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[#A1A1AA] font-semibold mb-2.5">
              Contact
            </div>
            {selected.contact_name && (
              <div className="flex items-center gap-2 py-[5px]">
                <span className="text-sm w-5 text-center">&#128100;</span>
                <span className="text-xs text-[#D4D4D8]">{selected.contact_name}</span>
              </div>
            )}
            {selected.email && (
              <div className="flex items-center gap-2 py-[5px]">
                <span className="text-sm w-5 text-center">&#128231;</span>
                <a href={`mailto:${selected.email}`} className="text-xs text-[#F97316] no-underline">
                  {selected.email}
                </a>
              </div>
            )}
            {selected.phone && (
              <div className="flex items-center gap-2 py-[5px]">
                <span className="text-sm w-5 text-center">&#128222;</span>
                <span className="text-xs text-[#D4D4D8]">{selected.phone}</span>
              </div>
            )}
            {(selected.address || selected.city) && (
              <div className="flex items-center gap-2 py-[5px]">
                <span className="text-sm w-5 text-center">&#128205;</span>
                <span className="text-xs text-[#D4D4D8]">
                  {selected.address}{selected.address && selected.city ? ", " : ""}{selected.postal_code ? selected.postal_code + " " : ""}{selected.city}
                </span>
              </div>
            )}
            {selected.website && (
              <div className="flex items-center gap-2 py-[5px]">
                <Globe className="w-3.5 h-3.5 text-[#A1A1AA] shrink-0" />
                <a href={selected.website} target="_blank" rel="noopener noreferrer" className="text-xs text-[#F97316] no-underline">
                  {selected.website}
                </a>
              </div>
            )}
          </div>

          {/* Specialties + CFC */}
          <div className="px-5 py-4 border-b border-[#27272A]">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[#A1A1AA] font-semibold mb-2.5">
              Specialites
            </div>
            <div className="flex flex-wrap gap-1">
              {selected.specialties.map((sp) => (
                <span key={sp} className="text-[10px] px-2 py-[3px] rounded-[5px] bg-[#27272A] text-[#D4D4D8]">
                  {getSpecialtyLabel(sp)}
                </span>
              ))}
            </div>
            {(selected.cfc_codes || []).length > 0 && (
              <div className="mt-2">
                <div className="text-[10px] uppercase tracking-[0.08em] text-[#A1A1AA] font-semibold mb-1">
                  Codes CFC
                </div>
                {selected.cfc_codes.map((code) => (
                  <span
                    key={code}
                    className="text-[10px] px-2 py-[3px] rounded-[5px] font-medium mr-1 inline-block"
                    style={{ background: "rgba(59,130,246,0.07)", color: "#60A5FA" }}
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Certifications */}
          {selected.certifications.length > 0 && (
            <div className="px-5 py-4 border-b border-[#27272A]">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#A1A1AA] font-semibold mb-2.5">
                Certifications
              </div>
              <div className="flex flex-wrap gap-1">
                {selected.certifications.map((cert) => (
                  <span
                    key={cert}
                    className="text-[10px] px-2 py-[3px] rounded-[5px] font-medium"
                    style={{ background: "rgba(16,185,129,0.1)", color: "#34D399" }}
                  >
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Price history chart */}
          {priceTrend.length >= 3 && (
            <div className="px-5 py-4 border-b border-[#27272A]">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#A1A1AA] font-semibold mb-2.5">
                {t("priceEvolution")}
              </div>
              <SupplierPriceChart data={priceTrend} />
            </div>
          )}

          {/* Interactions timeline */}
          <div className="px-5 py-4 border-b border-[#27272A]">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[#A1A1AA] font-semibold mb-2.5">
              Interactions recentes
            </div>
            {historyLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="animate-spin w-5 h-5 text-[#A1A1AA]" />
              </div>
            ) : historyItems.length > 0 ? (
              <>
                {historyItems.slice(0, 5).map((item, idx) => {
                  const projectName = (item.meta as Record<string, unknown>)?.project_name as string | undefined;
                  return (
                    <div key={item.id || idx} className={`flex gap-2 py-1.5 ${idx < Math.min(historyItems.length, 5) - 1 ? "border-b border-[#27272A]" : ""}`}>
                      <div
                        className="w-1.5 h-1.5 rounded-full mt-[5px] shrink-0"
                        style={{
                          background: item.type === "offer" ? "#34D399" : item.type === "request" ? "#3B82F6" : "#F59E0B",
                        }}
                      />
                      <div>
                        <div className="text-[11px] text-[#D4D4D8]">{item.description}</div>
                        <div className="text-[10px] text-[#A1A1AA]">
                          {projectName}{projectName && item.date ? " \u00B7 " : ""}
                          {item.date ? new Date(item.date).toLocaleDateString("fr-CH") : ""}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {historyHasMore && (
                  <button
                    onClick={() => {
                      if (!selectedSupplier) return;
                      setHistoryLoading(true);
                      fetch(`/api/suppliers/${selectedSupplier}/history?limit=50`)
                        .then((r) => r.json())
                        .then((d) => {
                          setHistoryItems(d.items || []);
                          setHistoryHasMore(d.has_more || false);
                        })
                        .catch(() => {})
                        .finally(() => setHistoryLoading(false));
                    }}
                    className="text-[10px] text-[#F97316] bg-transparent border-none cursor-pointer mt-1.5 p-0"
                  >
                    {t("page.seeMore")}
                  </button>
                )}
              </>
            ) : (
              <p className="text-[11px] text-[#A1A1AA] py-2">{t("page.noInteraction")}</p>
            )}
          </div>

          {/* Notes */}
          {selected.notes && (
            <div className="px-5 py-4 border-b border-[#27272A]">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#A1A1AA] font-semibold mb-2.5">
                Notes
              </div>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">{selected.notes}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="px-5 py-4 flex gap-2">
            {selected.email && (
              <a
                href={`mailto:${selected.email}`}
                className="flex-1 text-[11px] py-2 rounded-[7px] border border-transparent bg-gradient-to-br from-[#F97316] to-[#EA580C] text-[#0F0F11] cursor-pointer text-center font-medium no-underline block"
              >
                &#128231; Contacter
              </a>
            )}
            <button
              className="flex-1 text-[11px] py-2 rounded-[7px] border border-[#3F3F46] bg-[#27272A] text-[#D4D4D8] cursor-pointer text-center font-medium"
              onClick={() => router.push("/submissions")}
            >
              &#128203; {t("page.priceRequest")}
            </button>
            <button
              onClick={() => handleEnrich(selected)}
              disabled={enriching}
              className="flex-1 text-[11px] py-2 rounded-[7px] border border-[#3F3F46] bg-[#27272A] text-[#D4D4D8] cursor-pointer text-center font-medium"
              style={{ opacity: enriching ? 0.5 : 1 }}
            >
              {enriching ? "..." : "\u2728 Enrichir IA"}
            </button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <SupplierFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        supplier={editSupplier}
        onSaved={handleSaved}
      />

      <SupplierImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={handleSaved}
      />

      <AISearchDialog
        open={aiSearchOpen}
        onOpenChange={setAiSearchOpen}
        onSupplierAdded={handleSaved}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={executeDelete}
        title={t("deleteSupplierTitle")}
        description={t("deleteSupplierDescription", { name: deleteTarget?.company_name || "" })}
        variant="danger"
      />
    </>
  );
}
