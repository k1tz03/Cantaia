"use client";

import React, { useState, useMemo, useCallback } from "react";
import {
  Loader2,
  Download,
  Database,
  ChevronRight,
  Upload,
} from "lucide-react";
import { cn } from "@cantaia/ui";
import { formatCHF, formatDate, Tab } from "./types";

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
  const [benchmarkSearch, setBenchmarkSearch] = useState("");
  const [benchmarkProjectFilter, setBenchmarkProjectFilter] = useState<string>("");
  const [expandedBenchmarkItem, setExpandedBenchmarkItem] = useState<string | null>(null);

  // Filtered benchmark data
  const filteredBenchmark = useMemo(() => {
    if (!benchmarkSearch.trim()) return benchmarkData;
    const q = benchmarkSearch.toLowerCase();
    return benchmarkData.filter((item: any) =>
      (item.display_description || "").toLowerCase().includes(q) ||
      (item.cfc_subcode || "").toLowerCase().includes(q) ||
      (item.normalized_key || "").includes(q)
    );
  }, [benchmarkData, benchmarkSearch]);

  const handleExportCSV = useCallback(() => {
    const header = "Poste;CFC;Unité;Min;Médiane;Max;Écart (%);Données\n";
    const rows = filteredBenchmark.map((item: any) =>
      `"${item.display_description}";${item.cfc_subcode || ""};${item.unit_normalized};${item.min_unit_price.toFixed(2)};${item.median_unit_price.toFixed(2)};${item.max_unit_price.toFixed(2)};${item.price_spread_percent};${item.data_points}`
    ).join("\n");
    const csv = header + rows;
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cantaia-benchmark-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredBenchmark]);

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
                <p className="text-lg font-bold text-slate-900">{benchmarkSummary.total_items}</p>
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
                <p className="text-lg font-bold text-slate-900">{benchmarkSummary.avg_spread_percent}%</p>
                <p className="text-[10px] text-slate-500">Écart moyen</p>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={benchmarkSearch}
              onChange={(e) => setBenchmarkSearch(e.target.value)}
              placeholder="Rechercher un poste…"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 w-64"
            />
            <select
              value={benchmarkProjectFilter}
              onChange={(e) => {
                setBenchmarkProjectFilter(e.target.value);
                loadBenchmark(e.target.value || undefined);
              }}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700"
            >
              <option value="">Tous les projets</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
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

          {/* Comparison table */}
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] uppercase text-slate-400">
                  <th className="px-3 py-2 text-left font-semibold">Poste</th>
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
                {filteredBenchmark.map((item: any) => (
                  <React.Fragment key={item.normalized_key}>
                    <tr
                      className="cursor-pointer transition-colors hover:bg-slate-50/50"
                      onClick={() => setExpandedBenchmarkItem(
                        expandedBenchmarkItem === item.normalized_key ? null : item.normalized_key
                      )}
                    >
                      <td className="px-3 py-2.5 text-slate-700 max-w-xs truncate">
                        <ChevronRight className={cn(
                          "inline h-3.5 w-3.5 mr-1 text-slate-400 transition-transform",
                          expandedBenchmarkItem === item.normalized_key && "rotate-90"
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
                          item.price_spread_percent > 50
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
                    {/* Expanded detail */}
                    {expandedBenchmarkItem === item.normalized_key && (
                      <tr>
                        <td colSpan={8} className="bg-slate-50/50 px-6 py-3">
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
                              {item.suppliers
                                .sort((a: any, b: any) => a.unit_price - b.unit_price)
                                .map((s: any, idx: number) => (
                                <tr key={idx}>
                                  <td className="py-1.5 text-slate-700">{s.supplier_name}</td>
                                  <td className="py-1.5 text-right font-mono font-medium text-slate-900">{formatCHF(s.unit_price)}</td>
                                  <td className="py-1.5 text-slate-500">{s.project_name || "—"}</td>
                                  <td className="py-1.5 text-slate-400">{s.received_at ? formatDate(s.received_at) : "—"}</td>
                                </tr>
                              ))}
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
        </>
      )}
    </div>
  );
}
