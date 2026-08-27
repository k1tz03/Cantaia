"use client";

import { useState, useMemo, useCallback } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { RefreshCw, AlertTriangle, BarChart3 } from "lucide-react";
// Sous-chemin direct, PAS le barrel "@cantaia/core/pricing" : celui-ci
// réexporte file-price-extractor/email-price-extractor qui tirent mailparser
// (node:buffer, node:stream) — non bundlable dans un composant client.
// monte-carlo.ts est du calcul pur, sans aucun import.
import { runCorrelatedMonteCarlo } from "@cantaia/core/pricing/monte-carlo";

// ── Types ──────────────────────────────────────────────────────

export interface MonteCarloItem {
  item_id?: string;
  item_number?: string | null;
  description: string;
  prix_median: number;
  prix_min: number;
  prix_max: number;
  quantity: number | null;
  source: string;
  variance?: {
    std_dev_prix: number;
    std_dev_quantite: number;
  };
  market_benchmark?: {
    p25: number;
    p75: number;
  };
}

// ── Format helpers ─────────────────────────────────────────────

function formatCompactCHF(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return n.toFixed(0);
}

function formatFullCHF(n: number): string {
  return n.toLocaleString("fr-CH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Custom tooltip ─────────────────────────────────────────────

function HistogramTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-[#0F0F11] border border-[#27272A] rounded-lg shadow-lg px-3 py-2 text-xs">
      <div className="font-medium text-[#FAFAFA]">CHF {formatFullCHF(data.bin)}</div>
      <div className="text-[#A1A1AA]">{data.count.toLocaleString("fr-CH")} simulations</div>
    </div>
  );
}

// ── Source label ────────────────────────────────────────────────

function sourceLabel(source: string): string {
  switch (source) {
    case "historique_interne":
      return "Fournisseur";
    case "referentiel_crb":
      return "CRB";
    case "benchmark_cantaia":
      return "Marche";
    case "estimation_ia":
      return "IA";
    case "non_estime":
      return "Non estime";
    default:
      return source;
  }
}

function sourceBadgeClass(source: string): string {
  switch (source) {
    case "historique_interne":
      return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "referentiel_crb":
      return "bg-green-500/10 text-green-700 dark:text-green-400";
    case "benchmark_cantaia":
      return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
    case "estimation_ia":
      return "bg-[#F97316]/10 text-[#F97316]";
    default:
      return "bg-[#27272A] text-[#A1A1AA]";
  }
}

// ── Main component ─────────────────────────────────────────────

interface MonteCarloChartProps {
  items: MonteCarloItem[];
}

export default function MonteCarloChart({ items }: MonteCarloChartProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [seed, setSeed] = useState(0);

  // Simulation corrélée (facteur de marché commun ρ≈0.4) — les tirages
  // indépendants sous-estimaient P80/P95 (queue de distribution écrasée).
  // Le `seed` (incrémenté par « Recalculer ») rend chaque run déterministe.
  const result = useMemo(() => runCorrelatedMonteCarlo(items, { seed }), [items, seed]);

  const handleRecalculate = useCallback(() => {
    setSeed((s) => s + 1);
  }, []);

  if (items.length === 0 || result.histogram.length === 0) {
    return null;
  }

  // Determine bin indices for coloring (before P50 = blue, P50-P80 = amber, P80-P95 = red-ish, after = red)
  const coloredHistogram = result.histogram.map((d) => {
    let fill = "#3B82F6"; // blue-500 default
    if (d.bin > result.p95) fill = "#EF4444"; // red-500
    else if (d.bin > result.p80) fill = "#F59E0B"; // amber-500
    else if (d.bin > result.p50) fill = "#3B82F6"; // blue-500
    return { ...d, fill };
  });

  return (
    <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full px-4 py-3 flex items-center justify-between bg-[#27272A] hover:bg-[#27272A] transition-colors"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-brand" />
          <span className="text-sm font-medium text-[#FAFAFA]">Simulation Monte Carlo</span>
          <span className="text-xs text-[#A1A1AA]">(10 000 scenarios)</span>
        </div>
        <svg
          className={`h-4 w-4 text-[#A1A1AA] transition-transform ${collapsed ? "" : "rotate-180"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="p-4 space-y-5">
          {/* Chart */}
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={coloredHistogram} margin={{ top: 5, right: 20, bottom: 20, left: 20 }}>
                <defs>
                  <linearGradient id="mcGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="bin"
                  tickFormatter={formatCompactCHF}
                  tick={{ fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  className="fill-muted-foreground"
                />
                <YAxis hide />
                <Tooltip content={<HistogramTooltip />} />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#3B82F6"
                  strokeWidth={1.5}
                  fill="url(#mcGrad)"
                />
                <ReferenceLine
                  x={result.p50}
                  stroke="#3B82F6"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  label={{
                    value: "P50",
                    position: "top",
                    fill: "#3B82F6",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
                <ReferenceLine
                  x={result.p80}
                  stroke="#F59E0B"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  label={{
                    value: "P80",
                    position: "top",
                    fill: "#F59E0B",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
                <ReferenceLine
                  x={result.p95}
                  stroke="#EF4444"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  label={{
                    value: "P95",
                    position: "top",
                    fill: "#EF4444",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-lg border border-[#27272A] bg-[#27272A]/50 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-[#A1A1AA] mb-1">P10 (optimiste)</div>
              <div className="text-sm font-semibold text-[#A1A1AA]">CHF {formatFullCHF(Math.round(result.p10))}</div>
            </div>
            <div className="rounded-lg border border-[#F97316]/20 bg-[#F97316]/10 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-blue-400 mb-1">P50 (mediane)</div>
              <div className="text-sm font-bold text-[#F97316]">CHF {formatFullCHF(Math.round(result.p50))}</div>
            </div>
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-500/10 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-amber-500 mb-1">P80 (prudent)</div>
              <div className="text-sm font-bold text-amber-700 dark:text-amber-400">CHF {formatFullCHF(Math.round(result.p80))}</div>
            </div>
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-500/10 p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1">P95 (worst case)</div>
              <div className="text-sm font-bold text-red-600">CHF {formatFullCHF(Math.round(result.p95))}</div>
            </div>
          </div>

          {/* Top uncertainty contributors */}
          {result.topContributors.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-medium text-[#FAFAFA]">Principaux facteurs d&apos;incertitude</span>
              </div>
              <div className="space-y-1.5">
                {result.topContributors.map((c, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-[#A1A1AA] font-mono w-4">{i + 1}.</span>
                    <span className="text-[#FAFAFA] truncate flex-1" title={c.description}>
                      {c.description.length > 60 ? c.description.slice(0, 57) + "..." : c.description}
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceBadgeClass(c.source)}`}>
                      {sourceLabel(c.source)}
                    </span>
                    <div className="w-24 flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-[#27272A] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${Math.min(c.percentOfTotal, 100)}%` }}
                        />
                      </div>
                      <span className="text-[#A1A1AA] font-medium w-10 text-right">{c.percentOfTotal.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recalculate button + stats */}
          <div className="flex items-center justify-between pt-2 border-t border-[#27272A]">
            <div className="text-[10px] text-[#A1A1AA]">
              Ecart-type: CHF {formatFullCHF(Math.round(result.stdDev))} | Moyenne: CHF {formatFullCHF(Math.round(result.mean))}
            </div>
            <button
              onClick={handleRecalculate}
              className="text-xs text-[#A1A1AA] hover:text-brand flex items-center gap-1 px-2 py-1 rounded hover:bg-[#27272A] transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
              Recalculer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
