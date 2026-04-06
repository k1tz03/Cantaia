"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Building2,
  Users,
  FolderKanban,
  Mail,
  Sparkles,
  DollarSign,
  HardDrive,
  Activity,
  Clock,
  UserPlus,
  FileText,
  LogIn,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Bot,
} from "lucide-react";

interface PlatformMetrics {
  totalOrganizations: number;
  totalUsers: number;
  totalProjects: number;
  totalEmails: number;
  aiCallsThisMonth: number;
  mrr: number;
  storageGb: number;
  activeOrgs: number;
}

interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  count: string;
  lastSeen: string;
  level: string;
  permalink: string;
}

interface SentryData {
  configured: boolean;
  total: number;
  errors: SentryIssue[];
  error?: string;
}

interface RecentActivity {
  id: string;
  type: string;
  orgName: string;
  userName: string;
  description: string;
  time: string;
  icon: "email" | "pv" | "login" | "project" | "user" | "ai";
}

interface AlertItem {
  id: string;
  type: "payment_failed" | "trial_expiring" | "inactive_user";
  title: string;
  description: string;
  orgName?: string;
}

export default function SuperAdminDashboardPage() {
  const t = useTranslations("superAdmin");
  const [metrics, setMetrics] = useState<PlatformMetrics>({
    totalOrganizations: 0,
    totalUsers: 0,
    totalProjects: 0,
    totalEmails: 0,
    aiCallsThisMonth: 0,
    mrr: 0,
    storageGb: 0,
    activeOrgs: 0,
  });
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [sentry, setSentry] = useState<SentryData>({ configured: false, total: 0, errors: [] });
  const [sentryLoading, setSentryLoading] = useState(true);

  useEffect(() => {
    async function loadMetrics() {
      try {
        // Use API route (admin client, bypasses RLS)
        const [metricsRes, orgsRes, usersRes] = await Promise.all([
          fetch("/api/super-admin?action=platform-metrics").then(r => r.json()),
          fetch("/api/super-admin?action=list-organizations").then(r => r.json()),
          fetch("/api/super-admin?action=all-users").then(r => r.json()),
        ]);

        const m = metricsRes.metrics || {};
        const orgList = orgsRes.organizations || [];
        const userList = usersRes.users || [];
        const activeOrgs = orgList.filter((o: any) => {
          const s = o.status || "active";
          return s === "active" || s === "trial";
        }).length;
        const totalProjects = orgList.reduce((sum: number, o: any) => sum + (o.project_count || 0), 0);

        setMetrics({
          totalOrganizations: m.totalOrgs || orgList.length,
          totalUsers: m.totalUsers || 0,
          totalProjects,
          totalEmails: m.totalEmails || 0,
          aiCallsThisMonth: m.aiCallsThisMonth || 0,
          mrr: m.mrr || 0,
          storageGb: m.storageGb || 0,
          activeOrgs,
        });

        // Compute alerts from org + user data
        const computedAlerts: AlertItem[] = [];

        // Payment failed: orgs with plan_status = 'past_due'
        for (const org of orgList) {
          if (org.plan_status === "past_due") {
            computedAlerts.push({
              id: `pay-${org.id}`,
              type: "payment_failed",
              title: "Paiement en échec",
              description: `${org.name} — Plan ${(org.subscription_plan || org.plan || "trial")} en retard de paiement`,
              orgName: org.name,
            });
          }
        }

        // Trial expiring: orgs with trial_ends_at within 3 days
        const now = Date.now();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        for (const org of orgList) {
          if (org.trial_ends_at) {
            const trialEnd = new Date(org.trial_ends_at).getTime();
            const remaining = trialEnd - now;
            if (remaining > 0 && remaining <= threeDaysMs) {
              const daysLeft = Math.ceil(remaining / (24 * 60 * 60 * 1000));
              computedAlerts.push({
                id: `trial-${org.id}`,
                type: "trial_expiring",
                title: "Trial expire bientôt",
                description: `${org.name} — ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}`,
                orgName: org.name,
              });
            }
          }
        }

        // Inactive users: no sign-in > 30 days
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        for (const u of userList) {
          const lastActivity = u.last_sync_at || u.created_at;
          if (lastActivity) {
            const lastTime = new Date(lastActivity).getTime();
            if (now - lastTime > thirtyDaysMs) {
              const daysSince = Math.floor((now - lastTime) / (24 * 60 * 60 * 1000));
              computedAlerts.push({
                id: `inactive-${u.id}`,
                type: "inactive_user",
                title: "Utilisateur inactif",
                description: `${u.first_name || ""} ${u.last_name || ""} (${u.email}) — ${daysSince}j sans activité${u.org_name ? ` (${u.org_name})` : ""}`,
              });
            }
          }
        }

        setAlerts(computedAlerts);
      } catch (err) {
        console.error("Failed to load metrics:", err);
      } finally {
        setLoading(false);
      }
    }
    loadMetrics();

    // Load Sentry errors
    fetch("/api/super-admin/sentry-errors")
      .then((r) => r.json())
      .then((data) => setSentry(data))
      .catch(() => {})
      .finally(() => setSentryLoading(false));

    // Load recent activity
    fetch("/api/super-admin?action=recent-activity&limit=15")
      .then((r) => r.json())
      .then((data) => setActivities(data.activities || []))
      .catch(() => {})
      .finally(() => setActivitiesLoading(false));
  }, []);

  const iconMap: Record<string, any> = {
    email: Mail,
    pv: FileText,
    login: LogIn,
    project: FolderKanban,
    user: UserPlus,
    ai: Bot,
  };

  const metricCards = [
    { icon: Building2, label: t("metricOrganizations"), value: metrics.totalOrganizations, sub: `${metrics.activeOrgs} ${t("active")}`, color: "blue" },
    { icon: Users, label: t("metricUsers"), value: metrics.totalUsers, color: "indigo" },
    { icon: FolderKanban, label: t("metricProjects"), value: metrics.totalProjects, color: "emerald" },
    { icon: Mail, label: t("metricEmails"), value: formatNumber(metrics.totalEmails), color: "violet" },
    { icon: Sparkles, label: t("metricAICalls"), value: formatNumber(metrics.aiCallsThisMonth), sub: t("thisMonth"), color: "amber" },
    { icon: DollarSign, label: "MRR", value: `${metrics.mrr} CHF`, color: "green" },
    { icon: HardDrive, label: t("metricStorage"), value: `${metrics.storageGb.toFixed(1)} GB`, color: "slate" },
    { icon: Activity, label: t("metricActiveOrgs"), value: metrics.activeOrgs, color: "rose" },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-900/20 text-blue-400",
    indigo: "bg-indigo-900/20 text-indigo-400",
    emerald: "bg-emerald-900/20 text-emerald-400",
    violet: "bg-violet-900/20 text-violet-400",
    amber: "bg-amber-900/20 text-amber-400",
    green: "bg-green-900/20 text-green-400",
    slate: "bg-slate-800/50 text-slate-400",
    rose: "bg-rose-900/20 text-rose-400",
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#FAFAFA]">{t("platformDashboard")}</h1>
        <p className="mt-1 text-sm text-[#A1A1AA]">{t("platformDashboardDesc")}</p>
      </div>

      {/* Metrics Grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-[#27272A] bg-[#18181B] p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorMap[card.color]}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-[#A1A1AA]">{card.label}</p>
                <p className="text-xl font-bold text-[#FAFAFA]">
                  {loading ? "—" : card.value}
                </p>
                {card.sub && (
                  <p className="text-xs text-[#71717A]">{card.sub}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {!loading && alerts.length > 0 && (
        <div className="mb-8 rounded-lg border border-[#27272A] bg-[#18181B]">
          <div className="flex items-center gap-2 border-b border-[#27272A] px-5 py-3.5">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-[#FAFAFA]">
              Alertes ({alerts.length})
            </h2>
          </div>
          <div className="divide-y divide-[#27272A]">
            {alerts.map((alert) => {
              const colorClass =
                alert.type === "payment_failed"
                  ? "border-l-red-500 bg-red-900/20"
                  : alert.type === "trial_expiring"
                    ? "border-l-amber-500 bg-amber-900/20"
                    : "border-l-[#52525B] bg-[#1C1C1F]/50";
              const dotColor =
                alert.type === "payment_failed"
                  ? "bg-red-500"
                  : alert.type === "trial_expiring"
                    ? "bg-amber-500"
                    : "bg-[#52525B]";
              return (
                <div
                  key={alert.id}
                  className={`flex items-center gap-3 border-l-4 px-5 py-3 ${colorClass}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#A1A1AA]">{alert.title}</p>
                    <p className="truncate text-xs text-[#A1A1AA]">{alert.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sentry Errors */}
      <div className="mb-8 rounded-lg border border-[#27272A] bg-[#18181B]">
        <div className="flex items-center gap-2 border-b border-[#27272A] px-5 py-3.5">
          <ShieldAlert className="h-4 w-4 text-[#71717A]" />
          <h2 className="text-sm font-semibold text-[#FAFAFA]">Erreurs production (Sentry)</h2>
        </div>

        {sentryLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          </div>
        ) : !sentry.configured ? (
          <div className="px-5 py-6 text-center">
            <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-[#71717A]" />
            <p className="text-sm text-[#A1A1AA]">
              Sentry non configuré — Ajoutez{" "}
              <code className="rounded bg-[#1C1C1F] px-1.5 py-0.5 text-xs font-mono">SENTRY_AUTH_TOKEN</code>{" "}
              dans les variables d&apos;environnement.
            </p>
          </div>
        ) : sentry.total === 0 ? (
          <div className="px-5 py-6 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-900/20">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-sm font-medium text-green-400">Aucune erreur non résolue</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${sentry.total > 5 ? "text-red-500" : "text-amber-500"}`} />
                <span className="text-sm font-medium text-[#A1A1AA]">
                  {sentry.total} erreur{sentry.total > 1 ? "s" : ""} non résolue{sentry.total > 1 ? "s" : ""}
                </span>
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    sentry.total > 5
                      ? "bg-red-900/30 text-red-400"
                      : "bg-amber-900/30 text-amber-400"
                  }`}
                >
                  {sentry.total > 5 ? "critique" : "attention"}
                </span>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-[#27272A] bg-[#1C1C1F] text-left text-xs text-[#A1A1AA]">
                  <th className="px-5 py-2 font-medium">Erreur</th>
                  <th className="px-3 py-2 font-medium">Module</th>
                  <th className="px-3 py-2 font-medium text-right">Occ.</th>
                  <th className="px-5 py-2 font-medium text-right">Dernière fois</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272A]">
                {sentry.errors.slice(0, 5).map((issue) => (
                  <tr
                    key={issue.id}
                    className="cursor-pointer hover:bg-[#27272A]"
                    onClick={() => window.open(issue.permalink, "_blank")}
                  >
                    <td className="max-w-[300px] truncate px-5 py-2.5 font-medium text-[#FAFAFA]">
                      {issue.title.length > 60 ? issue.title.slice(0, 60) + "..." : issue.title}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-[#A1A1AA]">
                      {issue.culprit
                        ? issue.culprit.length > 30
                          ? issue.culprit.slice(0, 30) + "..."
                          : issue.culprit
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[#A1A1AA]">{issue.count}</td>
                    <td className="px-5 py-2.5 text-right text-[#71717A]">
                      {formatSentryTime(issue.lastSeen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-[#27272A] px-5 py-3">
              <a
                href="https://sentry.io/organizations/cantaia/issues/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                Voir tout dans Sentry
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </>
        )}
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border border-[#27272A] bg-[#18181B]">
        <div className="flex items-center gap-2 border-b border-[#27272A] px-5 py-3.5">
          <Clock className="h-4 w-4 text-[#71717A]" />
          <h2 className="text-sm font-semibold text-[#FAFAFA]">{t("recentActivity")}</h2>
        </div>

        {activitiesLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          </div>
        ) : activities.length === 0 ? (
          <div className="py-12 text-center">
            <Activity className="mx-auto h-8 w-8 text-[#71717A]" />
            <p className="mt-2 text-sm text-[#71717A]">{t("noActivity")}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#27272A]">
            {activities.map((activity) => {
              const Icon = iconMap[activity.icon] || Activity;
              return (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-[#27272A]"
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    activity.icon === "ai" ? "bg-amber-900/20" : activity.icon === "email" ? "bg-blue-900/20" : "bg-[#1C1C1F]"
                  }`}>
                    <Icon className={`h-4 w-4 ${
                      activity.icon === "ai" ? "text-amber-500" : activity.icon === "email" ? "text-blue-500" : "text-[#A1A1AA]"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#A1A1AA]">
                      <span className="font-medium">{activity.orgName}</span>
                      {" — "}
                      <span>{activity.userName}</span>
                      {" : "}
                      <span className="text-[#A1A1AA]">{activity.description}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-[#71717A]">
                    {formatRelativeTime(activity.time)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function formatSentryTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  return new Date(isoDate).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
}
