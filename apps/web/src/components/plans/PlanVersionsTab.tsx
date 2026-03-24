"use client";

import { Download, Copy, Sparkles, Shield } from "lucide-react";
import { cn } from "@cantaia/ui";
import { VALIDATION_CONFIG, formatDate, formatFileSize } from "./plan-detail-types";
import type { PlanVersion } from "./plan-detail-types";

export function PlanVersionsTab({
  versions,
  t,
}: {
  versions: PlanVersion[];
  t: (key: string) => string;
}) {
  if (versions.length === 0) {
    return <div className="text-center py-10 text-sm text-[#71717A]">Aucune version</div>;
  }

  return (
    <div className="space-y-3">
      {[...versions].sort((a, b) => b.version_number - a.version_number).map((version) => {
        const validCfg = VALIDATION_CONFIG[version.validation_status] || VALIDATION_CONFIG.pending;
        const ValidIcon = validCfg.icon;
        return (
          <div
            key={version.id}
            className={cn(
              "rounded-lg border bg-[#0F0F11] p-4",
              version.is_current ? "border-brand/30 ring-1 ring-brand/10" : "border-[#27272A]"
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded text-sm font-bold text-white",
                  version.is_current ? "bg-brand" : "bg-slate-400"
                )}>
                  {version.version_code}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[#FAFAFA]">Version {version.version_code}</span>
                    {version.is_current && (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">{t("versionCurrent")}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#71717A]">
                    {formatDate(version.version_date)} · {version.file_name} · {formatFileSize(version.file_size)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {version.file_url && (
                  <a href={version.file_url} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-[#71717A] hover:bg-[#27272A] hover:text-[#71717A]" title={t("download")}>
                    <Download className="h-4 w-4" />
                  </a>
                )}
                <button className="rounded-md p-1.5 text-[#71717A] hover:bg-[#27272A] hover:text-[#71717A]" title={t("copyLink")}>
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mb-2 flex items-center gap-2 text-[11px] text-[#71717A]">
              {version.ai_detected && (
                <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-purple-600">
                  <Sparkles className="h-3 w-3" />
                  {t("sourceAutoDetected")}
                  {version.ai_confidence != null && ` (${Math.round(version.ai_confidence * 100)}%)`}
                </span>
              )}
            </div>

            {version.ai_changes_detected && (
              <div className="mb-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 mb-0.5">{t("changesDetected")}:</p>
                <p className="text-[11px] text-amber-600">{version.ai_changes_detected}</p>
              </div>
            )}

            <div className="flex items-center gap-4 text-[11px]">
              <div className="flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-[#71717A]" />
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium", validCfg.bg, validCfg.color)}>
                  <ValidIcon className="h-3 w-3" />
                  {t(validCfg.labelKey)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
