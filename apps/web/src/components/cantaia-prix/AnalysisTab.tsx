"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Loader2,
  Download,
  Database,
  ChevronRight,
  Upload,
  Search,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import { formatCHF, formatDate, Tab } from "./types";

const CFC_LABELS: Record<string, string> = {
  "111": "Démolition",
  "151": "Transport / Grue",
  "211": "Terrassement",
  "214": "Fondations / Béton maigre",
  "215": "Béton armé",
  "216": "Maçonnerie",
  "221": "Fenêtres",
  "222": "Serrurerie / Métal",
  "224": "Isolation",
  "225": "Étanchéité",
  "227": "Toiture",
  "232": "Électricité",
  "241": "Chauffage",
  "242": "Ventilation",
  "251": "Sanitaire",
  "271": "Chapes",
  "273": "Carrelage",
  "274": "Parquet",
  "275": "Peinture",
  "281": "Menuiserie",
  "291": "Essais / Laboratoire",
  "421": "Aménagements extérieurs",
  "422": "Mobilier urbain / Jeux",
  "423": "Clôtures / Abris",
};

function getCfcPrefix(code: string | null | undefined): string {
  if (!code) return "";
  return code.split(".")[0] || "";
}

interface CfcGroup {
  cfc: string;
  label: string;
  items: any[];
  totalDataPoints: number;
}

interface AnalysisTabProps {
  benchmarkData: any[];
  benchmarkSummary: any | null;
  benchmarkLoading: boolean;
  projects: { id: string; name: string }[];
  loadBenchmark: (projectFilter?: string) => void;
  setActiveTab: (tab: Tab) => void;
}

