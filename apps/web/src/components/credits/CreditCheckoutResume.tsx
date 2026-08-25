"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useCredits } from "@/lib/hooks/use-credits";
import { RETURN_PARAM, sanitizeReturnPath } from "./credit-checkout";

/**
 * Post-checkout banner on Settings → Abonnement.
 *
 * A user who hits the paywall mid-task (writing a reply, analysing a
 * submission) gets bounced to billing, buys credits, and Stripe drops them
 * back on the settings page — where the thing they were actually doing is two
 * navigations away. The paywall stashes the interrupted page in `?return=`,
 * the checkout route round-trips it through Stripe, and this banner offers
 * "Reprendre" so the round trip closes itself.
 *
 * Also handles `credits=canceled`, where the only useful action is going back.
 */

/** Minimal safe translate: falls back to French copy until G.json is merged. */
function useSafeT() {
  const t = useTranslations("credits");
  return (key: string, fallback: string, values?: Record<string, unknown>) => {
    try {
      const value = t(key as never, values as never);
      // next-intl echoes the key path when a message is missing.
      return value && !value.includes(key) ? value : fallback;
    } catch {
      return fallback;
    }
  };
}

export function CreditCheckoutResume() {
  const t = useSafeT();
  const { refresh } = useCredits();
  const [status, setStatus] = useState<"success" | "canceled" | null>(null);
  const [returnPath, setReturnPath] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const credits = params.get("credits");
    if (credits !== "success" && credits !== "canceled") return;

    setStatus(credits);
    setReturnPath(sanitizeReturnPath(params.get(RETURN_PARAM)));

    // The Stripe webhook grants the credits asynchronously, so the balance the
    // page loaded with is already stale by the time the user lands here.
    if (credits === "success") {
      void refresh();
      const retry = setTimeout(() => void refresh(), 3000);
      return () => clearTimeout(retry);
    }
  }, [refresh]);

  if (!status) return null;

  const success = status === "success";

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-3 ${
        success
          ? "border-[#10B981]/30 bg-[#10B981]/10"
          : "border-[#F59E0B]/30 bg-[#F59E0B]/10"
      }`}
    >
      <div className="flex items-center gap-2">
        {success ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#10B981]" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-[#F59E0B]" />
        )}
        <span
          className={`text-[12px] ${success ? "text-[#10B981]" : "text-[#F59E0B]"}`}
        >
          {success
            ? t("checkoutSuccess", "Paiement confirmé — vos crédits sont disponibles.")
            : t("checkoutCanceled", "Paiement annulé — aucun crédit n'a été débité.")}
        </span>
      </div>

      {returnPath && (
        <Link
          href={returnPath}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#F97316] to-[#EA580C] px-3 py-1.5 text-[12px] font-medium text-[#0F0F11] shadow-lg shadow-[#F97316]/25 transition-shadow hover:shadow-xl"
        >
          {t("resumeCta", "Reprendre où j'en étais")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
