"use client";

import { useTranslations } from "next-intl";
import { Calendar, AlertTriangle } from "lucide-react";
import { isOverdue, formatDateShort, PRIORITY_CONFIG, KANBAN_COLUMNS } from "./task-utils";
import type { Task, Project } from "@cantaia/database";

interface TaskKanbanViewProps {
  tasks: Task[];
  projects: Project[];
  selectedTaskId: string | null;
  onOpenTask: (task: Task) => void;
}

const COLUMN_STYLES: Record<string, { headerBg: string; headerColor: string; accentColor: string; countBg: string; countColor: string }> = {
  todo: {
    headerBg: "bg-blue-50",
    headerColor: "text-blue-800",
    accentColor: "border-t-blue-500",
    countBg: "bg-blue-100",
    countColor: "text-blue-700",
  },
  in_progress: {
    headerBg: "bg-amber-50",
    headerColor: "text-amber-800",
    accentColor: "border-t-amber-500",
    countBg: "bg-amber-100",
    countColor: "text-amber-700",
  },
  waiting: {
    headerBg: "bg-orange-50",
    headerColor: "text-orange-800",
    accentColor: "border-t-orange-400",
    countBg: "bg-orange-100",
    countColor: "text-orange-700",
  },
  done: {
    headerBg: "bg-emerald-50",
    headerColor: "text-emerald-800",
    accentColor: "border-t-emerald-500",
    countBg: "bg-emerald-100",
    countColor: "text-emerald-700",
  },
};

export function TaskKanbanView({ tasks, projects, selectedTaskId, onOpenTask }: TaskKanbanViewProps) {
  const t = useTranslations("tasks");

  function getProjectForTask(task: Task) {
    return projects.find((p) => p.id === task.project_id);
  }

  return (
    <div className="mt-4 flex gap-3 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((status) => {
        const colTasks = tasks.filter((t) => t.status === status);
        const style = COLUMN_STYLES[status] || COLUMN_STYLES.todo;
        const statusKey = `status${status.charAt(0).toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}` as "statusTodo";

        return (
          <div
            key={status}
            className={`flex w-[280px] shrink-0 flex-col rounded-xl border border-gray-100 bg-white shadow-sm border-t-[3px] ${style.accentColor}`}
          >
            {/* Column header */}
            <div className={`flex items-center justify-between px-3.5 py-3 ${style.headerBg} rounded-t-lg`}>
              <h3 className={`text-xs font-bold uppercase tracking-wide ${style.headerColor}`}>
                {t(statusKey)}
              </h3>
              <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${style.countBg} ${style.countColor}`}>
                {colTasks.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 320px)" }}>
              {colTasks.map((task) => {
                const project = getProjectForTask(task);
                const overdue = isOverdue(task);
                const priorityCfg = PRIORITY_CONFIG[task.priority];

                return (
                  <div
                    key={task.id}
                    onClick={() => onOpenTask(task)}
                    className={`group cursor-pointer rounded-lg border bg-white p-3 transition-all duration-150 hover:shadow-md ${
                      overdue
                        ? "border-red-200 bg-red-50/30"
                        : "border-gray-100 hover:border-gray-200"
                    } ${selectedTaskId === task.id ? "ring-2 ring-[#2563EB]/30 border-[#2563EB]/30" : ""}`}
                  >
                    {/* Priority indicator bar */}
                    <div className="flex items-start gap-2.5">
                      <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityCfg.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-[13px] font-medium text-gray-900 leading-snug">
                          {task.title}
                        </p>
                      </div>
                    </div>

                    {/* Meta row */}
                    <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                      {project && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          <span
                            className="h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: project.color || "#9CA3AF" }}
                          />
                          <span className="truncate max-w-[100px]">{project.name}</span>
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${priorityCfg.color} ${priorityCfg.bg}`}
                      >
                        {t(`priority${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}` as "priorityUrgent")}
                      </span>
                    </div>

                    {/* Date */}
                    {task.due_date && (
                      <div className="mt-2 flex items-center gap-1">
                        {overdue ? (
                          <AlertTriangle className="h-3 w-3 text-red-500" />
                        ) : (
                          <Calendar className="h-3 w-3 text-gray-400" />
                        )}
                        <span
                          className={`text-[11px] font-medium ${
                            overdue
                              ? "text-red-600"
                              : task.status === "done"
                                ? "text-emerald-600"
                                : "text-gray-500"
                          }`}
                        >
                          {formatDateShort(task.due_date)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
              {colTasks.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8">
                  <div className="h-8 w-8 rounded-full bg-gray-50 flex items-center justify-center mb-2">
                    <div className="h-3 w-3 rounded-full bg-gray-200" />
                  </div>
                  <p className="text-xs text-gray-400">{t("noTasksInColumn")}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
