// ============================================================
// Cantaia — Price Import Service
// Imports confirmed extracted prices into suppliers, offers, and line items
// ============================================================

import { normalizeDescription } from "./auto-estimator";
import type { EmailPriceExtractionResult, ExtractedSupplierInfo } from "./email-price-extractor";

// ---------- Interfaces ----------

export interface ImportPriceDataInput {
  supabase: any; // admin client
  organizationId: string;
  userId: string;
  jobId: string;
  confirmedResults: EmailPriceExtractionResult[];
}

export interface ImportResult {
  suppliersCreated: number;
  suppliersMatched: number;
  offersCreated: number;
  lineItemsCreated: number;
}

// ---------- Unit normalization ----------

const UNIT_MAP: Record<string, string> = {
  "m²": "m2", "m2": "m2", "m 2": "m2",
  "m³": "m3", "m3": "m3", "m 3": "m3",
  "ml": "ml", "m": "ml", "mètre": "ml", "mètre linéaire": "ml", "lm": "ml",
  "pce": "pce", "pièce": "pce", "pièces": "pce", "pcs": "pce", "stk": "pce", "stück": "pce",
  "kg": "kg", "kilogramme": "kg",
  "t": "t", "tonne": "t",
  "h": "h", "heure": "h", "heures": "h", "std": "h", "stunde": "h",
  "j": "j", "jour": "j", "jours": "j", "tag": "j",
  "fft": "fft", "forfait": "fft", "gl": "fft", "global": "fft", "pauschal": "fft",
  "l": "l", "litre": "l", "liter": "l",
};

function normalizeUnit(unit: string): string {
  const lower = unit.toLowerCase().trim();
  return UNIT_MAP[lower] || lower;
}

// ---------- Supplier resolution ----------

async function findOrCreateSupplier(
  supabase: any,
  organizationId: string,
  userId: string,
  info: ExtractedSupplierInfo
): Promise<{ id: string; isNew: boolean }> {
  // 1. Match by email (most reliable)
  if (info.email) {
    const { data: byEmail } = await supabase
      .from("suppliers")
      .select("id")
      .eq("organization_id", organizationId)
      .ilike("email", info.email.toLowerCase().trim())
      .maybeSingle();

    if (byEmail) return { id: byEmail.id, isNew: false };
  }

  // 2. Match by company name (fuzzy)
  if (info.company_name) {
    const normalized = info.company_name.toLowerCase().trim();
    const { data: byName } = await supabase
      .from("suppliers")
      .select("id, company_name")
      .eq("organization_id", organizationId)
      .eq("status", "active");

    if (byName) {
      const match = byName.find((s: any) => {
        const sName = s.company_name?.toLowerCase().trim() || "";
        return sName === normalized || sName.includes(normalized) || normalized.includes(sName);
      });
      if (match) return { id: match.id, isNew: false };
    }
  }

  // 3. Create new supplier
  const { data: newSupplier, error } = await supabase
    .from("suppliers")
    .insert({
      organization_id: organizationId,
      company_name: info.company_name || "Fournisseur inconnu",
      contact_name: info.contact_name,
      email: info.email,
      phone: info.phone,
      address: info.address,
      city: info.city,
      postal_code: info.postal_code,
      country: "CH",
      website: info.website,
      specialties: info.specialties || [],
      cfc_codes: [],
      status: "active",
      created_by: userId,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[price-import] Supplier creation error:", error);
    throw new Error(`Failed to create supplier: ${error.message}`);
  }

  return { id: newSupplier.id, isNew: true };
}

// ---------- Main import function ----------

export async function importExtractedPrices(
  input: ImportPriceDataInput
): Promise<ImportResult> {
  const { supabase, organizationId, userId, jobId, confirmedResults } = input;

  let suppliersCreated = 0;
  let suppliersMatched = 0;
  let offersCreated = 0;
  let lineItemsCreated = 0;

  // Group by email + supplier to avoid duplicate supplier lookups
  for (const result of confirmedResults) {
    if (!result.has_prices || result.line_items.length === 0) continue;

    try {
      // Resolve supplier
      const supplier = await findOrCreateSupplier(supabase, organizationId, userId, result.supplier_info);
      if (supplier.isNew) suppliersCreated++;
      else suppliersMatched++;

      // Determine project_id from the source email
      const { data: emailRecord } = await supabase
        .from("email_records")
        .select("project_id")
        .eq("id", result.emailId)
        .maybeSingle();

      const projectId = emailRecord?.project_id || null;

      // Create supplier_offer
      const { data: offer, error: offerError } = await supabase
        .from("supplier_offers")
        .insert({
          supplier_id: supplier.id,
          project_id: projectId,
          organization_id: organizationId,
          source_type: result.source_type === "pdf_attachment" ? "pdf" : "email",
          source_email_id: result.emailId,
          total_amount: result.offer_summary.total_amount,
          currency: result.offer_summary.currency || "CHF",
          vat_included: result.offer_summary.vat_included || false,
          vat_rate: result.offer_summary.vat_rate,
          payment_terms: result.offer_summary.payment_terms,
          validity_days: result.offer_summary.validity_days,
          delivery_included: result.offer_summary.delivery_included,
          discount_percent: result.offer_summary.discount_percent,
          conditions_text: result.offer_summary.conditions_text,
          ai_parsed: true,
          ai_confidence: result.ai_confidence,
          status: "parsed",
          received_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (offerError) {
        console.error("[price-import] Offer creation error:", offerError);
        continue;
      }

      offersCreated++;

      // Create offer_line_items
      const lineItemRows = result.line_items.map((li) => ({
        offer_id: offer.id,
        supplier_id: supplier.id,
        project_id: projectId,
        organization_id: organizationId,
        unit_price: li.unit_price,
        total_price: li.total_price ?? (li.quantity != null ? li.unit_price * li.quantity : null),
        currency: result.offer_summary.currency || "CHF",
        supplier_description: li.description,
        supplier_quantity: li.quantity,
        supplier_unit: li.unit,
        normalized_description: normalizeDescription(li.description),
        cfc_subcode: li.cfc_code || null,
        unit_normalized: normalizeUnit(li.unit),
        match_confidence: result.ai_confidence,
        status: "proposed",
      }));

      if (lineItemRows.length > 0) {
        const { error: itemsError } = await supabase
          .from("offer_line_items")
          .insert(lineItemRows);

        if (itemsError) {
          console.error("[price-import] Line items insert error:", itemsError);
        } else {
          lineItemsCreated += lineItemRows.length;
        }
      }
    } catch (err: any) {
      console.error(`[price-import] Error importing result for email ${result.emailId}:`, err?.message);
    }
  }

  // Update job
  await supabase
    .from("price_extraction_jobs")
    .update({
      status: "completed",
      imported_items: lineItemsCreated,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  return { suppliersCreated, suppliersMatched, offersCreated, lineItemsCreated };
}
