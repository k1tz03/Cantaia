import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { insufficientCreditsResponse, grantCredits } from "@/lib/credits";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: userRow } = await admin
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!userRow?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
    }

    const validationError = validateRequired(body, ["photo_id"]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { photo_id } = body;

    // Get photo record — verify org ownership BEFORE running the shared job
    // (the job itself uses the service-role client and skips RLS).
    const { data: photo } = await ((admin as any).from("visit_photos"))
      .select("id, visit_id, organization_id, photo_type")
      .eq("id", photo_id)
      .eq("organization_id", userRow.organization_id)
      .maybeSingle();

    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    if (photo.photo_type !== "handwritten_notes") {
      return NextResponse.json({ error: "Photo is not of type handwritten_notes" }, { status: 400 });
    }

    // Check AI usage limit AFTER the request + photo are fully validated:
    // checkUsageLimit DEBITS in credits mode, so an invalid body or a wrong
    // photo must not cost the user 5 credits.
    const { data: orgData } = await admin
      .from("organizations")
      .select("subscription_plan")
      .eq("id", userRow.organization_id)
      .single();

    const usageCheck = await checkUsageLimit(admin, userRow.organization_id, orgData?.subscription_plan || "trial", "handwritten_notes");
    if (!usageCheck.allowed) {
      if (usageCheck.insufficient_credits) {
        return insufficientCreditsResponse(usageCheck.required_credits ?? 1, usageCheck.remaining_credits ?? 0);
      }
      return NextResponse.json(
        { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
        { status: 429 }
      );
    }
    const refundCredits =
      usageCheck.remaining_credits !== null ? usageCheck.required_credits ?? 0 : 0;

    const { runHandwrittenNotesAnalysis } = await import("@cantaia/core/visits");

    const result = await runHandwrittenNotesAnalysis({
      admin: admin as any,
      photoId: photo_id,
      userId: user.id,
    });

    if (!result.ok) {
      // Analysis failed — refund the debit so the retry does not double-charge.
      if (refundCredits > 0) {
        await grantCredits(userRow.organization_id, refundCredits, "refund", `handwritten_notes:${photo_id}`, user.id);
      }
      const status = result.error === "AI service not configured" ? 503 : 500;
      return NextResponse.json({ error: result.error || "Analysis failed" }, { status });
    }

    return NextResponse.json({
      success: true,
      photo_id,
      analysis: result.analysis,
      latency_ms: result.latency_ms,
    });
  } catch (error: unknown) {
    console.error("[AnalyzeNotes] Error:", error);
    // runHandwrittenNotesAnalysis() already marks the photo as failed;
    // anything reaching here happened before the job started.

    const { isRetryableAIError, classifyAIError } = await import("@cantaia/core/ai");
    if (isRetryableAIError(error)) {
      const classified = classifyAIError(error);
      return NextResponse.json({ error: classified.message }, { status: classified.status });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
