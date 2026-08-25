import type { NextRequest } from "next/server";

/**
 * Shared helpers of the public supplier-portal routes
 * (/api/supplier-portal/[token] and …/upload). In lib/ because a route.ts may
 * only export HTTP handlers (next build rejects anything else).
 */

/** Shared per-IP budget across every portal endpoint. */
export const PORTAL_IP_LIMIT = { limit: 120, windowSec: 3600 };

/** How long after the deadline the portal still accepts an answer / a file. */
export const PORTAL_DEADLINE_GRACE_MS = 7 * 86400000;

/** First hop of x-forwarded-for — "unknown" when the header is absent. */
export function portalClientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

interface ClosableRequest {
  submission_id: string;
  material_group?: string | null;
  deadline?: string | null;
  award_outcome?: string | null;
}

/**
 * A price request is closed when its lot is already awarded (or the request
 * itself carries an award outcome), or when the deadline is more than 7 days
 * past. The routes answer 410 { error: "closed", reason: "awarded"|"deadline" }.
 *
 * `submissionDeadline` is the fallback when the request has no own deadline.
 * The submission read is best effort: a lookup error never closes the portal.
 */
export async function supplierPortalClosedReason(
  admin: any,
  priceRequest: ClosableRequest,
  submissionDeadline?: string | null
): Promise<"awarded" | "deadline" | null> {
  // The request itself was already decided (awarded or rejected).
  if (priceRequest.award_outcome) return "awarded";

  // Its lot is awarded on the submission.
  const { data: sub, error } = await (admin as any)
    .from("submissions")
    .select("budget_estimate")
    .eq("id", priceRequest.submission_id)
    .maybeSingle();

  if (!error) {
    const budget = (sub?.budget_estimate || {}) as Record<string, any>;
    const map = budget.awarded_request_ids;
    if (map && typeof map === "object") {
      if (map[priceRequest.material_group || ""]) return "awarded";
    } else if (budget.awarded_request_id) {
      // Legacy single-award shape: one award used to close the whole submission.
      return "awarded";
    }
  }

  const deadline = priceRequest.deadline || submissionDeadline || null;
  if (deadline) {
    const deadlineMs = new Date(deadline).getTime();
    if (Number.isFinite(deadlineMs) && Date.now() - deadlineMs > PORTAL_DEADLINE_GRACE_MS) {
      return "deadline";
    }
  }

  return null;
}
