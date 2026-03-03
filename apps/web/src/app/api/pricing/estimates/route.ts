import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/pricing/estimates
 * Fetch estimation history for the user's organization.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();

  // Get user's organization
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  // Fetch estimates with plan info
  const { data: estimates, error } = await (adminClient as any)
    .from("plan_estimates")
    .select("id, plan_id, grand_total, items_count, db_coverage_percent, confidence_summary, status, estimated_at, created_at, plan_registry(plan_number, plan_title)")
    .eq("organization_id", userOrg.organization_id)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[pricing/estimates] Error:", error);
    return NextResponse.json({ error: "Failed to fetch estimates" }, { status: 500 });
  }

  // Flatten plan info
  const items = (estimates || []).map((e: any) => ({
    id: e.id,
    plan_id: e.plan_id,
    plan_title: e.plan_registry?.plan_title || null,
    plan_number: e.plan_registry?.plan_number || null,
    grand_total: e.grand_total ? Number(e.grand_total) : null,
    items_count: e.items_count,
    db_coverage_percent: e.db_coverage_percent ? Number(e.db_coverage_percent) : null,
    confidence_summary: e.confidence_summary,
    estimated_at: e.estimated_at,
    created_at: e.created_at,
  }));

  return NextResponse.json({ estimates: items });
}
