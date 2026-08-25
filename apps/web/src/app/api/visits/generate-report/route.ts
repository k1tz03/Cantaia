import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { insufficientCreditsResponse, grantCredits } from "@/lib/credits";

export const maxDuration = 60;

interface ClientRequest {
  description: string;
  category: string;
  priority?: string;
  details?: string;
  cfc_code?: string;
}

interface VisitReport {
  title?: string;
  summary?: string;
  client_requests?: ClientRequest[];
  client_info_extracted?: {
    email?: string;
    phone?: string;
    address?: string;
  };
  budget?: {
    client_mentioned: boolean;
    range_min?: number;
    range_max?: number;
    currency?: string;
    notes?: string;
  };
  timeline?: {
    desired_start?: string;
    desired_end?: string;
    urgency?: string;
    constraints?: string;
  };
  next_steps?: string[];
  closing_probability?: number;
  sentiment?: string;
  ai_parse_failed?: boolean;
}

/** Never leave a visit stuck in `report_status: "generating"`. */
async function markReportFailed(client: any, visitId: string) {
  try {
    await (client.from("client_visits") as any)
      .update({ report_status: "failed" })
      .eq("id", visitId);
  } catch (err) {
    console.error("[Visit Report] Failed to mark report as failed:", err);
  }
}

