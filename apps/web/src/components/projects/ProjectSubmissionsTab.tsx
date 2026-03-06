"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FileSpreadsheet, Clock, Plus } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/mock-data";

export function ProjectSubmissionsTab({
  submissions,
}: {
  submissions: { id: string; title: string; reference: string; status: string; estimated_total?: number; deadline?: string }[];
}) {
  const t = useTranslations("projects");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {submissions.length} {submissions.length === 1 ? "soumission" : "soumissions"}
        </p>
        <Link
          href="/submissions/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("newTask")}
        </Link>
      </div>
      {submissions.length > 0 ? (
        <div className="space-y-2">
          {submissions.map((sub) => {
            const lots: unknown[] = [];
            const statusColors: Record<string, string> = {
              draft: "bg-gray-100 text-gray-700",
              published: "bg-blue-100 text-blue-700",
              received: "bg-indigo-100 text-indigo-700",
              comparing: "bg-amber-100 text-amber-700",
              awarded: "bg-green-100 text-green-700",
              cancelled: "bg-red-100 text-red-700",
            };
            return (
              <Link
                key={sub.id}
                href={`/submissions/${sub.id}`}
                className="flex items-center gap-4 rounded-md border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50"
              >
                <FileSpreadsheet className="h-5 w-5 flex-shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-800 truncate">{sub.title}</p>
                    <span className="flex-shrink-0 text-xs text-slate-400 font-mono">{sub.reference}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                    <span>{lots.length} lot{lots.length !== 1 ? "s" : ""}</span>
                    {sub.estimated_total && (
                      <span className="font-medium text-slate-700">
                        {formatCurrency(sub.estimated_total, "CHF")}
                      </span>
                    )}
                    {sub.deadline && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(sub.deadline)}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[sub.status] || "bg-gray-100 text-gray-700"}`}>
                  {sub.status}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
          <div className="text-center">
            <FileSpreadsheet className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">{t("comingSoon")}</p>
          </div>
        </div>
      )}
    </div>
  );
}
