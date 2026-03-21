"use client";

import { useTranslations } from "next-intl";

export function SubmissionStatusBadge({ status }: { status: string }) {
  const t = useTranslations("products.submissions");
  const config: Record<string, { label: string; className: string }> = {
    draft: {
      label: t("status_draft"),
      className: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    },
    reviewed: {
      label: t("status_reviewed"),
      className: "bg-primary/10 text-primary",
    },
    exported: {
      label: t("status_exported"),
      className: "bg-green-500/10 text-green-700 dark:text-green-400",
    },
    archived: {
      label: t("status_archived"),
      className: "bg-muted text-muted-foreground",
    },
    extracting: {
      label: t("status_extracting"),
      className: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    },
  };

  const c = config[status] || {
    label: status,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <span
      className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${c.className}`}
    >
      {c.label}
    </span>
  );
}
