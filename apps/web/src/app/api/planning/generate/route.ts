import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePlanning, rescheduleCPM } from "@cantaia/core/planning";
import type { GeneratedPlanning, AIValidationResult } from "@cantaia/core/planning";
import { AI_MODELS, callAnthropicWithRetry, parseAIJson, classifyAIError } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { insufficientCreditsResponse } from "@/lib/credits";

export const maxDuration = 300;

/** Negative lags (trade overlaps) are allowed but bounded — same floor as the generator */
const MAX_NEGATIVE_LAG = -10;

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

    // NOTE: the credit check (which DEBITS) is deliberately deferred until AFTER
    // the payload is validated, the project org-check passes and the submission
    // is verified — see the submission branch below. A malformed request, a
    // foreign project or a manual/empty planning must never cost a credit.
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

      // NOTE: the previous planning is deleted only AFTER the new one is fully
      // written (see end of this branch) — never delete first, or a failed
      // insert leaves the project with no planning at all.

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

      // supabase-js never throws — every write below is checked. If any part of
      // the skeleton fails to persist, the half-written planning is removed and
      // the previous one is left intact (it is only deleted once we are sure the
      // new structure is complete).
      const cleanupIncomplete = async () => {
        await (admin as any)
          .from("project_plannings")
          .delete()
          .eq("id", planningId)
          .eq("organization_id", userProfile.organization_id);
      };

      // Insert 2 milestones as tasks (no phases needed for milestones)
      // Create a default phase to hold future tasks
      const { data: phaseRow, error: phaseError } = await (admin as any)
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

      if (phaseError || !phaseRow) {
        console.error("[planning/generate] Insert empty phase error:", phaseError);
        await cleanupIncomplete();
        return NextResponse.json({ error: "Failed to save planning" }, { status: 500 });
      }

      // Milestone: Start
      const { error: startMsError } = await (admin as any)
        .from("planning_tasks")
        .insert({
          planning_id: planningId,
          phase_id: phaseRow.id,
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
      const { error: endMsError } = await (admin as any)
        .from("planning_tasks")
        .insert({
          planning_id: planningId,
          phase_id: phaseRow.id,
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

      if (startMsError || endMsError) {
        console.error("[planning/generate] Insert empty milestones error:", startMsError || endMsError);
        await cleanupIncomplete();
        return NextResponse.json({ error: "Failed to save planning" }, { status: 500 });
      }

      // Now that the new planning is complete, retire the previous one(s).
      const { error: cleanupError } = await (admin as any)
        .from("project_plannings")
        .delete()
        .eq("project_id", project_id)
        .eq("organization_id", userProfile.organization_id)
        .neq("id", planningId);
      if (cleanupError) {
        // Non-fatal: the new planning exists; a stale one may linger.
        console.error("[planning/generate] Cleanup of previous planning failed:", cleanupError.message);
      }

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

    // ─── Credit check (DEBITS) — only now that the request is fully validated ───
    // Placing it here means a 400/403/404 never bills the org; the credit is
    // consumed immediately before the expensive generation + AI pass.
    const { data: orgData } = await (admin as any)
      .from("organizations")
      .select("subscription_plan")
      .eq("id", userProfile.organization_id)
      .single();

    const usageCheck = await checkUsageLimit(admin, userProfile.organization_id, orgData?.subscription_plan || "trial", "planning_generate");
    if (!usageCheck.allowed) {
      if (usageCheck.insufficient_credits) {
        return insufficientCreditsResponse(usageCheck.required_credits ?? 1, usageCheck.remaining_credits ?? 0);
      }
      return NextResponse.json(
        { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
        { status: 429 }
      );
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
        max_concurrent_crews: config.max_concurrent_crews,
        building_closures: config.building_closures,
        use_swiss_calendar: config.use_swiss_calendar,
      },
      supabase: admin,
    });

    // ─── AI Validation Pass (Claude) ───────────────────────────────────────────
    // The AI no longer touches durations: the algorithm plus the org
    // calibration loop are better at that, and the corrections used to be
    // applied WITHOUT rescheduling, which made the pass purely decorative.
    // Claude now does what it is actually good at — contextual risks, a
    // procurement plan, and a written synthesis — plus genuinely missing
    // sequence links, which ARE rescheduled below.
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
        const added = applyMissingDependencies(planning, aiValidation.missing_dependencies);
        planning.ai_validation = aiValidation;

        console.log(
          `[planning/generate] AI validation: ${added} dependances ajoutees, ` +
          `${aiValidation.risks.length} risques, ${aiValidation.procurement_plan.length} commandes`
        );
      }
    } catch (err) {
      // AI validation is non-fatal — we still save the algorithmic planning.
      const classified = classifyAIError(err);
      console.error(`[planning/generate] AI validation failed (non-fatal): ${classified.message}`, err);
    }

    // ─── Re-run the CPM AFTER the AI pass ──────────────────────────────────────
    // Without this the AI's dependencies sit in the graph but never move a
    // single date (audit distortion D5).
    try {
      const rescheduled = rescheduleCPM(planning, { start_date: config.start_date });
      console.log(
        `[planning/generate] CPM post-IA: ${rescheduled.project_duration} j ouvres, fin ${rescheduled.calculated_end_date}` +
        (rescheduled.cyclic_task_ids.length > 0
          ? ` — ATTENTION ${rescheduled.cyclic_task_ids.length} taches sur un cycle`
          : "")
      );
    } catch (err) {
      console.error("[planning/generate] rescheduleCPM failed (non-fatal):", err);
    }

    // NOTE: only one planning per project, but the previous one is deleted only
    // AFTER the new planning + phases + tasks are written (see below). Deleting
    // first meant any failure during insert wiped the existing planning.

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
        config: {
          constraints: config.constraints,
          max_concurrent_crews: config.max_concurrent_crews ?? null,
        },
        // Dedicated columns (migration 057) — the Gantt reads these directly
        ai_summary: aiValidation?.summary || null,
        ai_recommendations: aiValidation
          ? { recommendations: aiValidation.recommendations, procurement_plan: aiValidation.procurement_plan }
          : [],
        ai_generation_log: {
          ...(typeof planning.ai_generation_log === "object" && planning.ai_generation_log
            ? planning.ai_generation_log
            : {}),
          ai_validation: aiValidation,
        },
        created_by: user.id,
      })
      .select("id")
      .single();

    if (planningError || !planningRow) {
      console.error("[planning/generate] Insert planning error:", planningError);
      return NextResponse.json({ error: "Failed to save planning" }, { status: 500 });
    }

    const planningId = planningRow.id;
    // Tracks whether every phase was written — the previous planning is only
    // retired when the new structure is complete.
    let structureComplete = true;

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
        structureComplete = false;
        continue;
      }

      // One round-trip per phase instead of one per task: a realistic planning
      // now carries 60+ tasks and the sequential inserts alone ate seconds of
      // the serverless budget.
      const { error: tasksError } = await (admin as any)
        .from("planning_tasks")
        .insert(phase.tasks.map((task) => ({
          planning_id: planningId,
          phase_id: phaseRow.id,
          submission_item_id: task.submission_item_id,
          // Every submission item folded into this task (migration 094).
          // Without it the calibration loop cannot trace a task back to its
          // quantities, and site reports cannot be attributed to a lot.
          source_item_ids: task.source_item_ids ?? [],
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
        })));

      if (tasksError) {
        console.error(`[planning/generate] Insert tasks error (phase "${phase.name}"):`, tasksError.message);
        structureComplete = false;
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

        const rows = planning.dependencies
          .map((dep) => {
            const predId = taskIdByIndex.get(dep.predecessor_index);
            const succId = taskIdByIndex.get(dep.successor_index);
            if (!predId || !succId) return null;
            return {
              planning_id: planningId,
              predecessor_id: predId,
              successor_id: succId,
              dependency_type: dep.dependency_type,
              lag_days: dep.lag_days,
              // The DB CHECK only allows auto|manual; rule-derived links are auto.
              source: dep.source === "rule" ? "auto" : dep.source,
            };
          })
          .filter(Boolean);

        if (rows.length > 0) {
          const { error: depsError } = await (admin as any)
            .from("planning_dependencies")
            .insert(rows);

          if (depsError) {
            console.error("[planning/generate] Insert dependencies error:", depsError.message);
          } else {
            console.log(`[planning/generate] ${rows.length} dependances inserees`);
          }
        }
      }
    } catch (err) {
      console.error("[planning/generate] Insert dependencies error:", err);
    }

    // Retire the previous planning(s) only now that the new one is fully written.
    if (structureComplete) {
      try {
        await (admin as any)
          .from("project_plannings")
          .delete()
          .eq("project_id", project_id)
          .eq("organization_id", userProfile.organization_id)
          .neq("id", planningId);
      } catch (err) {
        // Non-fatal: the new planning exists; a stale one may linger.
        console.error("[planning/generate] Cleanup of previous planning failed:", err);
      }
    } else {
      console.warn(
        `[planning/generate] Phase inserts incomplete — previous planning kept for project=${project_id}`,
      );
    }

    // Track API usage (mechanical generation + AI validation)
    trackApiUsage({
      supabase: admin as any,
      userId: user.id,
      organizationId: userProfile.organization_id,
      actionType: "planning_generate" as any,
      apiProvider: "anthropic" as any,
      model: aiValidation ? AI_MODELS.SONNET : "mechanical",
      inputTokens: aiInputTokens,
      outputTokens: aiOutputTokens,
      metadata: {
        project_id,
        submission_id,
        phases_count: planning.phases.length,
        ai_validation: !!aiValidation,
        ai_missing_deps: aiValidation?.missing_dependencies.length ?? 0,
        ai_risks: aiValidation?.risks.length ?? 0,
        ai_procurement: aiValidation?.procurement_plan.length ?? 0,
      },
    }).catch(() => {});

    console.log(`[planning/generate] Success: id=${planningId}, phases=${planning.phases.length}, ai_validated=${!!aiValidation}`);

    return NextResponse.json({
      success: true,
      planning_id: planningId,
      phases_count: planning.phases.length,
      calculated_end_date: planning.calculated_end_date,
      ai_validation: aiValidation ? {
        missing_deps_count: aiValidation.missing_dependencies.length,
        risks_count: aiValidation.risks.length,
        recommendations_count: aiValidation.recommendations.length,
        procurement_count: aiValidation.procurement_plan.length,
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

  const milestones: Array<{ sort_order: number; name: string; type: string | null; date: string }> = [];
  for (const phase of planning.phases) {
    for (const t of phase.tasks) {
      if (t.is_milestone) {
        milestones.push({ sort_order: t.sort_order, name: t.name, type: t.milestone_type, date: t.start_date });
      }
    }
  }

  const validationPrompt = `Tu es un conducteur de travaux suisse avec 20+ ans d'experience.
Voici un planning de chantier genere algorithmiquement (durees calculees a partir de ratios CRB,
sequence issue des regles CFC, calendrier suisse avec feries cantonaux et vacances du batiment).

NE CORRIGE PAS LES DUREES. Elles sont calculees a partir des quantites reelles de la soumission et
calibrees sur l'historique de l'entreprise — ton role est ailleurs.

PLANNING:
${JSON.stringify({
    total_duration_working_days: (planning.ai_generation_log as any)?.project_duration_working_days,
    critical_path_days: planning.critical_path_length,
    calculated_end_date: planning.calculated_end_date,
    canton: (planning.ai_generation_log as any)?.config?.canton ?? null,
    project_type: (planning.ai_generation_log as any)?.config?.project_type ?? null,
    phases: planning.phases.map((p) => ({
      name: p.name,
      tasks_count: p.tasks.filter((t) => !t.is_milestone).length,
      start: p.start_date,
      end: p.end_date,
    })),
    tasks: tasksForAI,
    milestones: milestones.slice(0, 30),
    dependencies_count: planning.dependencies.length,
  })}

Retourne UNIQUEMENT un objet JSON avec ces cles:
- missing_dependencies: [{from_task_id, to_task_id, type, lag_days, reason}]
  Liens de sequence CRITIQUES reellement manquants (task_id = sort_order). lag_days en jours OUVRES.
  Si la sequence est coherente, retourne un tableau vide. Pas de micro-optimisation.
- risks: [{title, probability: "high"|"medium"|"low", impact_days, mitigation}]
  3 a 6 risques CONTEXTUALISES sur CE planning: cite les taches et les dates concernees.
  Pense meteo du canton, SIA 118, coordination des corps de metier, sechages, acces au chantier.
- procurement_plan: [{cfc_code, lot, order_by, lead_time_weeks, reason}]
  Les commandes a passer, avec la date limite (format YYYY-MM-DD) deduite des jalons "Commande ...".
  Ajoute les lots a delai long que le planning aurait oublies.
- recommendations: [{title, description, impact: "high"|"medium"|"low"}]
  Optimisations de sequence ou de coordination (pas de reduction de duree arbitraire).
- summary: string
  Note de synthese en francais pour le maitre d'ouvrage, 4 a 6 phrases: duree totale, jalons cles
  (hors d'eau, hors d'air, reception), points de vigilance.

JSON uniquement, pas de markdown, pas de commentaire.`;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // maxRetries:0 on the SDK — retries/backoff are owned by callAnthropicWithRetry,
  // otherwise a surcharge would be retried up to 3×3 times and billed each time.
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    timeout: 90_000,
    maxRetries: 0,
  });

  const response = await callAnthropicWithRetry(() =>
    client.messages.create({
      model: AI_MODELS.SONNET,
      max_tokens: 4096,
      messages: [{ role: "user", content: validationPrompt }],
    }),
  );

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  const rawText = response.content
    .filter((block: any) => block.type === "text")
    .map((block: any) => block.text)
    .join("");

  // Reuse the shared tolerant parser instead of a bespoke one.
  const parsed = parseAIJson<any>(rawText);
  if (!parsed) {
    console.warn("[planning/generate] Failed to parse AI validation response. Preview:", rawText.substring(0, 200));
  }
  const validation = parsed ? validateAndNormalize(parsed) : null;

  return { validation, inputTokens, outputTokens };
}

