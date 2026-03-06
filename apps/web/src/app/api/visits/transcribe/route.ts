import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

export async function POST(request: NextRequest) {
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

    // Get the visit
    const { data: visit, error: visitErr } = await (supabase.from("client_visits") as any)
      .select("id, audio_url, transcription_language, organization_id")
      .eq("id", visit_id)
      .maybeSingle();

    if (visitErr || !visit) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    // Update status to processing
    await (supabase.from("client_visits") as any)
      .update({ transcription_status: "processing", status: "transcribing" })
      .eq("id", visit_id);

    // Transcribe
    const { transcribeVisitAudio } = await import("@cantaia/core/visits");

    let audioBlob: Blob | null = null;
    if (visit.audio_url) {
      try {
        const { data: audioData } = await supabase.storage
          .from("audio")
          .download(visit.audio_url);
        audioBlob = audioData;
      } catch {
        if (process.env.NODE_ENV === "development") console.log("[Visit Transcribe] Could not download audio, using mock");
      }
    }

    const result = await transcribeVisitAudio(audioBlob, visit.transcription_language || "fr");

    // Save transcription
    await (supabase.from("client_visits") as any)
      .update({
        transcription: result.text,
        transcription_status: "completed",
        transcription_provider: result.provider,
        audio_duration_seconds: result.duration,
        duration_minutes: Math.ceil(result.duration / 60),
      })
      .eq("id", visit_id);

    // Track API usage
    try {
      await (supabase.from("api_usage_logs") as any).insert({
        user_id: user.id,
        organization_id: visit.organization_id,
        action_type: "visit_transcription",
        api_provider: "openai",
        model: "whisper-1",
        input_tokens: 0,
        output_tokens: 0,
        audio_seconds: result.duration,
        estimated_cost_chf: result.provider === "mock" ? 0 : (result.duration * 0.006 / 60),
        metadata: { visit_id, duration: result.duration, provider: result.provider },
      });
    } catch {
      // non-critical
    }

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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
