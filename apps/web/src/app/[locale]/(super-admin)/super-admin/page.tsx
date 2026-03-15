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
  const [loading, setLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [sentry, setSentry] = useState<SentryData>({ configured: false, total: 0, errors: [] });
  const [sentryLoading, setSentryLoading] = useState(true);

  useEffect(() => {
    async function loadMetrics() {
      try {
        // Use API route (admin client, bypasses RLS)
        const [metricsRes, orgsRes] = await Promise.all([
          fetch("/api/super-admin?action=platform-metrics").then(r => r.json()),
          fetch("/api/super-admin?action=list-organizations").then(r => r.json()),
        ]);

        const m = metricsRes.metrics || {};
        const orgList = orgsRes.organizations || [];
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
    blue: "bg-blue-50 text-blue-600",
    indigo: "bg-indigo-50 text-indigo-600",
    emerald: "bg-emerald-50 text-emerald-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
    green: "bg-green-50 text-green-600",
    slate: "bg-slate-100 text-slate-600",
    rose: "bg-rose-50 text-rose-600",
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("platformDashboard")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("platformDashboardDesc")}</p>
      </div>

      {/* Metrics Grid */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorMap[card.color]}`}>
                <card.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-gray-500">{card.label}</p>
                <p className="text-xl font-bold text-gray-900">
                  {loading ? "—" : card.value}
                </p>
                {card.sub && (
                  <p className="text-xs text-gray-400">{card.sub}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Sentry Errors */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
          <ShieldAlert className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-800">Erreurs production (Sentry)</h2>
        </div>

        {sentryLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          </div>
        ) : !sentry.configured ? (
          <div className="px-5 py-6 text-center">
            <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">
              Sentry non configuré — Ajoutez{" "}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">SENTRY_AUTH_TOKEN</code>{" "}
              dans les variables d&apos;environnement.
            </p>
          </div>
        ) : sentry.total === 0 ? (
          <div className="px-5 py-6 text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-50">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-sm font-medium text-green-700">Aucune erreur non résolue</p>
          </div>
        ) : (
          <>
            <div className="px-5 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${sentry.total > 5 ? "text-red-500" : "text-amber-500"}`} />
                <span className="text-sm font-medium text-gray-700">
                  {sentry.total} erreur{sentry.total > 1 ? "s" : ""} non résolue{sentry.total > 1 ? "s" : ""}
                </span>
                <span
                  className={`ml-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    sentry.total > 5
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {sentry.total > 5 ? "critique" : "attention"}
                </span>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
                  <th className="px-5 py-2 font-medium">Erreur</th>
                  <th className="px-3 py-2 font-medium">Module</th>
                  <th className="px-3 py-2 font-medium text-right">Occ.</th>
                  <th className="px-5 py-2 font-medium text-right">Dernière fois</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sentry.errors.slice(0, 5).map((issue) => (
                  <tr
                    key={issue.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => window.open(issue.permalink, "_blank")}
                  >
                    <td className="max-w-[300px] truncate px-5 py-2.5 font-medium text-gray-800">
                      {issue.title.length > 60 ? issue.title.slice(0, 60) + "..." : issue.title}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-gray-500">
                      {issue.culprit
                        ? issue.culprit.length > 30
                          ? issue.culprit.slice(0, 30) + "..."
                          : issue.culprit
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-600">{issue.count}</td>
                    <td className="px-5 py-2.5 text-right text-gray-400">
                      {formatSentryTime(issue.lastSeen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border-t border-gray-100 px-5 py-3">
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
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
          <Clock className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-800">{t("recentActivity")}</h2>
        </div>

        {activitiesLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
          </div>
        ) : activities.length === 0 ? (
          <div className="py-12 text-center">
            <Activity className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-2 text-sm text-gray-400">{t("noActivity")}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {activities.map((activity) => {
              const Icon = iconMap[activity.icon] || Activity;
              return (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50"
                >
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    activity.icon === "ai" ? "bg-amber-50" : activity.icon === "email" ? "bg-blue-50" : "bg-gray-100"
                  }`}>
                    <Icon className={`h-4 w-4 ${
                      activity.icon === "ai" ? "text-amber-500" : activity.icon === "email" ? "text-blue-500" : "text-gray-500"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{activity.orgName}</span>
                      {" — "}
                      <span>{activity.userName}</span>
                      {" : "}
                      <span className="text-gray-500">{activity.description}</span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
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
