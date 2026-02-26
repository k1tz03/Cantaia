"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Users,
  DollarSign,
  BarChart3,
  TrendingUp,
  Mail,
  FileText,
  CheckSquare,
  Sparkles,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
// Mock data removed — will be replaced by real API calls

const PERIODS = [
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
  { key: "1y", days: 365 },
] as const;

const SERIES = [
  { key: "total_api_cost_chf", color: "#EF4444", labelKey: "toggleCosts" },
  { key: "active_users_today", color: "#3B82F6", labelKey: "toggleActiveUsers" },
  { key: "emails_classified", color: "#8B5CF6", labelKey: "toggleEmails" },
  { key: "pv_generated", color: "#10B981", labelKey: "togglePV" },
] as const;

export default function AdminOverviewPage() {
  const t = useTranslations("admin");
  const stats = {
    clients: { value: 0, change: 0 },
    mrr: { value: 0, change: 0 },
    apiCost: { value: 0, change: 0 },
    margin: { value: 0 },
    emailsClassified: { value: 0 },
    pvGenerated: { value: 0 },
    tasksCreated: { value: 0 },
    briefingsGenerated: { value: 0 },
  };
  const [period, setPeriod] = useState<string>("30d");
  const [activeSeries, setActiveSeries] = useState<Set<string>>(
    new Set(["total_api_cost_chf", "active_users_today"])
  );

  const chartData = useMemo(() => {
    // Empty chart data — will be replaced by real API calls
    return [] as { date: string; total_api_cost_chf: number; active_users_today: number; emails_classified: number; pv_generated: number }[];
  }, [period]);

  const toggleSeries = (key: string) => {
    setActiveSeries((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const cards = [
    {
      icon: Users,
      label: t("metricClients"),
      value: String(stats.clients.value),
      change: `+${stats.clients.change} ce mois`,
      changePositive: true,
      color: "blue",
    },
    {
      icon: DollarSign,
      label: t("metricMRR"),
      value: `${stats.mrr.value.toLocaleString("fr-CH")} CHF`,
      change: `+${stats.mrr.change} ce mois`,
      changePositive: true,
      color: "green",
    },
    {
      icon: BarChart3,
      label: t("metricAPICost"),
      value: `${stats.apiCost.value.toFixed(2)} CHF`,
      change: `+${stats.apiCost.change.toFixed(1)} ce mois`,
      changePositive: false,
      color: "red",
    },
    {
      icon: TrendingUp,
      label: t("metricMargin"),
      value: `${stats.margin.value.toFixed(1)}%`,
      change: "",
      changePositive: true,
      color: "emerald",
    },
    {
      icon: Mail,
      label: t("metricEmails"),
      value: stats.emailsClassified.value.toLocaleString("fr-CH"),
      change: "ce mois",
      changePositive: true,
      color: "indigo",
    },
    {
      icon: FileText,
      label: t("metricPV"),
      value: String(stats.pvGenerated.value),
      change: "ce mois",
      changePositive: true,
      color: "purple",
    },
    {
      icon: CheckSquare,
      label: t("metricTasks"),
      value: String(stats.tasksCreated.value),
      change: "ce mois",
      changePositive: true,
      color: "amber",
    },
    {
      icon: Sparkles,
      label: t("metricBriefings"),
      value: String(stats.briefingsGenerated.value),
      change: "ce mois",
      changePositive: true,
      color: "cyan",
    },
  ];

  const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
    blue: { bg: "bg-blue-50", icon: "text-blue-600", text: "text-blue-700" },
    green: { bg: "bg-green-50", icon: "text-green-600", text: "text-green-700" },
    red: { bg: "bg-red-50", icon: "text-red-600", text: "text-red-700" },
    emerald: { bg: "bg-emerald-50", icon: "text-emerald-600", text: "text-emerald-700" },
    indigo: { bg: "bg-indigo-50", icon: "text-indigo-600", text: "text-indigo-700" },
    purple: { bg: "bg-purple-50", icon: "text-purple-600", text: "text-purple-700" },
    amber: { bg: "bg-amber-50", icon: "text-amber-600", text: "text-amber-700" },
    cyan: { bg: "bg-cyan-50", icon: "text-cyan-600", text: "text-cyan-700" },
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">
            {t("overviewTitle")}
          </h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {t("overviewSubtitle")}
          </p>
        </div>
      </div>

      {/* 8 Metric Cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {cards.map((card) => {
          const colors = colorMap[card.color] || colorMap.blue;
          return (
            <div
              key={card.label}
              className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.bg}`}
                >
                  <card.icon className={`h-5 w-5 ${colors.icon}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
                    {card.label}
                  </p>
                  <p className={`text-xl font-bold ${colors.text}`}>
                    {card.value}
                  </p>
                </div>
              </div>
              {card.change && (
                <p
                  className={`mt-2 text-xs ${
                    card.changePositive ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {card.change}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Evolution Chart */}
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-800">
            {t("evolutionTitle")}
          </h2>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  period === p.key
                    ? "bg-gray-800 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {t(`period${p.key}` as any)}
              </button>
            ))}
          </div>
        </div>

        {/* Series toggles */}
        <div className="mt-3 flex flex-wrap gap-2">
          {SERIES.map((s) => (
            <button
              key={s.key}
              onClick={() => toggleSeries(s.key)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                activeSeries.has(s.key)
                  ? "bg-gray-800 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {t(s.labelKey)}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="mt-4 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#94A3B8" }}
                tickLine={false}
                axisLine={{ stroke: "#E2E8F0" }}
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
                  fontSize: "12px",
                }}
              />
              <Legend />
              {SERIES.map(
                (s) =>
                  activeSeries.has(s.key) && (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      stroke={s.color}
                      strokeWidth={2}
                      dot={false}
                      name={t(s.labelKey)}
                    />
                  )
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Plan Management Section */}
      <PlanManagementSection t={t} />
    </div>
  );
}

// ---------- Plan Management Section ----------

function PlanManagementSection({
  t,
}: {
  t: ReturnType<typeof useTranslations>;
}) {
  const plans = ["trial", "starter", "pro", "enterprise"] as const;
  const planColors: Record<string, string> = {
    trial: "#94A3B8",
    starter: "#3B82F6",
    pro: "#8B5CF6",
    enterprise: "#F59E0B",
  };

  const planCounts = plans.map((plan) => ({
    plan,
    count: 0,
    mrr: 0,
  }));

  const totalOrgs = 0;

  // Mock conversion stats
  const conversionStats = {
    totalTrials: 8,
    converted: 5,
    rate: 62.5,
    avgDays: 11,
    mostChosen: "pro",
  };

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {/* Plan Distribution */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800">
          {t("plansDistribution")}
        </h2>
        <div className="mt-4 space-y-3">
          {planCounts.map(({ plan, count, mrr }) => (
            <div key={plan}>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: planColors[plan] }}
                  />
                  <span className="font-medium capitalize text-gray-700">
                    {plan}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">
                    {count} org{count > 1 ? "s" : ""}
                  </span>
                  <span className="font-medium text-gray-700">
                    {mrr > 0 ? `${mrr} CHF/m` : "—"}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 h-2 w-full rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${totalOrgs > 0 ? (count / totalOrgs) * 100 : 0}%`,
                    backgroundColor: planColors[plan],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
          <span className="font-medium text-gray-600">Total MRR</span>
          <span className="text-base font-bold text-gray-800">
            {planCounts.reduce((s, p) => s + p.mrr, 0).toLocaleString("fr-CH")}{" "}
            CHF
          </span>
        </div>
      </div>

      {/* Conversion Stats */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-800">
          {t("plansConversion")}
        </h2>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">
              {conversionStats.rate}%
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {t("conversionRate")}
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800">
              {conversionStats.avgDays}j
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {t("avgConversionTime")}
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold capitalize text-purple-600">
              {conversionStats.mostChosen}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {t("mostChosenPlan")}
            </p>
          </div>
        </div>
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500">
            {conversionStats.converted}/{conversionStats.totalTrials} trials
            convertis en abonnement payant
          </p>
          <div className="mt-2 h-2 w-full rounded-full bg-gray-100">
            <div
              className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: `${conversionStats.rate}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
