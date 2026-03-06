"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@cantaia/ui";
import { Map, FileStack } from "lucide-react";

export function ProjectPlansTab({
  plans,
}: {
  plans: any[];
}) {
  const t = useTranslations("projects");

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{t("plansTitle")}</h3>
            <p className="mt-1 text-xs text-slate-500">{t("plansDescription")}</p>
          </div>
          <Link
            href="/plans"
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <FileStack className="h-3.5 w-3.5" />
            {t("viewAllPlans")}
          </Link>
        </div>
        {plans.length === 0 ? (
          <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50">
            <div className="text-center">
              <Map className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-500">{t("noPlansYet")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("plansWillAppear")}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-md border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-4 py-2">{t("planName")}</th>
                  <th className="px-4 py-2">{t("planType")}</th>
                  <th className="px-4 py-2">{t("planDiscipline")}</th>
                  <th className="px-4 py-2">{t("planVersion")}</th>
                  <th className="px-4 py-2">{t("planDate")}</th>
                  <th className="px-4 py-2">{t("planStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plans.map((plan: any) => {
                  const fileUrl = plan.current_version?.file_url;
                  return (
                    <tr
                      key={plan.id}
                      className={cn("hover:bg-slate-50", fileUrl && "cursor-pointer")}
                      onClick={() => fileUrl && window.open(fileUrl, "_blank")}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        {plan.plan_title || plan.plan_number || plan.current_version?.file_name || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{plan.plan_type || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-600">{plan.discipline || "—"}</td>
                      <td className="px-4 py-2.5 text-slate-600">{plan.current_version?.version_code || plan.version_count || "1"}</td>
                      <td className="px-4 py-2.5 text-slate-500">{plan.created_at ? new Date(plan.created_at).toLocaleDateString("fr-CH") : "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium",
                          plan.status === "active" ? "bg-green-50 text-green-700" :
                          plan.status === "superseded" ? "bg-amber-50 text-amber-700" :
                          "bg-slate-100 text-slate-600"
                        )}>
                          {plan.status || "active"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
