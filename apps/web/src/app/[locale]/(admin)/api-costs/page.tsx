"use client";

import { useState, useEffect, useCallback } from "react";
import {
  DollarSign,
  Activity,
  TrendingUp,
  Users,
  AlertTriangle,
  RefreshCw,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

interface UsageStats {
  period: string;
  days: number;
  overview: {
    total_cost_chf: number;
    total_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    avg_cost_per_call: number;
    projected_monthly_chf: number;
  };
  per_user: Array<{
    user_id: string;
    user_name: string;
    user_email: string;
    calls: number;
    cost: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  per_action: Array<{
    action_type: string;
    calls: number;
    cost: number;
  }>;
  daily_trend: Array<{
    date: string;
    calls: number;
    cost: number;
  }>;
  alerts: Array<{
    type: "warning" | "danger";
    message: string;
  }>;
}

const ACTION_LABELS: Record<string, string> = {
  email_classify: "Classification",
  email_summary: "Résumé",
  email_reply: "Réponse IA",
  task_extract: "Extraction tâches",
  pv_transcribe: "Transcription PV",
  pv_generate: "Génération PV",
  reclassify: "Reclassification",
};

const PIE_COLORS = ["#0A1F30", "#3B82F6", "#60A5FA", "#93C5FD", "#BFDBFE", "#7C3AED", "#A78BFA"];

function formatChf(value: number): string {
  return `CHF ${value.toFixed(2)}`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toString();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getDate()}.${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

export default function AdminApiCostsPage() {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/usage-stats?period=${period}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <main className="p-6">
        <div className="flex items-center gap-3">
          <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500">Chargement des statistiques...</span>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">Erreur : {error}</p>
          <button
            onClick={fetchStats}
            className="mt-2 text-sm font-medium text-red-600 hover:text-red-800"
          >
            Réessayer
          </button>
        </div>
      </main>
    );
  }

  if (!stats) return null;

  const { overview, per_user, per_action, daily_trend, alerts } = stats;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Coûts API</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Suivi des coûts d&apos;utilisation de l&apos;IA
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p
                    ? "bg-brand text-white"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {p === "7d" ? "7 jours" : p === "30d" ? "30 jours" : "90 jours"}
              </button>
            ))}
          </div>
          <button
            onClick={fetchStats}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50"
            title="Actualiser"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm ${
                alert.type === "danger"
                  ? "border border-red-200 bg-red-50 text-red-700"
                  : "border border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {alert.message}
            </div>
          ))}
        </div>
      )}

      {/* Overview Cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={DollarSign}
          label="Coût total"
          value={formatChf(overview.total_cost_chf)}
          sub={`~${formatChf(overview.projected_monthly_chf)}/mois`}
          color="blue"
        />
        <StatCard
          icon={Activity}
          label="Appels API"
          value={formatNumber(overview.total_calls)}
          sub={`Moy. ${formatChf(overview.avg_cost_per_call)}/appel`}
          color="purple"
        />
        <StatCard
          icon={Zap}
          label="Tokens entrée"
          value={formatNumber(overview.total_input_tokens)}
          sub="input tokens"
          color="green"
        />
        <StatCard
          icon={TrendingUp}
          label="Tokens sortie"
          value={formatNumber(overview.total_output_tokens)}
          sub="output tokens"
          color="amber"
        />
      </div>

      {/* Charts Row */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        {/* Cost evolution chart */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Évolution des coûts
          </h3>
          {daily_trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={daily_trend}>
                <defs>
                  <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0A1F30" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0A1F30" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickFormatter={(v) => `${v.toFixed(2)}`}
                />
                <Tooltip
                  formatter={(value: number) => [formatChf(value), "Coût"]}
                  labelFormatter={(label) => `Date : ${label}`}
                  contentStyle={{ fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#0A1F30"
                  strokeWidth={2}
                  fill="url(#costGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-sm text-gray-400">
              Aucune donnée pour cette période
            </div>
          )}
        </div>

        {/* Cost per action pie chart */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Coûts par action
          </h3>
          {per_action.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={per_action.map((a) => ({
                    name: ACTION_LABELS[a.action_type] || a.action_type,
                    value: Math.round(a.cost * 10000) / 10000,
                  }))}
                  cx="50%"
                  cy="45%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {per_action.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => <span className="text-gray-600">{value}</span>}
                />
                <Tooltip
                  formatter={(value: number) => [formatChf(value), "Coût"]}
                  contentStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-sm text-gray-400">
              Aucune donnée
            </div>
          )}
        </div>
      </div>

      {/* Per-user table */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <Users className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">
            Coûts par utilisateur
          </h3>
        </div>
        {per_user.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-2.5">Utilisateur</th>
                  <th className="px-4 py-2.5 text-right">Appels</th>
                  <th className="px-4 py-2.5 text-right">Tokens in</th>
                  <th className="px-4 py-2.5 text-right">Tokens out</th>
                  <th className="px-4 py-2.5 text-right">Coût</th>
                  <th className="px-4 py-2.5 text-right">% du total</th>
                </tr>
              </thead>
              <tbody>
                {per_user.map((u) => (
                  <tr
                    key={u.user_id}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800">{u.user_name}</div>
                      <div className="text-xs text-gray-400">{u.user_email}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {u.calls}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {formatNumber(u.inputTokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {formatNumber(u.outputTokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-800">
                      {formatChf(u.cost)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{
                              width: `${overview.total_cost_chf > 0 ? (u.cost / overview.total_cost_chf) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs tabular-nums text-gray-500">
                          {overview.total_cost_chf > 0
                            ? ((u.cost / overview.total_cost_chf) * 100).toFixed(0)
                            : 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            Aucune donnée d&apos;utilisation
          </div>
        )}
      </div>

      {/* Per-action table */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <Activity className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700">
            Détail par type d&apos;action
          </h3>
        </div>
        {per_action.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5 text-right">Appels</th>
                  <th className="px-4 py-2.5 text-right">Coût total</th>
                  <th className="px-4 py-2.5 text-right">Coût moyen</th>
                </tr>
              </thead>
              <tbody>
                {per_action.map((a) => (
                  <tr
                    key={a.action_type}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-800">
                      {ACTION_LABELS[a.action_type] || a.action_type}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-600">
                      {a.calls}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-gray-800">
                      {formatChf(a.cost)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">
                      {a.calls > 0 ? formatChf(a.cost / a.calls) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400">
            Aucune donnée
          </div>
        )}
      </div>
    </main>
  );
}

// --- Stat Card Component ---

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  color: "blue" | "purple" | "green" | "amber";
}) {
  const colorMap = {
    blue: "bg-blue-50 text-blue-600",
    purple: "bg-purple-50 text-purple-600",
    green: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <div className={`rounded-lg p-1.5 ${colorMap[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div className="mt-2 text-lg font-bold text-gray-900">{value}</div>
      <div className="mt-0.5 text-xs text-gray-400">{sub}</div>
    </div>
  );
}
