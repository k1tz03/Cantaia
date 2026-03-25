"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  Loader2,
  Users,
  Clock,
  FileText,
  Zap,
  ChevronDown,
  ChevronRight,
  Building2,
  Mail,
  Bot,
  TrendingUp,
  BarChart3,
  FolderKanban,
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

interface OverviewData {
  dau: number;
  wau: number;
  mau: number;
  avg_session_duration_min: number;
  pages_per_session: number;
  total_events: number;
}

interface FeatureUsageItem {
  feature: string;
  page_views: number;
  feature_uses: number;
  total: number;
}

interface TrendPoint {
  date: string;
  dau: number;
  page_views: number;
}

interface OrgActivity {
  org_id: string;
  org_name: string;
  plan: string;
  active_users: number;
  favorite_module: string;
  events: number;
  last_activity: string;
}

interface AdoptionItem {
  feature: string;
  adoption_pct: number;
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
    breakdown: Array<{ action: string; calls: number; cost: number }>;
  };
  top_features: Array<{ feature: string; page_views: number; feature_uses: number; unique_users: number; total: number }>;
  daily_trend: Array<{ date: string; dau: number; page_views: number; feature_uses: number }>;
  hourly_distribution: number[];
  period_days: number;
}

interface SessionPage {
  path: string;
  duration_sec: number;
  feature?: string;
}

interface UserSession {
  started_at: string;
  ended_at: string;
  pages: SessionPage[];
}

interface JourneyUser {
  user_id: string;
  name: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SortKey = "org_name" | "plan" | "active_users" | "events" | "last_activity";
type SortDir = "asc" | "desc";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "maintenant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function planBadgeClass(plan: string): string {
  switch (plan) {
    case "starter":
      return "bg-[#3B82F6]/15 text-[#3B82F6]";
    case "pro":
      return "bg-[#F97316]/15 text-[#F97316]";
    case "enterprise":
      return "bg-[#A855F7]/15 text-[#A855F7]";
    default:
      return "bg-[#3F3F46]/40 text-[#A1A1AA]";
  }
}

