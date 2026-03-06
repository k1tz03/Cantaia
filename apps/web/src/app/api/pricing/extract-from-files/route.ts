import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

    return NextResponse.json({
      success: true,
      results: allResults,
      errors,
      files_processed: files.length,
    });
  } catch (err: unknown) {
    console.error("[extract-from-files] Error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Extraction failed" }, { status: 500 });
  }
}
