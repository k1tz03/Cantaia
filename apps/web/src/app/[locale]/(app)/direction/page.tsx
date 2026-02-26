"use client";

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
} from "lucide-react";
// Mock data removed — will be replaced by real API calls
import { computeGuaranteeAlerts } from "@/components/closure/GuaranteeAlerts";

// Empty defaults
const mockProjects: {
  id: string; name: string; code?: string; color: string; status: string;
}[] = [];
const mockUsers: {
  id: string; first_name: string; last_name: string; role: string; project_ids: string[];
}[] = [];
const mockReceptions: {
  id: string; project_id: string; status: string; pv_signed_url?: string;
  reception_date?: string; guarantee_2y_end?: string; guarantee_5y_end?: string;
}[] = [];
const mockSubmissions: { id: string; status: string }[] = [];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fr-CH");
}
import { PlanAlertsBanner } from "@/components/plans/PlanAlertsBanner";

export default function DirectionPage() {
  const t = useTranslations("direction");
  const overdueTasks: { id: string; project_id: string }[] = [];
  const totalProjects = mockProjects.length;
  const totalUsers = mockUsers.length;
  const totalOverdue = overdueTasks.length;
  const totalAlerts = 0;

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
            {mockSubmissions.filter((s) => s.status !== "archived" && s.status !== "awarded").length}
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
      {(() => {
        const closureProjects = mockProjects.filter(
          (p) => p.status === "closing" || (p.status === "completed" && mockReceptions.some((r) => r.project_id === p.id))
        );
        const signedReceptions = mockReceptions.filter((r) => r.status === "signed");
        const projectNames = Object.fromEntries(mockProjects.map((p) => [p.id, p.name]));
        const allAlerts = computeGuaranteeAlerts(
          signedReceptions as any,
          [] as any,
          projectNames
        );
        const hasDanger = allAlerts.some((a) => a.severity === "danger");
        const hasWarning = allAlerts.some((a) => a.severity === "warning");

        return (closureProjects.length > 0 || signedReceptions.length > 0) ? (
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
                        const reception = mockReceptions.find((r) => r.project_id === project.id);
                        const openReserves = 0;
                        const verifiedReserves = 0;
                        const totalReserves = openReserves + verifiedReserves;
                        const manager = mockUsers.find((u) => u.project_ids.includes(project.id));
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
                              {manager ? `${manager.first_name} ${manager.last_name}` : "—"}
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
                                <span className="text-xs text-slate-400">—</span>
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
                        const project = mockProjects.find((p) => p.id === rec.project_id);
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
        ) : null;
      })()}

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
              {mockProjects.map((project) => {
                const openTasks: unknown[] = [];
                const projectOverdue = overdueTasks.filter((t) => t.project_id === project.id);
                const unprocessedEmails = 0;
                const nextMeeting = undefined as { meeting_date: string } | undefined;
                const manager = mockUsers.find((u) => u.project_ids.includes(project.id));

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
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColors[project.status] || "bg-slate-100 text-slate-600")}>
                        {project.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {openTasks.length}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn(projectOverdue.length > 0 ? "font-semibold text-red-600" : "text-slate-400")}>
                        {projectOverdue.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {unprocessedEmails}
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {0}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {nextMeeting ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(nextMeeting.meeting_date)}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
