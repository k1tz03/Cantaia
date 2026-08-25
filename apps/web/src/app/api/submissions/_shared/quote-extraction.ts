// ============================================================
// Cantaia — Shared supplier-quote extraction pipeline
//
// ONE implementation of "a supplier answered a price request →
// extract the prices", used by:
//   - POST /api/submissions/receive-quote      (manual re-extraction)
//   - the email classification pipeline (L0/L0b auto-reception)
//
// Lives in `_shared/` (not in the route file) because Next.js route
// modules may only export HTTP verbs + route config — an extra
// `processQuoteFromEmail` export fails the route-type validation of
// `next build` (same pattern as `api/pv/_shared/pv-circulation`).
//
// Guarantees:
//   - every email_records read is scoped to the owning organization (H4)
//   - `checkUsageLimit("offer_parse")` runs AFTER the source email/PDF is
//     located and BEFORE any AI call: an unresolvable source returns 404
//     without debiting a single credit
//   - quote writes are idempotent per (request_id, item_id) (migration 103)
//   - the requester is notified ("offer_received") after a successful
//     extraction — best effort, never blocking
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { MODEL_FOR_TASK } from "@cantaia/core/ai";
import { extractSubmissionTrackingCodes } from "@cantaia/core/submissions";
import { notifyUser } from "@cantaia/core/notifications";

/* ═══════════════════════════════════════════════════════════════
   Internal entry point — consumed by the email sync pipeline
   ═══════════════════════════════════════════════════════════════ */

export interface ProcessQuoteResult {
  processed: boolean;
  /** Why nothing was extracted. Absent when `processed` is true. */
  reason?:
    | "email_not_found"
    | "no_tracking_code"
    | "request_not_found"
    | "no_items"
    | "usage_limit"
    | "extraction_failed";
  quotes_extracted?: number;
  tracking_code?: string;
  error?: string;
}

/**
 * Extracts supplier prices from an already-synced email, with no HTTP request
 * and no user session.
 *
 * This is the hook the email sync pipeline calls when it recognises a
 * `SUB-` tracking code (or a sender match): parsing used to require a human to
 * open the submission and press "Extraire les prix", so an offer that arrived
 * overnight sat unparsed until someone noticed it.
 *
 * Ownership is derived from the email itself (email → user → organization) and
 * re-checked against the price request's own organization, so a wrong
 * `emailId` cannot reach another org's data.
 *
 * Never throws: the caller is a sync loop that must not die on one bad email.
 */
