"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Users,
  FolderKanban,
  Mail,
  FileText,
  CheckSquare,
} from "lucide-react";
// createClient removed — members fetched via /api/admin/clients (bypasses RLS recursion)

interface OrgStats {
  members: number;
  projects: number;
  emails: number;
  pvs: number;
  tasks: number;
}

export default function AdminOverviewPage() {
  const t = useTranslations("admin");
  const [stats, setStats] = useState<OrgStats>({
    members: 0,
    projects: 0,
    emails: 0,
    pvs: 0,
    tasks: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Fetch members count via API route (bypasses RLS recursion on users table)
        const membersRes = await fetch("/api/admin/clients").then((r) => r.json()).catch(() => ({ members: [] }));
        const membersCount = membersRes?.members?.length || 0;

        // Fetch projects, emails, PVs, and tasks in parallel
        const [projectsRes, emailsRes, pvsRes, tasksRes] = await Promise.all([
          fetch("/api/projects/list").then((r) => r.json()).catch(() => ({ projects: [] })),
          fetch("/api/emails/inbox").then((r) => r.json()).catch(() => ({ emails: [] })),
          fetch("/api/pv").then((r) => r.json()).catch(() => ({ meetings: [] })),
          fetch("/api/tasks").then((r) => r.json()).catch(() => ({ tasks: [] })),
        ]);

        setStats({
          members: membersCount,
          projects: projectsRes.projects?.length || 0,
          emails: emailsRes.emails?.length || 0,
          pvs: pvsRes.meetings?.length || 0,
          tasks: tasksRes.tasks?.length || 0,
        });
      } catch (err) {
        console.error("[AdminOverview] Failed to fetch stats:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const cards = [
    {
      icon: Users,
      label: t("metricClients"),
      value: String(stats.members),
      color: "blue",
    },
    {
      icon: FolderKanban,
      label: "Projets",
      value: String(stats.projects),
      color: "green",
    },
    {
      icon: Mail,
      label: t("metricEmails"),
      value: stats.emails.toLocaleString("fr-CH"),
      color: "indigo",
    },
    {
      icon: FileText,
      label: t("metricPV"),
      value: String(stats.pvs),
      color: "purple",
    },
    {
      icon: CheckSquare,
      label: t("metricTasks"),
      value: String(stats.tasks),
      color: "amber",
    },
  ];

  const colorMap: Record<string, { bg: string; icon: string; text: string }> = {
    blue: { bg: "bg-blue-50", icon: "text-blue-600", text: "text-blue-700" },
    green: { bg: "bg-green-50", icon: "text-green-600", text: "text-green-700" },
    indigo: { bg: "bg-indigo-50", icon: "text-indigo-600", text: "text-indigo-700" },
    purple: { bg: "bg-purple-50", icon: "text-purple-600", text: "text-purple-700" },
    amber: { bg: "bg-amber-50", icon: "text-amber-600", text: "text-amber-700" },
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

      {/* Loading state */}
      {loading ? (
        <div className="mt-10 flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : (
        /* Metric Cards */
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
