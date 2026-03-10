// ============================================================
// Cantaia — Price Extractor
// Uses Claude AI to extract prices from a supplier's response
// email and match them to submission line items.
// ============================================================

import { buildPriceExtractionPrompt } from "../ai/prompts";

export interface ExtractedPrice {
  item_description: string;
  quantity: number | null;
  unit: string;
  unit_price: number;
  total_price: number;
  conditions?: string;
  discount_percent?: number;
  delivery_days?: number;
}

export interface PriceExtractionResult {
  prices: ExtractedPrice[];
  currency: string;
  validity_date?: string;
  general_conditions?: string;
  raw_total?: number;
}

/**
 * Extract prices from a supplier's response email using Claude AI.
 *
 * Builds a prompt from the email content and submission items, calls
 * the Anthropic API, parses the JSON response, and returns structured
 * pricing data.
 *
 * On error, returns an empty result with currency "CHF" to avoid
 * breaking the caller.
 */
export async function extractPricesFromEmail(
  anthropicApiKey: string,
  emailContent: string,
  submissionItems: { item: string; quantity: number | null; unit: string }[],
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void
): Promise<PriceExtractionResult> {
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 60_000 });

    const prompt = buildPriceExtractionPrompt({
      email_body: emailContent,
      submission_items: submissionItems.map((si, i) => ({
        id: String(i),
        code: String(i + 1),
        description: si.item,
        unit: si.unit,
        quantity: si.quantity,
      })),
    });

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2048,
      messages: [{ role: "user", content: [{ type: "text", text: prompt, cache_control: { type: "ephemeral" } }] }],
    });

    // Fire-and-forget usage callback
    if (onUsage && response.usage) {
      try {
        onUsage({
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        });
      } catch {
        // Usage tracking must never block extraction
      }
    }

    // Extract text content from the response
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { prices: [], currency: "CHF" };
    }

    // Parse JSON — handle ```json blocks
    let jsonStr = textBlock.text.trim();
    const jsonBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Map the AI response to our interface
    const prices: ExtractedPrice[] = (parsed.line_items || []).map(
      (item: any) => ({
        item_description: item.supplier_description || "",
        quantity: item.quantity ?? null,
        unit: item.unit || "",
        unit_price: item.unit_price || 0,
        total_price: item.total_price || 0,
        conditions: item.conditions || undefined,
        discount_percent: parsed.discount_percent || undefined,
        delivery_days: undefined,
      })
    );

    return {
      prices,
      currency: parsed.currency || "CHF",
      validity_date: parsed.validity_days
        ? new Date(
            Date.now() + (parsed.validity_days as number) * 86400000
          ).toISOString()
        : undefined,
      general_conditions: parsed.conditions_text || parsed.payment_terms || undefined,
      raw_total: parsed.total_amount || undefined,
    };
  } catch (err: any) {
    console.error("[price-extractor] AI error:", err?.message || err);
    const status = err?.status;
    if (status === 429 || status === 503 || status === 529) throw err;
    return { prices: [], currency: "CHF" };
  }
}
