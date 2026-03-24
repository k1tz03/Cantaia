"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { UserCheck } from "lucide-react";

export function ProjectVisitsTab() {
  const t = useTranslations("projects");

  return (
    <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-[#27272A] bg-[#0F0F11]">
      <div className="text-center">
        <UserCheck className="mx-auto h-10 w-10 text-[#71717A]" />
        <p className="mt-3 text-sm font-medium text-[#71717A]">
          {t("visitsPlaceholder")}
        </p>
        <p className="mt-1 text-xs text-[#71717A]">
          <Link href="/visits" className="text-[#F97316] hover:text-[#F97316]">
            {t("viewAllVisits")}
          </Link>
        </p>
      </div>
    </div>
  );
}
