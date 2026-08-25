// ============================================================
// Cantaia — AI Supplier Enrichment Service
// ============================================================

import { buildSupplierEnrichPrompt } from "../ai/prompts";
import { MODEL_FOR_TASK, parseAIJson } from "../ai/ai-utils";

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
  const anthropic = new Anthropic({ apiKey: anthropicApiKey, timeout: 60_000 });

  const prompt = buildSupplierEnrichPrompt({
    company_name: supplier.company_name,
    city: supplier.city,
    specialties: supplier.specialties,
    existing_data: {},
  });

  try {
    const response = await anthropic.messages.create({
      model: MODEL_FOR_TASK.supplier_enrichment,
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
    const parsed = parseAIJson<EnrichmentResult>(text);
    if (!parsed) {
      throw new Error("Réponse IA illisible (JSON invalide)");
    }
    // Normalise the arrays the caller depends on.
    return {
      website_found: parsed.website_found ?? false,
      website_url: parsed.website_url,
      additional_contacts: parsed.additional_contacts ?? [],
      certifications_found: parsed.certifications_found ?? [],
      specialties_suggested: parsed.specialties_suggested ?? [],
      company_description: parsed.company_description,
      employee_count_estimate: parsed.employee_count_estimate,
      founded_year: parsed.founded_year,
    };
  } catch (err: any) {
    // The org is debited before this call, so a swallowed failure would bill the
    // user for nothing and show "rien à enrichir". Propagate so the route can
    // classify the error (and, upstream, refund / surface it).
    console.error("[supplier-enricher] AI error:", err?.message || err);
    throw err;
  }
}
