"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PAYWALL_EVENT,
  PaywallDialog,
  type PaywallDetail,
} from "./PaywallDialog";
import { fetchCredits } from "@/lib/hooks/use-credits";

/**
 * Host for the global credits paywall.
 *
 * Mounted once inside AppHeader (which already sits inside every `(app)`
 * page), so no layout change is needed. It listens for the window event fired
 * by `handleInsufficientCredits()` / `openPaywall()` and renders the dialog —
 * the dialog itself portals into `document.body`, so the header's DOM position
 * does not affect stacking.
 */
export function CreditsUIProvider() {
  const [detail, setDetail] = useState<PaywallDetail | null>(null);

  useEffect(() => {
    function onPaywall(event: Event) {
      const custom = event as CustomEvent<PaywallDetail>;
      setDetail(custom.detail ?? {});
      // A 402 means the server's view of the balance is authoritative and
      // likely fresher than ours — resync so the badge matches the dialog.
      void fetchCredits();
    }
    window.addEventListener(PAYWALL_EVENT, onPaywall);
    return () => window.removeEventListener(PAYWALL_EVENT, onPaywall);
  }, []);

  const close = useCallback(() => setDetail(null), []);

  return (
    <PaywallDialog
      open={detail !== null}
      onClose={close}
      required={detail?.required}
      remaining={detail?.remaining}
      message={detail?.message}
      actionType={detail?.actionType}
    />
  );
}
