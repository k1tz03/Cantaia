"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Coins } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCredits } from "@/lib/hooks/use-credits";
import {
  CREDIT_LEVEL_COLORS,
  CREDIT_THRESHOLD_LOW,
  creditCostFor,
  creditLevel,
} from "./credit-config";

/**
 * Header pill showing the org's total credit balance.
 *
 * Green > 100, amber 20-100, red < 20. Below CREDIT_THRESHOLD_LOW the pill
 * also grows a pulsing warning icon: colour alone is not a signal people
 * notice in a dense header, and it is invisible to a colour-blind user.
 *
 * The tooltip answers the question the bare number raises — "is that a lot?" —
 * by pricing a few representative actions straight from CREDIT_COSTS.
 *
 * Hidden while the first fetch is in flight and when the credits API is
 * unavailable (org not migrated), so the header never shows a placeholder or
 * a wrong zero.
 */

/** Representative actions, cheapest first. Costs come from the shared grid. */
const SAMPLE_ACTIONS: Array<{ action: string; fallback: string }> = [
  { action: "chat_message", fallback: "Message chat IA" },
  { action: "email_reply", fallback: "Réponse email IA" },
  { action: "pv_generate", fallback: "PV de chantier" },
  { action: "submission_parse", fallback: "Analyse de soumission" },
  { action: "estimate_v2", fallback: "Estimation de plan" },
];

export function CreditBadge() {
  const t = useTranslations("credits");
  const { balance, loading, unavailable } = useCredits();
  const [hovered, setHovered] = useState(false);

  /** Missing keys fall back to French until i18n-pending/G.json is merged. */
  function label(key: string, fallback: string): string {
    try {
      const value = t(key as never);
      return value && !value.includes(key) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  if (unavailable) return null;
  if (loading && !balance) return null;
  if (!balance) return null;

  const level = creditLevel(balance.total);
  const colors = CREDIT_LEVEL_COLORS[level];
  const critical = balance.total < CREDIT_THRESHOLD_LOW;

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
        {critical ? (
          <AlertTriangle className={`h-3.5 w-3.5 animate-pulse ${colors.text}`} />
        ) : (
          <Coins className={`h-3.5 w-3.5 ${colors.text}`} />
        )}
        <span className={`text-[12px] font-semibold tabular-nums ${colors.text}`}>
          {balance.total}
        </span>
      </Link>

      {hovered && (
        <div
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-[#3F3F46] bg-[#18181B] p-3 shadow-xl shadow-black/40"
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
              <span className="text-[#A1A1AA]">{t("totalCredits")}</span>
              <span className={`font-bold tabular-nums ${colors.text}`}>
                {balance.total}
              </span>
            </div>
          </div>

          {critical && (
            <div className="mt-2 rounded-md border border-[#EF4444]/30 bg-[#EF4444]/10 px-2 py-1.5 text-[10px] text-[#EF4444]">
              {label(
                "badgeLowWarning",
                "Solde bas — certaines actions IA vont être bloquées."
              )}
            </div>
          )}

          {/* What a credit actually buys */}
          <div className="mt-2.5 border-t border-[#27272A] pt-2">
            <div className="text-[10px] uppercase tracking-wide text-[#A1A1AA]">
              {label("badgeCostsTitle", "Coût des actions")}
            </div>
            <div className="mt-1.5 space-y-1">
              {SAMPLE_ACTIONS.map(({ action, fallback }) => (
                <div
                  key={action}
                  className="flex items-center justify-between text-[10px]"
                >
                  <span className="text-[#A1A1AA]">
                    {label(`action_${action}`, fallback)}
                  </span>
                  <span className="font-semibold tabular-nums text-[#FAFAFA]">
                    {creditCostFor(action)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2 text-[10px] text-[#F97316]">{t("viewBilling")}</div>
        </div>
      )}
    </div>
  );
}