/**
 * Validate and normalize the parsed AI response.
 * Ensures all required fields exist with correct types.
 */
function validateAndNormalize(parsed: any): AIValidationResult {
  return {
    missing_dependencies: Array.isArray(parsed.missing_dependencies)
      ? parsed.missing_dependencies
          .filter((d: any) => d && typeof d.from_task_id !== "undefined" && typeof d.to_task_id !== "undefined")
          .map((d: any) => ({
            from_task_id: String(d.from_task_id),
            to_task_id: String(d.to_task_id),
            type: (["FS", "SS", "FF", "SF"].includes(d.type) ? d.type : "FS") as "FS" | "SS" | "FF" | "SF",
            // Negative lags (overlaps) are allowed but bounded, like the generator's
            lag_days: Math.max(MAX_NEGATIVE_LAG, Math.min(120, Math.round(Number(d.lag_days) || 0))),
            reason: String(d.reason || ""),
          }))
      : [],
    procurement_plan: Array.isArray(parsed.procurement_plan)
      ? parsed.procurement_plan
          .filter((p: any) => p && (p.lot || p.cfc_code))
          .slice(0, 20)
          .map((p: any) => ({
            cfc_code: p.cfc_code ? String(p.cfc_code) : null,
            lot: String(p.lot || p.cfc_code || ""),
            order_by: /^\d{4}-\d{2}-\d{2}$/.test(String(p.order_by || "")) ? String(p.order_by) : "",
            lead_time_weeks: Math.max(0, Math.min(104, Math.round(Number(p.lead_time_weeks) || 0))),
            reason: String(p.reason || ""),
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
 * Add AI-suggested missing dependencies to the planning.
 *
 * A suggestion is rejected when it would close a cycle: the CPM cannot
 * topologically order a cyclic graph, and the previous code let the model
 * introduce one silently. Returns how many links were actually added.
 */
function applyMissingDependencies(
  planning: GeneratedPlanning,
  missingDeps: AIValidationResult["missing_dependencies"],
): number {
  if (!missingDeps || missingDeps.length === 0) return 0;

  const validSortOrders = new Set<number>();
  for (const phase of planning.phases) {
    for (const task of phase.tasks) validSortOrders.add(task.sort_order);
  }

  /** Can `from` already reach `to` through the existing graph? */
  const reaches = (from: number, to: number): boolean => {
    const seen = new Set<number>([from]);
    const stack = [from];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === to) return true;
      for (const dep of planning.dependencies) {
        if (dep.predecessor_index === current && !seen.has(dep.successor_index)) {
          seen.add(dep.successor_index);
          stack.push(dep.successor_index);
        }
      }
    }
    return false;
  };

  let added = 0;
  let rejected = 0;

  for (const dep of missingDeps) {
    const fromIdx = parseInt(dep.from_task_id, 10);
    const toIdx = parseInt(dep.to_task_id, 10);

    if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) continue;
    if (!validSortOrders.has(fromIdx) || !validSortOrders.has(toIdx)) continue;

    const exists = planning.dependencies.some(
      (d) => d.predecessor_index === fromIdx && d.successor_index === toIdx,
    );
    if (exists) continue;

    // Adding from → to closes a cycle iff to already reaches from.
    if (reaches(toIdx, fromIdx)) {
      rejected++;
      console.warn(
        `[planning/generate] AI dependency ${fromIdx}→${toIdx} rejected: would create a cycle (${dep.reason})`,
      );
      continue;
    }

    planning.dependencies.push({
      predecessor_index: fromIdx,
      successor_index: toIdx,
      dependency_type: dep.type,
      lag_days: Math.max(MAX_NEGATIVE_LAG, Math.round(dep.lag_days)),
      source: "rule",
    });
    added++;
  }

  console.log(
    `[planning/generate] AI dependencies: ${added} ajoutees, ${rejected} rejetees (cycle), ` +
    `${missingDeps.length - added - rejected} ignorees`,
  );

  return added;
}
