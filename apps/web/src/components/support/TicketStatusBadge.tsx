"use client";

import { useTranslations } from "next-intl";

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  open: { label: "statusOpen", bg: "#3B82F618", color: "#60A5FA" },
  in_progress: { label: "statusInProgress", bg: "#F59E0B18", color: "#FBBF24" },
  resolved: { label: "statusResolved", bg: "#10B98118", color: "#34D399" },
  closed: { label: "statusClosed", bg: "#27272A", color: "#71717A" },
};

export function TicketStatusBadge({ status }: { status: string }) {
  const t = useTranslations("support");
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.open;
  return (
    <span
      style={{ background: config.bg, color: config.color }}
      className="inline-flex items-center rounded px-2 py-0.5 text-[9px] font-semibold"
    >
      {t(config.label as any)}
    </span>
  );
}
