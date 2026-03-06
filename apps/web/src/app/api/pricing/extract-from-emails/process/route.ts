import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

export const maxDuration = 60;

/**
 * POST /api/pricing/extract-from-emails/process
 * Process the next chunk of emails for price extraction.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
  }

  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const body = await request.json();
  const { job_id } = body;

  if (!job_id) {
    return NextResponse.json({ error: "job_id required" }, { status: 400 });
  }

  // Verify job belongs to user's org
  const { data: job } = await (adminClient as any)
    .from("price_extraction_jobs")
    .select("organization_id, status")
    .eq("id", job_id)
    .maybeSingle();

  if (!job || job.organization_id !== userOrg.organization_id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "preview_ready" || job.status === "completed") {
    return NextResponse.json({ done: true, processed: 0, pricesFound: 0, newItems: 0 });
  }

  try {
    const { processNextChunk } = await import("@cantaia/core/pricing");

    const result = await processNextChunk({
      jobId: job_id,
      supabase: adminClient,
      anthropicApiKey,
      userId: user.id,
      organizationId: userOrg.organization_id,
      chunkSize: 5,
      getGraphToken: async () => {
        const result = await getValidMicrosoftToken(user.id);
        if ("error" in result) throw new Error(result.error || "No valid Microsoft token");
        return result.accessToken;
      },
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    console.error("[extract-from-emails/process] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Processing failed" }, { status: 500 });
  }
}
