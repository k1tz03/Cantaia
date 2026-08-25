// ============================================================
// Cantaia — Price Response Detector (Level 0)
// Detects if an incoming email is a supplier response to a
// price request, before the normal classification pipeline.
// ============================================================

export interface PriceResponseMatch {
  priceRequestId: string;
  supplierId: string;
  submissionId: string;
  matchMethod: "sender_email";
  /**
   * Which table `priceRequestId` points at. Callers MUST check this before
   * writing `email_records.linked_price_request_id` — that column is a FK on
   * the legacy `price_requests` table, so storing a `submission_price_requests`
   * id raises a 23503 that silently aborts the whole classification write.
   */
  source: "submission_price_requests";
  trackingCode?: string;
}

/**
 * Detect if an incoming email is a supplier response to a price request.
 *
 * Detection = sender-email match against `submission_price_requests` rows with
 * status 'sent'. Only matches when exactly 1 row is found (avoids ambiguity).
 *
 * D-FIX2 — the legacy `PR-xxxx-yyyy` tracking-code branch was removed. It
 * resolved against the dead `price_requests` table (no writer left in the
 * codebase) while the caller then updated `submission_price_requests` with the
 * resolved id — two disjoint id spaces. Live submission responses are detected
 * by the `SUB-` code path (Level 0b) in the sync pipeline.
 *
 * Returns null if no match is found.
 */
export async function detectPriceResponse(
  supabase: any,
  organizationId: string,
  email: { body: string; sender_email: string; subject: string }
): Promise<PriceResponseMatch | null> {
  // ── Sender email match ──
  // Query submission_price_requests with status 'sent' joined to suppliers
  // where the supplier email matches the sender email.
  if (email.sender_email) {
    try {
      // Case-insensitive sender match: supplier emails are stored with
      // whatever casing the CSV import / manual entry used, while Graph
      // reports the sender in its own casing. `.eq()` on a lowercased value
      // silently missed "Info@Fournisseur.ch". `%`/`_`/`\` are escaped so a
      // literal underscore in an address is not treated as a LIKE wildcard.
      const senderPattern = email.sender_email.trim().replace(/([\\%_])/g, "\\$1");

      // Try new submission_price_requests table first.
      // Anti-IDOR: scoped to the organization the mailbox belongs to — the
      // sender-email match alone would happily resolve another org's request
      // whenever two customers share a supplier (which is the normal case).
      const { data: matches, error } = await supabase
        .from("submission_price_requests")
        .select(
          "id, supplier_id, submission_id, suppliers!inner(id, email), submissions!inner(projects!inner(organization_id))"
        )
        .eq("status", "sent")
        .eq("submissions.projects.organization_id", organizationId)
        .ilike("suppliers.email", senderPattern);

      if (error) {
        console.warn("[price-response-detector] supplier match query failed:", error.message);
      }

      if (!error && matches && matches.length === 1) {
        const match = matches[0];
        return {
          priceRequestId: match.id,
          supplierId: match.supplier_id,
          submissionId: match.submission_id,
          matchMethod: "sender_email",
          source: "submission_price_requests",
        };
      }

      // Also check manual suppliers (supplier_id is null, email stored directly)
      if (!matches || matches.length === 0) {
        const { data: manualMatches, error: manualErr } = await supabase
          .from("submission_price_requests")
          .select("id, supplier_id, submission_id, submissions!inner(projects!inner(organization_id))")
          .eq("status", "sent")
          .eq("submissions.projects.organization_id", organizationId)
          .ilike("supplier_email_manual", senderPattern);

        if (manualErr) {
          console.warn(
            "[price-response-detector] manual supplier match query failed:",
            manualErr.message
          );
        }

        if (manualMatches && manualMatches.length === 1) {
          const match = manualMatches[0];
          return {
            priceRequestId: match.id,
            supplierId: match.supplier_id || match.id,
            submissionId: match.submission_id,
            matchMethod: "sender_email",
            source: "submission_price_requests",
          };
        }
      }
      // If 0 or >1 matches: ambiguous, don't auto-link
    } catch (err) {
      console.warn("[price-response-detector] Sender email fallback error:", err);
    }
  }

  return null;
}
