import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyAIError } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";

export const maxDuration = 60;

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB per file
const ACCEPTED_EXTENSIONS = [".eml", ".msg", ".pdf", ".txt", ".html", ".htm"];

/**
 * POST /api/pricing/extract-from-files
 * Process uploaded files (.eml, .msg, .pdf) for price extraction.
 * Accepts FormData with multiple files (recommended: 3 per batch).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 500 });
  }

  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 400 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files") as File[];

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  // Validate files
  for (const file of files) {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return NextResponse.json({ error: `Type non supporté: ${file.name}. Acceptés: ${ACCEPTED_EXTENSIONS.join(", ")}` }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `Fichier trop volumineux: ${file.name} (max 25 MB)` }, { status: 400 });
    }
  }

  try {
    const { extractPricesFromFile } = await import("@cantaia/core/pricing");

    const errors: string[] = [];

    // Process all files in parallel (each file independently calls Claude)
    const filePromises = files.map(async (file) => {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      try {
        const result = await (extractPricesFromFile as any)({
          fileName: file.name,
          fileBuffer: buffer,
          contentType: file.type,
          anthropicApiKey,
          onUsage: (usage: { input_tokens: number; output_tokens: number }) => {
            trackApiUsage({
              supabase: adminClient,
              userId: user.id,
              organizationId: userOrg.organization_id!,
              actionType: "price_extract",
              apiProvider: "anthropic",
              model: "claude-sonnet-4-5-20250929",
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              metadata: { file_name: file.name },
            });
          },
        });

        if (result.error) {
          errors.push(`${file.name}: ${result.error}`);
        }

        return (result.results || []).map((r: any) => ({
          ...r,
          fileName: file.name,
        }));
      } catch (err: unknown) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : "Erreur"}`);
        return [];
      }
    });

    const settled = await Promise.all(filePromises);
    const allResults = settled.flat();

    // Persist extracted line items to ingested_offer_lines (fire-and-forget, non-blocking)
    try {
      const now = new Date();
      const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
      const rowsToInsert: Record<string, unknown>[] = [];

      for (const result of allResults) {
        if (!result.has_prices || !result.line_items?.length) continue;
        const supplierName = result.supplier_info?.company_name || result.supplier_info?.name || null;
        for (const item of result.line_items) {
          if (!item.description || !item.unit_price) continue;
          rowsToInsert.push({
            org_id: userOrg.organization_id,
            source_file: result.fileName || "unknown",
            source_type: "file_extraction",
            fournisseur_nom: supplierName,
            date_offre: now.toISOString().split("T")[0],
            quarter,
            cfc_code: item.cfc_code || null,
            description: item.description,
            quantite: item.quantity,
            unite: item.unit || null,
            prix_unitaire_ht: item.unit_price,
            prix_total_ht: item.total_price || null,
            confiance: "medium",
            validated: false,
          });
        }
      }

      if (rowsToInsert.length > 0) {
        const { error: insertErr } = await (adminClient as any)
          .from("ingested_offer_lines")
          .insert(rowsToInsert);
        if (insertErr) {
          console.error("[extract-from-files] ingested_offer_lines insert failed (non-blocking):", insertErr.message);
        } else {
          console.log(`[extract-from-files] Persisted ${rowsToInsert.length} line items to ingested_offer_lines`);
        }
      }
    } catch (persistErr) {
      console.error("[extract-from-files] Failed to persist to ingested_offer_lines (non-blocking):", persistErr);
    }

    return NextResponse.json({
      success: true,
      results: allResults,
      errors,
      files_processed: files.length,
    });
  } catch (err: any) {
    console.error("[extract-from-files] Error:", err?.message || err);
    const aiErr = classifyAIError(err);
    return NextResponse.json({ error: aiErr.message }, { status: aiErr.status });
  }
}
