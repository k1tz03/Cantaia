/**
 * Visit transcription service
 * Uses OpenAI Whisper API to transcribe visit audio recordings.
 */

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string; // "Conducteur" | "Client" if diarization available
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
  language: string;
  duration: number;
  provider: string;
}

const MOCK_VISIT_TRANSCRIPT = `Bonjour Monsieur et Madame Dupont, merci de me recevoir. Je suis Julien Ray de la société HRS, conducteur de travaux.

Bonjour Monsieur Ray, entrez je vous en prie. Alors comme je vous disais au téléphone, on aimerait refaire complètement la cuisine.

D'accord, je vois. La cuisine actuelle fait environ... attendez que je mesure... 3 mètres 20 par 4 mètres 10, c'est ça ?

Oui, c'est à peu près ça. Et la hauteur sous plafond, elle est de 2,55 mètres.

Parfait, je note. Donc qu'est-ce que vous avez en tête exactement ?

Alors on voudrait ouvrir sur le salon. Il y a ce mur là, on aimerait le démolir pour faire un grand espace ouvert. Et puis mettre un îlot central avec des rangements et un plan de travail en granit.

D'accord, pour le mur il faudra d'abord vérifier s'il est porteur. Je vais faire venir un ingénieur structure. Et pour l'îlot, ça veut dire qu'il faudra déplacer l'arrivée d'eau.

Oui, on a pensé à ça. L'arrivée d'eau est là dans le coin, il faudrait la mettre au milieu pour l'évier de l'îlot.

Je note. Il y a aussi la question de l'électricité, il faudra prévoir des prises sur l'îlot et des luminaires suspendus.

Oui, au moins 4 prises et des suspensions design. On aime bien le style scandinave.

Et pour le sol, vous avez une idée ?

On hésite entre du carrelage grand format imitation béton ciré et de la résine. Qu'est-ce que vous nous conseillez ?

Les deux sont bien. Le carrelage est plus durable et plus facile à remplacer, la résine est plus uniforme mais sensible aux rayures. Pour une cuisine, je conseillerais le carrelage grand format.

D'accord, on va partir sur le carrelage alors.

Pour le budget, vous avez une enveloppe en tête ?

On avait prévu entre 45'000 et 60'000 francs. C'est un peu flexible si la qualité est vraiment au rendez-vous.

C'est un budget réaliste pour ce type de travaux. Et au niveau du timing ?

On aimerait commencer en avril si possible, pour que ce soit fini avant juillet. On part en vacances du 15 au 30 juillet.

D'accord, c'est faisable. Je vous prépare un devis détaillé par corps de métier et on se revoit pour le valider.

Parfait, une dernière chose, on a aussi eu un devis de Batiprix, mais on préfère travailler avec vous si les prix sont dans le même ordre de grandeur.

Je comprends, je ferai un devis compétitif. Je vous l'envoie d'ici la fin de la semaine.

Super, merci beaucoup Monsieur Ray.`;

/** Whisper hard limit is 25 MB — we keep a safety margin. */
const WHISPER_MAX_BYTES = 24 * 1024 * 1024;

/**
 * Transcribe visit audio with the Whisper API.
 *
 * The mock transcript is ONLY returned in local development when no
 * OPENAI_API_KEY is configured. In every other case (production, or a missing
 * / undownloadable audio file) this throws so the caller can mark the visit
 * as failed instead of persisting fictional data as if it were real.
 */
export async function transcribeVisitAudio(
  audioBlob: Blob | null,
  language: string = "fr"
): Promise<TranscriptionResult> {
  const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
  const isDev = process.env.NODE_ENV === "development";

  if (!hasApiKey) {
    if (isDev) {
      console.warn(
        "[Visit Transcription] DEV ONLY — no OPENAI_API_KEY, returning mock transcript"
      );
      return {
        text: MOCK_VISIT_TRANSCRIPT,
        segments: parseMockSegments(MOCK_VISIT_TRANSCRIPT),
        language: "fr",
        duration: 2712, // ~45 min
        provider: "mock",
      };
    }
    throw new Error(
      "Transcription indisponible : la clé OPENAI_API_KEY n'est pas configurée."
    );
  }

  if (!audioBlob) {
    throw new Error(
      "Transcription impossible : le fichier audio est introuvable ou n'a pas pu être téléchargé."
    );
  }

  // Files above the Whisper limit must be compressed client-side
  // (see @/lib/audio/compress-audio) before reaching this function.
  if (audioBlob.size > WHISPER_MAX_BYTES) {
    throw new Error(
      `Fichier audio trop volumineux (${(audioBlob.size / (1024 * 1024)).toFixed(1)} MB). ` +
        "La limite de transcription est de 24 MB — compressez l'enregistrement avant de réessayer."
    );
  }

  console.log(`[Visit Transcription] Calling Whisper API... (${(audioBlob.size / (1024 * 1024)).toFixed(1)} MB)`);

  const formData = new FormData();
  formData.append("file", audioBlob, "recording.webm");
  formData.append("model", "whisper-1");
  formData.append("language", language);
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "segment");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Visit Transcription] Whisper API error:", errText);
    throw new Error(`Transcription failed: ${errText}`);
  }

  const result = await response.json();

  const segments: TranscriptionSegment[] = (result.segments || []).map((s: any) => ({
    start: s.start,
    end: s.end,
    text: s.text.trim(),
  }));

  console.log(`[Visit Transcription] Success: ${result.text.length} chars, ${Math.round(result.duration)}s, ${segments.length} segments`);

  return {
    text: result.text,
    segments,
    language: result.language || language,
    duration: Math.round(result.duration || 0),
    provider: "whisper",
  };
}

function parseMockSegments(text: string): TranscriptionSegment[] {
  const paragraphs = text.split("\n\n").filter(Boolean);
  let time = 0;
  return paragraphs.map((p) => {
    const start = time;
    const duration = Math.max(5, p.length / 15); // rough estimate
    time += duration;
    return {
      start,
      end: time,
      text: p.trim(),
    };
  });
}
