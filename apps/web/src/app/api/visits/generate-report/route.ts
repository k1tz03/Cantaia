import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { checkUsageLimit } from "@cantaia/config/plan-features";

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
      .select("id, transcription, client_name, client_address, client_postal_code, client_city, visit_date, project_id, organization_id, created_by, title, client_email, client_phone, is_prospect")
      .eq("id", visit_id)
      .maybeSingle();

    if (visitErr || !visit) {
      return NextResponse.json({ error: "Visit not found" }, { status: 404 });
    }

    if (!visit.transcription) {
      return NextResponse.json({ error: "No transcription available" }, { status: 400 });
    }

    // Update status
    await (supabase.from("client_visits") as any)
      .update({ report_status: "generating" })
      .eq("id", visit_id);

    // Get user info for the prompt (use admin client to bypass RLS recursion on users table)
    const admin = createAdminClient();
    const { data: userData } = await admin
      .from("users")
      .select("first_name, last_name, organization_id")
      .eq("id", user.id)
      .maybeSingle();

    let orgName = "";
    if (userData?.organization_id) {
      const { data: org } = await (supabase.from("organizations") as any)
        .select("name, subscription_plan")
        .eq("id", userData.organization_id)
        .maybeSingle();
      orgName = org?.name || "";

      // Check AI usage limit
      const usageCheck = await checkUsageLimit(admin, userData.organization_id, org?.subscription_plan || "trial");
      if (!usageCheck.allowed) {
        await markReportFailed(supabase, visit_id);
        return NextResponse.json(
          { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
          { status: 429 }
        );
      }
    }

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
      return NextResponse.json(
        { error: "Génération indisponible : la clé ANTHROPIC_API_KEY n'est pas configurée.", visit_id, report_status: "failed" },
        { status: 503 }
      );
    }

    if (useMock) {
      console.warn("[Visit Report] DEV ONLY — no ANTHROPIC_API_KEY, using mock report");
      report = getMockVisitReport();
    } else {
      // Real Claude API call
      const prompt = buildVisitReportPrompt({
        transcription: visit.transcription,
        user_name: userName,
        user_company: orgName,
        client_name: visit.client_name,
        client_address: visit.client_address ? `${visit.client_address}, ${visit.client_postal_code || ""} ${visit.client_city || ""}` : undefined,
        visit_date: visit.visit_date,
        handwritten_notes: handwrittenNotes,
        sketch_descriptions: sketchDescriptions,
      });

      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const anthropic = new Anthropic({ timeout: 60_000 });

      const response = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const content = response.content[0];
      if (!content) {
        throw new Error("Empty response from Claude API");
      }
      const text = content.type === "text" ? content.text : "";

      // Parse JSON from response — NO mock fallback: a template report would
      // silently overwrite the real visit data with fictional content.
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON in response");
        report = JSON.parse(jsonMatch[0]);
      } catch {
        console.error("[Visit Report] Failed to parse AI response. Raw:", text.substring(0, 300));
        await markReportFailed(supabase, visit_id);
        return NextResponse.json(
          {
            error: "La réponse de l'IA n'a pas pu être interprétée. Relancez la génération du rapport.",
            visit_id,
            report_status: "failed",
          },
          { status: 502 }
        );
      }

      // Track API usage
      try {
        await (supabase.from("api_usage_logs") as any).insert({
          user_id: user.id,
          organization_id: visit.organization_id,
          action_type: "visit_report_generate",
          api_provider: "anthropic",
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5-20250929",
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          estimated_cost_chf: (response.usage.input_tokens * 0.003 + response.usage.output_tokens * 0.015) / 1000,
          metadata: { visit_id },
        });
      } catch {
        // non-critical
      }
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

    await (supabase.from("client_visits") as any)
      .update(updateData)
      .eq("id", visit_id);

    // ──── Auto-create tasks (21.5) ────
    // `tasks.project_id` is NOT NULL: a prospect visit without a linked
    // project cannot carry tasks. Skip creation entirely in that case.

    let quoteTaskId: string | null = null;
    const createdTasks: string[] = [];
    const taskErrors: string[] = [];

    if (!visit.project_id) {
      if (process.env.NODE_ENV === "development") {
        console.log("[Visit Report] No linked project — skipping task creation (prospect visit)");
      }
    } else {
    // Main task: establish quote
    if (report.client_requests && report.client_requests.length > 0) {
      const requestsList = report.client_requests
        .map((r: ClientRequest) => `- ${r.description} (${r.category})`)
        .join("\n");

      const budgetInfo = report.budget?.client_mentioned
        ? `Budget client : ${report.budget.range_min?.toLocaleString()}-${report.budget.range_max?.toLocaleString()} ${report.budget.currency || "CHF"}`
        : "Budget non évoqué";

      const timelineInfo = report.timeline?.desired_start
        ? `Délai souhaité : ${report.timeline.desired_start}${report.timeline.desired_end ? ` — ${report.timeline.desired_end}` : ""}`
        : "";

      // Calculate due date (5 business days from visit)
      const visitDate = new Date(visit.visit_date);
      let dueDate = new Date(visitDate);
      let businessDays = 0;
      while (businessDays < 5) {
        dueDate.setDate(dueDate.getDate() + 1);
        const day = dueDate.getDay();
        if (day !== 0 && day !== 6) businessDays++;
      }

      const urgency = report.timeline?.urgency;
      const priority = (urgency === "high" || urgency === "critical") ? "high" : "medium";

      // NOTE: real `tasks` columns are assigned_to / source / source_id
      // (see migrations 001 + 006). `source` is the task_source enum
      // ('email' | 'meeting' | 'manual' | 'reserve') — there is no 'visit'
      // value, so we use 'manual' and carry the visit id in source_id.
      const { data: quoteTask, error: quoteTaskErr } = await (admin.from("tasks") as any)
        .insert({
          title: `Établir devis — ${visit.client_name}${report.title ? ` — ${report.title}` : ""}`,
          description: `Suite à la visite du ${visit.visit_date}.\n\nDemandes du client :\n${requestsList}\n\n${budgetInfo}\n${timelineInfo}`,
          project_id: visit.project_id,
          created_by: visit.created_by || user.id,
          assigned_to: visit.created_by || user.id,
          priority,
          due_date: dueDate.toISOString().split("T")[0],
          status: "todo",
          source: "manual",
          source_id: visit_id,
          source_reference: `Visite client — ${visit.client_name}`,
        })
        .select("id")
        .single();

      if (quoteTaskErr) {
        console.error("[Visit Report] Quote task insert failed:", quoteTaskErr);
        taskErrors.push(quoteTaskErr.message);
      } else if (quoteTask) {
        quoteTaskId = quoteTask.id;
        const { error: linkErr } = await (admin.from("client_visits") as any)
          .update({ quote_task_id: quoteTask.id })
          .eq("id", visit_id);
        if (linkErr) {
          console.error("[Visit Report] Failed to link quote_task_id:", linkErr);
        }
      }
    }

    // Next steps tasks (only actionable ones)
    if (report.next_steps && report.next_steps.length > 0) {
      for (const step of report.next_steps) {
        // Skip the main "devis" step since we already created it
        if (step.toLowerCase().includes("devis")) continue;

        const { data: stepTask, error: stepTaskErr } = await (admin.from("tasks") as any)
          .insert({
            title: step,
            description: `Suite à la visite — ${visit.client_name} (${visit.visit_date})`,
            project_id: visit.project_id,
            created_by: visit.created_by || user.id,
            assigned_to: visit.created_by || user.id,
            priority: "medium",
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            status: "todo",
            source: "manual",
            source_id: visit_id,
            source_reference: `Visite client — ${visit.client_name}`,
          })
          .select("id")
          .single();

        if (stepTaskErr) {
          console.error("[Visit Report] Step task insert failed:", stepTaskErr);
          taskErrors.push(stepTaskErr.message);
        } else if (stepTask) {
          createdTasks.push(stepTask.id);
        }
      }
    }
    }

    return NextResponse.json({
      success: true,
      visit_id,
      report_status: "completed",
      quote_task_id: quoteTaskId,
      tasks_created: createdTasks.length + (quoteTaskId ? 1 : 0),
      tasks_skipped_no_project: !visit.project_id,
      task_errors: taskErrors.length > 0 ? taskErrors : undefined,
      suggest_create_project: visit.is_prospect && (report.closing_probability || 0) > 0.5 && !visit.project_id,
    });
  } catch (error: unknown) {
    console.error("[Visit Report] Error:", error);

    // Never leave the visit stuck in "generating"
    if (failedVisitId) {
      await markReportFailed(createAdminClient(), failedVisitId);
    }

    return NextResponse.json(
      { error: "Internal server error", report_status: "failed" },
      { status: 500 }
    );
  }
}
