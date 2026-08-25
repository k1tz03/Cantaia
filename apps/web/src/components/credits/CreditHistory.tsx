"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { History, Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useCredits, type CreditTransaction } from "@/lib/hooks/use-credits";

/** Matches RECENT_TRANSACTIONS_LIMIT in GET /api/credits (the seed page). */
const PAGE_SIZE = 20;

/** Kinds we have translations for — anything else falls back to the raw value. */
const KNOWN_KINDS = new Set([
  "signup_bonus",
  "purchase",
  "subscription_grant",
  "subscription_expiry",
  "consumption",
  "refund",
  "admin_adjust",
]);

/**
 * Credit ledger. Seeds from `recent_transactions` (last 20 returned by
 * GET /api/credits) and pages further through GET /api/credits/transactions.
 */
export function CreditHistory() {
  const t = useTranslations("credits");
  const locale = useLocale();
  const { balance } = useCredits();

  const [extra, setExtra] = useState<CreditTransaction[]>([]);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const transactions = [...(balance?.recent_transactions ?? []), ...extra];

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = page + 1;
      // PAGE_SIZE must match the 20 rows GET /api/credits already seeded us
      // with, otherwise page 2 would skip the rows in between.
      const res = await fetch(
        `/api/credits/transactions?page=${next}&limit=${PAGE_SIZE}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        setExhausted(true);
        return;
      }
      const payload = await res.json();
      const rows: CreditTransaction[] = Array.isArray(payload?.data)
        ? payload.data
        : [];
      if (rows.length === 0) {
        setExhausted(true);
        return;
      }
      setExtra((prev) => {
        const known = new Set([...prev.map((tx) => tx.id)]);
        return [...prev, ...rows.filter((tx) => !known.has(tx.id))];
      });
      setPage(next);
      if (payload?.pagination?.hasMore === false) setExhausted(true);
    } catch {
      setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function kindLabel(kind: string): string {
    return KNOWN_KINDS.has(kind) ? t(`kind_${kind}`) : kind;
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-[#A1A1AA]" />
        <h3 className="font-display text-[15px] font-bold text-[#FAFAFA]">
          {t("historyTitle")}
        </h3>
      </div>

      {transactions.length === 0 ? (
        <div className="rounded-[10px] border border-[#27272A] bg-[#18181B] px-5 py-8 text-center text-[12px] text-[#A1A1AA]">
          {t("historyEmpty")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-[10px] border border-[#27272A] bg-[#18181B]">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-[#27272A] text-[10px] uppercase tracking-wide text-[#A1A1AA]">
                  <th className="px-4 py-2.5 font-medium">{t("colDate")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("colKind")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("colAction")}</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {t("colAmount")}
                  </th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    {t("colBalance")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const positive = tx.amount >= 0;
                  return (
                    <tr
                      key={tx.id}
                      className="border-b border-[#27272A] last:border-0 hover:bg-[#27272A]/40"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-[#A1A1AA]">
                        {formatDateTime(tx.created_at, locale)}
                      </td>
                      <td className="px-4 py-2.5 text-[#FAFAFA]">
                        {kindLabel(tx.kind)}
                      </td>
                      <td className="px-4 py-2.5 text-[#A1A1AA]">
                        {tx.action_type ? (
                          <span className="rounded bg-[#27272A] px-1.5 py-0.5 text-[10px] text-[#A1A1AA]">
                            {tx.action_type}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums ${
                          positive ? "text-[#10B981]" : "text-[#EF4444]"
                        }`}
                      >
                        {positive ? "+" : ""}
                        {tx.amount}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-[#A1A1AA]">
                        {tx.balance_after}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!exhausted && (
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="flex w-full items-center justify-center gap-1.5 border-t border-[#27272A] py-2.5 text-[11px] text-[#A1A1AA] transition-colors hover:bg-[#27272A] disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="h-3 w-3 animate-spin" />}
              {t("loadMore")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
