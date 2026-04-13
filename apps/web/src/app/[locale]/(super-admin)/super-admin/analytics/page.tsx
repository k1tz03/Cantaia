"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart3,
  Loader2,
  TrendingUp,
  Building2,
  Users,
  DollarSign,
  Zap,
  Database,
  Mail,
  FileText,
  CheckSquare,
  ClipboardList,
  Truck,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Activity,
  UserCheck,
  BarChart2,
  ChevronDown,
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlatformMetrics {
  totalUsers: number;
  totalOrgs: number;
  totalEmails: number;
  totalPlans: number;
  totalPlanUploaded: number;
  totalPlanIngested: number;
  totalPvs: number;
  totalTasks: number;
  totalSuppliers: number;
  totalOffers: number;
  storageGb?: number;
  mrr?: number;
  aiCallsThisMonth?: number;
  aiCostThisMonth?: number;
}

interface AnalyticsOverview {
  total_cost_chf: number;
  total_calls: number;
  avg_cost_per_call: number;
  projected_monthly: number;
}

interface PerAction {
  action_type: string;
  calls: number;
  cost: number;
}

interface PerOrg {
  org_id: string;
  org_name: string;
  plan: string;
  member_count: number;
  calls: number;
  cost: number;
  revenue_monthly: number;
  profit: number;
}

interface PerUser {
  user_id: string;
  name: string;
  email: string;
  org_name: string;
  calls: number;
  cost: number;
}

interface DailyTrend {
  date: string;
  calls: number;
  cost: number;
}

interface HourlyDist {
  hour: number;
  calls: number;
}

interface DowDist {
  day: string;
  calls: number;
}

interface Analytics {
  overview: AnalyticsOverview;
  per_action: PerAction[];
  per_org: PerOrg[];
  per_user: PerUser[];
  daily_trend: DailyTrend[];
  hourly_distribution: HourlyDist[];
  dow_distribution: DowDist[];
}

interface Org {
  id: string;
  name: string;
  subscription_plan: string;
  plan?: string;
  created_at: string;
  member_count: number;
  project_count: number;
  status?: string;
}

interface GeneralData {
  platform: {
    total_users: number;
    total_organizations: number;
    new_users_period: number;
    onboarding_rate: number;
    active_users_period: number;
    active_rate: number;
    avg_dau: number;
    plan_distribution: Record<string, number>;
  };
  engagement: {
    power_users: number;
    regular_users: number;
    casual_users: number;
    inactive_users: number;
    avg_session_duration_min: number;
    avg_pages_per_session: number;
    total_sessions: number;
    total_page_views: number;
  };
  content: {
    emails_synced: number;
    tasks_created: number;
    meetings_created: number;
    submissions_created: number;
    plans_uploaded: number;
    total_projects: number;
    total_suppliers: number;
  };
  ai: {
    total_calls: number;
    total_cost_chf: number;
    avg_cost_per_call: number;
    breakdown: { action: string; calls: number; cost: number }[];
  };
  top_features: {
    feature: string;
    page_views: number;
    feature_uses: number;
    unique_users: number;
    total: number;
  }[];
  daily_trend: { date: string; dau: number; page_views: number; feature_uses: number }[];
  hourly_distribution: number[];
  period_days: number;
}

interface OverviewData {
  dau: number;
  wau: number;
  mau: number;
  avg_session_duration_ms: number;
  pages_per_session: number;
  total_events: number;
  total_page_views: number;
  total_feature_uses: number;
  period_days: number;
}

interface FeatureUsageItem {
  feature: string;
  page_views: number;
  feature_uses: number;
  unique_users: number;
}

interface TrendPoint {
  date: string;
  dau: number;
  page_views: number;
  feature_uses: number;
}

interface OrgActivity {
  org_id: string;
  org_name: string;
  plan: string;
  active_users: number;
  top_feature: string;
  total_events: number;
  last_active: string;
}

