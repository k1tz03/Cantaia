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
  active: { color: "text-green-700 bg-green-50", dotColor: "bg-green-500" },
  preferred: { color: "text-blue-700 bg-blue-50", dotColor: "bg-blue-500" },
  blacklisted: { color: "text-red-700 bg-red-50", dotColor: "bg-red-500" },
  inactive: { color: "text-gray-500 bg-gray-100", dotColor: "bg-gray-400" },
  new: { color: "text-amber-700 bg-amber-50", dotColor: "bg-amber-500" },
};

const SUPPLIER_TYPE_CONFIG: Record<SupplierType, { label: string; color: string }> = {
  fournisseur: { label: "Fournisseur", color: "bg-emerald-50 text-emerald-700" },
  prestataire: { label: "Prestataire", color: "bg-violet-50 text-violet-700" },
};

const SPECIALTY_COLORS: Record<string, string> = {
  gros_oeuvre: "bg-orange-100 text-orange-700",
  electricite: "bg-yellow-100 text-yellow-700",
  cvc: "bg-cyan-100 text-cyan-700",
  sanitaire: "bg-blue-100 text-blue-700",
  peinture: "bg-pink-100 text-pink-700",
  menuiserie: "bg-amber-100 text-amber-700",
  etancheite: "bg-purple-100 text-purple-700",
  facades: "bg-indigo-100 text-indigo-700",
  serrurerie: "bg-slate-100 text-slate-700",
  carrelage: "bg-teal-100 text-teal-700",
  platrerie: "bg-rose-100 text-rose-700",
  charpente: "bg-lime-100 text-lime-700",
  couverture: "bg-red-100 text-red-700",
  ascenseur: "bg-violet-100 text-violet-700",
  amenagement_exterieur: "bg-emerald-100 text-emerald-700",
  demolition: "bg-gray-200 text-gray-700",
  terrassement: "bg-stone-100 text-stone-700",
  echafaudage: "bg-zinc-100 text-zinc-700",
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
    if (score >= 85) return "text-green-600";
    if (score >= 70) return "text-blue-600";
    if (score >= 50) return "text-amber-600";
    return "text-red-600";
  }

  function renderStars(rating: number) {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
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
          <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
          <p className="text-sm text-gray-500">Chargement des fournisseurs...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full">
        {/* Main list */}
        <div className={`flex-1 overflow-auto ${selected ? "border-r border-gray-200" : ""}`}>
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
                <p className="text-sm text-gray-500 mt-1">
                  {t("subtitle", { count: filtered.length })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAiSearchOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium text-gray-700"
                >
                  <Sparkles className="h-4 w-4 text-[#2563EB]" />
                  Recherche IA
                </button>
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium text-gray-700"
                >
                  <Upload className="h-4 w-4" />
                  Importer CSV
                </button>
                <button
                  onClick={handleAddNew}
                  className="flex items-center gap-2 px-4 py-2 bg-[#2563EB] text-white rounded-md hover:bg-[#1D4ED8] text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  {t("addSupplier")}
                </button>
              </div>
            </div>

            {/* Error banner */}
            {fetchError && (
              <div className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-inset ring-red-200">
                {fetchError}
              </div>
            )}

            {/* Type filter toggle */}
            <div className="flex items-center gap-1 mb-4 p-0.5 bg-gray-100 rounded-lg w-fit">
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
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("search")}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <select
                value={filterSpecialty}
                onChange={(e) => setFilterSpecialty(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              >
                <option value="">{t("allSpecialties")}</option>
                {allSpecialties.map((sp) => (
                  <option key={sp} value={sp}>{getSpecialtyLabel(sp)}</option>
                ))}
              </select>
              <select
                value={filterZone}
                onChange={(e) => setFilterZone(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              >
                <option value="">{t("allZones")}</option>
                {allZones.map((z) => (
                  <option key={z} value={z}>{z}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
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
                  <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <Building2 className="h-8 w-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">{t("noSuppliers")}</h3>
                  <p className="text-sm text-gray-500 max-w-sm">{t("noSuppliersDesc")}</p>
                </div>
              )
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t("companyName")}</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t("specialties")}</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t("geoZone")}</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t("status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((supplier) => {
                      const statusCfg = STATUS_CONFIG[supplier.status];
                      return (
                        <tr
                          key={supplier.id}
                          onClick={() => setSelectedSupplier(supplier.id === selectedSupplier ? null : supplier.id)}
                          className={`cursor-pointer transition-colors duration-150 ${
                            supplier.id === selectedSupplier
                              ? "bg-blue-50"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="h-9 w-9 rounded-full bg-[#2563EB] flex items-center justify-center text-white text-xs font-medium shrink-0">
                                {supplier.company_name.substring(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-gray-900">{supplier.company_name}</span>
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
                                <div className="text-xs text-gray-500">{supplier.contact_name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {supplier.specialties.slice(0, 2).map((sp) => (
                                <span key={sp} className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${SPECIALTY_COLORS[sp] || "bg-gray-100 text-gray-600"}`}>
                                  {getSpecialtyLabel(sp)}
                                </span>
                              ))}
                              {supplier.specialties.length > 2 && (
                                <span className="text-[11px] text-gray-400">+{supplier.specialties.length - 2}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{supplier.geo_zone || "\u2014"}</td>
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
          <div className="w-[400px] shrink-0 sticky top-0 self-start max-h-screen overflow-y-auto bg-white border-l border-gray-200">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-[#2563EB] flex items-center justify-center text-white text-sm font-medium">
                    {selected.company_name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-gray-900">{selected.company_name}</h2>
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
                    <p className="text-sm text-gray-500">{selected.contact_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleEnrich(selected)}
                    disabled={enriching}
                    className="p-1.5 hover:bg-blue-50 rounded text-gray-400 hover:text-[#2563EB] disabled:opacity-50"
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
                    className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                    title="Modifier"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(selected)}
                    disabled={deleting}
                    className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-600 disabled:opacity-50"
                    title="Desactiver"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setSelectedSupplier(null)} className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Enrichment result banner */}
              {enrichResult && (
                <div className="mb-4 flex items-center justify-between rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700 ring-1 ring-inset ring-blue-200">
                  <span>{enrichResult}</span>
                  <button
                    onClick={() => setEnrichResult(null)}
                    className="ml-2 rounded p-0.5 hover:bg-blue-100 text-blue-400 hover:text-blue-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Score */}
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">{t("overallScore")}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${getScoreColor(selected.overall_score)}`}>
                      {Math.round(selected.overall_score)}
                      <span className="text-sm text-gray-400 font-normal">/100</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRecalculateScore(selected.id)}
                      disabled={recalculating}
                      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 disabled:opacity-50"
                      title="Recalculer le score"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${recalculating ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-gray-500">{t("responseRate")}</span>
                    <span className="font-medium ml-auto">{Math.round(selected.response_rate)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-gray-400" />
                    <span className="text-gray-500">{t("avgResponseDays")}</span>
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
                          ? "bg-amber-50 text-amber-700 ring-amber-200"
                          : "bg-blue-50 text-blue-700 ring-blue-200"
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
                    <Mail className="h-4 w-4 text-gray-400" />
                    <a href={`mailto:${selected.email}`} className="text-blue-600 hover:underline">{selected.email}</a>
                  </div>
                )}
                {selected.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-700">{selected.phone}</span>
                  </div>
                )}
                {(selected.address || selected.city) && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-700">
                      {selected.address}{selected.address && selected.city ? ", " : ""}{selected.postal_code} {selected.city}
                    </span>
                  </div>
                )}
                {selected.website && (
                  <div className="flex items-center gap-3 text-sm">
                    <Globe className="h-4 w-4 text-gray-400" />
                    <a href={selected.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{selected.website}</a>
                  </div>
                )}
              </div>

              {/* Specialties */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">{t("specialties")}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selected.specialties.map((sp) => (
                    <span key={sp} className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${SPECIALTY_COLORS[sp] || "bg-gray-100 text-gray-600"}`}>
                      {getSpecialtyLabel(sp)}
                    </span>
                  ))}
                </div>
              </div>

              {/* CFC Codes */}
              {selected.cfc_codes.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">{t("cfcCodes")}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.cfc_codes.map((code) => (
                      <span key={code} className="inline-flex items-center px-2.5 py-1 rounded bg-gray-100 text-gray-700 text-xs font-mono">
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Certifications */}
              {selected.certifications.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">{t("certifications")}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.certifications.map((cert) => (
                      <span key={cert} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-green-50 text-green-700 text-xs font-medium">
                        <Award className="h-3 w-3" />
                        {cert}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Stats</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{selected.total_requests_sent}</div>
                    <div className="text-xs text-gray-500">{t("totalRequests")}</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{selected.total_offers_received}</div>
                    <div className="text-xs text-gray-500">{t("totalOffers")}</div>
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{selected.total_projects_involved}</div>
                    <div className="text-xs text-gray-500">{t("totalProjects")}</div>
                  </div>
                </div>
              </div>

              {/* Prix & Offres */}
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Prix & Offres</h3>
                {pricesLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : supplierPrices && supplierPrices.length > 0 ? (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {supplierPrices.map((offer: any) => (
                      <div key={offer.id} className="rounded-md border border-gray-100 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-gray-700">
                            {offer.project_name || "Sans projet"}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              offer.source_type === "pdf" ? "bg-purple-50 text-purple-600" : "bg-blue-50 text-blue-600"
                            }`}>
                              {offer.source_type === "pdf" ? "PDF" : "Email"}
                            </span>
                            {offer.received_at && (
                              <span className="text-[10px] text-gray-400">
                                {new Date(offer.received_at).toLocaleDateString("fr-CH")}
                              </span>
                            )}
                          </div>
                        </div>
                        {offer.total_amount != null && (
                          <p className="text-sm font-semibold text-gray-900 mb-1">
                            {new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2 }).format(offer.total_amount)} {offer.currency || "CHF"}
                          </p>
                        )}
                        {offer.line_items?.length > 0 && (
                          <div className="space-y-0.5">
                            {offer.line_items.slice(0, 5).map((li: any) => (
                              <div key={li.id} className="flex justify-between text-xs text-gray-500">
                                <span className="truncate mr-2 flex-1">{li.supplier_description}</span>
                                <span className="font-mono shrink-0">
                                  {li.unit_price != null
                                    ? `${new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2 }).format(li.unit_price)} /${li.supplier_unit || ""}`
                                    : "—"}
                                </span>
                              </div>
                            ))}
                            {offer.line_items.length > 5 && (
                              <p className="text-[10px] text-gray-400 mt-1">
                                +{offer.line_items.length - 5} autres postes
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-3">
                    Aucune offre de prix enregistrée
                  </p>
                )}
              </div>

              {/* Price Trend Chart */}
              {priceTrend.length >= 3 && (
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <SupplierPriceChart data={priceTrend} />
                </div>
              )}

              {/* History Timeline */}
              <div className="border-t border-gray-200 pt-4 mt-4">
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
                <div className="border-t border-gray-200 pt-4 mt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">{t("notes")}</h3>
                  <p className="text-sm text-gray-600">{selected.notes}</p>
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
