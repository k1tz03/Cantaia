"use client";

import { useTranslations } from "next-intl";
import { isOverdue, formatDateShort, PRIORITY_CONFIG, KANBAN_COLUMNS } from "./task-utils";
import type { Task, Project } from "@cantaia/database";

interface TaskKanbanViewProps {
  tasks: Task[];
  projects: Project[];
  selectedTaskId: string | null;
  onOpenTask: (task: Task) => void;
}

export function TaskKanbanView({ tasks, projects, selectedTaskId, onOpenTask }: TaskKanbanViewProps) {
  const t = useTranslations("tasks");

  function getProjectForTask(task: Task) {
    return projects.find((p) => p.id === task.project_id);
  }

  return (
    <div className="mt-4 flex gap-4 overflow-x-auto pb-4">
      {KANBAN_COLUMNS.map((status) => {
        const colTasks = tasks.filter((t) => t.status === status);
        const statusKey = `status${status.charAt(0).toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}` as "statusTodo";
        return (
          <div
            key={status}
            className="flex w-[280px] shrink-0 flex-col rounded-lg border border-gray-200 bg-gray-50"
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2.5">
              <h3 className="text-xs font-semibold uppercase text-gray-600">
                {t(statusKey)} ({colTasks.length})
              </h3>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: "calc(100vh - 320px)" }}>
              {colTasks.map((task) => {
                const project = getProjectForTask(task);
                const overdue = isOverdue(task);
                const priorityCfg = PRIORITY_CONFIG[task.priority];

                return (
                  <div
                    key={task.id}
                    onClick={() => onOpenTask(task)}
                    className={`cursor-pointer rounded-md border bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
                      overdue ? "border-red-200" : "border-gray-200"
                    } ${selectedTaskId === task.id ? "ring-2 ring-brand/30" : ""}`}
                  >
                    <p className="line-clamp-2 text-sm font-medium text-gray-900">
                      {task.title}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      {project && (
                        <span className="flex items-center gap-1 text-[10px] text-gray-500">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          {project.name.length > 16
                            ? project.name.slice(0, 16) + "..."
                            : project.name}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${priorityCfg.color} ${priorityCfg.bg}`}
                      >
                        <span className={`h-1 w-1 rounded-full ${priorityCfg.dot}`} />
                        {t(`priority${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}` as "priorityUrgent")}
                      </span>
                    </div>
                    {task.due_date && (
                      <div className="mt-1.5">
                        <span
                          className={`text-[10px] font-medium ${
                            overdue ? "text-red-600" : task.status === "done" ? "text-green-600" : "text-gray-500"
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
                <p className="py-4 text-center text-xs text-gray-400">{t("noTasksInColumn")}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
