import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { transcribeAudioChunked } from "@/lib/audio/chunked-transcription";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json(
        { error: parseError || "Invalid request" },
        { status: 400 }
      );
    }

    const validationError = validateRequired(body, ["meeting_id"]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const admin = createAdminClient();
    const { meeting_id } = body;

    // Get the meeting
    const { data: meeting, error: meetingError } = await admin
      .from("meetings")
      .select("*")
      .eq("id", meeting_id)
      .maybeSingle();

    if (meetingError || !meeting) {
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 }
      );
    }

    if (!meeting.audio_url) {
      return NextResponse.json(
        { error: "No audio file associated with this meeting" },
        { status: 400 }
      );
    }

    // Download audio from Supabase Storage
    const { data: audioData, error: downloadError } = await admin.storage
      .from("meeting-audio")
      .download(meeting.audio_url);

    if (downloadError || !audioData) {
      console.error("[Transcribe] Download error:", downloadError);
      return NextResponse.json(
        { error: "Audio file not found in storage" },
        { status: 404 }
      );
    }

    // Update status to transcribing
    await admin
      .from("meetings")
      .update({ status: "transcribing" } as any)
      .eq("id", meeting_id);

    // Transcribe with Whisper (auto-chunks if > 24 MB)
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY not configured");
      }

      console.log(
        `[Transcribe] Starting transcription for meeting ${meeting_id} (${(audioData.size / 1048576).toFixed(1)} MB)`
      );

      const result = await transcribeAudioChunked(audioData, apiKey, "fr");

      // Save transcription
      const { error: updateError } = await admin
        .from("meetings")
        .update({
          transcription_raw: result.text,
          transcription_language: result.language,
          audio_duration_seconds: result.duration,
          status: "generating_pv",
        } as any)
        .eq("id", meeting_id);

      if (updateError) {
        console.error("[Transcribe] Failed to save:", updateError);
        return NextResponse.json(
          { error: "Failed to save transcription" },
          { status: 500 }
        );
      }

      console.log(
        `[Transcribe] Success: ${result.text.length} chars, lang=${result.language}, ${result.chunks} chunk(s)`
      );

      return NextResponse.json({
        success: true,
        transcription: result.text,
        language: result.language,
        duration: result.duration,
        chunks: result.chunks,
      });
    } catch (err: any) {
      console.error("[Transcribe] Whisper failed:", err);

      await admin
        .from("meetings")
        .update({ status: "scheduled" } as any)
        .eq("id", meeting_id);

      return NextResponse.json(
        {
          error:
            "Transcription failed: " + (err.message || "Unknown error"),
        },
        { status: 502 }
      );
    }
  } catch (error: any) {
    console.error("[Transcribe] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
