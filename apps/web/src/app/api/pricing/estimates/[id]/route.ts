import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/pricing/estimates/:id
 * Fetch a single estimate with full result details.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();

  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const { data: estimate, error } = await (adminClient as any)
    .from("plan_estimates")
    .select("*, plan_registry(plan_number, plan_title)")
    .eq("id", id)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (error) {
    console.error("[pricing/estimates/:id] Error:", error);
    return NextResponse.json({ error: "Failed to fetch estimate" }, { status: 500 });
  }

  if (!estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  return NextResponse.json({
    estimate: {
      id: estimate.id,
      plan_id: estimate.plan_id,
      plan_title: estimate.plan_registry?.plan_title || null,
      plan_number: estimate.plan_registry?.plan_number || null,
      config: estimate.config,
      estimate_result: estimate.estimate_result,
      subtotal: estimate.subtotal ? Number(estimate.subtotal) : null,
      margin_total: estimate.margin_total ? Number(estimate.margin_total) : null,
      transport_cost: estimate.transport_cost ? Number(estimate.transport_cost) : null,
      grand_total: estimate.grand_total ? Number(estimate.grand_total) : null,
      db_coverage_percent: estimate.db_coverage_percent ? Number(estimate.db_coverage_percent) : null,
      confidence_summary: estimate.confidence_summary,
      items_count: estimate.items_count,
      estimated_at: estimate.estimated_at,
      created_at: estimate.created_at,
    },
  });
}
