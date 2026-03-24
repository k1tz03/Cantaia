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
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#F97316]/20 bg-[#F97316]/10 px-3 py-2 sm:gap-3 sm:px-4">
      <span className="text-xs font-medium text-[#F97316] sm:text-sm">
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
        className="rounded border border-[#F97316]/20 bg-[#18181B] px-2 py-1 text-xs text-[#FAFAFA]"
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
        className="rounded border border-[#F97316]/20 bg-[#18181B] px-2 py-1 text-xs text-[#FAFAFA]"
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
        className="flex items-center gap-1 rounded border border-[#F97316]/20 bg-[#18181B] px-2 py-1 text-xs text-[#FAFAFA] hover:bg-[#1C1C1F]"
      >
        <UserPlus className="h-3 w-3" />
        {t("bulkAssign")}
      </button>
      <button
        type="button"
        onClick={onBulkDelete}
        className="flex items-center gap-1 rounded border border-red-500/20 bg-[#18181B] px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
      >
        <Trash2 className="h-3 w-3" />
        {t("bulkDelete")}
      </button>
      <button
        type="button"
        onClick={onClearSelection}
        className="w-full text-center text-xs text-[#F97316] hover:text-[#EA580C] sm:ml-auto sm:w-auto"
      >
        {t("clearSelection")}
      </button>
    </div>
  );
}
