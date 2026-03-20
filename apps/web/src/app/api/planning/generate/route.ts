import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePlanning } from "@cantaia/core/planning";
import type { GeneratedPlanning, AIValidationResult } from "@cantaia/core/planning";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkUsageLimit } from "@cantaia/config/plan-features";

export const maxDuration = 300;

/** Map frontend project types to DB CHECK constraint values */
function mapProjectType(frontendType: string | undefined): "new" | "renovation" | "extension" | "interior" {
  const map: Record<string, "new" | "renovation" | "extension" | "interior"> = {
    neuf: "new",
    renovation: "renovation",
    extension: "extension",
    amenagement: "interior",
  };
  return map[frontendType || ""] || "new";
}

/**
 * POST /api/planning/generate
 * Generates a project planning from a submission's analyzed items.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    // Check AI usage limit
    const { data: orgData } = await (admin as any)
      .from("organizations")
      .select("subscription_plan")
      .eq("id", userProfile.organization_id)
      .single();

    const usageCheck = await checkUsageLimit(admin, userProfile.organization_id, orgData?.subscription_plan || "trial");
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { submission_id, project_id, config, source } = body;

    if (!project_id || !config?.start_date) {
      return NextResponse.json(
        { error: "project_id and config.start_date are required" },
        { status: 400 },
      );
    }

    // Verify project belongs to user's org
    const { data: project } = await (admin as any)
      .from("projects")
      .select("id, name, organization_id")
      .eq("id", project_id)
      .maybeSingle();

    if (!project || project.organization_id !== userProfile.organization_id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ─── Manual / empty planning ────────────────────────────────────────────────
    if (source === "manual" || !submission_id) {
      console.log(`[planning/generate] Creating empty planning for project=${project.name}`);

      const startDate = config.start_date;
      const targetEnd = config.target_end_date || (() => {
        const d = new Date(startDate);
        d.setDate(d.getDate() + 180);
        return d.toISOString().split("T")[0];
      })();

      const planningTitle = config.title || `Planning — ${project.name}`;

      // Delete existing planning for this project
      try {
        await (admin as any)
          .from("project_plannings")
          .delete()
          .eq("project_id", project_id)
          .eq("organization_id", userProfile.organization_id);
      } catch {
        // Ignore
      }

      // Insert planning record
      const { data: planningRow, error: planningError } = await (admin as any)
        .from("project_plannings")
        .insert({
          project_id,
          submission_id: null,
          organization_id: userProfile.organization_id,
          title: planningTitle,
          status: "draft",
          start_date: startDate,
          target_end_date: targetEnd,
          calculated_end_date: targetEnd,
          project_type: "new",
          location_canton: null,
          config: {},
          ai_generation_log: null,
          created_by: user.id,
        })
        .select("id")
        .single();

      if (planningError || !planningRow) {
        console.error("[planning/generate] Insert empty planning error:", planningError);
        return NextResponse.json({ error: "Failed to save planning" }, { status: 500 });
      }

      const planningId = planningRow.id;

      // Insert 2 milestones as tasks (no phases needed for milestones)
      // Create a default phase to hold future tasks
      const { data: phaseRow } = await (admin as any)
        .from("planning_phases")
        .insert({
          planning_id: planningId,
          name: "Phase 1",
          cfc_codes: [],
          color: "#3B82F6",
          sort_order: 0,
          start_date: startDate,
          end_date: targetEnd,
        })
        .select("id")
        .single();

      // Milestone: Start
      await (admin as any)
        .from("planning_tasks")
        .insert({
          planning_id: planningId,
          phase_id: phaseRow?.id || null,
          name: "Debut de chantier",
          start_date: startDate,
          end_date: startDate,
          duration_days: 0,
          team_size: 1,
          progress: 0,
          is_milestone: true,
          milestone_type: "start",
          sort_order: 0,
        });

      // Milestone: End
      await (admin as any)
        .from("planning_tasks")
        .insert({
          planning_id: planningId,
          phase_id: phaseRow?.id || null,
          name: "Reception provisoire",
          start_date: targetEnd,
          end_date: targetEnd,
          duration_days: 0,
          team_size: 1,
          progress: 0,
          is_milestone: true,
          milestone_type: "reception_provisoire",
          sort_order: 1,
        });

      console.log(`[planning/generate] Empty planning created: id=${planningId}`);

      return NextResponse.json({
        success: true,
        planning_id: planningId,
        phases_count: 1,
        calculated_end_date: targetEnd,
      });
    }

    // ─── Submission-based planning ──────────────────────────────────────────────

    // Verify submission belongs to the same project
    const { data: submission } = await (admin as any)
      .from("submissions")
      .select("id, project_id")
      .eq("id", submission_id)
      .maybeSingle();

    if (!submission || submission.project_id !== project_id) {
      return NextResponse.json({ error: "Submission not found or not linked to this project" }, { status: 404 });
    }

    // Generate the planning using the core module (handles item fetching internally)
    console.log(`[planning/generate] Generating for project=${project.name}, submission=${submission_id}`);

    const planning = await generatePlanning({
      submission_id,
      project_id,
      org_id: userProfile.organization_id,
      config: {
        start_date: config.start_date,
        target_end_date: config.target_end_date,
        project_type: mapProjectType(config.project_type),
        canton: config.canton,
        constraints: config.constraints,
      },
      supabase: admin,
    });

    // ─── AI Validation Pass (Claude) ───────────────────────────────────────────
    // Run Claude to validate the algorithmically generated planning:
    // - Flag unrealistic durations
    // - Suggest missing dependencies
    // - Identify risks and optimizations
    let aiValidation: AIValidationResult | null = null;
    let aiInputTokens = 0;
    let aiOutputTokens = 0;

    try {
      console.log("[planning/generate] Starting AI validation pass...");
      const validationResult = await runAIValidation(planning);
      aiValidation = validationResult.validation;
      aiInputTokens = validationResult.inputTokens;
      aiOutputTokens = validationResult.outputTokens;

      if (aiValidation) {
        // Apply duration corrections from AI
        applyDurationCorrections(planning, aiValidation.duration_corrections);

        // Add missing dependencies from AI
        applyMissingDependencies(planning, aiValidation.missing_dependencies);

        // Store validation result on planning
        planning.ai_validation = aiValidation;

        console.log(
          `[planning/generate] AI validation: ${aiValidation.duration_corrections.length} corrections, ` +
          `${aiValidation.missing_dependencies.length} missing deps, ${aiValidation.risks.length} risks`
        );
      }
    } catch (err) {
      console.error("[planning/generate] AI validation failed (non-fatal):", err);
      // AI validation is non-fatal — we still save the algorithmic planning
    }

    // Delete existing planning for this project (only one planning per project)
    try {
      await (admin as any)
        .from("project_plannings")
        .delete()
        .eq("project_id", project_id)
        .eq("organization_id", userProfile.organization_id);
    } catch {
      // Ignore if table doesn't exist
    }

    // Insert planning
    const { data: planningRow, error: planningError } = await (admin as any)
      .from("project_plannings")
      .insert({
        project_id,
        submission_id,
        organization_id: userProfile.organization_id,
        title: planning.title,
        status: "draft",
        start_date: config.start_date,
        target_end_date: config.target_end_date || null,
        calculated_end_date: planning.calculated_end_date,
        project_type: mapProjectType(config.project_type),
        location_canton: config.canton || null,
        config: { constraints: config.constraints },
        ai_generation_log: planning.ai_generation_log,
        ai_validation: aiValidation,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (planningError || !planningRow) {
      console.error("[planning/generate] Insert planning error:", planningError);
      return NextResponse.json({ error: "Failed to save planning" }, { status: 500 });
    }

    const planningId = planningRow.id;

    // Insert phases and tasks
    for (const phase of planning.phases) {
      const { data: phaseRow, error: phaseError } = await (admin as any)
        .from("planning_phases")
        .insert({
          planning_id: planningId,
          name: phase.name,
          cfc_codes: phase.cfc_codes,
          color: phase.color,
          sort_order: phase.sort_order,
          start_date: phase.start_date,
          end_date: phase.end_date,
        })
        .select("id")
        .single();

      if (phaseError || !phaseRow) {
        console.error("[planning/generate] Insert phase error:", phaseError);
        continue;
      }

      for (const task of phase.tasks) {
        await (admin as any)
          .from("planning_tasks")
          .insert({
            planning_id: planningId,
            phase_id: phaseRow.id,
            submission_item_id: task.submission_item_id,
            name: task.name,
            description: task.description || null,
            cfc_code: task.cfc_code,
            start_date: task.start_date,
            end_date: task.end_date,
            duration_days: task.duration_days,
            quantity: task.quantity,
            unit: task.unit,
            productivity_ratio: task.productivity_ratio,
            productivity_source: task.productivity_source,
            adjustment_factors: task.adjustment_factors,
            base_duration_days: task.base_duration_days,
            supplier_id: null,
            team_size: task.team_size,
            progress: 0,
            is_milestone: task.is_milestone,
            milestone_type: task.milestone_type,
            sort_order: task.sort_order,
          });
      }
    }

    // Insert dependencies
    try {
      const { data: dbTasks } = await (admin as any)
        .from("planning_tasks")
        .select("id, sort_order")
        .eq("planning_id", planningId)
        .order("sort_order", { ascending: true });

      if (dbTasks && dbTasks.length > 0) {
        const taskIdByIndex = new Map<number, string>();
        for (const t of dbTasks) {
          taskIdByIndex.set(t.sort_order, t.id);
        }

        for (const dep of planning.dependencies) {
          const predId = taskIdByIndex.get(dep.predecessor_index);
          const succId = taskIdByIndex.get(dep.successor_index);
          if (predId && succId) {
            await (admin as any)
              .from("planning_dependencies")
              .insert({
                planning_id: planningId,
                predecessor_id: predId,
                successor_id: succId,
                dependency_type: dep.dependency_type,
                lag_days: dep.lag_days,
                source: dep.source,
              });
          }
        }
      }
    } catch (err) {
      console.error("[planning/generate] Insert dependencies error:", err);
    }

    // Track API usage (mechanical generation + AI validation)
    trackApiUsage({
      supabase: admin as any,
      userId: user.id,
      organizationId: userProfile.organization_id,
      actionType: "planning_generation" as any,
      apiProvider: "anthropic" as any,
      model: aiValidation ? "claude-sonnet-4-5-20250929" : "mechanical",
      inputTokens: aiInputTokens,
      outputTokens: aiOutputTokens,
      metadata: {
        project_id,
        submission_id,
        phases_count: planning.phases.length,
        ai_validation: !!aiValidation,
        ai_corrections: aiValidation?.duration_corrections.length ?? 0,
        ai_missing_deps: aiValidation?.missing_dependencies.length ?? 0,
        ai_risks: aiValidation?.risks.length ?? 0,
      },
    }).catch(() => {});

    console.log(`[planning/generate] Success: id=${planningId}, phases=${planning.phases.length}, ai_validated=${!!aiValidation}`);

    return NextResponse.json({
      success: true,
      planning_id: planningId,
      phases_count: planning.phases.length,
      calculated_end_date: planning.calculated_end_date,
      ai_validation: aiValidation ? {
        corrections_count: aiValidation.duration_corrections.length,
        missing_deps_count: aiValidation.missing_dependencies.length,
        risks_count: aiValidation.risks.length,
        recommendations_count: aiValidation.recommendations.length,
        summary: aiValidation.summary,
      } : null,
    });
  } catch (err: any) {
    console.error("[planning/generate] Error:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

// ============================================================================
// AI Validation Pass — Claude Sonnet 4.5
// ============================================================================

async function runAIValidation(
  planning: GeneratedPlanning,
): Promise<{ validation: AIValidationResult | null; inputTokens: number; outputTokens: number }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[planning/generate] ANTHROPIC_API_KEY not set, skipping AI validation");
    return { validation: null, inputTokens: 0, outputTokens: 0 };
  }

  // Build a compact representation of the planning for Claude
  const allTasks: Array<{
    sort_order: number;
    name: string;
    duration: number;
    cfc: string | null;
    start: string;
    end: string;
    is_critical: boolean;
    phase: string;
  }> = [];

  const criticalTaskIds = new Set(
    (planning.ai_generation_log as any)?.critical_path_task_ids ?? [],
  );

  for (const phase of planning.phases) {
    for (const t of phase.tasks) {
      if (t.is_milestone) continue;
      allTasks.push({
        sort_order: t.sort_order,
        name: t.name,
        duration: t.duration_days,
        cfc: t.cfc_code,
        start: t.start_date,
        end: t.end_date,
        is_critical: criticalTaskIds.has(t.sort_order.toString()),
        phase: phase.name,
      });
    }
  }

  // Limit to 50 tasks to keep token usage reasonable
  const tasksForAI = allTasks.slice(0, 50);

  const validationPrompt = `Tu es un expert en planification de chantier suisse avec 20+ ans d'experience.
Voici un planning de construction genere automatiquement. Analyse-le et suggere des corrections.

PLANNING:
${JSON.stringify({
    total_duration_days: planning.critical_path_length,
    calculated_end_date: planning.calculated_end_date,
    phases: planning.phases.map((p) => ({
      name: p.name,
      tasks_count: p.tasks.filter((t) => !t.is_milestone).length,
      start: p.start_date,
      end: p.end_date,
    })),
    tasks: tasksForAI,
    dependencies_count: planning.dependencies.length,
  })}

Retourne un JSON avec:
- duration_corrections: [{task_id, current_duration, corrected_duration, reason}] (taches avec durees irrealistes — task_id = sort_order du task)
- missing_dependencies: [{from_task_id, to_task_id, type, lag_days, reason}] (dependances manquantes — utilise sort_order)
- risks: [{title, probability: "high"|"medium"|"low", impact_days, mitigation}] (3-5 risques construction suisse)
- recommendations: [{title, description, impact: "high"|"medium"|"low"}] (optimisations possibles)
- summary: string (paragraphe resume en francais, 3-5 phrases)

Regles:
- Ne corrige une duree QUE si elle est clairement irrealiste (ex: beton arme 2 jours pour 500m3, ou peinture 200 jours pour un appartement)
- Les durees raisonnables doivent etre laissees telles quelles (retourne duration_corrections vide si tout est correct)
- Pour missing_dependencies, ne suggere QUE des liens critiques oublies (pas de micro-optimisations)
- Risques: pense meteo suisse, normes SIA 118, coordination corps de metier, delais fournisseurs
- JSON uniquement, pas de markdown, pas de commentaires.`;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    timeout: 90_000,
  });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: validationPrompt,
      },
      {
        role: "assistant",
        content: '{"duration_corrections":',
      },
    ],
  });

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  // Extract text content from response
  const rawText = response.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("");

  // Reconstruct full JSON (we prefilled the assistant with the opening)
  const fullJson = '{"duration_corrections":' + rawText;

  const validation = parseAIValidationResponse(fullJson);

  return { validation, inputTokens, outputTokens };
}

/**
 * Parse the AI validation response with multiple fallback strategies.
 */
