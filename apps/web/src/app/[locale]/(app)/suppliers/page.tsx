"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
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
import { type TimelineItem } from "@/components/suppliers/SupplierTimeline";
import { SupplierPriceChart, type PriceTrendPoint } from "@/components/suppliers/SupplierPriceChart";

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

  // Data state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  // Filter state
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterSpecialty, setFilterSpecialty] = useState<string>("");
  const [filterZone, setFilterZone] = useState<string>("");
  const [filterStatus] = useState<string>("");
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

  // Supplier prices (data loaded for future use in detail panel)
  const [, setSupplierPrices] = useState<any[] | null>(null);
  const [, setPricesLoading] = useState(false);

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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#F97316" }} />
          <p style={{ fontSize: "14px", color: "#71717A" }}>Chargement des fournisseurs...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ flex: 1, overflowY: "auto", background: "#0F0F11", padding: "24px 28px" }}>
        {/* Page header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div>
            <h1 style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontSize: "24px", fontWeight: 800, color: "#FAFAFA", margin: 0 }}>
              Fournisseurs
            </h1>
            <p style={{ fontSize: "13px", color: "#71717A", marginTop: "2px" }}>
              {filtered.length} fournisseurs et prestataires
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setAiSearchOpen(true)}
              style={{ fontSize: "12px", padding: "8px 16px", borderRadius: "8px", border: "1px solid #3F3F46", background: "#18181B", color: "#D4D4D8", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}
            >
              <span>&#10024;</span> Recherche IA
            </button>
            <button
              onClick={() => setImportOpen(true)}
              style={{ fontSize: "12px", padding: "8px 16px", borderRadius: "8px", border: "1px solid #3F3F46", background: "#18181B", color: "#D4D4D8", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}
            >
              <span>&#128229;</span> Importer CSV
            </button>
            <button
              onClick={handleAddNew}
              style={{ fontSize: "12px", padding: "8px 16px", borderRadius: "8px", border: "1px solid transparent", background: "linear-gradient(135deg, #F97316, #EA580C)", color: "white", cursor: "pointer", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}
            >
              + Ajouter
            </button>
          </div>
        </div>

        {/* Error banner */}
        {fetchError && (
          <div style={{ marginBottom: "14px", borderRadius: "8px", background: "rgba(239,68,68,0.1)", padding: "10px 16px", fontSize: "13px", color: "#F87171", border: "1px solid rgba(239,68,68,0.2)" }}>
            {fetchError}
          </div>
        )}

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px", marginBottom: "16px" }}>
          <div style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontSize: "24px", fontWeight: 800, color: "#FAFAFA" }}>
              {kpis.total}
            </div>
            <div style={{ fontSize: "10px", color: "#71717A", marginTop: "2px" }}>Total fournisseurs</div>
          </div>
          <div style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontSize: "24px", fontWeight: 800, color: "#34D399" }}>
              {kpis.avgResponseRate}%
            </div>
            <div style={{ fontSize: "10px", color: "#71717A", marginTop: "2px" }}>Taux de reponse moyen</div>
          </div>
          <div style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontSize: "24px", fontWeight: 800, color: "#FAFAFA" }}>
              {kpis.activeCount}
            </div>
            <div style={{ fontSize: "10px", color: "#71717A", marginTop: "2px" }}>Fournisseurs actifs</div>
          </div>
          <div style={{ background: "#18181B", border: "1px solid #27272A", borderRadius: "10px", padding: "12px 14px" }}>
            <div style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontSize: "24px", fontWeight: 800, color: "#FAFAFA" }}>
              {kpis.totalOffers}
            </div>
            <div style={{ fontSize: "10px", color: "#71717A", marginTop: "2px" }}>Offres recues</div>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "14px" }}>
          {/* Type toggle */}
          <div style={{ display: "flex", background: "#18181B", border: "1px solid #3F3F46", borderRadius: "8px", padding: "3px" }}>
            {[
              { value: "", label: "Tous" },
              { value: "fournisseur", label: "Fournisseurs" },
              { value: "prestataire", label: "Prestataires" },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterType(opt.value)}
                style={{
                  fontSize: "12px",
                  padding: "5px 14px",
                  borderRadius: "6px",
                  border: "none",
                  background: filterType === opt.value ? "#27272A" : "transparent",
                  color: filterType === opt.value ? "#FAFAFA" : "#71717A",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
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
            placeholder="&#128269; Rechercher par nom, email, specialite..."
            style={{
              background: "#18181B",
              border: "1px solid #3F3F46",
              borderRadius: "8px",
              padding: "7px 14px",
              fontSize: "12px",
              color: "#D4D4D8",
              flex: 1,
              outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "#F97316"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "#3F3F46"; }}
          />

          {/* Specialty filter */}
          <select
            value={filterSpecialty}
            onChange={(e) => setFilterSpecialty(e.target.value)}
            style={{ background: "#18181B", border: "1px solid #3F3F46", borderRadius: "8px", padding: "7px 12px", fontSize: "12px", color: "#D4D4D8", outline: "none" }}
          >
            <option value="">Toutes specialites</option>
            {allSpecialties.map((sp) => (
              <option key={sp} value={sp}>{getSpecialtyLabel(sp)}</option>
            ))}
          </select>

          {/* Zone filter */}
          <select
            value={filterZone}
            onChange={(e) => setFilterZone(e.target.value)}
            style={{ background: "#18181B", border: "1px solid #3F3F46", borderRadius: "8px", padding: "7px 12px", fontSize: "12px", color: "#D4D4D8", outline: "none" }}
          >
            <option value="">Toutes zones</option>
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
              title="Aucun fournisseur"
              description="Ajoutez votre premier fournisseur pour commencer."
              action={{ label: "Ajouter un fournisseur", onClick: handleAddNew }}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "64px 0", textAlign: "center" }}>
              <div style={{ height: "64px", width: "64px", borderRadius: "50%", background: "#27272A", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                <Building2 className="h-8 w-8" style={{ color: "#71717A" }} />
              </div>
              <h3 style={{ fontSize: "18px", fontWeight: 500, color: "#FAFAFA", marginBottom: "4px" }}>Aucun resultat</h3>
              <p style={{ fontSize: "14px", color: "#71717A", maxWidth: "360px" }}>Modifiez vos filtres pour afficher des fournisseurs.</p>
            </div>
          )
        ) : (
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                {["Entreprise", "Type", "Specialites", "Codes CFC", "Score", "Taux rep.", "Statut"].map((h) => (
                  <th
                    key={h}
                    style={{
                      fontSize: "10px",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "#52525B",
                      fontWeight: 600,
                      padding: "8px 12px",
                      textAlign: "left",
                      borderBottom: "1px solid #27272A",
                    }}
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

                return (
                  <tr
                    key={supplier.id}
                    onClick={() => setSelectedSupplier(supplier.id === selectedSupplier ? null : supplier.id)}
                    style={{
                      cursor: "pointer",
                      transition: "background 0.1s",
                      background: isSelected ? "rgba(249,115,22,0.08)" : undefined,
                    }}
                    onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "#18181B"; }}
                    onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = ""; }}
                  >
                    {/* Entreprise */}
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #1C1C1F", fontSize: "12px", color: "#D4D4D8", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "8px",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "11px", color: "white", fontWeight: 600, flexShrink: 0,
                          background: avatarBg,
                        }}>
                          {getInitials(supplier.company_name)}
                        </div>
                        <div>
                          <div style={{ fontSize: "13px", fontWeight: 600, color: "#FAFAFA" }}>{supplier.company_name}</div>
                          <div style={{ fontSize: "10px", color: "#71717A" }}>
                            {supplier.contact_name}{supplier.contact_name && supplier.email ? " \u00B7 " : ""}{supplier.email || ""}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #1C1C1F", fontSize: "12px", verticalAlign: "middle" }}>
                      <span style={{
                        fontSize: "9px", padding: "2px 7px", borderRadius: "4px", fontWeight: 600,
                        background: sType === "fournisseur" ? "rgba(16,185,129,0.09)" : "rgba(59,130,246,0.09)",
                        color: sType === "fournisseur" ? "#34D399" : "#60A5FA",
                      }}>
                        {sType === "fournisseur" ? "Fournisseur" : "Prestataire"}
                      </span>
                    </td>

                    {/* Specialites */}
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #1C1C1F", fontSize: "12px", verticalAlign: "middle" }}>
                      {supplier.specialties.slice(0, 2).map((sp) => (
                        <span
                          key={sp}
                          style={{
                            fontSize: "9px", padding: "2px 6px", borderRadius: "3px",
                            background: "#27272A", color: "#A1A1AA",
                            marginRight: "3px", display: "inline-block", marginBottom: "2px",
                          }}
                        >
                          {getSpecialtyLabel(sp)}
                        </span>
                      ))}
                      {supplier.specialties.length > 2 && (
                        <span style={{ fontSize: "9px", color: "#52525B" }}>+{supplier.specialties.length - 2}</span>
                      )}
                    </td>

                    {/* Codes CFC */}
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #1C1C1F", fontSize: "12px", verticalAlign: "middle" }}>
                      {(supplier.cfc_codes || []).slice(0, 3).map((code) => (
                        <span
                          key={code}
                          style={{
                            fontSize: "9px", padding: "2px 6px", borderRadius: "3px",
                            background: "rgba(59,130,246,0.07)", color: "#60A5FA",
                            marginRight: "3px", display: "inline-block",
                          }}
                        >
                          {code}
                        </span>
                      ))}
                      {(supplier.cfc_codes || []).length > 3 && (
                        <span style={{ fontSize: "9px", color: "#52525B" }}>+{supplier.cfc_codes.length - 3}</span>
                      )}
                    </td>

                    {/* Score */}
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #1C1C1F", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{
                          fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif",
                          fontSize: "14px", fontWeight: 700, color: scoreColor,
                        }}>
                          {score}
                        </span>
                        <div style={{ width: "50px", height: "4px", background: "#27272A", borderRadius: "2px", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: "2px", width: `${score}%`, background: scoreColor }} />
                        </div>
                      </div>
                    </td>

                    {/* Taux rep. */}
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #1C1C1F", fontSize: "12px", verticalAlign: "middle", color: rateColor, fontWeight: 600 }}>
                      {rate}%
                    </td>

                    {/* Statut */}
                    <td style={{ padding: "10px 12px", borderBottom: "1px solid #1C1C1F", fontSize: "12px", color: "#D4D4D8", verticalAlign: "middle" }}>
                      <span
                        style={{
                          display: "inline-block", width: "7px", height: "7px", borderRadius: "50%",
                          background: getStatusDotColor(supplier.status), marginRight: "4px", verticalAlign: "middle",
                        }}
                      />
                      {getStatusLabel(supplier.status)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ====== DETAIL PANEL ====== */}
      {selected && (
        <div style={{
          position: "fixed", top: 0, right: 0, width: "420px", height: "100vh",
          background: "#18181B", borderLeft: "1px solid #27272A", zIndex: 20,
          overflowY: "auto", boxShadow: "-8px 0 32px rgba(0,0,0,0.5)",
        }}>
          {/* Detail header */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #27272A", display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{
                width: "48px", height: "48px", borderRadius: "10px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "16px", color: "white", fontWeight: 700, marginBottom: "8px",
                background: getAvatarColor(selected.company_name),
              }}>
                {getInitials(selected.company_name)}
              </div>
              <div style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontSize: "18px", fontWeight: 700, color: "#FAFAFA" }}>
                {selected.company_name}
              </div>
              <div style={{ marginTop: "4px" }}>
                <span style={{
                  fontSize: "9px", padding: "2px 7px", borderRadius: "4px", fontWeight: 600,
                  background: (selected.supplier_type || "fournisseur") === "fournisseur" ? "rgba(16,185,129,0.09)" : "rgba(59,130,246,0.09)",
                  color: (selected.supplier_type || "fournisseur") === "fournisseur" ? "#34D399" : "#60A5FA",
                }}>
                  {(selected.supplier_type || "fournisseur") === "fournisseur" ? "Fournisseur" : "Prestataire"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => handleEdit(selected)}
                style={{
                  width: "28px", height: "28px", borderRadius: "6px", background: "#27272A",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "#A1A1AA", fontSize: "14px", border: "none",
                }}
                title="Modifier"
              >
                <Pencil style={{ width: "14px", height: "14px" }} />
              </button>
              <button
                onClick={() => handleDelete(selected)}
                disabled={deleting}
                style={{
                  width: "28px", height: "28px", borderRadius: "6px", background: "#27272A",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "#A1A1AA", fontSize: "14px", border: "none",
                  opacity: deleting ? 0.5 : 1,
                }}
                title="Supprimer"
              >
                <Trash2 style={{ width: "14px", height: "14px" }} />
              </button>
              <button
                onClick={() => setSelectedSupplier(null)}
                style={{
                  width: "28px", height: "28px", borderRadius: "6px", background: "#27272A",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  cursor: "pointer", color: "#A1A1AA", fontSize: "14px", border: "none",
                }}
              >
                <X style={{ width: "14px", height: "14px" }} />
              </button>
            </div>
          </div>

          {/* Enrichment result banner */}
          {enrichResult && (
            <div style={{ margin: "12px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: "8px", background: "rgba(249,115,22,0.1)", padding: "8px 12px", fontSize: "12px", color: "#F97316" }}>
              <span>{enrichResult}</span>
              <button
                onClick={() => setEnrichResult(null)}
                style={{ marginLeft: "8px", background: "none", border: "none", cursor: "pointer", color: "#F97316", padding: "2px" }}
              >
                <X style={{ width: "12px", height: "12px" }} />
              </button>
            </div>
          )}

          {/* Score section */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #27272A" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#52525B", fontWeight: 600, marginBottom: "10px" }}>
              Score global
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif",
                fontSize: "42px", fontWeight: 800, lineHeight: 1,
                color: getScoreColor(Math.round(selected.overall_score || 0)),
              }}>
                {Math.round(selected.overall_score || 0)}
              </div>
              <div>
                <div style={{ fontSize: "12px", color: "#71717A" }}>/100</div>
                <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontSize: "16px", fontWeight: 700, color: "#FAFAFA" }}>
                      {Math.round(selected.response_rate || 0)}%
                    </div>
                    <div style={{ fontSize: "9px", color: "#52525B" }}>Taux reponse</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontSize: "16px", fontWeight: 700, color: "#FAFAFA" }}>
                      {selected.avg_response_days || 0}j
                    </div>
                    <div style={{ fontSize: "9px", color: "#52525B" }}>Delai moyen</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'Plus Jakarta Sans', var(--font-display), sans-serif", fontSize: "16px", fontWeight: 700, color: "#FAFAFA" }}>
                      {selected.total_offers_received || 0}
                    </div>
                    <div style={{ fontSize: "9px", color: "#52525B" }}>Offres</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Recalculate button */}
            <button
              onClick={() => handleRecalculateScore(selected.id)}
              disabled={recalculating}
              style={{
                marginTop: "8px", background: "none", border: "none", cursor: "pointer",
                color: "#52525B", fontSize: "10px", display: "flex", alignItems: "center", gap: "4px",
                opacity: recalculating ? 0.5 : 1,
              }}
            >
              <RefreshCw style={{ width: "10px", height: "10px" }} className={recalculating ? "animate-spin" : ""} />
              Recalculer
            </button>
          </div>

          {/* Alerts */}
          {historyAlerts.length > 0 && (
            <div style={{ padding: "12px 20px 0" }}>
              {historyAlerts.map((alert, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex", alignItems: "start", gap: "8px", borderRadius: "6px",
                    padding: "8px 10px", fontSize: "11px", marginBottom: "6px",
                    background: alert.severity === "warning" ? "rgba(245,158,11,0.1)" : "rgba(249,115,22,0.1)",
                    color: alert.severity === "warning" ? "#FBBF24" : "#F97316",
                  }}
                >
                  <AlertTriangle style={{ width: "12px", height: "12px", flexShrink: 0, marginTop: "1px" }} />
                  <span>{alert.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Contact section */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #27272A" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#52525B", fontWeight: 600, marginBottom: "10px" }}>
              Contact
            </div>
            {selected.contact_name && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
                <span style={{ fontSize: "14px", width: "20px", textAlign: "center" }}>&#128100;</span>
                <span style={{ fontSize: "12px", color: "#D4D4D8" }}>{selected.contact_name}</span>
              </div>
            )}
            {selected.email && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
                <span style={{ fontSize: "14px", width: "20px", textAlign: "center" }}>&#128231;</span>
                <a href={`mailto:${selected.email}`} style={{ fontSize: "12px", color: "#F97316", textDecoration: "none" }}>
                  {selected.email}
                </a>
              </div>
            )}
            {selected.phone && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
                <span style={{ fontSize: "14px", width: "20px", textAlign: "center" }}>&#128222;</span>
                <span style={{ fontSize: "12px", color: "#D4D4D8" }}>{selected.phone}</span>
              </div>
            )}
            {(selected.address || selected.city) && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
                <span style={{ fontSize: "14px", width: "20px", textAlign: "center" }}>&#128205;</span>
                <span style={{ fontSize: "12px", color: "#D4D4D8" }}>
                  {selected.address}{selected.address && selected.city ? ", " : ""}{selected.postal_code ? selected.postal_code + " " : ""}{selected.city}
                </span>
              </div>
            )}
            {selected.website && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 0" }}>
                <Globe style={{ width: "14px", height: "14px", color: "#71717A", flexShrink: 0 }} />
                <a href={selected.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: "#F97316", textDecoration: "none" }}>
                  {selected.website}
                </a>
              </div>
            )}
          </div>

          {/* Specialties + CFC */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #27272A" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#52525B", fontWeight: 600, marginBottom: "10px" }}>
              Specialites
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {selected.specialties.map((sp) => (
                <span key={sp} style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "5px", background: "#27272A", color: "#D4D4D8" }}>
                  {getSpecialtyLabel(sp)}
                </span>
              ))}
            </div>
            {(selected.cfc_codes || []).length > 0 && (
              <div style={{ marginTop: "8px" }}>
                <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#52525B", fontWeight: 600, marginBottom: "4px" }}>
                  Codes CFC
                </div>
                {selected.cfc_codes.map((code) => (
                  <span key={code} style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "5px", background: "rgba(59,130,246,0.07)", color: "#60A5FA", fontWeight: 500, marginRight: "4px", display: "inline-block" }}>
                    {code}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Certifications */}
          {selected.certifications.length > 0 && (
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #27272A" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#52525B", fontWeight: 600, marginBottom: "10px" }}>
                Certifications
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                {selected.certifications.map((cert) => (
                  <span key={cert} style={{ fontSize: "10px", padding: "3px 8px", borderRadius: "5px", background: "rgba(16,185,129,0.1)", color: "#34D399", fontWeight: 500 }}>
                    {cert}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Price history chart */}
          {priceTrend.length >= 3 && (
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #27272A" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#52525B", fontWeight: 600, marginBottom: "10px" }}>
                Evolution des prix
              </div>
              <SupplierPriceChart data={priceTrend} />
            </div>
          )}

          {/* Interactions timeline */}
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #27272A" }}>
            <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#52525B", fontWeight: 600, marginBottom: "10px" }}>
              Interactions recentes
            </div>
            {historyLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: "16px 0" }}>
                <Loader2 className="animate-spin" style={{ width: "20px", height: "20px", color: "#71717A" }} />
              </div>
            ) : historyItems.length > 0 ? (
              <>
                {historyItems.slice(0, 5).map((item, idx) => {
                  const projectName = (item.meta as Record<string, unknown>)?.project_name as string | undefined;
                  return (
                    <div key={item.id || idx} style={{ display: "flex", gap: "8px", padding: "6px 0", borderBottom: idx < Math.min(historyItems.length, 5) - 1 ? "1px solid #27272A" : "none" }}>
                      <div style={{
                        width: "6px", height: "6px", borderRadius: "50%", marginTop: "5px", flexShrink: 0,
                        background: item.type === "offer" ? "#34D399" : item.type === "request" ? "#3B82F6" : "#F59E0B",
                      }} />
                      <div>
                        <div style={{ fontSize: "11px", color: "#D4D4D8" }}>{item.description}</div>
                        <div style={{ fontSize: "10px", color: "#52525B" }}>
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
                    style={{ fontSize: "10px", color: "#F97316", background: "none", border: "none", cursor: "pointer", marginTop: "6px", padding: 0 }}
                  >
                    Voir plus...
                  </button>
                )}
              </>
            ) : (
              <p style={{ fontSize: "11px", color: "#52525B", padding: "8px 0" }}>Aucune interaction</p>
            )}
          </div>

          {/* Notes */}
          {selected.notes && (
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #27272A" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", color: "#52525B", fontWeight: 600, marginBottom: "10px" }}>
                Notes
              </div>
              <p style={{ fontSize: "12px", color: "#A1A1AA", lineHeight: "1.5" }}>{selected.notes}</p>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ padding: "16px 20px", display: "flex", gap: "8px" }}>
            {selected.email && (
              <a
                href={`mailto:${selected.email}`}
                style={{
                  flex: 1, fontSize: "11px", padding: "8px", borderRadius: "7px",
                  border: "1px solid transparent", background: "linear-gradient(135deg, #F97316, #EA580C)",
                  color: "white", cursor: "pointer", textAlign: "center", fontWeight: 500,
                  textDecoration: "none", display: "block",
                }}
              >
                &#128231; Contacter
              </a>
            )}
            <button
              style={{
                flex: 1, fontSize: "11px", padding: "8px", borderRadius: "7px",
                border: "1px solid #3F3F46", background: "#27272A",
                color: "#D4D4D8", cursor: "pointer", textAlign: "center", fontWeight: 500,
              }}
              onClick={() => {
                // Navigate to submissions or trigger price request flow
              }}
            >
              &#128203; Demande de prix
            </button>
            <button
              onClick={() => handleEnrich(selected)}
              disabled={enriching}
              style={{
                flex: 1, fontSize: "11px", padding: "8px", borderRadius: "7px",
                border: "1px solid #3F3F46", background: "#27272A",
                color: "#D4D4D8", cursor: "pointer", textAlign: "center", fontWeight: 500,
                opacity: enriching ? 0.5 : 1,
              }}
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
