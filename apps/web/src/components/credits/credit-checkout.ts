/**
 * Stripe Checkout kickoff for credits.
 *
 * POST /api/credits/checkout { type, id, return_to } → { url }.
 * The route is admin/director-only and answers 403 otherwise; we surface that
 * as a distinct reason so the UI can explain it instead of showing a generic
 * error.
 */
export type CreditCheckoutResult =
  | { ok: true }
  | { ok: false; reason: "forbidden" | "error" | "already_subscribed" };

/** Query param carrying "the page the user was on when they ran out". */
export const RETURN_PARAM = "return";

/**
 * Same-origin path guard. A `return` value is echoed back into a redirect, so
 * only a plain absolute path is ever accepted: no scheme, no `//host`, no
 * backslash trick.
 */
export function sanitizeReturnPath(value: string | null | undefined): string | null {
  if (!value) return null;
  let path = value.trim();
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//") || path.startsWith("/\\")) return null;
  if (path.length > 512) return null;
  // Strip a fragment — it never survives a server redirect anyway.
  const hash = path.indexOf("#");
  if (hash !== -1) path = path.slice(0, hash);
  return path || null;
}

/**
 * The `?return=` currently sitting in the address bar, if any. Read here rather
 * than at every call site so buying a pack from Settings keeps whatever page
 * the paywall interrupted, with no prop drilling.
 */
export function currentReturnPath(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get(RETURN_PARAM);
  return sanitizeReturnPath(raw);
}

export async function startCreditCheckout(
  type: "pack" | "subscription",
  id: string,
  returnTo?: string | null
): Promise<CreditCheckoutResult> {
  try {
    const target = sanitizeReturnPath(returnTo) ?? currentReturnPath();

    const res = await fetch("/api/credits/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, ...(target ? { return_to: target } : {}) }),
    });

    if (res.status === 403) return { ok: false, reason: "forbidden" };
    // Org already subscribed → the UI should route them to "change plan".
    if (res.status === 409) return { ok: false, reason: "already_subscribed" };
    if (!res.ok) return { ok: false, reason: "error" };

    const data = await res.json().catch(() => null);
    if (!data?.url || typeof data.url !== "string") {
      return { ok: false, reason: "error" };
    }

    window.location.href = data.url;
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}
