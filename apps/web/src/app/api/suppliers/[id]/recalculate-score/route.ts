import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recalculateAndPersistScore } from "@cantaia/core/suppliers";

/**
 * POST /api/suppliers/:id/recalculate-score
 * Recalculate the supplier's score from real transaction data.
 * Returns the full score breakdown.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: supplierId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  // Verify supplier belongs to user's org
  const { data: supplier } = await (adminClient as any)
    .from("suppliers")
    .select("id")
    .eq("id", supplierId)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  try {
    const breakdown = await recalculateAndPersistScore(
      supplierId,
      userOrg.organization_id,
      adminClient
    );

    return NextResponse.json({ breakdown });
  } catch (err: unknown) {
    console.error("[recalculate-score] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to recalculate" },
      { status: 500 }
    );
  }
}
