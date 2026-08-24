import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";

export const maxDuration = 120; // PDF analysis can take time

/**
 * POST /api/submissions/receive-quote
 * Called when a tracking code SUB-xxx is found in an incoming email.
 * Extracts prices from the email body AND any PDF attachments,
 * including supplier remarks, conditions, and variants.
 *
 * Body: {
 *   tracking_code: string;
 *   email_id?: string;
 *   email_body?: string;
 *   email_subject?: string;
 *   pdf_attachments?: Array<{ filename: string; content_base64: string; content_type: string }>;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const body = await request.json();
    const { tracking_code, email_id, email_body, email_subject, pdf_attachments } = body;

    if (!tracking_code) {
      return NextResponse.json({ error: "tracking_code required" }, { status: 400 });
    }

    // ─── H4: caller must belong to the organization that owns the tracking code ───
    const { data: callerProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!callerProfile?.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const orgId: string = callerProfile.organization_id;

    // Find the price request by tracking code (cast: migration 049 tables)
    const { data: priceRequest } = await (admin as any)
      .from("submission_price_requests")
      .select("*, suppliers(company_name)")
      .eq("tracking_code", tracking_code)
      .maybeSingle();

    if (!priceRequest) {
      return NextResponse.json({ error: "Tracking code not found" }, { status: 404 });
    }

    // Resolve the owning organization: price request → submission → project
    const { data: ownerSubmission } = await (admin as any)
      .from("submissions")
      .select("id, project_id, projects!submissions_project_id_fkey(organization_id)")
      .eq("id", priceRequest.submission_id)
      .maybeSingle();

    const ownerOrgId = (ownerSubmission as any)?.projects?.organization_id;
    if (!ownerOrgId || ownerOrgId !== orgId) {
      // Do not leak whether the tracking code exists for another organization
      return NextResponse.json({ error: "Tracking code not found" }, { status: 404 });
    }

    // Org-scoped email lookup: every email_records query below is restricted to
    // mailboxes belonging to this organization (H4 — previously unscoped, which
    // let one org read another org's supplier emails).
    const { data: orgUsers } = await (admin as any)
      .from("users")
      .select("id")
      .eq("organization_id", orgId);
    const orgUserIds: string[] = (orgUsers || []).map((u: any) => u.id);

    // Get the requested items
    const requestedItems = (priceRequest.items_requested as any[]) || [];
    if (requestedItems.length === 0) {
      return NextResponse.json({ error: "No items in this request" }, { status: 400 });
    }

    // ─── Phase 1: Resolve email body ────────────────────────────────
    let resolvedBody = email_body || email_subject || "";
    let linkedEmailId: string | null = email_id || null;

    if (!resolvedBody || resolvedBody.length < 10) {
      const sanitizedCode = tracking_code.replace(/[%_,().]/g, "");
      const { data: linkedEmails } = await (admin as any)
        .from("email_records")
        .select("id, body_text, body_html, body_preview, subject, has_attachments, user_id")
        .in("user_id", orgUserIds.length > 0 ? orgUserIds : [user.id])
        .or(`body_preview.ilike.%${sanitizedCode}%,subject.ilike.%${sanitizedCode}%`)
        .order("received_at", { ascending: false })
        .limit(3);

      if (linkedEmails && linkedEmails.length > 0) {
        const e = linkedEmails[0];
        linkedEmailId = e.id;
        resolvedBody = e.body_text || (e.body_html ? e.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "") || e.body_preview || "";
      }
    }

    // ─── Phase 2: Try to fetch PDF attachments from Outlook ─────────
    let pdfData: Array<{ filename: string; content_base64: string; content_type: string }> = pdf_attachments || [];

    if (pdfData.length === 0 && linkedEmailId) {
      // Check if email has attachments, then try to fetch PDFs from Graph.
      // Scoped to the caller's organization so an arbitrary email_id from the
      // request body cannot be used to pull another org's attachments.
      const { data: emailRecord } = await (admin as any)
        .from("email_records")
        .select("has_attachments, outlook_message_id, user_id")
        .eq("id", linkedEmailId)
        .in("user_id", orgUserIds.length > 0 ? orgUserIds : [user.id])
        .maybeSingle();

      if (emailRecord?.has_attachments && emailRecord?.outlook_message_id && emailRecord?.user_id) {
        try {
          const tokenResult = await getValidMicrosoftToken(emailRecord.user_id);
          if (!("error" in tokenResult)) {
            const attachmentsList = await fetchGraphAttachments(tokenResult.accessToken, emailRecord.outlook_message_id);
            // Filter to PDFs only
            pdfData = attachmentsList.filter(a =>
              a.content_type === "application/pdf" ||
              a.filename.toLowerCase().endsWith(".pdf")
            );
            console.log(`[receive-quote] Found ${pdfData.length} PDF attachment(s) for email ${linkedEmailId}`);
          }
        } catch (err) {
          console.warn("[receive-quote] Failed to fetch attachments from Graph (non-fatal):", err);
        }
      }
    }

    // ─── Phase 3: Extract prices (email body + PDF) ─────────────────
    let allExtracted: ExtractedPrice[] = [];
    let offerConditions: string | null = null;

    // 3a: Extract from email body (if available)
    if (resolvedBody.length >= 10) {
      const bodyResult = await extractPricesWithRemarks(resolvedBody, requestedItems, "email");
      allExtracted.push(...bodyResult.prices);
      if (bodyResult.conditions) offerConditions = bodyResult.conditions;
    }

    // 3b: Extract from PDF attachments
    for (const pdf of pdfData) {
      try {
        const pdfResult = await extractPricesFromPdfAttachment(pdf, requestedItems);
        // PDF results take priority over email body results (more structured)
        for (const pdfPrice of pdfResult.prices) {
          // Replace if same item_id exists from email body
          const existingIdx = allExtracted.findIndex(e => e.item_id === pdfPrice.item_id);
          if (existingIdx >= 0) {
            if ((pdfPrice.confidence || 0) >= (allExtracted[existingIdx].confidence || 0)) {
              allExtracted[existingIdx] = pdfPrice;
            }
          } else {
            allExtracted.push(pdfPrice);
          }
        }
        // PDF conditions take priority
        if (pdfResult.conditions) offerConditions = pdfResult.conditions;
      } catch (pdfErr) {
        console.error(`[receive-quote] PDF extraction failed for "${pdf.filename}":`, pdfErr);
      }
    }

    if (allExtracted.length === 0 && resolvedBody.length < 10 && pdfData.length === 0) {
      return NextResponse.json({ error: "No email body or PDF available for price extraction" }, { status: 400 });
    }

    // ─── Phase 4: Store quotes ──────────────────────────────────────
    const quotesToInsert = allExtracted
      .filter((p) => p.unit_price_ht != null)
      .map((p) => ({
        request_id: priceRequest.id,
        submission_id: priceRequest.submission_id,
        item_id: p.item_id,
        unit_price_ht: p.unit_price_ht,
        total_ht: p.total_ht || null,
        currency: "CHF",
        raw_email_id: linkedEmailId || null,
        confidence: p.confidence || 0.8,
        supplier_remarks: p.supplier_remarks || null,
        extracted_at: new Date().toISOString(),
      }));

    if (quotesToInsert.length > 0) {
      const { error: insertError } = await (admin as any)
        .from("submission_quotes")
        .insert(quotesToInsert);

      if (insertError) {
        console.error("[receive-quote] Insert error:", insertError);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }

      // Update items status to "quoted"
      const quotedItemIds = quotesToInsert.map((q) => q.item_id).filter(Boolean);
      if (quotedItemIds.length > 0) {
        const { error: itemsStatusError } = await (admin as any)
          .from("submission_items")
          .update({ status: "quoted" })
          .in("id", quotedItemIds);
        if (itemsStatusError) {
          console.error("[receive-quote] Failed to flag items as quoted:", itemsStatusError.message);
        }
      }

      // Mark linked email(s) as price_response with price_extracted
      // (org-scoped — H4)
      const sanitizedCode = tracking_code.replace(/[%_,().]/g, "");
      const { error: emailUpdateError } = await (admin as any)
        .from("email_records")
        .update({
          email_category: "price_response",
          price_extracted: true,
        })
        .in("user_id", orgUserIds.length > 0 ? orgUserIds : [user.id])
        .or(`body_preview.ilike.%${sanitizedCode}%,subject.ilike.%${sanitizedCode}%`);

      if (emailUpdateError) {
        console.warn("[receive-quote] email_records update failed (non-fatal):", emailUpdateError.message);
      }
    }

    // ─── Phase 5: Update request status + store conditions ──────────
    //
    // C3: `response_received_at` / `response_time_days` live in migration 082.
    // They are written in a SEPARATE statement from status/conditions_text so a
    // database that has not yet applied 082 still records the response instead of
    // losing the whole payload to a rejected UPDATE.
    const responseReceivedAt = new Date().toISOString();
    let responseTimeDays: number | null = null;

    if (priceRequest.sent_at) {
      const sentMs = new Date(priceRequest.sent_at).getTime();
      const receivedMs = new Date(responseReceivedAt).getTime();
      responseTimeDays = Math.round(((receivedMs - sentMs) / (1000 * 60 * 60 * 24)) * 10) / 10;
    }

    // 5a — core state: this MUST succeed
    const coreUpdate: Record<string, unknown> = { status: "responded" };
    if (offerConditions) coreUpdate.conditions_text = offerConditions;

    const { error: statusError } = await (admin as any)
      .from("submission_price_requests")
      .update(coreUpdate)
      .eq("id", priceRequest.id);

    if (statusError) {
      console.error("[receive-quote] Failed to mark request as responded:", statusError.message, statusError.details);
      return NextResponse.json(
        { error: `Prix extraits mais statut non enregistré: ${statusError.message}` },
        { status: 500 }
      );
    }

    // 5b — scoring metrics: degrade gracefully if migration 082 is missing
    const { error: metricsError } = await (admin as any)
      .from("submission_price_requests")
      .update({
        response_received_at: responseReceivedAt,
        response_time_days: responseTimeDays,
      })
      .eq("id", priceRequest.id);

    if (metricsError) {
      console.warn(
        "[receive-quote] response_received_at/response_time_days not persisted " +
        "(apply migration 082_submission_price_requests_response_columns.sql):",
        metricsError.message
      );
    }

    // Recalculate supplier score after receiving a quote.
    // Manual (non-persisted) suppliers have supplier_id = null — nothing to score.
    if (priceRequest.supplier_id) {
      try {
        const { recalculateAndPersistScore } = await import("@cantaia/core/suppliers");
        const { data: supplierData } = await (admin as any)
          .from("suppliers")
          .select("organization_id")
          .eq("id", priceRequest.supplier_id)
          .eq("organization_id", orgId)
          .maybeSingle();
        if (supplierData?.organization_id) {
          await recalculateAndPersistScore(
            priceRequest.supplier_id,
            supplierData.organization_id,
            admin
          );
        }
      } catch (scoreErr) {
        console.warn("[receive-quote] Score recalculation failed (non-fatal):", scoreErr);
      }
    }

    return NextResponse.json({
      success: true,
      quotes_extracted: quotesToInsert.length,
      tracking_code,
      supplier: (priceRequest as any).suppliers?.company_name,
      response_time_days: responseTimeDays,
      pdf_analyzed: pdfData.length,
      has_conditions: !!offerConditions,
    });

  } catch (err: any) {
    console.error("[receive-quote] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─── Prompting ──────────────────────────────────────────────────────

/**
 * Replaces the former assistant prefill (`{ role: "assistant", content: "{" }`).
 * Prefilling the assistant turn is rejected by some model/endpoint combinations
 * (400) and makes the raw response un-parseable on its own; a system instruction
 * plus the tolerant parser below achieves the same JSON-only output.
 */
