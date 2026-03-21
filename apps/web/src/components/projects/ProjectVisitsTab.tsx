"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { UserCheck } from "lucide-react";

export function ProjectVisitsTab() {
  const t = useTranslations("projects");

  return (
    <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border bg-background">
      <div className="text-center">
        <UserCheck className="mx-auto h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">
          {t("visitsPlaceholder")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <Link href="/visits" className="text-primary hover:text-primary">
            {t("viewAllVisits")}
          </Link>
        </p>
      </div>
    </div>
  );
}
