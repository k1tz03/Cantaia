"use client";

import React, { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Sparkles,
  ChevronDown,
  AlertTriangle,
  Lightbulb,
  Truck,
  CalendarClock,
} from "lucide-react";
import type {
  PlanningAiRisk,
  PlanningAiRecommendation,
  PlanningProcurementItem,
} from "./planning-types";

interface PlanningAiPanelProps {
  summary?: string | null;
  risks?: PlanningAiRisk[];
  recommendations?: PlanningAiRecommendation[];
  procurementPlan?: PlanningProcurementItem[];
}

const SEVERITY_STYLES: Record<string, { chip: string; card: string; dot: string }> = {
  high: {
    chip: "bg-red-500/15 text-red-400 border-red-500/30",
    card: "border-red-500/30 bg-red-500/[0.06]",
    dot: "bg-red-500",
  },
  medium: {
    chip: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    card: "border-amber-500/30 bg-amber-500/[0.06]",
    dot: "bg-amber-500",
  },
  low: {
    chip: "bg-[#27272A] text-[#A1A1AA] border-[#3F3F46]",
    card: "border-[#27272A] bg-[#18181B]",
    dot: "bg-[#71717A]",
  },
};

function severityStyle(level: string | undefined) {
  return SEVERITY_STYLES[level ?? "low"] ?? SEVERITY_STYLES.low;
}

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(locale);
}

/**
 * The generator has been persisting `ai_summary`, `ai_recommendations` and the
 * risk / procurement analysis since migration 057 — none of it was ever shown.
 * This panel surfaces it directly under the Gantt toolbar.
 */
