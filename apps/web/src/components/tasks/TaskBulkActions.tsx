"use client";

import { UserPlus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { TaskStatus, TaskPriority } from "@cantaia/database";

interface TaskBulkActionsProps {
  selectedCount: number;
  onBulkStatusChange: (status: TaskStatus) => void;
  onBulkPriorityChange: (priority: TaskPriority) => void;
  onBulkAssign: () => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
}

export function TaskBulkActions({
  selectedCount,
  onBulkStatusChange,
  onBulkPriorityChange,
  onBulkAssign,
  onBulkDelete,
  onClearSelection,
}: TaskBulkActionsProps) {
  const t = useTranslations("tasks");

  if (selectedCount === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-2 sm:gap-3 sm:px-4">
      <span className="text-xs font-medium text-primary sm:text-sm">
        {selectedCount} {t("selected")}
      </span>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) {
            onBulkStatusChange(e.target.value as TaskStatus);
            e.target.value = "";
          }
        }}
        className="rounded border border-primary/20 bg-background px-2 py-1 text-xs text-foreground"
      >
        <option value="">{t("changeStatus")}</option>
        <option value="todo">{t("statusTodo")}</option>
        <option value="in_progress">{t("statusInProgress")}</option>
        <option value="waiting">{t("statusWaiting")}</option>
        <option value="done">{t("statusDone")}</option>
      </select>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) {
            onBulkPriorityChange(e.target.value as TaskPriority);
            e.target.value = "";
          }
        }}
        className="rounded border border-primary/20 bg-background px-2 py-1 text-xs text-foreground"
      >
        <option value="">{t("changePriority")}</option>
        <option value="urgent">{t("priorityUrgent")}</option>
        <option value="high">{t("priorityHigh")}</option>
        <option value="medium">{t("priorityMedium")}</option>
        <option value="low">{t("priorityLow")}</option>
      </select>
      <button
        type="button"
        onClick={onBulkAssign}
        className="flex items-center gap-1 rounded border border-primary/20 bg-background px-2 py-1 text-xs text-foreground hover:bg-blue-100"
      >
        <UserPlus className="h-3 w-3" />
        {t("bulkAssign")}
      </button>
      <button
        type="button"
        onClick={onBulkDelete}
        className="flex items-center gap-1 rounded border border-red-500/20 bg-background px-2 py-1 text-xs text-red-600 hover:bg-red-500/10"
      >
        <Trash2 className="h-3 w-3" />
        {t("bulkDelete")}
      </button>
      <button
        type="button"
        onClick={onClearSelection}
        className="w-full text-center text-xs text-primary hover:text-blue-800 dark:text-blue-300 sm:ml-auto sm:w-auto"
      >
        {t("clearSelection")}
      </button>
    </div>
  );
}
