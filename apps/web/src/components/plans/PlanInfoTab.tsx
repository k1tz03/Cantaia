"use client";

import { Link } from "@/i18n/navigation";
import { cn } from "@cantaia/ui";
import { DISCIPLINE_KEYS, DISCIPLINE_COLORS, formatDateTime } from "./plan-detail-types";
import type { PlanDetail } from "./plan-detail-types";

export function PlanInfoTab({
  plan,
  t,
}: {
  plan: PlanDetail;
  t: (key: string) => string;
}) {
  const project = plan.projects;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colNumber")}</p>
          <p className="font-mono font-medium text-slate-800">{plan.plan_number}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colTitle")}</p>
          <p className="text-slate-800">{plan.plan_title}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colProject")}</p>
          {project ? (
            <Link href={`/projects/${project.id}`} className="flex items-center gap-1.5 text-slate-800 hover:text-brand">
              <span className="h-2 w-2 rounded-full bg-brand" />
              {project.name}
            </Link>
          ) : (
            <p className="text-slate-400">&mdash;</p>
          )}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colDiscipline")}</p>
          {plan.discipline ? (
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", DISCIPLINE_COLORS[plan.discipline])}>
              {t(DISCIPLINE_KEYS[plan.discipline])}
            </span>
          ) : <p className="text-slate-400">&mdash;</p>}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colScale")}</p>
          <p className="text-slate-800">{plan.scale || "\u2014"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colAuthor")}</p>
          <p className="text-slate-800">
            {plan.author_name || "\u2014"}
            {plan.author_company && <span className="text-slate-500"> &mdash; {plan.author_company}</span>}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("colZone")}</p>
          <p className="text-slate-800">{plan.zone || "\u2014"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("createdAt")}</p>
          <p className="text-slate-800">{formatDateTime(plan.created_at)}</p>
        </div>
      </div>
      {plan.notes && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{t("notes")}</p>
          <p className="text-sm text-slate-700">{plan.notes}</p>
        </div>
      )}
    </div>
  );
}
