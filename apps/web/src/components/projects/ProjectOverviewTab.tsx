"use client";

import { useState, useEffect } from "react";
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

  const [emailCount, setEmailCount] = useState(0);

  useEffect(() => {
    if (project?.id) {
      fetch(`/api/projects/${project.id}/emails`)
        .then((r) => r.json())
        .then((data) => {
          const emails = data.emails || [];
          setEmailCount(emails.length);
        })
        .catch(() => {});
    }
  }, [project?.id]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-[#27272A] bg-[#0F0F11] p-4">
            <p className="text-xs font-medium text-[#71717A]">{t("openTasks")}</p>
            <p className="mt-1 text-xl font-semibold text-[#FAFAFA]">
              {openTasks.length}
            </p>
          </div>
          <div className="rounded-md border border-[#27272A] bg-[#0F0F11] p-4">
            <p className="text-xs font-medium text-[#71717A]">{t("overdueTasks")}</p>
            <p className="mt-1 text-2xl font-bold text-red-400">
              {overdueTasks.length}
            </p>
          </div>
          <div className="rounded-md border border-[#27272A] bg-[#0F0F11] p-4">
            <p className="text-xs font-medium text-[#71717A]">{t("meetingsCount")}</p>
            <p className="mt-1 text-xl font-semibold text-[#FAFAFA]">
              {meetings.length}
            </p>
          </div>
          <div className="rounded-md border border-[#27272A] bg-[#0F0F11] p-4">
            <p className="text-xs font-medium text-[#71717A]">{t("budget")}</p>
            <p className="mt-1 text-lg font-bold text-[#FAFAFA]">
              {project.budget_total
                ? formatCurrency(project.budget_total, project.currency)
                : "—"}
            </p>
          </div>
          <div className="rounded-md border border-[#27272A] bg-[#0F0F11] p-4">
            <p className="text-xs font-medium text-[#71717A]">Emails</p>
            <p className="mt-1 text-xl font-semibold text-[#FAFAFA]">{emailCount}</p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-[#FAFAFA]">
            {t("recentTasks")}
          </h3>
          <div className="mt-3 space-y-2">
            {tasks.length > 0 ? (
              tasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-md border border-[#27272A] bg-[#0F0F11] p-3"
                >
                  <PriorityIndicator priority={task.priority} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#FAFAFA]">
                      {task.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-[#71717A]">
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
              <p className="py-8 text-center text-sm text-[#71717A]">
                {t("noTasksYet")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border border-[#27272A] bg-[#0F0F11] p-5">
          <h3 className="text-sm font-semibold text-[#FAFAFA]">
            {t("projectInfo")}
          </h3>
          <dl className="mt-4 space-y-3">
            {project.description && (
              <div>
                <dt className="text-xs font-medium text-[#71717A]">{t("description")}</dt>
                <dd className="mt-0.5 text-sm text-[#71717A]">
                  {project.description}
                </dd>
              </div>
            )}
            {project.address && (
              <div>
                <dt className="text-xs font-medium text-[#71717A]">{t("address")}</dt>
                <dd className="mt-0.5 text-sm text-[#71717A]">
                  {project.address}, {project.city}
                </dd>
              </div>
            )}
            {project.start_date && (
              <div>
                <dt className="text-xs font-medium text-[#71717A]">{t("dates")}</dt>
                <dd className="mt-0.5 text-sm text-[#71717A]">
                  {formatDate(project.start_date)}
                  {project.end_date && ` — ${formatDate(project.end_date)}`}
                </dd>
              </div>
            )}
            {project.email_keywords.length > 0 && (
              <div>
                <dt className="text-xs font-medium text-[#71717A]">{t("emailKeywords")}</dt>
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