function parseAIValidationResponse(rawJson: string): AIValidationResult | null {
  // Strategy 1: Direct parse
  try {
    const parsed = JSON.parse(rawJson);
    return validateAndNormalize(parsed);
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Fix trailing commas and close truncated JSON
  try {
    let fixed = rawJson
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");

    // Try to close unclosed braces/brackets
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/]/g) || []).length;

    for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += "]";
    for (let i = 0; i < openBraces - closeBraces; i++) fixed += "}";

    const parsed = JSON.parse(fixed);
    return validateAndNormalize(parsed);
  } catch {
    // Continue to next strategy
  }

  // Strategy 3: Extract JSON from text (in case Claude wrapped it)
  try {
    const jsonMatch = rawJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return validateAndNormalize(parsed);
    }
  } catch {
    // All strategies failed
  }

  console.warn("[planning/generate] Failed to parse AI validation response. Preview:", rawJson.substring(0, 200));
  return null;
}

/**
 * Validate and normalize the parsed AI response.
 * Ensures all required fields exist with correct types.
 */
function validateAndNormalize(parsed: any): AIValidationResult {
  return {
    duration_corrections: Array.isArray(parsed.duration_corrections)
      ? parsed.duration_corrections
          .filter((c: any) => c && typeof c.task_id !== "undefined" && typeof c.corrected_duration === "number")
          .map((c: any) => ({
            task_id: String(c.task_id),
            current_duration: Number(c.current_duration) || 0,
            corrected_duration: Math.max(1, Math.min(365, Math.round(Number(c.corrected_duration)))),
            reason: String(c.reason || ""),
          }))
      : [],
    missing_dependencies: Array.isArray(parsed.missing_dependencies)
      ? parsed.missing_dependencies
          .filter((d: any) => d && typeof d.from_task_id !== "undefined" && typeof d.to_task_id !== "undefined")
          .map((d: any) => ({
            from_task_id: String(d.from_task_id),
            to_task_id: String(d.to_task_id),
            type: (["FS", "SS", "FF", "SF"].includes(d.type) ? d.type : "FS") as "FS" | "SS" | "FF" | "SF",
            lag_days: Math.max(0, Math.round(Number(d.lag_days) || 0)),
            reason: String(d.reason || ""),
          }))
      : [],
    risks: Array.isArray(parsed.risks)
      ? parsed.risks
          .filter((r: any) => r && r.title)
          .slice(0, 10)
          .map((r: any) => ({
            title: String(r.title),
            probability: (["high", "medium", "low"].includes(r.probability) ? r.probability : "medium") as "high" | "medium" | "low",
            impact_days: Math.max(0, Math.round(Number(r.impact_days) || 0)),
            mitigation: String(r.mitigation || ""),
          }))
      : [],
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations
          .filter((r: any) => r && r.title)
          .slice(0, 10)
          .map((r: any) => ({
            title: String(r.title),
            description: String(r.description || ""),
            impact: (["high", "medium", "low"].includes(r.impact) ? r.impact : "medium") as "high" | "medium" | "low",
          }))
      : [],
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
  };
}

