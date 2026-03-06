"use client";

import { useTranslations } from "next-intl";

interface TaskCountersProps {
  overdueCount: number;
  todayCount: number;
  weekCount: number;
  laterCount: number;
  doneCount: number;
}

export function TaskCounters({ overdueCount, todayCount, weekCount, laterCount, doneCount }: TaskCountersProps) {
  const t = useTranslations("tasks");

  return (
    <div className="mt-3 flex items-center gap-3 overflow-x-auto whitespace-nowrap text-xs scrollbar-hide sm:gap-4">
      <span className={`shrink-0 font-medium ${overdueCount > 0 ? "text-red-600" : "text-gray-400"}`}>
        {t("overdue")} : {overdueCount}
      </span>
      <span className="text-gray-300">|</span>
      <span className="shrink-0 font-medium text-gray-600">{t("today")} : {todayCount}</span>
      <span className="text-gray-300">|</span>
      <span className="shrink-0 font-medium text-gray-600">{t("thisWeek")} : {weekCount}</span>
      <span className="text-gray-300">|</span>
      <span className="shrink-0 font-medium text-gray-500">{t("later")} : {laterCount}</span>
      <span className="text-gray-300">|</span>
      <span className="shrink-0 font-medium text-gray-400">{t("statusDone")} : {doneCount}</span>
    </div>
  );
}
