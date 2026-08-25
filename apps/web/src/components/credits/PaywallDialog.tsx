"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Coins, X, Zap, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { creditCostFor } from "./credit-config";
import { RETURN_PARAM, sanitizeReturnPath } from "./credit-checkout";

/**
 * Paywall shown when an AI route answers 402 { error: 'insufficient_credits' }.
 *
 * Wiring: any fetch site can call `handleInsufficientCredits(res)`. It detects
 * the 402, fires a window event, and the `CreditsUIProvider` (mounted in
 * AppHeader) opens this dialog — so callers need no context or props.
 */

export const PAYWALL_EVENT = "cantaia:credits-paywall";

export interface PaywallDetail {
  /** Credits the action needed. */
  required?: number;
  /** Credits the org had left. */
  remaining?: number;
  /** Optional server-provided message. */
  message?: string;
  /** action_type, used to look up the cost when the server omits `required`. */
  actionType?: string;
}

/** Open the paywall dialog imperatively (no React context needed). */
export function openPaywall(detail: PaywallDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PaywallDetail>(PAYWALL_EVENT, { detail }));
}

/**
 * Detect an "insufficient credits" response and open the paywall.
 *
 * Returns `true` when the response was handled (caller should stop and not
 * surface its own error), `false` otherwise.
 *
 * Reads a clone of the body so the caller can still consume `res`.
 */
export async function handleInsufficientCredits(res: Response): Promise<boolean> {
  if (!res || res.status !== 402) return false;

  let payload: Record<string, unknown> | null = null;
  try {
    payload = await res.clone().json();
  } catch {
    // Non-JSON 402 — still treated as a credits paywall.
  }

  if (
    payload &&
    typeof payload.error === "string" &&
    payload.error !== "insufficient_credits"
  ) {
    return false;
  }

  openPaywall({
    required: typeof payload?.required === "number" ? payload.required : undefined,
    remaining: typeof payload?.remaining === "number" ? payload.remaining : undefined,
    message: typeof payload?.message === "string" ? payload.message : undefined,
    actionType:
      typeof payload?.action_type === "string" ? payload.action_type : undefined,
  });

  return true;
}

interface PaywallDialogProps extends PaywallDetail {
  open: boolean;
  onClose: () => void;
}

export function PaywallDialog({
  open,
  onClose,
  required,
  remaining,
  actionType,
}: PaywallDialogProps) {
  const t = useTranslations("credits");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const cost = typeof required === "number" ? required : creditCostFor(actionType);
  const left = typeof remaining === "number" ? remaining : 0;

  // Remember the page the paywall interrupted so the settings tab can offer
  // "Reprendre" once the top-up completes. Same-origin path only — the value
  // travels to Stripe and back, and the server re-validates it.
  const returnPath = sanitizeReturnPath(
    `${window.location.pathname}${window.location.search}`
  );
  const returnQuery = returnPath
    ? `&${RETURN_PARAM}=${encodeURIComponent(returnPath)}`
    : "";

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[#27272A] bg-[#18181B] p-6 shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EF4444]/10">
              <Coins className="h-5 w-5 text-[#EF4444]" />
            </div>
            <h2 className="font-display text-[16px] font-bold text-[#FAFAFA]">
              {t("paywallTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("paywallClose")}
            className="rounded-md p-1 text-[#A1A1AA] transition-colors hover:bg-[#27272A] hover:text-[#FAFAFA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Always the locale-aware description: the server 402 payload carries a
            French-only message, so trusting it here showed FR copy to EN/DE
            users. The specifics (cost / remaining) are rendered in the tiles
            below, so nothing is lost by ignoring the server string. */}
        <p className="mt-4 text-[13px] leading-relaxed text-[#A1A1AA]">
          {t("paywallDescription")}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-[#A1A1AA]">
              {t("paywallRequired")}
            </div>
            <div className="mt-1 font-display text-[20px] font-extrabold text-[#FAFAFA]">
              {cost}
            </div>
          </div>
          <div className="rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-3">
            <div className="text-[10px] uppercase tracking-wide text-[#A1A1AA]">
              {t("paywallRemaining")}
            </div>
            <div className="mt-1 font-display text-[20px] font-extrabold text-[#EF4444]">
              {left}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <Link
            href={`/settings?tab=subscription&section=packs${returnQuery}`}
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#F97316] to-[#EA580C] px-4 py-2.5 text-[13px] font-medium text-[#0F0F11] shadow-lg shadow-[#F97316]/25 transition-shadow hover:shadow-xl"
          >
            <Zap className="h-4 w-4" />
            {t("paywallTopUp")}
          </Link>
          <Link
            href={`/settings?tab=subscription&section=plans${returnQuery}`}
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-lg border border-[#27272A] bg-[#0F0F11] px-4 py-2.5 text-[13px] font-medium text-[#FAFAFA] transition-colors hover:bg-[#27272A]"
          >
            {t("paywallPlans")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <p className="mt-3 text-center text-[11px] text-[#A1A1AA]">
          {t("paywallCheaper")}
        </p>
      </div>
    </div>,
    document.body
  );
}
