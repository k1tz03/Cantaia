"use client";

import { useTranslations } from "next-intl";
import { StatusBadge, PriorityIndicator } from "@cantaia/ui";
import { Clock, Plus } from "lucide-react";
import { formatDate } from "@/lib/mock-data";
import type { Task } from "@cantaia/database";

export function ProjectTasksTab({
  tasks,
  selectedTask,
  onSelectTask,
  onCreateTask,
}: {
  tasks: Task[];
  selectedTask: Task | null;
  onSelectTask: (task: Task) => void;
  onCreateTask: () => void;
}) {
  const t = useTranslations("projects");

  return (
    <div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {tasks.length} {tasks.length === 1 ? "tâche" : "tâches"}
        </p>
        <button
          type="button"
          onClick={onCreateTask}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("newTask")}
        </button>
      </div>

      {tasks.length > 0 ? (
        <div className="mt-3 space-y-2">
          {tasks.map((task) => {
            const overdue = task.due_date && task.due_date < new Date().toISOString().split("T")[0] && task.status !== "done" && task.status !== "cancelled";
            const isDone = task.status === "done";
            return (
              <div
                key={task.id}
                onClick={() => onSelectTask(task)}
                className={`flex cursor-pointer items-center gap-3 rounded-md border bg-white p-3 transition-colors hover:bg-slate-50 ${
                  overdue ? "border-red-200 bg-red-50/30" : "border-slate-200"
                } ${selectedTask?.id === task.id ? "ring-2 ring-brand/20" : ""}`}
              >
                <PriorityIndicator priority={task.priority} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${isDone ? "text-slate-400 line-through" : "text-slate-800"}`}>
                    {task.title}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    {task.assigned_to_name && <span>{task.assigned_to_name}</span>}
                    {task.due_date && (
                      <span className={`flex items-center gap-1 ${overdue ? "font-medium text-red-600" : ""}`}>
                        <Clock className="h-3 w-3" />
                        {formatDate(task.due_date)}
                      </span>
                    )}
                    {task.source === "meeting" && task.source_reference && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                        {task.source_reference}
                      </span>
                    )}
                    {task.lot_code && (
                      <span className="text-slate-400">{task.lot_code}</span>
                    )}
                  </div>
                </div>
                <StatusBadge status={task.status} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 flex h-32 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
          <p className="text-sm text-slate-400">{t("noTasksYet")}</p>
        </div>
      )}
    </div>
  );
}
