"use client";

import { Link } from "@/i18n/navigation";
import { Upload, Send, Download } from "lucide-react";
import { cn } from "@cantaia/ui";
import {
  STATUS_CONFIG,
  DISCIPLINE_KEYS,
  DISCIPLINE_COLORS,
  formatDate,
  formatFileSize,
} from "./plan-detail-types";
import type { PlanDetail, PlanVersion } from "./plan-detail-types";

export function PlanDetailHeader({
  plan,
  currentVersion,
  t,
}: {
  plan: PlanDetail;
  currentVersion: PlanVersion | undefined;
  t: (key: string, values?: any) => string;
}) {
  const statusCfg = STATUS_CONFIG[plan.status];
  const StatusIcon = statusCfg.icon;
  const project = plan.projects;

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-lg font-bold text-brand">{plan.plan_number}</span>
          <span className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
            statusCfg.bg, statusCfg.color
          )}>
            <StatusIcon className="h-3.5 w-3.5" />
            {t(statusCfg.labelKey)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <Upload className="h-3.5 w-3.5" />
            {t("uploadNewVersion")}
          </button>
          <button className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            <Send className="h-3.5 w-3.5" />
            {t("distribute")}
          </button>
        </div>
      </div>

      <h1 className="text-xl font-semibold text-slate-900 mb-2">{plan.plan_title}</h1>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {project && (
          <Link href={`/projects/${project.id}`} className="flex items-center gap-1.5 hover:text-brand transition-colors">
            <span className="h-2 w-2 rounded-full shrink-0 bg-brand" />
            {project.name}
          </Link>
        )}
        {plan.discipline && (
          <>
            <span className="text-slate-300">&middot;</span>
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", DISCIPLINE_COLORS[plan.discipline])}>
              {t(DISCIPLINE_KEYS[plan.discipline])}
            </span>
          </>
        )}
        {plan.lot_name && <><span className="text-slate-300">&middot;</span><span>{plan.lot_name}</span></>}
        {plan.zone && <><span className="text-slate-300">&middot;</span><span>{plan.zone}</span></>}
        {plan.scale && <><span className="text-slate-300">&middot;</span><span>{plan.scale}</span></>}
      </div>

      {plan.author_company && (
        <p className="mt-2 text-xs text-slate-500">
          {t("author")}: <span className="font-medium text-slate-700">{plan.author_name || plan.author_company}</span>
          {plan.author_name && plan.author_company && ` — ${plan.author_company}`}
        </p>
      )}

      {currentVersion && (
        <div className="mt-3 flex items-center gap-3 rounded-md bg-blue-50 border border-blue-100 px-3 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-brand text-white text-sm font-bold">
            {currentVersion.version_code}
          </div>
          <div className="flex-1">
            <p className="text-xs font-medium text-slate-700">
              {t("versionCurrent")} — {currentVersion.file_name}
            </p>
            <p className="text-[11px] text-slate-500">
              {formatDate(currentVersion.version_date)} · {formatFileSize(currentVersion.file_size)}
            </p>
          </div>
          {currentVersion.file_url && (
            <a
              href={currentVersion.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md bg-white border border-blue-200 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
            >
              <Download className="h-3.5 w-3.5" />
              {t("download")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
