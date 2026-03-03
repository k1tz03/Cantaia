// ============================================================
// Cantaia — Price Response Detector (Level 0)
// Detects if an incoming email is a supplier response to a
// price request, before the normal classification pipeline.
// ============================================================

import {
  extractTrackingCode,
  validateAndResolvePriceRequest,
} from "./tracking-code";

export interface PriceResponseMatch {
  priceRequestId: string;
  supplierId: string;
  submissionId: string;
  matchMethod: "tracking_code" | "sender_email";
  trackingCode?: string;
}

/**
 * Detect if an incoming email is a supplier response to a price request.
 *
 * Two-step detection:
 * 1. Try to extract a tracking code from the email body and validate it.
 * 2. Fallback: match the sender email against suppliers with sent price requests.
 *    Only match if exactly 1 result (to avoid ambiguity).
 *
 * Returns null if no match is found.
 */
export async function detectPriceResponse(
  supabase: any,
  organizationId: string,
  email: { body: string; sender_email: string; subject: string }
): Promise<PriceResponseMatch | null> {
  // ── Step 1: Tracking code detection (most reliable) ──
  const trackingCode = extractTrackingCode(email.body || "");

  if (trackingCode) {
    const resolved = await validateAndResolvePriceRequest(
      supabase,
      organizationId,
      trackingCode
    );

    if (resolved) {
      return {
        priceRequestId: resolved.priceRequestId,
        supplierId: resolved.supplierId,
        submissionId: resolved.submissionId,
        matchMethod: "tracking_code",
        trackingCode: trackingCode.fullCode,
      };
    }
  }

  // ── Step 2: Sender email fallback ──
  // Query price_requests with status 'sent' joined to suppliers
  // where the supplier email matches the sender email.
  if (email.sender_email) {
    try {
      const { data: matches, error } = await supabase
        .from("price_requests")
        .select("id, supplier_id, submission_id, suppliers!inner(id, email)")
        .eq("organization_id", organizationId)
        .eq("status", "sent")
        .eq("suppliers.email", email.sender_email.toLowerCase());

      if (!error && matches && matches.length === 1) {
        const match = matches[0];
        return {
          priceRequestId: match.id,
          supplierId: match.supplier_id,
          submissionId: match.submission_id,
          matchMethod: "sender_email",
        };
      }
      // If 0 or >1 matches: ambiguous, don't auto-link
    } catch (err) {
      console.warn("[price-response-detector] Sender email fallback error:", err);
    }
  }

  return null;
}