// ============================================================================
// Apply AI corrections to the planning
// ============================================================================

/**
 * Apply AI-suggested duration corrections to planning tasks.
 * Modifies task duration_days in place. Does NOT recalculate dates
 * (dates will be recalculated by the CPM if needed in future iterations).
 */
function applyDurationCorrections(
  planning: GeneratedPlanning,
  corrections: AIValidationResult["duration_corrections"],
) {
  if (!corrections || corrections.length === 0) return;

  // Build lookup: sort_order → task reference
  const taskBySortOrder = new Map<string, { task: any; phase: any }>();
  for (const phase of planning.phases) {
    for (const task of phase.tasks) {
      taskBySortOrder.set(String(task.sort_order), { task, phase });
    }
  }

  let applied = 0;
  for (const correction of corrections) {
    const entry = taskBySortOrder.get(correction.task_id);
    if (!entry) continue;

    const { task } = entry;

    // Sanity check: only apply if the correction is significantly different
    const diff = Math.abs(correction.corrected_duration - task.duration_days);
    if (diff < 1) continue;

    // Don't allow corrections that would make the task < 1 day or > 365 days
    const newDuration = Math.max(1, Math.min(365, correction.corrected_duration));

    console.log(
      `[planning/generate] AI correction: task "${task.name}" (sort_order=${correction.task_id}) ` +
      `duration ${task.duration_days}d → ${newDuration}d — ${correction.reason}`
    );

    task.duration_days = newDuration;
    applied++;
  }

  if (applied > 0) {
    console.log(`[planning/generate] Applied ${applied}/${corrections.length} AI duration corrections`);
  }
}

