// ============================================================
// Cantaia — AI Plan Analyzer (Vision)
// Uses Claude Vision to analyze construction plan files (PDF/images)
// and extract quantitative data like a professional quantity surveyor
// ============================================================

import {
  buildPlanAnalysisPrompt,
  type PlanAnalysisContext,
} from "./prompts";
import { MODEL_FOR_TASK, callAnthropicWithRetry, parseAIJson } from "./ai-utils";
import {
  planAnalysisResultSchema,
  type PlanAnalysisResult,
} from "../models/plan-analysis";
import type { ApiUsageCallback } from "../tracking/api-cost-tracker";

/**
 * Échec DUR de l'analyse (type non supporté, réponse illisible ou tronquée).
 *
 * Contrat : `analyzePlan` LÈVE cette erreur plutôt que de renvoyer un résultat
 * vide "complété". La route persiste alors un statut `failed` (jamais mis en
 * cache) et rembourse les crédits — l'ancien comportement enregistrait un
 * résultat vide en `completed`, facturé et mis en cache, qui bloquait toute
 * nouvelle tentative. Les erreurs réseau/surcharge (429/503/529) remontent
 * telles quelles pour être classées par `classifyAIError`.
 */
export class PlanAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanAnalysisError";
  }
}

// Supported media types for Claude Vision
type DocumentMediaType = "application/pdf";
type ImageMediaType = "image/png" | "image/jpeg" | "image/gif" | "image/webp";

function isDocumentType(mediaType: string): mediaType is DocumentMediaType {
  return mediaType === "application/pdf";
}

function isImageType(mediaType: string): mediaType is ImageMediaType {
  return ["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mediaType);
}

/**
 * Analyze a construction plan using Claude Vision.
 * Sends the plan file (PDF or image) to Claude and extracts structured data.
 */
export async function analyzePlan(
  anthropicApiKey: string,
  fileBase64: string,
  fileMediaType: string,
  context: PlanAnalysisContext,
  model = MODEL_FOR_TASK.plan_analysis,
  onUsage?: ApiUsageCallback
): Promise<PlanAnalysisResult> {
  if (process.env.NODE_ENV === "development") {
    console.log(`[analyzePlan] Starting analysis for: "${context.file_name}"`);
    console.log(`[analyzePlan] Plan: ${context.plan_number} — ${context.plan_title}`);
    console.log(`[analyzePlan] File type: ${fileMediaType}, base64 size: ${Math.round(fileBase64.length / 1024)} KB`);
  }

  const prompt = buildPlanAnalysisPrompt(context);

  // Build content blocks: file + text prompt
  const contentBlocks: any[] = [];

  if (isDocumentType(fileMediaType)) {
    contentBlocks.push({
      type: "document",
      source: {
        type: "base64",
        media_type: fileMediaType,
        data: fileBase64,
      },
    });
  } else if (isImageType(fileMediaType)) {
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: fileMediaType,
        data: fileBase64,
      },
    });
  } else {
    // Type non supporté : échec dur (jamais mis en cache/facturé côté route).
    throw new PlanAnalysisError(`Type de fichier non supporté pour l'analyse : ${fileMediaType}`);
  }

  contentBlocks.push({ type: "text", text: prompt });

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // maxRetries: 0 — la stratégie de retry est portée par callAnthropicWithRetry
  // (sinon le SDK ajoute ses 2 retries par-dessus, soit un double retry sur un
  // appel Vision facturé lourd).
  const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 90_000, maxRetries: 0 });

  // Les erreurs réseau/surcharge (429/503/529) remontent : la route les classe
  // via classifyAIError. Les erreurs client (400/401/403) ne sont pas retentées.
  const response = await callAnthropicWithRetry(() =>
    client.messages.create({
      model,
      max_tokens: 8000,
      messages: [{ role: "user", content: contentBlocks }],
    })
  );

  // Fire-and-forget usage tracking
  try {
    onUsage?.({
      model,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });
  } catch { /* tracking must never fail */ }

  // Troncature = échec explicite : un JSON coupé donnerait des quantités
  // partielles présentées comme complètes.
  if (response.stop_reason === "max_tokens") {
    throw new PlanAnalysisError(
      "Réponse du modèle tronquée (plan trop dense) — analyse non fiable."
    );
  }

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new PlanAnalysisError("Réponse du modèle sans contenu texte.");
  }

  if (process.env.NODE_ENV === "development") {
    console.log(`[analyzePlan] Claude response length: ${textBlock.text.length} chars`);
  }

  // Parser tolérant partagé (fences markdown, virgules traînantes, préambules).
  const parsed = parseAIJson<Record<string, any>>(textBlock.text);
  if (!parsed || typeof parsed !== "object") {
    throw new PlanAnalysisError("Réponse du modèle illisible (JSON invalide).");
  }

  const validated = planAnalysisResultSchema.safeParse(parsed);

  if (!validated.success) {
    console.error("[analyzePlan] Invalid Claude response schema:", validated.error.issues);
    // Données partielles exploitables : on les retourne plutôt que d'échouer,
    // MAIS seulement si le modèle a produit au moins des quantités ou un type.
    const hasSignal =
      Array.isArray(parsed.quantities) && parsed.quantities.length > 0;
    if (!hasSignal) {
      throw new PlanAnalysisError(
        "Réponse du modèle non conforme et sans quantité exploitable."
      );
    }
    return {
      plan_type: parsed.plan_type || "other",
      discipline: parsed.discipline || "Inconnu",
      title_block: parsed.title_block || null,
      legend_items: Array.isArray(parsed.legend_items) ? parsed.legend_items : [],
      quantities: Array.isArray(parsed.quantities) ? parsed.quantities : [],
      observations: Array.isArray(parsed.observations) ? parsed.observations : [],
      summary: parsed.summary || "Analyse partielle — certains champs n'ont pas pu être validés.",
    };
  }

  console.log(`[analyzePlan] Analysis complete: ${validated.data.plan_type}, ${validated.data.quantities.length} quantities found`);
  return validated.data;
}