export function AnalysisTab({
  benchmarkData,
  benchmarkSummary,
  benchmarkLoading,
  projects,
  loadBenchmark,
  setActiveTab,
}: AnalysisTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("");
  const [unitFilter, setUnitFilter] = useState<string>("");
  const [expandedCfc, setExpandedCfc] = useState<Set<string>>(new Set());
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Available units for filter
  const availableUnits = useMemo(() => {
    const units = new Set<string>();
    for (const item of benchmarkData) {
      if (item.unit_normalized) units.add(item.unit_normalized);
    }
    return [...units].sort();
  }, [benchmarkData]);

  // Group by CFC, then filter
  const cfcGroups = useMemo<CfcGroup[]>(() => {
    // Filter items
    let items = benchmarkData;
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      items = items.filter((item: any) =>
        (item.display_description || "").toLowerCase().includes(q) ||
        (item.cfc_subcode || "").toLowerCase().includes(q) ||
        (item.normalized_key || "").includes(q)
      );
    }
    if (unitFilter) {
      items = items.filter((item: any) => item.unit_normalized === unitFilter);
    }

    // Group by CFC prefix
    const map = new Map<string, any[]>();
    for (const item of items) {
      const cfc = getCfcPrefix(item.cfc_subcode) || "zzz";
      if (!map.has(cfc)) map.set(cfc, []);
      map.get(cfc)!.push(item);
    }

    // Build sorted groups
    const groups: CfcGroup[] = [];
    const sortedKeys = [...map.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    for (const cfc of sortedKeys) {
      const groupItems = map.get(cfc)!;
      groups.push({
        cfc: cfc === "zzz" ? "" : cfc,
        label: cfc === "zzz" ? "Non classifié" : (CFC_LABELS[cfc] || `CFC ${cfc}`),
        items: groupItems.sort((a: any, b: any) =>
          (a.display_description || "").localeCompare(b.display_description || "")
        ),
        totalDataPoints: groupItems.reduce((s: number, i: any) => s + (i.data_points || 0), 0),
      });
    }

    return groups;
  }, [benchmarkData, searchQuery, unitFilter]);

  // Stats
  const totalPostes = cfcGroups.reduce((s, g) => s + g.items.length, 0);

  // Auto-expand when search matches few groups
  const effectiveExpanded = useMemo(() => {
    if (searchQuery.trim() && cfcGroups.length <= 5) {
      return new Set(cfcGroups.map((g) => g.cfc || "zzz"));
    }
    return expandedCfc;
  }, [searchQuery, cfcGroups, expandedCfc]);

  const toggleCfc = (cfc: string) => {
    setExpandedCfc((prev) => {
      const next = new Set(prev);
      const key = cfc || "zzz";
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExportCSV = useCallback(() => {
    const allItems = cfcGroups.flatMap((g) => g.items);
    const header = "CFC;Poste;Unité;Min;Médiane;Max;Écart (%);N\n";
    const rows = allItems.map((item: any) =>
      `${item.cfc_subcode || ""};"${item.display_description}";${item.unit_normalized};${item.min_unit_price?.toFixed(2) ?? ""};${item.median_unit_price?.toFixed(2) ?? ""};${item.max_unit_price?.toFixed(2) ?? ""};${item.price_spread_percent ?? ""};${item.data_points ?? ""}`
    ).join("\n");
    const csv = header + rows;
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cantaia-benchmark-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [cfcGroups]);

  return (
    <div className="space-y-4">
      {benchmarkLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
          <span className="ml-2 text-sm text-slate-500">Chargement des données…</span>
        </div>
      ) : benchmarkData.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-12">
          <Database className="h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-medium text-slate-600">Aucune donnée de prix</h3>
          <p className="mt-1 max-w-sm text-center text-xs text-slate-400">
            Importez des fichiers fournisseurs pour alimenter la base de benchmark.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab("import")}
            className="mt-4 inline-flex items-center gap-1 text-xs text-brand hover:underline"
          >
            <Upload className="h-3.5 w-3.5" />
            Importer des fichiers
          </button>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {benchmarkSummary && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-lg font-bold text-slate-900">{totalPostes}</p>
                <p className="text-[10px] text-slate-500">Postes distincts</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-lg font-bold text-slate-900">{benchmarkSummary.total_data_points}</p>
                <p className="text-[10px] text-slate-500">Points de données</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-lg font-bold text-slate-900">{benchmarkSummary.total_suppliers}</p>
                <p className="text-[10px] text-slate-500">Fournisseurs</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-center">
                <p className="text-lg font-bold text-slate-900">{benchmarkSummary.total_cfc_categories || cfcGroups.length}</p>
                <p className="text-[10px] text-slate-500">Catégories CFC</p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Rechercher un poste ou code CFC…"
                className="w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400"
              />
            </div>
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                loadBenchmark(e.target.value || undefined);
              }}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="">Tous les projets</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={unitFilter}
              onChange={(e) => setUnitFilter(e.target.value)}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="">Toutes unités</option>
              {availableUnits.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </div>

          {/* CFC Accordion */}
          <div className="space-y-2">
            {cfcGroups.map((group) => {
              const cfcKey = group.cfc || "zzz";
              const isOpen = effectiveExpanded.has(cfcKey);

              return (
                <div key={cfcKey} className="rounded-lg border border-slate-200 bg-white overflow-hidden">
                  {/* CFC Header */}
                  <button
                    type="button"
                    onClick={() => toggleCfc(group.cfc)}
                    className="flex w-full items-center gap-3 bg-gray-50 border-l-4 border-blue-500 px-4 py-3 text-left hover:bg-gray-100 transition-colors"
                  >
                    <ChevronRight className={cn(
                      "h-4 w-4 text-slate-400 transition-transform shrink-0",
                      isOpen && "rotate-90"
                    )} />
                    {group.cfc && (
                      <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-[11px] font-medium text-blue-700 shrink-0">
                        CFC {group.cfc}
                      </span>
                    )}
                    <span className="text-sm font-medium text-slate-800">{group.label}</span>
                    <span className="ml-auto text-xs text-slate-400 shrink-0">
                      {group.items.length} poste{group.items.length > 1 ? "s" : ""}
                    </span>
                  </button>

                  {/* Table inside CFC group */}
                  {isOpen && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-t border-slate-100 bg-slate-50/50 text-[10px] uppercase text-slate-400">
                            <th className="px-4 py-2 text-left font-semibold">Poste</th>
                            <th className="px-3 py-2 text-center font-semibold">CFC</th>
                            <th className="px-3 py-2 text-center font-semibold">Unité</th>
                            <th className="px-3 py-2 text-right font-semibold">Min</th>
                            <th className="px-3 py-2 text-right font-semibold">Médiane</th>
                            <th className="px-3 py-2 text-right font-semibold">Max</th>
                            <th className="px-3 py-2 text-center font-semibold">Écart</th>
                            <th className="px-3 py-2 text-center font-semibold">N</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {group.items.map((item: any) => (
                            <React.Fragment key={item.normalized_key}>
                              <tr
                                className="cursor-pointer transition-colors hover:bg-slate-50/50"
                                onClick={() => setExpandedItem(
                                  expandedItem === item.normalized_key ? null : item.normalized_key
                                )}
                              >
                                <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">
                                  <ChevronRight className={cn(
                                    "inline h-3.5 w-3.5 mr-1 text-slate-400 transition-transform",
                                    expandedItem === item.normalized_key && "rotate-90"
                                  )} />
                                  {item.display_description}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  {item.cfc_subcode ? (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px]">{item.cfc_subcode}</span>
                                  ) : "—"}
                                </td>
                                <td className="px-3 py-2.5 text-center text-xs text-slate-500">{item.unit_normalized || "—"}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-green-700">{formatCHF(item.min_unit_price)}</td>
                                <td className="px-3 py-2.5 text-right font-mono font-medium text-slate-900">{formatCHF(item.median_unit_price)}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-red-600">{formatCHF(item.max_unit_price)}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className={cn(
                                    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                                    item.data_points < 3
                                      ? "bg-gray-50 text-gray-400"
                                      : item.price_spread_percent > 50
                                      ? "bg-amber-50 text-amber-700"
                                      : item.price_spread_percent > 20
                                      ? "bg-blue-50 text-blue-700"
                                      : "bg-green-50 text-green-700"
                                  )}>
                                    {item.price_spread_percent}%
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-center text-xs text-slate-500">{item.data_points}</td>
                              </tr>
                              {/* Expanded supplier detail */}
                              {expandedItem === item.normalized_key && item.suppliers && (
                                <tr>
                                  <td colSpan={8} className="bg-gray-50 pl-8 pr-4 py-3">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-[10px] uppercase text-slate-400">
                                          <th className="pb-1 text-left font-semibold">Fournisseur</th>
                                          <th className="pb-1 text-right font-semibold">PU (CHF)</th>
                                          <th className="pb-1 text-left font-semibold">Projet</th>
                                          <th className="pb-1 text-left font-semibold">Date</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                        {[...item.suppliers]
                                          .sort((a: any, b: any) => a.unit_price - b.unit_price)
                                          .map((s: any, idx: number) => {
                                            const isBest = idx === 0 && item.suppliers.length >= 2;
                                            return (
                                              <tr key={idx}>
                                                <td className="py-1.5 text-slate-700">
                                                  {s.supplier_name}
                                                  {isBest && (
                                                    <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                                                      ★ Meilleur
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="py-1.5 text-right font-mono font-medium text-slate-900">{formatCHF(s.unit_price)}</td>
                                                <td className="py-1.5 text-slate-500">{s.project_name || "—"}</td>
                                                <td className="py-1.5 text-slate-400">{s.received_at ? formatDate(s.received_at) : "—"}</td>
                                              </tr>
                                            );
                                          })}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
