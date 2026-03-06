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
      <h1 className="text-xl font-semibold text-gray-900">{t("title")}</h1>
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-gray-200 bg-white">
          <button
            type="button"
            onClick={() => onChangeViewMode("list")}
            className={`flex items-center gap-1 rounded-l-md px-3 py-1.5 text-xs font-medium ${
              viewMode === "list" ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            <List className="h-3.5 w-3.5" />
            {t("viewList")}
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode("kanban")}
            className={`flex items-center gap-1 rounded-r-md px-3 py-1.5 text-xs font-medium ${
              viewMode === "kanban" ? "bg-brand text-white" : "text-gray-500 hover:bg-gray-50"
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            {t("viewKanban")}
          </button>
        </div>
        <button
          type="button"
          onClick={onCreateTask}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-500"
        >
          <Plus className="h-4 w-4" />
          {t("newTask")}
        </button>
      </div>
    </div>
  );
}
