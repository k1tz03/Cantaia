import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/pricing/extract-from-emails/import
 * Import confirmed extraction results into suppliers, offers, and line items.
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
  const { job_id, confirmed_email_ids } = body;

  if (!job_id) {
    return NextResponse.json({ error: "job_id required" }, { status: 400 });
  }

  // Fetch job
  const { data: job } = await (adminClient as any)
    .from("price_extraction_jobs")
    .select("id, status, extraction_results")
    .eq("id", job_id)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "preview_ready") {
    return NextResponse.json({ error: "Job not ready for import" }, { status: 400 });
  }

  // Filter results to confirmed ones
  const allResults = job.extraction_results || [];
  const confirmedResults = confirmed_email_ids && confirmed_email_ids.length > 0
    ? allResults.filter((r: any) => confirmed_email_ids.includes(r.emailId))
    : allResults.filter((r: any) => r.has_prices);

  if (confirmedResults.length === 0) {
    return NextResponse.json({ error: "No results to import" }, { status: 400 });
  }

  try {
    // Update job status
    await (adminClient as any)
      .from("price_extraction_jobs")
      .update({ status: "importing", updated_at: new Date().toISOString() })
      .eq("id", job_id);

    const { importExtractedPrices } = await import("@cantaia/core/pricing");

    const result = await importExtractedPrices({
      supabase: adminClient,
      organizationId: userOrg.organization_id,
      userId: user.id,
      jobId: job_id,
      confirmedResults,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    console.error("[extract-from-emails/import] Error:", err);

    await (adminClient as any)
      .from("price_extraction_jobs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", job_id);

    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 500 });
  }
}
