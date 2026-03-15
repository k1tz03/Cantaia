import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

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

    // Get photo record — verify org ownership
    const { data: photo } = await ((admin as any).from("visit_photos"))
      .select("id, visit_id, organization_id, file_url, photo_type, mime_type, ai_analysis_status")
      .eq("id", photo_id)
      .eq("organization_id", userRow.organization_id)
      .maybeSingle();

    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 });
    }

    if (photo.photo_type !== "handwritten_notes") {
      return NextResponse.json({ error: "Photo is not of type handwritten_notes" }, { status: 400 });
    }

    // Mark as processing
    await ((admin as any).from("visit_photos"))
      .update({ ai_analysis_status: "processing" })
      .eq("id", photo_id);

    // Download image from storage
    const { data: fileData, error: downloadErr } = await admin.storage
      .from("audio")
      .download(photo.file_url);

    if (downloadErr || !fileData) {
      await ((admin as any).from("visit_photos"))
        .update({ ai_analysis_status: "failed" })
        .eq("id", photo_id);
      return NextResponse.json({ error: "Failed to download image" }, { status: 500 });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const imageBase64 = Buffer.from(arrayBuffer).toString("base64");

    // Get visit context
    const { data: visit } = await ((admin as any).from("client_visits"))
      .select("client_name, visit_date, title")
      .eq("id", photo.visit_id)
      .maybeSingle();

    // Call AI analyzer
    if (!process.env.ANTHROPIC_API_KEY) {
      await ((admin as any).from("visit_photos"))
        .update({ ai_analysis_status: "failed" })
        .eq("id", photo_id);
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
    }

    const { analyzeHandwrittenNotes } = await import("@cantaia/core/visits");

    const mediaType = (photo.mime_type || "image/jpeg") as "image/jpeg" | "image/png" | "image/webp";

    const result = await analyzeHandwrittenNotes({
      imageBase64,
      mediaType,
      context: {
        client_name: visit?.client_name,
        visit_date: visit?.visit_date,
        project_type: visit?.title || undefined,
      },
    });

    // Update photo with analysis results
    await ((admin as any).from("visit_photos"))
      .update({
        ai_transcription: result.analysis.transcribed_text,
        ai_sketch_description: result.analysis.sketches.length > 0
          ? result.analysis.sketches.map((s: { description: string }) => s.description).join("\n---\n")
          : null,
        ai_analysis_status: "completed",
        ai_confidence: result.analysis.confidence,
        ai_analysis_result: result.analysis,
      })
      .eq("id", photo_id);

    // Update visit's aggregated handwritten transcription
    const { data: allNotes } = await ((admin as any).from("visit_photos"))
      .select("ai_transcription")
      .eq("visit_id", photo.visit_id)
      .eq("photo_type", "handwritten_notes")
      .eq("ai_analysis_status", "completed")
      .not("ai_transcription", "is", null);

    if (allNotes && allNotes.length > 0) {
      const aggregated = allNotes
        .map((n: { ai_transcription: string }) => n.ai_transcription)
        .join("\n\n---\n\n");
      await ((admin as any).from("client_visits"))
        .update({ handwritten_notes_transcription: aggregated })
        .eq("id", photo.visit_id);
    }

    // Track API usage
    try {
      await ((admin as any).from("api_usage_logs")).insert({
        user_id: user.id,
        organization_id: userRow.organization_id,
        action_type: "handwritten_notes_analysis",
        api_provider: "anthropic",
        model: "claude-sonnet-4-5-20250929",
        input_tokens: Math.round(result.tokens_used * 0.8),
        output_tokens: Math.round(result.tokens_used * 0.2),
        estimated_cost_chf: (result.tokens_used * 0.003) / 1000,
        metadata: { photo_id, visit_id: photo.visit_id, latency_ms: result.latency_ms },
      });
    } catch {
      // non-critical
    }

    return NextResponse.json({
      success: true,
      photo_id,
      analysis: result.analysis,
      latency_ms: result.latency_ms,
    });
  } catch (error: unknown) {
    console.error("[AnalyzeNotes] Error:", error);

    // Try to mark as failed
    try {
      const admin = createAdminClient();
      const body = await request.clone().json().catch(() => null);
      if (body?.photo_id) {
        await ((admin as any).from("visit_photos"))
          .update({ ai_analysis_status: "failed" })
          .eq("id", body.photo_id);
      }
    } catch {
      // ignore
    }

    const { isRetryableAIError, classifyAIError } = await import("@cantaia/core/ai");
    if (isRetryableAIError(error)) {
      const classified = classifyAIError(error);
      return NextResponse.json({ error: classified.message }, { status: classified.status });
    }

    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
