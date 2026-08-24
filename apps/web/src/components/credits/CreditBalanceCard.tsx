"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Coins, RefreshCw, Sparkles, Wallet } from "lucide-react";
import { useCredits } from "@/lib/hooks/use-credits";
import { CREDIT_LEVEL_COLORS, creditLevel } from "./credit-config";

interface CreditBalanceCardProps {
  /** Hide the refresh button (e.g. read-only admin summary). */
  showRefresh?: boolean;
  /** Optional footer slot (CTA links). */
  footer?: React.ReactNode;
}

/**
 * Balance panel: total + subscription/purchased split + monthly allocation bar.
 * Shared by Settings > Abonnement and the org Admin tab.
 */
export function CreditBalanceCard({
  showRefresh = true,
  footer,
}: CreditBalanceCardProps) {
  const t = useTranslations("credits");
  const { balance, loading, unavailable, refresh } = useCredits();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }

  if (unavailable) {
    return (
      <div className="rounded-[10px] border border-[#27272A] bg-[#18181B] px-5 py-4">
        <div className="flex items-center gap-2 text-[12px] text-[#71717A]">
          <Coins className="h-4 w-4" />
          {t("unavailable")}
        </div>
      </div>
    );
  }

  if (loading && !balance) {
    return (
      <div className="h-[120px] animate-pulse rounded-[10px] border border-[#27272A] bg-[#18181B]" />
    );
  }

  if (!balance) return null;

  const level = creditLevel(balance.total);
  const colors = CREDIT_LEVEL_COLORS[level];

  const allocation = balance.monthly_allocation;
  const hasAllocation = allocation > 0;
  const consumed = hasAllocation
    ? Math.min(allocation, Math.max(0, allocation - balance.subscription_credits))
    : 0;
  const consumedPct = hasAllocation
    ? Math.min(100, Math.round((consumed / allocation) * 100))
    : 0;

  return (
    <div className="rounded-[10px] border border-[#27272A] bg-[#18181B] p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colors.bg}`}>
            <Coins className={`h-5 w-5 ${colors.text}`} />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[#71717A]">
              {t("totalCredits")}
            </div>
            <div className={`font-display text-[28px] font-extrabold leading-tight ${colors.text}`}>
              {balance.total}
            </div>
          </div>
        </div>

        {showRefresh && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-md border border-[#27272A] px-2.5 py-1.5 text-[11px] text-[#A1A1AA] transition-colors hover:bg-[#27272A] disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            {t("refresh")}
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
            <Sparkles className="h-3 w-3 text-[#F97316]" />
            {t("subscriptionCredits")}
          </div>
          <div className="mt-1 font-display text-[20px] font-bold tabular-nums text-[#FAFAFA]">
            {balance.subscription_credits}
          </div>
          <div className="mt-0.5 text-[10px] text-[#52525B]">
            {t("subscriptionCreditsHint")}
          </div>
        </div>

        <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-3">
          <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
            <Wallet className="h-3 w-3 text-[#3B82F6]" />
            {t("purchasedCredits")}
          </div>
          <div className="mt-1 font-display text-[20px] font-bold tabular-nums text-[#FAFAFA]">
            {balance.purchased_credits}
          </div>
          <div className="mt-0.5 text-[10px] text-[#52525B]">
            {t("purchasedCreditsHint")}
          </div>
        </div>
      </div>

      {hasAllocation && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#A1A1AA]">{t("monthlyAllocation")}</span>
            <span className="tabular-nums text-[#71717A]">
              {t("allocationUsed", { used: consumed, total: allocation })}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-[#27272A]">
            <div
              className="h-full rounded-sm bg-gradient-to-r from-[#F97316] to-[#FB923C]"
              style={{ width: `${consumedPct}%` }}
            />
          </div>
        </div>
      )}

      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}
