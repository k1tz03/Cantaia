"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  TrendingUp,
  TrendingDown,
  Search,
  AlertTriangle,
  CheckCircle,
  Building2,
  BarChart3,
} from "lucide-react";
import type { PricingAlert, Supplier, OfferLineItem, Project } from "@cantaia/database";

// Data will come from Supabase — empty arrays until wired
const mockPricingAlerts: PricingAlert[] = [];
const mockSuppliers: Supplier[] = [];
const mockOfferLineItems: OfferLineItem[] = [];
const mockProjects: Project[] = [];

// Benchmark data will come from Supabase — empty array until wired
const BENCHMARK_DATA: any[] = [];

// Top suppliers data will come from Supabase — empty array until wired
const TOP_SUPPLIERS: any[] = [];

export default function PricingIntelligencePage() {
  const t = useTranslations("pricing");
  const tSub = useTranslations("submissions");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"alerts" | "benchmark" | "suppliers">("alerts");

  const activeAlerts = mockPricingAlerts.filter((a) => a.status === "active");

  const filteredBenchmark = useMemo(() => {
    if (!search) return BENCHMARK_DATA;
    const q = search.toLowerCase();
    return BENCHMARK_DATA.filter((b) => b.item.toLowerCase().includes(q) || b.cfc.includes(q));
  }, [search]);

  const totalPricePoints = mockOfferLineItems.length;
  const totalProjects = mockProjects.filter((p) => p.status === "active" || p.status === "completed").length;
  const totalSuppliers = mockSuppliers.length;

  function formatCHF(amount: number): string {
    if (amount < 10) return amount.toFixed(2) + " CHF";
    return new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount) + " CHF";
  }

  return (
    <div className="p-6 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("subtitle", { prices: totalPricePoints, projects: totalProjects, suppliers: totalSuppliers })}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setTab("alerts")}
          className={`px-4 py-2 text-sm font-medium rounded-md ${tab === "alerts" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
        >
          <AlertTriangle className="h-3.5 w-3.5 inline mr-1.5" />
          {t("activeAlerts")} ({activeAlerts.length})
        </button>
        <button
          onClick={() => setTab("benchmark")}
          className={`px-4 py-2 text-sm font-medium rounded-md ${tab === "benchmark" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
        >
          <BarChart3 className="h-3.5 w-3.5 inline mr-1.5" />
          {t("benchmark")}
        </button>
        <button
          onClick={() => setTab("suppliers")}
          className={`px-4 py-2 text-sm font-medium rounded-md ${tab === "suppliers" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
        >
          <Building2 className="h-3.5 w-3.5 inline mr-1.5" />
          {t("topSuppliers")}
        </button>
      </div>

      {/* Alerts tab */}
      {tab === "alerts" && (
        <div className="space-y-3">
          {activeAlerts.length === 0 ? (
            <div className="text-center py-16 bg-white border border-gray-200 rounded-lg">
              <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-3" />
              <h3 className="text-sm font-medium text-gray-900">{t("noAlerts")}</h3>
              <p className="text-xs text-gray-500 mt-1">{t("noAlertsDesc")}</p>
            </div>
          ) : (
            activeAlerts.map((alert) => {
              const severityColors = {
                critical: "border-l-red-500 bg-red-50/50",
                warning: "border-l-amber-500 bg-amber-50/50",
                info: "border-l-blue-500 bg-blue-50/50",
              };
              return (
                <div key={alert.id} className={`bg-white border border-gray-200 border-l-4 rounded-lg p-4 ${severityColors[alert.severity]}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-sm font-medium text-gray-900">{alert.title}</h4>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          alert.severity === "critical" ? "bg-red-100 text-red-700" :
                          alert.severity === "warning" ? "bg-amber-100 text-amber-700" :
                          "bg-blue-100 text-blue-700"
                        }`}>
                          {alert.severity}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{alert.message}</p>
                      {alert.suggested_action && (
                        <p className="text-xs text-gray-500 mt-2 italic">{alert.suggested_action}</p>
                      )}
                    </div>
                    <div className="text-right ml-4 flex-shrink-0">
                      {alert.difference_percent !== null && alert.difference_percent !== undefined && (
                        <div className={`text-lg font-bold ${alert.difference_percent > 0 ? "text-red-600" : "text-green-600"}`}>
                          {alert.difference_percent > 0 ? "+" : ""}{alert.difference_percent}%
                        </div>
                      )}
                      {alert.financial_impact && (
                        <div className="text-xs text-gray-500">
                          {alert.financial_impact > 0 ? "+" : ""}{formatCHF(alert.financial_impact)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button className="text-xs px-3 py-1.5 bg-[#1E3A5F] text-white rounded-md hover:bg-[#162d4a]">
                      {tSub("renegotiate")}
                    </button>
                    <button className="text-xs px-3 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">
                      {tSub("useAsReference")}
                    </button>
                    <button className="text-xs px-3 py-1.5 text-gray-400 hover:text-gray-600">
                      {tSub("dismiss")}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Benchmark tab */}
      {tab === "benchmark" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchItem")}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm bg-white"
            />
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Poste</th>
                  <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">CFC</th>
                  <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">{tSub("unit")}</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">{t("min")}</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">{t("median")}</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">{t("max")}</th>
                  <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">{t("trend")}</th>
                  <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">N</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredBenchmark.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{row.item}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-xs font-mono bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{row.cfc}</span>
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-gray-500">{row.unit}</td>
                    <td className="px-3 py-3 text-right text-sm text-green-600 font-medium">{formatCHF(row.min)}</td>
                    <td className="px-3 py-3 text-right text-sm text-gray-700 font-medium">{formatCHF(row.median)}</td>
                    <td className="px-3 py-3 text-right text-sm text-red-600 font-medium">{formatCHF(row.max)}</td>
                    <td className="px-3 py-3 text-right">
                      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${
                        row.trend > 0 ? "text-red-600" : row.trend < 0 ? "text-green-600" : "text-gray-500"
                      }`}>
                        {row.trend > 0 ? <TrendingUp className="h-3 w-3" /> : row.trend < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                        {row.trend > 0 ? "+" : ""}{row.trend}%
                      </span>
                      <span className="text-[10px] text-gray-400 ml-1">{t("perSixMonths")}</span>
                    </td>
                    <td className="px-3 py-3 text-center text-xs text-gray-400">{row.dataPoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Suppliers tab */}
      {tab === "suppliers" && (
        <div className="space-y-3">
          {TOP_SUPPLIERS.map((sup, idx) => {
            const supplier = mockSuppliers.find((s) => s.id === sup.id);
            return (
              <div key={sup.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-6">
                <div className="flex items-center gap-3 w-8">
                  <span className={`text-lg font-bold ${idx === 0 ? "text-amber-500" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-amber-700" : "text-gray-300"}`}>
                    #{idx + 1}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">{sup.name}</span>
                    {supplier?.status === "preferred" && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Preferred</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {supplier?.geo_zone} · {supplier?.specialties.slice(0, 3).join(", ")}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-6 text-center flex-shrink-0">
                  <div>
                    <div className="text-lg font-bold text-gray-900">{sup.score}</div>
                    <div className="text-[10px] text-gray-500">Score</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-blue-600">{sup.competitiveness}%</div>
                    <div className="text-[10px] text-gray-500">Prix</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-green-600">{sup.responseRate}%</div>
                    <div className="text-[10px] text-gray-500">Réponse</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-700">{sup.projects}</div>
                    <div className="text-[10px] text-gray-500">Projets</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
