"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@cantaia/ui";
import { motion } from "framer-motion";
import {
  Building2,
  AlertTriangle,
  Calendar,
  FileSpreadsheet,
  Loader2,
  TrendingUp,
  Printer,
  Filter,
  ChevronDown,
  Clock,
  ShieldAlert,
  AlertCircle,
  Banknote,
  Receipt,
  Percent,
  BarChart3,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCHF } from "@/lib/format";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Project {
  id: string;
  name: string;
  code?: string;
  color: string;
  status: string;
  client_name?: string;
  budget_total?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  created_by?: string;
  openTasks: number;
  overdueTasks: number;
  emailCount: number;
  nextMeeting?: { title: string; meeting_date: string } | null;
  created_at: string;
  updated_at: string;
}

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  project_id: string;
  assigned_to: string | null;
  created_at: string;
}

interface Submission {
  id: string;
  title: string;
  status: string;
  deadline?: string | null;
  project_id: string;
}

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
}

interface Reception {
  id: string;
  project_id: string;
  status: string;
  reception_date?: string;
  guarantee_2y_end?: string;
  guarantee_5y_end?: string;
}

interface PlanRecord {
  id: string;
  project_id: string;
  is_current_version?: boolean;
  validation_status?: string;
}

interface FinancialProject {
  project_id: string;
  project_name: string;
  invoiced_amount: number;
  purchase_costs: number;
  margin: number;
  margin_pct: number;
  total_labor_hours?: number;
  hours_per_thousand?: number;
}

interface DirectionStats {
  total_invoiced: number;
  total_costs: number;
  total_margin: number;
  avg_margin_pct: number;
  projects: FinancialProject[];
}

type HealthStatus = "critical" | "warning" | "good";
type StatusFilter = "all" | "active" | "paused" | "closing";

