// ============================================================
// Cantaia — Tracking Code Service
// Generate tracking codes for price request emails and extract
// them from incoming supplier response emails.
// ============================================================

import { createHmac } from "crypto";

const TRACKING_PREFIX = "PR";
const HMAC_SECRET = process.env.TRACKING_HMAC_SECRET || "cantaia-tracking-v1";

export interface TrackingCodeParts {
  priceRequestId: string;
  shortId: string;
  hash: string;
  fullCode: string;    // "PR-a3f8b2c1-9d4e"
  bracketCode: string; // "[REF:PR-a3f8b2c1-9d4e]"
  htmlComment: string; // "<!-- CANTAIA-PR:a3f8b2c1-9d4e -->"
  footerText: string;  // "Ref: PR-a3f8b2c1-9d4e"
}

/**
 * Generate a tracking code from a price request UUID.
 *
 * The code embeds two pieces:
 * - shortId: first 8 hex chars of the UUID (dashes removed)
 * - hash: first 4 hex chars of HMAC-SHA256(priceRequestId, secret)
 *
 * This allows matching incoming emails back to their original
 * price request while keeping the visible reference short.
 */
export function generateTrackingCode(priceRequestId: string): TrackingCodeParts {
  const shortId = priceRequestId.replace(/-/g, "").slice(0, 8);
  const hash = createHmac("sha256", HMAC_SECRET)
    .update(priceRequestId)
    .digest("hex")
    .slice(0, 4);

  const fullCode = `${TRACKING_PREFIX}-${shortId}-${hash}`;

  return {
    priceRequestId,
    shortId,
    hash,
    fullCode,
    bracketCode: `[REF:${fullCode}]`,
    htmlComment: `<!-- CANTAIA-${TRACKING_PREFIX}:${shortId}-${hash} -->`,
    footerText: `Ref: ${fullCode}`,
  };
}

/**
 * Extract a tracking code from email content by checking three patterns:
 * 1. [REF:PR-{shortId}-{hash}] — bracket format (most reliable)
 * 2. <!-- CANTAIA-PR:{shortId}-{hash} --> — HTML comment (survives forwarding)
 * 3. Ref: PR-{shortId}-{hash} — visible footer text (human-readable)
 *
 * Returns the first match found, or null if no tracking code is present.
 */
export function extractTrackingCode(
  emailContent: string
): { shortId: string; hash: string; fullCode: string } | null {
  if (!emailContent) return null;

  // Pattern 1: [REF:PR-{shortId}-{hash}]
  const bracketMatch = emailContent.match(
    /\[REF:PR-([a-f0-9]{8})-([a-f0-9]{4})\]/i
  );
  if (bracketMatch) {
    const shortId = bracketMatch[1].toLowerCase();
    const hash = bracketMatch[2].toLowerCase();
    return {
      shortId,
      hash,
      fullCode: `${TRACKING_PREFIX}-${shortId}-${hash}`,
    };
  }

  // Pattern 2: <!-- CANTAIA-PR:{shortId}-{hash} -->
  const commentMatch = emailContent.match(
    /<!--\s*CANTAIA-PR:([a-f0-9]{8})-([a-f0-9]{4})\s*-->/i
  );
  if (commentMatch) {
    const shortId = commentMatch[1].toLowerCase();
    const hash = commentMatch[2].toLowerCase();
    return {
      shortId,
      hash,
      fullCode: `${TRACKING_PREFIX}-${shortId}-${hash}`,
    };
  }

  // Pattern 3: Ref: PR-{shortId}-{hash}
  const footerMatch = emailContent.match(
    /Ref:\s*PR-([a-f0-9]{8})-([a-f0-9]{4})/i
  );
  if (footerMatch) {
    const shortId = footerMatch[1].toLowerCase();
    const hash = footerMatch[2].toLowerCase();
    return {
      shortId,
      hash,
      fullCode: `${TRACKING_PREFIX}-${shortId}-${hash}`,
    };
  }

  return null;
}

/**
 * Validate a tracking code against the database and resolve it
 * to a price request record.
 *
 * Steps:
 * 1. Query price_requests where id starts with the shortId
 * 2. For each candidate, regenerate the HMAC hash and compare
 * 3. Return the verified match with supplier_id and submission_id
 *
 * Returns null if no valid match is found (invalid hash or no
 * matching price request in the organization).
 */
export async function validateAndResolvePriceRequest(
  supabase: any,
  organizationId: string,
  trackingCode: { shortId: string; hash: string }
): Promise<{
  priceRequestId: string;
  supplierId: string;
  submissionId: string;
} | null> {
  // Query candidates whose UUID starts with the shortId
  const { data: candidates, error } = await supabase
    .from("price_requests")
    .select("id, supplier_id, submission_id, organization_id")
    .eq("organization_id", organizationId)
    .like("id", `${trackingCode.shortId}%`);

  if (error || !candidates || candidates.length === 0) {
    return null;
  }

  // Verify the HMAC hash against each candidate
  for (const candidate of candidates) {
    const expectedHash = createHmac("sha256", HMAC_SECRET)
      .update(candidate.id)
      .digest("hex")
      .slice(0, 4);

    if (expectedHash === trackingCode.hash) {
      return {
        priceRequestId: candidate.id,
        supplierId: candidate.supplier_id,
        submissionId: candidate.submission_id,
      };
    }
  }

  return null;
}
