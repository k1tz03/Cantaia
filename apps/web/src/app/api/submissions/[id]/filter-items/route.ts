import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { MODEL_FOR_TASK, classifyAIError } from "@cantaia/core/ai";

/**
 * POST /api/submissions/[id]/filter-items
 * AI-powered filtering: separates items that need a price request from those that don't.
 * Items like crane rental, driver services, general labor, etc. typically don't need
 * a formal price request to suppliers.
 *
 * Body: { items: Array<{ id, description, unit, cfc_code, material_group }> }
 * Returns: { excluded: Array<{ id, reason }> }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: submissionId } = await params;
  const admin = createAdminClient();

  // Verify submission belongs to user's org
  const { data: userProfile } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userProfile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const { data: submission } = await (admin as any)
    .from("submissions")
    .select("id, project_id, projects!inner(organization_id)")
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission || submission.projects?.organization_id !== userProfile.organization_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();
  const items = body.items;

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ excluded: [] });
  }

  // Build compact item list for AI
  const itemLines = items.map((item: any, i: number) => {
    return `${i + 1}. [${item.id}] ${item.description} | unit: ${item.unit || "—"} | cfc: ${item.cfc_code || "—"} | group: ${item.material_group || "—"}`;
  }).join("\n");

  const prompt = `Tu es un expert en construction suisse. Analyse cette liste de postes d'une soumission et identifie ceux qui ne nécessitent PAS de demande de prix à un fournisseur.

Critères d'exclusion (postes à NE PAS envoyer aux fournisseurs) :
- Location de matériel avec chauffeur (ex: "Camion grue avec chauffeur", "Grue à tour")
- Main d'œuvre et heures de travail (ex: "Heures de manœuvre", "Main d'œuvre auxiliaire")
- Frais de chantier généraux (ex: "Installation de chantier", "Nettoyage final")
- Transports et déplacements (ex: "Transport sur site", "Déplacement de machines")
- Prestations internes qui ne s'achètent pas (ex: "Contrôle qualité", "Coordination")
- Postes forfaitaires très généraux sans matériau identifiable

ATTENTION : les postes de FOURNITURE de matériaux nécessitent TOUJOURS une demande de prix, même si "et pose" est mentionné. Seuls les postes qui sont UNIQUEMENT de la main d'œuvre/service/location doivent être exclus.

POSTES :
${itemLines}

Réponds UNIQUEMENT en JSON. Pour chaque poste à exclure, donne l'id et la raison courte (max 50 chars, en français).`;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 30_000,
    });

    const response = await anthropic.messages.create({
      model: MODEL_FOR_TASK.task_extraction, // Haiku — fast and cheap
      max_tokens: 2048,
      messages: [
        { role: "user", content: prompt },
        { role: "assistant", content: '{"excluded": [' },
      ],
    });

    const rawText = response.content[0].type === "text" ? response.content[0].text : "";
    const fullJson = '{"excluded": [' + rawText;

    // Robust JSON parsing
    let result: { excluded: Array<{ id: string; reason: string }> };
    const cleaned = fullJson.replace(/,\s*([\]}])/g, "$1").trim();
    try {
      result = JSON.parse(cleaned);
    } catch {
      let fixed = cleaned;
      if (!fixed.endsWith("}")) fixed += "}";
      if (!fixed.includes("]}")) fixed = fixed.replace(/\]?\s*\}?\s*$/, "]}");
      try {
        result = JSON.parse(fixed);
      } catch {
        // Regex extraction fallback
        const objects: Array<{ id: string; reason: string }> = [];
        const regex = /\{[^{}]*"id"\s*:\s*"[^"]*"[^{}]*\}/g;
        let match;
        while ((match = regex.exec(fullJson)) !== null) {
          try {
            objects.push(JSON.parse(match[0]));
          } catch { /* skip */ }
        }
        result = { excluded: objects };
      }
    }

    // Validate: only keep IDs that exist in the input
    const validIds = new Set(items.map((i: any) => i.id));
    const excluded = (result.excluded || []).filter(
      (e) => e.id && e.reason && validIds.has(e.id)
    );

    return NextResponse.json({ excluded });
  } catch (err: any) {
    console.error("[submissions/filter-items] AI error:", err?.message);
    const aiErr = classifyAIError(err);
    return NextResponse.json({ error: aiErr.message, excluded: [] }, { status: aiErr.status });
  }
}
