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
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">{t("openTasks")}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {openTasks.length}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">{t("overdueTasks")}</p>
            <p className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">
              {overdueTasks.length}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">{t("meetingsCount")}</p>
            <p className="mt-1 text-xl font-semibold text-foreground">
              {meetings.length}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">{t("budget")}</p>
            <p className="mt-1 text-lg font-bold text-foreground">
              {project.budget_total
                ? formatCurrency(project.budget_total, project.currency)
                : "—"}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background p-4">
            <p className="text-xs font-medium text-muted-foreground">Emails</p>
            <p className="mt-1 text-xl font-semibold text-foreground">{emailCount}</p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold text-foreground">
            {t("recentTasks")}
          </h3>
          <div className="mt-3 space-y-2">
            {tasks.length > 0 ? (
              tasks.slice(0, 5).map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-md border border-border bg-background p-3"
                >
                  <PriorityIndicator priority={task.priority} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {task.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
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
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("noTasksYet")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-md border border-border bg-background p-5">
          <h3 className="text-sm font-semibold text-foreground">
            {t("projectInfo")}
          </h3>
          <dl className="mt-4 space-y-3">
            {project.description && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("description")}</dt>
                <dd className="mt-0.5 text-sm text-muted-foreground">
                  {project.description}
                </dd>
              </div>
            )}
            {project.address && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("address")}</dt>
                <dd className="mt-0.5 text-sm text-muted-foreground">
                  {project.address}, {project.city}
                </dd>
              </div>
            )}
            {project.start_date && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("dates")}</dt>
                <dd className="mt-0.5 text-sm text-muted-foreground">
                  {formatDate(project.start_date)}
                  {project.end_date && ` — ${formatDate(project.end_date)}`}
                </dd>
              </div>
            )}
            {project.email_keywords.length > 0 && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t("emailKeywords")}</dt>
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
