"use client";

import { useState, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { DollarSign, TrendingUp, BarChart3, PieChart, Loader2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from "recharts";

const PLAN_PRICING: Record<string, number> = {
  trial: 0,
  starter: 149,
  pro: 349,
  enterprise: 990,
};

const ACTION_COLORS: Record<string, string> = {
  "classify-email": "#8B5CF6",
  "generate-reply": "#3B82F6",
  "generate-pv": "#10B981",
  "transcribe": "#F59E0B",
  "generate-briefing": "#EC4899",
  "extract-tasks": "#06B6D4",
  "analyze-plan": "#F97316",
  "chat": "#6366F1",
};

export default function AdminFinancesPage() {
  const t = useTranslations("admin");
  const [period, setPeriod] = useState<"30d" | "90d">("30d");
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<any>(null);
  const [orgs, setOrgs] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/super-admin?action=analytics&scope=platform&period=${period}`)
        .then((r) => r.json())
        .catch(() => ({})),
      fetch("/api/super-admin?action=list-organizations")
        .then((r) => r.json())
        .catch(() => ({ organizations: [] })),
    ])
      .then(([analyticsData, orgsData]) => {
        setAnalytics(analyticsData);
        setOrgs(orgsData.organizations || []);
      })
      .finally(() => setLoading(false));
  }, [period]);

  const totalMrr = useMemo(() => {
    return orgs.reduce((sum: number, o: any) => {
      const plan = o.subscription_plan || o.plan || "trial";
      return sum + (PLAN_PRICING[plan] || 0);
    }, 0);
  }, [orgs]);

  const totalArr = totalMrr * 12;
  const totalApiCost = analytics?.overview?.total_cost_chf || 0;
  const netMargin = totalMrr > 0 ? ((totalMrr - totalApiCost) / totalMrr) * 100 : 0;

  // Revenue vs Costs daily chart
  const revenueVsCosts = useMemo(() => {
    const daily = analytics?.daily_trend || [];
    const dailyRevenue = totalMrr / 30;
    return daily.map((d: any) => ({
      date: d.date?.slice(5) || "",
      revenue: Number(dailyRevenue.toFixed(2)),
      costs: d.cost || 0,
      margin: Number((dailyRevenue - (d.cost || 0)).toFixed(2)),
    }));
  }, [analytics, totalMrr]);

  // Cost by module from per_action
  const costByModule = useMemo(() => {
    const perAction = analytics?.per_action || [];
    const total = totalApiCost || 1;
    return perAction
      .sort((a: any, b: any) => (b.cost || 0) - (a.cost || 0))
      .slice(0, 6)
      .map((a: any) => ({
        module: a.action_type || "Autre",
        cost: a.cost || 0,
        pct: Math.round(((a.cost || 0) / total) * 100),
        color: ACTION_COLORS[a.action_type] || "#94A3B8",
      }));
  }, [analytics, totalApiCost]);

  // Detail by plan
  const planDetail = useMemo(() => {
    const perOrg = analytics?.per_org || [];
    const plans = ["trial", "starter", "pro", "enterprise"] as const;

    return plans.map((plan) => {
      const planOrgs = orgs.filter(
        (o: any) => (o.subscription_plan || o.plan || "trial") === plan
      );
      const count = planOrgs.length;
      const revenue = count * (PLAN_PRICING[plan] || 0);
      const cost = planOrgs.reduce((sum: number, o: any) => {
        const orgAnalytics = perOrg.find((a: any) => a.org_id === o.id);
        return sum + (orgAnalytics?.cost || 0);
      }, 0);
      const margin = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 100) : 0;

      return { plan, count, revenue, cost: Number(cost.toFixed(2)), margin };
    });
  }, [analytics, orgs]);

  // Projection
  const projectedMrr3m = totalMrr * 1.15;
  const projectedArr3m = projectedMrr3m * 12;

  const summaryCards = [
    {
      icon: DollarSign,
      label: t("metricMRR"),
      value: loading ? "—" : `${totalMrr.toLocaleString("fr-CH")} CHF`,
      color: "green",
    },
    {
      icon: TrendingUp,
      label: t("metricARR"),
      value: loading ? "—" : `${totalArr.toLocaleString("fr-CH")} CHF`,
      color: "blue",
    },
    {
      icon: BarChart3,
      label: t("metricAPICost"),
      value: loading ? "—" : `${totalApiCost.toFixed(2)} CHF`,
      color: "red",
    },
    {
      icon: PieChart,
      label: t("metricNetMargin"),
      value: loading ? "—" : `${netMargin.toFixed(1)}%`,
      color: "emerald",
    },
  ];

  const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
    green: { bg: "bg-green-50", icon: "text-green-600", text: "text-green-700" },
    blue: { bg: "bg-blue-50", icon: "text-blue-600", text: "text-blue-700" },
    red: { bg: "bg-red-50", icon: "text-red-600", text: "text-red-700" },
    emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", text: "text-emerald-700" },
  };

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800">
          {t("financesTitle")}
        </h1>
        <p className="text-sm text-gray-500">{t("financesSubtitle")}</p>
      </div>

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const colors = colorMap[card.color];
          return (
            <div
              key={card.label}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.bg}`}
                >
                  <card.icon className={`h-5 w-5 ${colors.icon}`} />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {card.label}
                  </p>
                  <p className={`text-xl font-bold ${colors.text}`}>
                    {card.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Revenue vs Costs chart */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">
                {t("revenueVsCosts")}
              </h2>
              <div className="flex gap-1">
                {(["30d", "90d"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`rounded-md px-3 py-1 text-xs font-medium ${
                      period === p
                        ? "bg-gray-800 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {p === "30d" ? "30j" : "90j"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 h-[250px]">
              {revenueVsCosts.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueVsCosts}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#94A3B8" }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#94A3B8" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #E2E8F0",
                        fontSize: "11px",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="#10B981"
                      strokeWidth={2}
                      dot={false}
                      name="Revenus (CHF/j)"
                    />
                    <Line
                      type="monotone"
                      dataKey="costs"
                      stroke="#EF4444"
                      strokeWidth={2}
                      dot={false}
                      name="Coûts API (CHF/j)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  Aucune donnée pour cette période
                </div>
              )}
            </div>
          </div>

          {/* Cost by module */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-800">
              {t("costByModule")}
            </h2>
            <div className="mt-4 space-y-3">
              {costByModule.length > 0 ? (
                costByModule.map((mod: any) => (
                  <div key={mod.module}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{mod.module}</span>
                      <span className="font-medium text-gray-600">
                        {mod.cost.toFixed(2)} CHF ({mod.pct}%)
                      </span>
                    </div>
                    <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full transition-all"
                        style={{
                          width: `${mod.pct}%`,
                          backgroundColor: mod.color,
                        }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-4 text-center text-sm text-gray-400">
                  Aucun coût API enregistré
                </p>
              )}
            </div>
            <div className="mt-4 border-t border-gray-100 pt-3 text-right text-sm font-bold text-gray-700">
              Total : {totalApiCost.toFixed(2)} CHF/mois
            </div>
          </div>

          {/* Detail by plan */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-800">
              {t("detailByPlan")}
            </h2>
            <div className="mt-4 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={planDetail}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                  <XAxis
                    dataKey="plan"
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#94A3B8" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #E2E8F0",
                      fontSize: "11px",
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="revenue"
                    fill="#10B981"
                    name="Revenus (CHF)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="cost"
                    fill="#EF4444"
                    name="Coûts (CHF)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="py-1.5 text-left font-medium text-gray-500">
                      Plan
                    </th>
                    <th className="py-1.5 text-right font-medium text-gray-500">
                      Clients
                    </th>
                    <th className="py-1.5 text-right font-medium text-gray-500">
                      Revenus
                    </th>
                    <th className="py-1.5 text-right font-medium text-gray-500">
                      Coûts
                    </th>
                    <th className="py-1.5 text-right font-medium text-gray-500">
                      Marge
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {planDetail.map((p) => (
                    <tr key={p.plan} className="border-b border-gray-50">
                      <td className="py-1.5 font-medium capitalize text-gray-700">
                        {p.plan}
                      </td>
                      <td className="py-1.5 text-right text-gray-600">
                        {p.count}
                      </td>
                      <td className="py-1.5 text-right text-gray-600">
                        {p.revenue} CHF
                      </td>
                      <td className="py-1.5 text-right text-gray-600">
                        {p.cost} CHF
                      </td>
                      <td
                        className={`py-1.5 text-right font-medium ${
                          p.margin >= 80
                            ? "text-green-600"
                            : p.margin >= 0
                              ? "text-amber-600"
                              : "text-red-600"
                        }`}
                      >
                        {p.margin}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Projection */}
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-gray-800">
              {t("projection")}
            </h2>
            <div className="mt-4 space-y-4">
              <div className="rounded-md bg-green-50 p-3">
                <p className="text-xs font-medium text-green-700">
                  MRR projeté (3 mois, +15% hypothèse)
                </p>
                <p className="mt-1 text-2xl font-bold text-green-800">
                  {projectedMrr3m.toFixed(0)} CHF
                </p>
              </div>
              <div className="rounded-md bg-blue-50 p-3">
                <p className="text-xs font-medium text-blue-700">
                  ARR projeté (3 mois)
                </p>
                <p className="mt-1 text-2xl font-bold text-blue-800">
                  {projectedArr3m.toLocaleString("fr-CH")} CHF
                </p>
              </div>
              <div className="text-xs text-gray-500">
                <p>Hypothèses :</p>
                <ul className="ml-4 mt-1 list-disc space-y-0.5">
                  <li>Croissance MRR : +15% sur 3 mois</li>
                  <li>
                    Coûts API proportionnels au nombre d&apos;utilisateurs actifs
                  </li>
                  <li>1 conversion trial/mois estimée</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
