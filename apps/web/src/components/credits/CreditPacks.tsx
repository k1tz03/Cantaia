"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Coins, Loader2, ShieldAlert } from "lucide-react";
import { formatCHF, formatNumber } from "@/lib/format";
import {
  BEST_PRICE_PACK_ID,
  CREDIT_PACK_LIST,
  packLabelKey,
  type CreditPackView,
} from "./credit-config";
import { startCreditCheckout } from "./credit-checkout";

/**
 * One-shot credit packs (Stripe mode=payment, 12-month validity).
 * The cheapest CHF/credit pack carries the "Meilleur prix" badge.
 */
export function CreditPacks() {
  const t = useTranslations("credits");
  const locale = useLocale();
  const [pending, setPending] = useState<string | null>(null);
  // Packs never return `already_subscribed`, but startCreditCheckout's result
  // type includes it — widen the state so the assignment below type-checks.
  const [error, setError] = useState<
    "forbidden" | "error" | "already_subscribed" | null
  >(null);

  async function handleBuy(pack: CreditPackView) {
    setPending(pack.id);
    setError(null);
    const result = await startCreditCheckout("pack", pack.id);
    if (!result.ok) setError(result.reason);
    setPending(null);
  }

  function packName(pack: CreditPackView): string {
    const key = packLabelKey(pack);
    return key ? t(key) : `${pack.credits}`;
  }

  if (CREDIT_PACK_LIST.length === 0) return null;

  return (
    <section id="credits-packs" className="scroll-mt-24">
      <div className="mb-3">
        <h3 className="font-display text-[15px] font-bold text-[#FAFAFA]">
          {t("packsTitle")}
        </h3>
        <p className="mt-0.5 text-[11px] text-[#A1A1AA]">{t("packsSubtitle")}</p>
      </div>

      {error && (
        <div
          className={`mb-3 flex items-center gap-2 rounded-lg border px-4 py-3 text-[12px] ${
            error === "forbidden"
              ? "border-[#F59E0B]/30 bg-[#F59E0B]/10 text-[#F59E0B]"
              : "border-[#EF4444]/30 bg-[#EF4444]/10 text-[#EF4444]"
          }`}
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {error === "forbidden" ? t("adminOnly") : t("checkoutError")}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CREDIT_PACK_LIST.map((pack) => {
          const isBest = pack.id === BEST_PRICE_PACK_ID;
          return (
            <div
              key={pack.id}
              className={`relative rounded-[10px] border p-4 transition-colors ${
                isBest
                  ? "border-[#F97316]/50 bg-[#18181B] shadow-md shadow-[#F97316]/5"
                  : "border-[#27272A] bg-[#18181B] hover:border-[#3F3F46]"
              }`}
            >
              {isBest && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-[#F97316] to-[#EA580C] px-2.5 py-0.5 text-[10px] font-semibold text-[#0F0F11] shadow-lg shadow-[#F97316]/25">
                  {t("bestPrice")}
                </div>
              )}

              <div className="mt-1 text-center">
                <div className="text-[12px] font-semibold text-[#A1A1AA]">
                  {packName(pack)}
                </div>
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  <Coins className="h-4 w-4 text-[#F97316]" />
                  <span className="font-display text-[24px] font-extrabold tabular-nums text-[#FAFAFA]">
                    {formatNumber(pack.credits, locale)}
                  </span>
                </div>
                <div className="text-[10px] text-[#A1A1AA]">{t("creditsUnit")}</div>

                <div className="mt-3 font-display text-[16px] font-bold text-[#FAFAFA]">
                  {formatCHF(pack.priceCHF, locale)}
                </div>
                <div className="text-[10px] text-[#A1A1AA]">
                  {t("perCredit", {
                    price: formatNumber(pack.pricePerCredit, locale, {
                      minimumFractionDigits: 3,
                      maximumFractionDigits: 3,
                    }),
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleBuy(pack)}
                disabled={pending !== null}
                className={`mt-4 w-full rounded-lg py-2 text-[12px] font-medium transition-all disabled:opacity-50 ${
                  isBest
                    ? "bg-gradient-to-r from-[#F97316] to-[#EA580C] text-[#0F0F11] shadow-lg shadow-[#F97316]/25 hover:shadow-xl"
                    : "bg-[#FAFAFA] text-[#0F0F11] hover:bg-[#A1A1AA]"
                }`}
              >
                {pending === pack.id ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  t("buy")
                )}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
