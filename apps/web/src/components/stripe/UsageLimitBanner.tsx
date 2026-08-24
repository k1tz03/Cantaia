"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Coins, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCredits } from "@/lib/hooks/use-credits";
import { CREDIT_THRESHOLD_LOW } from "@/components/credits/credit-config";

interface UsageLimitBannerProps {
  /** Legacy quota fallback — AI calls used this month. */
  current: number;
  /** Legacy quota fallback — monthly AI call limit (-1/0 = unlimited). */
  limit: number;
  /** Legacy quota fallback — org plan. */
  plan: string;
}

/**
 * Low-credit banner (credits model) with a legacy quota fallback.
 *
 * Primary path: GET /api/credits works → show a banner once the balance drops
 * below 20 credits (red at 0, amber otherwise) with a top-up CTA.
 *
 * Fallback path: the credits API is unavailable (org not migrated yet) → keep
 * the previous behaviour and warn at 80 % / 100 % of the plan's AI quota.
 */
export function UsageLimitBanner({ current, limit, plan }: UsageLimitBannerProps) {
  const t = useTranslations("credits");
  const { balance, unavailable } = useCredits();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  // ── Credits path ──────────────────────────────────────────
  if (!unavailable && balance) {
    if (balance.total >= CREDIT_THRESHOLD_LOW) return null;

    const empty = balance.total <= 0;

    return (
      <div
        className={`flex items-center justify-between border-b px-4 py-3 text-sm ${
          empty
            ? "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]"
            : "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]"
        }`}
      >
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 flex-shrink-0" />
          <span>
            {empty ? t("emptyBalance") : t("lowBalance", { count: balance.total })}{" "}
            <Link
              href="/settings?tab=subscription&section=packs"
              className="font-medium underline"
            >
              {t("topUp")}
            </Link>
          </span>
        </div>
        {!empty && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded p-1 hover:bg-[#F59E0B]/20"
            aria-label={t("dismiss")}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  // ── Legacy quota fallback ─────────────────────────────────
  if (limit <= 0) return null;

  const pct = (current / limit) * 100;
  if (pct < 80) return null;

  const isBlocked = pct >= 100;

  return (
    <div
      className={`flex items-center justify-between border-b px-4 py-3 text-sm ${
        isBlocked
          ? "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]"
          : "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]"
      }`}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        {isBlocked ? (
          <span>
            {t("legacyQuotaReached", { current, limit })}{" "}
            <Link href="/settings?tab=subscription" className="font-medium underline">
              {t("legacyUpgrade")}
            </Link>
          </span>
        ) : (
          <span>
            {t("legacyQuotaWarning", { percent: Math.round(pct), current, limit })}{" "}
            {plan === "trial" && (
              <Link href="/settings?tab=subscription" className="font-medium underline">
                {t("legacyUpgrade")}
              </Link>
            )}
          </span>
        )}
      </div>
      {!isBlocked && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded p-1 hover:bg-[#F59E0B]/20"
          aria-label={t("dismiss")}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