interface ProjectAlert {
  type: "overdue_tasks" | "plan_outdated" | "guarantee_expiring" | "submission_deadline";
  message: string;
  severity: "critical" | "warning";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isOverdue(task: { due_date: string | null; status: string }): boolean {
  if (!task.due_date || task.status === "done" || task.status === "cancelled") return false;
  return task.due_date < new Date().toISOString().split("T")[0];
}

function daysBetween(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatBudgetCompact(value: number): string {
  if (value >= 1_000_000) {
    return `CHF ${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return formatCHF(value);
  }
  return formatCHF(value);
}

function calculateHealth(
  project: Project,
  projectTasks: Task[],
  projectSubmissions: Submission[]
): HealthStatus {
  const overdueTasks = projectTasks.filter(
    (t) => isOverdue(t) && t.status !== "done" && t.status !== "cancelled"
  );
  const urgentSubmissions = projectSubmissions.filter((s) => {
    if (!s.deadline) return false;
    const daysLeft = daysBetween(s.deadline);
    return daysLeft >= 0 && daysLeft <= 3;
  });

  if (overdueTasks.length > 3) return "critical";
  if (project.budget_total && project.overdueTasks > project.openTasks * 0.5) return "critical";
  if (overdueTasks.length > 0) return "warning";
  if (urgentSubmissions.length > 0) return "warning";
  return "good";
}

function getProjectAlerts(
  t: (key: string, values?: Record<string, string | number>) => string,
  projectId: string,
  projectTasks: Task[],
  projectSubmissions: Submission[],
  plans: PlanRecord[],
  receptions: Reception[]
): ProjectAlert[] {
  const alerts: ProjectAlert[] = [];

  // Task alerts
  const overdueTasks = projectTasks.filter((tk) => isOverdue(tk));
  if (overdueTasks.length > 0) {
    alerts.push({
      type: "overdue_tasks",
      message: t("alertOverdueTasks", { count: overdueTasks.length }),
      severity: overdueTasks.length > 3 ? "critical" : "warning",
    });
  }

  // Plan alerts
  const projectPlans = plans.filter((p) => p.project_id === projectId);
  const outdatedPlans = projectPlans.filter(
    (p) => p.is_current_version === false || p.validation_status === "pending"
  );
  if (outdatedPlans.length > 0) {
    alerts.push({
      type: "plan_outdated",
      message: t("alertOutdatedPlans", { count: outdatedPlans.length }),
      severity: "warning",
    });
  }

  // Guarantee alerts
  const projectReceptions = receptions.filter(
    (r) => r.project_id === projectId && r.status === "signed"
  );
  for (const rec of projectReceptions) {
    if (rec.guarantee_2y_end) {
      const days = daysBetween(rec.guarantee_2y_end);
      if (days >= 0 && days <= 30) {
        alerts.push({
          type: "guarantee_expiring",
          message: t("alertGuarantee2y", { days }),
          severity: days <= 7 ? "critical" : "warning",
        });
      }
    }
    if (rec.guarantee_5y_end) {
      const days = daysBetween(rec.guarantee_5y_end);
      if (days >= 0 && days <= 30) {
        alerts.push({
          type: "guarantee_expiring",
          message: t("alertGuarantee5y", { days }),
          severity: days <= 7 ? "critical" : "warning",
        });
      }
    }
  }

  // Submission deadline alerts
  for (const sub of projectSubmissions) {
    if (!sub.deadline) continue;
    const days = daysBetween(sub.deadline);
    if (days >= 0 && days <= 7) {
      alerts.push({
        type: "submission_deadline",
        message: t("alertSubmissionDeadline", { days, title: sub.title || "" }),
        severity: days <= 3 ? "critical" : "warning",
      });
    }
  }

  return alerts.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function KPICard({
  icon: Icon,
  label,
  value,
  valueColor,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  valueColor?: string;
  iconColor?: string;
}) {
  return (
    <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", iconColor || "text-[#71717A]")} />
        <span className="text-xs font-medium text-[#71717A] truncate">{label}</span>
      </div>
      <p className={cn("mt-1.5 text-2xl font-bold tabular-nums", valueColor || "text-[#FAFAFA]")}>
        {value}
      </p>
    </div>
  );
}

function BudgetBar({
  consumed,
  total,
  t,
}: {
  consumed: number;
  total: number;
  t: (key: string) => string;
}) {
  const pct = total > 0 ? Math.min((consumed / total) * 100, 100) : 0;
  const barColor = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-green-500";

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-[#71717A] mb-1">
        <span>{t("budget")}</span>
        <span className="tabular-nums">
          {Math.round(pct)}% {t("of")} {formatBudgetCompact(total)}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[#27272A]">
        <div
          className={cn("h-1.5 rounded-full transition-all", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function HealthBadge({ health }: { health: HealthStatus }) {
  const styles: Record<HealthStatus, string> = {
    good: "bg-green-500",
    warning: "bg-amber-500",
    critical: "bg-red-500",
  };

  return (
    <span
      className={cn("inline-block h-2.5 w-2.5 rounded-full shrink-0", styles[health])}
      title={health}
    />
  );
}

function ProjectCard({
  project,
  projectTasks,
  projectSubmissions,
  plans,
  receptions,
  members,
  health,
  index,
  t,
  onClick,
}: {
  project: Project;
  projectTasks: Task[];
  projectSubmissions: Submission[];
  plans: PlanRecord[];
  receptions: Reception[];
  members: Member[];
  health: HealthStatus;
  index: number;
  t: (key: string, values?: Record<string, string | number>) => string;
  onClick: () => void;
}) {
  const overdueTasks = projectTasks.filter((tk) => isOverdue(tk));
  const activeTasks = projectTasks.filter(
    (tk) => tk.status !== "done" && tk.status !== "cancelled"
  );

  const activeSubmissions = projectSubmissions.filter(
    (s) => s.status !== "completed" && s.status !== "awarded" && s.status !== "archived"
  );

  // Find nearest submission deadline
  const nextDeadline = projectSubmissions
    .filter((s) => s.deadline && daysBetween(s.deadline) >= 0)
    .sort((a, b) => daysBetween(a.deadline!) - daysBetween(b.deadline!))[0];

  // Last meeting (from project data)
  const nextMeeting = project.nextMeeting;

  // Manager — find the project creator in members
  const manager = members.find((m) => m.id === project.created_by) || members[0];

  // Budget progress (no consumed data from API, so show budget_total only)
  const hasBudget = project.budget_total != null && project.budget_total > 0;

  // Alerts
  const alerts = getProjectAlerts(t, project.id, projectTasks, projectSubmissions, plans, receptions);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      onClick={onClick}
      className="group cursor-pointer rounded-lg border border-[#27272A] bg-[#0F0F11] shadow-sm transition-shadow hover:shadow-md"
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[#FAFAFA] truncate group-hover:text-brand transition-colors">
                {project.name}
              </h3>
              {project.code && (
                <p className="text-[11px] text-[#71717A] truncate">{project.code}</p>
              )}
            </div>
          </div>
          <HealthBadge health={health} />
        </div>
        {manager && (
          <p className="mt-1 text-[11px] text-[#71717A] truncate">
            {t("manager")}: {manager.first_name} {manager.last_name}
          </p>
        )}
      </div>

      {/* Metrics */}
      <div className="px-4 py-2 space-y-2 border-t border-[#27272A]">
        {/* Budget */}
        {hasBudget ? (
          <BudgetBar consumed={0} total={project.budget_total!} t={t} />
        ) : (
          <div className="flex items-center justify-between text-[11px] text-[#71717A]">
            <span>{t("budget")}</span>
            <span>{t("budgetNotDefined")}</span>
          </div>
        )}

        {/* Tasks */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#71717A]">{t("tasks")}</span>
          <span>
            {overdueTasks.length > 0 && (
              <span className="font-semibold text-red-600">
                {overdueTasks.length} {t("overdue")}
              </span>
            )}
            {overdueTasks.length > 0 && activeTasks.length > 0 && (
              <span className="text-[#71717A]"> / </span>
            )}
            <span className="text-[#71717A]">
              {activeTasks.length} {t("active")}
            </span>
          </span>
        </div>

        {/* Submissions */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#71717A]">{t("submissions")}</span>
          <span>
            <span className="text-[#71717A]">
              {activeSubmissions.length} {t("pending")}
            </span>
            <span className="text-[#71717A]"> / </span>
            <span className="text-[#71717A]">
              {projectSubmissions.length} {t("total")}
            </span>
          </span>
        </div>

        {/* Next deadline */}
        {nextDeadline?.deadline && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#71717A]">{t("nextDeadline")}</span>
            <span className="flex items-center gap-1 text-[#71717A]">
              <Clock className="h-3 w-3" />
              {new Date(nextDeadline.deadline).toLocaleDateString("fr-CH", {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
          </div>
        )}

        {/* Next meeting or last PV */}
        {nextMeeting && (
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#71717A]">{t("nextMeeting")}</span>
            <span className="flex items-center gap-1 text-[#71717A]">
              <Calendar className="h-3 w-3" />
              {new Date(nextMeeting.meeting_date).toLocaleDateString("fr-CH", {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
          </div>
        )}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="px-4 py-2 border-t border-[#27272A] space-y-1">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-1.5 text-[11px] rounded px-1.5 py-0.5",
                alert.severity === "critical"
                  ? "text-red-700 dark:text-red-400 bg-red-500/10"
                  : "text-amber-700 dark:text-amber-400 bg-amber-500/10"
              )}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              <span className="truncate">{alert.message}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DashboardOrgView() {
  const t = useTranslations("direction");
  const router = useRouter();

  // ---- State ----
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [plans, setPlans] = useState<PlanRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [finStats, setFinStats] = useState<DirectionStats | null>(null);
  const [finLoading, setFinLoading] = useState(true);

  // ---- Data fetching ----
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        const [projectsRes, tasksRes, submissionsRes] = await Promise.all([
          fetch("/api/projects/list").then((r) => r.json()),
          fetch("/api/tasks").then((r) => r.json()),
          fetch("/api/submissions").then((r) => r.json()),
        ]);

        if (cancelled) return;

        setProjects(projectsRes?.projects ?? []);
        setTasks(tasksRes?.tasks ?? tasksRes?.data?.tasks ?? []);
        setSubmissions(submissionsRes?.submissions ?? []);

        // Members
        const membersRes = await fetch("/api/admin/clients")
          .then((r) => r.json())
          .catch(() => ({ members: [] }));
        if (cancelled) return;
        setMembers(membersRes?.members ?? []);

        // Supabase direct queries (tables may not exist)
        const supabase = createClient();

        try {
          const { data: recData } = await (supabase.from("project_receptions") as any).select("*");
          if (!cancelled) setReceptions(recData ?? []);
        } catch {
          // Table may not exist
        }

        try {
          const { data: planData } = await (supabase.from("plan_registry") as any).select(
            "id, project_id, is_current_version, validation_status"
          );
          if (!cancelled) setPlans(planData ?? []);
        } catch {
          // Table may not exist
        }
      } catch (err) {
        console.error("[Direction] Failed to load data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Fetch direction financial stats ----
  useEffect(() => {
    fetch("/api/direction/stats")
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      })
      .then((data) => setFinStats(data))
      .catch(() => setFinStats(null))
      .finally(() => setFinLoading(false));
  }, []);

  // ---- Derived data ----
  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const filteredProjects = useMemo(() => {
    if (statusFilter === "all") return projects;
    const statusMap: Record<StatusFilter, string[]> = {
      all: [],
      active: ["active", "planning"],
      paused: ["paused", "on_hold"],
      closing: ["closing", "completed"],
    };
    return projects.filter((p) => statusMap[statusFilter].includes(p.status));
  }, [projects, statusFilter]);

  const totalBudget = useMemo(
    () => projects.reduce((sum, p) => sum + (p.budget_total || 0), 0),
    [projects]
  );

  const totalOverdue = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.due_date &&
          t.due_date < today &&
          t.status !== "done" &&
          t.status !== "cancelled"
      ).length,
    [tasks, today]
  );

  const totalCriticalAlerts = useMemo(() => {
    let count = 0;
    for (const project of projects) {
      const pt = tasks.filter((t) => t.project_id === project.id);
      const ps = submissions.filter((s) => s.project_id === project.id);
      const alerts = getProjectAlerts(t, project.id, pt, ps, plans, receptions);
      count += alerts.filter((a) => a.severity === "critical").length;
    }
    return count;
  }, [projects, tasks, submissions, plans, receptions, t]);

  const activeSubmissions = useMemo(
    () =>
      submissions.filter(
        (s) => s.status !== "archived" && s.status !== "awarded" && s.status !== "completed"
      ),
    [submissions]
  );

  // Per-project data lookups
  const getProjectTasks = useCallback(
    (projectId: string) => tasks.filter((t) => t.project_id === projectId),
    [tasks]
  );

  const getProjectSubmissions = useCallback(
    (projectId: string) => submissions.filter((s) => s.project_id === projectId),
    [submissions]
  );

  const getProjectHealth = useCallback(
    (project: Project) => {
      return calculateHealth(project, getProjectTasks(project.id), getProjectSubmissions(project.id));
    },
    [getProjectTasks, getProjectSubmissions]
  );

  // ---- Handlers ----
  const handleExport = useCallback(() => {
    window.print();
  }, []);

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="text-sm text-[#71717A]">{t("title")}...</p>
        </div>
      </div>
    );
  }

  // ---- Filter options ----
  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: "all", label: t("filterAll") },
    { value: "active", label: t("filterActive") },
    { value: "paused", label: t("filterPaused") },
    { value: "closing", label: t("filterClosing") },
  ];

  return (
    <div className="p-4 lg:p-6 xl:p-8 print:p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold text-[#FAFAFA]">{t("title")}</h1>
          <p className="mt-0.5 text-sm text-[#71717A]">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {/* Filter */}
          <div className="relative">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex items-center gap-1.5 rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-xs font-medium text-[#71717A] hover:bg-[#27272A] transition-colors"
            >
              <Filter className="h-3.5 w-3.5" />
              {filterOptions.find((f) => f.value === statusFilter)?.label}
              <ChevronDown className="h-3 w-3" />
            </button>
            {filterOpen && (
              <div className="absolute right-0 top-full mt-1 z-10 w-40 rounded-md border border-[#27272A] bg-[#0F0F11] shadow-lg py-1">
                {filterOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setStatusFilter(opt.value);
                      setFilterOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs transition-colors",
                      statusFilter === opt.value
                        ? "bg-brand/5 text-brand font-medium"
                        : "text-[#71717A] hover:bg-[#27272A]"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Export */}
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 rounded-md border border-[#27272A] bg-[#0F0F11] px-3 py-1.5 text-xs font-medium text-[#71717A] hover:bg-[#27272A] transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            {t("exportButton")}
          </button>
        </div>
      </div>

      {/* KPI Summary Bar */}
      <div className="sticky top-0 z-10 -mx-4 lg:-mx-6 xl:-mx-8 px-4 lg:px-6 xl:px-8 py-3 bg-[#27272A]/80 backdrop-blur-sm border-b border-[#27272A] mb-5 print:static print:bg-[#0F0F11] print:border-0">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <KPICard
            icon={Building2}
            label={t("kpiProjects")}
            value={projects.length}
            iconColor="text-brand"
          />
          <KPICard
            icon={TrendingUp}
            label={t("kpiBudget")}
            value={totalBudget > 0 ? formatBudgetCompact(totalBudget) : "---"}
            iconColor="text-emerald-500"
          />
          <KPICard
            icon={AlertCircle}
            label={t("kpiOverdue")}
            value={totalOverdue}
            valueColor={totalOverdue > 0 ? "text-red-600" : "text-[#FAFAFA]"}
            iconColor={totalOverdue > 0 ? "text-red-500" : "text-[#71717A]"}
          />
          <KPICard
            icon={ShieldAlert}
            label={t("kpiAlerts")}
            value={totalCriticalAlerts}
            valueColor={totalCriticalAlerts > 0 ? "text-red-600" : "text-[#FAFAFA]"}
            iconColor={totalCriticalAlerts > 0 ? "text-red-500" : "text-[#71717A]"}
          />
          <KPICard
            icon={FileSpreadsheet}
            label={t("kpiSubmissions")}
            value={activeSubmissions.length}
            iconColor="text-indigo-500"
          />
        </div>
      </div>

      {/* Project Cards Grid */}
      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#71717A]">
          <Building2 className="h-10 w-10 mb-3 text-[#71717A]" />
          <p className="text-sm">{t("noProjects")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 print:grid-cols-2 print:gap-2">
          {filteredProjects.map((project, index) => (
            <ProjectCard
              key={project.id}
              project={project}
              projectTasks={getProjectTasks(project.id)}
              projectSubmissions={getProjectSubmissions(project.id)}
              plans={plans}
              receptions={receptions}
              members={members}
              health={getProjectHealth(project)}
              index={index}
              t={t}
              onClick={() => router.push(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      {/* Profitability Section */}
      <div className="mt-8 print:mt-4">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="h-5 w-5 text-brand" />
          <h2 className="text-lg font-semibold text-[#FAFAFA]">{t("profitability")}</h2>
        </div>

        {finLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-brand" />
          </div>
        ) : !finStats || finStats.projects.length === 0 ? (
          <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] p-8 text-center">
            <Banknote className="h-8 w-8 mx-auto mb-2 text-[#71717A]" />
            <p className="text-sm text-[#71717A]">{t("noData")}</p>
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              <KPICard
                icon={Banknote}
                label={t("totalInvoiced")}
                value={formatCHF(finStats.total_invoiced)}
                iconColor="text-emerald-500"
              />
              <KPICard
                icon={Receipt}
                label={t("totalCosts")}
                value={formatCHF(finStats.total_costs)}
                iconColor="text-red-500"
              />
              <KPICard
                icon={TrendingUp}
                label={t("totalMargin")}
                value={formatCHF(finStats.total_margin)}
                valueColor={finStats.total_margin >= 0 ? "text-green-600" : "text-red-600"}
                iconColor={finStats.total_margin >= 0 ? "text-green-500" : "text-red-500"}
              />
              <KPICard
                icon={Percent}
                label={t("avgMarginPct")}
                value={`${finStats.avg_margin_pct.toFixed(1)}%`}
                valueColor={finStats.avg_margin_pct >= 0 ? "text-green-600" : "text-red-600"}
                iconColor={finStats.avg_margin_pct >= 0 ? "text-green-500" : "text-red-500"}
              />
            </div>

            {/* Projects table */}
            <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#27272A] bg-[#27272A]/50">
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-[#71717A]">{t("projectName")}</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-[#71717A]">{t("invoicedAmount")}</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-[#71717A]">{t("purchaseCosts")}</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-[#71717A]">{t("margin")}</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-[#71717A]">{t("marginPct")}</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-[#71717A]">{t("totalHours")}</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-[#71717A]">{t("hoursPerThousand")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finStats.projects.map((fp) => (
                      <tr
                        key={fp.project_id}
                        className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/30 transition-colors cursor-pointer"
                        onClick={() => router.push(`/projects/${fp.project_id}`)}
                      >
                        <td className="px-4 py-2.5 font-medium text-[#FAFAFA]">{fp.project_name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#FAFAFA]">
                          {formatCHF(fp.invoiced_amount)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#FAFAFA]">
                          {formatCHF(fp.purchase_costs)}
                        </td>
                        <td className={cn(
                          "px-4 py-2.5 text-right tabular-nums font-medium",
                          fp.margin >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {formatCHF(fp.margin)}
                        </td>
                        <td className={cn(
                          "px-4 py-2.5 text-right tabular-nums font-medium",
                          fp.margin_pct >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {fp.margin_pct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#71717A]">
                          {fp.total_labor_hours ? `${fp.total_labor_hours}h` : "\u2014"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-[#71717A]">
                          {fp.hours_per_thousand ? fp.hours_per_thousand.toFixed(1) : "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