export async function processQuoteFromEmail(
  emailId: string,
  options?: {
    admin?: any;
    /** Tracking code already resolved by the caller (skips re-extraction). */
    trackingCode?: string | null;
    /**
     * `submission_price_requests` row already resolved (org-scoped) by the
     * caller — the classification pipeline resolves it for L0/L0b and passes
     * it here so the code is not looked up twice. The anti-IDOR check against
     * the mailbox owner's organization is re-run regardless.
     */
    priceRequest?: any;
  }
): Promise<ProcessQuoteResult> {
  try {
    const admin = options?.admin ?? createAdminClient();

    const { data: email, error: emailError } = await admin
      .from("email_records")
      .select("id, user_id, subject, body_text, body_html, body_preview, has_attachments, outlook_message_id")
      .eq("id", emailId)
      .maybeSingle();

    if (emailError) {
      console.error("[receive-quote/internal] email lookup failed:", emailError.message);
      return { processed: false, reason: "email_not_found", error: emailError.message };
    }
    if (!email?.user_id) return { processed: false, reason: "email_not_found" };

    const { data: owner } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", email.user_id)
      .maybeSingle();

    const orgId: string | null = owner?.organization_id ?? null;
    if (!orgId) return { processed: false, reason: "email_not_found" };

    // ── Tracking code ──
    let trackingCode: string | null = options?.trackingCode ?? null;
    if (!trackingCode) {
      const haystack = [
        email.subject || "",
        email.body_text || "",
        email.body_preview || "",
        email.body_html ? email.body_html.replace(/<[^>]+>/g, " ") : "",
      ].join(" ");
      trackingCode = extractSubmissionTrackingCodes(haystack)[0] ?? null;
    }

    // ── Price request: caller-resolved row, or lookup by tracking code ──
    let priceRequest: any = options?.priceRequest ?? null;
    if (!priceRequest) {
      if (!trackingCode) return { processed: false, reason: "no_tracking_code" };

      const { data: pr, error: prErr } = await admin
        .from("submission_price_requests")
        .select("*, suppliers(company_name)")
        .eq("tracking_code", trackingCode)
        .maybeSingle();
      if (prErr) {
        console.warn("[receive-quote/internal] price request lookup failed:", prErr.message);
      }
      priceRequest = pr ?? null;
    }

    if (!priceRequest) {
      return { processed: false, reason: "request_not_found", tracking_code: trackingCode ?? undefined };
    }

    if (!trackingCode && priceRequest.tracking_code) {
      trackingCode = priceRequest.tracking_code;
    }

    // Anti-IDOR: the request's own organization must match the mailbox owner's.
    // Re-checked even for a caller-resolved request — defense in depth.
    const { data: ownerSubmission } = await admin
      .from("submissions")
      .select("id, projects!submissions_project_id_fkey(organization_id)")
      .eq("id", priceRequest.submission_id)
      .maybeSingle();

    if ((ownerSubmission as any)?.projects?.organization_id !== orgId) {
      return { processed: false, reason: "request_not_found", tracking_code: trackingCode ?? undefined };
    }

    const orgUserIds = await listOrgUserIds(admin, orgId, email.user_id);

    // Metering ("offer_parse", same meter as the interactive route) happens
    // inside runQuoteExtraction, after the sources are located and before any
    // AI call. Insufficient credits → no extraction, no trackApiUsage.
    const outcome = await runQuoteExtraction({
      admin,
      orgId,
      actorUserId: email.user_id,
      orgUserIds,
      priceRequest,
      trackingCode: trackingCode ?? "",
      emailId: email.id,
      // Automatic path: there is no human actor — the mailbox owner must be
      // notified, so no actor suppression here.
      notifyActorId: null,
    });

    if (!outcome.ok) {
      if (outcome.insufficientCredits || outcome.usageLimit) {
        return { processed: false, reason: "usage_limit", tracking_code: trackingCode ?? undefined };
      }
      return {
        processed: false,
        reason: "extraction_failed",
        tracking_code: trackingCode ?? undefined,
        error: outcome.error,
      };
    }

    return {
      processed: true,
      quotes_extracted: outcome.result?.quotes_extracted ?? 0,
      tracking_code: trackingCode ?? undefined,
    };
  } catch (err) {
    console.error("[receive-quote/internal] unexpected error:", err);
    return {
      processed: false,
      reason: "extraction_failed",
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

/* ═══════════════════════════════════════════════════════════════
   Shared extraction pipeline
   ═══════════════════════════════════════════════════════════════ */

/** Every user of the organization — the scope of every email_records read. */
export async function listOrgUserIds(admin: any, orgId: string, fallbackUserId: string): Promise<string[]> {
  const { data } = await admin.from("users").select("id").eq("organization_id", orgId);
  const ids: string[] = (data || []).map((u: any) => u.id);
  return ids.length > 0 ? ids : [fallbackUserId];
}

export interface ExtractionContext {
  admin: any;
  orgId: string;
  /** Whose mailbox/credits the extraction is attributed to. */
  actorUserId: string;
  orgUserIds: string[];
  priceRequest: any;
  trackingCode: string;
  emailBody?: string;
  emailSubject?: string;
  emailId?: string | null;
  pdfAttachments?: Array<{ filename: string; content_base64: string; content_type: string }>;
  /**
   * When set, the "offer received" notification is suppressed for this user
   * (manual extraction — never email someone about their own click). The
   * automatic email path passes null so the mailbox owner IS notified.
   */
  notifyActorId?: string | null;
}

export interface ExtractionOutcome {
  ok: boolean;
  status?: number;
  error?: string;
  /** Set when the org is on credits and the balance cannot cover offer_parse. */
  insufficientCredits?: { required: number; remaining: number };
  /** Set when a legacy-quota org exhausted its monthly allowance. */
  usageLimit?: { current: number; limit: number; requiredPlan: string };
  result?: {
    quotes_extracted: number;
    tracking_code: string;
    supplier?: string;
    response_time_days: number | null;
    pdf_analyzed: number;
    has_conditions: boolean;
  };
}

export async function runQuoteExtraction(ctx: ExtractionContext): Promise<ExtractionOutcome> {
  const { admin, orgId, actorUserId, orgUserIds, priceRequest, trackingCode } = ctx;
  const tracking_code = trackingCode || "";
  const user = { id: actorUserId };

  // Get the requested items
  const requestedItems = (priceRequest.items_requested as any[]) || [];
  if (requestedItems.length === 0) {
    return { ok: false, status: 400, error: "No items in this request" };
  }

  const scopeUserIds = orgUserIds.length > 0 ? orgUserIds : [user.id];
  // The L0 sender-match path can reach this function without a tracking code —
  // an EMPTY code must never widen an ilike to "%%" (which matches everything).
  const sanitizedCode = tracking_code.replace(/[%_,().]/g, "");
  const codeSearchable = sanitizedCode.length >= 8;

  const readEmailById = async (id: string) => {
    const { data: e, error } = await (admin as any)
      .from("email_records")
      .select("id, body_text, body_html, body_preview, subject, has_attachments, user_id")
      .eq("id", id)
      .in("user_id", scopeUserIds)
      .maybeSingle();
    if (error) {
      console.warn("[receive-quote] email lookup failed:", error.message);
      return null;
    }
    return e ?? null;
  };

  const bodyOf = (e: any): string =>
    e.body_text ||
    (e.body_html ? e.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "") ||
    e.body_preview ||
    e.subject ||
    "";

  // ─── Phase 1: Resolve the source email ──────────────────────────
  // Order: explicit emailId → responded_email_id persisted at reception
  // (migration 103) → tracking-code search over the org's mailboxes, extended
  // to the full stored bodies (body_text / body_html), not just the preview.
  // Every lookup is scoped to the organization's user ids (H4).
  let resolvedBody = ctx.emailBody || ctx.emailSubject || "";
  let linkedEmailId: string | null = ctx.emailId || null;

  // An emailId given without a body: read it from the record we already have.
  if ((!resolvedBody || resolvedBody.length < 10) && linkedEmailId) {
    const e = await readEmailById(linkedEmailId);
    if (e) resolvedBody = bodyOf(e);
  }

  // responded_email_id — direct link written when the response was matched.
  if ((!resolvedBody || resolvedBody.length < 10) && !linkedEmailId && priceRequest.responded_email_id) {
    const e = await readEmailById(priceRequest.responded_email_id);
    if (e) {
      linkedEmailId = e.id;
      resolvedBody = bodyOf(e);
    }
  }

  if ((!resolvedBody || resolvedBody.length < 10) && !linkedEmailId && codeSearchable) {
    const { data: linkedEmails, error: searchErr } = await (admin as any)
      .from("email_records")
      .select("id, body_text, body_html, body_preview, subject, has_attachments, user_id")
      .in("user_id", scopeUserIds)
      .or(
        `body_preview.ilike.%${sanitizedCode}%,subject.ilike.%${sanitizedCode}%,body_text.ilike.%${sanitizedCode}%,body_html.ilike.%${sanitizedCode}%`
      )
      .order("received_at", { ascending: false })
      .limit(3);
    if (searchErr) {
      console.warn("[receive-quote] tracking-code email search failed:", searchErr.message);
    }

    if (linkedEmails && linkedEmails.length > 0) {
      const e = linkedEmails[0];
      linkedEmailId = e.id;
      resolvedBody = bodyOf(e);
    }
  }

  // ─── Phase 2: Attachments (PDF + Excel/CSV) ─────────────────────
  let pdfData: Array<{ filename: string; content_base64: string; content_type: string }> =
    ctx.pdfAttachments || [];
  let sheetTexts: Array<{ filename: string; text: string }> = [];

  if (pdfData.length === 0 && linkedEmailId) {
    // Check if email has attachments, then try to fetch them from Graph.
    // Scoped to the caller's organization so an arbitrary email_id from the
    // request body cannot be used to pull another org's attachments.
    const { data: emailRecord, error: attScopeErr } = await (admin as any)
      .from("email_records")
      .select("has_attachments, outlook_message_id, user_id")
      .eq("id", linkedEmailId)
      .in("user_id", scopeUserIds)
      .maybeSingle();
    if (attScopeErr) {
      console.warn("[receive-quote] attachment scope lookup failed:", attScopeErr.message);
    }

    if (emailRecord?.has_attachments && emailRecord?.outlook_message_id && emailRecord?.user_id) {
      try {
        const tokenResult = await getValidMicrosoftToken(emailRecord.user_id);
        if (!("error" in tokenResult)) {
          const attachmentsList = await fetchGraphAttachments(tokenResult.accessToken, emailRecord.outlook_message_id);
          pdfData = attachmentsList.filter(isPdfAttachment);
          sheetTexts = await extractSpreadsheetTexts(attachmentsList);
          console.log(
            `[receive-quote] Found ${pdfData.length} PDF and ${sheetTexts.length} spreadsheet attachment(s) for email ${linkedEmailId}`
          );
        }
      } catch (err) {
        console.warn("[receive-quote] Failed to fetch attachments from Graph (non-fatal):", err);
      }
    }
  } else if (pdfData.length > 0) {
    // Caller-supplied attachments may include spreadsheets too.
    sheetTexts = await extractSpreadsheetTexts(pdfData);
    pdfData = pdfData.filter(isPdfAttachment);
  }

  // ─── Phase 2b: Metering — AFTER source localisation, BEFORE any AI call ───
  // A request whose source cannot be found must not cost credits: the old
  // order debited "offer_parse" and then returned 400.
  const hasBody = resolvedBody.length >= 10;
  if (!hasBody && pdfData.length === 0 && sheetTexts.length === 0) {
    return {
      ok: false,
      status: 404,
      error:
        "Email source introuvable pour cette demande de prix (aucun corps ni pièce jointe exploitable — aucun crédit débité)",
    };
  }

  // A missing API key must also fail BEFORE the meter runs.
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, status: 500, error: "ANTHROPIC_API_KEY not configured" };
  }

  const { data: orgRow, error: orgPlanErr } = await (admin as any)
    .from("organizations")
    .select("subscription_plan")
    .eq("id", orgId)
    .maybeSingle();
  if (orgPlanErr) {
    console.warn("[receive-quote] org plan lookup failed:", orgPlanErr.message);
  }

  const usageCheck = await checkUsageLimit(
    admin,
    orgId,
    orgRow?.subscription_plan || "trial",
    "offer_parse"
  );
  if (!usageCheck.allowed) {
    if (usageCheck.insufficient_credits) {
      return {
        ok: false,
        status: 402,
        error: "insufficient_credits",
        insufficientCredits: {
          required: usageCheck.required_credits ?? 1,
          remaining: usageCheck.remaining_credits ?? 0,
        },
      };
    }
    return {
      ok: false,
      status: 429,
      error: "usage_limit_reached",
      usageLimit: {
        current: usageCheck.current ?? 0,
        limit: usageCheck.limit ?? 0,
        requiredPlan: usageCheck.requiredPlan ?? "pro",
      },
    };
  }

  // ─── Phase 3: Extract prices (email body + spreadsheets + PDF) ──
  const allExtracted: ExtractedPrice[] = [];
  let offerConditions: string | null = null;
  const totalUsage = { inputTokens: 0, outputTokens: 0 };
  let aiCalls = 0;

  // 3a: Extract from email body (if available)
  if (hasBody) {
    const bodyResult = await extractPricesWithRemarks(resolvedBody, requestedItems, "email");
    mergeExtractedPrices(allExtracted, bodyResult.prices);
    addUsage(totalUsage, bodyResult);
    aiCalls += 1;
    if (bodyResult.conditions) offerConditions = bodyResult.conditions;
  }

  // 3b: Extract from spreadsheet attachments (.xlsx/.xls/.csv → CSV text)
  for (const sheet of sheetTexts) {
    try {
      const sheetResult = await extractPricesWithRemarks(sheet.text, requestedItems, sheet.filename);
      addUsage(totalUsage, sheetResult);
      aiCalls += 1;
      // Structured results take priority over email body results
      mergeExtractedPrices(allExtracted, sheetResult.prices);
      if (sheetResult.conditions) offerConditions = sheetResult.conditions;
    } catch (sheetErr) {
      console.error(`[receive-quote] Spreadsheet extraction failed for "${sheet.filename}":`, sheetErr);
    }
  }

  // 3c: Extract from PDF attachments
  for (const pdf of pdfData) {
    try {
      const pdfResult = await extractPricesFromPdfAttachment(pdf, requestedItems);
      addUsage(totalUsage, pdfResult);
      aiCalls += 1;
      // PDF results take priority over email body results (more structured)
      mergeExtractedPrices(allExtracted, pdfResult.prices);
      // PDF conditions take priority
      if (pdfResult.conditions) offerConditions = pdfResult.conditions;
    } catch (pdfErr) {
      console.error(`[receive-quote] PDF extraction failed for "${pdf.filename}":`, pdfErr);
    }
  }

  // One aggregated log row for the whole extraction (body + every attachment).
  if (aiCalls > 0) {
    trackApiUsage({
      supabase: admin,
      userId: user.id,
      organizationId: orgId,
      actionType: "offer_parse",
      apiProvider: "anthropic",
      model: MODEL_FOR_TASK.price_extraction,
      inputTokens: totalUsage.inputTokens,
      outputTokens: totalUsage.outputTokens,
      metadata: {
        tracking_code,
        submission_id: priceRequest.submission_id,
        ai_calls: aiCalls,
        pdf_count: pdfData.length,
        sheet_count: sheetTexts.length,
      },
    }).catch(() => {});
  }

  // ─── Phase 4: Store quotes (idempotent per request_id + item_id) ─
  const quotesToInsert = allExtracted
    .filter((p) => p.unit_price_ht != null)
    .map((p) => ({
      request_id: priceRequest.id,
      submission_id: priceRequest.submission_id,
      item_id: p.item_id,
      unit_price_ht: p.unit_price_ht,
      total_ht: p.total_ht || null,
      currency: "CHF",
      raw_email_id: linkedEmailId || null,
      confidence: p.confidence || 0.8,
      supplier_remarks: p.supplier_remarks || null,
      extracted_at: new Date().toISOString(),
    }));

  if (quotesToInsert.length > 0) {
    // Upsert keyed on (request_id, item_id) — the unique index of migration
    // 103. A re-extraction (manual retry, second email of the same thread)
    // REPLACES the supplier's previous price instead of duplicating the row.
    let writeError: { message: string } | null = null;
    const { error: upsertError } = await (admin as any)
      .from("submission_quotes")
      .upsert(quotesToInsert, { onConflict: "request_id,item_id" });

    if (upsertError) {
      // Pre-103 database: no arbiter index → fall back to the historical
      // append behaviour so the quote is not lost (duplicates possible).
      console.warn(
        "[receive-quote] quote upsert failed (apply migration 103_receive_quote_integrity.sql) — falling back to append:",
        upsertError.message
      );
      const { error: insertError } = await (admin as any)
        .from("submission_quotes")
        .insert(quotesToInsert);
      writeError = insertError ?? null;
    }

    if (writeError) {
      console.error("[receive-quote] Insert error:", writeError);
      return { ok: false, status: 500, error: writeError.message };
    }

    // Update items status to "quoted"
    const quotedItemIds = quotesToInsert.map((q) => q.item_id).filter(Boolean);
    if (quotedItemIds.length > 0) {
      const { error: itemsStatusError } = await (admin as any)
        .from("submission_items")
        .update({ status: "quoted" })
        .in("id", quotedItemIds);
      if (itemsStatusError) {
        console.error("[receive-quote] Failed to flag items as quoted:", itemsStatusError.message);
      }
    }

    // Mark the source email as price_response / price_extracted (org-scoped —
    // H4). Direct id update when the email is known; the ilike sweep is only a
    // fallback and NEVER runs with an empty code (that would match everything).
    if (linkedEmailId) {
      const { error: emailUpdateError } = await (admin as any)
        .from("email_records")
        .update({ email_category: "price_response", price_extracted: true })
        .eq("id", linkedEmailId)
        .in("user_id", scopeUserIds);
      if (emailUpdateError) {
        console.warn("[receive-quote] email_records update failed (non-fatal):", emailUpdateError.message);
      }
    } else if (codeSearchable) {
      const { error: emailUpdateError } = await (admin as any)
        .from("email_records")
        .update({ email_category: "price_response", price_extracted: true })
        .in("user_id", scopeUserIds)
        .or(`body_preview.ilike.%${sanitizedCode}%,subject.ilike.%${sanitizedCode}%`);
      if (emailUpdateError) {
        console.warn("[receive-quote] email_records update failed (non-fatal):", emailUpdateError.message);
      }
    }
  }

  // ─── Phase 5: Update request status + store conditions ──────────
  //
  // C3: `response_received_at` / `response_time_days` live in migration 082.
  // They are written in a SEPARATE statement from status/conditions_text so a
  // database that has not yet applied 082 still records the response instead of
  // losing the whole payload to a rejected UPDATE.
  const responseReceivedAt = new Date().toISOString();
  let responseTimeDays: number | null = null;

  if (priceRequest.sent_at) {
    const sentMs = new Date(priceRequest.sent_at).getTime();
    const receivedMs = new Date(responseReceivedAt).getTime();
    responseTimeDays = Math.round(((receivedMs - sentMs) / (1000 * 60 * 60 * 24)) * 10) / 10;
  }

  // 5a — core state: this MUST succeed
  const coreUpdate: Record<string, unknown> = { status: "responded" };
  if (offerConditions) coreUpdate.conditions_text = offerConditions;

  const { error: statusError } = await (admin as any)
    .from("submission_price_requests")
    .update(coreUpdate)
    .eq("id", priceRequest.id);

  if (statusError) {
    console.error("[receive-quote] Failed to mark request as responded:", statusError.message, statusError.details);
    return {
      ok: false,
      status: 500,
      error: `Prix extraits mais statut non enregistré: ${statusError.message}`,
    };
  }

  // 5b — scoring metrics: degrade gracefully if migration 082 is missing
  const { error: metricsError } = await (admin as any)
    .from("submission_price_requests")
    .update({
      response_received_at: responseReceivedAt,
      response_time_days: responseTimeDays,
    })
    .eq("id", priceRequest.id);

  if (metricsError) {
    console.warn(
      "[receive-quote] response_received_at/response_time_days not persisted " +
      "(apply migration 082_submission_price_requests_response_columns.sql):",
      metricsError.message
    );
  }

  // 5c — remember WHICH email answered (migration 103). Separate statement:
  // a pre-103 database must not lose the status/metrics writes above.
  if (linkedEmailId && priceRequest.responded_email_id !== linkedEmailId) {
    const { error: linkError } = await (admin as any)
      .from("submission_price_requests")
      .update({ responded_email_id: linkedEmailId })
      .eq("id", priceRequest.id);
    if (linkError) {
      console.warn(
        "[receive-quote] responded_email_id not persisted (apply migration 103_receive_quote_integrity.sql):",
        linkError.message
      );
    }
  }

  // Recalculate supplier score after receiving a quote.
  // Manual (non-persisted) suppliers have supplier_id = null — nothing to score.
  if (priceRequest.supplier_id) {
    try {
      const { recalculateAndPersistScore } = await import("@cantaia/core/suppliers");
      const { data: supplierData } = await (admin as any)
        .from("suppliers")
        .select("organization_id")
        .eq("id", priceRequest.supplier_id)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (supplierData?.organization_id) {
        await recalculateAndPersistScore(
          priceRequest.supplier_id,
          supplierData.organization_id,
          admin
        );
      }
    } catch (scoreErr) {
      console.warn("[receive-quote] Score recalculation failed (non-fatal):", scoreErr);
    }
  }

  // "Offre reçue" notification to whoever sent the request — best effort,
  // never blocks the extraction result. Suppressed when the recipient IS the
  // actor (manual re-extraction: never email someone about their own click).
  try {
    await notifyOfferReceivedByEmail({
      admin,
      priceRequest,
      quoteCount: quotesToInsert.length,
      actorId: ctx.notifyActorId ?? null,
    });
  } catch (notifyErr) {
    console.warn("[receive-quote] offer_received notification failed (non-fatal):", notifyErr);
  }

  return {
    ok: true,
    result: {
      quotes_extracted: quotesToInsert.length,
      tracking_code,
      supplier: (priceRequest as any).suppliers?.company_name,
      response_time_days: responseTimeDays,
      pdf_analyzed: pdfData.length,
      has_conditions: !!offerConditions,
    },
  };
}

/* ═══════════════════════════════════════════════════════════════
   Notification
   ═══════════════════════════════════════════════════════════════ */

/**
 * Emails the requester that a supplier's offer just arrived by email.
 * Recipient resolution (same chain as the supplier portal):
 * `submission_price_requests.sent_by` (migration 104) → `submissions.user_id`
 * → `projects.created_by`. Every step tolerates an older schema — a failed
 * lookup falls through, it never throws to the caller.
 */
async function notifyOfferReceivedByEmail(params: {
  admin: any;
  priceRequest: any;
  quoteCount: number;
  actorId: string | null;
}): Promise<void> {
  const { admin, priceRequest, quoteCount, actorId } = params;

  let recipientId: string | null = priceRequest.sent_by ?? null;

  if (!recipientId) {
    // The row may have been selected without `sent_by` (pipeline selectCols),
    // and the column itself only exists from migration 104 on.
    const { error: sentByErr, data: prRow } = await (admin as any)
      .from("submission_price_requests")
      .select("sent_by")
      .eq("id", priceRequest.id)
      .maybeSingle();
    if (sentByErr) {
      console.warn(
        "[receive-quote] sent_by lookup skipped (apply migration 104_followup_redetection_and_sent_by.sql):",
        sentByErr.message
      );
    } else {
      recipientId = prRow?.sent_by ?? null;
    }
  }

  let projectName = "";
  const { data: sub, error: subErr } = await (admin as any)
    .from("submissions")
    .select("user_id, projects!submissions_project_id_fkey(name, created_by)")
    .eq("id", priceRequest.submission_id)
    .maybeSingle();
  if (subErr) {
    console.warn("[receive-quote] submission lookup for notification failed:", subErr.message);
  } else {
    projectName = (sub as any)?.projects?.name || "";
    if (!recipientId) {
      recipientId = (sub as any)?.user_id ?? (sub as any)?.projects?.created_by ?? null;
    }
  }

  if (!recipientId) return;

  const supplierName: string =
    priceRequest.suppliers?.company_name || priceRequest.supplier_email_manual || "Un fournisseur";
  const materialGroup: string = priceRequest.material_group || "Divers";
  const extractedLine =
    quoteCount > 0
      ? `${quoteCount} prix extrait${quoteCount > 1 ? "s" : ""} automatiquement.`
      : "Aucun prix n'a pu être extrait automatiquement — ouvrez l'email pour vérifier l'offre.";

  await notifyUser(admin, {
    userId: recipientId,
    actorId: actorId ?? undefined,
    event: "offer_received",
    subject: `Offre reçue — ${supplierName} (${materialGroup})`,
    title: "Nouvelle offre fournisseur",
    body:
      `${supplierName} a répondu par email à la demande de prix « ${materialGroup} »` +
      `${projectName ? ` du projet ${projectName}` : ""}. ${extractedLine}`,
    ctaLabel: "Voir la comparaison",
    ctaPath: `/submissions/${priceRequest.submission_id}`,
  });
}

/* ═══════════════════════════════════════════════════════════════
   Prompting
   ═══════════════════════════════════════════════════════════════ */

/**
 * Replaces the former assistant prefill (`{ role: "assistant", content: "{" }`).
 * Prefilling the assistant turn is rejected by some model/endpoint combinations
 * (400) and makes the raw response un-parseable on its own; a system instruction
 * plus the tolerant parser below achieves the same JSON-only output.
 */
const JSON_ONLY_SYSTEM =
  "Réponds UNIQUEMENT avec le JSON demandé, sans texte avant ou après, " +
  "sans bloc de code markdown et sans commentaire.";

/* ═══════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════ */

interface ExtractedPrice {
  item_id: string;
  item_number?: string;
  unit_price_ht: number;
  total_ht?: number | null;
  confidence: number;
  supplier_remarks?: string | null;
}

interface ExtractionResult {
  prices: ExtractedPrice[];
  conditions: string | null;
  /**
   * Tokens the Claude call consumed. Reported back so the caller can
   * write ONE aggregated `offer_parse` row to api_usage_logs — this pipeline
   * used to run up to N+1 Sonnet calls (email body + one per PDF) without
   * tracing a single one of them.
   */
  usage?: { inputTokens: number; outputTokens: number };
}

/** Sums the usage of several extraction passes. */
function addUsage(
  total: { inputTokens: number; outputTokens: number },
  result: ExtractionResult
): void {
  total.inputTokens += result.usage?.inputTokens || 0;
  total.outputTokens += result.usage?.outputTokens || 0;
}

/**
 * Merge one extraction pass into the accumulated list. Later passes REPLACE
 * earlier prices for the same item (attachments are more structured than the
 * email body, so 3a < 3b < 3c in priority).
 */
function mergeExtractedPrices(target: ExtractedPrice[], incoming: ExtractedPrice[]): void {
  for (const price of incoming || []) {
    if (!price?.item_id) continue;
    const idx = target.findIndex((p) => p.item_id === price.item_id);
    if (idx >= 0) target[idx] = price;
    else target.push(price);
  }
}

/* ═══════════════════════════════════════════════════════════════
   Attachments
   ═══════════════════════════════════════════════════════════════ */

interface RawAttachment {
  filename: string;
  content_base64: string;
  content_type: string;
}

function isPdfAttachment(att: RawAttachment): boolean {
  const name = (att.filename || "").toLowerCase();
  const type = (att.content_type || "").toLowerCase();
  return type.includes("pdf") || name.endsWith(".pdf");
}

function spreadsheetKind(att: RawAttachment): "csv" | "excel" | null {
  const name = (att.filename || "").toLowerCase();
  const type = (att.content_type || "").toLowerCase();
  if (name.endsWith(".csv") || type.includes("text/csv")) return "csv";
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    type.includes("spreadsheetml") ||
    type.includes("ms-excel")
  ) {
    return "excel";
  }
  return null;
}

