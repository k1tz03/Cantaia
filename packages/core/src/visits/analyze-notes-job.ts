/**
 * Handwritten notes analysis job.
 *
 * Shared orchestration used by:
 *  - POST /api/visits/analyze-notes        (explicit user action / retry)
 *  - POST /api/visits/photos/upload        (background `after()` trigger)
 *  - POST /api/visits/generate-report      (best-effort catch-up before the report)
 *
 * The Supabase admin client is injected so this stays framework-agnostic.
 */

import { analyzeHandwrittenNotes } from "./handwritten-notes-analyzer";
import { MODEL_FOR_TASK } from "../ai/ai-utils";
import type { HandwrittenNotesAnalysis } from "@cantaia/database";

/** Minimal shape of the Supabase service-role client we rely on. */
export interface NotesJobClient {
  from: (table: string) => any;
  storage: { from: (bucket: string) => { download: (path: string) => Promise<{ data: Blob | null; error: unknown }> } };
}

export interface RunNotesAnalysisParams {
  admin: NotesJobClient;
  photoId: string;
  /** Used for api_usage_logs attribution — optional for background runs. */
  userId?: string | null;
  /** Storage bucket holding visit photos. */
  bucket?: string;
}

export interface RunNotesAnalysisResult {
  ok: boolean;
  error?: string;
  analysis?: HandwrittenNotesAnalysis;
  latency_ms?: number;
}

/**
 * Analyse a single `handwritten_notes` photo and persist the result.
 * Never throws — always resolves with `{ ok }` so callers can run it
 * fire-and-forget without crashing the request.
 */
export async function runHandwrittenNotesAnalysis(
  params: RunNotesAnalysisParams
): Promise<RunNotesAnalysisResult> {
  const { admin, photoId, userId = null, bucket = "audio" } = params;

  const markFailed = async () => {
    try {
      await admin.from("visit_photos").update({ ai_analysis_status: "failed" }).eq("id", photoId);
    } catch {
      // ignore
    }
  };

  try {
    const { data: photo } = await admin
      .from("visit_photos")
      .select("id, visit_id, organization_id, file_url, photo_type, mime_type, ai_analysis_status")
      .eq("id", photoId)
      .maybeSingle();

    if (!photo) return { ok: false, error: "Photo not found" };
    if (photo.photo_type !== "handwritten_notes") {
      return { ok: false, error: "Photo is not of type handwritten_notes" };
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      await markFailed();
      return { ok: false, error: "AI service not configured" };
    }

    await admin.from("visit_photos").update({ ai_analysis_status: "processing" }).eq("id", photoId);

    const { data: fileData, error: downloadErr } = await admin.storage
      .from(bucket)
      .download(photo.file_url);

    if (downloadErr || !fileData) {
      await markFailed();
      return { ok: false, error: "Failed to download image" };
    }

    const imageBase64 = Buffer.from(await fileData.arrayBuffer()).toString("base64");

    const { data: visit } = await admin
      .from("client_visits")
      .select("client_name, visit_date, title")
      .eq("id", photo.visit_id)
      .maybeSingle();

    const mediaType = (photo.mime_type || "image/jpeg") as
      | "image/jpeg"
      | "image/png"
      | "image/webp";

    const result = await analyzeHandwrittenNotes({
      imageBase64,
      mediaType,
      context: {
        client_name: visit?.client_name,
        visit_date: visit?.visit_date,
        project_type: visit?.title || undefined,
      },
    });

    await admin
      .from("visit_photos")
      .update({
        ai_transcription: result.analysis.transcribed_text,
        ai_sketch_description:
          result.analysis.sketches.length > 0
            ? result.analysis.sketches.map((s: { description: string }) => s.description).join("\n---\n")
            : null,
        ai_analysis_status: "completed",
        ai_confidence: result.analysis.confidence,
        ai_analysis_result: result.analysis,
      })
      .eq("id", photoId);

    // Re-aggregate every completed note onto the visit
    const { data: allNotes } = await admin
      .from("visit_photos")
      .select("ai_transcription")
      .eq("visit_id", photo.visit_id)
      .eq("photo_type", "handwritten_notes")
      .eq("ai_analysis_status", "completed")
      .not("ai_transcription", "is", null);

    if (allNotes && allNotes.length > 0) {
      const aggregated = allNotes
        .map((n: { ai_transcription: string }) => n.ai_transcription)
        .join("\n\n---\n\n");
      await admin
        .from("client_visits")
        .update({ handwritten_notes_transcription: aggregated })
        .eq("id", photo.visit_id);
    }

    // Cost tracking (non-critical)
    try {
      await admin.from("api_usage_logs").insert({
        user_id: userId,
        organization_id: photo.organization_id,
        // Canonical key — must match CREDIT_COSTS.handwritten_notes, which is
        // what /api/visits/analyze-notes actually debits. It used to say
        // "handwritten_notes_analysis", a name no cost dashboard knows.
        action_type: "handwritten_notes",
        api_provider: "anthropic",
        model: MODEL_FOR_TASK.handwritten_notes,
        input_tokens: Math.round(result.tokens_used * 0.8),
        output_tokens: Math.round(result.tokens_used * 0.2),
        estimated_cost_chf: (result.tokens_used * 0.003) / 1000,
        metadata: { photo_id: photoId, visit_id: photo.visit_id, latency_ms: result.latency_ms },
      });
    } catch {
      // non-critical
    }

    return { ok: true, analysis: result.analysis, latency_ms: result.latency_ms };
  } catch (error: unknown) {
    console.error("[NotesJob] Analysis failed:", error);
    await markFailed();
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Analysis failed",
    };
  }
}

/**
 * Analyse every still-pending handwritten note of a visit, sequentially.
 * Best-effort: individual failures are swallowed.
 */
export async function analyzePendingVisitNotes(params: {
  admin: NotesJobClient;
  visitId: string;
  userId?: string | null;
  bucket?: string;
  /** Safety cap so a visit with many photos cannot blow the function budget. */
  limit?: number;
}): Promise<number> {
  const { admin, visitId, userId = null, bucket = "audio", limit = 5 } = params;

  try {
    const { data: pending } = await admin
      .from("visit_photos")
      .select("id")
      .eq("visit_id", visitId)
      .eq("photo_type", "handwritten_notes")
      .eq("ai_analysis_status", "pending")
      .limit(limit);

    if (!pending || pending.length === 0) return 0;

    let analysed = 0;
    for (const p of pending as Array<{ id: string }>) {
      const res = await runHandwrittenNotesAnalysis({ admin, photoId: p.id, userId, bucket });
      if (res.ok) analysed++;
    }
    return analysed;
  } catch (error) {
    console.warn("[NotesJob] analyzePendingVisitNotes skipped:", error);
    return 0;
  }
}
