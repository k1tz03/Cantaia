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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getRelativeTime } from "@/lib/mock-data";

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

interface RecentActivity {
  id: string;
  type: string;
  orgName: string;
  userName: string;
  description: string;
  time: string;
  icon: "email" | "pv" | "login" | "project" | "user";
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

  useEffect(() => {
    async function loadMetrics() {
      try {
        const supabase = createClient();

        // Fetch counts in parallel
        const [orgsRes, usersRes, projectsRes, emailsRes, apiRes] = await Promise.all([
          supabase.from("organizations").select("id, status", { count: "exact" }),
          supabase.from("users").select("id", { count: "exact" }),
          supabase.from("projects").select("id", { count: "exact" }),
          supabase.from("emails").select("id", { count: "exact" }),
          supabase.from("api_usage_logs").select("id", { count: "exact" }),
        ]);

        const activeOrgs = orgsRes.data?.filter((o: { status: string }) =>
          o.status === "active" || o.status === "trial"
        ).length ?? 0;

        setMetrics({
          totalOrganizations: orgsRes.count ?? 0,
          totalUsers: usersRes.count ?? 0,
          totalProjects: projectsRes.count ?? 0,
          totalEmails: emailsRes.count ?? 0,
          aiCallsThisMonth: apiRes.count ?? 0,
          mrr: 0, // Will come from Stripe later
          storageGb: 0,
          activeOrgs,
        });

        // Fetch recent admin activity
        const { data: activityData } = await supabase
          .from("admin_activity_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10);

        if (activityData && activityData.length > 0) {
          setActivities(
            activityData.map((a: Record<string, unknown>) => ({
              id: a.id as string,
              type: a.action as string,
              orgName: ((a.metadata as Record<string, unknown>)?.org_name as string) || "—",
              userName: ((a.metadata as Record<string, unknown>)?.user_name as string) || "—",
              description: a.action as string,
              time: a.created_at as string,
              icon: getActivityIcon(a.action as string),
            }))
          );
        }
      } catch (err) {
        console.error("Failed to load metrics:", err);
      } finally {
        setLoading(false);
      }
    }
    loadMetrics();
  }, []);

  function getActivityIcon(action: string): RecentActivity["icon"] {
    if (action.includes("email") || action.includes("classify")) return "email";
    if (action.includes("pv") || action.includes("transcribe")) return "pv";
    if (action.includes("login")) return "login";
    if (action.includes("project")) return "project";
    return "user";
  }

  const iconMap = {
    email: Mail,
    pv: FileText,
    login: LogIn,
    project: FolderKanban,
    user: UserPlus,
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

      {/* Recent Activity */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-3.5">
          <Clock className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-800">{t("recentActivity")}</h2>
        </div>

        {loading ? (
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
              const Icon = iconMap[activity.icon];
              return (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
                    <Icon className="h-4 w-4 text-gray-500" />
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
                    {getRelativeTime(activity.time)}
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
