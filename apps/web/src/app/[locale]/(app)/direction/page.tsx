"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@cantaia/ui";
import {
  Building2,
  Users,
  AlertTriangle,
  Sparkles,
  Calendar,
  ShieldCheck,
  CheckCircle,
  XCircle,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { computeGuaranteeAlerts } from "@/components/closure/GuaranteeAlerts";
import { PlanAlertsBanner } from "@/components/plans/PlanAlertsBanner";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Project {
  id: string;
  name: string;
  code?: string;
  color: string;
  status: string;
  created_at: string;
  updated_at: string;
  openTasks: number;
  overdueTasks: number;
  emailCount: number;
  nextMeeting?: string | null;
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
  pv_signed_url?: string;
  reception_date?: string;
  guarantee_2y_end?: string;
  guarantee_5y_end?: string;
}

interface Reserve {
  id: string;
  project_id: string;
  description: string;
  status: string;
  deadline?: string;
  created_at: string;
  responsible_company?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-CH");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DirectionPage() {
  const t = useTranslations("direction");

  // ---- State ----
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [receptions, setReceptions] = useState<Reception[]>([]);
  const [reserves, setReserves] = useState<Reserve[]>([]);

  // ---- Data fetching ----
  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        // Fetch from APIs in parallel
        const [projectsRes, tasksRes, submissionsRes] = await Promise.all([
          fetch("/api/projects/list").then((r) => r.json()),
          fetch("/api/tasks").then((r) => r.json()),
          fetch("/api/submissions").then((r) => r.json()),
        ]);

        if (cancelled) return;

        setProjects(projectsRes?.projects ?? projectsRes?.data?.projects ?? []);
        setTasks(tasksRes?.tasks ?? tasksRes?.data?.tasks ?? []);
        setSubmissions(submissionsRes?.submissions ?? submissionsRes?.data?.submissions ?? []);

        // Fetch members via API route (bypasses RLS recursion on users table)
        const membersRes = await fetch("/api/admin/clients").then((r) => r.json()).catch(() => ({ members: [] }));
        if (cancelled) return;
        setMembers(membersRes?.members ?? []);

        // Fetch receptions/reserves via Supabase client
        const supabase = createClient();

        // Receptions & reserves (tables may not exist yet)
        try {
          const { data: recData } = await (supabase.from("project_receptions") as any).select("*");
          if (!cancelled) setReceptions(recData ?? []);
        } catch {
          // Table may not exist
        }

        try {
          const { data: resData } = await (supabase.from("reception_reserves") as any).select("*");
          if (!cancelled) setReserves(resData ?? []);
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

  // ---- Derived data ----
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const overdueTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.due_date &&
          t.due_date < today &&
          t.status !== "done" &&
          t.status !== "cancelled"
      ),
    [tasks, today]
  );

  const activeSubmissions = useMemo(
    () =>
      submissions.filter(
        (s) => s.status !== "archived" && s.status !== "awarded" && s.status !== "completed"
      ),
    [submissions]
  );

  const totalProjects = projects.length;
  const totalUsers = members.length;
  const totalOverdue = overdueTasks.length;

  // Closure & guarantee computations
  const closureProjects = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.status === "closing" ||
          (p.status === "completed" &&
            receptions.some((r) => r.project_id === p.id))
      ),
    [projects, receptions]
  );

  const signedReceptions = useMemo(
    () => receptions.filter((r) => r.status === "signed"),
    [receptions]
  );

  const projectNames = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.name])),
    [projects]
  );

  const allAlerts = useMemo(
    () =>
      computeGuaranteeAlerts(
        signedReceptions as any,
        reserves as any,
        projectNames
      ),
    [signedReceptions, reserves, projectNames]
  );

  const hasDanger = allAlerts.some((a) => a.severity === "danger");
  const hasWarning = allAlerts.some((a) => a.severity === "warning");
  const totalAlerts = allAlerts.length;

  // Helper: get open tasks count for a project
  function getOpenTasks(projectId: string): number {
    return tasks.filter(
      (t) =>
        t.project_id === projectId &&
        t.status !== "done" &&
        t.status !== "cancelled"
    ).length;
  }

  // Helper: get overdue tasks count for a project
  function getOverdueTasks(projectId: string): number {
    return overdueTasks.filter((t) => t.project_id === projectId).length;
  }

  // Helper: get submissions count for a project
  function getProjectSubmissions(projectId: string): number {
    return submissions.filter((s) => s.project_id === projectId).length;
  }

  // ---- Loading state ----
  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="text-sm text-slate-500">{t("title")}...</p>
        </div>
      </div>
    );
  }

  // ---- Render ----
  const statusColors: Record<string, string> = {
    active: "bg-green-50 text-green-700",
    planning: "bg-slate-100 text-slate-600",
    paused: "bg-amber-50 text-amber-700",
    on_hold: "bg-orange-50 text-orange-700",
    closing: "bg-purple-50 text-purple-700",
    completed: "bg-blue-50 text-blue-700",
    archived: "bg-slate-100 text-slate-400",
  };

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-800">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("subtitle")}
        </p>
      </div>

      {/* Summary cards */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-brand" />
            <span className="text-xs font-medium text-slate-500">{t("totalProjects")}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{totalProjects}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-medium text-slate-500">{t("totalUsers")}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-slate-800">{totalUsers}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-indigo-500" />
            <span className="text-xs font-medium text-slate-500">{t("activeSubmissions")}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-indigo-600">
            {activeSubmissions.length}
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-xs font-medium text-slate-500">{t("overdueGlobal")}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-red-600">{totalOverdue}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-medium text-slate-500">{t("aiAlerts")}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold text-amber-600">{totalAlerts}</p>
        </div>
      </div>

      {/* Closure & Guarantees section */}
      {(closureProjects.length > 0 || signedReceptions.length > 0) && (
        <div className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="h-4 w-4 text-brand" />
            <h2 className="text-sm font-semibold text-slate-800">{t("closureSection")}</h2>
            {hasDanger && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                <AlertTriangle className="h-3 w-3" />
                {allAlerts.filter((a) => a.severity === "danger").length}
              </span>
            )}
            {hasWarning && !hasDanger && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                <AlertTriangle className="h-3 w-3" />
                {allAlerts.filter((a) => a.severity === "warning").length}
              </span>
            )}
          </div>

          {/* Closure projects table */}
          {closureProjects.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("closureProjects")}</h3>
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t("colProject")}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t("colConductor")}</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">{t("colPvSigned")}</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">{t("colReserves")}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t("colClosureStatus")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {closureProjects.map((project) => {
                      const reception = receptions.find((r) => r.project_id === project.id);
                      const projectReserves = reserves.filter((r) => r.project_id === project.id);
                      const openReserves = projectReserves.filter((r) => r.status === "open").length;
                      const verifiedReserves = projectReserves.filter((r) => r.status === "verified").length;
                      const totalReserves = openReserves + verifiedReserves;
                      const pvSigned = reception?.pv_signed_url ? true : false;

                      return (
                        <tr key={project.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                              <p className="font-medium text-slate-800">{project.name}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {members.length > 0
                              ? `${members[0].first_name} ${members[0].last_name}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {pvSigned ? (
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <CheckCircle className="h-3.5 w-3.5" />
                                <span className="text-xs">{t("pvSigned")}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-red-500">
                                <XCircle className="h-3.5 w-3.5" />
                                <span className="text-xs">{t("pvNotSigned")}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {totalReserves > 0 ? (
                              <span className={cn("text-xs font-medium", openReserves > 0 ? "text-red-600" : "text-green-600")}>
                                {openReserves > 0 ? t("reservesOpen", { count: openReserves }) : t("reservesAll")}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">&mdash;</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 rounded-full bg-slate-100">
                                <div
                                  className={cn("h-1.5 rounded-full transition-all", pvSigned && openReserves === 0 ? "bg-green-500" : "bg-amber-400")}
                                  style={{
                                    width: `${pvSigned ? (openReserves === 0 ? 100 : 60) : reception ? 40 : 10}%`,
                                  }}
                                />
                              </div>
                              <span className="text-xs text-slate-500">
                                {pvSigned && openReserves === 0 ? "100%" : pvSigned ? "60%" : reception ? "40%" : "10%"}
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Active guarantees table */}
          {signedReceptions.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("activeGuarantees")}</h3>
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t("colProject")}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t("colReceptionDate")}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t("col2yEnd")}</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t("col5yEnd")}</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">{t("colAlertLevel")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {signedReceptions.map((rec) => {
                      const project = projects.find((p) => p.id === rec.project_id);
                      const recAlerts = allAlerts.filter((a) => a.project_id === rec.project_id);
                      const maxSeverity = recAlerts.length > 0
                        ? recAlerts.some((a) => a.severity === "danger") ? "danger" : "warning"
                        : "none";

                      return (
                        <tr key={rec.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {project && (
                                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
                              )}
                              <p className="font-medium text-slate-800">{project?.name || rec.project_id}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">{rec.reception_date ? formatDate(rec.reception_date) : "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{rec.guarantee_2y_end ? formatDate(rec.guarantee_2y_end) : "—"}</td>
                          <td className="px-4 py-3 text-slate-600">{rec.guarantee_5y_end ? formatDate(rec.guarantee_5y_end) : "—"}</td>
                          <td className="px-4 py-3 text-center">
                            {maxSeverity === "danger" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                <AlertTriangle className="h-3 w-3" />
                                {t("alertDanger")}
                              </span>
                            ) : maxSeverity === "warning" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                <Calendar className="h-3 w-3" />
                                {t("alertWarning")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                <CheckCircle className="h-3 w-3" />
                                {t("alertNone")}
                              </span>
                            )}
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
      )}

      {/* Projects table */}
      <div className="mt-8">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">{t("allProjects")}</h2>
        <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t("colProject")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t("colManager")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t("colStatus")}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">{t("colOpenTasks")}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">{t("colOverdue")}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">{t("colEmails")}</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500">{t("colSubmissions")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{t("colNextMeeting")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((project) => {
                const openTasksCount = getOpenTasks(project.id);
                const overdueCount = getOverdueTasks(project.id);
                const emailCount = project.emailCount ?? 0;
                const submissionCount = getProjectSubmissions(project.id);
                const nextMeeting = project.nextMeeting;
                // Pick the first member as a fallback "manager" — a real project_members lookup
                // would be ideal, but we work with what the API gives us.
                const manager = members.length > 0 ? members[0] : null;

                return (
                  <tr key={project.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: project.color }}
                        />
                        <div>
                          <p className="font-medium text-slate-800">{project.name}</p>
                          <p className="text-xs text-slate-400">{project.code}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {manager ? (
                        <div>
                          <p className="text-slate-700">{manager.first_name} {manager.last_name}</p>
                          <p className="text-xs text-slate-400">{manager.role === "project_manager" ? t("roleProjectManager") : t("roleSiteManager")}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400">&mdash;</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColors[project.status] || "bg-slate-100 text-slate-600")}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {openTasksCount}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(overdueCount > 0 ? "font-semibold text-red-600" : "text-slate-400")}>
                        {overdueCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {emailCount}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {submissionCount}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {nextMeeting ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(nextMeeting)}
                        </div>
                      ) : (
                        <span className="text-slate-400">&mdash;</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {projects.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("noProjects", { fallback: "Aucun projet" })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan alerts section */}
      <div className="mt-6">
        <PlanAlertsBanner maxAlerts={3} />
      </div>
    </div>
  );
}
