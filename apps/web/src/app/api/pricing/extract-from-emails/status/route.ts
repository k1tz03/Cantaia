import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/pricing/extract-from-emails/status?job_id=xxx
 * Poll job status and progress.
 */
export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("job_id");

  if (!jobId) {
    return NextResponse.json({ error: "job_id required" }, { status: 400 });
  }

  const { data: job, error } = await (adminClient as any)
    .from("price_extraction_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    job: {
      id: job.id,
      status: job.status,
      total_emails: job.total_emails,
      scanned_emails: job.scanned_emails,
      emails_with_prices: job.emails_with_prices,
      extracted_items: job.extracted_items,
      imported_items: job.imported_items,
      extraction_results: job.status === "preview_ready" || job.status === "completed"
        ? job.extraction_results
        : undefined,
      errors: job.errors,
      started_at: job.started_at,
      completed_at: job.completed_at,
    },
  });
}
