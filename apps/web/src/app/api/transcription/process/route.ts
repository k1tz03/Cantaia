import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const USE_MOCK_TRANSCRIPTION = process.env.USE_MOCK_TRANSCRIPTION === "true";

const MOCK_TRANSCRIPT = `Bien, on commence. Bonjour à tous, merci d'être présents. On fait un rapide tour de table pour les remarques générales.

Alors pour le gros-œuvre, M. Martin, où en est-on sur les niveaux 3 et 4 ?

Les dalles du niveau 3 sont coulées depuis mardi. On a commencé le coffrage du 4 mais on a pris 3 jours de retard à cause de la pluie de la semaine passée. On devrait rattraper une partie sur les prochains jours.

D'accord, le retard est noté. On adaptera le planning. Autre sujet important, Mme Renaud, vous aviez signalé un conflit de passage ?

Oui, au niveau 2, les chemins de câbles et les gaines CVC se croisent à la zone B. Il faudrait qu'on organise une réunion de coordination rapidement. M. Keller n'est pas là aujourd'hui mais c'est urgent.

Entendu, je planifie ça cette semaine. M. Dupont, vous pouvez nous envoyer les plans de réservations mis à jour ?

Oui, je les envoie d'ici jeudi.

Parfait. Pour le planning des 3 prochaines semaines, on priorise le rattrapage du retard gros-œuvre. Les lots secondaires, sanitaire et électricité, peuvent commencer les installations au niveau 1 dès le 20 février.

M. Bonvin, on attend toujours la validation des plans B2 pour les façades. Vous pouvez nous confirmer ?

Oui, je m'en occupe, ce sera fait d'ici vendredi.

Très bien. Prochaine séance le 22 février, même heure, même endroit. Merci à tous.`;

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get("audio") as File | null;
    const meetingId = formData.get("meeting_id") as string | null;

    if (!meetingId) {
      return NextResponse.json({ error: "meeting_id required" }, { status: 400 });
    }

    if (!audioFile && !USE_MOCK_TRANSCRIPTION) {
      return NextResponse.json({ error: "audio file required" }, { status: 400 });
    }

    if (process.env.NODE_ENV === "development") console.log(
      `[Transcription] Processing meeting ${meetingId}`,
      audioFile ? `audio: ${audioFile.name} (${(audioFile.size / (1024 * 1024)).toFixed(1)} MB)` : "(mock mode)"
    );

    let transcript: string;
    let audioDurationSeconds = 0;

    if (USE_MOCK_TRANSCRIPTION || !process.env.OPENAI_API_KEY) {
      // Mock transcription
      if (process.env.NODE_ENV === "development") console.log("[Transcription] Using mock transcription");
      transcript = MOCK_TRANSCRIPT;
      audioDurationSeconds = 4980;
    } else {
      // Real OpenAI Whisper transcription
      if (process.env.NODE_ENV === "development") console.log("[Transcription] Calling OpenAI Whisper API...");

      const openaiFormData = new FormData();
      openaiFormData.append("file", audioFile!);
      openaiFormData.append("model", "whisper-1");
      openaiFormData.append("language", "fr");
      openaiFormData.append("response_format", "verbose_json");

      const whisperResponse = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: openaiFormData,
        }
      );

      if (!whisperResponse.ok) {
        const errText = await whisperResponse.text();
        console.error("[Transcription] Whisper API error:", errText);
        return NextResponse.json(
          { error: "Transcription failed", details: errText },
          { status: 502 }
        );
      }

      const whisperResult = await whisperResponse.json();
      transcript = whisperResult.text;
      audioDurationSeconds = Math.round(whisperResult.duration || 0);

      if (process.env.NODE_ENV === "development") console.log(
        `[Transcription] Success: ${transcript.length} chars, ${audioDurationSeconds}s`
      );

      // Log API usage (full tracking with Supabase will be added when auth context is available)
      if (process.env.NODE_ENV === "development") console.log("[Transcription] Usage:", {
        action: "pv_transcribe",
        model: "whisper-1",
        audio_seconds: audioDurationSeconds,
      });
    }

    // In production, would update the meeting in Supabase:
    // UPDATE meetings SET transcript_text = ?, audio_duration_seconds = ?, status = 'generating_pv'
    // For now, just return the transcript

    return NextResponse.json({
      success: true,
      meeting_id: meetingId,
      transcript,
      audio_duration_seconds: audioDurationSeconds,
      transcript_length: transcript.length,
    });
  } catch (error) {
    console.error("[Transcription] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
