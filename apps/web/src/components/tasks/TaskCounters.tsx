"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Clock, CalendarDays, CalendarRange, CheckCircle2 } from "lucide-react";

interface TaskCountersProps {
  overdueCount: number;
  todayCount: number;
  weekCount: number;
  laterCount: number;
  doneCount: number;
}

export function TaskCounters({ overdueCount, todayCount, weekCount, laterCount, doneCount }: TaskCountersProps) {
  const t = useTranslations("tasks");

  const pills = [
    {
      label: t("overdue"),
      count: overdueCount,
      icon: AlertTriangle,
      active: overdueCount > 0,
      activeBg: "bg-red-500/10 border-red-500/20",
      activeText: "text-red-400",
      activeIcon: "text-red-500",
      inactiveBg: "bg-[#27272A] border-[#27272A]",
      inactiveText: "text-[#71717A]",
      inactiveIcon: "text-[#52525B]",
    },
    {
      label: t("today"),
      count: todayCount,
      icon: Clock,
      active: todayCount > 0,
      activeBg: "bg-amber-500/10 border-amber-500/20",
      activeText: "text-amber-400",
      activeIcon: "text-amber-500",
      inactiveBg: "bg-[#27272A] border-[#27272A]",
      inactiveText: "text-[#71717A]",
      inactiveIcon: "text-[#52525B]",
    },
    {
      label: t("thisWeek"),
      count: weekCount,
      icon: CalendarDays,
      active: weekCount > 0,
      activeBg: "bg-[#F97316]/10 border-[#F97316]/20",
      activeText: "text-[#F97316]",
      activeIcon: "text-[#F97316]",
      inactiveBg: "bg-[#27272A] border-[#27272A]",
      inactiveText: "text-[#71717A]",
      inactiveIcon: "text-[#52525B]",
    },
    {
      label: t("later"),
      count: laterCount,
      icon: CalendarRange,
      active: laterCount > 0,
      activeBg: "bg-[#27272A] border-[#3F3F46]",
      activeText: "text-[#D4D4D8]",
      activeIcon: "text-[#71717A]",
      inactiveBg: "bg-[#27272A] border-[#27272A]",
      inactiveText: "text-[#71717A]",
      inactiveIcon: "text-[#52525B]",
    },
    {
      label: t("statusDone"),
      count: doneCount,
      icon: CheckCircle2,
      active: doneCount > 0,
      activeBg: "bg-emerald-500/10 border-emerald-500/20",
      activeText: "text-emerald-400",
      activeIcon: "text-emerald-500",
      inactiveBg: "bg-[#27272A] border-[#27272A]",
      inactiveText: "text-[#71717A]",
      inactiveIcon: "text-[#52525B]",
    },
  ];

  return (
    <div className="mt-3 flex items-center gap-2 overflow-x-auto scrollbar-hide">
      {pills.map((pill) => {
        const Icon = pill.icon;
        const isActive = pill.active;
        return (
          <div
            key={pill.label}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors ${
              isActive ? pill.activeBg : pill.inactiveBg
            }`}
          >
            <Icon className={`h-3.5 w-3.5 ${isActive ? pill.activeIcon : pill.inactiveIcon}`} />
            <span className={`text-xs font-medium ${isActive ? pill.activeText : pill.inactiveText}`}>
              {pill.label}
            </span>
            <span className={`text-xs font-bold ${isActive ? pill.activeText : pill.inactiveText}`}>
              {pill.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}
