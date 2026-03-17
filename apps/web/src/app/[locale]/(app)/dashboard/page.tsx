"use client";

import { useState, useEffect, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { useEmailContextSafe } from "@/lib/contexts/email-context";
import {
  Mail,
  FolderKanban,
  CheckSquare,
  FileSpreadsheet,
  FileText,
  MessageSquare,
  TrendingUp,
  Truck,
  Map,
  AlertTriangle,
  ArrowRight,
  Calendar,
  Clock,
  Plus,
  RefreshCw,
  ChevronRight,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/* ─── types ─── */
interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  project_id: string;
  created_at: string;
}
interface MeetingItem {
  id: string;
  title: string;
  meeting_date: string;
  project_id: string;
  status: string;
}
interface ProjectItem {
  id: string;
  name: string;
  code: string;
  status: string;
  color: string | null;
  start_date: string | null;
  end_date: string | null;
}

/* ─── helpers ─── */
function getGreetingKey(): "greeting_morning" | "greeting_afternoon" | "greeting_evening" {
  const h = new Date().getHours();
  if (h < 12) return "greeting_morning";
  if (h < 18) return "greeting_afternoon";
  return "greeting_evening";
}

function formatDateLocale(): string {
  return new Date().toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isOverdue(due: string | null): boolean {
  if (!due) return false;
  return new Date(due) < new Date(new Date().toDateString());
}

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - new Date().getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/* ─── Skeleton loader ─── */
function StatSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-100 bg-white p-5">
      <div className="flex items-center gap-4">
        <div className="h-11 w-11 rounded-xl bg-gray-100" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-12 rounded bg-gray-100" />
          <div className="h-4 w-24 rounded bg-gray-50" />
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─── */
export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tn = useTranslations("nav");
  const { user } = useAuth();
  const emailCtx = useEmailContextSafe();
  const unreadCount = emailCtx?.unreadCount || 0;

  const [profileName, setProfileName] = useState<string | null>(null);
  const firstName = user?.user_metadata?.first_name || profileName || tn("user");

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  /* ─── Fetch data ─── */
  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((d) => { if (d.profile?.first_name) setProfileName(d.profile.first_name); })
      .catch(() => {});

    Promise.all([
      fetch("/api/tasks").then((r) => r.json()).catch(() => ({ tasks: [] })),
      fetch("/api/pv").then((r) => r.json()).catch(() => ({ meetings: [] })),
      fetch("/api/projects/list").then((r) => r.json()).catch(() => ({ projects: [] })),
    ]).then(([tasksRes, pvsRes, projectsRes]) => {
      setTasks(tasksRes.tasks || []);
      setMeetings(pvsRes.meetings || []);
      setProjects(projectsRes.projects || []);
    }).finally(() => setLoading(false));
  }, []);

  /* ─── Derived data ─── */
  const stats = useMemo(() => {
    const activeTasks = tasks.filter(
      (t) => t.status === "todo" || t.status === "in_progress" || t.status === "waiting"
    );
    const overdueTasks = activeTasks.filter((t) => isOverdue(t.due_date));
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const pvThisWeek = meetings.filter((m) => new Date(m.meeting_date) >= weekAgo).length;
    const activeProjects = projects.filter(
      (p) => p.status === "active" || p.status === "planning"
    );
    return {
      pendingTasks: activeTasks.length,
      overdueTasks: overdueTasks.length,
      overdueList: overdueTasks.slice(0, 4),
      pvThisWeek,
      activeProjects: activeProjects.length,
      projectsList: activeProjects.slice(0, 4),
    };
  }, [tasks, meetings, projects]);

  const nextMeeting = useMemo(() => {
    const now = new Date();
    return meetings
      .filter((m) => new Date(m.meeting_date) >= now)
      .sort((a, b) => new Date(a.meeting_date).getTime() - new Date(b.meeting_date).getTime())[0] || null;
  }, [meetings]);

  /* ─── Sync action ─── */
  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/outlook/sync", { method: "POST" });
    } catch {}
    setSyncing(false);
  };

  /* ─── Module config ─── */
  const moduleLinks: { href: string; icon: LucideIcon; label: string; color: string; bg: string; badge?: number }[] = [
    { href: "/mail", icon: Mail, label: t("cardMailTitle"), color: "text-[#2563EB]", bg: "bg-blue-50", badge: unreadCount || undefined },
    { href: "/tasks", icon: CheckSquare, label: t("cardTasksTitle"), color: "text-[#10B981]", bg: "bg-green-50" },
    { href: "/pv-chantier", icon: FileText, label: t("cardPvTitle"), color: "text-[#F59E0B]", bg: "bg-amber-50" },
    { href: "/projects", icon: FolderKanban, label: t("cardProjectsTitle"), color: "text-purple-600", bg: "bg-purple-50" },
    { href: "/plans", icon: Map, label: t("cardPlansTitle"), color: "text-rose-600", bg: "bg-rose-50" },
    { href: "/submissions", icon: FileSpreadsheet, label: t("cardSubmissionsTitle"), color: "text-indigo-600", bg: "bg-indigo-50" },
    { href: "/suppliers", icon: Truck, label: t("cardSuppliersTitle"), color: "text-amber-600", bg: "bg-amber-50" },
    { href: "/cantaia-prix", icon: TrendingUp, label: t("cardPrixTitle"), color: "text-emerald-600", bg: "bg-emerald-50" },
    { href: "/chat", icon: MessageSquare, label: t("cardChatTitle"), color: "text-cyan-600", bg: "bg-cyan-50" },
  ];

  /* ─── Project task counts ─── */
  const projectTaskCounts = useMemo(() => {
    const map: Record<string, { total: number; overdue: number }> = {};
    tasks.forEach((t) => {
      if (!map[t.project_id]) map[t.project_id] = { total: 0, overdue: 0 };
      if (t.status !== "done" && t.status !== "cancelled") {
        map[t.project_id].total++;
        if (isOverdue(t.due_date)) map[t.project_id].overdue++;
      }
    });
    return map;
  }, [tasks]);

  const projectColors: Record<string, string> = {
    planning: "bg-blue-500",
    active: "bg-emerald-500",
    paused: "bg-amber-500",
    completed: "bg-gray-400",
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-[1400px] mx-auto space-y-6">

        {/* ═══ HEADER ═══ */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#111827] sm:text-[28px]">
              {t(getGreetingKey(), { name: firstName })}
            </h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-[#6B7280]">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateLocale()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-all hover:border-blue-200 hover:text-[#2563EB] hover:shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {t("syncMailAction")}
            </button>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 transition-all hover:border-blue-200 hover:text-[#2563EB] hover:shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("newTaskAction")}
            </Link>
            <Link
              href="/pv-chantier/nouveau"
              className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-3 py-2 text-xs font-medium text-white transition-all hover:bg-[#1D4ED8] hover:shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("newPvAction")}
            </Link>
          </div>
        </div>

        {/* ═══ KPI STATS ═══ */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {loading ? (
            <>
              <StatSkeleton /><StatSkeleton /><StatSkeleton /><StatSkeleton />
            </>
          ) : (
            <>
              {/* Emails */}
              <Link
                href="/mail"
                className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-5 transition-all duration-200 hover:shadow-md hover:border-blue-200"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50">
                    <Mail className="h-5 w-5 text-[#2563EB]" />
                  </div>
                  <div>
                    <div className="font-display text-2xl font-bold text-[#111827]">{unreadCount}</div>
                    <div className="text-xs text-[#6B7280]">{t("unreadEmails")}</div>
                  </div>
                </div>
                {unreadCount > 0 && (
                  <div className="absolute top-3 right-3 h-2.5 w-2.5 rounded-full bg-[#2563EB] animate-pulse" />
                )}
              </Link>

              {/* Tasks */}
              <Link
                href="/tasks"
                className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-5 transition-all duration-200 hover:shadow-md hover:border-green-200"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-50">
                    <CheckSquare className="h-5 w-5 text-[#10B981]" />
                  </div>
                  <div>
                    <div className="font-display text-2xl font-bold text-[#111827]">{stats.pendingTasks}</div>
                    <div className="text-xs text-[#6B7280]">{t("pendingTasks")}</div>
                  </div>
                </div>
                {stats.overdueTasks > 0 && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] font-medium text-red-600">
                    <AlertTriangle className="h-3 w-3" />
                    {t("overdueWarning", { count: stats.overdueTasks })}
                  </div>
                )}
              </Link>

              {/* PV */}
              <Link
                href="/pv-chantier"
                className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-5 transition-all duration-200 hover:shadow-md hover:border-amber-200"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50">
                    <FileText className="h-5 w-5 text-[#F59E0B]" />
                  </div>
                  <div>
                    <div className="font-display text-2xl font-bold text-[#111827]">{stats.pvThisWeek}</div>
                    <div className="text-xs text-[#6B7280]">{t("pvThisWeek")}</div>
                  </div>
                </div>
                {nextMeeting && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-[#6B7280]">
                    <Clock className="h-3 w-3" />
                    {t("nextMeetingDate", {
                      date: new Date(nextMeeting.meeting_date).toLocaleDateString("fr-CH", { day: "numeric", month: "short" }),
                    })}
                  </div>
                )}
              </Link>

              {/* Projects */}
              <Link
                href="/projects"
                className="group relative overflow-hidden rounded-xl border border-gray-100 bg-white p-5 transition-all duration-200 hover:shadow-md hover:border-purple-200"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50">
                    <FolderKanban className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <div className="font-display text-2xl font-bold text-[#111827]">{stats.activeProjects}</div>
                    <div className="text-xs text-[#6B7280]">{t("activeProjects")}</div>
                  </div>
                </div>
              </Link>
            </>
          )}
        </div>

        {/* ═══ MAIN CONTENT ═══ */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* ── LEFT COLUMN (2/3) ── */}
          <div className="space-y-6 lg:col-span-2">

            {/* Attention requise */}
            {!loading && stats.overdueTasks > 0 && (
              <div className="rounded-xl border border-red-100 bg-gradient-to-r from-red-50/80 to-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100">
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    </div>
                    <h2 className="font-display text-sm font-semibold text-red-900">
                      {t("attentionNeeded")}
                    </h2>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                      {stats.overdueTasks}
                    </span>
                  </div>
                  <Link href="/tasks" className="text-xs font-medium text-red-600 hover:text-red-800 transition-colors">
                    {t("viewAll")} <ChevronRight className="inline h-3 w-3" />
                  </Link>
                </div>
                <div className="space-y-2">
                  {stats.overdueList.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-lg bg-white/80 px-3 py-2.5 border border-red-100/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-2 w-2 rounded-full shrink-0 ${
                          task.priority === "urgent" ? "bg-red-500" :
                          task.priority === "high" ? "bg-orange-500" : "bg-amber-400"
                        }`} />
                        <span className="text-sm text-[#111827] truncate">{task.title}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {task.due_date && (
                          <span className="text-[11px] text-red-600 font-medium">
                            {new Date(task.due_date).toLocaleDateString("fr-CH", { day: "numeric", month: "short" })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No urgency message */}
            {!loading && stats.overdueTasks === 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 px-5 py-4">
                <Sparkles className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-sm text-emerald-800 font-medium">{t("nothingUrgent")}</p>
              </div>
            )}

            {/* Projets récents */}
            <div className="rounded-xl border border-gray-100 bg-white">
              <div className="flex items-center justify-between border-b border-gray-50 px-5 py-4">
                <h2 className="font-display text-sm font-semibold text-[#111827]">
                  {t("recentProjects")}
                </h2>
                <Link href="/projects" className="text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors">
                  {t("viewAll")} <ChevronRight className="inline h-3 w-3" />
                </Link>
              </div>
              {loading ? (
                <div className="p-5 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="animate-pulse flex items-center gap-4">
                      <div className="h-10 w-10 rounded-lg bg-gray-100" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-40 rounded bg-gray-100" />
                        <div className="h-3 w-24 rounded bg-gray-50" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : stats.projectsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <FolderKanban className="h-8 w-8 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-400">{t("noProjects")}</p>
                  <Link
                    href="/projects/new"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#2563EB] hover:text-[#1D4ED8]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("newProject")}
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {stats.projectsList.map((project) => {
                    const tc = projectTaskCounts[project.id] || { total: 0, overdue: 0 };
                    const statusColor = projectColors[project.status] || "bg-gray-400";
                    return (
                      <Link
                        key={project.id}
                        href={`/projects/${project.id}`}
                        className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-gray-50/50"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-50 border border-gray-100 group-hover:border-blue-100 transition-colors">
                          <span className="font-display text-xs font-bold text-gray-600 uppercase">
                            {project.code?.slice(0, 3) || project.name.slice(0, 2)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#111827] truncate group-hover:text-[#2563EB] transition-colors">
                              {project.name}
                            </span>
                            <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusColor}`} />
                          </div>
                          <div className="mt-0.5 flex items-center gap-3 text-[11px] text-[#9CA3AF]">
                            {tc.total > 0 && (
                              <span className={tc.overdue > 0 ? "text-red-500 font-medium" : ""}>
                                {t("tasksCount", { count: tc.total })}
                                {tc.overdue > 0 && ` (${tc.overdue} ⚠)`}
                              </span>
                            )}
                            {project.end_date && (
                              <span>
                                {daysUntil(project.end_date) > 0
                                  ? `${daysUntil(project.end_date)}j`
                                  : t("overdue")}
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT COLUMN (1/3) ── */}
          <div className="space-y-6">

            {/* Modules — Accès rapide */}
            <div className="rounded-xl border border-gray-100 bg-white">
              <div className="border-b border-gray-50 px-5 py-4">
                <h2 className="font-display text-sm font-semibold text-[#111827]">
                  {t("modulesTitle")}
                </h2>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-3 gap-1.5">
                  {moduleLinks.map((mod) => {
                    const Icon = mod.icon;
                    return (
                      <Link
                        key={mod.href}
                        href={mod.href}
                        className="group relative flex flex-col items-center gap-2 rounded-xl px-2 py-3.5 text-center transition-all hover:bg-gray-50"
                      >
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${mod.bg} transition-transform group-hover:scale-110`}>
                          <Icon className={`h-5 w-5 ${mod.color}`} />
                        </div>
                        <span className="text-[11px] font-medium text-[#6B7280] group-hover:text-[#111827] transition-colors leading-tight">
                          {mod.label}
                        </span>
                        {mod.badge && mod.badge > 0 && (
                          <span className="absolute top-2 right-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                            {mod.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Prochaine séance */}
            {nextMeeting && (
              <div className="rounded-xl border border-gray-100 bg-white p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4 text-[#F59E0B]" />
                  <h3 className="text-sm font-semibold text-[#111827]">{t("nextMeeting")}</h3>
                </div>
                <Link
                  href={`/meetings/${nextMeeting.id}`}
                  className="group block rounded-lg bg-amber-50/50 border border-amber-100 p-3 transition-all hover:border-amber-200 hover:shadow-sm"
                >
                  <p className="text-sm font-medium text-[#111827] group-hover:text-[#F59E0B] transition-colors truncate">
                    {nextMeeting.title}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-[#6B7280]">
                    <Clock className="h-3 w-3" />
                    {new Date(nextMeeting.meeting_date).toLocaleDateString("fr-CH", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </Link>
              </div>
            )}

            {/* Activité récente (dernières tâches complétées) */}
            {!loading && (
              <div className="rounded-xl border border-gray-100 bg-white">
                <div className="border-b border-gray-50 px-5 py-4">
                  <h2 className="font-display text-sm font-semibold text-[#111827]">
                    {t("recentActivity")}
                  </h2>
                </div>
                <div className="p-4">
                  {(() => {
                    const recentDone = tasks
                      .filter((t) => t.status === "done")
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .slice(0, 4);
                    if (recentDone.length === 0) {
                      return (
                        <p className="py-4 text-center text-xs text-gray-400">
                          {t("noRecentActivity")}
                        </p>
                      );
                    }
                    return (
                      <div className="space-y-3">
                        {recentDone.map((task) => (
                          <div key={task.id} className="flex items-start gap-3">
                            <div className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50">
                              <CheckSquare className="h-3 w-3 text-emerald-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-[#111827] truncate">{task.title}</p>
                              <p className="text-[10px] text-[#9CA3AF]">
                                {new Date(task.created_at).toLocaleDateString("fr-CH", {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