/** Cap per attachment — keeps one spreadsheet from blowing the prompt. */
const SPREADSHEET_TEXT_CAP = 20_000;

/**
 * Converts .csv / .xlsx / .xls attachments to CSV text for the extraction
 * prompt. Excel files go through the repo's `xlsx` dependency; a corrupt or
 * unreadable file is skipped with a warning (never fatal).
 */
async function extractSpreadsheetTexts(
  attachments: RawAttachment[]
): Promise<Array<{ filename: string; text: string }>> {
  const out: Array<{ filename: string; text: string }> = [];

  for (const att of attachments || []) {
    const kind = spreadsheetKind(att);
    if (!kind) continue;

    try {
      let text = "";
      if (kind === "csv") {
        text = Buffer.from(att.content_base64, "base64").toString("utf8");
      } else {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(Buffer.from(att.content_base64, "base64"), { type: "buffer" });
        text = workbook.SheetNames.map(
          (sheetName: string) => `## ${sheetName}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName])}`
        ).join("\n\n");
      }
      text = text.trim();
      if (text) {
        out.push({ filename: att.filename || "attachment", text: text.slice(0, SPREADSHEET_TEXT_CAP) });
      }
    } catch (err) {
      console.warn(`[receive-quote] Spreadsheet parsing failed for "${att.filename}" (skipped):`, err);
    }
  }

  return out;
}

