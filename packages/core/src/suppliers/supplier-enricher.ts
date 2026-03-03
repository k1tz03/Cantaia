// ============================================================
// Cantaia — AI Supplier Enrichment Service
// ============================================================

import { buildSupplierEnrichPrompt } from "../ai/prompts";

export interface EnrichmentResult {
  website_found: boolean;
  website_url?: string;
  additional_contacts: { name: string; role: string; email?: string; phone?: string }[];
  certifications_found: string[];
  specialties_suggested: string[];
  company_description?: string;
  employee_count_estimate?: string;
  founded_year?: number;
}

export async function enrichSupplier(
  anthropicApiKey: string,
  supplier: { company_name: string; city?: string; specialties: string[] },
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void
): Promise<EnrichmentResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const anthropic = new Anthropic({ apiKey: anthropicApiKey });

  const prompt = buildSupplierEnrichPrompt({
    company_name: supplier.company_name,
    city: supplier.city,
    specialties: supplier.specialties,
    existing_data: {},
  });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
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
    return JSON.parse(jsonStr) as EnrichmentResult;
  } catch (err) {
    console.error("[supplier-enricher] Failed to parse AI response:", err);
    return {
      website_found: false,
      additional_contacts: [],
      certifications_found: [],
      specialties_suggested: [],
    };
  }
}
