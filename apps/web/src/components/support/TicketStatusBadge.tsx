"use client";

import { useTranslations } from "next-intl";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  open: { label: "statusOpen", className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  in_progress: { label: "statusInProgress", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  resolved: { label: "statusResolved", className: "bg-green-500/10 text-green-600 dark:text-green-400" },
  closed: { label: "statusClosed", className: "bg-muted text-muted-foreground" },
};

export function TicketStatusBadge({ status }: { status: string }) {
  const t = useTranslations("support");
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {t(config.label as any)}
    </span>
  );
}