/* ═══════════════════════════════════════════════════════════════
   Graph API: Fetch email attachments
   ═══════════════════════════════════════════════════════════════ */

async function fetchGraphAttachments(
  accessToken: string,
  outlookMessageId: string
): Promise<RawAttachment[]> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${outlookMessageId}/attachments`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Graph API error ${res.status}`);
  }

  const data = await res.json();
  const attachments: RawAttachment[] = [];

  for (const att of data.value || []) {
    if (att["@odata.type"] === "#microsoft.graph.fileAttachment" && att.contentBytes) {
      attachments.push({
        filename: att.name || "attachment",
        content_base64: att.contentBytes,
        content_type: att.contentType || "application/octet-stream",
      });
    }
  }

  return attachments;
}

/* ═══════════════════════════════════════════════════════════════
   AI: Extract prices + remarks from email body / spreadsheet text
   ═══════════════════════════════════════════════════════════════ */

async function extractPricesWithRemarks(
  emailContent: string,
  requestedItems: any[],
  source: string
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const itemsList = requestedItems
    .map((i: any) => `- ID: ${i.id} | N°${i.item_number} | ${i.description} | ${i.unit} | Qte: ${i.quantity}`)
    .join("\n");

  const prompt = `Tu es un expert en extraction de prix de construction suisse.

Voici un email de reponse d'un fournisseur. Extrais les prix unitaires HT pour chaque poste demande.
IMPORTANT : extrais aussi les REMARQUES du fournisseur par poste (variantes proposees, conditions particulieres, delais, annotations) et les CONDITIONS GENERALES de l'offre.

## Postes demandes :
${itemsList}

## Email du fournisseur :
${emailContent.slice(0, 15000)}

## Format de sortie (JSON strict) :
{
  "prices": [
    {
      "item_id": "UUID du poste",
      "item_number": "numero du poste",
      "unit_price_ht": number,
      "total_ht": number | null,
      "confidence": number (0-1),
      "supplier_remarks": "remarque du fournisseur pour ce poste (variante, condition, delai) ou null"
    }
  ],
  "conditions": "Conditions generales de l'offre (paiement, validite, livraison, remise, TVA) ou null"
}

REGLES :
1. Si tu ne trouves pas de prix pour un poste, omets-le de la liste
2. supplier_remarks = null si aucune remarque specifique pour ce poste
3. conditions = null si aucune condition generale mentionnee
4. Ne pas inventer de prix — monnaie par defaut : CHF`;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, timeout: 60_000 });

  // No assistant prefill: JSON-only output is requested via the system prompt and
  // the response is fed to the tolerant parser below.
  const response = await client.messages.create({
    model: MODEL_FOR_TASK.price_extraction,
    max_tokens: 4096,
    system: JSON_ONLY_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const usage = {
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };

  const text = response.content.find((c: any) => c.type === "text");
  if (!text || text.type !== "text") return { prices: [], conditions: null, usage };

  try {
    return { ...parseExtractionResult(text.text), usage };
  } catch {
    console.warn(`[receive-quote] Failed to parse AI response from ${source}`);
    return { prices: [], conditions: null, usage };
  }
}

/* ═══════════════════════════════════════════════════════════════
   AI: Extract prices + remarks from PDF attachment
   ═══════════════════════════════════════════════════════════════ */

async function extractPricesFromPdfAttachment(
  pdf: RawAttachment,
  requestedItems: any[]
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const itemsList = requestedItems
    .map((i: any) => `- ID: ${i.id} | N°${i.item_number} | ${i.description} | ${i.unit} | Qte: ${i.quantity}`)
    .join("\n");

  const prompt = `Tu es un expert en analyse d'offres de prix pour la construction en Suisse.

Ce document PDF est une reponse a une demande de prix. Analyse-le et extrais :
1. Les PRIX UNITAIRES HT pour chaque poste demande
2. Les REMARQUES par poste (variantes proposees, conditions, delais, produit alternatif)
3. Les CONDITIONS GENERALES de l'offre (paiement, validite, livraison, remise, TVA)

## Postes demandes :
${itemsList}

## Format de sortie (JSON strict) :
{
  "prices": [
    {
      "item_id": "UUID du poste matche",
      "item_number": "numero du poste",
      "unit_price_ht": number,
      "total_ht": number | null,
      "confidence": number (0-1),
      "supplier_remarks": "remarque/variante/condition pour ce poste ou null"
    }
  ],
  "conditions": "Conditions generales extraites du document (paiement, validite, livraison, TVA, etc.) ou null"
}

REGLES :
1. Matche chaque ligne du PDF avec les postes demandes par numero, description ou CFC
2. Si le fournisseur propose une variante ou un produit alternatif, note-le dans supplier_remarks
3. Si un poste n'a pas de prix identifiable, omets-le
4. conditions = texte synthetise des conditions generales du document
5. Ne pas inventer de prix — monnaie par defaut : CHF`;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, timeout: 90_000 });

  // No assistant prefill — see JSON_ONLY_SYSTEM.
  const response = await client.messages.create({
    model: MODEL_FOR_TASK.price_extraction,
    max_tokens: 8192,
    system: JSON_ONLY_SYSTEM,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf" as const,
            data: pdf.content_base64,
          },
        },
        { type: "text", text: prompt },
      ],
    }],
  });

  const usage = {
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };

  const text = response.content.find((c: any) => c.type === "text");
  if (!text || text.type !== "text") return { prices: [], conditions: null, usage };

  try {
    return { ...parseExtractionResult(text.text), usage };
  } catch {
    console.warn(`[receive-quote] Failed to parse PDF AI response for "${pdf.filename}"`);
    return { prices: [], conditions: null, usage };
  }
}

