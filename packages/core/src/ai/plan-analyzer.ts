// ============================================================
// Cantaia — AI Plan Analyzer (Vision)
// Uses Claude Vision to analyze construction plan files (PDF/images)
// and extract quantitative data like a professional quantity surveyor
// ============================================================

import {
  buildPlanAnalysisPrompt,
  type PlanAnalysisContext,
} from "./prompts";
import {
  planAnalysisResultSchema,
  type PlanAnalysisResult,
} from "../models/plan-analysis";
import type { ApiUsageCallback } from "../tracking/api-cost-tracker";

const DEFAULT_RESULT: PlanAnalysisResult = {
  plan_type: "other",
  discipline: "Inconnu",
  title_block: null,
  legend_items: [],
  quantities: [],
  observations: ["L'analyse n'a pas pu être effectuée."],
  summary: "Analyse non disponible.",
};

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
  model = "claude-sonnet-4-5-20250929",
  onUsage?: ApiUsageCallback
): Promise<PlanAnalysisResult> {
  console.log(`[analyzePlan] Starting analysis for: "${context.file_name}"`);
  console.log(`[analyzePlan] Plan: ${context.plan_number} — ${context.plan_title}`);
  console.log(`[analyzePlan] File type: ${fileMediaType}, base64 size: ${Math.round(fileBase64.length / 1024)} KB`);

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
    console.error(`[analyzePlan] Unsupported file type: ${fileMediaType}`);
    return DEFAULT_RESULT;
  }

  contentBlocks.push({ type: "text", text: prompt });

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      messages: [{ role: "user", content: contentBlocks }],
    });

    // Fire-and-forget usage tracking
    try {
      onUsage?.({
        model,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });
    } catch { /* tracking must never fail */ }

    // Extract text content from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error("[analyzePlan] No text content in Claude response");
      return DEFAULT_RESULT;
    }

    console.log(`[analyzePlan] Claude response length: ${textBlock.text.length} chars`);

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = textBlock.text.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    const validated = planAnalysisResultSchema.safeParse(parsed);

    if (!validated.success) {
      console.error("[analyzePlan] Invalid Claude response schema:", validated.error.issues);
      console.error("[analyzePlan] Parsed JSON was:", JSON.stringify(parsed).substring(0, 1000));
      // Try to return partial data even if validation fails
      return {
        ...DEFAULT_RESULT,
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
  } catch (error: any) {
    console.error("[analyzePlan] Error:", error?.message || error);
    return DEFAULT_RESULT;
  }
}
