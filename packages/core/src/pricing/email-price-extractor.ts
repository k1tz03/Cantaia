// ============================================================
// Cantaia — Email Price Extractor
// Extracts pricing data from supplier emails (body + PDF)
// ============================================================

import {
  buildFreeFormPriceExtractionPrompt,
  type FreeFormPriceExtractionContext,
} from "../ai/prompts";

const AI_MODEL = "claude-sonnet-4-5-20250929";

// ---------- Interfaces ----------

export interface ExtractedSupplierInfo {
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  website: string | null;
  specialties: string[];
}

export interface ExtractedLineItem {
  description: string;
  quantity: number | null;
  unit: string;
  unit_price: number;
  total_price: number | null;
  cfc_code: string | null;
}

export interface OfferSummary {
  total_amount: number | null;
  currency: string;
  vat_included: boolean;
  vat_rate: number | null;
  payment_terms: string | null;
  validity_days: number | null;
  delivery_included: boolean | null;
  discount_percent: number | null;
  conditions_text: string | null;
}

export interface EmailPriceExtractionResult {
  emailId: string;
  source_type: "email_body" | "pdf_attachment";
  attachment_name?: string;
  has_prices: boolean;
  supplier_info: ExtractedSupplierInfo;
  line_items: ExtractedLineItem[];
  offer_summary: OfferSummary;
  ai_confidence: number;
  project_reference: string | null;
}

interface ExtractionInput {
  emailId: string;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  projectName: string | null;
}

// ---------- Pre-filter (no AI) ----------

const PRICE_KEYWORDS_FR = [
  "offre", "devis", "prix", "chiffrage", "estimation", "soumission",
  "montant", "tarif", "facture", "pro forma", "budget",
  "CHF", "Fr.", "francs",
];

const PRICE_KEYWORDS_DE = [
  "angebot", "offerte", "preis", "kosten", "kalkulation",
  "rechnung", "betrag", "pauschale",
];

const PRICE_KEYWORDS_EN = [
  "quote", "quotation", "proposal", "pricing", "estimate", "invoice",
];

const ALL_KEYWORDS = [
  ...PRICE_KEYWORDS_FR,
  ...PRICE_KEYWORDS_DE,
  ...PRICE_KEYWORDS_EN,
];

const BLOCKLIST_DOMAINS = [
  "newsletter", "noreply", "no-reply", "info@", "marketing",
  "linkedin.com", "facebook.com", "twitter.com",
];

/**
 * Quick pre-filter to identify emails that likely contain pricing info.
 * Returns true if the email should be sent to AI for extraction.
 */