/**
 * Add AI-suggested missing dependencies to the planning.
 */
function applyMissingDependencies(
  planning: GeneratedPlanning,
  missingDeps: AIValidationResult["missing_dependencies"],
) {
  if (!missingDeps || missingDeps.length === 0) return;

  // Build set of existing sort_orders for validation
  const validSortOrders = new Set<string>();
  for (const phase of planning.phases) {
    for (const task of phase.tasks) {
      validSortOrders.add(String(task.sort_order));
    }
  }

  let added = 0;
  for (const dep of missingDeps) {
    // Validate that both task IDs exist
    if (!validSortOrders.has(dep.from_task_id) || !validSortOrders.has(dep.to_task_id)) continue;

    const fromIdx = parseInt(dep.from_task_id, 10);
    const toIdx = parseInt(dep.to_task_id, 10);
    if (isNaN(fromIdx) || isNaN(toIdx)) continue;
    if (fromIdx === toIdx) continue;

    // Check for duplicates
    const exists = planning.dependencies.some(
      (d) => d.predecessor_index === fromIdx && d.successor_index === toIdx,
    );
    if (exists) continue;

    planning.dependencies.push({
      predecessor_index: fromIdx,
      successor_index: toIdx,
      dependency_type: dep.type,
      lag_days: dep.lag_days,
      source: "rule", // AI-suggested dependencies stored as 'rule' source
    });
    added++;
  }

  if (added > 0) {
    console.log(`[planning/generate] Added ${added}/${missingDeps.length} AI-suggested dependencies`);
  }
}
