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
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <DollarSign className="h-6 w-6 text-amber-500" />
            Couts IA
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Analyse des couts et de la consommation IA de la plateforme
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-0.5">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
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
            color: "bg-blue-50 text-blue-600",
          },
          {
            icon: Sparkles,
            label: "Appels IA",
            value: ov.total_calls.toLocaleString(),
            color: "bg-amber-50 text-amber-600",
          },
          {
            icon: Calculator,
            label: "Cout moyen/appel",
            value: `${ov.avg_cost_per_call.toFixed(4)} CHF`,
            color: "bg-violet-50 text-violet-600",
          },
          {
            icon: TrendingUp,
            label: "Projection mensuelle",
            value: `${ov.projected_monthly.toFixed(2)} CHF`,
            color: "bg-emerald-50 text-emerald-600",
          },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${c.color}`}
              >
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{c.label}</p>
                <p className="text-xl font-bold text-gray-900">{c.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Daily trend chart */}
      {(analytics?.daily_trend?.length || 0) > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            Evolution quotidienne — Couts & appels
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={analytics!.daily_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
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
                fill="#dbeafe"
                strokeWidth={2}
              />
              <Area
                yAxisId="calls"
                type="monotone"
                dataKey="calls"
                stroke="#f59e0b"
                fill="#fef3c7"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per organization table */}
      {(analytics?.per_org?.length || 0) > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-gray-700">
              Par organisation
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
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
              <tbody className="divide-y divide-gray-50">
                {analytics!.per_org.map((o) => {
                  const margin =
                    o.revenue_monthly > 0
                      ? (o.profit / o.revenue_monthly) * 100
                      : 0;
                  return (
                    <tr key={o.org_id} className="hover:bg-gray-50">
                      <td className="px-5 py-2.5 font-medium text-gray-800">
                        {o.org_name}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium capitalize text-gray-600">
                          {o.plan}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
                        {o.member_count}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
                        {o.calls}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
                        {o.cost.toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
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
                                ? "bg-green-50 text-green-700"
                                : margin >= 0
                                  ? "bg-yellow-50 text-yellow-700"
                                  : "bg-red-50 text-red-700"
                            }`}
                          >
                            {margin.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
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
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-gray-700">
              Par utilisateur
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
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
              <tbody className="divide-y divide-gray-50">
                {analytics!.per_user.slice(0, 30).map((u) => (
                  <tr key={u.user_id} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 font-medium text-gray-800">
                      {u.name}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">{u.email}</td>
                    <td className="px-3 py-2.5 text-gray-500">
                      {u.org_name || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">
                      {u.calls}
                    </td>
                    <td className="px-5 py-2.5 text-right font-medium text-gray-800">
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
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-gray-700">
              Par fonction IA
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-5 py-2 font-medium">Fonction</th>
                  <th className="px-3 py-2 font-medium text-right">Appels</th>
                  <th className="px-3 py-2 font-medium text-right">
                    Cout (CHF)
                  </th>
                  <th className="px-5 py-2 font-medium text-right">% Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {analytics!.per_action.map((a) => (
                  <tr key={a.action_type} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 font-medium text-gray-800">
                      {a.action_type.replace(/_/g, " ")}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">
                      {a.calls}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">
                      {a.cost.toFixed(4)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-gray-600">
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
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            Distribution horaire
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={analytics?.hourly_distribution || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
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
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">
            Distribution par jour
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={analytics?.dow_distribution || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
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