export function isPriceResponseEmail(
  subject: string,
  bodyPreview: string,
  senderEmail: string
): boolean {
  // Block obvious non-price emails
  const senderLower = senderEmail.toLowerCase();
  if (BLOCKLIST_DOMAINS.some((d) => senderLower.includes(d))) return false;

  const text = `${subject} ${bodyPreview}`.toLowerCase();

  // Check for price keywords
  const hasKeyword = ALL_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
  if (hasKeyword) return true;

  // Check for price patterns (numbers with currency)
  const hasPricePattern = /\d[\d\s'.,]*(?:chf|fr\.|eur|€|sfr)/i.test(text);
  if (hasPricePattern) return true;

  // Check for structured price indicators
  const hasUnitPrice = /prix\s*unitaire|pu\s*[:=]|unit\s*price|einheitspreis/i.test(text);
  if (hasUnitPrice) return true;

  return false;
}

// ---------- Extract from email body ----------

export async function extractPricesFromEmailBody(
  input: ExtractionInput & { bodyText: string },
  anthropicApiKey: string,
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void
): Promise<EmailPriceExtractionResult> {
  const ctx: FreeFormPriceExtractionContext = {
    content: input.bodyText.substring(0, 15000), // limit to 15K chars
    sender_email: input.senderEmail,
    sender_name: input.senderName,
    subject: input.subject,
    project_name: input.projectName,
    content_type: "email_body",
  };

  const result = await callExtractionAI(ctx, anthropicApiKey, onUsage);

  return {
    emailId: input.emailId,
    source_type: "email_body",
    ...result,
  };
}

// ---------- Extract from PDF attachment ----------

export async function extractPricesFromPdf(
  input: ExtractionInput & {
    attachmentName: string;
    contentBase64: string;
    contentType: string;
  },
  anthropicApiKey: string,
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void
): Promise<EmailPriceExtractionResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const prompt = `Tu es un expert en analyse d'offres de prix pour la construction en Suisse.

CONTEXTE :
- Document PDF joint à un email de : ${input.senderName || "Inconnu"} <${input.senderEmail}>
- Objet de l'email : ${input.subject}
- Fichier : ${input.attachmentName}
${input.projectName ? `- Projet : ${input.projectName}` : ""}

Analyse ce document PDF et extrais TOUTES les informations de prix, le fournisseur, les conditions, et la référence projet/chantier.

ÉTAPES :
A) FOURNISSEUR : raison sociale, contact, email, téléphone, adresse, site web, spécialités
B) POSTES DE PRIX : description, quantité, unité, prix unitaire, prix total, code CFC
C) CONDITIONS : total, TVA, paiement, validité, livraison, remise
D) RÉFÉRENCE PROJET/CHANTIER : cherche dans l'en-tête, objet, corps et pied de page une référence au projet ou chantier. Indices : "Concerne", "Objet", "Chantier", "Projet", "Ref", "Votre référence", "Bauvorhaben", "Objekt", "Betrifft", "N° affaire", "Dossier". Extrais le nom complet (ex: "Résidence Les Tilleuls"). Si aucune → null.

Réponds UNIQUEMENT en JSON avec le format :
{
  "has_prices": true/false,
  "supplier_info": { "company_name": "", "contact_name": null, "email": null, "phone": null, "address": null, "postal_code": null, "city": null, "website": null, "specialties": [] },
  "line_items": [{ "description": "", "quantity": null, "unit": "", "unit_price": 0, "total_price": null, "cfc_code": null }],
  "offer_summary": { "total_amount": null, "currency": "CHF", "vat_included": false, "vat_rate": null, "payment_terms": null, "validity_days": null, "delivery_included": null, "discount_percent": null, "conditions_text": null },
  "project_reference": "Nom du projet ou chantier mentionné dans le document",
  "confidence": 0.85
}

RÈGLES :
1. Si le document ne contient PAS de prix → { "has_prices": false, "confidence": 0.9 }
2. Extrais le fournisseur depuis l'en-tête/logo du document
3. Ne pas inventer de prix
4. Monnaie par défaut : CHF
5. project_reference : extrais le nom du chantier/projet tel qu'indiqué dans le document`;

  try {
    const mediaType = input.contentType === "application/pdf"
      ? "application/pdf" as const
      : "application/pdf" as const;

    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 8192,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: mediaType,
              data: input.contentBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      }],
    });

    onUsage?.({
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
    });

    const parsed = parseAIResponse(response);

    return {
      emailId: input.emailId,
      source_type: "pdf_attachment",
      attachment_name: input.attachmentName,
      ...parsed,
    };
  } catch (error: any) {
    console.error(`[email-price-extractor] PDF extraction error for "${input.attachmentName}":`, error?.message);
    return {
      emailId: input.emailId,
      source_type: "pdf_attachment",
      attachment_name: input.attachmentName,
      has_prices: false,
      supplier_info: buildEmptySupplier(input.senderEmail, input.senderName),
      line_items: [],
      offer_summary: buildEmptyOfferSummary(),
      ai_confidence: 0,
      project_reference: null,
    };
  }
}

// ---------- Internal helpers ----------

