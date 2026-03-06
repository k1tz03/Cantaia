// ============================================================
// Cantaia — AI Supplier Search Service
// ============================================================

import { buildSupplierSearchPrompt, type SupplierSearchContext } from "../ai/prompts";

export interface AISupplierSuggestion {
  company_name: string;
  contact_info: {
    email?: string;
    phone?: string;
    website?: string;
    address?: string;
    city?: string;
    postal_code?: string;
  };
  specialties: string[];
  cfc_codes: string[];
  certifications: string[];
  reasoning: string;
  confidence: number;
}

export interface SupplierSearchResult {
  suggestions: AISupplierSuggestion[];
}

export async function searchSuppliersAI(
  anthropicApiKey: string,
  params: {
    cfc_codes: string[];
    specialty: string;
    geo_zone: string;
    project_description?: string;
  },
  existingSupplierNames: string[],
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void
): Promise<SupplierSearchResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic({ apiKey: anthropicApiKey, timeout: 60_000 });

  const ctx: SupplierSearchContext = {
    cfc_codes: params.cfc_codes,
    specialty: params.specialty,
    geo_zone: params.geo_zone,
    project_description: params.project_description,
    existing_suppliers: existingSupplierNames,
    language: "fr",
  };

  const prompt = buildSupplierSearchPrompt(ctx);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  if (onUsage) {
    try {
      onUsage({
        input_tokens: response.usage?.input_tokens || 0,
        output_tokens: response.usage?.output_tokens || 0,
      });
    } catch { /* fire-and-forget */ }
  }

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      suggestions: (parsed.suggestions || []).filter(
        (s: AISupplierSuggestion) => s.confidence >= 0.6
      ),
    };
  } catch (err) {
    console.error("[supplier-search] Failed to parse AI response:", err);
    return { suggestions: [] };
  }
}
