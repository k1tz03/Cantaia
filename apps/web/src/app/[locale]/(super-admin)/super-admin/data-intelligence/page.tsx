"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Brain,
  Activity,
  GraduationCap,
  ShieldCheck,
  BarChart3,
  Sparkles,
  HandCoins,
  Database,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Target,
  MessageSquare,
  FileText,
  Eye,
  ListChecks,
  ChevronRight,
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
  Legend,
} from "recharts";

// ─── Types ─────────────────────────────────────────────────────

interface PipelineData {
  pending_count: number;
  processed_count: number;
  last_hourly_cron: string | null;
  last_weekly_cron: string | null;
  health: "healthy" | "warning" | "error" | "empty";
  queue_breakdown: Record<string, number>;
}

interface ConsentModule {
  module: string;
  opted_in: number;
  total_orgs: number;
}

interface ConsentData {
  modules: ConsentModule[];
  total_opt_in_rate: number;
  total_orgs: number;
}

interface C2TableCount {
  table: string;
  label: string;
  count: number;
  error?: boolean;
}

interface C2Data {
  tables: C2TableCount[];
  cfc_coverage: number;
  total_c2_records: number;
}

interface MetricEntry {
  metric_type: string;
  current_value: number;
  current_period: string;
  previous_value: number | null;
  trend: number | null;
}

interface C3Data {
  metrics_by_module: Record<string, MetricEntry[]>;
  patterns_by_module: Record<string, { count: number; avg_confidence: number }>;
  recent_optimizations: Array<{
    id: string;
    module: string;
    prompt_version: string;
    improvement_pct: number | null;
    deployed_at: string;
  }>;
  total_metrics: number;
  total_patterns: number;
}

interface HealthData {
  status: string;
  total_points: number;
  period_points: number;
  ai_calls: number;
  queue_pending: number;
  module_breakdown: Record<string, number>;
  daily_trend: Array<{ date: string; ai_calls: number; learning_points: number }>;
}

interface LearningData {
  corrections: number;
  auto_rules: number;
  chat_satisfaction: number;
  price_accuracy: number;
  email_corrections: Record<string, number>;
  sender_rules: number;
  keyword_rules: number;
  price_trend: Array<{ month: string; error_pct: number }>;
  recent_calibrations: Array<{
    cfc: string;
    estimated: number;
    actual: number;
    coefficient: number;
    date: string;
  }>;
  pv_count: number;
  pv_last: string | null;
  visits_count: number;
  visits_last: string | null;
  submissions_count: number;
  submissions_last: string | null;
  tasks_count: number;
  tasks_last: string | null;
}

interface QualityData {
  price_accuracy: number;
  classification_confidence: number;
  avg_coefficient: number;
  chat_satisfaction: number;
  monthly_accuracy: Array<{ month: string; accuracy: number; confidence: number }>;
  confidence_distribution: Array<{ range: string; count: number }>;
  corrections_by_type: Record<string, number>;
}

interface CostData {
  total_cost: number;
  intelligence_score: number;
  cost_per_point: number;
  daily_trend: Array<{ date: string; cost: number; score: number }>;
}

// ─── Constants ─────────────────────────────────────────────────

type TabKey = "health" | "learning" | "quality" | "c2" | "c3" | "consent";

const TABS: { key: TabKey; label: string; icon: typeof Activity }[] = [
  { key: "health", label: "Sant\u00e9 Pipeline", icon: Activity },
  { key: "learning", label: "Apprentissage", icon: GraduationCap },
  { key: "quality", label: "Qualit\u00e9 Donn\u00e9es", icon: ShieldCheck },
  { key: "c2", label: "Benchmarks C2", icon: BarChart3 },
  { key: "c3", label: "Patterns C3", icon: Sparkles },
  { key: "consent", label: "Consentements", icon: HandCoins },
];

const MODULE_LABELS: Record<string, string> = {
  prix: "Prix & Soumissions",
  fournisseurs: "Fournisseurs",
  plans: "Plans",
  pv: "PV de chantier",
  visites: "Visites client",
  chat: "Chat IA",
  mail: "Messagerie",
  taches: "T\u00e2ches",
  briefing: "Briefing",
  soumissions: "Soumissions",
};

const HEALTH_CONFIG: Record<string, { color: string; dot: string; label: string }> = {
  healthy: {
    color: "bg-emerald-900/30 text-emerald-400",
    dot: "bg-emerald-500",
    label: "Pipeline actif",
  },
  warning: {
    color: "bg-yellow-900/30 text-yellow-400",
    dot: "bg-yellow-500",
    label: "Pipeline non configur\u00e9",
  },
  error: {
    color: "bg-red-900/30 text-red-400",
    dot: "bg-red-500",
    label: "Pipeline en erreur",
  },
  empty: {
    color: "bg-[#1C1C1F] text-[#A1A1AA]",
    dot: "bg-[#71717A]",
    label: "En attente de donn\u00e9es",
  },
};

