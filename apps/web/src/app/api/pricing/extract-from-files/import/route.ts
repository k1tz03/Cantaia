import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/pricing/extract-from-files/import
 * Import confirmed extraction results from file uploads into suppliers, offers, and line items.
 * Accepts results directly (no job_id needed).
 */
export async function POST(request: Request) {
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

  const body = await request.json();
  const { results } = body;

  if (!results || !Array.isArray(results) || results.length === 0) {
    return NextResponse.json({ error: "No results to import" }, { status: 400 });
  }

  try {
    const { importExtractedPrices } = await import("@cantaia/core/pricing");

    const result = await importExtractedPrices({
      supabase: adminClient,
      organizationId: userOrg.organization_id,
      userId: user.id,
      jobId: null,
      confirmedResults: results,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error("[extract-from-files/import] Error:", err);
    return NextResponse.json({ error: err.message || "Import failed" }, { status: 500 });
  }
}
