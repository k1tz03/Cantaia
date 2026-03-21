"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Info } from "lucide-react";
import type { PlanReference } from "@cantaia/core/plans";

interface PlanReferenceAlertProps {
  references: PlanReference[];
  compact?: boolean;
}

export function PlanReferenceAlert({ references, compact = false }: PlanReferenceAlertProps) {
  const t = useTranslations("plans");

  if (references.length === 0) return null;

  const criticals = references.filter((r) => r.severity === "critical" && r.is_outdated);
  const warnings = references.filter((r) => r.severity === "warning" || !r.is_outdated);

  if (compact) {
    // Compact mode: single line summary
    if (criticals.length === 0) return null;
    return (
      <div className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-1.5">
        <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
        <span className="text-xs font-medium text-red-700 dark:text-red-400">
          {t("outdatedPlanRef", { count: criticals.length })}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Critical alerts: outdated version references */}
      {criticals.map((ref, i) => (
        <div
          key={`crit-${i}`}
          className="rounded-md border border-red-500/20 bg-red-500/10 p-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                {t("outdatedVersionAlert")}
              </p>
              <p className="mt-0.5 text-[11px] text-red-600">
                {t("planRefDetail", {
                  planNumber: ref.plan_number,
                  refVersion: ref.version_referenced || "?",
                  currentVersion: ref.current_version,
                })}
              </p>
              <p className="mt-1 text-[11px] text-red-500 italic">
                &quot;{ref.context}&quot;
              </p>
              <p className="mt-1 text-[11px] text-red-600">
                {ref.risk_description}
              </p>
            </div>
          </div>
        </div>
      ))}

      {/* Info-level: references without version */}
      {warnings.length > 0 && criticals.length === 0 && (
        <div className="rounded-md border border-primary/20 bg-primary/10 p-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-primary">
                {t("planRefsFound", { count: warnings.length })}
              </p>
              {warnings.map((ref, i) => (
                <p key={`warn-${i}`} className="mt-0.5 text-[11px] text-primary">
                  {ref.plan_number}
                  {ref.version_referenced ? ` (${ref.version_referenced})` : ""}
                  {" — "}{ref.risk_description}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