/* ═══════════════════════════════════════════════════════════════
   JSON parsing helpers
   ═══════════════════════════════════════════════════════════════ */

function parseExtractionResult(rawJson: string): ExtractionResult {
  // Strip markdown fences and any preamble/epilogue the model may add now that
  // the assistant prefill no longer forces a bare "{" start.
  let cleaned = rawJson
    .replace(/```(?:json)?/gi, "")
    .replace(/,\s*([\]}])/g, "$1")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace > 0) {
    cleaned = lastBrace > firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned.slice(firstBrace);
  }

  // Try direct parse
  try {
    const parsed = JSON.parse(cleaned);
    return normalizeResult(parsed);
  } catch { /* continue */ }

  // Try fixing truncated JSON
  let fixed = cleaned;
  if (!fixed.endsWith("}")) fixed += "}";
  if (!fixed.includes("]}")) fixed = fixed.replace(/\]?\s*\}?\s*$/, "]}");
  try {
    const parsed = JSON.parse(fixed);
    return normalizeResult(parsed);
  } catch { /* continue */ }

  // Regex fallback: extract individual price objects
  const prices: ExtractedPrice[] = [];
  const regex = /\{[^{}]*"item_id"\s*:\s*"[^"]*"[^{}]*\}/g;
  let match;
  while ((match = regex.exec(rawJson)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.item_id && obj.unit_price_ht != null) {
        prices.push(obj);
      }
    } catch { /* skip */ }
  }

  // Try to extract conditions
  let conditions: string | null = null;
  const condMatch = rawJson.match(/"conditions"\s*:\s*"([^"]+)"/);
  if (condMatch) conditions = condMatch[1];

  return { prices, conditions };
}

function normalizeResult(parsed: any): ExtractionResult {
  // Handle both formats: { prices: [...] } and [...] (old format)
  if (Array.isArray(parsed)) {
    return { prices: parsed.filter(p => p.item_id && p.unit_price_ht != null), conditions: null };
  }
  return {
    prices: (parsed.prices || parsed.extracted || []).filter((p: any) => p.item_id && p.unit_price_ht != null),
    conditions: parsed.conditions || null,
  };
}