const CHART_TOOLTIP = {
  contentStyle: {
    backgroundColor: "#18181B",
    border: "1px solid #27272A",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#FAFAFA",
  },
  itemStyle: { color: "#A1A1AA" },
};

type PeriodKey = "7d" | "30d" | "90d";

// ─── Helpers ───────────────────────────────────────────────────

function formatRelative(iso: string | null): string {
  if (!iso) return "Jamais";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "\u00c0 l\u2019instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

function formatCHF(n: number): string {
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

// ─── Shared Sub-Components ─────────────────────────────────────

function TrendBadge({ value }: { value: number | null }) {
  if (value === null)
    return <Minus className="inline h-4 w-4 text-[#52525B]" />;
  if (value > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-emerald-400">
        <TrendingUp className="h-3 w-3" />+{value.toFixed(1)}%
      </span>
    );
  if (value < 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-400">
        <TrendingDown className="h-3 w-3" />
        {value.toFixed(1)}%
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-[#71717A]">
      <Minus className="h-3 w-3" />
      0%
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-[#A1A1AA]">{label}</p>
          <p className="text-xl font-bold text-[#FAFAFA]">{value}</p>
          {sub && <p className="truncate text-[11px] text-[#52525B]">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-[#27272A] bg-[#1C1C1F] p-10 text-center">
      <Database className="mx-auto h-10 w-10 text-[#52525B]" />
      <p className="mt-3 text-sm font-medium text-[#A1A1AA]">{message}</p>
      {detail && <p className="mt-1 text-xs text-[#52525B]">{detail}</p>}
    </div>
  );
}

function ErrorCard() {
  return (
    <div className="rounded-xl border border-red-900/40 bg-red-900/20 p-6 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-red-400" />
      <p className="mt-2 text-sm text-red-400">
        Erreur de chargement. Les tables data intelligence ne sont peut-\u00eatre
        pas encore appliqu\u00e9es sur Supabase.
      </p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────

export default function DataIntelligencePage() {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("health");
  const [period, setPeriod] = useState<PeriodKey>("30d");

  // From data-intelligence API
  const [pipelineData, setPipelineData] = useState<PipelineData | null>(null);
  const [consentData, setConsentData] = useState<ConsentData | null>(null);
  const [c2Data, setC2Data] = useState<C2Data | null>(null);
  const [c3Data, setC3Data] = useState<C3Data | null>(null);

  // From data-pipeline API
  const [health, setHealth] = useState<HealthData | null>(null);
  const [learning, setLearning] = useState<LearningData | null>(null);
  const [quality, setQuality] = useState<QualityData | null>(null);
  const [cost, setCost] = useState<CostData | null>(null);

  const loadAll = useCallback(
    async (p: PeriodKey = period) => {
      setLoading(true);
      try {
        const [
          pipelineRes,
          consentRes,
          c2Res,
          c3Res,
          healthRes,
          learningRes,
          qualityRes,
          costRes,
        ] = await Promise.all([
          fetch("/api/super-admin/data-intelligence?action=pipeline-status").then((r) =>
            r.ok ? r.json() : null
          ),
          fetch("/api/super-admin/data-intelligence?action=consent-overview").then((r) =>
            r.ok ? r.json() : null
          ),
          fetch("/api/super-admin/data-intelligence?action=c2-coverage").then((r) =>
            r.ok ? r.json() : null
          ),
          fetch("/api/super-admin/data-intelligence?action=c3-quality").then((r) =>
            r.ok ? r.json() : null
          ),
          fetch(`/api/super-admin/data-pipeline?action=health-overview&period=${p}`).then(
            (r) => (r.ok ? r.json() : null)
          ),
          fetch(
            `/api/super-admin/data-pipeline?action=learning-progress&period=${p}`
          ).then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/super-admin/data-pipeline?action=data-quality&period=${p}`).then(
            (r) => (r.ok ? r.json() : null)
          ),
          fetch(
            `/api/super-admin/data-pipeline?action=cost-vs-intelligence&period=${p}`
          ).then((r) => (r.ok ? r.json() : null)),
        ]);
        setPipelineData(pipelineRes);
        setConsentData(consentRes);
        setC2Data(c2Res);
        setC3Data(c3Res);
        setHealth(healthRes);
        setLearning(learningRes);
        setQuality(qualityRes);
        setCost(costRes);
      } catch (err) {
        console.error("Failed to load data intelligence:", err);
      } finally {
        setLoading(false);
      }
    },
    [period]
  );

  useEffect(() => {
    loadAll(period);
  }, [loadAll, period]);

  function handlePeriod(p: PeriodKey) {
    setPeriod(p);
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#0F0F11]">
        <Loader2 className="h-8 w-8 animate-spin text-[#F97316]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0F11] p-6">
      {/* ── Header ────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F97316]/10">
            <Brain className="h-5 w-5 text-[#F97316]" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-[#FAFAFA]">
              Data &amp; Intelligence
            </h1>
            <p className="text-sm text-[#A1A1AA]">
              Pipeline d&apos;enrichissement, apprentissage IA et benchmarks collectifs
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Period selector */}
          <div className="flex rounded-lg border border-[#27272A] bg-[#18181B] p-0.5">
            {(["7d", "30d", "90d"] as PeriodKey[]).map((p) => (
              <button
                key={p}
                onClick={() => handlePeriod(p)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p
                    ? "bg-[#F97316] text-[#FAFAFA]"
                    : "text-[#A1A1AA] hover:text-[#FAFAFA]"
                }`}
              >
                {p === "7d" ? "7j" : p === "30d" ? "30j" : "90j"}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <button
            onClick={() => loadAll(period)}
            className="flex items-center gap-2 rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-sm text-[#A1A1AA] transition-colors hover:bg-[#27272A] hover:text-[#FAFAFA]"
          >
            <RefreshCw className="h-4 w-4" />
            Actualiser
          </button>
        </div>
      </div>

      {/* ── Tabs ──────────────────────────────────────── */}
      <div className="mb-6 rounded-xl bg-[#18181B] p-1">
        <div className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-[#F97316] text-[#FAFAFA]"
                  : "text-[#A1A1AA] hover:bg-[#27272A]/60 hover:text-[#FAFAFA]"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ───────────────────────────────── */}
      {activeTab === "health" && (
        <HealthTab health={health} pipeline={pipelineData} />
      )}
      {activeTab === "learning" && <LearningTab data={learning} />}
      {activeTab === "quality" && <QualityTab data={quality} />}
      {activeTab === "c2" && <C2Tab data={c2Data} />}
      {activeTab === "c3" && <C3Tab data={c3Data} />}
      {activeTab === "consent" && (
        <ConsentTab
          data={consentData}
          cost={cost}
          onRefresh={() => loadAll(period)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 1: Sant\u00e9 Pipeline
// ═══════════════════════════════════════════════════════════════

function HealthTab({
  health,
  pipeline,
}: {
  health: HealthData | null;
  pipeline: PipelineData | null;
}) {
  const healthStatus = health?.status || pipeline?.health || "empty";
  const cfg = HEALTH_CONFIG[healthStatus] || HEALTH_CONFIG.empty;

  const totalPoints = health?.total_points ?? 0;
  const periodPoints = health?.period_points ?? 0;
  const aiCalls = health?.ai_calls ?? 0;
  const queuePending = health?.queue_pending ?? pipeline?.pending_count ?? 0;

  const pendingCount = pipeline?.pending_count ?? queuePending;
  const processedCount = pipeline?.processed_count ?? 0;
  const lastHourlyCron = pipeline?.last_hourly_cron ?? null;
  const lastWeeklyCron = pipeline?.last_weekly_cron ?? null;

  const moduleBreakdown = health?.module_breakdown
    ? Object.entries(health.module_breakdown).sort(([, a], [, b]) => b - a)
    : [];
  const maxModuleVal =
    moduleBreakdown.length > 0 ? moduleBreakdown[0][1] : 1;

  const dailyTrend = health?.daily_trend ?? [];
  const queueBreakdown = pipeline?.queue_breakdown
    ? Object.entries(pipeline.queue_breakdown)
    : [];

  return (
    <div className="space-y-6">
      {/* Health badge */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${cfg.color}`}
        >
          <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {/* KPI row 1 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Zap}
          label="Total points"
          value={totalPoints.toLocaleString("fr-CH")}
          color="bg-emerald-900/30 text-emerald-400"
        />
        <KpiCard
          icon={Target}
          label="Points p\u00e9riode"
          value={periodPoints.toLocaleString("fr-CH")}
          color="bg-[#F97316]/10 text-[#F97316]"
        />
        <KpiCard
          icon={Brain}
          label="Appels IA"
          value={aiCalls.toLocaleString("fr-CH")}
          color="bg-blue-900/30 text-blue-400"
        />
        <KpiCard
          icon={Clock}
          label="File d&apos;attente"
          value={queuePending.toLocaleString("fr-CH")}
          color="bg-amber-900/30 text-[#F59E0B]"
        />
      </div>

      {/* KPI row 2 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Clock}
          label="En attente"
          value={pendingCount}
          color="bg-amber-900/30 text-[#F59E0B]"
        />
        <KpiCard
          icon={CheckCircle}
          label="Trait\u00e9s"
          value={processedCount}
          color="bg-emerald-900/30 text-emerald-400"
        />
        <KpiCard
          icon={RefreshCw}
          label="Dernier CRON horaire"
          value={formatRelative(lastHourlyCron)}
          color="bg-blue-900/30 text-blue-400"
        />
        <KpiCard
          icon={Sparkles}
          label="Dernier CRON hebdo"
          value={formatRelative(lastWeeklyCron)}
          color="bg-violet-900/30 text-violet-400"
        />
      </div>

      {/* Module breakdown */}
      {moduleBreakdown.length > 0 && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            R\u00e9partition par module
          </h3>
          <div className="space-y-3">
            {moduleBreakdown.map(([mod, val]) => {
              const pct = maxModuleVal > 0 ? (val / maxModuleVal) * 100 : 0;
              return (
                <div key={mod}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-[#A1A1AA]">
                      {MODULE_LABELS[mod] || mod}
                    </span>
                    <span className="text-sm font-medium text-[#FAFAFA]">
                      {val}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#27272A]">
                    <div
                      className="h-2 rounded-full bg-[#F97316] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Daily trend chart */}
      {dailyTrend.length > 0 && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Tendance quotidienne
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                <XAxis dataKey="date" tick={{ fill: "#71717A", fontSize: 11 }} />
                <YAxis tick={{ fill: "#71717A", fontSize: 11 }} />
                <Tooltip {...CHART_TOOLTIP} />
                <Legend
                  wrapperStyle={{ color: "#A1A1AA", fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="ai_calls"
                  name="Appels IA"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="learning_points"
                  name="Points apprentissage"
                  stroke="#F97316"
                  fill="#F97316"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Queue breakdown */}
      {queueBreakdown.length > 0 && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">
            File d&apos;attente par source
          </h3>
          <div className="space-y-2">
            {queueBreakdown.map(([table, count]) => (
              <div
                key={table}
                className="flex items-center justify-between rounded-lg bg-[#1C1C1F] px-4 py-2.5"
              >
                <span className="text-sm text-[#A1A1AA]">{table}</span>
                <span className="text-sm font-medium text-[#FAFAFA]">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {healthStatus === "empty" && !pipeline && (
        <EmptyState
          message="Aucun \u00e9v\u00e9nement dans la file d&apos;attente"
          detail="Les triggers ins\u00e9reront des \u00e9v\u00e9nements lors de l&apos;utilisation de la plateforme."
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 2: Apprentissage
// ═══════════════════════════════════════════════════════════════

function LearningTab({ data }: { data: LearningData | null }) {
  if (!data) return <ErrorCard />;

  const emailCorrEntries = data.email_corrections
    ? Object.entries(data.email_corrections).sort(([, a], [, b]) => b - a)
    : [];
  const maxEmailCorr =
    emailCorrEntries.length > 0
      ? Math.max(...emailCorrEntries.map(([, v]) => v), 1)
      : 1;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Target}
          label="Corrections"
          value={data.corrections}
          color="bg-[#F97316]/10 text-[#F97316]"
        />
        <KpiCard
          icon={Zap}
          label="R\u00e8gles auto"
          value={data.auto_rules}
          color="bg-emerald-900/30 text-emerald-400"
        />
        <KpiCard
          icon={MessageSquare}
          label="Satisfaction chat"
          value={formatPct(data.chat_satisfaction)}
          color="bg-blue-900/30 text-blue-400"
        />
        <KpiCard
          icon={BarChart3}
          label="Pr\u00e9cision prix"
          value={formatPct(data.price_accuracy)}
          color="bg-violet-900/30 text-violet-400"
        />
      </div>

      {/* 2-column */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Email corrections */}
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Corrections email par type
          </h3>
          {emailCorrEntries.length > 0 ? (
            <div className="space-y-3">
              {emailCorrEntries.map(([type, count]) => (
                <div key={type}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-[#A1A1AA]">{type}</span>
                    <span className="text-sm font-medium text-[#FAFAFA]">
                      {count}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#27272A]">
                    <div
                      className="h-2 rounded-full bg-blue-500 transition-all"
                      style={{
                        width: `${(count / maxEmailCorr) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="mt-4 flex gap-4 border-t border-[#27272A] pt-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-[#FAFAFA]">
                    {data.sender_rules}
                  </p>
                  <p className="text-[11px] text-[#71717A]">R\u00e8gles sender</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-[#FAFAFA]">
                    {data.keyword_rules}
                  </p>
                  <p className="text-[11px] text-[#71717A]">R\u00e8gles keyword</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#52525B]">Aucune correction email</p>
          )}
        </div>

        {/* Price calibration trend */}
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Tendance calibration prix
          </h3>
          {data.price_trend && data.price_trend.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.price_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#71717A", fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fill: "#71717A", fontSize: 11 }}
                    unit="%"
                  />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Area
                    type="monotone"
                    dataKey="error_pct"
                    name="Erreur %"
                    stroke="#F97316"
                    fill="#F97316"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-[#52525B]">
              Pas encore de donn\u00e9es de calibration
            </p>
          )}
        </div>
      </div>

      {/* Recent calibrations table */}
      {data.recent_calibrations && data.recent_calibrations.length > 0 && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Calibrations r\u00e9centes
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#27272A]">
                  <th className="px-3 py-2 text-left text-xs font-medium text-[#71717A]">
                    CFC
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[#71717A]">
                    Estim\u00e9
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[#71717A]">
                    R\u00e9el
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[#71717A]">
                    Coefficient
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-[#71717A]">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recent_calibrations.map((cal, idx) => (
                  <tr
                    key={`${cal.cfc}-${idx}`}
                    className="border-b border-[#27272A]/50"
                  >
                    <td className="px-3 py-2 font-mono text-[#A1A1AA]">
                      {cal.cfc}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[#A1A1AA]">
                      {formatCHF(cal.estimated)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[#FAFAFA]">
                      {formatCHF(cal.actual)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`font-mono font-medium ${
                          cal.coefficient > 1.1
                            ? "text-red-400"
                            : cal.coefficient < 0.9
                            ? "text-emerald-400"
                            : "text-[#FAFAFA]"
                        }`}
                      >
                        {cal.coefficient.toFixed(3)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-[#71717A]">
                      {formatRelative(cal.date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4 mini cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            icon: FileText,
            label: "PV",
            count: data.pv_count,
            last: data.pv_last,
          },
          {
            icon: Eye,
            label: "Visites",
            count: data.visits_count,
            last: data.visits_last,
          },
          {
            icon: ListChecks,
            label: "Soumissions",
            count: data.submissions_count,
            last: data.submissions_last,
          },
          {
            icon: CheckCircle,
            label: "T\u00e2ches",
            count: data.tasks_count,
            last: data.tasks_last,
          },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-[#27272A] bg-[#18181B] p-4"
          >
            <div className="flex items-center gap-2">
              <item.icon className="h-4 w-4 text-[#71717A]" />
              <span className="text-xs text-[#A1A1AA]">{item.label}</span>
            </div>
            <p className="mt-1 text-lg font-bold text-[#FAFAFA]">
              {item.count}
            </p>
            <p className="text-[11px] text-[#52525B]">
              {item.last ? formatRelative(item.last) : "Aucune activit\u00e9"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 3: Qualit\u00e9 Donn\u00e9es
// ═══════════════════════════════════════════════════════════════

function QualityTab({ data }: { data: QualityData | null }) {
  if (!data) return <ErrorCard />;

  const corrEntries = data.corrections_by_type
    ? Object.entries(data.corrections_by_type).sort(([, a], [, b]) => b - a)
    : [];
  const maxCorr =
    corrEntries.length > 0
      ? Math.max(...corrEntries.map(([, v]) => v), 1)
      : 1;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Target}
          label="Pr\u00e9cision prix"
          value={formatPct(data.price_accuracy)}
          color="bg-emerald-900/30 text-emerald-400"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Confiance classif."
          value={formatPct(data.classification_confidence)}
          color="bg-blue-900/30 text-blue-400"
        />
        <KpiCard
          icon={BarChart3}
          label="Coefficient moyen"
          value={data.avg_coefficient.toFixed(3)}
          color="bg-[#F97316]/10 text-[#F97316]"
        />
        <KpiCard
          icon={MessageSquare}
          label="Satisfaction chat"
          value={formatPct(data.chat_satisfaction)}
          color="bg-violet-900/30 text-violet-400"
        />
      </div>

      {/* 2-column charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly accuracy evolution */}
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            \u00c9volution mensuelle
          </h3>
          {data.monthly_accuracy && data.monthly_accuracy.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthly_accuracy}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#71717A", fontSize: 11 }}
                  />
                  <YAxis tick={{ fill: "#71717A", fontSize: 11 }} />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend
                    wrapperStyle={{ color: "#A1A1AA", fontSize: 12 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="accuracy"
                    name="Pr\u00e9cision"
                    stroke="#22C55E"
                    fill="#22C55E"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="confidence"
                    name="Confiance"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-[#52525B]">Pas encore de donn\u00e9es</p>
          )}
        </div>

        {/* Confidence distribution */}
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Distribution de confiance
          </h3>
          {data.confidence_distribution &&
          data.confidence_distribution.length > 0 ? (
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.confidence_distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis
                    dataKey="range"
                    tick={{ fill: "#71717A", fontSize: 11 }}
                  />
                  <YAxis tick={{ fill: "#71717A", fontSize: 11 }} />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Bar
                    dataKey="count"
                    name="Emails"
                    fill="#F97316"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-[#52525B]">Pas encore de donn\u00e9es</p>
          )}
        </div>
      </div>

      {/* Corrections by type */}
      {corrEntries.length > 0 && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Corrections par type
          </h3>
          <div className="space-y-3">
            {corrEntries.map(([type, count]) => (
              <div key={type}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-[#A1A1AA]">{type}</span>
                  <span className="text-sm font-medium text-[#FAFAFA]">
                    {count}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#27272A]">
                  <div
                    className="h-2 rounded-full bg-violet-500 transition-all"
                    style={{ width: `${(count / maxCorr) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 4: Benchmarks C2
// ═══════════════════════════════════════════════════════════════

function C2Tab({ data }: { data: C2Data | null }) {
  if (!data) return <ErrorCard />;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          icon={Database}
          label="Total entr\u00e9es C2"
          value={data.total_c2_records.toLocaleString("fr-CH")}
          color="bg-emerald-900/30 text-emerald-400"
        />
        <KpiCard
          icon={BarChart3}
          label="Codes CFC couverts"
          value={data.cfc_coverage}
          color="bg-blue-900/30 text-blue-400"
        />
        <KpiCard
          icon={ListChecks}
          label="R\u00e8gles normalisation"
          value={
            data.tables.find((t) => t.table === "normalization_rules")?.count ??
            0
          }
          color="bg-[#F97316]/10 text-[#F97316]"
        />
      </div>

      {/* Table counts grid */}
      <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
          Tables C2 \u2014 Couverture
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.tables.map((t) => (
            <div
              key={t.table}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                t.count > 0
                  ? "border-emerald-800/60 bg-emerald-900/20"
                  : "border-[#27272A] bg-[#1C1C1F]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    t.count > 0 ? "bg-emerald-500" : "bg-[#52525B]"
                  }`}
                />
                <span className="text-sm text-[#A1A1AA]">{t.label}</span>
              </div>
              <span
                className={`text-sm font-bold ${
                  t.count > 0 ? "text-emerald-400" : "text-[#52525B]"
                }`}
              >
                {t.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {data.total_c2_records === 0 && (
        <EmptyState
          message="Aucune donn\u00e9e C2 encore agr\u00e9g\u00e9e"
          detail="Les benchmarks seront g\u00e9n\u00e9r\u00e9s quand \u22653 organisations contribueront au m\u00eame module et que le CRON horaire s&apos;ex\u00e9cutera."
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 5: Patterns C3
// ═══════════════════════════════════════════════════════════════

function C3Tab({ data }: { data: C3Data | null }) {
  if (!data) return <ErrorCard />;

  const hasMetrics = data.total_metrics > 0;
  const hasPatterns = data.total_patterns > 0;
  const moduleKeys = Object.keys(data.metrics_by_module);
  const patternKeys = Object.keys(data.patterns_by_module);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Brain}
          label="M\u00e9triques IA"
          value={data.total_metrics}
          color="bg-[#F97316]/10 text-[#F97316]"
        />
        <KpiCard
          icon={Sparkles}
          label="Patterns appris"
          value={data.total_patterns}
          color="bg-violet-900/30 text-violet-400"
        />
        <KpiCard
          icon={BarChart3}
          label="Modules avec m\u00e9triques"
          value={moduleKeys.length}
          color="bg-blue-900/30 text-blue-400"
        />
        <KpiCard
          icon={Zap}
          label="Optimisations prompts"
          value={data.recent_optimizations.length}
          color="bg-emerald-900/30 text-emerald-400"
        />
      </div>

      {/* Metrics by module */}
      {hasMetrics && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            M\u00e9triques qualit\u00e9 par module
          </h3>
          <div className="space-y-5">
            {moduleKeys.map((mod) => (
              <div key={mod}>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-[#A1A1AA]">
                  <ChevronRight className="h-3.5 w-3.5 text-[#52525B]" />
                  {MODULE_LABELS[mod] || mod}
                </h4>
                <div className="overflow-x-auto rounded-lg border border-[#27272A]">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#1C1C1F]">
                        <th className="px-3 py-2 text-left text-xs font-medium text-[#71717A]">
                          M\u00e9trique
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-[#71717A]">
                          Valeur
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-[#71717A]">
                          Pr\u00e9c\u00e9dent
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-[#71717A]">
                          Trend
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-[#71717A]">
                          P\u00e9riode
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.metrics_by_module[mod].map((m) => (
                        <tr
                          key={m.metric_type}
                          className="border-t border-[#27272A]/50"
                        >
                          <td className="px-3 py-2 text-[#A1A1AA]">
                            {m.metric_type}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-medium text-[#FAFAFA]">
                            {typeof m.current_value === "number"
                              ? m.current_value.toFixed(3)
                              : m.current_value}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[#52525B]">
                            {m.previous_value !== null
                              ? m.previous_value.toFixed(3)
                              : "\u2014"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <TrendBadge value={m.trend} />
                          </td>
                          <td className="px-3 py-2 text-right text-xs text-[#52525B]">
                            {m.current_period}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pattern library */}
      {hasPatterns && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Biblioth\u00e8que de patterns
          </h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {patternKeys.map((mod) => {
              const p = data.patterns_by_module[mod];
              return (
                <div
                  key={mod}
                  className="rounded-xl border border-violet-800/40 bg-violet-900/20 p-4"
                >
                  <p className="text-xs font-medium text-violet-400">
                    {MODULE_LABELS[mod] || mod}
                  </p>
                  <p className="mt-1 text-xl font-bold text-[#FAFAFA]">
                    {p.count}
                    <span className="ml-1 text-sm font-normal text-[#71717A]">
                      patterns
                    </span>
                  </p>
                  <p className="text-xs text-violet-400/70">
                    Confiance moy. {(p.avg_confidence * 100).toFixed(0)}%
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent prompt optimizations */}
      {data.recent_optimizations.length > 0 && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Optimisations de prompts r\u00e9centes
          </h3>
          <div className="space-y-2">
            {data.recent_optimizations.map((opt) => (
              <div
                key={opt.id}
                className="flex items-center justify-between rounded-lg bg-[#1C1C1F] px-4 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#A1A1AA]">
                    {opt.module}
                  </span>
                  <span className="rounded bg-[#27272A] px-1.5 py-0.5 text-[10px] font-mono text-[#71717A]">
                    v{opt.prompt_version}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {opt.improvement_pct != null && (
                    <TrendBadge value={opt.improvement_pct} />
                  )}
                  <span className="text-xs text-[#52525B]">
                    {formatRelative(opt.deployed_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasMetrics && !hasPatterns && (
        <EmptyState
          message="Aucune m\u00e9trique IA encore calcul\u00e9e"
          detail="Le CRON hebdomadaire g\u00e9n\u00e9rera les premi\u00e8res m\u00e9triques dimanche \u00e0 3h du matin."
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// TAB 6: Consentements
// ═══════════════════════════════════════════════════════════════

function ConsentTab({
  data,
  cost,
  onRefresh,
}: {
  data: ConsentData | null;
  cost: CostData | null;
  onRefresh: () => void;
}) {
  const [triggering, setTriggering] = useState<string | null>(null);
  const [result, setResult] = useState<{
    action: string;
    data: Record<string, unknown>;
    success: boolean;
  } | null>(null);

  async function triggerCron(action: string) {
    setTriggering(action);
    setResult(null);
    try {
      const res = await fetch("/api/super-admin/data-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const resData = await res.json();
      setResult({ action, data: resData, success: res.ok });
      onRefresh();
    } catch (err: unknown) {
      setResult({
        action,
        data: {
          error: err instanceof Error ? err.message : "Unknown error",
        },
        success: false,
      });
    } finally {
      setTriggering(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Global opt-in rate */}
      {data && (
        <>
          <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#A1A1AA]">
                  Taux global d&apos;opt-in
                </p>
                <p className="mt-1 text-4xl font-bold text-[#FAFAFA]">
                  {data.total_opt_in_rate}
                  <span className="text-xl text-[#71717A]">%</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-[#A1A1AA]">Organisations</p>
                <p className="mt-1 text-3xl font-bold text-[#FAFAFA]">
                  {data.total_orgs}
                </p>
              </div>
            </div>
          </div>

          {/* Per module progress */}
          <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
            <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
              Consentement par module
            </h3>
            <div className="space-y-3">
              {data.modules.map((mod) => {
                const pct =
                  mod.total_orgs > 0
                    ? Math.round((mod.opted_in / mod.total_orgs) * 100)
                    : 0;
                return (
                  <div key={mod.module}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm text-[#A1A1AA]">
                        {MODULE_LABELS[mod.module] || mod.module}
                      </span>
                      <span className="text-xs text-[#71717A]">
                        {mod.opted_in} / {mod.total_orgs} orgs
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[#27272A]">
                      <div
                        className="h-2 rounded-full bg-[#F59E0B] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {data.total_orgs === 0 && (
              <p className="mt-4 text-center text-sm text-[#52525B]">
                Aucune organisation inscrite. Les organisations peuvent activer le
                partage dans Param\u00e8tres \u2192 Partage de donn\u00e9es.
              </p>
            )}
          </div>
        </>
      )}

      {/* Manual actions */}
      <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
        <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
          Actions manuelles
        </h3>

        {/* Warning banner */}
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-800/40 bg-amber-900/20 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <p className="text-xs text-amber-400">
            Ces actions s&apos;ex\u00e9cutent normalement automatiquement via Vercel CRON.
            Utilisez-les uniquement pour les tests ou le d\u00e9bogage.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => triggerCron("trigger-aggregate")}
            disabled={triggering !== null}
            className="flex items-center justify-center gap-2 rounded-lg border border-[#27272A] bg-[#1C1C1F] px-4 py-3 text-sm font-medium text-[#A1A1AA] transition-colors hover:bg-[#27272A] hover:text-[#FAFAFA] disabled:opacity-50"
          >
            {triggering === "trigger-aggregate" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Lancer agr\u00e9gation C2
          </button>
          <button
            onClick={() => triggerCron("trigger-patterns")}
            disabled={triggering !== null}
            className="flex items-center justify-center gap-2 rounded-lg border border-[#27272A] bg-[#1C1C1F] px-4 py-3 text-sm font-medium text-[#A1A1AA] transition-colors hover:bg-[#27272A] hover:text-[#FAFAFA] disabled:opacity-50"
          >
            {triggering === "trigger-patterns" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Lancer extraction C3
          </button>
        </div>

        {/* Result */}
        {result && (
          <div
            className={`mt-4 rounded-lg border p-4 ${
              result.success
                ? "border-emerald-800/40 bg-emerald-900/20"
                : "border-red-800/40 bg-red-900/20"
            }`}
          >
            <p
              className={`mb-2 text-sm font-medium ${
                result.success ? "text-emerald-400" : "text-red-400"
              }`}
            >
              R\u00e9sultat \u2014 {result.action}
            </p>
            <pre className="overflow-x-auto rounded-lg bg-[#0F0F11] p-3 text-xs text-[#FAFAFA]">
              {JSON.stringify(result.data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Cost vs Intelligence */}
      {cost && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 text-sm font-semibold text-[#FAFAFA]">
            Co\u00fbt vs Intelligence
          </h3>

          <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              icon={BarChart3}
              label="Co\u00fbt total IA"
              value={formatCHF(cost.total_cost)}
              color="bg-red-900/30 text-red-400"
            />
            <KpiCard
              icon={Brain}
              label="Score intelligence"
              value={cost.intelligence_score}
              color="bg-[#F97316]/10 text-[#F97316]"
            />
            <KpiCard
              icon={Target}
              label="Co\u00fbt par point"
              value={formatCHF(cost.cost_per_point)}
              color="bg-blue-900/30 text-blue-400"
            />
          </div>

          {cost.daily_trend && cost.daily_trend.length > 0 && (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cost.daily_trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "#71717A", fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="cost"
                    tick={{ fill: "#71717A", fontSize: 11 }}
                    orientation="left"
                  />
                  <YAxis
                    yAxisId="score"
                    tick={{ fill: "#71717A", fontSize: 11 }}
                    orientation="right"
                  />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend
                    wrapperStyle={{ color: "#A1A1AA", fontSize: 12 }}
                  />
                  <Area
                    yAxisId="cost"
                    type="monotone"
                    dataKey="cost"
                    name="Co\u00fbt CHF"
                    stroke="#EF4444"
                    fill="#EF4444"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                  <Area
                    yAxisId="score"
                    type="monotone"
                    dataKey="score"
                    name="Score"
                    stroke="#F97316"
                    fill="#F97316"
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