async function callExtractionAI(
  ctx: FreeFormPriceExtractionContext,
  anthropicApiKey: string,
  onUsage?: (usage: { input_tokens: number; output_tokens: number }) => void
): Promise<Omit<EmailPriceExtractionResult, "emailId" | "source_type" | "attachment_name">> {
  const prompt = buildFreeFormPriceExtractionPrompt(ctx);

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    onUsage?.({
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
    });

    return parseAIResponse(response);
  } catch (error: any) {
    console.error("[email-price-extractor] AI extraction error:", error?.message);
    return {
      has_prices: false,
      supplier_info: buildEmptySupplier(ctx.sender_email, ctx.sender_name),
      line_items: [],
      offer_summary: buildEmptyOfferSummary(),
      ai_confidence: 0,
      project_reference: null,
    };
  }
}

function parseAIResponse(response: any): Omit<EmailPriceExtractionResult, "emailId" | "source_type" | "attachment_name"> {
  const textBlock = response.content?.find((b: any) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return {
      has_prices: false,
      supplier_info: { company_name: "", contact_name: null, email: null, phone: null, address: null, postal_code: null, city: null, website: null, specialties: [] },
      line_items: [],
      offer_summary: buildEmptyOfferSummary(),
      ai_confidence: 0,
      project_reference: null,
    };
  }

  try {
  let jsonStr = textBlock.text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

  const parsed = JSON.parse(jsonStr);

  return {
    has_prices: parsed.has_prices ?? false,
    supplier_info: {
      company_name: parsed.supplier_info?.company_name || "",
      contact_name: parsed.supplier_info?.contact_name || null,
      email: parsed.supplier_info?.email || null,
      phone: parsed.supplier_info?.phone || null,
      address: parsed.supplier_info?.address || null,
      postal_code: parsed.supplier_info?.postal_code || null,
      city: parsed.supplier_info?.city || null,
      website: parsed.supplier_info?.website || null,
      specialties: parsed.supplier_info?.specialties || [],
    },
    line_items: (parsed.line_items || []).map((li: any) => ({
      description: li.description || "",
      quantity: li.quantity ?? null,
      unit: li.unit || "",
      unit_price: Number(li.unit_price) || 0,
      total_price: li.total_price != null ? Number(li.total_price) : null,
      cfc_code: li.cfc_code || null,
    })),
    offer_summary: {
      total_amount: parsed.offer_summary?.total_amount != null ? Number(parsed.offer_summary.total_amount) : null,
      currency: parsed.offer_summary?.currency || "CHF",
      vat_included: parsed.offer_summary?.vat_included ?? false,
      vat_rate: parsed.offer_summary?.vat_rate ?? null,
      payment_terms: parsed.offer_summary?.payment_terms || null,
      validity_days: parsed.offer_summary?.validity_days ?? null,
      delivery_included: parsed.offer_summary?.delivery_included ?? null,
      discount_percent: parsed.offer_summary?.discount_percent ?? null,
      conditions_text: parsed.offer_summary?.conditions_text || null,
    },
    ai_confidence: parsed.confidence ?? 0,
    project_reference: parsed.project_reference || null,
  };
  } catch (parseError: any) {
    console.error("[email-price-extractor] JSON parse error:", parseError?.message);
    console.error("[email-price-extractor] Raw text (first 500 chars):", textBlock.text.substring(0, 500));
    return {
      has_prices: false,
      supplier_info: { company_name: "", contact_name: null, email: null, phone: null, address: null, postal_code: null, city: null, website: null, specialties: [] },
      line_items: [],
      offer_summary: buildEmptyOfferSummary(),
      ai_confidence: 0,
      project_reference: null,
    };
  }
}

function buildEmptySupplier(email: string, name: string | null): ExtractedSupplierInfo {
  return {
    company_name: name || email.split("@")[1]?.split(".")[0] || "",
    contact_name: name,
    email,
    phone: null,
    address: null,
    postal_code: null,
    city: null,
    website: null,
    specialties: [],
  };
}

function buildEmptyOfferSummary(): OfferSummary {
  return {
    total_amount: null,
    currency: "CHF",
    vat_included: false,
    vat_rate: null,
    payment_terms: null,
    validity_days: null,
    delivery_included: null,
    discount_percent: null,
    conditions_text: null,
  };
}
