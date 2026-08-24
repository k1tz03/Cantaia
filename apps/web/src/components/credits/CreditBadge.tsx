"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Coins } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCredits } from "@/lib/hooks/use-credits";
import { CREDIT_LEVEL_COLORS, creditLevel } from "./credit-config";

/**
 * Header pill showing the org's total credit balance.
 *
 * Green > 100, amber 20-100, red < 20. Hidden while the first fetch is in
 * flight and when the credits API is unavailable (org not migrated), so the
 * header never shows a placeholder or a wrong zero.
 */
export function CreditBadge() {
  const t = useTranslations("credits");
  const { balance, loading, unavailable } = useCredits();
  const [hovered, setHovered] = useState(false);

  if (unavailable) return null;
  if (loading && !balance) return null;
  if (!balance) return null;

  const level = creditLevel(balance.total);
  const colors = CREDIT_LEVEL_COLORS[level];

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Link
        href="/settings?tab=subscription"
        aria-label={`${t("badgeTooltipTitle")}: ${balance.total}`}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 transition-colors ${colors.bg} ${colors.border} hover:border-[#52525B]`}
      >
        <Coins className={`h-3.5 w-3.5 ${colors.text}`} />
        <span className={`text-[12px] font-semibold tabular-nums ${colors.text}`}>
          {balance.total}
        </span>
      </Link>

      {hovered && (
        <div
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-[#3F3F46] bg-[#18181B] p-3 shadow-xl shadow-black/40"
        >
          <div className="font-display text-[12px] font-bold text-[#FAFAFA]">
            {t("badgeTooltipTitle")}
          </div>
          <div className="mt-2 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#A1A1AA]">{t("subscriptionCredits")}</span>
              <span className="font-semibold tabular-nums text-[#FAFAFA]">
                {balance.subscription_credits}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#A1A1AA]">{t("purchasedCredits")}</span>
              <span className="font-semibold tabular-nums text-[#FAFAFA]">
                {balance.purchased_credits}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-[#27272A] pt-1.5 text-[11px]">
              <span className="text-[#71717A]">{t("totalCredits")}</span>
              <span className={`font-bold tabular-nums ${colors.text}`}>
                {balance.total}
              </span>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-[#F97316]">{t("viewBilling")}</div>
        </div>
      )}
    </div>
  );
}
