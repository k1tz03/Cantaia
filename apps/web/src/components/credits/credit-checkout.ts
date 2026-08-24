/**
 * Stripe Checkout kickoff for credits.
 *
 * POST /api/credits/checkout { type, id } → { url }.
 * The route is admin/director-only and answers 403 otherwise; we surface that
 * as a distinct reason so the UI can explain it instead of showing a generic
 * error.
 */
export type CreditCheckoutResult =
  | { ok: true }
  | { ok: false; reason: "forbidden" | "error" };

export async function startCreditCheckout(
  type: "pack" | "subscription",
  id: string
): Promise<CreditCheckoutResult> {
  try {
    const res = await fetch("/api/credits/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id }),
    });

    if (res.status === 403) return { ok: false, reason: "forbidden" };
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
