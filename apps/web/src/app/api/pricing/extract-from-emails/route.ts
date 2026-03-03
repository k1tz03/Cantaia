import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/pricing/extract-from-emails
 * Create a new price extraction job.
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
  const { project_id } = body;

  // Count eligible emails
  let countQuery = adminClient
    .from("email_records")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", userOrg.organization_id)
    .eq("price_extracted", false)
    .not("outlook_message_id", "is", null);

  if (project_id) {
    countQuery = countQuery.eq("project_id", project_id);
  }

  const { count } = await countQuery;

  if (!count || count === 0) {
    return NextResponse.json({ error: "Aucun email à analyser", total: 0 }, { status: 400 });
  }

  // Create job
  const { data: job, error } = await (adminClient as any)
    .from("price_extraction_jobs")
    .insert({
      organization_id: userOrg.organization_id,
      user_id: user.id,
      project_id: project_id || null,
      status: "scanning",
      total_emails: count,
      started_at: new Date().toISOString(),
    })
    .select("id, total_emails, status")
    .single();

  if (error) {
    console.error("[extract-from-emails] Job creation error:", error);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }

  return NextResponse.json({ success: true, job_id: job.id, total_emails: job.total_emails });
}
