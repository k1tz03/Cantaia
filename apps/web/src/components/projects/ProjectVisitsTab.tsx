"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { UserCheck } from "lucide-react";

export function ProjectVisitsTab() {
  const t = useTranslations("projects");

  return (
    <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-300 bg-white">
      <div className="text-center">
        <UserCheck className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-500">
          {t("visitsPlaceholder")}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          <Link href="/visits" className="text-blue-600 hover:text-blue-700">
            {t("viewAllVisits")}
          </Link>
        </p>
      </div>
    </div>
  );
}
