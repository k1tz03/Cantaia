"use client";

import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/providers/AuthProvider";
import { useEmailContextSafe } from "@/lib/contexts/email-context";
import {
  Mail,
  FolderKanban,
  CheckSquare,
  FileSpreadsheet,
  MessageSquare,
  Calendar,
  Clock,
  Plus,
  RefreshCw,
  ChevronRight,
  Sparkles,
  Zap,
  BarChart3,
  CalendarDays,
  HardHat,
} from "lucide-react";
import { DashboardOrgView } from "@/components/app/DashboardOrgView";

const ParticleCanvas = dynamic(() => import("@/components/auth/ParticleCanvas"), { ssr: false });

/* ---- types ---- */
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
  client_name?: string;
  city?: string;
  start_date: string | null;
  end_date: string | null;
}
interface BriefingData {
  mode?: "ai" | "fallback";
  greeting?: string;
  priority_alerts?: string[];
  projects?: Array<{
    project_id: string;
    name: string;
    status_emoji: string;
    summary: string;
    action_items: string[];
  }>;
  meetings_today?: Array<{ time: string; project: string; title: string }>;
  submission_deadlines?: Array<{ title: string; deadline: string; days_remaining: number; project: string; note: string }>;
  global_summary?: string;
  // Legacy fallback fields
  content?: {
    summary?: string;
    sections?: { title: string; items: string[] }[];
    highlights?: string[];
  };
}

/* ---- helpers ---- */
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

function getProjectHealth(overdue: number, total: number): "good" | "warn" | "crit" {
  if (overdue >= 3) return "crit";
  if (overdue > 0 || total > 10) return "warn";
  return "good";
}

const PROJECT_COLORS = ["#3B82F6", "#F97316", "#10B981", "#8B5CF6", "#EF4444", "#EC4899", "#14B8A6"];

