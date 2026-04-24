"use client";

import { useTranslations } from "next-intl";
import { useActiveProject, type NavCounts } from "@/lib/contexts/active-project-context";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  CheckSquare,
  CalendarRange,
  Map,
  FileSpreadsheet,
  FileText,
  UserCheck,
  Mail,
  FileStack,
  MoreHorizontal,
} from "lucide-react";

interface ProjectTool {
  key: string;
  tab: string | null;
  icon: React.ComponentType<any>;
  labelKey: string;
  alwaysShow: boolean;
  countKey?: keyof NavCounts;
  conditionKey?: keyof NavCounts;
}

const PROJECT_TOOLS: ProjectTool[] = [
  { key: "overview", tab: null, icon: LayoutDashboard, labelKey: "overview", alwaysShow: true },
  { key: "tasks", tab: "tasks", icon: CheckSquare, labelKey: "tasks", alwaysShow: true, countKey: "task_count" },
  { key: "planning", tab: "planning", icon: CalendarRange, labelKey: "planning", alwaysShow: true },
  { key: "plans", tab: "plans", icon: Map, labelKey: "plans", alwaysShow: false, countKey: "plan_count", conditionKey: "plan_count" },
  { key: "submissions", tab: "submissions", icon: FileSpreadsheet, labelKey: "submissions", alwaysShow: false, countKey: "submission_count", conditionKey: "submission_count" },
  { key: "meetings", tab: "meetings", icon: FileText, labelKey: "pvSeance", alwaysShow: false, countKey: "meeting_count", conditionKey: "meeting_count" },
  { key: "visits", tab: "visits", icon: UserCheck, labelKey: "visits", alwaysShow: false, countKey: "visit_count", conditionKey: "visit_count" },
  { key: "emails", tab: "emails", icon: Mail, labelKey: "mail", alwaysShow: false, countKey: "email_count", conditionKey: "email_count" },
  { key: "prix", tab: "prix", icon: FileStack, labelKey: "cantaiaPrix", alwaysShow: false, conditionKey: "has_budget_estimate" },
];

export function ActiveProjectSection({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations("nav");
  const { activeProject, navCounts, isLoading } = useActiveProject();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const visibleTools = navCounts
    ? PROJECT_TOOLS.filter((tool) => {
        if (tool.alwaysShow) return true;
        if (!tool.conditionKey) return true;
        const val = navCounts[tool.conditionKey];
        if (typeof val === "boolean") return val;
        if (typeof val === "number") return val >= 1;
        return false;
      })
    : PROJECT_TOOLS.filter((tool) => tool.alwaysShow);

  const getToolHref = (tool: ProjectTool): string => {
    if (!activeProject) return "#";
    if (!tool.tab) return `/projects/${activeProject.id}`;
    return `/projects/${activeProject.id}?tab=${tool.tab}`;
  };

  const isToolActive = (tool: ProjectTool): boolean => {
    if (!activeProject) return false;
    const projectPath = `/projects/${activeProject.id}`;
    if (!pathname.startsWith(projectPath)) return false;
    const currentTab = searchParams.get("tab");
    if (!tool.tab) return !currentTab;
    return currentTab === tool.tab;
  };

  const getCount = (tool: ProjectTool): number | null => {
    if (!navCounts || !tool.countKey) return null;
    const val = navCounts[tool.countKey];
    if (typeof val === "number" && val > 0) return val;
    return null;
  };

  if (collapsed) {
    return (
      <div className="px-2 py-2">
        <div className="group relative flex justify-center">
          {activeProject ? (
            <div
              className="h-8 w-8 rounded-md flex items-center justify-center text-xs font-bold text-white cursor-pointer"
              style={{ backgroundColor: activeProject.color || "#F97316" }}
              title={activeProject.name}
            >
              {activeProject.name.charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="h-8 w-8 rounded-md flex items-center justify-center bg-[#27272A] text-[#71717A] text-xs">
              ?
            </div>
          )}
          <div className="invisible group-hover:visible absolute left-full ml-2 top-0 z-50 min-w-[200px] rounded-md border border-[#27272A] bg-[#18181B] p-2 shadow-md">
            <p className="px-2 py-1 text-[10px] font-semibold text-[#52525B] uppercase tracking-wider">
              {t("sections.activeProject")}
            </p>
            {activeProject ? (
              <>
                <p className="px-2 py-1 text-sm font-medium text-[#D4D4D8]">{activeProject.name}</p>
                {visibleTools.map((tool) => {
                  const Icon = tool.icon;
                  const count = getCount(tool);
                  return (
                    <Link
                      key={tool.key}
                      href={getToolHref(tool)}
                      className="flex items-center gap-2 rounded-sm px-2 py-1 text-sm text-[#A1A1AA] hover:bg-[#1C1C1F] hover:text-[#D4D4D8]"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{t(tool.labelKey)}</span>
                      {count !== null && (
                        <span className="ml-auto text-xs text-[#71717A]">{count}</span>
                      )}
                    </Link>
                  );
                })}
              </>
            ) : (
              <p className="px-2 py-1 text-sm text-[#71717A]">{t("selectProject")}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-1">
      <p className="text-[10px] font-semibold text-[#52525B] uppercase tracking-wider px-[10px] pt-[8px] pb-[2px]">
        {t("sections.activeProject")}
      </p>

      <ProjectSwitcher />

      {activeProject && (
        <div className="mt-1 space-y-0.5 px-[6px]">
          {visibleTools.map((tool) => {
            const Icon = tool.icon;
            const active = isToolActive(tool);
            const count = getCount(tool);
            return (
              <Link
                key={tool.key}
                href={getToolHref(tool)}
                className={`flex items-center gap-2.5 rounded-[7px] px-[10px] py-[6px] text-[13px] transition-colors ${
                  active
                    ? "bg-gradient-to-r from-[rgba(249,115,22,0.09)] to-transparent text-[#F97316] font-semibold"
                    : "text-[#A1A1AA] hover:bg-[#1C1C1F] hover:text-[#D4D4D8]"
                }`}
              >
                <Icon className={`h-[14px] w-[18px] ${active ? "text-[#F97316]" : "text-[#A1A1AA]"}`} />
                <span className="truncate">{t(tool.labelKey)}</span>
                {count !== null && (
                  <span
                    className={`ml-auto text-xs ${
                      active ? "text-[#F97316]" : "text-[#71717A]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
          })}

          <Link
            href={`/projects/${activeProject.id}`}
            className="flex items-center gap-2.5 rounded-[7px] px-[10px] py-[6px] text-[13px] text-[#A1A1AA] hover:bg-[#1C1C1F] hover:text-[#D4D4D8]"
          >
            <MoreHorizontal className="h-[14px] w-[18px]" />
            <span>{t("seeAll")}</span>
          </Link>
        </div>
      )}

      {isLoading && !activeProject && (
        <div className="px-[10px] py-2">
          <div className="h-4 w-24 animate-pulse rounded bg-[#27272A]" />
        </div>
      )}
    </div>
  );
}
