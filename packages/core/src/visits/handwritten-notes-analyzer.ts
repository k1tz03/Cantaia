/**
 * Handwritten Notes Analyzer — Claude Vision
 * Transcribes handwritten notes, recognizes sketches/diagrams, extracts measurements.
 */

import type { HandwrittenNotesAnalysis } from "@cantaia/database";

export interface AnalyzeNotesInput {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  context?: {
    client_name?: string;
    visit_date?: string;
    project_type?: string;
  };
}

export interface AnalyzeNotesResult {
  analysis: HandwrittenNotesAnalysis;
  tokens_used: number;
  latency_ms: number;
}

const HANDWRITTEN_NOTES_PROMPT = `Tu es un expert en reconnaissance d'écriture manuscrite spécialisé dans les notes de chantier de construction en Suisse.

Analyse cette photo de notes manuscrites et extrais TOUTES les informations :

1. **TRANSCRIPTION** : Transcris intégralement le texte manuscrit, en respectant la mise en page (listes, puces, titres).
   - Gère l'écriture cursive, les abréviations techniques (CFC, m², ml, pce, etc.)
   - Si un mot est illisible, indique-le avec [illisible]

2. **CROQUIS ET SCHÉMAS** : Décris chaque croquis, schéma ou dessin présent :
   - Ce qu'il représente (plan, coupe, détail, etc.)
   - Les dimensions annotées
   - Les flèches et annotations

3. **MESURES** : Extrais toutes les dimensions et mesures mentionnées :
   - Longueurs, largeurs, hauteurs, surfaces, volumes
   - Avec leur unité (m, cm, mm, m², m³, ml)
   - Le contexte de la mesure (quelle zone, quel élément)

4. **LANGUE** : Détecte la langue principale (fr, de, en, it)

Réponds UNIQUEMENT en JSON :
{
  "transcribed_text": "Texte complet transcrit, avec retours à la ligne préservés",
  "sketches": [
    {
      "description": "Description détaillée du croquis",
      "location": "Position sur la feuille (haut-gauche, centre, etc.)"
    }
  ],
  "measurements_found": [
    {
      "value": "3.20",
      "unit": "m",
      "context": "Largeur de la cuisine"
    }
  ],
  "language_detected": "fr",
  "confidence": 0.85
}

RÈGLES :
- Sois exhaustif : transcris TOUT le texte visible
- Les abréviations techniques suisses sont courantes (CFC, SIA, AEAI, etc.)
- Les croquis de chantier incluent souvent des coupes, des plans au sol, des détails de raccord
- La confiance (0-1) reflète la lisibilité globale des notes`;

export async function analyzeHandwrittenNotes(
  input: AnalyzeNotesInput
): Promise<AnalyzeNotesResult> {
  const start = Date.now();

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ timeout: 90_000 });

  const contextInfo = input.context
    ? `\n\nContexte de la visite :\n- Client : ${input.context.client_name || "Non spécifié"}\n- Date : ${input.context.visit_date || "Non spécifiée"}\n- Type : ${input.context.project_type || "Non spécifié"}`
    : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    system: HANDWRITTEN_NOTES_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mediaType,
              data: input.imageBase64,
            },
          },
          {
            type: "text",
            text: `Analyse ces notes manuscrites de visite de chantier.${contextInfo}`,
          },
        ],
      },
      {
        role: "assistant",
        content: "{",
      },
    ],
  });

  const latency_ms = Date.now() - start;
  const tokens_used = response.usage.input_tokens + response.usage.output_tokens;

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const fullJson = "{" + text;

  let analysis: HandwrittenNotesAnalysis;
  try {
    const jsonMatch = fullJson.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    analysis = JSON.parse(jsonMatch[0]);
  } catch {
    // Fallback: construct a minimal result
    analysis = {
      transcribed_text: text.length > 50 ? text : "Analyse échouée — réessayez",
      sketches: [],
      measurements_found: [],
      language_detected: "fr",
      confidence: 0.1,
    };
  }

  // Validate required fields
  if (!analysis.transcribed_text) analysis.transcribed_text = "";
  if (!analysis.sketches) analysis.sketches = [];
  if (!analysis.measurements_found) analysis.measurements_found = [];
  if (!analysis.language_detected) analysis.language_detected = "fr";
  if (typeof analysis.confidence !== "number") analysis.confidence = 0.5;

  return { analysis, tokens_used, latency_ms };
}
