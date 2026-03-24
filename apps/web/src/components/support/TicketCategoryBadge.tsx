"use client";

import { useTranslations } from "next-intl";

const CATEGORY_CONFIG: Record<string, { label: string; emoji: string; bg: string; color: string }> = {
  bug: { label: "categoryBug", emoji: "\uD83D\uDC1B", bg: "#EF444418", color: "#F87171" },
  question: { label: "categoryQuestion", emoji: "\u2753", bg: "#3B82F618", color: "#60A5FA" },
  feature_request: { label: "categoryFeature", emoji: "\uD83D\uDCA1", bg: "#8B5CF618", color: "#A78BFA" },
  billing: { label: "categoryBilling", emoji: "\uD83D\uDCB3", bg: "#F59E0B18", color: "#FBBF24" },
};

export function TicketCategoryBadge({ category }: { category: string }) {
  const t = useTranslations("support");
  const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.question;
  return (
    <span
      style={{ background: config.bg, color: config.color }}
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-semibold"
    >
      <span>{config.emoji}</span>
      {t(config.label as any)}
    </span>
  );
}
