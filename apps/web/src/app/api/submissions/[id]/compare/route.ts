import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/submissions/:id/compare
 * Run price comparison across all supplier offers for a submission,
 * then generate pricing alerts from the comparison data.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: submissionId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Get user's organization
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  try {
    // Dynamic imports to avoid client-side bundling
    const { comparePrices } = await import("@cantaia/core/submissions");
    const { generatePricingAlerts } = await import(
      "@cantaia/core/submissions"
    );

    // Run price comparison
    const comparison = await comparePrices(
      adminClient,
      userOrg.organization_id,
      submissionId
    );

    // Generate and save pricing alerts
    const alerts = await generatePricingAlerts(
      adminClient,
      userOrg.organization_id,
      submissionId,
      comparison
    );

    return NextResponse.json({ comparison, alerts });
  } catch (err) {
    console.error("[submissions/:id/compare] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to compare prices",
      },
      { status: 500 }
    );
  }
}
