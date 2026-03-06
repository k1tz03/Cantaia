"use client";

import { useTranslations } from "next-intl";
import { StatusBadge, PriorityIndicator } from "@cantaia/ui";
import { Clock } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/mock-data";
import type { Task } from "@cantaia/database";

export function ProjectOverviewTab({
  project,
  tasks,
  meetings,
  openTasks,
  overdueTasks,
}: {
  project: any;
  tasks: Task[];
  meetings: any[];
  openTasks: Task[];
  overdueTasks: Task[];
}) {
  const t = useTranslations("projects");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{t("openTasks")}</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">
              {openTasks.length}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{t("overdueTasks")}</p>
            <p className="mt-1 text-2xl font-bold text-red-600">
              {overdueTasks.length}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{t("meetingsCount")}</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">
              {meetings.length}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{t("budget")}</p>
            <p className="mt-1 text-lg font-bold text-slate-900">
              {project.budget_total
                ? formatCurrency(project.budget_total, project.currency)
                : "—"}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Emails</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">0</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Archivés</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">0</p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-slate-800">
            {t("recentTasks")}
          </h3>
          <div className="mt-3 space-y-2">
            {tasks.length > 0 ? (
              tasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-3"
                >
                  <PriorityIndicator priority={task.priority} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {task.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      {task.assigned_to_name && (
                        <span>{task.assigned_to_name}</span>
                      )}
                      {task.due_date && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(task.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={task.status} />
                </div>
              ))
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">
                {t("noTasksYet")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-800">
            {t("projectInfo")}
          </h3>
          <dl className="mt-4 space-y-3">
            {project.description && (
              <div>
                <dt className="text-xs font-medium text-slate-500">{t("description")}</dt>
                <dd className="mt-0.5 text-sm text-slate-600">
                  {project.description}
                </dd>
              </div>
            )}
            {project.address && (
              <div>
                <dt className="text-xs font-medium text-slate-500">{t("address")}</dt>
                <dd className="mt-0.5 text-sm text-slate-600">
                  {project.address}, {project.city}
                </dd>
              </div>
            )}
            {project.start_date && (
              <div>
                <dt className="text-xs font-medium text-slate-500">{t("dates")}</dt>
                <dd className="mt-0.5 text-sm text-slate-600">
                  {formatDate(project.start_date)}
                  {project.end_date && ` — ${formatDate(project.end_date)}`}
                </dd>
              </div>
            )}
            {project.email_keywords.length > 0 && (
              <div>
                <dt className="text-xs font-medium text-slate-500">{t("emailKeywords")}</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {project.email_keywords.map((kw: string) => (
                    <span
                      key={kw}
                      className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand"
                    >
                      {kw}
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