export async function POST(request: NextRequest) {
  // Captured outside the try: the request body is consumed by parseBody(),
  // so request.clone() is no longer usable from the catch block.
  let failedVisitId: string | null = null;
  // Refund context for the outer catch (credits mode only).
  let refundCtx: { orgId: string; amount: number; userId: string } | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: reqBody, error: parseError } = await parseBody(request);
    if (parseError || !reqBody) {
      return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
    }

    const validationError = validateRequired(reqBody, ["visit_id"]);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { visit_id } = reqBody;
    failedVisitId = visit_id;

    // Get the visit
    const { data: visit, error: visitErr } = await (supabase.from("client_visits") as any)
      .select("id, transcription, pre_visit_notes, client_name, client_address, client_postal_code, client_city, visit_date, project_id, organization_id, created_by, title, client_email, client_phone, is_prospect, report_status")
      .eq("id", visit_id)
      .maybeSingle();

    if (visitErr || !visit) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    if (!visit.transcription) {
      return NextResponse.json({ error: "No transcription available" }, { status: 400 });
    }

    // A completed report must not be silently overwritten (a double-click, a
    // stray re-run): tasks would be duplicated. Require an explicit regenerate.
    const regenerate = reqBody.regenerate === true;
    if (visit.report_status === "completed" && !regenerate) {
      return NextResponse.json(
        { error: "report_already_generated", visit_id, report_status: "completed" },
        { status: 409 }
      );
    }

    // Get user info for the prompt (use admin client to bypass RLS recursion on users table)
    const admin = createAdminClient();
    const { data: userData } = await admin
      .from("users")
      .select("first_name, last_name, organization_id")
      .eq("id", user.id)
      .maybeSingle();

    let orgName = "";
    // Captured so a technical failure AFTER the debit can refund exactly what
    // was charged (credits mode only — `remaining_credits` is null in legacy
    // quota mode, where nothing was debited).
    let refundCredits = 0;
    let refundOrgId: string | null = null;
    if (userData?.organization_id) {
      const { data: org } = await (supabase.from("organizations") as any)
        .select("name, subscription_plan")
        .eq("id", userData.organization_id)
        .maybeSingle();
      orgName = org?.name || "";

      // Check AI usage limit BEFORE marking the visit "generating", so a refusal
      // (402/429) leaves the visit untouched instead of stuck on the spinner.
      const usageCheck = await checkUsageLimit(admin, userData.organization_id, org?.subscription_plan || "trial", "visit_report");
      if (!usageCheck.allowed) {
        if (usageCheck.insufficient_credits) {
          return insufficientCreditsResponse(usageCheck.required_credits ?? 1, usageCheck.remaining_credits ?? 0);
        }
        return NextResponse.json(
          { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
          { status: 429 }
        );
      }
      if (usageCheck.remaining_credits !== null) {
        refundCredits = usageCheck.required_credits ?? 0;
        refundOrgId = userData.organization_id;
        if (refundCredits > 0) {
          refundCtx = { orgId: refundOrgId, amount: refundCredits, userId: user.id };
        }
      }
    }

    // Refund the debit on any technical failure past this point.
    const refundOnFailure = async () => {
      if (refundOrgId && refundCredits > 0) {
        await grantCredits(refundOrgId, refundCredits, "refund", `visit_report:${visit_id}`, user.id);
      }
    };

    // Checks passed → now mark the visit as generating.
    await (supabase.from("client_visits") as any)
      .update({ report_status: "generating" })
      .eq("id", visit_id);

    const userName = userData ? `${userData.first_name} ${userData.last_name}` : "";

    // Best-effort: analyse handwritten notes still pending so the report
    // is not generated without them when the user chains actions quickly.
    try {
      const { analyzePendingVisitNotes } = await import("@cantaia/core/visits");
      const analysed = await analyzePendingVisitNotes({
        admin: admin as any,
        visitId: visit_id,
        userId: user.id,
      });
      if (analysed > 0) {
        console.log(`[Visit Report] Analysed ${analysed} pending handwritten note(s) before generating`);
      }
    } catch (notesErr) {
      console.warn("[Visit Report] Pending notes analysis skipped (non-blocking):", notesErr);
    }

    // Fetch handwritten notes if available
    let handwrittenNotes: string | undefined;
    let sketchDescriptions: string[] | undefined;
    try {
      const { data: notesPhotos } = await ((supabase as any).from("visit_photos"))
        .select("ai_transcription, ai_sketch_description, ai_analysis_result")
        .eq("visit_id", visit_id)
        .eq("photo_type", "handwritten_notes")
        .eq("ai_analysis_status", "completed");

      if (notesPhotos && notesPhotos.length > 0) {
        const transcriptions = notesPhotos
          .map((p: any) => p.ai_transcription)
          .filter(Boolean);
        if (transcriptions.length > 0) {
          handwrittenNotes = transcriptions.join("\n\n---\n\n");
        }

        const sketches = notesPhotos
          .flatMap((p: any) => p.ai_analysis_result?.sketches || [])
          .map((s: any) => s.description)
          .filter(Boolean);
        if (sketches.length > 0) {
          sketchDescriptions = sketches;
        }
      }
    } catch {
      // visit_photos table may not exist yet
    }

    // Generate report
    const { buildVisitReportPrompt, getMockVisitReport } = await import("@cantaia/core/visits");

    let report: VisitReport;
    // Mock reports are DEV-ONLY. In production a missing key is a hard failure:
    // writing a fictional report over a real visit is worse than no report.
    const useMock = !process.env.ANTHROPIC_API_KEY && process.env.NODE_ENV === "development";

    if (!process.env.ANTHROPIC_API_KEY && !useMock) {
      await markReportFailed(supabase, visit_id);
      await refundOnFailure();
      return NextResponse.json(
        { error: "Génération indisponible : la clé ANTHROPIC_API_KEY n'est pas configurée.", visit_id, report_status: "failed" },
        { status: 503 }
      );
    }

    if (useMock) {
      console.warn("[Visit Report] DEV ONLY — no ANTHROPIC_API_KEY, using mock report");
      report = getMockVisitReport();
    } else {
      // Pre-visit notes give the model the context the user gathered before the
      // visit — prepended to the transcription so it needs no core signature
      // change.
      const transcriptionForPrompt = visit.pre_visit_notes
        ? `[Notes pré-visite]\n${visit.pre_visit_notes}\n\n[Transcription de la visite]\n${visit.transcription}`
        : visit.transcription;

      // Real Claude API call
      const prompt = buildVisitReportPrompt({
        transcription: transcriptionForPrompt,
        user_name: userName,
        user_company: orgName,
        client_name: visit.client_name,
        client_address: visit.client_address ? `${visit.client_address}, ${visit.client_postal_code || ""} ${visit.client_city || ""}` : undefined,
        visit_date: visit.visit_date,
        handwritten_notes: handwrittenNotes,
        sketch_descriptions: sketchDescriptions,
      });

      const { AI_MODELS, callAnthropicWithRetry, parseAIJson, classifyAIError } = await import("@cantaia/core/ai");
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      // maxRetries:0 — retries are owned by callAnthropicWithRetry, not the SDK
      // (otherwise both retry: the "double retry" the convention forbids).
      const anthropic = new Anthropic({ timeout: 60_000, maxRetries: 0 });
      const model = AI_MODELS.SONNET;

      let response;
      try {
        response = await callAnthropicWithRetry(() =>
          anthropic.messages.create({
            model,
            max_tokens: 4096,
            messages: [{ role: "user", content: prompt }],
          })
        );
      } catch (aiErr) {
        console.error("[Visit Report] Claude call failed:", aiErr);
        await markReportFailed(supabase, visit_id);
        await refundOnFailure();
        const classified = classifyAIError(aiErr, "fr");
        return NextResponse.json(
          { error: classified.message, visit_id, report_status: "failed" },
          { status: classified.status }
        );
      }

      const content = response.content[0];
      const text = content && content.type === "text" ? content.text : "";

      // Parse JSON from response — NO mock fallback: a template report would
      // silently overwrite the real visit data with fictional content.
      const parsed = parseAIJson<VisitReport>(text);
      if (!parsed) {
        console.error("[Visit Report] Failed to parse AI response. Raw:", text.substring(0, 300));
        await markReportFailed(supabase, visit_id);
        await refundOnFailure();
        return NextResponse.json(
          {
            error: "La réponse de l'IA n'a pas pu être interprétée. Relancez la génération du rapport.",
            visit_id,
            report_status: "failed",
          },
          { status: 502 }
        );
      }
      report = parsed;

      // Track API usage.
      // Was a hand-rolled insert under `action_type: "visit_report_generate"`,
      // a key that exists in neither ApiActionType nor CREDIT_COSTS — so the
      // row was billed as `visit_report` but reported under a name no dashboard
      // knows. Canonical tracker + canonical key now.
      trackApiUsage({
        supabase: admin,
        userId: user.id,
        organizationId: visit.organization_id,
        actionType: "visit_report" as any,
        apiProvider: "anthropic",
        model,
        inputTokens: response.usage?.input_tokens || 0,
        outputTokens: response.usage?.output_tokens || 0,
        metadata: { visit_id },
      }).catch(() => {});
    }

    // Update visit title if generated by AI
    const updateData: Record<string, unknown> = {
      report,
      report_status: "completed",
      report_generated_at: new Date().toISOString(),
      status: "report_ready",
    };

    if (report.title && !visit.title) {
      updateData.title = report.title;
    }

    // Extract client info if not already set
    if (report.client_info_extracted) {
      const info = report.client_info_extracted;
      if (info.email && !visit.client_email) updateData.client_email = info.email;
      if (info.phone && !visit.client_phone) updateData.client_phone = info.phone;
      if (info.address && !visit.client_address) updateData.client_address = info.address;
    }

    // supabase-js does not throw: check {error}. A silent failure here would
    // burn the credits, lose the report, and still answer 200 "completed".
    const { error: saveErr } = await (supabase.from("client_visits") as any)
      .update(updateData)
      .eq("id", visit_id);
    if (saveErr) {
      console.error("[Visit Report] Failed to persist report:", saveErr);
      await markReportFailed(supabase, visit_id);
      await refundOnFailure();
      return NextResponse.json(
        { error: "La sauvegarde du rapport a échoué. Relancez la génération.", visit_id, report_status: "failed" },
        { status: 500 }
      );
    }

    // Regeneration replaces the previous run's tasks: delete the old ones first
    // so `force: true` below does not stack a second copy.
    if (regenerate) {
      const { error: delErr } = await admin
        .from("tasks")
        .delete()
        .eq("source_id", visit_id)
        .eq("source", "manual" as any);
      if (delErr) console.error("[Visit Report] Failed to clear previous tasks:", delErr);
    }

    // ──── Auto-create tasks (21.5) ────
    // `tasks.project_id` is NOT NULL: a prospect visit without a linked project
    // cannot carry tasks, so creation is skipped there. The same function is
    // replayed by POST /api/projects/create when such a visit is converted into
    // a project, so nothing is lost — see @cantaia/core/visits.
    const { createVisitTasks } = await import("@cantaia/core/visits");

    const taskResult = await createVisitTasks({
      admin,
      visit: {
        id: visit_id,
        project_id: visit.project_id,
        client_name: visit.client_name,
        visit_date: visit.visit_date,
        created_by: visit.created_by,
        title: visit.title,
      },
      report,
      fallbackUserId: user.id,
      // First generation owns the tasks; the idempotency guard is for the
      // conversion replay.
      force: true,
    });

    if (taskResult.skippedNoProject && process.env.NODE_ENV === "development") {
      console.log("[Visit Report] No linked project — skipping task creation (prospect visit)");
    }

    return NextResponse.json({
      success: true,
      visit_id,
      report_status: "completed",
      quote_task_id: taskResult.quoteTaskId,
      tasks_created: taskResult.createdTaskIds.length + (taskResult.quoteTaskId ? 1 : 0),
      tasks_skipped_no_project: taskResult.skippedNoProject,
      task_errors: taskResult.errors.length > 0 ? taskResult.errors : undefined,
      suggest_create_project: visit.is_prospect && (report.closing_probability || 0) > 0.5 && !visit.project_id,
    });
  } catch (error: unknown) {
    console.error("[Visit Report] Error:", error);

    // Never leave the visit stuck in "generating"
    if (failedVisitId) {
      await markReportFailed(createAdminClient(), failedVisitId);
    }
    // Refund a debit the user paid for a run that crashed.
    if (refundCtx) {
      await grantCredits(refundCtx.orgId, refundCtx.amount, "refund", `visit_report:${failedVisitId}`, refundCtx.userId);
    }

    return NextResponse.json(
      { error: "Internal server error", report_status: "failed" },
      { status: 500 }
    );
  }
}