interface AdoptionItem {
  feature: string;
  users_used: number;
  total_users: number;
  pct: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Period = "7d" | "30d" | "90d";

const PLAN_PRICES: Record<string, number> = {
  trial: 0,
  starter: 149,
  pro: 349,
  enterprise: 790,
};

const PLAN_COLORS: Record<string, string> = {
  trial: "#71717A",
  starter: "#3B82F6",
  pro: "#F97316",
  enterprise: "#10B981",
};

function fmtCHF(v: number): string {
  return `CHF ${v.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(v: number): string {
  return v.toLocaleString("fr-CH");
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

function fmtDate(d: string): string {
  if (!d) return "-";
  const date = new Date(d);
  return date.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
}

function shortDate(d: string): string {
  if (!d) return "";
  return d.slice(5); // "2026-04-10" -> "04-10"
}

const ACTION_LABELS: Record<string, string> = {
  email_classify: "Classification email",
  email_reply: "Reponse email",
  email_summary: "Resume email",
  task_extract: "Extraction taches",
  reclassify: "Reclassification",
  plan_analyze: "Analyse plan",
  chat_message: "Chat IA",
  price_extract: "Extraction prix",
  price_estimate: "Estimation prix",
  supplier_enrichment: "Enrichissement fournisseur",
  supplier_search: "Recherche fournisseur",
  pv_generate: "Generation PV",
  pv_transcribe: "Transcription audio",
  submission_parse: "Analyse soumission",
  briefing_generate: "Generation briefing",
  plan_estimate: "Estimation plan",
};

function actionLabel(key: string): string {
  return ACTION_LABELS[key] || key.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  color = "#FAFAFA",
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#71717A]">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-[#52525B]" />}
      </div>
      <p className="mt-1 text-xl font-bold font-display" style={{ color }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-[#71717A]">{sub}</p>}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const bg = PLAN_COLORS[plan] || "#71717A";
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
      style={{ backgroundColor: `${bg}20`, color: bg }}
    >
      {plan}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-sm font-semibold text-[#A1A1AA] font-display">
      {children}
    </h3>
  );
}

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: "#18181B",
    border: "1px solid #27272A",
    borderRadius: 8,
    fontSize: 12,
    color: "#FAFAFA",
  },
  itemStyle: { color: "#A1A1AA" },
  labelStyle: { color: "#FAFAFA", fontWeight: 600 },
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

type TabKey = "overview" | "ai-costs" | "revenue" | "users" | "adoption";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Vue d\u2019ensemble" },
  { key: "ai-costs", label: "Co\u00fbts IA" },
  { key: "revenue", label: "Revenue & Plans" },
  { key: "users", label: "Utilisateurs" },
  { key: "adoption", label: "Adoption" },
];

export default function AnalyticsPage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [period, setPeriod] = useState<Period>("30d");
  const [loading, setLoading] = useState(true);

  // Data states
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [general, setGeneral] = useState<GeneralData | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [featureUsage, setFeatureUsage] = useState<FeatureUsageItem[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [perOrg, setPerOrg] = useState<OrgActivity[]>([]);
  const [adoption, setAdoption] = useState<AdoptionItem[]>([]);

  const fetchAll = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const [
        metricsRes,
        analyticsRes,
        orgsRes,
        generalRes,
        overviewRes,
        featureRes,
        trendsRes,
        perOrgRes,
        adoptionRes,
      ] = await Promise.all([
        fetch("/api/super-admin?action=platform-metrics"),
        fetch(`/api/super-admin?action=analytics&scope=platform&period=${p}`),
        fetch("/api/super-admin?action=list-organizations"),
        fetch(`/api/super-admin/user-analytics?action=general&period=${p}`),
        fetch(`/api/super-admin/user-analytics?action=overview&period=${p}`),
        fetch(`/api/super-admin/user-analytics?action=feature-usage&period=${p}`),
        fetch(`/api/super-admin/user-analytics?action=trends&period=${p}`),
        fetch(`/api/super-admin/user-analytics?action=per-org&period=${p}`),
        fetch(`/api/super-admin/user-analytics?action=adoption&period=${p}`),
      ]);

      const [mJson, aJson, oJson, gJson, ovJson, fJson, tJson, poJson, adJson] =
        await Promise.all([
          metricsRes.ok ? metricsRes.json() : null,
          analyticsRes.ok ? analyticsRes.json() : null,
          orgsRes.ok ? orgsRes.json() : null,
          generalRes.ok ? generalRes.json() : null,
          overviewRes.ok ? overviewRes.json() : null,
          featureRes.ok ? featureRes.json() : null,
          trendsRes.ok ? trendsRes.json() : null,
          perOrgRes.ok ? perOrgRes.json() : null,
          adoptionRes.ok ? adoptionRes.json() : null,
        ]);

      if (mJson?.metrics) setMetrics(mJson.metrics);
      if (aJson?.overview) setAnalytics(aJson);
      if (oJson?.organizations) setOrgs(oJson.organizations);
      if (gJson?.platform) setGeneral(gJson);
      if (ovJson?.dau !== undefined) setOverview(ovJson);
      if (fJson?.features) setFeatureUsage(fJson.features);
      if (tJson?.trends) setTrends(tJson.trends);
      if (poJson?.orgs) setPerOrg(poJson.orgs);
      if (adJson?.adoption) setAdoption(adJson.adoption);
    } catch (err) {
      console.error("[analytics] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll(period);
  }, [period, fetchAll]);

  // Computed MRR from orgs
  const computedMrr = useMemo(() => {
    let total = 0;
    for (const o of orgs) {
      const plan = o.plan || o.subscription_plan || "trial";
      total += PLAN_PRICES[plan] || 0;
    }
    return total;
  }, [orgs]);

  const trialCount = useMemo(
    () => orgs.filter((o) => (o.plan || o.subscription_plan || "trial") === "trial").length,
    [orgs]
  );

  const mrr = metrics?.mrr ?? computedMrr;
  const aiCostProjected = analytics?.overview?.projected_monthly ?? 0;
  const marginPct = mrr > 0 ? ((mrr - aiCostProjected) / mrr) * 100 : 0;

  // -----------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-[#0F0F11] p-6">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <BarChart3 className="h-6 w-6 text-[#F97316]" />
            <h1 className="text-2xl font-bold text-[#FAFAFA] font-display">
              Analytique
            </h1>
          </div>
          <p className="mt-1 text-sm text-[#71717A]">
            Metriques plateforme, couts IA, revenue et activite utilisateurs
          </p>
        </div>
        {/* Period selector */}
        <div className="flex items-center gap-1 rounded-lg border border-[#27272A] bg-[#18181B] p-1">
          {(["7d", "30d", "90d"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                period === p
                  ? "bg-[#F97316] text-[#FAFAFA]"
                  : "text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex items-center gap-1 rounded-lg border border-[#27272A] bg-[#18181B] p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key
                ? "bg-[#F97316] text-[#FAFAFA]"
                : "text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#FAFAFA]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-8 w-8 animate-spin text-[#F97316]" />
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <TabOverview
              metrics={metrics}
              analytics={analytics}
              mrr={mrr}
              trialCount={trialCount}
              marginPct={marginPct}
            />
          )}
          {tab === "ai-costs" && <TabAICosts analytics={analytics} />}
          {tab === "revenue" && <TabRevenue orgs={orgs} mrr={mrr} />}
          {tab === "users" && (
            <TabUsers
              general={general}
              overview={overview}
              featureUsage={featureUsage}
              trends={trends}
              perOrg={perOrg}
            />
          )}
          {tab === "adoption" && <TabAdoption adoption={adoption} />}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// TAB 1: Vue d'ensemble
// ===========================================================================

function TabOverview({
  metrics,
  analytics,
  mrr,
  trialCount,
  marginPct,
}: {
  metrics: PlatformMetrics | null;
  analytics: Analytics | null;
  mrr: number;
  trialCount: number;
  marginPct: number;
}) {
  const m = metrics;
  const a = analytics;

  return (
    <div className="space-y-6">
      {/* 6 KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="MRR"
          value={fmtCHF(mrr)}
          color="#22C55E"
          icon={TrendingUp}
        />
        <KpiCard
          label="Organisations"
          value={fmtNum(m?.totalOrgs ?? 0)}
          sub={`dont ${trialCount} trial`}
          icon={Building2}
        />
        <KpiCard
          label="Utilisateurs"
          value={fmtNum(m?.totalUsers ?? 0)}
          icon={Users}
        />
        <KpiCard
          label="Cout IA/mois"
          value={fmtCHF(a?.overview?.projected_monthly ?? 0)}
          color="#F97316"
          icon={DollarSign}
        />
        <KpiCard
          label="Appels IA"
          value={fmtNum(a?.overview?.total_calls ?? 0)}
          color="#3B82F6"
          icon={Zap}
        />
        <KpiCard
          label="Marge"
          value={fmtPct(marginPct)}
          color={marginPct >= 0 ? "#22C55E" : "#EF4444"}
          icon={marginPct >= 0 ? ArrowUpRight : ArrowDownRight}
        />
      </div>

      {/* 2-col: chart + data volume */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Revenue vs Costs AreaChart */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Revenue vs Couts IA (quotidien)</SectionTitle>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={a?.daily_trend ?? []}>
                <CartesianGrid stroke="#27272A" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#71717A", fontSize: 11 }}
                  tickFormatter={shortDate}
                />
                <YAxis tick={{ fill: "#71717A", fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#A1A1AA" }} />
                <Area
                  type="monotone"
                  dataKey="cost"
                  name="Cout IA (CHF)"
                  stroke="#F97316"
                  fill="#F9731620"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Data volume sidebar */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Volume de donnees</SectionTitle>
          <div className="space-y-2.5">
            {[
              { label: "Emails traites", value: m?.totalEmails ?? 0, icon: Mail },
              { label: "Plans analyses", value: m?.totalPlans ?? 0, icon: FileText },
              { label: "Taches creees", value: m?.totalTasks ?? 0, icon: CheckSquare },
              { label: "PVs generes", value: m?.totalPvs ?? 0, icon: ClipboardList },
              { label: "Fournisseurs", value: m?.totalSuppliers ?? 0, icon: Truck },
              { label: "Offres", value: m?.totalOffers ?? 0, icon: ShoppingBag },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-md border border-[#27272A] bg-[#1C1C1F] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <item.icon className="h-3.5 w-3.5 text-[#52525B]" />
                  <span className="text-xs text-[#A1A1AA]">{item.label}</span>
                </div>
                <span className="text-sm font-semibold text-[#FAFAFA]">
                  {fmtNum(item.value)}
                </span>
              </div>
            ))}
            {m?.storageGb !== undefined && (
              <div className="flex items-center justify-between rounded-md border border-[#27272A] bg-[#1C1C1F] px-3 py-2">
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-[#52525B]" />
                  <span className="text-xs text-[#A1A1AA]">Stockage</span>
                </div>
                <span className="text-sm font-semibold text-[#FAFAFA]">
                  {m.storageGb.toFixed(2)} GB
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Org profitability table */}
      {(a?.per_org?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Rentabilite par organisation</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#27272A] text-left text-[#71717A]">
                  <th className="pb-2 pr-4 font-medium">Organisation</th>
                  <th className="pb-2 pr-4 font-medium">Plan</th>
                  <th className="pb-2 pr-4 font-medium text-right">Membres</th>
                  <th className="pb-2 pr-4 font-medium text-right">MRR</th>
                  <th className="pb-2 pr-4 font-medium text-right">Cout IA</th>
                  <th className="pb-2 font-medium text-right">Marge %</th>
                </tr>
              </thead>
              <tbody>
                {a!.per_org.map((o) => {
                  const mrgn =
                    o.revenue_monthly > 0
                      ? ((o.revenue_monthly - (o.cost / 30) * 30) / o.revenue_monthly) * 100
                      : 0;
                  return (
                    <tr
                      key={o.org_id}
                      className="border-b border-[#27272A]/50 text-[#FAFAFA]"
                    >
                      <td className="py-2 pr-4 font-medium">{o.org_name}</td>
                      <td className="py-2 pr-4">
                        <PlanBadge plan={o.plan} />
                      </td>
                      <td className="py-2 pr-4 text-right text-[#A1A1AA]">
                        {o.member_count}
                      </td>
                      <td className="py-2 pr-4 text-right">{fmtCHF(o.revenue_monthly)}</td>
                      <td className="py-2 pr-4 text-right text-[#F97316]">
                        {fmtCHF(o.cost)}
                      </td>
                      <td
                        className="py-2 text-right font-semibold"
                        style={{ color: mrgn >= 0 ? "#22C55E" : "#EF4444" }}
                      >
                        {fmtPct(mrgn)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// TAB 2: Couts IA
// ===========================================================================

function TabAICosts({ analytics }: { analytics: Analytics | null }) {
  const a = analytics;
  const ov = a?.overview;

  const topFunctions = useMemo(() => {
    return (a?.per_action ?? []).slice(0, 10);
  }, [a]);

  return (
    <div className="space-y-6">
      {/* 4 KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Cout IA total"
          value={fmtCHF(ov?.total_cost_chf ?? 0)}
          color="#F97316"
          icon={DollarSign}
        />
        <KpiCard
          label="Appels IA"
          value={fmtNum(ov?.total_calls ?? 0)}
          color="#3B82F6"
          icon={Zap}
        />
        <KpiCard
          label="Cout moyen/appel"
          value={fmtCHF(ov?.avg_cost_per_call ?? 0)}
          icon={BarChart2}
        />
        <KpiCard
          label="Projection mensuelle"
          value={fmtCHF(ov?.projected_monthly ?? 0)}
          color="#F59E0B"
          icon={TrendingUp}
        />
      </div>

      {/* Area chart: daily cost + calls */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
        <SectionTitle>Tendance quotidienne</SectionTitle>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={a?.daily_trend ?? []}>
              <CartesianGrid stroke="#27272A" strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#71717A", fontSize: 11 }}
                tickFormatter={shortDate}
              />
              <YAxis yAxisId="cost" tick={{ fill: "#71717A", fontSize: 11 }} />
              <YAxis
                yAxisId="calls"
                orientation="right"
                tick={{ fill: "#71717A", fontSize: 11 }}
              />
              <Tooltip {...chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#A1A1AA" }} />
              <Area
                yAxisId="cost"
                type="monotone"
                dataKey="cost"
                name="Cout (CHF)"
                stroke="#F97316"
                fill="#F9731620"
                strokeWidth={2}
              />
              <Area
                yAxisId="calls"
                type="monotone"
                dataKey="calls"
                name="Appels"
                stroke="#3B82F6"
                fill="#3B82F620"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3-col charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Top functions */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Top fonctions par cout</SectionTitle>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topFunctions}
                layout="vertical"
                margin={{ left: 80 }}
              >
                <CartesianGrid stroke="#27272A" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: "#71717A", fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="action_type"
                  tick={{ fill: "#A1A1AA", fontSize: 10 }}
                  tickFormatter={actionLabel}
                  width={75}
                />
                <Tooltip
                  {...chartTooltipStyle}
                  formatter={(v: number) => fmtCHF(v)}
                  labelFormatter={actionLabel}
                />
                <Bar dataKey="cost" fill="#F97316" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Distribution horaire</SectionTitle>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a?.hourly_distribution ?? []}>
                <CartesianGrid stroke="#27272A" strokeDasharray="3 3" />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: "#71717A", fontSize: 10 }}
                  tickFormatter={(h: number) => `${h}h`}
                />
                <YAxis tick={{ fill: "#71717A", fontSize: 10 }} />
                <Tooltip {...chartTooltipStyle} />
                <Bar dataKey="calls" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Day of week */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Distribution jour de semaine</SectionTitle>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={a?.dow_distribution ?? []}>
                <CartesianGrid stroke="#27272A" strokeDasharray="3 3" />
                <XAxis dataKey="day" tick={{ fill: "#71717A", fontSize: 10 }} />
                <YAxis tick={{ fill: "#71717A", fontSize: 10 }} />
                <Tooltip {...chartTooltipStyle} />
                <Bar dataKey="calls" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Per org table */}
      {(a?.per_org?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Couts par organisation</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#27272A] text-left text-[#71717A]">
                  <th className="pb-2 pr-4 font-medium">Organisation</th>
                  <th className="pb-2 pr-4 font-medium">Plan</th>
                  <th className="pb-2 pr-4 font-medium text-right">Membres</th>
                  <th className="pb-2 pr-4 font-medium text-right">Appels</th>
                  <th className="pb-2 pr-4 font-medium text-right">Cout</th>
                  <th className="pb-2 pr-4 font-medium text-right">Revenu/mois</th>
                  <th className="pb-2 pr-4 font-medium text-right">Profit</th>
                  <th className="pb-2 font-medium text-right">Marge %</th>
                </tr>
              </thead>
              <tbody>
                {a!.per_org.map((o) => {
                  const mrgn =
                    o.revenue_monthly > 0
                      ? (o.profit / o.revenue_monthly) * 100
                      : 0;
                  return (
                    <tr
                      key={o.org_id}
                      className="border-b border-[#27272A]/50 text-[#FAFAFA]"
                    >
                      <td className="py-2 pr-4 font-medium">{o.org_name}</td>
                      <td className="py-2 pr-4">
                        <PlanBadge plan={o.plan} />
                      </td>
                      <td className="py-2 pr-4 text-right text-[#A1A1AA]">
                        {o.member_count}
                      </td>
                      <td className="py-2 pr-4 text-right">{fmtNum(o.calls)}</td>
                      <td className="py-2 pr-4 text-right text-[#F97316]">
                        {fmtCHF(o.cost)}
                      </td>
                      <td className="py-2 pr-4 text-right">{fmtCHF(o.revenue_monthly)}</td>
                      <td
                        className="py-2 pr-4 text-right"
                        style={{ color: o.profit >= 0 ? "#22C55E" : "#EF4444" }}
                      >
                        {fmtCHF(o.profit)}
                      </td>
                      <td
                        className="py-2 text-right font-semibold"
                        style={{ color: mrgn >= 0 ? "#22C55E" : "#EF4444" }}
                      >
                        {fmtPct(mrgn)}
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
      {(a?.per_user?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Couts par utilisateur</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#27272A] text-left text-[#71717A]">
                  <th className="pb-2 pr-4 font-medium">Utilisateur</th>
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 pr-4 font-medium">Organisation</th>
                  <th className="pb-2 pr-4 font-medium text-right">Appels</th>
                  <th className="pb-2 font-medium text-right">Cout</th>
                </tr>
              </thead>
              <tbody>
                {a!.per_user.slice(0, 20).map((u) => (
                  <tr
                    key={u.user_id}
                    className="border-b border-[#27272A]/50 text-[#FAFAFA]"
                  >
                    <td className="py-2 pr-4 font-medium">{u.name}</td>
                    <td className="py-2 pr-4 text-[#A1A1AA]">{u.email}</td>
                    <td className="py-2 pr-4 text-[#A1A1AA]">{u.org_name || "-"}</td>
                    <td className="py-2 pr-4 text-right">{fmtNum(u.calls)}</td>
                    <td className="py-2 text-right text-[#F97316]">{fmtCHF(u.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per function table */}
      {(a?.per_action?.length ?? 0) > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Couts par fonction</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#27272A] text-left text-[#71717A]">
                  <th className="pb-2 pr-4 font-medium">Fonction</th>
                  <th className="pb-2 pr-4 font-medium text-right">Appels</th>
                  <th className="pb-2 pr-4 font-medium text-right">Cout</th>
                  <th className="pb-2 font-medium text-right">% Total</th>
                </tr>
              </thead>
              <tbody>
                {a!.per_action.map((fn) => {
                  const totalCost = a!.overview.total_cost_chf || 1;
                  return (
                    <tr
                      key={fn.action_type}
                      className="border-b border-[#27272A]/50 text-[#FAFAFA]"
                    >
                      <td className="py-2 pr-4 font-medium">
                        {actionLabel(fn.action_type)}
                      </td>
                      <td className="py-2 pr-4 text-right">{fmtNum(fn.calls)}</td>
                      <td className="py-2 pr-4 text-right text-[#F97316]">
                        {fmtCHF(fn.cost)}
                      </td>
                      <td className="py-2 text-right text-[#A1A1AA]">
                        {fmtPct((fn.cost / totalCost) * 100)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// TAB 3: Revenue & Plans
// ===========================================================================

function TabRevenue({ orgs, mrr }: { orgs: Org[]; mrr: number }) {
  const arr = mrr * 12;
  const totalUsers = orgs.reduce((s, o) => s + (o.member_count || 0), 0);

  const planDist = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const o of orgs) {
      const plan = o.plan || o.subscription_plan || "trial";
      dist[plan] = (dist[plan] || 0) + 1;
    }
    return dist;
  }, [orgs]);

  return (
    <div className="space-y-6">
      {/* 4 KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="MRR" value={fmtCHF(mrr)} color="#22C55E" icon={TrendingUp} />
        <KpiCard label="ARR" value={fmtCHF(arr)} color="#22C55E" icon={TrendingUp} />
        <KpiCard
          label="Organisations"
          value={fmtNum(orgs.length)}
          icon={Building2}
        />
        <KpiCard label="Utilisateurs" value={fmtNum(totalUsers)} icon={Users} />
      </div>

      {/* Plan distribution badges */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
        <SectionTitle>Distribution des plans</SectionTitle>
        <div className="flex flex-wrap gap-4">
          {Object.entries(planDist).map(([plan, count]) => (
            <div key={plan} className="flex items-center gap-2">
              <PlanBadge plan={plan} />
              <span className="text-sm font-semibold text-[#FAFAFA]">{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Org billing table */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
        <SectionTitle>Organisations</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#27272A] text-left text-[#71717A]">
                <th className="pb-2 pr-4 font-medium">Organisation</th>
                <th className="pb-2 pr-4 font-medium">Plan</th>
                <th className="pb-2 pr-4 font-medium text-right">MRR</th>
                <th className="pb-2 pr-4 font-medium text-right">Membres</th>
                <th className="pb-2 pr-4 font-medium text-right">Projets</th>
                <th className="pb-2 pr-4 font-medium">Creee le</th>
                <th className="pb-2 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => {
                const plan = o.plan || o.subscription_plan || "trial";
                const orgMrr = PLAN_PRICES[plan] || 0;
                const status = o.status || "active";
                return (
                  <tr
                    key={o.id}
                    className="border-b border-[#27272A]/50 text-[#FAFAFA]"
                  >
                    <td className="py-2 pr-4 font-medium">{o.name}</td>
                    <td className="py-2 pr-4">
                      <PlanBadge plan={plan} />
                    </td>
                    <td className="py-2 pr-4 text-right">{fmtCHF(orgMrr)}</td>
                    <td className="py-2 pr-4 text-right text-[#A1A1AA]">
                      {o.member_count}
                    </td>
                    <td className="py-2 pr-4 text-right text-[#A1A1AA]">
                      {o.project_count}
                    </td>
                    <td className="py-2 pr-4 text-[#A1A1AA]">{fmtDate(o.created_at)}</td>
                    <td className="py-2">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          status === "active"
                            ? "bg-[#22C55E]/10 text-[#22C55E]"
                            : status === "suspended"
                              ? "bg-[#EF4444]/10 text-[#EF4444]"
                              : "bg-[#71717A]/10 text-[#71717A]"
                        }`}
                      >
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// TAB 4: Utilisateurs
// ===========================================================================

function TabUsers({
  general,
  overview,
  featureUsage,
  trends,
  perOrg,
}: {
  general: GeneralData | null;
  overview: OverviewData | null;
  featureUsage: FeatureUsageItem[];
  trends: TrendPoint[];
  perOrg: OrgActivity[];
}) {
  const g = general;
  const [sortCol, setSortCol] = useState<"total_events" | "active_users">("total_events");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedOrgs = useMemo(() => {
    return [...perOrg].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      return sortDir === "desc" ? vb - va : va - vb;
    });
  }, [perOrg, sortCol, sortDir]);

  function handleSort(col: "total_events" | "active_users") {
    if (sortCol === col) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  // Hourly chart data from general
  const hourlyData = useMemo(() => {
    const arr = g?.hourly_distribution ?? [];
    return arr.map((v, i) => ({ hour: i, events: v }));
  }, [g]);

  // Plan distribution bars
  const planBars = useMemo(() => {
    const dist = g?.platform?.plan_distribution ?? {};
    return Object.entries(dist).map(([plan, count]) => ({ plan, count }));
  }, [g]);

  return (
    <div className="space-y-6">
      {/* 8 KPIs row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <KpiCard
          label="Utilisateurs"
          value={fmtNum(g?.platform?.total_users ?? 0)}
          icon={Users}
        />
        <KpiCard
          label="Organisations"
          value={fmtNum(g?.platform?.total_organizations ?? 0)}
          icon={Building2}
        />
        <KpiCard
          label="Nouveaux"
          value={fmtNum(g?.platform?.new_users_period ?? 0)}
          color="#3B82F6"
          icon={UserCheck}
        />
        <KpiCard
          label="Taux actif"
          value={fmtPct(g?.platform?.active_rate ?? 0)}
          color="#22C55E"
          icon={Activity}
        />
        <KpiCard
          label="Emails sync"
          value={fmtNum(g?.content?.emails_synced ?? 0)}
          icon={Mail}
        />
        <KpiCard
          label="Taches creees"
          value={fmtNum(g?.content?.tasks_created ?? 0)}
          icon={CheckSquare}
        />
        <KpiCard
          label="Appels IA"
          value={fmtNum(g?.ai?.total_calls ?? 0)}
          color="#F97316"
          icon={Zap}
        />
        <KpiCard
          label="Cout IA"
          value={fmtCHF(g?.ai?.total_cost_chf ?? 0)}
          color="#F97316"
          icon={DollarSign}
        />
      </div>

      {/* 3-col: Engagement, Content, AI */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Engagement segments */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Segments engagement</SectionTitle>
          <div className="space-y-3">
            {[
              { label: "Power users (>100 events)", value: g?.engagement?.power_users ?? 0, color: "#F97316" },
              { label: "Regular (20-100)", value: g?.engagement?.regular_users ?? 0, color: "#3B82F6" },
              { label: "Casual (<20)", value: g?.engagement?.casual_users ?? 0, color: "#F59E0B" },
              { label: "Inactifs", value: g?.engagement?.inactive_users ?? 0, color: "#71717A" },
            ].map((seg) => {
              const total = g?.platform?.total_users || 1;
              const pct = (seg.value / total) * 100;
              return (
                <div key={seg.label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-[#A1A1AA]">{seg.label}</span>
                    <span className="font-semibold text-[#FAFAFA]">{seg.value}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#27272A]">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: seg.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Content volume */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Volume contenu (periode)</SectionTitle>
          <div className="space-y-2">
            {[
              { label: "Emails synchronises", value: g?.content?.emails_synced ?? 0 },
              { label: "Taches creees", value: g?.content?.tasks_created ?? 0 },
              { label: "Reunions", value: g?.content?.meetings_created ?? 0 },
              { label: "Soumissions", value: g?.content?.submissions_created ?? 0 },
              { label: "Plans uploades", value: g?.content?.plans_uploaded ?? 0 },
              { label: "Projets total", value: g?.content?.total_projects ?? 0 },
              { label: "Fournisseurs", value: g?.content?.total_suppliers ?? 0 },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-[#A1A1AA]">{item.label}</span>
                <span className="font-semibold text-[#FAFAFA]">{fmtNum(item.value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* AI breakdown */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Repartition IA</SectionTitle>
          <div className="space-y-2">
            {(g?.ai?.breakdown ?? []).slice(0, 8).map((item) => (
              <div
                key={item.action}
                className="flex items-center justify-between text-xs"
              >
                <span className="text-[#A1A1AA]">{actionLabel(item.action)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[#FAFAFA]">{fmtNum(item.calls)}</span>
                  <span className="text-[#F97316]">{fmtCHF(item.cost)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 2-col: Plan distribution + Hourly */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Plan distribution */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Distribution des plans</SectionTitle>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={planBars}>
                <CartesianGrid stroke="#27272A" strokeDasharray="3 3" />
                <XAxis dataKey="plan" tick={{ fill: "#A1A1AA", fontSize: 11 }} />
                <YAxis tick={{ fill: "#71717A", fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} />
                <Bar
                  dataKey="count"
                  radius={[4, 4, 0, 0]}
                  fill="#F97316"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly distribution */}
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Distribution horaire</SectionTitle>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData}>
                <CartesianGrid stroke="#27272A" strokeDasharray="3 3" />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: "#71717A", fontSize: 10 }}
                  tickFormatter={(h: number) => `${h}h`}
                />
                <YAxis tick={{ fill: "#71717A", fontSize: 10 }} />
                <Tooltip {...chartTooltipStyle} />
                <Bar dataKey="events" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 6 usage KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <KpiCard label="DAU" value={fmtNum(overview?.dau ?? 0)} color="#F97316" icon={Activity} />
        <KpiCard label="WAU" value={fmtNum(overview?.wau ?? 0)} color="#3B82F6" icon={Activity} />
        <KpiCard label="MAU" value={fmtNum(overview?.mau ?? 0)} color="#22C55E" icon={Activity} />
        <KpiCard
          label="Duree session"
          value={`${Math.round((overview?.avg_session_duration_ms ?? 0) / 60000)} min`}
          icon={Clock}
        />
        <KpiCard
          label="Pages/session"
          value={(overview?.pages_per_session ?? 0).toFixed(1)}
          icon={FileText}
        />
        <KpiCard
          label="Total events"
          value={fmtNum(overview?.total_events ?? 0)}
          icon={Zap}
        />
      </div>

      {/* Feature usage horizontal bar */}
      {featureUsage.length > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Utilisation des fonctionnalites</SectionTitle>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={featureUsage.slice(0, 12)}
                layout="vertical"
                margin={{ left: 100 }}
              >
                <CartesianGrid stroke="#27272A" strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fill: "#71717A", fontSize: 10 }} />
                <YAxis
                  type="category"
                  dataKey="feature"
                  tick={{ fill: "#A1A1AA", fontSize: 10 }}
                  width={95}
                />
                <Tooltip {...chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#A1A1AA" }} />
                <Bar
                  dataKey="page_views"
                  name="Pages vues"
                  fill="#3B82F6"
                  stackId="a"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="feature_uses"
                  name="Actions"
                  fill="#F97316"
                  stackId="a"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Trends area chart */}
      {trends.length > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Tendances quotidiennes</SectionTitle>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends}>
                <CartesianGrid stroke="#27272A" strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#71717A", fontSize: 11 }}
                  tickFormatter={shortDate}
                />
                <YAxis tick={{ fill: "#71717A", fontSize: 11 }} />
                <Tooltip {...chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#A1A1AA" }} />
                <Area
                  type="monotone"
                  dataKey="dau"
                  name="DAU"
                  stroke="#F97316"
                  fill="#F9731620"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="page_views"
                  name="Pages vues"
                  stroke="#3B82F6"
                  fill="#3B82F620"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-org activity table (sortable) */}
      {sortedOrgs.length > 0 && (
        <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
          <SectionTitle>Activite par organisation</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#27272A] text-left text-[#71717A]">
                  <th className="pb-2 pr-4 font-medium">Organisation</th>
                  <th className="pb-2 pr-4 font-medium">Plan</th>
                  <th
                    className="cursor-pointer pb-2 pr-4 text-right font-medium hover:text-[#FAFAFA]"
                    onClick={() => handleSort("active_users")}
                  >
                    Actifs{" "}
                    {sortCol === "active_users" && (sortDir === "desc" ? "\u2193" : "\u2191")}
                  </th>
                  <th className="pb-2 pr-4 font-medium">Top feature</th>
                  <th
                    className="cursor-pointer pb-2 pr-4 text-right font-medium hover:text-[#FAFAFA]"
                    onClick={() => handleSort("total_events")}
                  >
                    Events{" "}
                    {sortCol === "total_events" && (sortDir === "desc" ? "\u2193" : "\u2191")}
                  </th>
                  <th className="pb-2 font-medium">Derniere activite</th>
                </tr>
              </thead>
              <tbody>
                {sortedOrgs.map((o) => (
                  <tr
                    key={o.org_id}
                    className="border-b border-[#27272A]/50 text-[#FAFAFA]"
                  >
                    <td className="py-2 pr-4 font-medium">{o.org_name}</td>
                    <td className="py-2 pr-4">
                      <PlanBadge plan={o.plan} />
                    </td>
                    <td className="py-2 pr-4 text-right text-[#A1A1AA]">
                      {o.active_users}
                    </td>
                    <td className="py-2 pr-4 text-[#A1A1AA]">{o.top_feature || "-"}</td>
                    <td className="py-2 pr-4 text-right">{fmtNum(o.total_events)}</td>
                    <td className="py-2 text-[#71717A]">{fmtDate(o.last_active)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// TAB 5: Adoption
// ===========================================================================

function TabAdoption({ adoption }: { adoption: AdoptionItem[] }) {
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [journeyUserId, setJourneyUserId] = useState("");
  const [journeyData, setJourneyData] = useState<{
    user_id: string;
    sessions: {
      session_id: string;
      event_count: number;
      started_at: string;
      events: {
        event_type: string;
        page: string | null;
        feature: string | null;
        action: string | null;
        duration_ms: number | null;
        created_at: string;
      }[];
    }[];
  } | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);

  async function loadJourney() {
    if (!journeyUserId.trim()) return;
    setJourneyLoading(true);
    try {
      const res = await fetch(
        `/api/super-admin/user-analytics?action=user-journey&user_id=${encodeURIComponent(journeyUserId)}&period=30d`
      );
      if (res.ok) {
        const data = await res.json();
        setJourneyData(data);
      }
    } catch (err) {
      console.error("[adoption] journey fetch error:", err);
    } finally {
      setJourneyLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Feature adoption bars */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
        <SectionTitle>Adoption des fonctionnalites</SectionTitle>
        {adoption.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#52525B]">
            Aucune donnee d&apos;adoption disponible
          </p>
        ) : (
          <div className="space-y-3">
            {adoption.map((item) => (
              <div key={item.feature}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-[#FAFAFA]">{item.feature}</span>
                  <span className="text-[#A1A1AA]">
                    {item.users_used}/{item.total_users} utilisateurs ({item.pct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#27272A]">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.min(item.pct, 100)}%`,
                      backgroundColor:
                        item.pct >= 60
                          ? "#22C55E"
                          : item.pct >= 30
                            ? "#F59E0B"
                            : "#EF4444",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User journey section */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B] p-4">
        <SectionTitle>Parcours utilisateur</SectionTitle>
        <div className="mb-4 flex items-center gap-2">
          <input
            type="text"
            placeholder="User ID..."
            value={journeyUserId}
            onChange={(e) => setJourneyUserId(e.target.value)}
            className="rounded-md border border-[#27272A] bg-[#1C1C1F] px-3 py-1.5 text-xs text-[#FAFAFA] placeholder-[#52525B] focus:border-[#F97316] focus:outline-none"
          />
          <button
            onClick={loadJourney}
            disabled={journeyLoading || !journeyUserId.trim()}
            className="rounded-md bg-[#F97316] px-3 py-1.5 text-xs font-medium text-[#FAFAFA] hover:bg-[#EA580C] disabled:opacity-50"
          >
            {journeyLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Charger"
            )}
          </button>
        </div>

        {journeyData && journeyData.sessions.length > 0 && (
          <div className="space-y-2">
            {journeyData.sessions.map((session) => {
              const isExpanded = expandedUser === session.session_id;
              return (
                <div
                  key={session.session_id}
                  className="rounded-md border border-[#27272A] bg-[#1C1C1F]"
                >
                  <button
                    onClick={() =>
                      setExpandedUser(isExpanded ? null : session.session_id)
                    }
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="h-3 w-3 text-[#71717A]" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-[#71717A]" />
                      )}
                      <span className="font-medium text-[#FAFAFA]">
                        Session {session.session_id.slice(0, 8)}
                      </span>
                      <span className="text-[#71717A]">
                        {session.event_count} events
                      </span>
                    </div>
                    <span className="text-[#52525B]">
                      {session.started_at
                        ? new Date(session.started_at).toLocaleString("fr-CH")
                        : ""}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-[#27272A] px-3 py-2">
                      <div className="space-y-1">
                        {session.events.map((evt, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 text-[10px]"
                          >
                            <span className="w-14 shrink-0 text-[#52525B]">
                              {new Date(evt.created_at).toLocaleTimeString("fr-CH", {
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </span>
                            <span className="rounded bg-[#27272A] px-1.5 py-0.5 text-[#A1A1AA]">
                              {evt.event_type}
                            </span>
                            {evt.page && (
                              <span className="text-[#71717A]">{evt.page}</span>
                            )}
                            {evt.feature && (
                              <span className="text-[#F97316]">{evt.feature}</span>
                            )}
                            {evt.action && (
                              <span className="text-[#3B82F6]">{evt.action}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {journeyData && journeyData.sessions.length === 0 && (
          <p className="py-4 text-center text-xs text-[#52525B]">
            Aucune session trouvee pour cet utilisateur
          </p>
        )}
      </div>
    </div>
  );
}
