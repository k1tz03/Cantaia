import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { callAnthropicWithRetry, classifyAIError, MODEL_FOR_TASK } from "@cantaia/core/ai";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const body = await req.json();
  const { instructions, tone, length: composeLength, recipients, subject_hint, project_id } = body as {
    instructions: string;
    tone?: string;
    length?: string;
    recipients?: string[];
    subject_hint?: string;
    project_id?: string;
  };

  if (!instructions?.trim()) {
    return NextResponse.json({ error: "Instructions required" }, { status: 400 });
  }

  // Get user profile
  const { data: profile } = await admin
    .from("users")
    .select("first_name, last_name, role, organization_id, preferred_language")
    .eq("id", user.id)
    .single();
  if (!profile || !profile.organization_id) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  const orgId = profile.organization_id as string;

  // Get org name + subscription plan
  const { data: org } = await admin
    .from("organizations")
    .select("name, subscription_plan")
    .eq("id", orgId)
    .single();

  // Check usage limit
  const usageCheck = await checkUsageLimit(admin, orgId, org?.subscription_plan || "trial");
  if (!usageCheck.allowed) {
    return NextResponse.json(
      { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
      { status: 429 }
    );
  }

  // Get project context if provided
  let projectContext = "";
  if (project_id) {
    const { data: project } = await admin.from("projects").select("name, code").eq("id", project_id).single();
    if (project) projectContext = `\nProjet : ${project.name}${project.code ? ` (${project.code})` : ""}`;
  }

  const toneMap: Record<string, string> = {
    formal: "Formel et professionnel, vouvoiement strict",
    casual: "Cordial et décontracté, tout en restant professionnel",
    urgent: "Urgent et direct, aller droit au but",
    empathique: "Empathique et compréhensif, montrer de la considération",
  };
  const lengthMap: Record<string, string> = {
    court: "Email court, 2-3 phrases maximum",
    moyen: "Email de longueur moyenne, 4-6 phrases",
    detaille: "Email détaillé et complet",
  };

  const prompt = `Tu es l'assistant IA de ${profile.first_name || ""} ${profile.last_name || ""}, ${profile.role || "collaborateur"} chez ${org?.name || "l'entreprise"}.
Tu rédiges un email professionnel dans le contexte de la construction en Suisse.
${projectContext}
${recipients?.length ? `Destinataires : ${recipients.join(", ")}` : ""}
${subject_hint ? `Sujet indicatif : ${subject_hint}` : ""}

INSTRUCTIONS DE L'UTILISATEUR :
${instructions}

${tone ? `TON : ${toneMap[tone] || "Professionnel"}` : "TON : Professionnel et direct"}
${composeLength ? `LONGUEUR : ${lengthMap[composeLength] || "Adaptée"}` : ""}

Réponds UNIQUEMENT en JSON valide :
{"subject": "<objet de l'email>", "body": "<corps de l'email, texte uniquement, pas de balises HTML>"}

Signe avec :
${profile.first_name || ""} ${profile.last_name || ""}
${profile.role || ""}
${org?.name || ""}`;

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) return NextResponse.json({ error: "AI not configured" }, { status: 503 });

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: anthropicApiKey });

    const maxTokens = composeLength === "detaille" ? 1200 : 600;

    const response = await callAnthropicWithRetry(
      () => client.messages.create({
        model: MODEL_FOR_TASK.reply_generation || "claude-sonnet-4-5-20250929",
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      })
    );

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";

    // Fire-and-forget usage tracking
    const inputTokens = response.usage?.input_tokens || 0;
    const outputTokens = response.usage?.output_tokens || 0;
    trackApiUsage({
      supabase: admin,
      userId: user.id,
      organizationId: orgId,
      actionType: "email_reply" as any,
      apiProvider: "anthropic",
      model: MODEL_FOR_TASK.reply_generation || "claude-sonnet-4-5-20250929",
      inputTokens,
      outputTokens,
      metadata: { action: "email_compose" },
    }).catch(() => {});

    // Parse JSON response
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return NextResponse.json({
          success: true,
          subject: parsed.subject || "",
          body: parsed.body || "",
        });
      }
    } catch {
      // Fall through to raw text fallback
    }

    // Fallback: return raw text as body
    return NextResponse.json({ success: true, subject: subject_hint || "", body: text });

  } catch (err: unknown) {
    const classified = classifyAIError(err as Error);
    return NextResponse.json({ error: classified.message }, { status: classified.status });
  }
}
