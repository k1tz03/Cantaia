import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { insufficientCreditsResponse, grantCredits } from "@/lib/credits";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  // Captured outside the try: the request body is consumed by parseBody(),
  // so request.clone() is no longer usable from the catch block.
  let failedVisitId: string | null = null;
  // Refund context: a technical failure after the debit must not charge the
  // user for a transcription they never got (credits mode only).
  let refundCtx: { orgId: string; amount: number; userId: string } | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: reqBody, error: parseError } = await parseBody(request);
    if (parseError || !reqBody) {
      return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
    }

    const validationError = validateRequired(reqBody, ["visit_id"]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { visit_id } = reqBody;
    failedVisitId = visit_id;

    // Get the visit
    const { data: visit, error: visitErr } = await (supabase.from("client_visits") as any)
      .select("id, audio_url, transcription_language, organization_id")
      .eq("id", visit_id)
      .maybeSingle();

    if (visitErr || !visit) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    // ── Metering ──────────────────────────────────────────
    // Whisper transcription of a full site visit is a real, user-triggered
    // cost that used to be entirely free. Debit BEFORE marking the visit as
    // "processing", so a refusal leaves the visit untouched and re-runnable.
    const admin = createAdminClient();
    const { data: visitOrg } = await (admin as any)
      .from("organizations")
      .select("subscription_plan")
      .eq("id", visit.organization_id)
      .maybeSingle();

    const usageCheck = await checkUsageLimit(
      admin,
      visit.organization_id,
      visitOrg?.subscription_plan || "trial",
      "visit_transcribe"
    );
    if (!usageCheck.allowed) {
      if (usageCheck.insufficient_credits) {
        return insufficientCreditsResponse(
          usageCheck.required_credits ?? 1,
          usageCheck.remaining_credits ?? 0
        );
      }
      return NextResponse.json(
        {
          error: "usage_limit_reached",
          current: usageCheck.current,
          limit: usageCheck.limit,
          required_plan: usageCheck.requiredPlan,
        },
        { status: 429 }
      );
    }
    // Debited in credits mode → arm the refund for the failure paths below.
    if (usageCheck.remaining_credits !== null && (usageCheck.required_credits ?? 0) > 0) {
      refundCtx = {
        orgId: visit.organization_id,
        amount: usageCheck.required_credits ?? 0,
        userId: user.id,
      };
    }
    const refundOnFailure = async () => {
      if (refundCtx) {
        await grantCredits(refundCtx.orgId, refundCtx.amount, "refund", `visit_transcribe:${visit_id}`, refundCtx.userId);
      }
    };

    // Update status to processing
    await (supabase.from("client_visits") as any)
      .update({ transcription_status: "processing", status: "transcribing" })
      .eq("id", visit_id);

    // Transcribe
    const { transcribeVisitAudio } = await import("@cantaia/core/visits");

    let audioBlob: Blob | null = null;
    if (visit.audio_url) {
      try {
        const { data: audioData, error: downloadErr } = await supabase.storage
          .from("audio")
          .download(visit.audio_url);
        if (downloadErr) {
          console.error("[Visit Transcribe] Audio download failed:", downloadErr);
        }
        audioBlob = audioData ?? null;
      } catch (downloadErr) {
        console.error("[Visit Transcribe] Audio download threw:", downloadErr);
      }
    }

    let result;
    try {
      result = await transcribeVisitAudio(audioBlob, visit.transcription_language || "fr");
    } catch (transcribeErr: unknown) {
      const message =
        transcribeErr instanceof Error
          ? transcribeErr.message
          : "La transcription a échoué.";
      console.error("[Visit Transcribe] Failed:", message);

      await (supabase.from("client_visits") as any)
        .update({ transcription_status: "failed", status: "recording" })
        .eq("id", visit_id);
      await refundOnFailure();

      return NextResponse.json(
        { error: message, visit_id, transcription_status: "failed" },
        { status: 502 }
      );
    }

    // Save transcription — check {error}: a silent failure here would charge the
    // user, lose the transcription, and answer 200.
    const { error: saveErr } = await (supabase.from("client_visits") as any)
      .update({
        transcription: result.text,
        transcription_status: "completed",
        transcription_provider: result.provider,
        audio_duration_seconds: result.duration,
        duration_minutes: Math.ceil(result.duration / 60),
      })
      .eq("id", visit_id);
    if (saveErr) {
      console.error("[Visit Transcribe] Failed to save transcription:", saveErr);
      await (supabase.from("client_visits") as any)
        .update({ transcription_status: "failed", status: "recording" })
        .eq("id", visit_id);
      await refundOnFailure();
      return NextResponse.json(
        { error: "La sauvegarde de la transcription a échoué.", visit_id, transcription_status: "failed" },
        { status: 500 }
      );
    }

    // Track API usage.
    // Was a hand-rolled insert with `action_type: "visit_transcription"` and
    // `api_provider: "openai"` — neither of which exists in ApiActionType /
    // ApiProvider, so the row was invisible to every cost dashboard. Now it
    // goes through the canonical tracker with the same key the credit grid
    // charges (`visit_transcribe`).
    trackApiUsage({
      supabase: admin,
      userId: user.id,
      organizationId: visit.organization_id,
      actionType: "visit_transcribe" as any,
      apiProvider: "openai_whisper",
      model: "whisper-1",
      audioSeconds: result.provider === "mock" ? 0 : result.duration,
      metadata: { visit_id, duration: result.duration, provider: result.provider },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      visit_id,
      transcript_length: result.text.length,
      segments_count: result.segments.length,
      duration: result.duration,
      provider: result.provider,
    });
  } catch (error) {
    console.error("[Visit Transcribe] Error:", error);

    // Never leave the visit stuck in "transcribing"
    if (failedVisitId) {
      try {
        const admin = createAdminClient();
        await ((admin as any).from("client_visits"))
          .update({ transcription_status: "failed", status: "recording" })
          .eq("id", failedVisitId);
      } catch (updateErr) {
        console.error("[Visit Transcribe] Failed to mark visit as failed:", updateErr);
      }
    }
    // Refund a debit the user paid for a run that crashed.
    if (refundCtx) {
      await grantCredits(refundCtx.orgId, refundCtx.amount, "refund", `visit_transcribe:${failedVisitId}`, refundCtx.userId);
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
