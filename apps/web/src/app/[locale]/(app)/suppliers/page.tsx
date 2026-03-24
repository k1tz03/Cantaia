"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Building2,
  Search,
  Plus,
  Star,
  Phone,
  Mail,
  MapPin,
  Globe,
  Award,
  TrendingUp,
  Clock,
  X,
  Loader2,
  Upload,
  Sparkles,
  Pencil,
  Trash2,
  Users,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { SPECIALTY_LABELS, type SupplierSpecialty } from "@cantaia/core/suppliers";
import type { Supplier, SupplierStatus, SupplierType } from "@cantaia/database";
import { EmptyState } from "@/components/ui/EmptyState";
import { SupplierFormDialog } from "@/components/suppliers/SupplierFormDialog";
import { SupplierImportDialog } from "@/components/suppliers/SupplierImportDialog";
import { AISearchDialog } from "@/components/suppliers/AISearchDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SupplierTimeline, type TimelineItem } from "@/components/suppliers/SupplierTimeline";
import { SupplierPriceChart, type PriceTrendPoint } from "@/components/suppliers/SupplierPriceChart";

const STATUS_CONFIG: Record<SupplierStatus, { color: string; dotColor: string }> = {
  active: { color: "text-green-700 text-green-400 bg-green-500/10", dotColor: "bg-green-500" },
  preferred: { color: "text-[#F97316] bg-[#F97316]/10", dotColor: "bg-[#F97316]/100" },
  blacklisted: { color: "text-red-700 text-red-400 bg-red-500/10", dotColor: "bg-red-500" },
  inactive: { color: "text-[#71717A] bg-[#27272A]", dotColor: "bg-[#27272A]-foreground" },
  new: { color: "text-amber-700 text-amber-400 bg-amber-500/10", dotColor: "bg-amber-500" },
};

const SUPPLIER_TYPE_CONFIG: Record<SupplierType, { label: string; color: string }> = {
  fournisseur: { label: "Fournisseur", color: "bg-emerald-500/10 text-emerald-700 text-emerald-400" },
  prestataire: { label: "Prestataire", color: "bg-violet-500/10 text-violet-400" },
};

const SPECIALTY_COLORS: Record<string, string> = {
  gros_oeuvre: "bg-orange-500/10 text-orange-700 text-orange-400",
  electricite: "bg-yellow-500/10 text-yellow-700 text-yellow-400",
  cvc: "bg-cyan-500/10 text-cyan-400",
  sanitaire: "bg-[#F97316]/10 text-[#F97316]",
  peinture: "bg-pink-500/10 text-pink-400",
  menuiserie: "bg-amber-500/10 text-amber-700 text-amber-400",
  etancheite: "bg-purple-500/10 text-purple-700 text-purple-400",
  facades: "bg-indigo-500/10 text-indigo-400",
  serrurerie: "bg-[#27272A] text-[#FAFAFA]",
  carrelage: "bg-teal-500/10 text-teal-700 text-teal-400",
  platrerie: "bg-rose-500/10 text-rose-400",
  charpente: "bg-lime-500/10 text-lime-400",
  couverture: "bg-red-500/10 text-red-700 text-red-400",
  ascenseur: "bg-violet-500/10 text-violet-400",
  amenagement_exterieur: "bg-emerald-500/10 text-emerald-700 text-emerald-400",
  demolition: "bg-[#27272A] text-[#FAFAFA]",
  terrassement: "bg-stone-500/10 text-stone-400",
  echafaudage: "bg-zinc-500/10 text-zinc-400",
};

