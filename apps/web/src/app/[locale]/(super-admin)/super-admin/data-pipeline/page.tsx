"use client";

import { useState, useEffect } from "react";
import {
  GitBranch,
  Loader2,
  Database,
  TrendingUp,
  Sparkles,
  Clock,
  Activity,
  GraduationCap,
  Grid3X3,
  ShieldCheck,
  Scale,
  CheckCircle2,
  Zap,
  ThumbsUp,
  Target,
  Mail,
  FileText,
  Map,
  Calculator,
  ClipboardList,
  HardHat,
  MessageSquare,
  CheckSquare,
  Truck,
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HealthData {
  total_points: number;
  period_points: number;
  ai_calls: number;
  queue_pending: number;
  module_breakdown: Array<{ module: string; period_count: number; total_count: number }>;
  daily_trend: Array<{ date: string; ai_calls: number; learning_points: number }>;
}

interface LearningData {
  total_corrections: number;
  auto_rules: number;
  chat_satisfaction_pct: number;
  price_precision_pct: number;
  email_corrections: Array<{ type: string; count: number }>;
  email_rules: { sender_rules: number; keyword_rules: number };
  price_error_trend: Array<{ month: string; error_pct: number }>;
  recent_calibrations: Array<{
    cfc_code: string;
    estimated: number;
    actual: number;
    coefficient: number;
    date: string;
  }>;
  other_modules: {
    pv: { count: number; last_date: string | null };
    visits: { count: number; last_date: string | null };
    submissions: { count: number; last_date: string | null };
    tasks: { count: number; last_date: string | null };
  };
}

interface ModuleEnrichment {
  modules: Array<{
    module: string;
    total: number;
    period: number;
    sparkline: Array<{ date: string; value: number }>;
    last_activity: string | null;
  }>;
}

interface QualityData {
  price_precision_pct: number;
  classification_confidence_pct: number;
  avg_coefficient: number;
  chat_satisfaction_pct: number;
  monthly_accuracy: Array<{ month: string; accuracy: number }>;
  confidence_distribution: Array<{ bucket: string; count: number }>;
  corrections_by_type: Array<{ type: string; count: number }>;
}

interface CostData {
  total_ai_cost: number;
  total_learning_points: number;
  cost_per_point: number;
  daily_trend: Array<{ date: string; cost: number; points: number }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabKey = "health" | "learning" | "modules" | "quality" | "cost";

const TABS: { key: TabKey; label: string; icon: typeof Activity }[] = [
  { key: "health", label: "Sant\u00e9 Pipeline", icon: Activity },
  { key: "learning", label: "Apprentissage", icon: GraduationCap },
  { key: "modules", label: "Modules", icon: Grid3X3 },
  { key: "quality", label: "Qualit\u00e9 Donn\u00e9es", icon: ShieldCheck },
  { key: "cost", label: "Co\u00fbt vs Intelligence", icon: Scale },
];

const MODULE_ICONS: Record<string, typeof Mail> = {
  mail: Mail,
  soumissions: FileText,
  plans: Map,
  prix: Calculator,
  pv: ClipboardList,
  visites: HardHat,
  chat: MessageSquare,
  taches: CheckSquare,
  fournisseurs: Truck,
};

const MODULE_LABELS: Record<string, string> = {
  mail: "Messagerie",
  soumissions: "Soumissions",
  plans: "Plans",
  prix: "Prix",
  pv: "PV Chantier",
  visites: "Visites",
  chat: "Chat IA",
  taches: "T\u00e2ches",
  fournisseurs: "Fournisseurs",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(iso: string | null): string {
  if (!iso) return "Jamais";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "maintenant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function formatCHF(v: number | undefined | null): string {
  return (v ?? 0).toFixed(2) + " CHF";
}

function formatPct(v: number | undefined | null): string {
  return (v ?? 0).toFixed(1) + "%";
}

function safeNum(v: number | undefined | null): number {
  return v ?? 0;
}

function safeLoc(v: number | undefined | null): string {
  return (v ?? 0).toLocaleString("fr-CH");
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: typeof Database;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
      <div className="mb-1 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <span className="text-[10px] uppercase tracking-wider text-[#71717A]">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-[#52525B]">{sub}</p>}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-[#3F3F46] bg-[#18181B]/50 p-12">
      <p className="text-sm text-[#71717A]">
        Aucune donn&eacute;e d&apos;enrichissement pour cette p&eacute;riode. Les donn&eacute;es
        s&apos;accumuleront au fil de l&apos;utilisation.
      </p>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#18181B",
    border: "1px solid #27272A",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#FAFAFA",
  },
  itemStyle: { color: "#A1A1AA" },
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function SuperAdminDataPipelinePage() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [tab, setTab] = useState<TabKey>("health");
  const [loading, setLoading] = useState(true);

  // Data states
  const [health, setHealth] = useState<HealthData | null>(null);
  const [learning, setLearning] = useState<LearningData | null>(null);
  const [modules, setModules] = useState<ModuleEnrichment | null>(null);
  const [quality, setQuality] = useState<QualityData | null>(null);
  const [cost, setCost] = useState<CostData | null>(null);

  // -------------------------------------------------------------------------
  // Fetch all data
  // -------------------------------------------------------------------------

  useEffect(() => {
    setLoading(true);
    const base = "/api/super-admin/data-pipeline";
    Promise.all([
      fetch(`${base}?action=health-overview&period=${period}`).then((r) => r.json()),
      fetch(`${base}?action=learning-progress&period=${period}`).then((r) => r.json()),
      fetch(`${base}?action=module-enrichment&period=${period}`).then((r) => r.json()),
      fetch(`${base}?action=data-quality&period=${period}`).then((r) => r.json()),
      fetch(`${base}?action=cost-vs-intelligence&period=${period}`).then((r) => r.json()),
    ])
      .then(([h, l, m, q, c]) => {
        setHealth(h?.data ?? null);
        setLearning(l?.data ?? null);
        setModules(m?.data ?? null);
        setQuality(q?.data ?? null);
        setCost(c?.data ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#0F0F11]">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Tab renderers
  // -------------------------------------------------------------------------

  function renderHealth() {
    if (!health || (safeNum(health.total_points) === 0 && safeNum(health.ai_calls) === 0)) return <EmptyState />;
    const breakdown = health.module_breakdown || [];
    const trend = health.daily_trend || [];
    const maxModule = Math.max(...breakdown.map((m) => m.period_count), 1);
    return (
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={Database} label="Total points" value={safeLoc(health.total_points)} color="text-[#22C55E]" />
          <KpiCard icon={TrendingUp} label="Points période" value={safeLoc(health.period_points)} color="text-[#F97316]" sub={period} />
          <KpiCard icon={Sparkles} label="Appels IA" value={safeLoc(health.ai_calls)} color="text-[#3B82F6]" sub={period} />
          <KpiCard icon={Clock} label="File d'attente" value={safeLoc(health.queue_pending)} color="text-[#F59E0B]" />
        </div>

        {/* Module breakdown horizontal bars */}
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Enrichissement par module <span className="font-normal text-[#71717A]">({period})</span>
          </h3>
          <div className="space-y-3">
            {breakdown
              .sort((a, b) => b.period_count - a.period_count)
              .map((mod) => {
                const pct = Math.round((mod.period_count / maxModule) * 100);
                return (
                  <div key={mod.module}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-[#A1A1AA]">{MODULE_LABELS[mod.module] || mod.module}</span>
                      <span className="font-mono text-[#FAFAFA]">{mod.period_count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-[#27272A]">
                      <div
                        className="h-2 rounded-full bg-[#F97316]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Daily trend area chart */}
        {trend.length > 0 && (
          <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
              Tendance quotidienne
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                <XAxis dataKey="date" tick={{ fill: "#71717A", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: "#71717A", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="ai_calls" name="Appels IA" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="learning_points" name="Points apprentissage" stroke="#F97316" fill="#F97316" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    );
  }

  function renderLearning() {
    if (!learning) return <EmptyState />;
    const emailCorrections = learning.email_corrections || [];
    const emailRules = learning.email_rules || { sender_rules: 0, keyword_rules: 0 };
    const priceErrorTrend = learning.price_error_trend || [];
    const recentCalibrations = learning.recent_calibrations || [];
    const otherModules = learning.other_modules || { pv: { count: 0, last_date: null }, visits: { count: 0, last_date: null }, submissions: { count: 0, last_date: null }, tasks: { count: 0, last_date: null } };
    return (
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={CheckCircle2} label="Corrections" value={safeNum(learning.total_corrections)} color="text-[#22C55E]" />
          <KpiCard icon={Zap} label="Règles auto" value={safeNum(learning.auto_rules)} color="text-[#F97316]" />
          <KpiCard icon={ThumbsUp} label="Satisfaction chat" value={formatPct(learning.chat_satisfaction_pct)} color="text-[#3B82F6]" />
          <KpiCard icon={Target} label="Précision prix" value={formatPct(learning.price_precision_pct)} color="text-[#A855F7]" />
        </div>

        {/* Email learning */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">Boucle Email &mdash; Corrections</h3>
            {emailCorrections.length === 0 ? (
              <p className="text-xs text-[#71717A]">Aucune correction email</p>
            ) : (
              <div className="space-y-2.5">
                {emailCorrections.map((ec) => {
                  const maxC = Math.max(...emailCorrections.map((e) => e.count), 1);
                  const pct = Math.round((ec.count / maxC) * 100);
                  return (
                    <div key={ec.type}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-[#A1A1AA]">{ec.type}</span>
                        <span className="font-mono text-[#FAFAFA]">{ec.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#27272A]">
                        <div className="h-1.5 rounded-full bg-[#3B82F6]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-4 flex items-center gap-4 text-xs text-[#A1A1AA]">
              <span>R\u00e8gles sender : <strong className="text-[#FAFAFA]">{emailRules.sender_rules}</strong></span>
              <span>R\u00e8gles keyword : <strong className="text-[#FAFAFA]">{emailRules.keyword_rules}</strong></span>
            </div>
          </div>

          {/* Price calibration */}
          <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">Calibration Prix &mdash; Tendance erreur</h3>
            {priceErrorTrend.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={priceErrorTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis dataKey="month" tick={{ fill: "#71717A", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#71717A", fontSize: 10 }} tickLine={false} axisLine={false} unit="%" />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="error_pct" name="Erreur %" stroke="#F97316" fill="#F97316" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-[#71717A]">Pas de donn\u00e9es de calibration</p>
            )}
          </div>
        </div>

        {/* Recent calibrations table */}
        {recentCalibrations.length > 0 && (
          <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">Derni\u00e8res calibrations prix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#27272A]">
                    <th className="pb-2 text-left font-medium text-[#71717A]">CFC</th>
                    <th className="pb-2 text-right font-medium text-[#71717A]">Estim\u00e9</th>
                    <th className="pb-2 text-right font-medium text-[#71717A]">R\u00e9el</th>
                    <th className="pb-2 text-right font-medium text-[#71717A]">Coefficient</th>
                    <th className="pb-2 text-right font-medium text-[#71717A]">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentCalibrations.map((cal, i) => (
                    <tr key={i} className="border-b border-[#27272A]/50">
                      <td className="py-2 text-[#FAFAFA]">{cal.cfc_code}</td>
                      <td className="py-2 text-right font-mono text-[#A1A1AA]">{safeNum(cal.estimated).toFixed(2)}</td>
                      <td className="py-2 text-right font-mono text-[#FAFAFA]">{safeNum(cal.actual).toFixed(2)}</td>
                      <td className="py-2 text-right">
                        <span
                          className={`font-mono ${
                            cal.coefficient >= 0.9 && cal.coefficient <= 1.1
                              ? "text-[#22C55E]"
                              : cal.coefficient >= 0.7 && cal.coefficient <= 1.3
                              ? "text-[#F59E0B]"
                              : "text-[#EF4444]"
                          }`}
                        >
                          {safeNum(cal.coefficient).toFixed(3)}
                        </span>
                      </td>
                      <td className="py-2 text-right text-[#71717A]">{relativeTime(cal.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Other modules mini cards */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {(
            [
              { key: "pv" as const, label: "PV Chantier", icon: ClipboardList },
              { key: "visits" as const, label: "Visites", icon: HardHat },
              { key: "submissions" as const, label: "Soumissions", icon: FileText },
              { key: "tasks" as const, label: "T\u00e2ches", icon: CheckSquare },
            ] as const
          ).map((m) => {
            const data = otherModules[m.key];
            return (
              <div key={m.key} className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
                <div className="mb-2 flex items-center gap-2">
                  <m.icon className="h-4 w-4 text-[#71717A]" />
                  <span className="text-xs font-medium text-[#A1A1AA]">{m.label}</span>
                </div>
                <p className="text-lg font-bold text-[#FAFAFA]">{data.count}</p>
                <p className="text-[10px] text-[#52525B]">{data.last_date ? relativeTime(data.last_date) : "Aucune activit\u00e9"}</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderModules() {
    const mods = modules?.modules || [];
    if (!modules || mods.length === 0) return <EmptyState />;
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mods.map((mod) => {
          const Icon = MODULE_ICONS[mod.module] || Database;
          return (
            <div key={mod.module} className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
              <div className="mb-3 flex items-center gap-2">
                <Icon className="h-5 w-5 text-[#71717A]" />
                <span className="text-sm font-medium text-[#FAFAFA]">
                  {MODULE_LABELS[mod.module] || mod.module}
                </span>
              </div>
              <div className="mb-1 flex items-end gap-3">
                <span className="text-2xl font-bold text-[#FAFAFA]">{safeLoc(mod.total)}</span>
                <span className="mb-0.5 text-xs font-medium text-[#F97316]">
                  +{safeLoc(mod.period)}
                </span>
              </div>
              {/* Tiny sparkline */}
              {mod.sparkline.length > 1 && (
                <div className="my-2">
                  <ResponsiveContainer width="100%" height={60}>
                    <AreaChart data={mod.sparkline}>
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#F97316"
                        fill="#F97316"
                        fillOpacity={0.1}
                        strokeWidth={1.5}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="text-[10px] text-[#52525B]">
                Derni\u00e8re activit\u00e9 : {relativeTime(mod.last_activity)}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  function renderQuality() {
    if (!quality) return <EmptyState />;
    const monthlyAccuracy = quality.monthly_accuracy || [];
    const confidenceDist = quality.confidence_distribution || [];
    const corrByType = quality.corrections_by_type || [];
    return (
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <KpiCard icon={Target} label="Précision prix" value={formatPct(quality.price_precision_pct)} color="text-[#22C55E]" />
          <KpiCard icon={ShieldCheck} label="Confiance classif." value={formatPct(quality.classification_confidence_pct)} color="text-[#3B82F6]" />
          <KpiCard icon={Scale} label="Coefficient moyen" value={safeNum(quality.avg_coefficient).toFixed(3)} color="text-[#F97316]" />
          <KpiCard icon={ThumbsUp} label="Satisfaction chat" value={formatPct(quality.chat_satisfaction_pct)} color="text-[#A855F7]" />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Monthly accuracy evolution */}
          <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">\u00c9volution pr\u00e9cision prix</h3>
            {monthlyAccuracy.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={monthlyAccuracy}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis dataKey="month" tick={{ fill: "#71717A", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#71717A", fontSize: 10 }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Area type="monotone" dataKey="accuracy" name="Pr\u00e9cision %" stroke="#22C55E" fill="#22C55E" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-[#71717A]">Pas de donn\u00e9es disponibles</p>
            )}
          </div>

          {/* Confidence distribution */}
          <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">Distribution confiance classification</h3>
            {confidenceDist.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={confidenceDist}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis dataKey="bucket" tick={{ fill: "#71717A", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: "#71717A", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip {...CHART_TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Emails" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-[#71717A]">Pas de donn\u00e9es disponibles</p>
            )}
          </div>
        </div>

        {/* Corrections by type horizontal */}
        {corrByType.length > 0 && (
          <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">Corrections par type</h3>
            <div className="space-y-2.5">
              {corrByType
                .sort((a, b) => b.count - a.count)
                .map((ct) => {
                  const maxC = Math.max(...corrByType.map((c) => c.count), 1);
                  const pct = Math.round((ct.count / maxC) * 100);
                  return (
                    <div key={ct.type}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-[#A1A1AA]">{ct.type}</span>
                        <span className="font-mono text-[#FAFAFA]">{ct.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[#27272A]">
                        <div className="h-1.5 rounded-full bg-[#F97316]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderCost() {
    if (!cost) return <EmptyState />;
    const costTrend = cost.daily_trend || [];
    return (
      <div className="space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <KpiCard icon={Calculator} label="Coût IA total" value={formatCHF(safeNum(cost.total_ai_cost))} color="text-[#3B82F6]" sub={period} />
          <KpiCard icon={Database} label="Points apprentissage" value={safeLoc(cost.total_learning_points)} color="text-[#F97316]" sub={period} />
          <KpiCard
            icon={Scale}
            label="Coût par point"
            value={safeNum(cost.cost_per_point) > 0 ? formatCHF(cost.cost_per_point) : "N/A"}
            color="text-[#22C55E]"
          />
        </div>

        {/* Dual axis daily trend */}
        {costTrend.length > 0 && (
          <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
              Co\u00fbt IA vs Points d&apos;apprentissage
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={costTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                <XAxis dataKey="date" tick={{ fill: "#71717A", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="cost" tick={{ fill: "#71717A", fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="points" orientation="right" tick={{ fill: "#71717A", fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Area yAxisId="cost" type="monotone" dataKey="cost" name="Co\u00fbt IA (CHF)" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.15} strokeWidth={2} />
                <Area yAxisId="points" type="monotone" dataKey="points" name="Points apprentissage" stroke="#F97316" fill="#F97316" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="mt-3 flex items-center justify-center gap-6 text-xs text-[#71717A]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-[#3B82F6]" />
                Co\u00fbt IA (CHF)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-[#F97316]" />
                Points apprentissage
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Tab content dispatcher
  // -------------------------------------------------------------------------

  function renderTabContent() {
    switch (tab) {
      case "health":
        return renderHealth();
      case "learning":
        return renderLearning();
      case "modules":
        return renderModules();
      case "quality":
        return renderQuality();
      case "cost":
        return renderCost();
      default:
        return null;
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen space-y-6 bg-[#0F0F11] p-6">
      {/* Header + Period Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-[#FAFAFA]">
            <GitBranch className="h-6 w-6 text-[#F97316]" />
            Pipeline de Donn\u00e9es
          </h1>
          <p className="mt-1 text-sm text-[#A1A1AA]">
            Suivi de l&apos;enrichissement et de l&apos;apprentissage IA
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-[#18181B] p-0.5">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-[#F97316] text-[#FAFAFA] shadow-sm"
                  : "text-[#A1A1AA] hover:text-[#FAFAFA]"
              }`}
            >
              {p === "7d" ? "7 jours" : p === "30d" ? "30 jours" : "90 jours"}
            </button>
          ))}
        </div>
      </div>

      {/* Tab buttons */}
      <div className="flex gap-1 overflow-x-auto rounded-lg bg-[#18181B] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key
                ? "bg-[#F97316] text-[#FAFAFA] shadow-sm"
                : "text-[#A1A1AA] hover:text-[#FAFAFA]"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {renderTabContent()}
    </div>
  );
}