const JSON_ONLY_SYSTEM =
  "Réponds UNIQUEMENT avec le JSON demandé, sans texte avant ou après, " +
  "sans bloc de code markdown et sans commentaire.";

// ─── Types ──────────────────────────────────────────────────────────

interface ExtractedPrice {
  item_id: string;
  item_number?: string;
  unit_price_ht: number;
  total_ht?: number | null;
  confidence: number;
  supplier_remarks?: string | null;
}

interface ExtractionResult {
  prices: ExtractedPrice[];
  conditions: string | null;
}

// ─── Graph API: Fetch email attachments ─────────────────────────────

async function fetchGraphAttachments(
  accessToken: string,
  outlookMessageId: string
): Promise<Array<{ filename: string; content_base64: string; content_type: string }>> {
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${outlookMessageId}/attachments`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    throw new Error(`Graph API error ${res.status}`);
  }

  const data = await res.json();
  const attachments: Array<{ filename: string; content_base64: string; content_type: string }> = [];

  for (const att of data.value || []) {
    if (att["@odata.type"] === "#microsoft.graph.fileAttachment" && att.contentBytes) {
      attachments.push({
        filename: att.name || "attachment",
        content_base64: att.contentBytes,
        content_type: att.contentType || "application/octet-stream",
      });
    }
  }

  return attachments;
}

// ─── AI: Extract prices + remarks from email body ───────────────────

async function extractPricesWithRemarks(
  emailContent: string,
  requestedItems: any[],
  source: string
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const itemsList = requestedItems
    .map((i: any) => `- ID: ${i.id} | N°${i.item_number} | ${i.description} | ${i.unit} | Qte: ${i.quantity}`)
    .join("\n");

  const prompt = `Tu es un expert en extraction de prix de construction suisse.

Voici un email de reponse d'un fournisseur. Extrais les prix unitaires HT pour chaque poste demande.
IMPORTANT : extrais aussi les REMARQUES du fournisseur par poste (variantes proposees, conditions particulieres, delais, annotations) et les CONDITIONS GENERALES de l'offre.

## Postes demandes :
${itemsList}

## Email du fournisseur :
${emailContent.slice(0, 15000)}

## Format de sortie (JSON strict) :
{
  "prices": [
    {
      "item_id": "UUID du poste",
      "item_number": "numero du poste",
      "unit_price_ht": number,
      "total_ht": number | null,
      "confidence": number (0-1),
      "supplier_remarks": "remarque du fournisseur pour ce poste (variante, condition, delai) ou null"
    }
  ],
  "conditions": "Conditions generales de l'offre (paiement, validite, livraison, remise, TVA) ou null"
}

REGLES :
1. Si tu ne trouves pas de prix pour un poste, omets-le de la liste
2. supplier_remarks = null si aucune remarque specifique pour ce poste
3. conditions = null si aucune condition generale mentionnee
4. Ne pas inventer de prix — monnaie par defaut : CHF`;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, timeout: 60_000 });

  // No assistant prefill: JSON-only output is requested via the system prompt and
  // the response is fed to the tolerant parser below.
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    system: JSON_ONLY_SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((c: any) => c.type === "text");
  if (!text || text.type !== "text") return { prices: [], conditions: null };

  try {
    return parseExtractionResult(text.text);
  } catch {
    console.warn(`[receive-quote] Failed to parse AI response from ${source}`);
    return { prices: [], conditions: null };
  }
}

// ─── AI: Extract prices + remarks from PDF attachment ───────────────

async function extractPricesFromPdfAttachment(
  pdf: { filename: string; content_base64: string; content_type: string },
  requestedItems: any[]
): Promise<ExtractionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const itemsList = requestedItems
    .map((i: any) => `- ID: ${i.id} | N°${i.item_number} | ${i.description} | ${i.unit} | Qte: ${i.quantity}`)
    .join("\n");

  const prompt = `Tu es un expert en analyse d'offres de prix pour la construction en Suisse.

Ce document PDF est une reponse a une demande de prix. Analyse-le et extrais :
1. Les PRIX UNITAIRES HT pour chaque poste demande
2. Les REMARQUES par poste (variantes proposees, conditions, delais, produit alternatif)
3. Les CONDITIONS GENERALES de l'offre (paiement, validite, livraison, remise, TVA)

## Postes demandes :
${itemsList}

## Format de sortie (JSON strict) :
{
  "prices": [
    {
      "item_id": "UUID du poste matche",
      "item_number": "numero du poste",
      "unit_price_ht": number,
      "total_ht": number | null,
      "confidence": number (0-1),
      "supplier_remarks": "remarque/variante/condition pour ce poste ou null"
    }
  ],
  "conditions": "Conditions generales extraites du document (paiement, validite, livraison, TVA, etc.) ou null"
}

REGLES :
1. Matche chaque ligne du PDF avec les postes demandes par numero, description ou CFC
2. Si le fournisseur propose une variante ou un produit alternatif, note-le dans supplier_remarks
3. Si un poste n'a pas de prix identifiable, omets-le
4. conditions = texte synthetise des conditions generales du document
5. Ne pas inventer de prix — monnaie par defaut : CHF`;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, timeout: 90_000 });

  // No assistant prefill — see JSON_ONLY_SYSTEM.
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8192,
    system: JSON_ONLY_SYSTEM,
    messages: [{
      role: "user",
      content: [
        {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf" as const,
            data: pdf.content_base64,
          },
        },
        { type: "text", text: prompt },
      ],
    }],
  });

  const text = response.content.find((c: any) => c.type === "text");
  if (!text || text.type !== "text") return { prices: [], conditions: null };

  try {
    return parseExtractionResult(text.text);
  } catch {
    console.warn(`[receive-quote] Failed to parse PDF AI response for "${pdf.filename}"`);
    return { prices: [], conditions: null };
  }
}

// ─── JSON parsing helpers ───────────────────────────────────────────

function parseExtractionResult(rawJson: string): ExtractionResult {
  // Strip markdown fences and any preamble/epilogue the model may add now that
  // the assistant prefill no longer forces a bare "{" start.
  let cleaned = rawJson
    .replace(/```(?:json)?/gi, "")
    .replace(/,\s*([\]}])/g, "$1")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace > 0) {
    cleaned = lastBrace > firstBrace
      ? cleaned.slice(firstBrace, lastBrace + 1)
      : cleaned.slice(firstBrace);
  }

  // Try direct parse
  try {
    const parsed = JSON.parse(cleaned);
    return normalizeResult(parsed);
  } catch { /* continue */ }

  // Try fixing truncated JSON
  let fixed = cleaned;
  if (!fixed.endsWith("}")) fixed += "}";
  if (!fixed.includes("]}")) fixed = fixed.replace(/\]?\s*\}?\s*$/, "]}");
  try {
    const parsed = JSON.parse(fixed);
    return normalizeResult(parsed);
  } catch { /* continue */ }

  // Regex fallback: extract individual price objects
  const prices: ExtractedPrice[] = [];
  const regex = /\{[^{}]*"item_id"\s*:\s*"[^"]*"[^{}]*\}/g;
  let match;
  while ((match = regex.exec(rawJson)) !== null) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj.item_id && obj.unit_price_ht != null) {
        prices.push(obj);
      }
    } catch { /* skip */ }
  }

  // Try to extract conditions
  let conditions: string | null = null;
  const condMatch = rawJson.match(/"conditions"\s*:\s*"([^"]+)"/);
  if (condMatch) conditions = condMatch[1];

  return { prices, conditions };
}

function normalizeResult(parsed: any): ExtractionResult {
  // Handle both formats: { prices: [...] } and [...] (old format)
  if (Array.isArray(parsed)) {
    return { prices: parsed.filter(p => p.item_id && p.unit_price_ht != null), conditions: null };
  }
  return {
    prices: (parsed.prices || parsed.extracted || []).filter((p: any) => p.item_id && p.unit_price_ht != null),
    conditions: parsed.conditions || null,
  };
}
