"use client";

import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChevronDown } from "lucide-react";

export interface PriceTrendPoint {
  date: string;
  avg_price: number;
  cfc_group: string;
}

interface SupplierPriceChartProps {
  data: PriceTrendPoint[];
}

// Color palette for CFC groups
const CFC_COLORS = [
  "#2563EB", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#EF4444", // red
];

function formatMonthLabel(dateStr: string): string {
  try {
    const [year, month] = dateStr.split("-");
    const monthNames = ["jan", "fév", "mar", "avr", "mai", "jun", "jul", "aoû", "sep", "oct", "nov", "déc"];
    return `${monthNames[parseInt(month) - 1]} ${year.slice(2)}`;
  } catch {
    return dateStr;
  }
}

export function SupplierPriceChart({ data }: SupplierPriceChartProps) {
  const [expanded, setExpanded] = useState(true);

  if (!data || data.length < 3) return null;

  // Get unique CFC groups
  const cfcGroups = [...new Set(data.map((d) => d.cfc_group))];
  const showMultipleLines = cfcGroups.length > 1 && cfcGroups.length <= 7;

  // Pivot data for Recharts: { date, [cfcGroup]: avg_price, ... }
  let chartData: Record<string, unknown>[];

  if (showMultipleLines) {
    const byDate: Record<string, Record<string, number>> = {};
    for (const point of data) {
      if (!byDate[point.date]) byDate[point.date] = {};
      byDate[point.date][point.cfc_group] = point.avg_price;
    }
    chartData = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date,
        label: formatMonthLabel(date),
        ...values,
      }));
  } else {
    // Single line: average across all CFC groups per month
    const byDate: Record<string, number[]> = {};
    for (const point of data) {
      if (!byDate[point.date]) byDate[point.date] = [];
      byDate[point.date].push(point.avg_price);
    }
    chartData = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, prices]) => ({
        date,
        label: formatMonthLabel(date),
        avg: Math.round((prices.reduce((a, b) => a + b, 0) / prices.length) * 100) / 100,
      }));
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-3 hover:text-foreground"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${expanded ? "" : "-rotate-90"}`}
        />
        Tendance prix
      </button>

      {expanded && (
        <div className="h-[180px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {showMultipleLines ? (
                  cfcGroups.map((group, i) => (
                    <linearGradient key={group} id={`grad-${group}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CFC_COLORS[i % CFC_COLORS.length]} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={CFC_COLORS[i % CFC_COLORS.length]} stopOpacity={0} />
                    </linearGradient>
                  ))
                ) : (
                  <linearGradient id="grad-avg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                )}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#9CA3AF" }}
                axisLine={false}
                tickLine={false}
                width={45}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  borderRadius: 6,
                  border: "1px solid #e5e7eb",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
                formatter={(value: number) => [
                  `CHF ${new Intl.NumberFormat("fr-CH", { minimumFractionDigits: 2 }).format(value)}`,
                  "Prix moyen",
                ]}
                labelStyle={{ fontWeight: 600, fontSize: 11 }}
              />
              {showMultipleLines ? (
                <>
                  {cfcGroups.map((group, i) => (
                    <Area
                      key={group}
                      type="monotone"
                      dataKey={group}
                      name={`CFC ${group}`}
                      stroke={CFC_COLORS[i % CFC_COLORS.length]}
                      strokeWidth={1.5}
                      fill={`url(#grad-${group})`}
                      dot={false}
                    />
                  ))}
                  <Legend
                    verticalAlign="bottom"
                    height={20}
                    iconSize={8}
                    wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                  />
                </>
              ) : (
                <Area
                  type="monotone"
                  dataKey="avg"
                  name="Prix moyen"
                  stroke="#2563EB"
                  strokeWidth={1.5}
                  fill="url(#grad-avg)"
                  dot={{ r: 2, fill: "#2563EB" }}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
