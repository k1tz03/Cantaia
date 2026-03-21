"use client";

import { useTranslations } from "next-intl";

const CATEGORY_CONFIG: Record<string, { label: string; className: string }> = {
  bug: { label: "categoryBug", className: "bg-red-500/10 text-red-600 dark:text-red-400" },
  question: { label: "categoryQuestion", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  feature_request: { label: "categoryFeature", className: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  billing: { label: "categoryBilling", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

export function TicketCategoryBadge({ category }: { category: string }) {
  const t = useTranslations("support");
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.question;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {t(config.label as any)}
    </span>
  );
}