/* ---- skeleton ---- */
function KpiSkeleton() {
  return (
    <div className="animate-pulse relative overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B] p-4 sm:p-5">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-[#27272A]" />
      <div className="flex justify-between items-center mb-2">
        <div className="h-9 w-9 rounded-[10px] bg-[#27272A]" />
        <div className="h-3 w-20 rounded bg-[#27272A]" />
      </div>
      <div className="h-8 w-14 rounded bg-[#27272A] mb-1" />
      <div className="h-3 w-28 rounded bg-[#27272A]" />
    </div>
  );
}

function ProjectCardSkeleton() {
  return (
    <div className="animate-pulse relative overflow-hidden rounded-[10px] border border-[#27272A] bg-[#18181B] p-[14px_16px]">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#27272A]" />
      <div className="flex justify-between items-center">
        <div className="h-4 w-32 rounded bg-[#27272A]" />
        <div className="h-5 w-16 rounded bg-[#27272A]" />
      </div>
      <div className="h-3 w-48 rounded bg-[#27272A] mt-2" />
      <div className="h-3 w-64 rounded bg-[#27272A] mt-2" />
      <div className="h-[3px] w-full rounded bg-[#27272A] mt-2" />
    </div>
  );
}

/* ==== PAGE ==== */
export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tn = useTranslations("nav");
  const { user } = useAuth();
  const emailCtx = useEmailContextSafe();
  const unreadCount = emailCtx?.unreadCount || 0;
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "personal";

  const [profileName, setProfileName] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const firstName = user?.user_metadata?.first_name || profileName || tn("user");

  const isManager = profileRole != null && ["project_manager", "director", "admin"].includes(profileRole);
  const showOrgToggle = isManager || isSuperAdmin;

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [meetings, setMeetings] = useState<MeetingItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [briefing, setBriefing] = useState<BriefingData | null>(null);
  const [briefingGenerating, setBriefingGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  /* ---- Fetch data ---- */
  useEffect(() => {
    fetch("/api/user/profile")
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d) => {
        if (d.profile?.first_name) setProfileName(d.profile.first_name);
        if (d.profile?.role) setProfileRole(d.profile.role);
        if (d.profile?.is_superadmin) setIsSuperAdmin(true);
      })
      .catch(() => {});

    fetch("/api/briefing/today")
      .then(async (r) => {
        if (r.ok) {
          const d = await r.json();
          if (d.briefing) { setBriefing(d.briefing); return; }
        }
        // Any non-ok response (404, 500, etc.) — try to auto-generate
        setBriefingGenerating(true);
        try {
          const genRes = await fetch("/api/briefing/generate", { method: "POST" });
          if (genRes.ok) {
            const genData = await genRes.json();
            if (genData.briefing) { setBriefing(genData.briefing); setBriefingGenerating(false); return; }
          }
        } catch { /* ignore */ }
        setBriefingGenerating(false);
      })
      .catch(() => {});

    Promise.all([
      fetch("/api/tasks").then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }).catch(() => ({ tasks: [] })),
      fetch("/api/pv").then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }).catch(() => ({ meetings: [] })),
      fetch("/api/projects/list").then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); }).catch(() => ({ projects: [] })),
    ]).then(([tasksRes, pvsRes, projectsRes]) => {
      setTasks(tasksRes.tasks || []);
      setMeetings(pvsRes.meetings || []);
      setProjects(projectsRes.projects || []);
    }).finally(() => setLoading(false));
  }, []);

  /* ---- Derived data ---- */
  const stats = useMemo(() => {
    const activeTasks = tasks.filter(
      (tk) => tk.status === "todo" || tk.status === "in_progress" || tk.status === "waiting"
    );
    const overdueTasks = activeTasks.filter((tk) => isOverdue(tk.due_date));
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const pvThisWeek = meetings.filter((m) => new Date(m.meeting_date) >= weekAgo).length;
    const activeProjects = projects.filter(
      (p) => p.status === "active" || p.status === "planning"
    );

    // Priority tasks (urgent/high, overdue first)
    const priorityTasks = activeTasks
      .filter((tk) => tk.priority === "urgent" || tk.priority === "high" || isOverdue(tk.due_date))
      .sort((a, b) => {
        const aOverdue = isOverdue(a.due_date) ? 0 : 1;
        const bOverdue = isOverdue(b.due_date) ? 0 : 1;
        if (aOverdue !== bOverdue) return aOverdue - bOverdue;
        const prio = { urgent: 0, high: 1, medium: 2, low: 3 };
        return (prio[a.priority as keyof typeof prio] ?? 2) - (prio[b.priority as keyof typeof prio] ?? 2);
      })
      .slice(0, 5);

    // Deadlines (tasks with due_date in the next 14 days)
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    const deadlines = activeTasks
      .filter((tk) => tk.due_date && new Date(tk.due_date) <= twoWeeks)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .slice(0, 5);

    return {
      pendingTasks: activeTasks.length,
      overdueTasks: overdueTasks.length,
      overdueList: overdueTasks.slice(0, 4),
      pvThisWeek,
      activeProjects: activeProjects.length,
      projectsList: activeProjects.slice(0, 4),
      priorityTasks,
      deadlines,
    };
  }, [tasks, meetings, projects]);

  // Actions count for banner
  const actionsCount = useMemo(() => {
    const urgentEmails = unreadCount > 0 ? Math.min(unreadCount, 5) : 0;
    return stats.overdueTasks + urgentEmails;
  }, [stats.overdueTasks, unreadCount]);

  /* ---- Project task counts ---- */
  const projectTaskCounts = useMemo(() => {
    const map: Record<string, { total: number; overdue: number }> = {};
    tasks.forEach((tk) => {
      if (!map[tk.project_id]) map[tk.project_id] = { total: 0, overdue: 0 };
      if (tk.status !== "done" && tk.status !== "cancelled") {
        map[tk.project_id].total++;
        if (isOverdue(tk.due_date)) map[tk.project_id].overdue++;
      }
    });
    return map;
  }, [tasks]);

  /* ---- Recent activity ---- */
  const recentDone = useMemo(() => {
    return tasks
      .filter((tk) => tk.status === "done")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [tasks]);

  /* ---- Briefing highlights ---- */
  const briefingHighlights = useMemo(() => {
    if (briefing) {
      // Primary: priority_alerts from the BriefingContent (AI or fallback)
      if (briefing.priority_alerts?.length) {
        return briefing.priority_alerts.slice(0, 3);
      }
      // Secondary: project summaries
      if (briefing.projects?.length) {
        return briefing.projects
          .slice(0, 3)
          .map((p) => `${p.status_emoji || "📋"} ${p.name}: ${p.summary}`);
      }
      // Tertiary: global_summary as a single item
      if (briefing.global_summary) {
        return [briefing.global_summary];
      }
      // Legacy fallback (old BriefingItem format)
      if (briefing.content?.highlights?.length) return briefing.content.highlights.slice(0, 3);
      if (briefing.content?.sections?.length) {
        const items: string[] = [];
        for (const sec of briefing.content.sections) {
          for (const item of sec.items || []) {
            items.push(item);
            if (items.length >= 3) return items;
          }
        }
        return items;
      }
    }

    // Client-side fallback: build highlights from local data when API fails
    if (!briefingGenerating && !loading && (tasks.length > 0 || projects.length > 0)) {
      const items: string[] = [];
      const overdue = tasks.filter((t) => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done" && t.status !== "cancelled");
      if (overdue.length > 0) items.push(`${overdue.length} tâche(s) en retard`);
      const dueToday = tasks.filter((t) => t.due_date && t.due_date.startsWith(new Date().toISOString().split("T")[0]) && t.status !== "done");
      if (dueToday.length > 0) items.push(`${dueToday.length} tâche(s) à finir aujourd'hui`);
      const activeProjects = projects.filter((p) => p.status === "active");
      if (activeProjects.length > 0) items.push(`${activeProjects.length} projet(s) actif(s)`);
      const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
      if (items.length === 0 && openTasks.length > 0) items.push(`${openTasks.length} tâche(s) ouverte(s)`);
      return items.slice(0, 3);
    }

    return [];
  }, [briefing, briefingGenerating, loading, tasks, projects]);

  /* ---- Sync action ---- */
  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch("/api/outlook/sync", { method: "POST" });
    } catch { /* ignore */ }
    setSyncing(false);
  };

  /* ---- Shortcut links ---- */
  const shortcuts = [
    { href: "/mail", icon: Mail, label: t("urgentEmails"), color: "#F97316" },
    { href: "/submissions", icon: FileSpreadsheet, label: t("submissionsShort"), color: "#3B82F6" },
    { href: "/projects", icon: CalendarDays, label: t("planningShort"), color: "#8B5CF6" },
    { href: "/site-reports", icon: HardHat, label: t("siteReportsShort"), color: "#10B981" },
    { href: "/chat", icon: MessageSquare, label: tn("chat"), color: "#06B6D4" },
    { href: "/direction", icon: BarChart3, label: t("directionView"), color: "#F59E0B" },
  ];

  return (
    <div className="min-h-screen bg-[#0F0F11] relative overflow-hidden">
      <ParticleCanvas
        particleCount={20}
        opacity={[0.03, 0.15]}
        showConnections={false}
        mouseGravity={0.00003}
        className="pointer-events-none absolute inset-0 z-0"
      />
      <div className="relative z-[1] p-4 sm:p-6 lg:px-8 max-w-[1400px] mx-auto space-y-5">

        {/* ===== GREETING ROW ===== */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-[24px] sm:text-[28px] font-extrabold text-[#FAFAFA] tracking-[-0.5px]">
              {t(getGreetingKey(), { name: "" })}
              <span className="text-gradient-orange">{firstName}</span>
            </h1>
            <p className="mt-1 flex items-center gap-2 text-[13px] text-[#71717A]">
              <Calendar className="h-3.5 w-3.5" />
              {formatDateLocale()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-lg border border-[#3F3F46] bg-[#18181B] px-4 py-2 text-xs font-medium text-[#D4D4D8] transition-all hover:border-[#52525B] hover:text-[#FAFAFA] hover:bg-[#27272A] disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              {t("syncMailAction")}
            </button>
            <Link
              href="/tasks"
              className="inline-flex items-center gap-2 rounded-lg border border-[#3F3F46] bg-[#18181B] px-4 py-2 text-xs font-medium text-[#D4D4D8] transition-all hover:border-[#52525B] hover:text-[#FAFAFA] hover:bg-[#27272A]"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("newTaskAction")}
            </Link>
            <Link
              href="/pv-chantier/nouveau"
              className="inline-flex items-center gap-2 rounded-lg bg-cta px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("newPvAction")}
            </Link>
          </div>
        </div>

        {/* ===== VIEW TOGGLE ===== */}
        {showOrgToggle && (
          <div className="flex gap-1 bg-[#27272A] rounded-lg p-1 w-fit">
            <button
              onClick={() => router.replace("/dashboard")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === "personal"
                  ? "bg-[#18181B] shadow-sm text-[#FAFAFA]"
                  : "text-[#71717A] hover:text-[#FAFAFA]"
              }`}
            >
              {t("personalView")}
            </button>
            <button
              onClick={() => router.replace("/dashboard?view=org")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                view === "org"
                  ? "bg-[#18181B] shadow-sm text-[#FAFAFA]"
                  : "text-[#71717A] hover:text-[#FAFAFA]"
              }`}
            >
              {t("orgView")}
            </button>
          </div>
        )}

        {/* ===== ORG VIEW ===== */}
        {view === "org" && showOrgToggle ? (
          <DashboardOrgView />
        ) : (
          <>

        {/* ===== KPIs GRID ===== */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {loading ? (
            <><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /><KpiSkeleton /></>
          ) : (
            <>
              {/* Emails */}
              <Link
                href="/mail"
                className="group relative overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B] p-4 sm:p-5 transition-all duration-150 hover:border-[#3F3F46] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
              >
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#F97316] to-[#FB923C]" />
                <div className="flex justify-between items-center mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#F97316]/10">
                    <Mail className="h-4 w-4 text-[#F97316]" />
                  </div>
                  {unreadCount > 0 && (
                    <span className="text-[11px] font-semibold text-[#F87171]">
                      +{Math.min(unreadCount, 99)} {t("sinceYesterday")}
                    </span>
                  )}
                </div>
                <div className="font-display text-[32px] font-extrabold text-[#FAFAFA] leading-none">{unreadCount}</div>
                <div className="text-[12px] text-[#71717A] mt-1">{t("unreadEmails")}</div>
                {unreadCount > 0 && (
                  <div className="text-[11px] font-medium text-[#FB923C] mt-1">
                    {Math.min(unreadCount, 2)} {t("urgentEmails").toLowerCase()}
                  </div>
                )}
              </Link>

              {/* Tasks */}
              <Link
                href="/tasks"
                className="group relative overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B] p-4 sm:p-5 transition-all duration-150 hover:border-[#3F3F46] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
              >
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#EF4444] to-[#F87171]" />
                <div className="flex justify-between items-center mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#EF4444]/10">
                    <CheckSquare className="h-4 w-4 text-[#EF4444]" />
                  </div>
                  {stats.overdueTasks > 0 && (
                    <span className="text-[11px] font-semibold text-[#F87171]">
                      {stats.overdueTasks} {t("overdueLabel")}
                    </span>
                  )}
                </div>
                <div className="font-display text-[32px] font-extrabold text-[#FAFAFA] leading-none">{stats.pendingTasks}</div>
                <div className="text-[12px] text-[#71717A] mt-1">{t("pendingTasks")}</div>
                {stats.overdueTasks > 0 && (
                  <div className="text-[11px] font-medium text-[#F87171] mt-1">
                    {stats.overdueTasks} {t("overdueLabel")}
                  </div>
                )}
              </Link>

              {/* Submissions / PV */}
              <Link
                href="/submissions"
                className="group relative overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B] p-4 sm:p-5 transition-all duration-150 hover:border-[#3F3F46] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
              >
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#3B82F6] to-[#60A5FA]" />
                <div className="flex justify-between items-center mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#3B82F6]/10">
                    <FileSpreadsheet className="h-4 w-4 text-[#3B82F6]" />
                  </div>
                  {stats.pvThisWeek > 0 && (
                    <span className="text-[11px] font-semibold text-[#FBBF24]">
                      {stats.pvThisWeek} {t("waitingResponses")}
                    </span>
                  )}
                </div>
                <div className="font-display text-[32px] font-extrabold text-[#FAFAFA] leading-none">{stats.pvThisWeek}</div>
                <div className="text-[12px] text-[#71717A] mt-1">{t("activeSubmissions")}</div>
              </Link>

              {/* Projects */}
              <Link
                href="/projects"
                className="group relative overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B] p-4 sm:p-5 transition-all duration-150 hover:border-[#3F3F46] hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)]"
              >
                <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#10B981] to-[#34D399]" />
                <div className="flex justify-between items-center mb-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#10B981]/10">
                    <FolderKanban className="h-4 w-4 text-[#10B981]" />
                  </div>
                  <span className="text-[11px] font-semibold text-[#34D399]">{t("stable")}</span>
                </div>
                <div className="font-display text-[32px] font-extrabold text-[#FAFAFA] leading-none">{stats.activeProjects}</div>
                <div className="text-[12px] text-[#71717A] mt-1">{t("activeProjects")}</div>
              </Link>
            </>
          )}
        </div>

        {/* ===== ACTION BANNER ===== */}
        {!loading && actionsCount > 0 && (
          <div className="relative overflow-hidden rounded-xl border border-[#F97316]/20 bg-gradient-to-r from-[#1C1209] to-[#1A0F05] p-4 sm:px-5 sm:py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 animate-[glow_3s_infinite]">
            <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#F97316] to-[#EA580C]">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-sm font-bold text-[#FAFAFA]">
                {t("actionsToday", { count: actionsCount })}
              </div>
              <div className="text-[12px] text-[#D4D4D8] mt-0.5">
                {t("actionsBannerDesc", {
                  overdue: stats.overdueTasks,
                  urgent: Math.min(unreadCount, 5),
                })}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link
                href="/tasks"
                className="rounded-lg bg-[#F97316] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#EA580C]"
              >
                {t("treatNow")}
              </Link>
              <Link
                href="/mail"
                className="rounded-lg border border-[#F97316]/25 px-4 py-2 text-xs font-semibold text-[#FB923C] transition-colors hover:bg-[#F97316]/10"
              >
                {t("seeDetails")}
              </Link>
            </div>
          </div>
        )}

        {/* No urgency */}
        {!loading && actionsCount === 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-[#10B981]/20 bg-[#10B981]/5 px-5 py-4">
            <Sparkles className="h-5 w-5 text-[#10B981] shrink-0" />
            <p className="text-sm font-medium text-[#34D399]">{t("nothingUrgent")}</p>
          </div>
        )}

        {/* ===== TWO COLUMNS ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* -- LEFT: Projects -- */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-display text-sm font-bold text-[#FAFAFA] flex items-center gap-2">
                <FolderKanban className="h-4 w-4" />
                {t("myProjects")}
              </h2>
              <Link href="/projects" className="text-[11px] font-medium text-[#F97316] hover:underline">
                {t("viewAll")} <ChevronRight className="inline h-3 w-3" />
              </Link>
            </div>

            <div className="space-y-2">
              {loading ? (
                <><ProjectCardSkeleton /><ProjectCardSkeleton /><ProjectCardSkeleton /></>
              ) : stats.projectsList.length === 0 ? (
                <div className="rounded-[10px] border border-[#27272A] bg-[#18181B] flex flex-col items-center justify-center py-10">
                  <FolderKanban className="h-8 w-8 text-[#71717A] mb-2" />
                  <p className="text-sm text-[#71717A]">{t("noProjects")}</p>
                  <Link
                    href="/projects/new"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-[#F97316] hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t("newProject")}
                  </Link>
                </div>
              ) : (
                stats.projectsList.map((project, idx) => {
                  const tc = projectTaskCounts[project.id] || { total: 0, overdue: 0 };
                  const health = getProjectHealth(tc.overdue, tc.total);
                  const color = project.color || PROJECT_COLORS[idx % PROJECT_COLORS.length];
                  const progress = project.start_date && project.end_date
                    ? Math.max(0, Math.min(100, Math.round(
                        ((Date.now() - new Date(project.start_date).getTime()) /
                          (new Date(project.end_date).getTime() - new Date(project.start_date).getTime())) *
                          100
                      )))
                    : 0;

                  return (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                      className="group relative block overflow-hidden rounded-[10px] border border-[#27272A] bg-[#18181B] p-[14px_16px] transition-all duration-150 hover:border-[#3F3F46] hover:bg-[#1C1C20]"
                    >
                      {/* Left color bar */}
                      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: color }} />

                      {/* Top row */}
                      <div className="flex justify-between items-center">
                        <span className="font-display text-sm font-semibold text-[#FAFAFA]">{project.name}</span>
                        <span
                          className={`text-[10px] px-2 py-[3px] rounded font-semibold ${
                            health === "good"
                              ? "bg-[#10B981]/10 text-[#34D399]"
                              : health === "warn"
                              ? "bg-[#F59E0B]/10 text-[#FBBF24]"
                              : "bg-[#EF4444]/10 text-[#F87171]"
                          }`}
                        >
                          {health === "good" ? t("allOk") : health === "warn" ? t("attentionBadge") : t("criticalBadge")}
                        </span>
                      </div>

                      {/* Meta */}
                      <div className="text-[11px] text-[#71717A] mt-0.5">
                        {project.code}
                        {project.client_name && ` · ${project.client_name}`}
                        {project.city && ` · ${project.city}`}
                      </div>

                      {/* Stats row */}
                      <div className="flex gap-4 mt-2 text-[11px] text-[#71717A]">
                        <span>
                          <Mail className="inline h-3 w-3 mr-1 -mt-px" />
                          <span className="font-semibold text-[#D4D4D8]">{tc.total}</span> {t("emailsLabel")}
                        </span>
                        <span>
                          <CheckSquare className="inline h-3 w-3 mr-1 -mt-px" />
                          <span className={`font-semibold ${tc.overdue > 0 ? "text-[#F87171]" : "text-[#D4D4D8]"}`}>
                            {tc.overdue}
                          </span> {t("overdueLabel")}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="h-[3px] bg-[#27272A] rounded-sm mt-2 overflow-hidden">
                        <div
                          className="h-full rounded-sm transition-all duration-700"
                          style={{
                            width: `${progress}%`,
                            background: `linear-gradient(90deg, ${color}, ${color}99)`,
                          }}
                        />
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>

          {/* -- RIGHT: Activity Feed + AI Briefing -- */}
          <div className="space-y-3">
            <div className="flex justify-between items-center mb-1">
              <h2 className="font-display text-sm font-bold text-[#FAFAFA] flex items-center gap-2">
                <Clock className="h-4 w-4" />
                {t("recentActivity")}
              </h2>
            </div>

            {/* Activity feed */}
            <div className="rounded-[10px] border border-[#27272A] bg-[#18181B] p-4">
              {!loading && recentDone.length === 0 ? (
                <p className="text-center text-xs text-[#71717A] py-4">{t("noRecentActivity")}</p>
              ) : (
                <div className="space-y-0">
                  {recentDone.map((task, i) => (
                    <div
                      key={task.id}
                      className={`flex gap-3 py-2 ${i < recentDone.length - 1 ? "border-b border-[#27272A]" : ""}`}
                    >
                      <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-[#10B981]/10">
                        <CheckSquare className="h-3.5 w-3.5 text-[#10B981]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] text-[#D4D4D8] leading-snug truncate">
                          <span className="font-semibold text-[#FAFAFA]">{t("pendingTasks").split(" ")[0]}</span>{" "}
                          {task.title}
                        </p>
                        <p className="text-[10px] text-[#52525B] mt-0.5">
                          {new Date(task.created_at).toLocaleDateString("fr-CH", {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Briefing */}
            <div className="rounded-[10px] border border-[#F97316]/15 bg-gradient-to-br from-[#1C1209] to-[#18130A] p-4">
              <div className="flex items-center gap-2 mb-2 font-display text-[13px] font-bold text-[#FB923C]">
                <Sparkles className="h-4 w-4" />
                {t("aiBriefingTitle")}
              </div>
              {briefingGenerating ? (
                <div className="flex items-center gap-2 text-[12px] text-[#F97316] animate-pulse">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Génération du briefing en cours...</span>
                </div>
              ) : briefingHighlights.length > 0 ? (
                <div className="space-y-1.5">
                  {briefing?.greeting && (
                    <p className="text-[11px] text-[#A1A1AA] mb-1 italic">{briefing.greeting}</p>
                  )}
                  {briefingHighlights.map((item, i) => (
                    <div key={i} className="flex gap-2 text-[12px] text-[#E4E4E7] leading-snug">
                      <div className="w-[5px] h-[5px] rounded-full bg-[#F97316] mt-[6px] shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-[#71717A] italic leading-snug">
                  {t("briefingEmpty")}
                </div>
              )}
              <Link
                href="/briefing"
                className="block mt-2 text-[11px] font-semibold text-[#F97316] hover:underline"
              >
                {t("aiBriefingCta")} <ChevronRight className="inline h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>

        {/* ===== BOTTOM 3 WIDGETS ===== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">

          {/* Deadlines */}
          <div className="rounded-[10px] border border-[#27272A] bg-[#18181B] p-4">
            <h3 className="font-display text-[13px] font-bold text-[#FAFAFA] mb-3 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-[#F97316]" />
              {t("deadlinesSoon")}
            </h3>
            {!loading && stats.deadlines.length === 0 ? (
              <p className="text-xs text-[#71717A] py-3 text-center">{t("noDeadlines")}</p>
            ) : (
              <div className="space-y-0">
                {stats.deadlines.map((task, i) => {
                  const days = task.due_date ? daysUntil(task.due_date) : 999;
                  const dateStr = task.due_date
                    ? new Date(task.due_date).toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "2-digit" })
                    : "";
                  const tagClass =
                    days < 0
                      ? "bg-[#EF4444]/10 text-[#F87171]"
                      : days <= 2
                      ? "bg-[#F59E0B]/10 text-[#FBBF24]"
                      : "bg-[#10B981]/10 text-[#34D399]";

                  return (
                    <div
                      key={task.id}
                      className={`flex items-center justify-between py-[6px] ${
                        i < stats.deadlines.length - 1 ? "border-b border-[#27272A]" : ""
                      }`}
                    >
                      <span className="text-[11px] text-[#D4D4D8] truncate mr-2">{task.title}</span>
                      <span className={`text-[10px] px-2 py-[3px] rounded font-semibold shrink-0 ${tagClass}`}>
                        {days < 0 ? `${dateStr}` : dateStr}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Priority Tasks */}
          <div className="rounded-[10px] border border-[#27272A] bg-[#18181B] p-4">
            <h3 className="font-display text-[13px] font-bold text-[#FAFAFA] mb-3 flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-[#EF4444]" />
              {t("priorityTasks")}
            </h3>
            {!loading && stats.priorityTasks.length === 0 ? (
              <p className="text-xs text-[#71717A] py-3 text-center">{t("noPriorityTasks")}</p>
            ) : (
              <div className="space-y-0">
                {stats.priorityTasks.map((task, i) => {
                  const dotColor =
                    task.priority === "urgent"
                      ? "#EF4444"
                      : task.priority === "high"
                      ? "#F59E0B"
                      : "#3B82F6";
                  // Find the project name
                  const proj = projects.find((p) => p.id === task.project_id);
                  const projShort = proj
                    ? proj.name.length > 12
                      ? proj.name.slice(0, 10) + "..."
                      : proj.name
                    : "";
                  return (
                    <div
                      key={task.id}
                      className={`flex items-center gap-2 py-[5px] ${
                        i < stats.priorityTasks.length - 1 ? "border-b border-[#27272A]" : ""
                      }`}
                    >
                      <div
                        className="w-[6px] h-[6px] rounded-full shrink-0"
                        style={{ background: dotColor }}
                      />
                      <span className="text-[11px] text-[#D4D4D8] flex-1 truncate">{task.title}</span>
                      {projShort && (
                        <span className="text-[10px] text-[#71717A] shrink-0">{projShort}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Access */}
          <div className="rounded-[10px] border border-[#27272A] bg-[#18181B] p-4">
            <h3 className="font-display text-[13px] font-bold text-[#FAFAFA] mb-3 flex items-center gap-2">
              <Zap className="h-4 w-4 text-[#F97316]" />
              {t("quickAccess")}
            </h3>
            <div className="grid grid-cols-2 gap-[6px]">
              {shortcuts.map((sc) => {
                const Icon = sc.icon;
                return (
                  <Link
                    key={sc.href}
                    href={sc.href}
                    className="flex items-center gap-2 rounded-lg bg-[#27272A] p-[10px] transition-all hover:bg-[#3F3F46]"
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: sc.color }} />
                    <span className="text-[11px] font-medium text-[#D4D4D8]">{sc.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

          </>
        )}
      </div>
    </div>
  );
}
