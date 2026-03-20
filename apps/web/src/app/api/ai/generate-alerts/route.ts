import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyAIError } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { checkUsageLimit } from "@cantaia/config/plan-features";

export const maxDuration = 60;

const ALERTS_SYSTEM_PROMPT = `Tu es un expert en gestion de chantier suisse. Analyse les donnees du projet et genere des alertes intelligentes.

Categorie d'alertes:
- "budget": Prix anormaux vs marche, postes sans donnees prix, haute incertitude, depassements potentiels
- "planning": Risques chemin critique, impacts saisonniers/meteo, conflits de ressources, delais tendus
- "supplier": Taux de reponse bas, dependance fournisseur unique, retards de livraison potentiels
- "opportunity": Possibilites de fast-tracking, remises volume, materiaux alternatifs, optimisations

Severite:
- "red": Critique, action immediate requise (ex: depassement budget >15%, delai impossible, fournisseur unique pour poste critique)
- "yellow": Attention requise, a surveiller (ex: prix eleve vs benchmark, delai serre, taux reponse <50%)
- "green": Opportunite ou point positif (ex: prix competitif, marge de manoeuvre, alternatives moins cheres)

Reponds UNIQUEMENT en JSON. Genere 3-8 alertes pertinentes.`;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: body, error: parseError } = await parseBody(request);
    if (parseError || !body) {
      return NextResponse.json(
        { error: parseError || "Invalid request" },
        { status: 400 }
      );
    }

    const requiredError = validateRequired(body, ["project_id"]);
    if (requiredError) {
      return NextResponse.json({ error: requiredError }, { status: 400 });
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: "AI service not configured" },
        { status: 503 }
      );
    }

    const admin = createAdminClient();

    // Verify user's organization
    const { data: userProfile } = await (admin as any)
      .from("users")
      .select("organization_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!userProfile?.organization_id) {
      return NextResponse.json({ error: "No organization" }, { status: 403 });
    }

    // Verify project belongs to user's org
    const { data: project, error: projectError } = await (admin as any)
      .from("projects")
      .select(
        "id, name, code, status, budget_total, start_date, end_date, client_name, city"
      )
      .eq("id", body.project_id)
      .eq("organization_id", userProfile.organization_id)
      .maybeSingle();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    // Check AI usage limit
    const { data: orgData } = await (admin as any)
      .from("organizations")
      .select("subscription_plan")
      .eq("id", userProfile.organization_id)
      .single();

    const usageCheck = await checkUsageLimit(
      admin,
      userProfile.organization_id,
      orgData?.subscription_plan || "trial"
    );
    if (!usageCheck.allowed) {
      return NextResponse.json(
        {
          error: "usage_limit_reached",
          current: usageCheck.current,
          limit: usageCheck.limit,
          required_plan: usageCheck.requiredPlan,
        },
        { status: 429 }
      );
    }

    // Collect project context data
    // 1. Latest submissions with budget estimates
    const { data: submissions } = await (admin as any)
      .from("submissions")
      .select(
        "id, title, status, deadline, budget_estimate, budget_estimated_at"
      )
      .eq("project_id", body.project_id)
      .order("created_at", { ascending: false })
      .limit(5);

    // 2. Task stats
    const { data: tasks } = await (admin as any)
      .from("tasks")
      .select("id, status, priority, due_date")
      .eq("project_id", body.project_id);

    const taskStats = {
      total: tasks?.length || 0,
      overdue: (tasks || []).filter(
        (t: any) =>
          t.due_date &&
          new Date(t.due_date) < new Date() &&
          !["done", "cancelled"].includes(t.status)
      ).length,
      urgent: (tasks || []).filter((t: any) => t.priority === "urgent").length,
      in_progress: (tasks || []).filter(
        (t: any) => t.status === "in_progress"
      ).length,
    };

    // 3. Supplier offers (for supplier alerts)
    const { data: priceRequests } = await (admin as any)
      .from("price_requests")
      .select("id, status, supplier_id, suppliers(company_name)")
      .in(
        "submission_id",
        (submissions || []).map((s: any) => s.id)
      )
      .limit(50);

    // Build user message with all context
    const contextParts: string[] = [];

    contextParts.push(
      `Projet: ${project.name} (${project.code || "sans code"})`,
      `Client: ${project.client_name || "N/A"}`,
      `Ville: ${project.city || "N/A"}`,
      `Statut: ${project.status}`,
      `Budget total: ${project.budget_total ? `CHF ${project.budget_total.toLocaleString()}` : "Non defini"}`,
      `Dates: ${project.start_date || "N/A"} - ${project.end_date || "N/A"}`
    );

    if (submissions?.length) {
      contextParts.push("\n--- Soumissions ---");
      for (const sub of submissions) {
        const budgetInfo = sub.budget_estimate
          ? `Budget estime: CHF ${JSON.stringify(sub.budget_estimate).substring(0, 200)}`
          : "Pas de budget estime";
        contextParts.push(
          `- ${sub.title} (statut: ${sub.status}, deadline: ${sub.deadline || "N/A"}) — ${budgetInfo}`
        );
      }
    }

    contextParts.push(
      `\n--- Taches ---`,
      `Total: ${taskStats.total}, En retard: ${taskStats.overdue}, Urgentes: ${taskStats.urgent}, En cours: ${taskStats.in_progress}`
    );

    if (priceRequests?.length) {
      const responded = priceRequests.filter(
        (pr: any) => pr.status === "responded"
      ).length;
      const pending = priceRequests.filter(
        (pr: any) => pr.status === "sent"
      ).length;
      contextParts.push(
        `\n--- Fournisseurs ---`,
        `Demandes de prix: ${priceRequests.length} total, ${responded} repondues, ${pending} en attente`
      );
    }

    if (body.estimation_data) {
      contextParts.push(
        `\n--- Donnees estimation ---`,
        JSON.stringify(body.estimation_data).substring(0, 2000)
      );
    }

    if (body.planning_data) {
      contextParts.push(
        `\n--- Donnees planning ---`,
        JSON.stringify(body.planning_data).substring(0, 2000)
      );
    }

    const userMessage = contextParts.join("\n");

    // Call Claude Haiku
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 55000 });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: ALERTS_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: '{"alerts": [' },
      ],
    });

    // Track usage
    trackApiUsage({
      supabase: admin,
      userId: user.id,
      organizationId: userProfile.organization_id,
      actionType: "other" as any,
      apiProvider: "anthropic",
      model: "claude-haiku-4-5-20251001",
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      metadata: {
        project_id: body.project_id,
        action: "generate_alerts",
      },
    });

    // Parse response
    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const fullJson = '{"alerts": [' + rawText;

    let alerts: any[];
    try {
      const parsed = JSON.parse(fullJson);
      alerts = parsed.alerts || [];
    } catch {
      // Try to fix truncated JSON
      try {
        let fixed = fullJson;
        // Remove trailing comma before closing
        fixed = fixed.replace(/,\s*$/, "");
        // Close open arrays/objects
        if (!fixed.endsWith("]}")) {
          if (fixed.endsWith("}")) {
            fixed += "]}";
          } else if (fixed.endsWith("]")) {
            fixed += "}";
          } else {
            fixed += '"}]}';
          }
        }
        const parsed = JSON.parse(fixed);
        alerts = parsed.alerts || [];
      } catch {
        console.error(
          "[generate-alerts] Failed to parse AI response:",
          fullJson.substring(0, 500)
        );
        return NextResponse.json(
          { error: "Failed to parse AI response" },
          { status: 500 }
        );
      }
    }

    // Validate and normalize alerts
    const validSeverities = ["red", "yellow", "green"];
    const validCategories = ["budget", "planning", "supplier", "opportunity"];

    const validatedAlerts = alerts
      .filter(
        (a: any) =>
          a &&
          typeof a.title === "string" &&
          typeof a.description === "string"
      )
      .map((a: any) => ({
        severity: validSeverities.includes(a.severity) ? a.severity : "yellow",
        category: validCategories.includes(a.category)
          ? a.category
          : "budget",
        title: a.title,
        description: a.description,
        action: a.action || "",
      }));

    // Sort: red first, then yellow, then green
    const severityOrder: Record<string, number> = {
      red: 0,
      yellow: 1,
      green: 2,
    };
    validatedAlerts.sort(
      (a: any, b: any) =>
        (severityOrder[a.severity] ?? 1) - (severityOrder[b.severity] ?? 1)
    );

    return NextResponse.json({ alerts: validatedAlerts });
  } catch (error: any) {
    console.error("[generate-alerts] Error:", error?.message);
    const err = classifyAIError(error);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
