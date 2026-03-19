"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  FolderKanban,
  CheckSquare,
  AlertTriangle,
  Mail,
} from "lucide-react";
import TeamHealthCard, { type MemberHealth } from "./TeamHealthCard";
import ActivityFeed, { type ActivityItem } from "./ActivityFeed";

export default function AdminOverviewTab() {
  const t = useTranslations("admin");
  const [members, setMembers] = useState<MemberHealth[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [healthRes, activityRes] = await Promise.all([
          fetch("/api/admin/team-health").then((r) => r.json()).catch(() => ({ members: [] })),
          fetch("/api/admin/activity-feed").then((r) => r.json()).catch(() => ({ activities: [] })),
        ]);

        setMembers(healthRes.members || []);
        setActivities(activityRes.activities || []);
      } catch (err) {
        console.error("[AdminOverview] Failed to fetch:", err);
      } finally {
        setLoading(false);
        setActivitiesLoading(false);
      }
    }

    fetchData();
  }, []);

  // Derive KPIs from team health data
  const totalOpenTasks = members.reduce(
    (sum, m) => sum + m.in_progress_tasks + m.overdue_tasks,
    0
  );
  const totalOverdue = members.reduce((sum, m) => sum + m.overdue_tasks, 0);
  const totalUnprocessed = members.reduce(
    (sum, m) => sum + m.unprocessed_emails,
    0
  );

  // Fetch project count separately
  const [projectCount, setProjectCount] = useState(0);
  useEffect(() => {
    fetch("/api/projects/list")
      .then((r) => r.json())
      .then((data) => setProjectCount(data.projects?.length || 0))
      .catch(() => {});
  }, []);

  const kpis = [
    {
      icon: FolderKanban,
      label: t("projects"),
      value: loading ? "..." : String(projectCount),
      color: "blue" as const,
    },
    {
      icon: CheckSquare,
      label: t("openTasks"),
      value: loading ? "..." : String(totalOpenTasks),
      color: "green" as const,
    },
    {
      icon: AlertTriangle,
      label: t("overdueTasks"),
      value: loading ? "..." : String(totalOverdue),
      color: totalOverdue > 0 ? ("red" as const) : ("gray" as const),
    },
    {
      icon: Mail,
      label: t("unprocessedEmails"),
      value: loading ? "..." : String(totalUnprocessed),
      color: "indigo" as const,
    },
  ];

  const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
    blue: { bg: "bg-blue-50", icon: "text-blue-600", text: "text-blue-700" },
    green: {
      bg: "bg-green-50",
      icon: "text-green-600",
      text: "text-green-700",
    },
    red: { bg: "bg-red-50", icon: "text-red-600", text: "text-red-700" },
    gray: { bg: "bg-gray-50", icon: "text-gray-600", text: "text-gray-700" },
    indigo: {
      bg: "bg-indigo-50",
      icon: "text-indigo-600",
      text: "text-indigo-700",
    },
  };

  return (
    <div className="space-y-8">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const colors = colorMap[kpi.color] || colorMap.gray;
          return (
            <div
              key={kpi.label}
              className="rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.bg}`}
                >
                  <kpi.icon className={`h-5 w-5 ${colors.icon}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
                    {kpi.label}
                  </p>
                  <p className={`text-2xl font-bold ${colors.text}`}>
                    {kpi.value}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Team Health */}
      <div>
        <h2 className="mb-4 text-sm font-semibold text-gray-700">
          {t("teamHealth")}
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white py-8 text-center text-sm text-gray-400">
            {t("noMembers")}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {members.map((member) => (
              <TeamHealthCard key={member.id} member={member} />
            ))}
          </div>
        )}
      </div>

      {/* Activity Feed */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          {t("activityFeed")}
        </h2>
        <ActivityFeed activities={activities} loading={activitiesLoading} />
      </div>
    </div>
  );
}
