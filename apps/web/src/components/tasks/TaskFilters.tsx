"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Project } from "@cantaia/database";

interface TaskFiltersProps {
  projects: Project[];
  filterProject: string;
  setFilterProject: (v: string) => void;
  filterStatus: string;
  setFilterStatus: (v: string) => void;
  filterPriority: string;
  setFilterPriority: (v: string) => void;
  filterSource: string;
  setFilterSource: (v: string) => void;
  filterDeadline: string;
  setFilterDeadline: (v: string) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
}

export function TaskFilters({
  projects,
  filterProject,
  setFilterProject,
  filterStatus,
  setFilterStatus,
  filterPriority,
  setFilterPriority,
  filterSource,
  setFilterSource,
  filterDeadline,
  setFilterDeadline,
  searchQuery,
  setSearchQuery,
}: TaskFiltersProps) {
  const t = useTranslations("tasks");

  const selectClass = "rounded-lg border border-[#27272A] bg-[#18181B] px-3 py-2 text-xs font-medium text-[#D4D4D8] focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 transition-all cursor-pointer hover:border-[#3F3F46]";

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <select
        value={filterProject}
        onChange={(e) => setFilterProject(e.target.value)}
        className={selectClass}
      >
        <option value="all">{t("allProjects")}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={filterStatus}
        onChange={(e) => setFilterStatus(e.target.value)}
        className={selectClass}
      >
        <option value="active">{t("filterActive")}</option>
        <option value="all">{t("filterAll")}</option>
        <option value="todo">{t("statusTodo")}</option>
        <option value="in_progress">{t("statusInProgress")}</option>
        <option value="waiting">{t("statusWaiting")}</option>
        <option value="done">{t("statusDone")}</option>
      </select>

      <select
        value={filterPriority}
        onChange={(e) => setFilterPriority(e.target.value)}
        className={selectClass}
      >
        <option value="all">{t("allPriorities")}</option>
        <option value="urgent">{t("priorityUrgent")}</option>
        <option value="high">{t("priorityHigh")}</option>
        <option value="medium">{t("priorityMedium")}</option>
        <option value="low">{t("priorityLow")}</option>
      </select>

      <select
        value={filterSource}
        onChange={(e) => setFilterSource(e.target.value)}
        className={selectClass}
      >
        <option value="all">{t("allSources")}</option>
        <option value="email">{t("sourceEmail")}</option>
        <option value="meeting">{t("sourceMeeting")}</option>
        <option value="manual">{t("sourceManual")}</option>
        <option value="reserve">{t("sourceReserve")}</option>
      </select>

      <select
        value={filterDeadline}
        onChange={(e) => setFilterDeadline(e.target.value)}
        className={selectClass}
      >
        <option value="all">{t("allDeadlines")}</option>
        <option value="overdue">{t("overdue")}</option>
        <option value="today">{t("today")}</option>
        <option value="week">{t("thisWeek")}</option>
        <option value="later">{t("later")}</option>
      </select>

      <div className="relative w-full sm:w-60 sm:ml-auto">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#71717A]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-lg border border-[#27272A] bg-[#18181B] py-2 pl-10 pr-3 text-sm text-[#FAFAFA] placeholder-[#52525B] focus:border-[#F97316] focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 transition-all"
        />
      </div>
    </div>
  );
}