function adoptionBarColor(pct: number): string {
  if (pct >= 70) return "bg-[#22C55E]";
  if (pct >= 30) return "bg-[#F59E0B]";
  return "bg-[#EF4444]";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SuperAdminUserAnalyticsPage() {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [loading, setLoading] = useState(true);

  // Data
  const [general, setGeneral] = useState<GeneralData | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [featureUsage, setFeatureUsage] = useState<FeatureUsageItem[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [perOrg, setPerOrg] = useState<OrgActivity[]>([]);
  const [adoption, setAdoption] = useState<AdoptionItem[]>([]);

  // Org table sort
  const [sortKey, setSortKey] = useState<SortKey>("events");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // User journey
  const [journeyUsers, setJourneyUsers] = useState<JourneyUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [expandedSession, setExpandedSession] = useState<number | null>(null);

  // -------------------------------------------------------------------------
  // Fetch main data
  // -------------------------------------------------------------------------

  useEffect(() => {
    setLoading(true);
    const base = "/api/super-admin/user-analytics";
    Promise.all([
      fetch(`${base}?action=general&period=${period}`).then((r) => r.json()),
      fetch(`${base}?action=overview&period=${period}`).then((r) => r.json()),
      fetch(`${base}?action=feature-usage&period=${period}`).then((r) => r.json()),
      fetch(`${base}?action=trends&period=${period}`).then((r) => r.json()),
      fetch(`${base}?action=per-org&period=${period}`).then((r) => r.json()),
      fetch(`${base}?action=adoption&period=${period}`).then((r) => r.json()),
    ])
      .then(([gen, ov, fu, tr, po, ad]) => {
        setGeneral(gen || null);
        setOverview(ov?.data ?? null);
        setFeatureUsage(
          Array.isArray(fu?.data) ? fu.data.sort((a: FeatureUsageItem, b: FeatureUsageItem) => b.total - a.total) : []
        );
        setTrends(Array.isArray(tr?.data) ? tr.data : []);
        setPerOrg(Array.isArray(po?.data) ? po.data : []);
        setAdoption(Array.isArray(ad?.data) ? ad.data : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  // Fetch user list for journey dropdown (once)
  useEffect(() => {
    fetch("/api/super-admin?action=all-users")
      .then((r) => r.json())
      .then((data) => {
        const users: JourneyUser[] = (Array.isArray(data?.users) ? data.users : []).map(
          (u: { id: string; first_name?: string; last_name?: string; email?: string }) => ({
            user_id: u.id,
            name: [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || u.id,
            email: u.email || "",
          })
        );
        setJourneyUsers(users);
      })
      .catch(() => {});
  }, []);

  // Fetch journey for selected user
  const fetchJourney = useCallback((userId: string) => {
    if (!userId) {
      setSessions([]);
      return;
    }
    setJourneyLoading(true);
    fetch(`/api/super-admin/user-analytics?action=journey&user_id=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(Array.isArray(data?.data) ? data.data : []);
      })
      .catch(() => setSessions([]))
      .finally(() => setJourneyLoading(false));
  }, []);

  // -------------------------------------------------------------------------
  // Org table sorting
  // -------------------------------------------------------------------------

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortedOrgs = [...perOrg].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return <span className="ml-1 text-[#F97316]">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>;
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#0F0F11]">
        <Loader2 className="h-6 w-6 animate-spin text-[#F97316]" />
      </div>
    );
  }

  const ov = overview ?? {
    dau: 0,
    wau: 0,
    mau: 0,
    avg_session_duration_min: 0,
    pages_per_session: 0,
    total_events: 0,
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen space-y-8 bg-[#0F0F11] p-6">
      {/* ----------------------------------------------------------------- */}
      {/* Header + period selector                                          */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-[#FAFAFA]">
            <Activity className="h-6 w-6 text-[#F97316]" />
            Analyse utilisateurs
          </h1>
          <p className="mt-1 text-sm text-[#A1A1AA]">
            Comportement, adoption et parcours des utilisateurs
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

      {/* ================================================================= */}
      {/* SECTION 0: Statistiques Générales Plateforme                     */}
      {/* ================================================================= */}
      {general && (
        <div className="space-y-5">
          {/* Row 1: Platform Growth KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
            {[
              { label: "Utilisateurs", value: general.platform.total_users, icon: Users, color: "text-[#F97316]" },
              { label: "Organisations", value: general.platform.total_organizations, icon: Building2, color: "text-[#3B82F6]" },
              { label: "Nouveaux", value: `+${general.platform.new_users_period}`, icon: TrendingUp, color: "text-[#22C55E]", sub: `${period}` },
              { label: "Taux actif", value: `${general.platform.active_rate}%`, icon: Activity, color: general.platform.active_rate > 50 ? "text-[#22C55E]" : "text-[#F59E0B]" },
              { label: "Emails sync.", value: general.content.emails_synced.toLocaleString("fr-CH"), icon: Mail, color: "text-[#FAFAFA]" },
              { label: "Tâches créées", value: general.content.tasks_created.toLocaleString("fr-CH"), icon: FolderKanban, color: "text-[#FAFAFA]" },
              { label: "Appels IA", value: general.ai.total_calls.toLocaleString("fr-CH"), icon: Bot, color: "text-[#A855F7]" },
              { label: "Coût IA", value: `${general.ai.total_cost_chf.toFixed(0)} CHF`, icon: BarChart3, color: "text-[#FAFAFA]" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-[#27272A] bg-[#18181B] p-4">
                <div className="flex items-center gap-2 mb-1">
                  <kpi.icon className="h-4 w-4 text-[#71717A]" />
                  <span className="text-[10px] uppercase tracking-wider text-[#71717A]">{kpi.label}</span>
                </div>
                <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                {"sub" in kpi && kpi.sub && <p className="text-[10px] text-[#52525B]">{kpi.sub}</p>}
              </div>
            ))}
          </div>

          {/* Row 2: Engagement + Content + AI in 3 columns */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Engagement Segments */}
            <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
              <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">Segments d&apos;engagement</h3>
              <div className="space-y-2.5">
                {[
                  { label: "Power users (>100 events)", count: general.engagement.power_users, color: "bg-[#F97316]" },
                  { label: "Réguliers (20-100)", count: general.engagement.regular_users, color: "bg-[#3B82F6]" },
                  { label: "Occasionnels (<20)", count: general.engagement.casual_users, color: "bg-[#F59E0B]" },
                  { label: "Inactifs", count: general.engagement.inactive_users, color: "bg-[#3F3F46]" },
                ].map((seg) => {
                  const total = general.platform.total_users || 1;
                  const pct = Math.round((seg.count / total) * 100);
                  return (
                    <div key={seg.label}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#A1A1AA]">{seg.label}</span>
                        <span className="text-[#FAFAFA] font-medium">{seg.count} <span className="text-[#71717A]">({pct}%)</span></span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-[#27272A]">
                        <div className={`h-1.5 rounded-full ${seg.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Content Volume */}
            <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
              <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">Volume de contenu <span className="text-[#71717A] font-normal">({period})</span></h3>
              <div className="space-y-2">
                {[
                  { label: "Emails synchronisés", value: general.content.emails_synced },
                  { label: "Tâches créées", value: general.content.tasks_created },
                  { label: "Réunions / PV", value: general.content.meetings_created },
                  { label: "Soumissions", value: general.content.submissions_created },
                  { label: "Plans uploadés", value: general.content.plans_uploaded },
                  { label: "Projets (total)", value: general.content.total_projects },
                  { label: "Fournisseurs (total)", value: general.content.total_suppliers },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <span className="text-[#A1A1AA]">{item.label}</span>
                    <span className="font-mono text-[#FAFAFA] font-medium">{item.value.toLocaleString("fr-CH")}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Breakdown */}
            <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
              <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">Utilisation IA <span className="text-[#71717A] font-normal">({period})</span></h3>
              <div className="mb-3 flex items-center gap-4 text-xs">
                <span className="text-[#A1A1AA]">{general.ai.total_calls} appels</span>
                <span className="text-[#F97316] font-medium">{general.ai.total_cost_chf.toFixed(2)} CHF</span>
                <span className="text-[#71717A]">~{general.ai.avg_cost_per_call.toFixed(3)} CHF/appel</span>
              </div>
              <div className="space-y-1.5">
                {general.ai.breakdown.slice(0, 7).map((item) => {
                  const maxCost = general.ai.breakdown[0]?.cost || 1;
                  const pct = Math.round((item.cost / maxCost) * 100);
                  return (
                    <div key={item.action}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-[#A1A1AA] truncate max-w-[140px]">{item.action.replace(/_/g, " ")}</span>
                        <span className="text-[#FAFAFA] font-mono">{item.cost.toFixed(2)} CHF</span>
                      </div>
                      <div className="mt-0.5 h-1 rounded-full bg-[#27272A]">
                        <div className="h-1 rounded-full bg-[#A855F7]" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Row 3: Plan Distribution + Hourly Distribution */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Plan Distribution */}
            <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
              <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">Distribution des plans</h3>
              <div className="flex items-end gap-3 h-24">
                {Object.entries(general.platform.plan_distribution).map(([plan, count]) => {
                  const maxCount = Math.max(...Object.values(general.platform.plan_distribution), 1);
                  const heightPct = Math.round((count / maxCount) * 100);
                  const colors: Record<string, string> = { trial: "bg-[#71717A]", starter: "bg-[#3B82F6]", pro: "bg-[#F97316]", enterprise: "bg-[#A855F7]" };
                  return (
                    <div key={plan} className="flex flex-col items-center flex-1">
                      <span className="text-xs font-bold text-[#FAFAFA] mb-1">{count}</span>
                      <div className="w-full max-w-[40px] rounded-t-md" style={{ height: `${heightPct}%` }}>
                        <div className={`w-full h-full rounded-t-md ${colors[plan] || "bg-[#3F3F46]"}`} />
                      </div>
                      <span className="text-[10px] text-[#71717A] mt-1 capitalize">{plan}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hourly Distribution */}
            <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
              <h3 className="mb-3 text-sm font-semibold text-[#FAFAFA]">Activité par heure <span className="text-[#71717A] font-normal">(7j)</span></h3>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={general.hourly_distribution.map((v, i) => ({ hour: `${i}h`, events: v }))}>
                  <Bar dataKey="events" fill="#F97316" radius={[2, 2, 0, 0]} />
                  <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#71717A" }} axisLine={false} tickLine={false} interval={2} />
                  <Tooltip
                    contentStyle={{ background: "#18181B", border: "1px solid #27272A", borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: "#A1A1AA" }}
                    itemStyle={{ color: "#F97316" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-[#27272A]" />
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Section 1: KPI strip (per-user activity)                         */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "DAU", value: ov.dau, color: "text-[#F97316]", icon: Users },
          { label: "WAU", value: ov.wau, color: "text-[#3B82F6]", icon: Users },
          { label: "MAU", value: ov.mau, color: "text-[#22C55E]", icon: Users },
          { label: "Durée session moy.", value: `${ov.avg_session_duration_min.toFixed(1)}`, unit: "min", color: "text-[#FAFAFA]", icon: Clock },
          { label: "Pages / session", value: ov.pages_per_session.toFixed(1), color: "text-[#FAFAFA]", icon: FileText },
          { label: "Total événements", value: ov.total_events.toLocaleString(), color: "text-[#FAFAFA]", icon: Zap },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-[#27272A] bg-[#18181B] p-5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#27272A]">
                <kpi.icon className="h-5 w-5 text-[#A1A1AA]" />
              </div>
              <div>
                <p className="text-xs text-[#71717A]">{kpi.label}</p>
                <p className={`text-xl font-bold ${kpi.color}`}>
                  {kpi.value}
                  {"unit" in kpi && kpi.unit && (
                    <span className="ml-1 text-sm font-normal text-[#71717A]">{kpi.unit}</span>
                  )}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Section 2: Feature usage bar chart                                */}
      {/* ----------------------------------------------------------------- */}
      {featureUsage.length > 0 && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 font-display text-sm font-semibold text-[#FAFAFA]">
            Utilisation par module
          </h3>
          <ResponsiveContainer width="100%" height={Math.max(250, featureUsage.length * 36)}>
            <BarChart data={featureUsage} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#71717A" }} />
              <YAxis
                type="category"
                dataKey="feature"
                tick={{ fontSize: 11, fill: "#A1A1AA" }}
                width={120}
              />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181B", border: "1px solid #27272A", borderRadius: 8 }}
                labelStyle={{ color: "#FAFAFA" }}
                itemStyle={{ color: "#A1A1AA" }}
                formatter={(value: number, name: string) => [
                  value.toLocaleString(),
                  name === "page_views" ? "Pages vues" : "Utilisations",
                ]}
              />
              <Bar dataKey="page_views" fill="#F97316" radius={[0, 4, 4, 0]} stackId="a" />
              <Bar dataKey="feature_uses" fill="#EA580C" radius={[0, 4, 4, 0]} stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Section 3: Trends area chart                                      */}
      {/* ----------------------------------------------------------------- */}
      {trends.length > 0 && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 font-display text-sm font-semibold text-[#FAFAFA]">
            Tendances d&apos;activit&eacute;
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trends}>
              <defs>
                <linearGradient id="orangeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#F97316" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272A" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#71717A" }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis yAxisId="dau" tick={{ fontSize: 10, fill: "#71717A" }} />
              <YAxis yAxisId="pv" orientation="right" tick={{ fontSize: 10, fill: "#71717A" }} />
              <Tooltip
                contentStyle={{ backgroundColor: "#18181B", border: "1px solid #27272A", borderRadius: 8 }}
                labelStyle={{ color: "#FAFAFA" }}
                itemStyle={{ color: "#A1A1AA" }}
                formatter={(value: number, name: string) => [
                  value.toLocaleString(),
                  name === "dau" ? "DAU" : "Pages vues",
                ]}
                labelFormatter={(l: string) => `Date: ${l}`}
              />
              <Area
                yAxisId="pv"
                type="monotone"
                dataKey="page_views"
                stroke="#F97316"
                fill="url(#orangeGrad)"
                strokeWidth={2}
              />
              <Area
                yAxisId="dau"
                type="monotone"
                dataKey="dau"
                stroke="#F97316"
                fill="none"
                strokeWidth={2}
                strokeDasharray="5 3"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Section 4: Per-organization table                                 */}
      {/* ----------------------------------------------------------------- */}
      {sortedOrgs.length > 0 && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B]">
          <div className="border-b border-[#27272A] px-5 py-3.5">
            <h3 className="font-display text-sm font-semibold text-[#FAFAFA]">
              Activit&eacute; par organisation
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[#27272A] text-left text-xs text-[#71717A]">
                <tr>
                  <th
                    className="cursor-pointer px-5 py-2.5 font-medium hover:text-[#FAFAFA]"
                    onClick={() => handleSort("org_name")}
                  >
                    Organisation <SortIcon col="org_name" />
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 font-medium hover:text-[#FAFAFA]"
                    onClick={() => handleSort("plan")}
                  >
                    Plan <SortIcon col="plan" />
                  </th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-[#FAFAFA]"
                    onClick={() => handleSort("active_users")}
                  >
                    Utilisateurs actifs <SortIcon col="active_users" />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Module favori</th>
                  <th
                    className="cursor-pointer px-3 py-2.5 text-right font-medium hover:text-[#FAFAFA]"
                    onClick={() => handleSort("events")}
                  >
                    &Eacute;v&eacute;nements <SortIcon col="events" />
                  </th>
                  <th
                    className="cursor-pointer px-5 py-2.5 text-right font-medium hover:text-[#FAFAFA]"
                    onClick={() => handleSort("last_activity")}
                  >
                    Derni&egrave;re activit&eacute; <SortIcon col="last_activity" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272A]/50">
                {sortedOrgs.map((o) => (
                  <tr key={o.org_id} className="hover:bg-[#1C1C1F]">
                    <td className="px-5 py-2.5 font-medium text-[#FAFAFA]">{o.org_name}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${planBadgeClass(o.plan)}`}
                      >
                        {o.plan}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#A1A1AA]">{o.active_users}</td>
                    <td className="px-3 py-2.5 text-[#A1A1AA]">{o.favorite_module}</td>
                    <td className="px-3 py-2.5 text-right text-[#A1A1AA]">{o.events.toLocaleString()}</td>
                    <td className="px-5 py-2.5 text-right text-[#71717A]">
                      {o.last_activity ? relativeTime(o.last_activity) : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Section 5: Feature adoption                                       */}
      {/* ----------------------------------------------------------------- */}
      {adoption.length > 0 && (
        <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
          <h3 className="mb-4 font-display text-sm font-semibold text-[#FAFAFA]">
            Adoption des fonctionnalit&eacute;s
          </h3>
          <div className="space-y-3">
            {adoption.map((item) => (
              <div key={item.feature} className="flex items-center gap-4">
                <span className="w-32 shrink-0 text-sm text-[#A1A1AA]">{item.feature}</span>
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[#27272A]">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full ${adoptionBarColor(item.adoption_pct)}`}
                    style={{ width: `${Math.min(100, item.adoption_pct)}%` }}
                  />
                </div>
                <span className="w-28 shrink-0 text-right text-sm text-[#A1A1AA]">
                  {item.adoption_pct}% des utilisateurs
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Section 6: User journey                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="rounded-xl border border-[#27272A] bg-[#18181B] p-5">
        <h3 className="mb-4 font-display text-sm font-semibold text-[#FAFAFA]">
          Parcours utilisateur
        </h3>

        {/* User selector */}
        <div className="mb-4">
          <select
            value={selectedUserId}
            onChange={(e) => {
              setSelectedUserId(e.target.value);
              setExpandedSession(null);
              fetchJourney(e.target.value);
            }}
            className="w-full max-w-md rounded-lg border border-[#27272A] bg-[#0F0F11] px-3 py-2 text-sm text-[#FAFAFA] outline-none focus:border-[#F97316]"
          >
            <option value="">S&eacute;lectionner un utilisateur...</option>
            {journeyUsers.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </div>

        {/* Journey loading */}
        {journeyLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[#F97316]" />
          </div>
        )}

        {/* No user selected */}
        {!selectedUserId && !journeyLoading && (
          <p className="py-6 text-center text-sm text-[#71717A]">
            S&eacute;lectionnez un utilisateur pour voir ses derni&egrave;res sessions.
          </p>
        )}

        {/* Sessions */}
        {selectedUserId && !journeyLoading && sessions.length === 0 && (
          <p className="py-6 text-center text-sm text-[#71717A]">
            Aucune session trouv&eacute;e pour cet utilisateur.
          </p>
        )}

        {sessions.length > 0 && !journeyLoading && (
          <div className="space-y-3">
            {sessions.slice(0, 5).map((session, idx) => {
              const isOpen = expandedSession === idx;
              return (
                <div
                  key={idx}
                  className="rounded-lg border border-[#27272A] bg-[#0F0F11]"
                >
                  <button
                    onClick={() => setExpandedSession(isOpen ? null : idx)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-[#F97316]" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-[#71717A]" />
                      )}
                      <span className="font-medium text-[#FAFAFA]">
                        Session {idx + 1}
                      </span>
                      <span className="text-[#71717A]">
                        {new Date(session.started_at).toLocaleString("fr-CH")}
                      </span>
                    </div>
                    <span className="text-xs text-[#71717A]">
                      {session.pages.length} page{session.pages.length !== 1 ? "s" : ""}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-[#27272A] px-4 py-3">
                      <div className="relative ml-4 border-l-2 border-[#27272A] pl-6">
                        {/* Start */}
                        <div className="relative mb-3">
                          <div className="absolute -left-[31px] top-0.5 h-3 w-3 rounded-full border-2 border-[#22C55E] bg-[#0F0F11]" />
                          <p className="text-xs text-[#22C55E]">
                            D&eacute;but &mdash; {new Date(session.started_at).toLocaleTimeString("fr-CH")}
                          </p>
                        </div>

                        {/* Pages */}
                        {session.pages.map((page, pidx) => (
                          <div key={pidx} className="relative mb-3">
                            <div className="absolute -left-[31px] top-0.5 h-3 w-3 rounded-full border-2 border-[#3F3F46] bg-[#18181B]" />
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-[#A1A1AA]">{page.path}</span>
                              <span className="text-xs text-[#71717A]">
                                {page.duration_sec}s
                              </span>
                              {page.feature && (
                                <span className="rounded bg-[#F97316]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#F97316]">
                                  {page.feature}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* End */}
                        <div className="relative">
                          <div className="absolute -left-[31px] top-0.5 h-3 w-3 rounded-full border-2 border-[#EF4444] bg-[#0F0F11]" />
                          <p className="text-xs text-[#EF4444]">
                            Fin &mdash; {new Date(session.ended_at).toLocaleTimeString("fr-CH")}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
