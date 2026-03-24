"use client";

import { Plus, List, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ViewMode } from "./task-utils";

interface TaskPageHeaderProps {
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
  onCreateTask: () => void;
}

export function TaskPageHeader({ viewMode, onChangeViewMode, onCreateTask }: TaskPageHeaderProps) {
  const t = useTranslations("tasks");

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="font-display text-xl font-extrabold text-[#FAFAFA]">{t("title")}</h1>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded-lg border border-[#27272A] bg-[#18181B] p-0.5">
          <button
            type="button"
            onClick={() => onChangeViewMode("list")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              viewMode === "list"
                ? "bg-[#F97316] text-white shadow-sm"
                : "text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#1C1C1F]"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            {t("viewList")}
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode("kanban")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              viewMode === "kanban"
                ? "bg-[#F97316] text-white shadow-sm"
                : "text-[#71717A] hover:text-[#FAFAFA] hover:bg-[#1C1C1F]"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            {t("viewKanban")}
          </button>
        </div>
        <button
          type="button"
          onClick={onCreateTask}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#F97316] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#EA580C] hover:shadow"
        >
          <Plus className="h-4 w-4" />
          {t("newTask")}
        </button>
      </div>
    </div>
  );
}
