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

    // Verify submission's project belongs to user's org
    const proj = (submission as any).projects;
    if (proj && userProfile?.organization_id && proj.organization_id !== userProfile.organization_id) {
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

      // Fire-and-forget auto-calibration (non-blocking)
      const orgId = userProfile.organization_id;
      const projectId = currentSub?.project_id;
      autoCalibrate({
        supabase: admin,
        org_id: orgId,
        submission_id: id,
        offer_id: price_request_id,
        ...(projectId ? { project_id: projectId } : {}),
      }).catch((err: unknown) => {
        console.error("[submissions/award] auto-calibration error:", err);
      });

      // Fire-and-forget: compare budget_estimate vs awarded offer prices for per-item calibration
      calibrateBudgetVsActual(admin, orgId, id, price_request_id).catch((err: unknown) => {
        console.error("[submissions/award] budget-vs-actual calibration error:", err);
      });

      return NextResponse.json({ success: true, awarded_request_id: price_request_id });
    }

    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "items must be an array" }, { status: 400 });
    }

    // ── Fetch old items BEFORE deletion (for correction tracking) ──
    let oldItems: any[] = [];
    try {
      const { data: existingItems } = await (admin as any)
        .from("submission_items")
        .select("id, item_number, description, unit, quantity, cfc_code, material_group")
        .eq("submission_id", id);
      oldItems = existingItems || [];
    } catch (fetchErr) {
      console.error("[submissions/[id]] Failed to fetch old items for correction tracking:", fetchErr);
    }

    // Delete existing items
    await (admin as any)
      .from("submission_items")
      .delete()
      .eq("submission_id", id);

    // Insert updated items
    if (items.length > 0) {
      const rows = items.map((item: any, index: number) => ({
        submission_id: id,
        item_number: item.item_number || item.position_number || String(index + 1),
        description: item.description || "",
        unit: item.unit || null,
        quantity: item.quantity != null ? item.quantity : null,
        cfc_code: item.cfc_code || item.can_code || null,
        material_group: item.material_group || null,
        product_name: item.product_name || null,
      }));

      const { error: insertError } = await (admin as any)
        .from("submission_items")
        .insert(rows);

      if (insertError) {
        console.error("[submissions/[id]] PATCH insert error:", insertError);
        return NextResponse.json({ error: "Failed to save items" }, { status: 500 });
      }
    }

    // Update submission timestamp
    await (admin as any)
      .from("submissions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);

    // ── Log corrections (fire-and-forget) ──
    try {
      const TRACKED_FIELDS = ["cfc_code", "description", "unit", "quantity", "material_group"] as const;
      const corrections: any[] = [];

      for (const newItem of items) {
        const oldItem = oldItems.find(
          (o: any) => o.item_number === (newItem.item_number || newItem.position_number)
        );
        if (!oldItem) continue; // New item, not a correction

        for (const field of TRACKED_FIELDS) {
          const oldVal = oldItem[field];
          const newVal = newItem[field];
          // Normalize for comparison: treat null/undefined/"" as equivalent
          const oldNorm = oldVal != null && oldVal !== "" ? String(oldVal) : null;
          const newNorm = newVal != null && newVal !== "" ? String(newVal) : null;
          if (oldNorm !== newNorm) {
            corrections.push({
              organization_id: userProfile.organization_id,
              submission_id: id,
              item_id: oldItem.id,
              field_name: field,
              original_value: oldNorm,
              corrected_value: newNorm,
              corrected_by: user.id,
            });
          }
        }
      }

      if (corrections.length > 0) {
        const { error: corrInsertError } = await (admin as any)
          .from("submission_corrections")
          .insert(corrections);
        if (corrInsertError) {
          console.error("[submissions/[id]] Failed to log corrections:", corrInsertError.message);
        } else {
          console.log(`[submissions/[id]] Logged ${corrections.length} corrections`);
        }
      }
    } catch (corrErr) {
      console.error("[submissions/[id]] Correction tracking error:", corrErr);
    }

    return NextResponse.json({
      success: true,
      updated_at: new Date().toISOString(),
      items_count: items.length,
    });
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

    // Delete file from storage — handle both schema versions
    const { data: submission } = await (admin as any)
      .from("submissions")
      .select("*, projects!submissions_project_id_fkey(organization_id)")
      .eq("id", id)
      .maybeSingle();

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    // Verify submission's project belongs to user's org
    const proj = (submission as any).projects;
    if (proj && userProfile?.organization_id && proj.organization_id !== userProfile.organization_id) {
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

async function calibrateBudgetVsActual(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  submissionId: string,
  priceRequestId: string
): Promise<void> {
  // 1. Get the submission with budget estimate
  const { data: submission } = await (admin as any)
    .from("submissions")
    .select("budget_estimate")
    .eq("id", submissionId)
    .maybeSingle();

  const budgetEstimate = submission?.budget_estimate;
  if (!budgetEstimate?.items || !Array.isArray(budgetEstimate.items)) return;

  // 2. Get the awarded offer's line items (actual prices from supplier)
  const { data: quotes } = await (admin as any)
    .from("submission_quotes")
    .select("id, items")
    .eq("submission_id", submissionId)
    .eq("price_request_id", priceRequestId)
    .order("created_at", { ascending: false })
    .limit(1);

  // Fallback: try offer_line_items via supplier_offers
  let actualItems: Array<{ item_number?: string; cfc_code?: string; unit_price?: number; description?: string }> = [];

  if (quotes?.[0]?.items && Array.isArray(quotes[0].items)) {
    actualItems = quotes[0].items;
  } else {
    // Try supplier_offers path
    const { data: offers } = await (admin as any)
      .from("supplier_offers")
      .select("id")
      .eq("price_request_id", priceRequestId)
      .limit(1);

    if (offers?.[0]) {
      const { data: lineItems } = await (admin as any)
        .from("offer_line_items")
        .select("cfc_subcode, unit_price, normalized_description, supplier_description")
        .eq("supplier_offer_id", offers[0].id);

      actualItems = (lineItems || []).map((li: any) => ({
        cfc_code: li.cfc_subcode,
        unit_price: li.unit_price,
        description: li.normalized_description || li.supplier_description,
      }));
    }
  }

  if (actualItems.length === 0) return;

  // 3. Match budget items to actual items and insert calibrations
  let inserted = 0;
  for (const budgetItem of budgetEstimate.items) {
    if (!budgetItem.unit_price_median || budgetItem.source === "prix_non_disponible") continue;

    // Find matching actual item by item_number or CFC code
    const actual = actualItems.find((a: any) =>
      (a.item_number && budgetItem.item_number && a.item_number === budgetItem.item_number) ||
      (a.cfc_code && budgetItem.cfc_code && a.cfc_code === budgetItem.cfc_code)
    );

    if (!actual?.unit_price || actual.unit_price <= 0) continue;

    const estimatedPrice = budgetItem.unit_price_median;
    const actualPrice = actual.unit_price;
    const correctionCoefficient = actualPrice / estimatedPrice;

    try {
      await (admin as any)
        .from("price_calibrations")
        .insert({
          org_id: orgId,
          cfc_code: budgetItem.cfc_code || null,
          estimated_price: estimatedPrice,
          actual_price: actualPrice,
          correction_coefficient: Math.round(correctionCoefficient * 10000) / 10000,
          source: "submission_award",
          description: budgetItem.description || null,
          unit: budgetItem.unit || null,
        });
      inserted++;
    } catch {
      // price_calibrations table may not exist — non-blocking
    }
  }

  if (inserted > 0) {
    console.log(`[submissions/award] Inserted ${inserted} price calibrations for submission ${submissionId}`);
  }
}
