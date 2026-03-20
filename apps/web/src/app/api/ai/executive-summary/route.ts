import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyAIError } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { checkUsageLimit } from "@cantaia/config/plan-features";

export const maxDuration = 120;

const SUMMARY_SYSTEM_PROMPT = `Tu es un directeur de projet construction en Suisse avec 20 ans d'experience. Genere un resume executif structure pour la direction.

Le resume doit contenir:
1. "budget" — Synthese budgetaire:
   - "total_estimate": nombre CHF (meilleure estimation totale, 0 si pas de donnees)
   - "p80": nombre CHF (estimation pessimiste a 80% de probabilite, 0 si pas de donnees)
   - "confidence": 0.0-1.0 (confiance globale dans l'estimation)
   - "market_position": "below_market" | "at_market" | "above_market" (position vs benchmark)

2. "risks" — Top 3-5 risques:
   - "title": titre court
   - "probability": "low" | "medium" | "high"
   - "impact": "low" | "medium" | "high"
   - "mitigation": action de mitigation recommandee

3. "opportunities" — Top 2-4 opportunites:
   - "title": titre court
   - "description": explication
   - "impact": "low" | "medium" | "high"

4. "intelligence_score" — 0-100: score global d'intelligence projet (maturite des donnees, couverture prix, qualite planification)

5. "executive_text" — Resume narratif en francais (3-5 phrases) pour presentation en comite de direction. Concis, factuel, avec les chiffres cles.

Reponds UNIQUEMENT en JSON.`;

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
        "id, name, code, description, status, budget_total, start_date, end_date, client_name, address, city"
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
      .select("subscription_plan, name")
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

    // Collect comprehensive project data
    const contextParts: string[] = [];

    // Project basics
    contextParts.push(
      `Projet: ${project.name} (${project.code || "sans code"})`,
      `Client: ${project.client_name || "N/A"}`,
      `Lieu: ${project.city || "N/A"}, ${project.address || ""}`,
      `Statut: ${project.status}`,
      `Budget total officiel: ${project.budget_total ? `CHF ${Number(project.budget_total).toLocaleString("fr-CH")}` : "Non defini"}`,
      `Dates: ${project.start_date || "N/A"} - ${project.end_date || "N/A"}`,
      `Description: ${project.description || "N/A"}`
    );

    // Budget data (from submissions with budget_estimate)
    if (body.include_budget !== false) {
      const { data: submissions } = await (admin as any)
        .from("submissions")
        .select(
          "id, title, status, deadline, budget_estimate, budget_estimated_at"
        )
        .eq("project_id", body.project_id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (submissions?.length) {
        contextParts.push("\n--- Soumissions & Budget ---");
        for (const sub of submissions) {
          contextParts.push(`Soumission: ${sub.title} (${sub.status})`);
          if (sub.deadline) {
            contextParts.push(`  Deadline: ${sub.deadline}`);
          }
          if (sub.budget_estimate) {
            // Extract key totals from budget estimate
            const be = sub.budget_estimate;
            if (be.totals) {
              contextParts.push(
                `  Budget estime: min CHF ${be.totals.min_total || "?"}, median CHF ${be.totals.median_total || "?"}, max CHF ${be.totals.max_total || "?"}`
              );
            }
            if (be.items?.length) {
              const withPrice = be.items.filter(
                (i: any) => i.source !== "prix_non_disponible"
              ).length;
              contextParts.push(
                `  Postes: ${be.items.length} total, ${withPrice} avec prix reference, ${be.items.length - withPrice} estimes IA`
              );
            }
          }
        }

        // Supplier offers data
        const subIds = submissions.map((s: any) => s.id);
        if (subIds.length) {
          const { data: priceRequests } = await (admin as any)
            .from("price_requests")
            .select("id, status, supplier_id")
            .in("submission_id", subIds)
            .limit(100);

          if (priceRequests?.length) {
            const responded = priceRequests.filter(
              (pr: any) => pr.status === "responded"
            ).length;
            const total = priceRequests.length;
            contextParts.push(
              `\n--- Offres fournisseurs ---`,
              `Demandes: ${total} envoyees, ${responded} repondues (taux: ${total > 0 ? Math.round((responded / total) * 100) : 0}%)`
            );
          }
        }
      }
    }

    // Planning data (tasks)
    if (body.include_planning !== false) {
      const { data: tasks } = await (admin as any)
        .from("tasks")
        .select("id, title, status, priority, due_date")
        .eq("project_id", body.project_id);

      if (tasks?.length) {
        const now = new Date();
        const overdue = tasks.filter(
          (t: any) =>
            t.due_date &&
            new Date(t.due_date) < now &&
            !["done", "cancelled"].includes(t.status)
        );
        const urgent = tasks.filter((t: any) => t.priority === "urgent");
        const done = tasks.filter((t: any) => t.status === "done");
        const todo = tasks.filter((t: any) => t.status === "todo");
        const inProgress = tasks.filter(
          (t: any) => t.status === "in_progress"
        );

        contextParts.push(
          `\n--- Taches & Planning ---`,
          `Total: ${tasks.length}, Faites: ${done.length}, En cours: ${inProgress.length}, A faire: ${todo.length}`,
          `En retard: ${overdue.length}, Urgentes: ${urgent.length}`
        );

        if (overdue.length > 0) {
          contextParts.push(
            `Taches en retard: ${overdue.map((t: any) => `"${t.title}" (prevue ${t.due_date})`).join(", ")}`
          );
        }
      }

      // Meetings
      const { data: meetings } = await (admin as any)
        .from("meetings")
        .select("id, title, meeting_date, status")
        .eq("project_id", body.project_id)
        .order("meeting_date", { ascending: false })
        .limit(5);

      if (meetings?.length) {
        contextParts.push(
          `\n--- Reunions recentes ---`,
          meetings
            .map(
              (m: any) =>
                `${m.title} (${m.meeting_date || "date N/A"}, ${m.status})`
            )
            .join("; ")
        );
      }
    }

    const userMessage = contextParts.join("\n");

    // Call Claude Sonnet for high-quality summary
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 110000 });

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4096,
      system: [
        {
          type: "text",
          text: SUMMARY_SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        { role: "user", content: userMessage },
        {
          role: "assistant",
          content: '{"budget": {',
        },
      ],
    });

    // Track usage
    trackApiUsage({
      supabase: admin,
      userId: user.id,
      organizationId: userProfile.organization_id,
      actionType: "other" as any,
      apiProvider: "anthropic",
      model: "claude-sonnet-4-5-20250929",
      inputTokens: response.usage?.input_tokens || 0,
      outputTokens: response.usage?.output_tokens || 0,
      metadata: {
        project_id: body.project_id,
        action: "executive_summary",
      },
    });

    // Parse response
    const rawText =
      response.content[0]?.type === "text" ? response.content[0].text : "";
    const fullJson = '{"budget": {' + rawText;

    let summary: any;
    try {
      summary = JSON.parse(fullJson);
    } catch {
      // Try to fix truncated JSON
      try {
        let fixed = fullJson;
        // Remove trailing comma
        fixed = fixed.replace(/,\s*$/, "");
        // Count open braces/brackets
        const openBraces =
          (fixed.match(/{/g) || []).length -
          (fixed.match(/}/g) || []).length;
        const openBrackets =
          (fixed.match(/\[/g) || []).length -
          (fixed.match(/]/g) || []).length;
        // Close them
        for (let i = 0; i < openBrackets; i++) fixed += "]";
        for (let i = 0; i < openBraces; i++) fixed += "}";
        summary = JSON.parse(fixed);
      } catch {
        console.error(
          "[executive-summary] Failed to parse AI response:",
          fullJson.substring(0, 500)
        );
        return NextResponse.json(
          { error: "Failed to parse AI response" },
          { status: 500 }
        );
      }
    }

    // Validate and normalize the summary structure
    const validatedSummary = {
      budget: {
        total_estimate: Number(summary.budget?.total_estimate) || 0,
        p80: Number(summary.budget?.p80) || 0,
        confidence: Math.min(
          1,
          Math.max(0, Number(summary.budget?.confidence) || 0)
        ),
        market_position: ["below_market", "at_market", "above_market"].includes(
          summary.budget?.market_position
        )
          ? summary.budget.market_position
          : "at_market",
      },
      risks: (summary.risks || [])
        .filter((r: any) => r && typeof r.title === "string")
        .slice(0, 5)
        .map((r: any) => ({
          title: r.title,
          probability: ["low", "medium", "high"].includes(r.probability)
            ? r.probability
            : "medium",
          impact: ["low", "medium", "high"].includes(r.impact)
            ? r.impact
            : "medium",
          mitigation: r.mitigation || "",
        })),
      opportunities: (summary.opportunities || [])
        .filter((o: any) => o && typeof o.title === "string")
        .slice(0, 4)
        .map((o: any) => ({
          title: o.title,
          description: o.description || "",
          impact: ["low", "medium", "high"].includes(o.impact)
            ? o.impact
            : "medium",
        })),
      intelligence_score: Math.min(
        100,
        Math.max(0, Math.round(Number(summary.intelligence_score) || 0))
      ),
      executive_text: summary.executive_text || "",
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json({ summary: validatedSummary });
  } catch (error: any) {
    console.error("[executive-summary] Error:", error?.message);
    const err = classifyAIError(error);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
}