export default function SuppliersPage() {
  const t = useTranslations("suppliers");

  // Data state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Filter state
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterSpecialty, setFilterSpecialty] = useState<string>("");
  const [filterZone, setFilterZone] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
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

  // Supplier prices
  const [supplierPrices, setSupplierPrices] = useState<any[] | null>(null);
  const [pricesLoading, setPricesLoading] = useState(false);

  // History / Timeline
  const [historyItems, setHistoryItems] = useState<TimelineItem[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [priceTrend, setPriceTrend] = useState<PriceTrendPoint[]>([]);
  const [historyAlerts, setHistoryAlerts] = useState<{ type: string; message: string; severity: string }[]>([]);

  // Score recalculation
  const [recalculating, setRecalculating] = useState(false);

  // Fetch suppliers from API
  const fetchSuppliers = useCallback(async () => {
    try {
      const res = await fetch("/api/suppliers");
      if (!res.ok) {
        setFetchError("Impossible de charger les fournisseurs");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setSuppliers(data.suppliers || []);
      setFetchError("");
    } catch (err) {
      console.error("[SuppliersPage] Fetch error:", err);
      setFetchError("Erreur reseau");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  // Load supplier prices when selected
  useEffect(() => {
    if (!selectedSupplier) {
      setSupplierPrices(null);
      return;
    }
    setPricesLoading(true);
    fetch(`/api/suppliers/${selectedSupplier}/prices`)
      .then((r) => r.json())
      .then((d) => setSupplierPrices(d.offers || []))
      .catch(() => setSupplierPrices([]))
      .finally(() => setPricesLoading(false));
  }, [selectedSupplier]);

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
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/recalculate-score`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchSuppliers();
      }
    } catch (err) {
      console.error("[SuppliersPage] Recalculate error:", err);
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
      if (filterStatus && s.status !== filterStatus) return false;
      return true;
    });
  }, [suppliers, search, filterType, filterSpecialty, filterZone, filterStatus]);

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

  function getScoreColor(score: number): string {
    if (score >= 85) return "text-green-400";
    if (score >= 70) return "text-[#F97316]";
    if (score >= 50) return "text-amber-400";
    return "text-red-400";
  }

  function renderStars(rating: number) {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-[#71717A]"}`}
          />
        ))}
      </div>
    );
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
    try {
      const res = await fetch(`/api/suppliers/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSelectedSupplier(null);
        await fetchSuppliers();
      }
    } catch (err) {
      console.error("[SuppliersPage] Delete error:", err);
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
      if (res.ok) {
        const data = await res.json();
        const count = data.updates_applied?.length || 0;
        setEnrichResult(
          count > 0
            ? `Enrichissement termine : ${count} champ(s) mis a jour`
            : "Aucune nouvelle information trouvee"
        );
        await fetchSuppliers();
      } else {
        const text = await res.text();
        let msg = `Erreur (${res.status})`;
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
      setEnrichResult("Erreur reseau");
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
          <p className="text-sm text-[#71717A]">Chargement des fournisseurs...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full">
        {/* Main list */}
        <div className={`flex-1 overflow-auto ${selected ? "border-r border-[#27272A]" : ""}`}>
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="font-display text-2xl font-extrabold text-[#FAFAFA]">{t("title")}</h1>
                <p className="text-sm text-[#71717A] mt-1">
                  {t("subtitle", { count: filtered.length })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAiSearchOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 border border-[#3F3F46] bg-[#18181B] rounded-md hover:bg-[#1C1C1F] text-sm font-medium text-[#D4D4D8]"
                >
                  <Sparkles className="h-4 w-4 text-[#F97316]" />
                  Recherche IA
                </button>
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 border border-[#3F3F46] bg-[#18181B] rounded-md hover:bg-[#1C1C1F] text-sm font-medium text-[#D4D4D8]"
                >
                  <Upload className="h-4 w-4" />
                  Importer CSV
                </button>
                <button
                  onClick={handleAddNew}
                  className="flex items-center gap-2 px-4 py-2 bg-[#F97316] text-white rounded-md hover:bg-[#EA580C] text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  {t("addSupplier")}
                </button>
              </div>
            </div>

            {/* Error banner */}
            {fetchError && (
              <div className="mb-4 rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-700 text-red-400 ring-1 ring-inset ring-red-500/20">
                {fetchError}
              </div>
            )}

            {/* Type filter toggle */}
            <div className="flex items-center gap-1 mb-4 p-0.5 bg-[#27272A] rounded-lg w-fit">
              {[
                { value: "", label: "Tous" },
                { value: "fournisseur", label: "Fournisseurs" },
                { value: "prestataire", label: "Prestataires" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilterType(opt.value)}
                  className={`px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    filterType === opt.value
                      ? "bg-[#18181B] text-[#FAFAFA] shadow-sm"
                      : "text-[#71717A] hover:text-[#FAFAFA]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#71717A]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("search")}
                  className="w-full pl-10 pr-4 py-2 border border-[#3F3F46] rounded-md text-sm bg-[#18181B] text-[#D4D4D8] placeholder:text-[#52525B] focus:border-[#F97316] focus:ring-1 focus:ring-[#F97316]"
                />
              </div>
              <select
                value={filterSpecialty}
                onChange={(e) => setFilterSpecialty(e.target.value)}
                className="px-3 py-2 border border-[#3F3F46] rounded-md text-sm bg-[#18181B] text-[#D4D4D8]"
              >
                <option value="">{t("allSpecialties")}</option>
                {allSpecialties.map((sp) => (
                  <option key={sp} value={sp}>{getSpecialtyLabel(sp)}</option>
                ))}
              </select>
              <select
                value={filterZone}
                onChange={(e) => setFilterZone(e.target.value)}
                className="px-3 py-2 border border-[#3F3F46] rounded-md text-sm bg-[#18181B] text-[#D4D4D8]"
              >
                <option value="">{t("allZones")}</option>
                {allZones.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-[#3F3F46] rounded-md text-sm bg-[#18181B] text-[#D4D4D8]"
              >
                <option value="">{t("allStatuses")}</option>
                <option value="active">{t("statusActive")}</option>
                <option value="preferred">{t("statusPreferred")}</option>
                <option value="blacklisted">{t("statusBlacklisted")}</option>
                <option value="inactive">{t("statusInactive")}</option>
                <option value="new">{t("statusNew")}</option>
              </select>
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
              suppliers.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Aucun fournisseur"
                  description="Ajoutez votre premier fournisseur pour commencer."
                  action={{ label: "Ajouter un fournisseur", onClick: handleAddNew }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="h-16 w-16 rounded-full bg-[#27272A] flex items-center justify-center mb-4">
                    <Building2 className="h-8 w-8 text-[#71717A]" />
                  </div>
                  <h3 className="text-lg font-medium text-[#FAFAFA] mb-1">{t("noSuppliers")}</h3>
                  <p className="text-sm text-[#71717A] max-w-sm">{t("noSuppliersDesc")}</p>
                </div>
              )
            ) : (
              <div className="bg-[#18181B] border border-[#27272A] rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#27272A] bg-[#27272A]">
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#71717A] uppercase">{t("companyName")}</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#71717A] uppercase">{t("specialties")}</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#71717A] uppercase">{t("geoZone")}</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-[#71717A] uppercase">{t("status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((supplier) => {
                      const statusCfg = STATUS_CONFIG[supplier.status];
                      return (
                        <tr
                          key={supplier.id}
                          onClick={() => setSelectedSupplier(supplier.id === selectedSupplier ? null : supplier.id)}
                          className={`cursor-pointer transition-colors duration-150 ${
                            supplier.id === selectedSupplier
                              ? "bg-[#F97316]/10"
                              : "hover:bg-[#1C1C1F]"
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-[#F97316] flex items-center justify-center text-white text-xs font-medium shrink-0">
                                {supplier.company_name.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-[#FAFAFA]">{supplier.company_name}</span>
                                  {(() => {
                                    const sType = (supplier.supplier_type || "fournisseur") as SupplierType;
                                    const cfg = SUPPLIER_TYPE_CONFIG[sType];
                                    return (
                                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.color}`}>
                                        {cfg.label}
                                      </span>
                                    );
                                  })()}
                                </div>
                                <div className="text-xs text-[#71717A]">{supplier.contact_name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {supplier.specialties.slice(0, 2).map((sp) => (
                                <span key={sp} className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${SPECIALTY_COLORS[sp] || "bg-[#27272A] text-[#71717A]"}`}>
                                  {getSpecialtyLabel(sp)}
                                </span>
                              ))}
                              {supplier.specialties.length > 2 && (
                                <span className="text-[11px] text-[#71717A]">+{supplier.specialties.length - 2}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-[#71717A]">{supplier.geo_zone || "\u2014"}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.color}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dotColor}`} />
                              {t(`status${supplier.status.charAt(0).toUpperCase() + supplier.status.slice(1)}` as "statusActive")}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-[400px] shrink-0 sticky top-0 self-start max-h-screen overflow-y-auto bg-[#18181B] border-l border-[#27272A]">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-[#F97316] flex items-center justify-center text-white text-sm font-medium">
                    {selected.company_name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-[#FAFAFA]">{selected.company_name}</h2>
                      {(() => {
                        const sType = (selected.supplier_type || "fournisseur") as SupplierType;
                        const cfg = SUPPLIER_TYPE_CONFIG[sType];
                        return (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-sm text-[#71717A]">{selected.contact_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEnrich(selected)}
                    disabled={enriching}
                    className="p-1.5 hover:bg-[#F97316]/10 rounded text-[#71717A] hover:text-[#F97316] disabled:opacity-50"
                    title="Enrichir via IA"
                  >
                    {enriching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => handleEdit(selected)}
                    className="p-1.5 hover:bg-[#1C1C1F] rounded text-[#71717A] hover:text-[#71717A]"
                    title="Modifier"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(selected)}
                    disabled={deleting}
                    className="p-1.5 hover:bg-red-500/10 rounded text-[#71717A] hover:text-red-600 disabled:opacity-50"
                    title="Desactiver"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setSelectedSupplier(null)} className="p-1.5 hover:bg-[#1C1C1F] rounded text-[#71717A] hover:text-[#71717A]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Enrichment result banner */}
              {enrichResult && (
                <div className="mb-4 flex items-center justify-between rounded-md bg-[#F97316]/10 px-3 py-2 text-sm text-[#F97316] ring-1 ring-inset ring-[#F97316]/20">
                  <span>{enrichResult}</span>
                  <button
                    onClick={() => setEnrichResult(null)}
                    className="ml-2 rounded p-0.5 hover:bg-[#F97316]/10 text-[#F97316]/60 hover:text-[#F97316]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Score */}
              <div className="bg-[#27272A] rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-[#FAFAFA]">{t("overallScore")}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${getScoreColor(selected.overall_score)}`}>
                      {Math.round(selected.overall_score)}
                      <span className="text-sm text-[#71717A] font-normal">/100</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRecalculateScore(selected.id)}
                      disabled={recalculating}
                      className="p-1 rounded hover:bg-[#1C1C1F] text-[#71717A] hover:text-[#71717A] disabled:opacity-50"
                      title="Recalculer le score"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${recalculating ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-[#71717A]" />
                    <span className="text-[#71717A]">{t("responseRate")}</span>
                    <span className="font-medium ml-auto">{Math.round(selected.response_rate)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-[#71717A]" />
                    <span className="text-[#71717A]">{t("avgResponseDays")}</span>
                    <span className="font-medium ml-auto">{selected.avg_response_days} {t("days")}</span>
                  </div>
                </div>
                <div className="mt-3">
                  {renderStars(selected.manual_rating)}
                </div>
              </div>

              {/* Alerts */}
              {historyAlerts.length > 0 && (
                <div className="mb-6 space-y-2">
                  {historyAlerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ring-1 ring-inset ${
                        alert.severity === "warning"
                          ? "bg-amber-500/10 text-amber-700 text-amber-400 ring-amber-500/20"
                          : "bg-[#F97316]/10 text-[#F97316] ring-[#F97316]/20"
                      }`}
                    >
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>{alert.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Contact */}
              <div className="space-y-3 mb-6">
                {selected.email && (
                  <div className="flex items-center gap-3 text-sm">
                    <Mail className="h-4 w-4 text-[#71717A]" />
                    <a href={`mailto:${selected.email}`} className="text-[#F97316] hover:underline">{selected.email}</a>
                  </div>
                )}
                {selected.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-[#71717A]" />
                    <span className="text-[#FAFAFA]">{selected.phone}</span>
                  </div>
                )}
                {(selected.address || selected.city) && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-[#71717A]" />
                    <span className="text-[#FAFAFA]">
                      {selected.address}{selected.address && selected.city ? ", " : ""}{selected.postal_code} {selected.city}
                    </span>
                  </div>
                )}
                {selected.website && (
                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="h-4 w-4 text-[#71717A]" />
                    <a href={selected.website} target="_blank" rel="noopener noreferrer" className="text-[#F97316] hover:underline">{selected.website}</a>
                  </div>
                )}
              </div>

              {/* Specialties */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-[#FAFAFA] mb-2">{t("specialties")}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selected.specialties.map((sp) => (
                    <span key={sp} className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${SPECIALTY_COLORS[sp] || "bg-[#27272A] text-[#71717A]"}`}>
                      {getSpecialtyLabel(sp)}
                    </span>
                  ))}
                </div>
              </div>

              {/* CFC Codes */}
              {selected.cfc_codes.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-[#FAFAFA] mb-2">{t("cfcCodes")}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.cfc_codes.map((code) => (
                      <span key={code} className="inline-flex items-center px-2.5 py-1 rounded bg-[#27272A] text-[#FAFAFA] text-xs font-mono">
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Certifications */}
              {selected.certifications.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-[#FAFAFA] mb-2">{t("certifications")}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.certifications.map((cert) => (
                      <span key={cert} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-green-500/10 text-green-700 text-green-400 text-xs font-medium">
                        <Award className="h-3 w-3" />
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="border-t border-[#27272A] pt-4">
                <h3 className="text-sm font-medium text-[#FAFAFA] mb-3">Stats</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-lg font-semibold text-[#FAFAFA]">{selected.total_requests_sent}</div>
                    <div className="text-xs text-[#71717A]">{t("totalRequests")}</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-[#FAFAFA]">{selected.total_offers_received}</div>
                    <div className="text-xs text-[#71717A]">{t("totalOffers")}</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-[#FAFAFA]">{selected.total_projects_involved}</div>
                    <div className="text-xs text-[#71717A]">{t("totalProjects")}</div>
                  </div>
                </div>
              </div>

              {/* Prix & Offres */}
              <div className="border-t border-[#27272A] pt-4 mt-4">
                <h3 className="text-sm font-medium text-[#FAFAFA] mb-3">Prix & Offres</h3>
                {pricesLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-[#71717A]" />
                  </div>
                ) : supplierPrices && supplierPrices.length > 0 ? (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {supplierPrices.map((offer: any) => (
                      <div key={offer.id} className="rounded-md border border-[#27272A] p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-[#FAFAFA]">
                            {offer.project_name || "Sans projet"}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              offer.source_type === "pdf" ? "bg-purple-500/10 text-purple-600" : "bg-[#F97316]/10 text-[#F97316]"
                            }`}>
                              {offer.source_type === "pdf" ? "PDF" : "Email"}
                            </span>
                            {offer.received_at && (
                              <span className="text-[10px] text-[#71717A]">
                                {new Date(offer.received_at).toLocaleDateString("fr-CH")}
                              </span>
                            )}
                          </div>
                        </div>
                        {offer.total_amount != null && (
                          <p className="text-sm font-semibold text-[#FAFAFA] mb-1">
                            {new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2 }).format(offer.total_amount)} {offer.currency || "CHF"}
                          </p>
                        )}
                        {offer.line_items?.length > 0 && (
                          <div className="space-y-0.5">
                            {offer.line_items.slice(0, 5).map((li: any) => (
                              <div key={li.id} className="flex justify-between text-xs text-[#71717A]">
                                <span className="truncate mr-2 flex-1">{li.supplier_description}</span>
                                <span className="font-mono shrink-0">
                                  {li.unit_price != null
                                    ? `${new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2 }).format(li.unit_price)} /${li.supplier_unit || ""}`
                                    : "—"}
                                </span>
                              </div>
                            ))}
                            {offer.line_items.length > 5 && (
                              <p className="text-[10px] text-[#71717A] mt-1">
                                +{offer.line_items.length - 5} autres postes
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#71717A] text-center py-3">
                    Aucune offre de prix enregistrée
                  </p>
                )}
              </div>

              {/* Price Trend Chart */}
              {priceTrend.length >= 3 && (
                <div className="border-t border-[#27272A] pt-4 mt-4">
                  <SupplierPriceChart data={priceTrend} />
                </div>
              )}

              {/* History Timeline */}
              <div className="border-t border-[#27272A] pt-4 mt-4">
                <SupplierTimeline
                  items={historyItems}
                  hasMore={historyHasMore}
                  loading={historyLoading}
                  onLoadMore={() => {
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
                />
              </div>

              {/* Notes */}
              {selected.notes && (
                <div className="border-t border-[#27272A] pt-4 mt-4">
                  <h3 className="text-sm font-medium text-[#FAFAFA] mb-2">{t("notes")}</h3>
                  <p className="text-sm text-[#71717A]">{selected.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
