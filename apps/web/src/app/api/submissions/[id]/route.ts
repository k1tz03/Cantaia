import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoCalibrate } from "@cantaia/core/plans/estimation/auto-calibration";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  buildAwardEmail,
  buildRejectionEmail,
  normalizeSupplierLanguage,
} from "@cantaia/core/submissions";
import { buildPurchaseOrderPdf } from "@/lib/submissions/purchase-order";

// GET — fetch submission detail with items, price requests, and quotes
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Verify user's organization
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    // M1: a user without an organization can never own a submission
    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: submission, error } = await (admin as any)
      .from("submissions")
      .select("*, projects!submissions_project_id_fkey(id, name, code, color, client_name, city, address, organization_id)")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[submissions] GET error:", error);
      return NextResponse.json({ error: "Submission not found", detail: error.message }, { status: 404 });
    }
    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // M1: org check is now UNCONDITIONAL — a submission with no project (or whose
    // project belongs to another org) is never readable. Previously the check was
    // skipped whenever `projects` was null, exposing orphan submissions cross-org.
    const proj = (submission as any).projects;
    if (!proj || proj.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Fetch items (cast: migration 049 tables not in TS types)
    const { data: items } = await (admin as any)
      .from("submission_items")
      .select("*")
      .eq("submission_id", id)
      .order("item_number", { ascending: true });

    // Fetch price requests (no FK join — submission_price_requests has no FK to suppliers)
    const { data: rawPriceRequests, error: prError } = await (admin as any)
      .from("submission_price_requests")
      .select("*")
      .eq("submission_id", id)
      .order("created_at", { ascending: false });

    if (prError) {
      console.error("[submissions] Price requests query error:", prError.message, prError.details);
    }

    // Fetch supplier info separately for non-manual suppliers
    const supplierIds = (rawPriceRequests || [])
      .map((pr: any) => pr.supplier_id)
      .filter((sid: string | null) => sid != null);
    let supplierMap: Record<string, any> = {};
    if (supplierIds.length > 0) {
      const { data: suppliers } = await admin
        .from("suppliers")
        .select("id, company_name, contact_name, email")
        .in("id", supplierIds);
      for (const s of suppliers || []) {
        supplierMap[s.id] = s;
      }
    }

    // Attach supplier info to each price request
    const priceRequests = (rawPriceRequests || []).map((pr: any) => {
      if (pr.supplier_id && supplierMap[pr.supplier_id]) {
        return { ...pr, suppliers: supplierMap[pr.supplier_id] };
      }
      if (pr.supplier_name_manual || pr.supplier_email_manual) {
        return {
          ...pr,
          suppliers: {
            id: pr.id,
            company_name: pr.supplier_name_manual || "Fournisseur manuel",
            contact_name: null,
            email: pr.supplier_email_manual || null,
          },
        };
      }
      return { ...pr, suppliers: null };
    });

    // Fetch quotes
    const { data: quotes, error: qError } = await (admin as any)
      .from("submission_quotes")
      .select("*")
      .eq("submission_id", id)
      .order("created_at", { ascending: false });

    if (qError) {
      console.error("[submissions] Quotes query error:", qError.message, qError.details);
    }

    return NextResponse.json({
      success: true,
      submission,
      items: items || [],
      priceRequests: priceRequests || [],
      quotes: quotes || [],
    });
  } catch (err: any) {
    console.error("[submissions/[id]] GET error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH — update submission items (DB persistence for editor)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: submission } = await admin
      .from("submissions")
      .select("id, project_id, projects!inner(organization_id)")
      .eq("id", id)
      .maybeSingle();

    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const projectOrg = (submission as any).projects?.organization_id;
    if (projectOrg !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();

    // ── Set analysis status (used by Managed Agent flow) ────
    if (body.action === "set-analysis-status") {
      const { analysis_status, analysis_error } = body;
      const VALID_STATUSES = ["pending", "analyzing", "done", "error"];
      if (!analysis_status || !VALID_STATUSES.includes(analysis_status)) {
        return NextResponse.json({ error: "Invalid analysis_status" }, { status: 400 });
      }
      await (admin as any)
        .from("submissions")
        .update({
          analysis_status,
          analysis_error: analysis_error || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      return NextResponse.json({ success: true, analysis_status });
    }

    // ── Award action (per material_group / lot) ──────────────
    //
    // Contract:
    //   budget_estimate.awarded_request_ids =
    //     { [material_group]: { request_id, amount_ht, awarded_at } }
    //   budget_estimate.awarded_request_id stays written (legacy readers) and
    //   always points at the LAST awarded request.
    //
    // A lot already awarded → 409, unless body.re_award === true, in which case
    // the previous award's booked cost is decremented first, then re-awarded.
    //
    // Options (all opt-in, all reported back in the response):
    //   notify_awarded        → confirmation email + purchase order PDF attached
    //   notify_rejected       → polite rejection to the other suppliers of the
    //                           SAME lot who quoted (never the other lots)
    //   update_purchase_costs → projects.purchase_costs += awarded total
    if (body.action === "award") {
      const { price_request_id } = body;
      if (!price_request_id) {
        return NextResponse.json({ error: "price_request_id is required" }, { status: 400 });
      }

      // Verify the price request belongs to this submission
      const { data: priceRequest } = await (admin as any)
        .from("submission_price_requests")
        .select("id, submission_id, supplier_id, material_group, status, suppliers(company_name)")
        .eq("id", price_request_id)
        .eq("submission_id", id)
        .maybeSingle();

      if (!priceRequest) {
        return NextResponse.json({ error: "Price request not found for this submission" }, { status: 404 });
      }

      // Only a request that actually got an answer can be awarded.
      if (priceRequest.status !== "responded") {
        return NextResponse.json(
          {
            error: "invalid_status",
            message: "Seule une demande avec réponse peut être adjugée",
            status: priceRequest.status,
          },
          { status: 400 }
        );
      }

      const materialGroup: string = priceRequest.material_group || "";

      const { data: currentSub } = await (admin as any)
        .from("submissions")
        .select("budget_estimate, project_id")
        .eq("id", id)
        .maybeSingle();

      const budget: Record<string, any> = { ...(currentSub?.budget_estimate || {}) };
      const awardedMap: Record<
        string,
        { request_id: string; amount_ht: number | null; awarded_at: string }
      > = { ...(budget.awarded_request_ids || {}) };

      const orgId = userProfile.organization_id;
      const projectId = currentSub?.project_id;

      const existingAward = awardedMap[materialGroup];
      const isReAward = body.re_award === true;

      if (existingAward && !isReAward) {
        return NextResponse.json(
          {
            error: "already_awarded",
            message: `Le lot « ${materialGroup || "Divers"} » est déjà adjugé`,
            material_group: materialGroup,
            awarded_request_id: existingAward.request_id,
          },
          { status: 409 }
        );
      }

      // Re-award: unwind the previous award before booking the new one.
      if (existingAward && isReAward) {
        const prevAmount = Number(existingAward.amount_ht);
        if (projectId && Number.isFinite(prevAmount) && prevAmount > 0) {
          const unbook = await adjustPurchaseCost(admin, projectId, -prevAmount);
          if (!unbook.updated) {
            console.warn("[submissions/award] previous cost not unbooked:", unbook.error);
          }
        }
        // Reopen the previously awarded request (best effort — column from 099).
        if (existingAward.request_id && existingAward.request_id !== price_request_id) {
          const { error: reopenError } = await (admin as any)
            .from("submission_price_requests")
            .update({ award_outcome: null, award_notified_at: null })
            .eq("id", existingAward.request_id)
            .eq("submission_id", id);
          if (reopenError) {
            console.warn("[submissions/award] previous award_outcome not cleared:", reopenError.message);
          }
        }
      }

      // The purchase order is built BEFORE the award is written: its total is
      // what the award map records (and what unaward / re-award decrements).
      const wantOrder = body.notify_awarded !== false;
      let order = null;
      try {
        order = await buildPurchaseOrderPdf(admin, id, price_request_id, orgId);
      } catch (err) {
        console.error("[submissions/award] purchase order generation failed:", err);
      }

      const nowIso = new Date().toISOString();
      awardedMap[materialGroup] = {
        request_id: price_request_id,
        amount_ht: order?.totalHt ?? null,
        awarded_at: nowIso,
      };

      const updatedBudgetEstimate = {
        ...budget,
        awarded_request_ids: awardedMap,
        // Legacy readers: last awarded request.
        awarded_request_id: price_request_id,
        awarded_at: nowIso,
      };

      const { error: awardWriteError } = await (admin as any)
        .from("submissions")
        .update({
          budget_estimate: updatedBudgetEstimate,
          updated_at: nowIso,
        })
        .eq("id", id);

      if (awardWriteError) {
        console.error("[submissions/award] budget_estimate update failed:", awardWriteError.message);
        return NextResponse.json({ error: awardWriteError.message }, { status: 500 });
      }

      // Fire-and-forget auto-calibration (non-blocking).
      // `auto_calibration_started` tells the client whether it still needs to call
      // POST /api/plans/auto-calibrate itself — without it the UI would double-fire
      // and insert duplicate price_calibrations rows.
      let autoCalibrationStarted = false;
      if (projectId) {
        autoCalibrationStarted = true;
        autoCalibrate({
          supabase: admin,
          org_id: orgId,
          submission_id: id,
          offer_id: price_request_id,
          project_id: projectId,
        }).catch((err: unknown) => {
          console.error("[submissions/award] auto-calibration error:", err);
        });
      } else {
        console.warn("[submissions/award] no project_id — skipping plan auto-calibration");
      }

      // Fire-and-forget: compare budget_estimate vs awarded offer prices for per-item calibration
      calibrateBudgetVsActual(admin, orgId, id, price_request_id).catch((err: unknown) => {
        console.error("[submissions/award] budget-vs-actual calibration error:", err);
      });

      // ── Supplier notifications ─────────────────────────────
      // Best-effort: the award itself is already recorded, and a mail failure
      // must not roll it back or 500 the request.
      const notifications = await notifyAwardOutcome({
        admin,
        userId: user.id,
        organizationId: orgId,
        submissionId: id,
        awardedRequestId: price_request_id,
        materialGroup: priceRequest.material_group ?? null,
        order,
        notifyAwarded: !!body.notify_awarded,
        notifyRejected: !!body.notify_rejected,
      });

      // ── Book the purchase cost on the project ──────────────
      let purchaseCosts: { updated: boolean; total?: number; error?: string } = { updated: false };
      if (body.update_purchase_costs && projectId && order) {
        purchaseCosts = await addPurchaseCost(admin, projectId, order.totalHt);
      } else if (body.update_purchase_costs && !order) {
        purchaseCosts = { updated: false, error: "Bon de commande indisponible" };
      }

      return NextResponse.json({
        success: true,
        awarded_request_id: price_request_id,
        material_group: materialGroup,
        awarded_request_ids: awardedMap,
        re_award: !!(existingAward && isReAward),
        auto_calibration_started: autoCalibrationStarted,
        order_reference: order?.reference ?? null,
        order_total_ht: order?.totalHt ?? null,
        notifications,
        purchase_costs: purchaseCosts,
        ...(wantOrder && !order
          ? { warning: "Bon de commande non généré (aucun prix extrait pour ce fournisseur)" }
          : {}),
      });
    }

    // ── Unaward action ───────────────────────────────────────
    //
    // { action: "unaward", price_request_id } — removes the lot's entry from
    // budget_estimate.awarded_request_ids, unbooks the recorded amount from
    // projects.purchase_costs, and reopens the request (award_outcome = null).
    // Sends NO email whatsoever.
    if (body.action === "unaward") {
      const { price_request_id } = body;
      if (!price_request_id) {
        return NextResponse.json({ error: "price_request_id is required" }, { status: 400 });
      }

      const { data: priceRequest } = await (admin as any)
        .from("submission_price_requests")
        .select("id, submission_id, material_group")
        .eq("id", price_request_id)
        .eq("submission_id", id)
        .maybeSingle();

      if (!priceRequest) {
        return NextResponse.json({ error: "Price request not found for this submission" }, { status: 404 });
      }

      const { data: currentSub } = await (admin as any)
        .from("submissions")
        .select("budget_estimate, project_id")
        .eq("id", id)
        .maybeSingle();

      const budget: Record<string, any> = { ...(currentSub?.budget_estimate || {}) };
      const awardedMap: Record<
        string,
        { request_id: string; amount_ht: number | null; awarded_at: string }
      > = { ...(budget.awarded_request_ids || {}) };

      const entryKey = Object.keys(awardedMap).find(
        (k) => awardedMap[k]?.request_id === price_request_id
      );
      const legacyMatches = budget.awarded_request_id === price_request_id;

      if (!entryKey && !legacyMatches) {
        return NextResponse.json(
          { error: "not_awarded", message: "Cette demande n'est pas adjugée" },
          { status: 400 }
        );
      }

      let removedAmount: number | null = null;
      if (entryKey) {
        const prev = Number(awardedMap[entryKey]?.amount_ht);
        removedAmount = Number.isFinite(prev) ? prev : null;
        delete awardedMap[entryKey];
      }

      // Legacy pointer follows the last remaining award (or clears entirely).
      const remaining = Object.values(awardedMap).filter(Boolean);
      remaining.sort((a, b) =>
        String(a?.awarded_at || "").localeCompare(String(b?.awarded_at || ""))
      );
      const last = remaining[remaining.length - 1] || null;

      const updatedBudgetEstimate = {
        ...budget,
        awarded_request_ids: awardedMap,
        awarded_request_id: last?.request_id ?? null,
        awarded_at: last?.awarded_at ?? null,
      };

      const { error: writeError } = await (admin as any)
        .from("submissions")
        .update({
          budget_estimate: updatedBudgetEstimate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (writeError) {
        console.error("[submissions/unaward] budget_estimate update failed:", writeError.message);
        return NextResponse.json({ error: writeError.message }, { status: 500 });
      }

      // Unbook the recorded cost (only what the award map actually recorded).
      let purchaseCosts: { updated: boolean; total?: number; error?: string } = { updated: false };
      if (currentSub?.project_id && removedAmount != null && removedAmount > 0) {
        purchaseCosts = await adjustPurchaseCost(admin, currentSub.project_id, -removedAmount);
      }

      // Reopen the request — best effort (columns from migration 099).
      const { error: reopenError } = await (admin as any)
        .from("submission_price_requests")
        .update({ award_outcome: null, award_notified_at: null })
        .eq("id", price_request_id);
      if (reopenError) {
        console.warn("[submissions/unaward] award_outcome not cleared:", reopenError.message);
      }

      return NextResponse.json({
        success: true,
        unawarded_request_id: price_request_id,
        material_group: priceRequest.material_group || "",
        awarded_request_ids: awardedMap,
        purchase_costs: purchaseCosts,
      });
    }

    // ── M2: bulk item replacement is retired ──────────────────────────────
    //
    // The old implementation deleted every submission_item and re-inserted the
    // payload, which minted fresh UUIDs. `submission_quotes.item_id` and
    // `submission_price_requests.items_requested[].id` still pointed at the
    // deleted rows, so every received offer became an orphan and the comparison
    // table silently emptied itself.
    //
    // Decision: REFUSE (410) rather than upsert. The only caller was the legacy
    // submission editor, since deleted (replaced by the analyze pipeline +
    // PriceRequestV2). Failing loudly is preferable to silently orphaning quotes
    // if such an editor is ever rebuilt — whoever rebuilds it must implement an
    // id-preserving upsert first.
    if ("items" in body) {
      return NextResponse.json(
        {
          error:
            "Item bulk-replace is no longer supported: it orphaned submission_quotes " +
            "by reassigning item ids. Re-run the analysis, or implement an " +
            "id-preserving upsert before re-enabling this endpoint.",
        },
        { status: 410 }
      );
    }

    return NextResponse.json({ error: "Unsupported PATCH action" }, { status: 400 });
  } catch (err: any) {
    console.error("[submissions/[id]] PATCH error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE — delete submission and all related data
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Verify user's organization
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    // M1: no organization → never allowed to delete anything
    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Delete file from storage — handle both schema versions
    const { data: submission } = await (admin as any)
      .from("submissions")
      .select("*, projects!submissions_project_id_fkey(organization_id)")
      .eq("id", id)
      .maybeSingle();

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // M1: unconditional org check — an orphan submission (no project) is not deletable
    const proj = (submission as any).projects;
    if (!proj || proj.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const storedFileUrl = submission?.file_url || submission?.source_file_url;
    if (storedFileUrl) {
      await admin.storage.from("submissions").remove([storedFileUrl]);
    }

    // Cascade delete handles items, requests, quotes
    const { error } = await (admin as any).from("submissions").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[submissions/[id]] DELETE error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ============================================================================
/* ═══════════════════════════════════════════════════════════════
   Award side effects
   ═══════════════════════════════════════════════════════════════ */

interface AwardNotificationReport {
  awarded: { attempted: boolean; sent: boolean; error?: string };
  rejected: { attempted: number; sent: number; errors: string[] };
}

/** Sends one HTML mail from the user's own Microsoft mailbox. */
async function sendSupplierMail(
  accessToken: string,
  from: string | undefined,
  to: string,
  subject: string,
  html: string,
  attachment?: { filename: string; contentBase64: string }
): Promise<void> {
  const message: Record<string, unknown> = {
    subject,
    body: { contentType: "HTML", content: html },
    toRecipients: [{ emailAddress: { address: to } }],
    ...(from ? { from: { emailAddress: { address: from } } } : {}),
  };

  if (attachment) {
    message.attachments = [
      {
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: attachment.filename,
        contentType: "application/pdf",
        contentBytes: attachment.contentBase64,
      },
    ];
  }

  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (!res.ok) {
    throw new Error(`Graph API error ${res.status}: ${await res.text()}`);
  }
}

/**
 * Confirmation to the retained supplier (with the order attached) and a
 * rejection to everyone else who took the time to quote. Both are opt-in
 * checkboxes on the award dialog, and both are best-effort.
 */
async function notifyAwardOutcome(opts: {
  admin: any;
  userId: string;
  organizationId: string;
  submissionId: string;
  awardedRequestId: string;
  /** Lot of the awarded request — rejections only ever go to the SAME lot. */
  materialGroup: string | null;
  order: Awaited<ReturnType<typeof buildPurchaseOrderPdf>>;
  notifyAwarded: boolean;
  notifyRejected: boolean;
}): Promise<AwardNotificationReport> {
  const report: AwardNotificationReport = {
    awarded: { attempted: opts.notifyAwarded, sent: false },
    rejected: { attempted: 0, sent: 0, errors: [] },
  };

  if (!opts.notifyAwarded && !opts.notifyRejected) return report;

  const tokenResult = await getValidMicrosoftToken(opts.userId);
  if ("error" in tokenResult) {
    const message = "Microsoft non connecté — aucun email envoyé";
    if (opts.notifyAwarded) report.awarded.error = message;
    if (opts.notifyRejected) report.rejected.errors.push(message);
    return report;
  }

  const { data: sender } = await opts.admin
    .from("users")
    .select("first_name, last_name, email, job_title, email_signature")
    .eq("id", opts.userId)
    .maybeSingle();

  const { data: org } = await opts.admin
    .from("organizations")
    .select("name")
    .eq("id", opts.organizationId)
    .maybeSingle();

  const signature = {
    senderName: `${sender?.first_name || ""} ${sender?.last_name || ""}`.trim(),
    senderTitle: sender?.job_title || null,
    senderCompany: org?.name || "",
    emailSignature: sender?.email_signature || null,
  };

  const stamp = async (requestId: string, outcome: "awarded" | "rejected") => {
    const { error } = await opts.admin
      .from("submission_price_requests")
      .update({ award_notified_at: new Date().toISOString(), award_outcome: outcome })
      .eq("id", requestId);
    if (error) {
      console.warn(
        "[submissions/award] award_outcome not persisted (apply migration 099):",
        error.message
      );
    }
  };

  // ── 1. The winner ──
  if (opts.notifyAwarded) {
    if (!opts.order?.supplierEmail) {
      report.awarded.error = "Le fournisseur retenu n'a pas d'adresse email";
    } else {
      try {
        const { subject, html } = buildAwardEmail({
          contactName: opts.order.supplierContact,
          projectName: opts.order.projectName,
          materialGroup: opts.order.materialGroup,
          orderReference: opts.order.reference,
          totalHt: opts.order.totalHt,
          items: opts.order.lines,
          language: opts.order.language,
          ...signature,
        });
        await sendSupplierMail(
          tokenResult.accessToken,
          sender?.email,
          opts.order.supplierEmail,
          subject,
          html,
          { filename: opts.order.filename, contentBase64: opts.order.buffer.toString("base64") }
        );
        report.awarded.sent = true;
        await stamp(opts.awardedRequestId, "awarded");
      } catch (err) {
        report.awarded.error = err instanceof Error ? err.message : "Envoi impossible";
        console.error("[submissions/award] award email failed:", err);
      }
    }
  }

  // ── 2. Everybody else who actually quoted ON THE SAME LOT ──
  // Awarding one lot must never send rejections to suppliers still competing
  // on the other lots of the same submission.
  if (opts.notifyRejected) {
    let othersQuery = opts.admin
      .from("submission_price_requests")
      .select("id, material_group, language, supplier_name_manual, supplier_email_manual, suppliers(company_name, contact_name, email)")
      .eq("submission_id", opts.submissionId)
      .eq("status", "responded")
      .neq("id", opts.awardedRequestId);
    othersQuery =
      opts.materialGroup != null
        ? othersQuery.eq("material_group", opts.materialGroup)
        : othersQuery.is("material_group", null);
    const { data: others } = await othersQuery;

    for (const other of others || []) {
      const email = other.suppliers?.email || other.supplier_email_manual;
      if (!email) continue;
      report.rejected.attempted += 1;
      try {
        const { subject, html } = buildRejectionEmail({
          contactName: other.suppliers?.contact_name || null,
          projectName: opts.order?.projectName || "Projet",
          materialGroup: other.material_group || "",
          language: normalizeSupplierLanguage(other.language),
          ...signature,
        });
        await sendSupplierMail(tokenResult.accessToken, sender?.email, email, subject, html);
        report.rejected.sent += 1;
        await stamp(other.id, "rejected");
      } catch (err) {
        const name = other.suppliers?.company_name || other.supplier_name_manual || email;
        report.rejected.errors.push(
          `${name}: ${err instanceof Error ? err.message : "envoi impossible"}`
        );
        console.error("[submissions/award] rejection email failed:", err);
      }
    }
  }

  return report;
}

/**
 * Applies a delta (positive on award, negative on unaward / re-award) to
 * `projects.purchase_costs` (migration 062).
 * Read-then-write rather than a raw SQL increment: PostgREST has no atomic
 * `+=`, and an award is a rare, human-triggered action, so the race window is
 * acceptable and a lost update would be visible in the Closure tab.
 * The stored total is clamped at 0 — a decrement can never leave a negative cost.
 */
async function adjustPurchaseCost(
  admin: any,
  projectId: string,
  delta: number
): Promise<{ updated: boolean; total?: number; error?: string }> {
  if (!Number.isFinite(delta) || delta === 0) {
    return { updated: false, error: "Montant invalide" };
  }

  const { data: project, error: readError } = await admin
    .from("projects")
    .select("purchase_costs")
    .eq("id", projectId)
    .maybeSingle();

  if (readError) {
    console.error("[submissions/award] purchase_costs read failed:", readError.message);
    return { updated: false, error: readError.message };
  }

  const current = Number(project?.purchase_costs ?? 0);
  const total = Math.max(0, Math.round((current + delta) * 100) / 100);

  const { error: writeError } = await admin
    .from("projects")
    .update({ purchase_costs: total })
    .eq("id", projectId);

  if (writeError) {
    console.error("[submissions/award] purchase_costs update failed:", writeError.message);
    return { updated: false, error: writeError.message };
  }

  return { updated: true, total };
}

/** Adds the awarded total to `projects.purchase_costs`. */
async function addPurchaseCost(
  admin: any,
  projectId: string,
  amount: number
): Promise<{ updated: boolean; total?: number; error?: string }> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { updated: false, error: "Montant invalide" };
  }
  return adjustPurchaseCost(admin, projectId, amount);
}

// Budget vs Actual calibration: compare budget_estimate items against awarded offer prices
// ============================================================================

/**
 * Compare the stored budget estimate against the prices actually quoted by the
 * awarded supplier, and record one `price_calibrations` row per matched item.
 *
 * Previously broken twice over:
 *  - it read `budget_estimate.items[].unit_price_median` / source
 *    `"prix_non_disponible"`, while estimate-budget writes
 *    `budget_estimate.estimates[].prix_median` / source `"non_estime"`;
 *  - it inserted `estimated_price` / `actual_price` / `correction_coefficient`,
 *    none of which exist in migration 043 (and `coefficient` is GENERATED, so it
 *    must never be written), inside a bare `try {} catch {}` that swallowed the
 *    resulting PostgREST error.
 */
async function calibrateBudgetVsActual(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  submissionId: string,
  priceRequestId: string
): Promise<void> {
  // 1. Budget estimate — shape produced by POST /api/submissions/[id]/estimate-budget
  const { data: submission, error: subError } = await (admin as any)
    .from("submissions")
    .select("budget_estimate, projects!submissions_project_id_fkey(city)")
    .eq("id", submissionId)
    .maybeSingle();

  if (subError) {
    console.warn("[calibrate] submission fetch failed:", subError.message);
    return;
  }

  const estimates = submission?.budget_estimate?.estimates;
  if (!Array.isArray(estimates) || estimates.length === 0) {
    console.log(`[calibrate] no budget estimate stored for submission ${submissionId} — nothing to calibrate`);
    return;
  }

  const region = ((submission as any)?.projects?.city || "suisse").toLowerCase();

  // 2. Actual prices — one row per quoted item for the awarded request.
  //    NB: the FK column is `request_id` (migration 049), not `price_request_id`.
  const { data: quoteRows, error: quotesError } = await (admin as any)
    .from("submission_quotes")
    .select("item_id, unit_price_ht, extracted_at")
    .eq("submission_id", submissionId)
    .eq("request_id", priceRequestId)
    .not("unit_price_ht", "is", null)
    .order("extracted_at", { ascending: false });

  if (quotesError) {
    console.warn("[calibrate] quotes fetch failed:", quotesError.message);
    return;
  }
  if (!quoteRows || quoteRows.length === 0) {
    console.log(`[calibrate] awarded request ${priceRequestId} has no extracted prices`);
    return;
  }

  // Keep the most recent price per item (rows are ordered desc)
  const actualByItemId = new Map<string, number>();
  for (const q of quoteRows) {
    if (!q.item_id || actualByItemId.has(q.item_id)) continue;
    const price = Number(q.unit_price_ht);
    if (Number.isFinite(price) && price > 0) actualByItemId.set(q.item_id, price);
  }
  if (actualByItemId.size === 0) return;

  // 3. Item metadata — CFC code / unit are NOT NULL in price_calibrations
  const { data: items, error: itemsError } = await (admin as any)
    .from("submission_items")
    .select("id, item_number, description, unit, cfc_code, cfc_subcode")
    .eq("submission_id", submissionId);

  if (itemsError) {
    console.warn("[calibrate] items fetch failed:", itemsError.message);
    return;
  }
  const itemById = new Map<string, any>();
  const itemByNumber = new Map<string, any>();
  for (const it of items || []) {
    itemById.set(it.id, it);
    if (it.item_number) itemByNumber.set(String(it.item_number), it);
  }

  // 4. Build the calibration rows (migration 043 columns; `coefficient` and
  //    `ecart_pct` are GENERATED ALWAYS and must not be supplied)
  const rows: Record<string, unknown>[] = [];
  let skippedNoCfc = 0;
  let skippedNoActual = 0;

  for (const est of estimates) {
    const estimatedPrice = Number(est?.prix_median);
    if (!Number.isFinite(estimatedPrice) || estimatedPrice <= 0) continue;
    if (est.source === "non_estime" || est.source === "prix_non_disponible") continue;

    // Match by item_id first, then by item_number (stable across re-analysis)
    let itemId: string | undefined = est.item_id && actualByItemId.has(est.item_id) ? est.item_id : undefined;
    if (!itemId && est.item_number) {
      const byNumber = itemByNumber.get(String(est.item_number));
      if (byNumber && actualByItemId.has(byNumber.id)) itemId = byNumber.id;
    }
    if (!itemId) {
      skippedNoActual++;
      continue;
    }

    const actualPrice = actualByItemId.get(itemId)!;
    const item = itemById.get(itemId) || {};
    const cfcCode = item.cfc_code || item.cfc_subcode || est.cfc_code;
    if (!cfcCode) {
      skippedNoCfc++;
      continue;
    }

    rows.push({
      org_id: orgId,
      cfc_code: String(cfcCode),
      description_normalized: (item.description || est.description || String(cfcCode)).slice(0, 500),
      unite: item.unit || est.unit || "u",
      region,
      estimation_id: submissionId,
      prix_estime_median: estimatedPrice,
      source_estimation: est.source || "estimation_ia",
      prix_reel: actualPrice,
      source_prix_reel: "offre_fournisseur",
    });
  }

  if (rows.length === 0) {
    console.log(
      `[calibrate] submission ${submissionId}: nothing to insert (no actual price: ${skippedNoActual}, no CFC: ${skippedNoCfc})`
    );
    return;
  }

  const { error: insertError } = await (admin as any).from("price_calibrations").insert(rows);
  if (insertError) {
    console.error("[calibrate] price_calibrations insert failed:", insertError.message, insertError.details);
    return;
  }

  console.log(
    `[calibrate] submission ${submissionId}: inserted ${rows.length} price calibrations ` +
    `(skipped — no actual: ${skippedNoActual}, no CFC: ${skippedNoCfc})`
  );
}
