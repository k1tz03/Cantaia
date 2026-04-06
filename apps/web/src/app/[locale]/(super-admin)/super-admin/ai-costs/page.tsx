"use client";

import { useState, useEffect } from "react";
import {
  DollarSign,
  Loader2,
  Sparkles,
  Calculator,
  TrendingUp,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Analytics {
  overview: {
    total_cost_chf: number;
    total_calls: number;
    avg_cost_per_call: number;
    projected_monthly: number;
  };
  per_action: { action_type: string; calls: number; cost: number }[];
  per_org: {
    org_id: string;
    org_name: string;
    plan: string;
    member_count: number;
    calls: number;
    cost: number;
    revenue_monthly: number;
    profit: number;
  }[];
  per_user: {
    user_id: string;
    name: string;
    email: string;
    org_name: string;
    calls: number;
    cost: number;
  }[];
  daily_trend: { date: string; calls: number; cost: number }[];
  hourly_distribution: { hour: number; calls: number }[];
  dow_distribution: { day: string; calls: number }[];
}

export default function SuperAdminAICostsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("30d");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/super-admin?action=analytics&scope=platform&period=${period}`)
      .then((r) => r.json())
      .then((data) => setAnalytics(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
      </div>
    );
  }

  const ov = analytics?.overview || {
    total_cost_chf: 0,
    total_calls: 0,
    avg_cost_per_call: 0,
    projected_monthly: 0,
  };

  const totalActionCost = (analytics?.per_action || []).reduce(
    (s, a) => s + a.cost,
    0
  );

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-[#FAFAFA]">
            <DollarSign className="h-6 w-6 text-amber-500" />
            Couts IA
          </h1>
          <p className="mt-1 text-sm text-[#A1A1AA]">
            Analyse des couts et de la consommation IA de la plateforme
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-[#27272A] p-0.5">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-[#18181B] text-[#FAFAFA] shadow-sm"
                  : "text-[#A1A1AA] hover:text-[#A1A1AA]"
              }`}
            >
              {p === "7d" ? "7 jours" : p === "30d" ? "30 jours" : "90 jours"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            icon: DollarSign,
            label: "Cout IA total",
            value: `${ov.total_cost_chf.toFixed(2)} CHF`,
            color: "bg-blue-500/10 text-blue-400",
          },
          {
            icon: Sparkles,
            label: "Appels IA",
            value: ov.total_calls.toLocaleString(),
            color: "bg-amber-500/10 text-amber-400",
          },
          {
            icon: Calculator,
            label: "Cout moyen/appel",
            value: `${ov.avg_cost_per_call.toFixed(4)} CHF`,
            color: "bg-violet-500/10 text-violet-400",
          },
          {
            icon: TrendingUp,
            label: "Projection mensuelle",
            value: `${ov.projected_monthly.toFixed(2)} CHF`,
            color: "bg-emerald-500/10 text-emerald-400",
          },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-[#27272A] bg-[#18181B] p-4"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.color}`}
              >
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-[#A1A1AA]">{c.label}</p>
                <p className="text-xl font-bold text-[#FAFAFA]">{c.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Daily trend chart */}
      {(analytics?.daily_trend?.length || 0) > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#A1A1AA]">
            Evolution quotidienne — Couts & appels
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={analytics!.daily_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis
                yAxisId="cost"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => `${v.toFixed(2)}`}
              />
              <YAxis
                yAxisId="calls"
                orientation="right"
                tick={{ fontSize: 10 }}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  name === "cost" ? `${value.toFixed(4)} CHF` : value,
                  name === "cost" ? "Cout" : "Appels",
                ]}
                labelFormatter={(l: string) => `Date: ${l}`}
              />
              <Area
                yAxisId="cost"
                type="monotone"
                dataKey="cost"
                stroke="#2563eb"
                fill="#2563eb20"
                strokeWidth={2}
              />
              <Area
                yAxisId="calls"
                type="monotone"
                dataKey="calls"
                stroke="#f59e0b"
                fill="#f59e0b20"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per organization table */}
      {(analytics?.per_org?.length || 0) > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B]">
          <div className="border-b border-[#27272A] px-5 py-3.5">
            <h3 className="text-sm font-semibold text-[#A1A1AA]">
              Par organisation
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1C1C1F] text-left text-xs text-[#A1A1AA]">
                <tr>
                  <th className="px-5 py-2 font-medium">Organisation</th>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-3 py-2 font-medium text-right">Membres</th>
                  <th className="px-3 py-2 font-medium text-right">
                    Appels IA
                  </th>
                  <th className="px-3 py-2 font-medium text-right">
                    Cout (CHF)
                  </th>
                  <th className="px-3 py-2 font-medium text-right">
                    Revenu/mois
                  </th>
                  <th className="px-3 py-2 font-medium text-right">Profit</th>
                  <th className="px-5 py-2 font-medium text-right">Marge</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272A]">
                {analytics!.per_org.map((o) => {
                  const margin =
                    o.revenue_monthly > 0
                      ? (o.profit / o.revenue_monthly) * 100
                      : 0;
                  return (
                    <tr key={o.org_id} className="hover:bg-[#27272A]">
                      <td className="px-5 py-2.5 font-medium text-[#FAFAFA]">
                        {o.org_name}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full bg-[#27272A] px-2 py-0.5 text-xs font-medium capitalize text-[#A1A1AA]">
                          {o.plan}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#A1A1AA]">
                        {o.member_count}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#A1A1AA]">
                        {o.calls}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#A1A1AA]">
                        {o.cost.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-[#A1A1AA]">
                        {o.revenue_monthly} CHF
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-medium ${
                          o.profit >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {o.profit >= 0 ? "+" : ""}
                        {o.profit.toFixed(2)} CHF
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        {o.revenue_monthly > 0 ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              margin >= 50
                                ? "bg-green-500/10 text-green-400"
                                : margin >= 0
                                  ? "bg-yellow-500/10 text-yellow-400"
                                  : "bg-red-500/10 text-red-400"
                            }`}
                          >
                            {margin.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-[#71717A]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per user table */}
      {(analytics?.per_user?.length || 0) > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B]">
          <div className="border-b border-[#27272A] px-5 py-3.5">
            <h3 className="text-sm font-semibold text-[#A1A1AA]">
              Par utilisateur
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1C1C1F] text-left text-xs text-[#A1A1AA]">
                <tr>
                  <th className="px-5 py-2 font-medium">Utilisateur</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Organisation</th>
                  <th className="px-3 py-2 font-medium text-right">Appels</th>
                  <th className="px-5 py-2 font-medium text-right">
                    Cout (CHF)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272A]">
                {analytics!.per_user.slice(0, 30).map((u) => (
                  <tr key={u.user_id} className="hover:bg-[#27272A]">
                    <td className="px-5 py-2.5 font-medium text-[#FAFAFA]">
                      {u.name}
                    </td>
                    <td className="px-3 py-2.5 text-[#A1A1AA]">{u.email}</td>
                    <td className="px-3 py-2.5 text-[#A1A1AA]">
                      {u.org_name || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#A1A1AA]">
                      {u.calls}
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium text-[#FAFAFA]">
                      {u.cost.toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per function table */}
      {(analytics?.per_action?.length || 0) > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B]">
          <div className="border-b border-[#27272A] px-5 py-3.5">
            <h3 className="text-sm font-semibold text-[#A1A1AA]">
              Par fonction IA
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1C1C1F] text-left text-xs text-[#A1A1AA]">
                <tr>
                  <th className="px-5 py-2 font-medium">Fonction</th>
                  <th className="px-3 py-2 font-medium text-right">Appels</th>
                  <th className="px-3 py-2 font-medium text-right">
                    Cout (CHF)
                  </th>
                  <th className="px-5 py-2 font-medium text-right">% Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272A]">
                {analytics!.per_action.map((a) => (
                  <tr key={a.action_type} className="hover:bg-[#27272A]">
                    <td className="px-5 py-2.5 font-medium text-[#FAFAFA]">
                      {a.action_type.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#A1A1AA]">
                      {a.calls}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#A1A1AA]">
                      {a.cost.toFixed(4)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-[#A1A1AA]">
                      {totalActionCost > 0
                        ? ((a.cost / totalActionCost) * 100).toFixed(1)
                        : "0"}
                      %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts row: hourly + dow */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Hourly distribution */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#A1A1AA]">
            Distribution horaire
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={analytics?.hourly_distribution || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => `${v}h`}
              />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v: number) => [v, "Appels"]}
                labelFormatter={(l: number) => `${l}h - ${l + 1}h`}
              />
              <Bar
                dataKey="calls"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Day of week */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#A1A1AA]">
            Distribution par jour
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={analytics?.dow_distribution || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [v, "Appels"]} />
              <Bar
                dataKey="calls"
                fill="#8b5cf6"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
