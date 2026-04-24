"use client";

import { Link } from "@/i18n/navigation";
import {
  ArrowLeft,
  FileSpreadsheet,
  Building2,
  BarChart3,
  Send,
  TrendingUp,
  FileText,
  Gavel,
  Calendar,
} from "lucide-react";
import type { Submission, SubmissionLot, SubmissionItem, SubmissionStatus, TranslateFn } from "./shared";
import { STATUS_COLORS, formatCHF, Tab } from "./shared";

interface SubmissionDetailHeaderProps {
  submission: Submission;
  project: { name?: string; color?: string } | null;
  lots: SubmissionLot[];
  items: SubmissionItem[];
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  t: TranslateFn;
}

export function SubmissionDetailHeader({
  submission,
  project,
  lots,
  items,
  activeTab,
  setActiveTab,
  t,
}: SubmissionDetailHeaderProps) {
  const getStatusLabel = (status: SubmissionStatus): string => {
    const key = `status${status.charAt(0).toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`;
    return t(key as "statusDraft");
  };

  const tabs: { key: Tab; label: string; icon: React.ComponentType<any> }[] = [
    { key: "items", label: t("tabItems"), icon: FileSpreadsheet },
    { key: "suppliers", label: t("tabSuppliers"), icon: Building2 },
    { key: "tracking", label: t("tabTracking"), icon: Send },
    { key: "comparison", label: t("tabComparison"), icon: BarChart3 },
    { key: "negotiation", label: t("tabNegotiation"), icon: Gavel },
    { key: "intelligence", label: t("tabIntelligence"), icon: TrendingUp },
    { key: "documents", label: t("tabDocuments"), icon: FileText },
  ];

  return (
    <div className="bg-[#0F0F11] border-b border-[#27272A] px-6 py-4">
      <div className="flex items-center gap-3 mb-3">
        <Link href="/submissions" className="p-1 hover:bg-[#27272A] rounded">
          <ArrowLeft className="h-4 w-4 text-[#71717A]" />
        </Link>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: project?.color || "#94a3b8" }} />
          <span className="text-sm text-[#71717A]">{project?.name}</span>
        </div>
      </div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#FAFAFA]">{submission.title}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-[#71717A]">
            {submission.reference && (
              <span className="font-mono bg-[#27272A] px-2 py-0.5 rounded text-xs">{submission.reference}</span>
            )}
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[submission.status]}`}>
              {getStatusLabel(submission.status)}
            </span>
            <span>{lots.length} {t("lots")} · {items.length} {t("items")}</span>
            {submission.deadline && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(submission.deadline).toLocaleDateString("fr-CH")}
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          {submission.awarded_total && (
            <div>
              <div className="text-xs text-[#71717A]">{t("awarded")}</div>
              <div className="text-lg font-bold text-emerald-600">{formatCHF(submission.awarded_total)}</div>
            </div>
          )}
          {!submission.awarded_total && submission.estimated_total > 0 && (
            <div>
              <div className="text-xs text-[#71717A]">{t("estimated")}</div>
              <div className="text-lg font-bold text-[#FAFAFA]">{formatCHF(submission.estimated_total)}</div>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-1 mt-4 -mb-4 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "text-[#FAFAFA] border-foreground bg-[#0F0F11]"
                  : "text-[#71717A] border-transparent hover:text-[#FAFAFA] hover:border-[#27272A]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
