import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoCalibrate } from "@cantaia/core/plans/estimation/auto-calibration";

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

    // ── Award action ─────────────────────────────────────────
    if (body.action === "award") {
      const { price_request_id } = body;
      if (!price_request_id) {
        return NextResponse.json({ error: "price_request_id is required" }, { status: 400 });
      }

      // Verify the price request belongs to this submission
      const { data: priceRequest } = await (admin as any)
        .from("submission_price_requests")
        .select("id, submission_id, supplier_id, suppliers(company_name)")
        .eq("id", price_request_id)
        .eq("submission_id", id)
        .maybeSingle();

      if (!priceRequest) {
        return NextResponse.json({ error: "Price request not found for this submission" }, { status: 404 });
      }

      // Store awarded_request_id in submissions.budget_estimate JSONB
      const { data: currentSub } = await (admin as any)
        .from("submissions")
        .select("budget_estimate, project_id")
        .eq("id", id)
        .maybeSingle();

      const updatedBudgetEstimate = {
        ...(currentSub?.budget_estimate || {}),
        awarded_request_id: price_request_id,
        awarded_at: new Date().toISOString(),
      };

      await (admin as any)
        .from("submissions")
        .update({
          budget_estimate: updatedBudgetEstimate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      // Fire-and-forget auto-calibration (non-blocking).
      // `auto_calibration_started` tells the client whether it still needs to call
      // POST /api/plans/auto-calibrate itself — without it the UI would double-fire
      // and insert duplicate price_calibrations rows.
      const orgId = userProfile.organization_id;
      const projectId = currentSub?.project_id;
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

      return NextResponse.json({
        success: true,
        awarded_request_id: price_request_id,
        auto_calibration_started: autoCalibrationStarted,
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
    // Decision: REFUSE (410) rather than upsert. The only caller was
    // `components/submissions/SubmissionEditor.tsx`, which is no longer mounted
    // anywhere (replaced by the analyze pipeline + PriceRequestV2). Failing loudly
    // is preferable to silently orphaning quotes if that editor is ever revived —
    // whoever revives it must implement an id-preserving upsert first.
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
