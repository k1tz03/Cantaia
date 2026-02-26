"use client";

import { useState, useMemo } from "react";
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
} from "lucide-react";
import { SPECIALTY_LABELS, type SupplierSpecialty } from "@cantaia/core/suppliers";

// Data will come from Supabase — empty arrays until wired
import type { Supplier, SupplierStatus } from "@cantaia/database";
const mockSuppliers: Supplier[] = [];

const STATUS_CONFIG: Record<SupplierStatus, { color: string; dotColor: string }> = {
  active: { color: "text-green-700 bg-green-50", dotColor: "bg-green-500" },
  preferred: { color: "text-blue-700 bg-blue-50", dotColor: "bg-blue-500" },
  blacklisted: { color: "text-red-700 bg-red-50", dotColor: "bg-red-500" },
  inactive: { color: "text-gray-500 bg-gray-100", dotColor: "bg-gray-400" },
  new: { color: "text-amber-700 bg-amber-50", dotColor: "bg-amber-500" },
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
  const [search, setSearch] = useState("");
  const [filterSpecialty, setFilterSpecialty] = useState<string>("");
  const [filterZone, setFilterZone] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return mockSuppliers.filter((s) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !s.company_name.toLowerCase().includes(q) &&
          !(s.email || "").toLowerCase().includes(q) &&
          !(s.contact_name || "").toLowerCase().includes(q) &&
          !(s.city || "").toLowerCase().includes(q)
        ) return false;
      }
      if (filterSpecialty && !s.specialties.includes(filterSpecialty)) return false;
      if (filterZone && s.geo_zone !== filterZone) return false;
      if (filterStatus && s.status !== filterStatus) return false;
      return true;
    });
  }, [search, filterSpecialty, filterZone, filterStatus]);

  const selected = selectedSupplier ? mockSuppliers.find((s) => s.id === selectedSupplier) : null;

  // Unique specialties and zones from data
  const allSpecialties = useMemo(() => {
    const set = new Set<string>();
    mockSuppliers.forEach((s) => s.specialties.forEach((sp) => set.add(sp)));
    return Array.from(set).sort();
  }, []);

  const allZones = useMemo(() => {
    const set = new Set<string>();
    mockSuppliers.forEach((s) => { if (s.geo_zone) set.add(s.geo_zone); });
    return Array.from(set).sort();
  }, []);

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

  return (
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
            <button className="flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white rounded-md hover:bg-[#162d4a] text-sm font-medium">
              <Plus className="h-4 w-4" />
              {t("addSupplier")}
            </button>
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
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                <Building2 className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">{t("noSuppliers")}</h3>
              <p className="text-sm text-gray-500 max-w-sm">{t("noSuppliersDesc")}</p>
              <button className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#1E3A5F] text-white rounded-md text-sm">
                <Plus className="h-4 w-4" />
                {t("addFirst")}
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t("companyName")}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t("specialties")}</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t("geoZone")}</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t("score")}</th>
                    <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">{t("responseRate")}</th>
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
                            <div className="h-9 w-9 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-xs font-medium shrink-0">
                              {supplier.company_name.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-900">{supplier.company_name}</div>
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
                        <td className="px-4 py-3 text-sm text-gray-600">{supplier.geo_zone || "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-semibold ${getScoreColor(supplier.overall_score)}`}>
                            {Math.round(supplier.overall_score)}
                          </span>
                          <span className="text-xs text-gray-400">/100</span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm text-gray-600">
                          {Math.round(supplier.response_rate)}%
                        </td>
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
        <div className="w-[400px] bg-white overflow-auto shrink-0">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-sm font-medium">
                  {selected.company_name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{selected.company_name}</h2>
                  <p className="text-sm text-gray-500">{selected.contact_name}</p>
                </div>
              </div>
              <button onClick={() => setSelectedSupplier(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            {/* Score */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">{t("overallScore")}</span>
                <span className={`text-2xl font-bold ${getScoreColor(selected.overall_score)}`}>
                  {Math.round(selected.overall_score)}
                  <span className="text-sm text-gray-400 font-normal">/100</span>
                </span>
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
  );
}