export default function PlanningAiPanel({
  summary,
  risks = [],
  recommendations = [],
  procurementPlan = [],
}: PlanningAiPanelProps) {
  const t = useTranslations("planning");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  const probabilityLabel: Record<string, string> = {
    high: t("ai.probability.high"),
    medium: t("ai.probability.medium"),
    low: t("ai.probability.low"),
  };

  const sortedRisks = useMemo(() => {
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...risks].sort(
      (a, b) =>
        (rank[a.probability] ?? 3) - (rank[b.probability] ?? 3) ||
        (b.impact_days ?? 0) - (a.impact_days ?? 0),
    );
  }, [risks]);

  const sortedProcurement = useMemo(
    () =>
      [...procurementPlan].sort((a, b) =>
        String(a.order_by ?? "").localeCompare(String(b.order_by ?? "")),
      ),
    [procurementPlan],
  );

  const hasContent =
    Boolean(summary) ||
    sortedRisks.length > 0 ||
    recommendations.length > 0 ||
    sortedProcurement.length > 0;

  if (!hasContent) return null;

  const highRisks = sortedRisks.filter((r) => r.probability === "high").length;

  return (
    <div className="border-b border-[#27272A] bg-[#0F0F11] print:hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[#18181B] transition-colors"
      >
        <Sparkles className="h-4 w-4 text-[#F97316] shrink-0" />
        <span className="text-sm font-medium text-[#FAFAFA]">
          {t("ai.title")}
        </span>

        <div className="flex items-center gap-1.5">
          {sortedRisks.length > 0 && (
            <span
              className={[
                "px-2 py-0.5 rounded-full text-[11px] font-medium border",
                severityStyle(highRisks > 0 ? "high" : "medium").chip,
              ].join(" ")}
            >
              {t("ai.riskCount", { count: sortedRisks.length })}
            </span>
          )}
          {sortedProcurement.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium border border-violet-500/30 bg-violet-500/15 text-violet-300">
              {t("ai.procurementCount", { count: sortedProcurement.length })}
            </span>
          )}
          {recommendations.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium border border-[#3F3F46] bg-[#27272A] text-[#A1A1AA]">
              {t("ai.recommendationCount", { count: recommendations.length })}
            </span>
          )}
        </div>

        <ChevronDown
          className={[
            "h-4 w-4 text-[#A1A1AA] ml-auto shrink-0 transition-transform",
            open ? "rotate-180" : "",
          ].join(" ")}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 max-h-[45vh] overflow-y-auto">
          {/* Synthesis */}
          {summary && (
            <p className="text-sm leading-relaxed text-[#A1A1AA] whitespace-pre-line border-l-2 border-[#F97316]/50 pl-3">
              {summary}
            </p>
          )}

          {/* Risks */}
          {sortedRisks.length > 0 && (
            <section>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                {t("ai.risks")}
              </h3>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {sortedRisks.map((risk, i) => {
                  const style = severityStyle(risk.probability);
                  return (
                    <div
                      key={`${risk.title}-${i}`}
                      className={["rounded-lg border p-3", style.card].join(" ")}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={["mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", style.dot].join(" ")}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#FAFAFA]">
                            {risk.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span
                              className={[
                                "px-1.5 py-0.5 rounded text-[10px] font-medium border",
                                style.chip,
                              ].join(" ")}
                            >
                              {probabilityLabel[risk.probability] ?? risk.probability}
                            </span>
                            {Number(risk.impact_days) > 0 && (
                              <span className="text-[11px] text-[#A1A1AA]">
                                {t("ai.impactDays", { days: risk.impact_days })}
                              </span>
                            )}
                          </div>
                          {risk.mitigation && (
                            <p className="mt-1.5 text-xs text-[#A1A1AA]">
                              <span className="text-[#A1A1AA]">
                                {t("ai.mitigation")}:{" "}
                              </span>
                              {risk.mitigation}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Procurement plan */}
          {sortedProcurement.length > 0 && (
            <section>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-2">
                <Truck className="h-3.5 w-3.5" />
                {t("ai.procurement")}
              </h3>
              <div className="overflow-x-auto rounded-lg border border-[#27272A]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#18181B] text-[11px] uppercase tracking-wider text-[#A1A1AA]">
                      <th className="text-left font-medium px-3 py-2">
                        {t("ai.lot")}
                      </th>
                      <th className="text-left font-medium px-3 py-2">
                        {t("ai.orderBy")}
                      </th>
                      <th className="text-left font-medium px-3 py-2">
                        {t("ai.leadTime")}
                      </th>
                      <th className="text-left font-medium px-3 py-2">
                        {t("ai.reason")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProcurement.map((item, i) => (
                      <tr
                        key={`${item.lot}-${i}`}
                        className="border-t border-[#27272A]"
                      >
                        <td className="px-3 py-2 text-[#FAFAFA]">
                          {item.lot}
                          {item.cfc_code && (
                            <span className="ml-1.5 text-[11px] text-[#A1A1AA]">
                              CFC {item.cfc_code}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-[#FAFAFA]">
                            <CalendarClock className="h-3.5 w-3.5 text-violet-400" />
                            {formatDate(item.order_by, locale)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-[#A1A1AA] whitespace-nowrap">
                          {t("ai.weeks", { count: item.lead_time_weeks })}
                        </td>
                        <td className="px-3 py-2 text-[#A1A1AA]">{item.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <section>
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#A1A1AA] mb-2">
                <Lightbulb className="h-3.5 w-3.5" />
                {t("ai.recommendations")}
              </h3>
              <ul className="space-y-1.5">
                {recommendations.map((rec, i) => (
                  <li
                    key={`${rec.title}-${i}`}
                    className="flex items-start gap-2 text-sm"
                  >
                    <span
                      className={[
                        "mt-1.5 h-1.5 w-1.5 rounded-full shrink-0",
                        severityStyle(rec.impact).dot,
                      ].join(" ")}
                    />
                    <span className="min-w-0">
                      <span className="text-[#FAFAFA] font-medium">
                        {rec.title}
                      </span>
                      {rec.description && (
                        <span className="text-[#A1A1AA]"> — {rec.description}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-[11px] text-[#52525B]">{t("ai.disclaimer")}</p>
        </div>
      )}
    </div>
  );
}
