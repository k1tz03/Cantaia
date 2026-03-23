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
      .select("*, projects(id, name, code, color, client_name, city, address, organization_id)")
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

    // Fetch price requests with supplier info (supplier_id can be null for manual suppliers)
    const { data: rawPriceRequests } = await (admin as any)
      .from("submission_price_requests")
      .select("*, suppliers(id, company_name, contact_name, email)")
      .eq("submission_id", id)
      .order("created_at", { ascending: false });

    // Normalize: for manual suppliers (supplier_id=null), populate suppliers from manual fields
    const priceRequests = (rawPriceRequests || []).map((pr: any) => {
      if (!pr.suppliers && (pr.supplier_name_manual || pr.supplier_email_manual)) {
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
      return pr;
    });

    // Fetch quotes
    const { data: quotes } = await (admin as any)
      .from("submission_quotes")
      .select("*")
      .eq("submission_id", id)
      .order("created_at", { ascending: false });

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

      return NextResponse.json({ success: true, awarded_request_id: price_request_id });
    }

    const { items } = body;

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "items must be an array" }, { status: 400 });
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
      .select("*, projects(organization_id)")
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
