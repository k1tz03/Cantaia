"use client";

import { useTranslations } from "next-intl";

export function SubmissionStatusBadge({ status }: { status: string }) {
  const t = useTranslations("products.submissions");
  const config: Record<string, { label: string; className: string }> = {
    draft: {
      label: t("status_draft"),
      className: "bg-amber-100 text-amber-700",
    },
    reviewed: {
      label: t("status_reviewed"),
      className: "bg-blue-100 text-blue-700",
    },
    exported: {
      label: t("status_exported"),
      className: "bg-green-100 text-green-700",
    },
    archived: {
      label: t("status_archived"),
      className: "bg-gray-100 text-gray-500",
    },
    extracting: {
      label: t("status_extracting"),
      className: "bg-purple-100 text-purple-700",
    },
  };

  const c = config[status] || {
    label: status,
    className: "bg-gray-100 text-gray-500",
  };

  return (
    <span
      className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${c.className}`}
    >
      {c.label}
    </span>
  );
}
