"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ShieldCheck, CheckSquare } from "lucide-react";
import { formatDate } from "@/lib/mock-data";
import { GuaranteeAlerts } from "@/components/closure/GuaranteeAlerts";

export function ProjectClosureTab({
  project,
}: {
  project: any;
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("closure");

  const reception = null as { id: string; reception_type: string; reception_date?: string; pv_document_url?: string | null; pv_signed_url?: string | null } | null;
  const openReservesCount = 0;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{t("closureTitle")}</h3>
            <p className="mt-1 text-xs text-slate-500">{t("closureDescription")}</p>
          </div>
          {(project.status === "active" || project.status === "on_hold") && (
            <Link
              href={`/projects/${project.id}/closure`}
              className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand/90"
            >
              <ShieldCheck className="h-4 w-4" />
              {t("startClosure")}
            </Link>
          )}
          {project.status === "closing" && (
            <Link
              href={`/projects/${project.id}/closure`}
              className="inline-flex items-center gap-2 rounded-md border border-brand px-4 py-2 text-sm font-medium text-brand transition-colors hover:bg-brand/5"
            >
              <ShieldCheck className="h-4 w-4" />
              {t("continueClosure")}
            </Link>
          )}
          {project.status === "completed" && (
            <Link
              href={`/projects/${project.id}/closure`}
              className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              {t("viewClosure")}
            </Link>
          )}
        </div>
      </div>

      {reception && (
        <div className="rounded-md border border-slate-200 bg-white p-6">
          <h3 className="text-sm font-semibold text-slate-800">{tc("receptionPVTitle")}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-500">{tc("receptionType")}</p>
              <p className="mt-0.5 text-sm font-medium text-slate-700">{tc(reception.reception_type)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{tc("receptionDate")}</p>
              <p className="mt-0.5 text-sm font-medium text-slate-700">
                {reception.reception_date ? formatDate(reception.reception_date) : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">{tc("reserveStatus")}</p>
              <p className={`mt-0.5 text-sm font-medium ${openReservesCount > 0 ? "text-red-600" : "text-green-600"}`}>
                {openReservesCount > 0 ? `${openReservesCount} ${tc("reserveOpen").toLowerCase()}` : tc("allReservesLifted")}
              </p>
            </div>
          </div>
          {openReservesCount > 0 && (
            <Link
              href={`/projects/${project.id}/reserves`}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              {tc("viewReserves")} ({openReservesCount})
            </Link>
          )}
        </div>
      )}

      <GuaranteeAlerts projectId={project.id} />
    </div>
  );
}
