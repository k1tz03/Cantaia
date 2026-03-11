import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/submissions/receive-quote
 * Called when a tracking code SUB-xxx is found in an incoming email.
 * Extracts prices from the email and stores them as submission_quotes.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const body = await request.json();
    const { tracking_code, email_id, email_body, email_subject } = body;

    if (!tracking_code) {
      return NextResponse.json({ error: "tracking_code required" }, { status: 400 });
    }

    // Find the price request by tracking code (cast: migration 049 tables)
    const { data: priceRequest } = await (admin as any)
      .from("submission_price_requests")
      .select("*, suppliers(company_name)")
      .eq("tracking_code", tracking_code)
      .maybeSingle();

    if (!priceRequest) {
      return NextResponse.json({ error: "Tracking code not found" }, { status: 404 });
    }

    // Get the requested items
    const requestedItems = (priceRequest.items_requested as any[]) || [];
    if (requestedItems.length === 0) {
      return NextResponse.json({ error: "No items in this request" }, { status: 400 });
    }

    // Extract prices from email using Claude
    const extractedPrices = await extractPricesFromEmail(
      email_body || email_subject || "",
      requestedItems
    );

    // Store quotes
    const quotesToInsert = extractedPrices
      .filter((p: any) => p.unit_price_ht != null)
      .map((p: any) => ({
        request_id: priceRequest.id,
        submission_id: priceRequest.submission_id,
        item_id: p.item_id,
        unit_price_ht: p.unit_price_ht,
        total_ht: p.total_ht || null,
        currency: "CHF",
        raw_email_id: email_id || null,
        confidence: p.confidence || 0.8,
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
      const quotedItemIds = quotesToInsert.map((q: any) => q.item_id).filter(Boolean);
      if (quotedItemIds.length > 0) {
        await (admin as any)
          .from("submission_items")
          .update({ status: "quoted" })
          .in("id", quotedItemIds);
      }
    }

    // Update request status to "responded"
    await (admin as any)
      .from("submission_price_requests")
      .update({ status: "responded" })
      .eq("id", priceRequest.id);

    return NextResponse.json({
      success: true,
      quotes_extracted: quotesToInsert.length,
      tracking_code,
      supplier: (priceRequest as any).suppliers?.company_name,
    });

  } catch (err: any) {
    console.error("[receive-quote] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function extractPricesFromEmail(
  emailContent: string,
  requestedItems: any[]
): Promise<any[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const itemsList = requestedItems
    .map((i: any) => `- ID: ${i.id} | N°${i.item_number} | ${i.description} | ${i.unit} | Qté: ${i.quantity}`)
    .join("\n");

  const prompt = `Tu es un expert en extraction de prix de construction suisse.

Voici un email de réponse d'un fournisseur. Extrais les prix unitaires HT pour chaque poste demandé.

## Postes demandés :
${itemsList}

## Email du fournisseur :
${emailContent}

## Format de sortie (JSON strict) :
[
  {
    "item_id": "UUID du poste",
    "item_number": "numéro du poste",
    "unit_price_ht": number,
    "total_ht": number | null,
    "confidence": number (0-1)
  }
]

Retourne UNIQUEMENT le JSON. Si tu ne trouves pas de prix pour un poste, omets-le.`;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey, timeout: 60_000 });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((c: any) => c.type === "text");
  if (!text || text.type !== "text") return [];

  try {
    let jsonStr = text.text.trim();
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();
    const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
    if (arrayMatch) jsonStr = arrayMatch[0];
    return JSON.parse(jsonStr);
  } catch {
    console.warn("[receive-quote] Failed to parse AI response");
    return [];
  }
}

