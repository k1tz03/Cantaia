"use client";

import { Eye, History, Info, Sparkles, Calculator } from "lucide-react";
import { cn } from "@cantaia/ui";

export type PlanTab = "viewer" | "versions" | "info" | "analysis" | "estimation";

export function PlanDetailTabs({
  activeTab,
  setActiveTab,
  versionsCount,
  estimationScore,
  t,
}: {
  activeTab: PlanTab;
  setActiveTab: (tab: PlanTab) => void;
  versionsCount: number;
  estimationScore: string | null;
  t: (key: string, values?: any) => string;
}) {
  const tabs: { key: PlanTab; icon: React.ElementType; label: string; badge?: string | null }[] = [
    { key: "viewer", icon: Eye, label: t("tabViewer") },
    { key: "versions", icon: History, label: `${t("tabVersions")} (${versionsCount})` },
    { key: "info", icon: Info, label: t("tabInfo") },
    { key: "analysis", icon: Sparkles, label: t("tabAnalysis") },
    // HIDDEN: Budget estimation temporarily disabled — prices unreliable
    // { key: "estimation", icon: Calculator, label: "Estimation V2", badge: estimationScore },
  ];

  return (
    <div className="mb-4 flex items-center gap-1 border-b border-border">
      {tabs.map(({ key, icon: Icon, label, badge }) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
            activeTab === key ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
          {badge && (
            <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:text-green-400">
              {badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
