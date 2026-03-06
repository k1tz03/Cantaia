import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

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

export async function POST(request: NextRequest) {
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

    // Get user info for the prompt
    const { data: userData } = await (supabase.from("users") as any)
      .select("first_name, last_name, organization_id")
      .eq("id", user.id)
      .maybeSingle();

    let orgName = "";
    if (userData?.organization_id) {
      const { data: org } = await (supabase.from("organizations") as any)
        .select("name")
        .eq("id", userData.organization_id)
        .maybeSingle();
      orgName = org?.name || "";
    }

    const userName = userData ? `${userData.first_name} ${userData.last_name}` : "";

    // Generate report
    const { buildVisitReportPrompt, getMockVisitReport } = await import("@cantaia/core/visits");

    let report: VisitReport;
    const useMock = !process.env.ANTHROPIC_API_KEY;

    if (useMock) {
      if (process.env.NODE_ENV === "development") console.log("[Visit Report] Using mock report");
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

      // Parse JSON from response
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          report = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error("No JSON in response");
        }
      } catch (parseErr) {
        console.error("[Visit Report] Failed to parse AI response, falling back to template. Raw:", text.substring(0, 300));
        report = getMockVisitReport() as VisitReport;
        report.ai_parse_failed = true;
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

    let quoteTaskId: string | null = null;

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

      const { data: quoteTask } = await (supabase.from("tasks") as any)
        .insert({
          title: `Établir devis — ${visit.client_name}${report.title ? ` — ${report.title}` : ""}`,
          description: `Suite à la visite du ${visit.visit_date}.\n\nDemandes du client :\n${requestsList}\n\n${budgetInfo}\n${timelineInfo}`,
          project_id: visit.project_id || null,
          organization_id: visit.organization_id,
          assignee_id: visit.created_by,
          priority,
          due_date: dueDate.toISOString().split("T")[0],
          status: "todo",
          source_type: "client_visit",
          source_id: visit_id,
        })
        .select("id")
        .single();

      if (quoteTask) {
        quoteTaskId = quoteTask.id;
        await (supabase.from("client_visits") as any)
          .update({ quote_task_id: quoteTask.id })
          .eq("id", visit_id);
      }
    }

    // Next steps tasks (only actionable ones)
    const createdTasks: string[] = [];
    if (report.next_steps && report.next_steps.length > 0) {
      for (const step of report.next_steps) {
        // Skip the main "devis" step since we already created it
        if (step.toLowerCase().includes("devis")) continue;

        const { data: stepTask } = await (supabase.from("tasks") as any)
          .insert({
            title: step,
            description: `Suite à la visite — ${visit.client_name} (${visit.visit_date})`,
            project_id: visit.project_id || null,
            organization_id: visit.organization_id,
            assignee_id: visit.created_by,
            priority: "medium",
            due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
            status: "todo",
            source_type: "client_visit",
            source_id: visit_id,
          })
          .select("id")
          .single();

        if (stepTask) createdTasks.push(stepTask.id);
      }
    }

    return NextResponse.json({
      success: true,
      visit_id,
      report_status: "completed",
      quote_task_id: quoteTaskId,
      tasks_created: createdTasks.length + (quoteTaskId ? 1 : 0),
      suggest_create_project: visit.is_prospect && (report.closing_probability || 0) > 0.5 && !visit.project_id,
    });
  } catch (error: unknown) {
    console.error("[Visit Report] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
