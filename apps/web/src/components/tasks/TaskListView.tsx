"use client";

import { ArrowUpDown, CheckCircle2, ClipboardList } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/EmptyState";
import { isOverdue, formatDateShort, PRIORITY_CONFIG, SOURCE_CONFIG } from "./task-utils";
import type { SortField } from "./task-utils";
import type { Task, TaskStatus, Project } from "@cantaia/database";

interface TaskListViewProps {
  tasks: Task[];
  projects: Project[];
  selected: Set<string>;
  selectedTaskId: string | null;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onToggleSort: (field: SortField) => void;
  onOpenTask: (task: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}

export function TaskListView({
  tasks,
  projects,
  selected,
  selectedTaskId,
  onToggleSelect,
  onToggleSelectAll,
  onToggleSort,
  onOpenTask,
  onStatusChange,
}: TaskListViewProps) {
  const t = useTranslations("tasks");

  function getProjectForTask(task: Task) {
    return projects.find((p) => p.id === task.project_id);
  }

  return (
    <div className="mt-4 -mx-4 sm:mx-0 overflow-x-auto rounded-lg sm:border border-gray-200 bg-white">
      <table className="w-full min-w-[600px]">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="w-10 px-3 py-2.5">
              <input
                type="checkbox"
                checked={selected.size === tasks.length && tasks.length > 0}
                onChange={onToggleSelectAll}
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
            </th>
            <th
              className="cursor-pointer px-3 py-2.5 text-left text-xs font-semibold text-gray-500"
              onClick={() => onToggleSort("title")}
            >
              <span className="flex items-center gap-1">
                {t("colTask")}
                <ArrowUpDown className="h-3 w-3" />
              </span>
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">
              {t("colProject")}
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">
              {t("colAssigned")}
            </th>
            <th
              className="cursor-pointer px-3 py-2.5 text-left text-xs font-semibold text-gray-500"
              onClick={() => onToggleSort("due_date")}
            >
              <span className="flex items-center gap-1">
                {t("colDeadline")}
                <ArrowUpDown className="h-3 w-3" />
              </span>
            </th>
            <th
              className="cursor-pointer px-3 py-2.5 text-left text-xs font-semibold text-gray-500"
              onClick={() => onToggleSort("priority")}
            >
              <span className="flex items-center gap-1">
                {t("colPriority")}
                <ArrowUpDown className="h-3 w-3" />
              </span>
            </th>
            <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">
              {t("colSource")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {tasks.map((task) => {
            const project = getProjectForTask(task);
            const overdue = isOverdue(task);
            const isDone = task.status === "done";
            const priorityCfg = PRIORITY_CONFIG[task.priority];
            const sourceCfg = SOURCE_CONFIG[task.source];
            const SourceIcon = sourceCfg.icon;

            return (
              <tr
                key={task.id}
                onClick={() => onOpenTask(task)}
                className={`cursor-pointer transition-colors hover:bg-gray-50 ${
                  overdue ? "bg-red-50/50" : ""
                } ${isDone ? "opacity-60" : ""} ${
                  selectedTaskId === task.id ? "bg-blue-50" : ""
                }`}
              >
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected.has(task.id)}
                    onChange={() => onToggleSelect(task.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300"
                  />
                </td>
                <td className="max-w-[300px] px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onStatusChange(task.id, isDone ? "todo" : "done");
                      }}
                      title={isDone ? t("statusTodo") : t("markDone")}
                      className={`shrink-0 rounded-full transition-colors ${
                        isDone
                          ? "text-green-500 hover:text-green-600"
                          : "text-gray-300 hover:text-green-500"
                      }`}
                    >
                      <CheckCircle2 className="h-5 w-5" />
                    </button>
                    <div>
                      <p
                        className={`text-sm font-medium ${
                          isDone
                            ? "text-gray-400 line-through"
                            : "text-gray-900"
                        }`}
                      >
                        {task.title}
                      </p>
                      {task.lot_code && (
                        <span className="text-[10px] text-gray-400">{task.lot_code}</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {project && (
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: project.color }}
                      />
                      <span className="text-xs text-gray-600">
                        {project.name.length > 18
                          ? project.name.slice(0, 18) + "..."
                          : project.name}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-gray-600">
                  {task.assigned_to_name || "\u2014"}
                </td>
                <td className="px-3 py-2.5">
                  {task.due_date ? (
                    <span
                      className={`text-xs font-medium ${
                        overdue
                          ? "text-red-600"
                          : isDone
                            ? "text-gray-400"
                            : "text-gray-600"
                      }`}
                    >
                      {formatDateShort(task.due_date)}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">{"\u2014"}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityCfg.color} ${priorityCfg.bg}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${priorityCfg.dot}`} />
                    {t(`priority${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}` as "priorityUrgent")}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <SourceIcon className="h-3 w-3" />
                    {t(`source${task.source.charAt(0).toUpperCase() + task.source.slice(1)}` as "sourceEmail")}
                  </span>
                </td>
              </tr>
            );
          })}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={7}>
                <EmptyState
                  icon={ClipboardList}
                  title="Aucune tâche"
                  description="Les tâches seront détectées automatiquement dans vos emails."
                />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
