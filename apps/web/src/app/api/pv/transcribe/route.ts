import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

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
    const { meeting_id, language } = body;
    const whisperLanguage = (language === "de" || language === "en") ? language : "fr";

    // Get the meeting
    const { data: meeting, error: meetingError } = await admin
      .from("meetings")
      .select("id, audio_url")
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

    // Transcribe with Whisper
    // Audio is pre-compressed client-side to MP3 < 24 MB, so direct call works
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY not configured");
      }

      const sizeMB = (audioData.size / 1048576).toFixed(1);
      if (process.env.NODE_ENV === "development") console.log(
        `[Transcribe] Starting transcription for meeting ${meeting_id} (${sizeMB} MB)`
      );

      const OpenAI = (await import("openai")).default;
      const openai = new OpenAI({ apiKey });

      // Detect format from storage path
      const isMP3 = meeting.audio_url.endsWith(".mp3");
      const fileName = isMP3 ? "audio.mp3" : "audio.webm";
      const mimeType = isMP3 ? "audio/mpeg" : "audio/webm";

      const audioFile = new File([audioData], fileName, { type: mimeType });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-1",
        language: whisperLanguage,
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
      });

      // Save transcription
      const { error: updateError } = await admin
        .from("meetings")
        .update({
          transcription_raw: transcription.text,
          transcription_language: (transcription as any).language || "fr",
          audio_duration_seconds: Math.round(
            (transcription as any).duration || 0
          ),
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

      if (process.env.NODE_ENV === "development") console.log(
        `[Transcribe] Success: ${transcription.text.length} chars, lang=${(transcription as any).language}`
      );

      return NextResponse.json({
        success: true,
        transcription: transcription.text,
        language: (transcription as any).language,
        duration: (transcription as any).duration,
      });
    } catch (err: unknown) {
      console.error("[Transcribe] Whisper failed:", err);

      await admin
        .from("meetings")
        .update({ status: "scheduled" } as any)
        .eq("id", meeting_id);

      return NextResponse.json(
        {
          error:
            "Transcription failed: " + (err instanceof Error ? err.message : "Unknown error"),
        },
        { status: 502 }
      );
    }
  } catch (error: unknown) {
    console.error("[Transcribe] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
