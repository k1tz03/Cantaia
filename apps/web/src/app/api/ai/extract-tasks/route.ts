import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractTasks, cleanEmailForAI, classifyAIError } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { checkUsageLimit } from "@cantaia/config/plan-features";
import { insufficientCreditsResponse } from "@/lib/credits";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: body, error: parseError } = await parseBody(request);
  if (parseError || !body) {
    return NextResponse.json({ error: parseError || "Invalid request" }, { status: 400 });
  }

  const requiredError = validateRequired(body, ["email_id"]);
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

  const adminClient = createAdminClient();

  // Get the email
  const { data: email, error: emailError } = await adminClient
    .from("email_records")
    .select("id, sender_email, sender_name, subject, body_preview, project_id, outlook_message_id")
    .eq("id", body.email_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (emailError || !email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // Get project context if email is assigned to one
  let projectContext = { name: "Non classé" };
  if (email.project_id) {
    const { data: project } = await adminClient
      .from("projects")
      .select("name")
      .eq("id", email.project_id)
      .maybeSingle();
    if (project) {
      projectContext = { name: project.name };
    }
  }

  // Get user org for tracking
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  // Check AI usage limit
  if (userOrg?.organization_id) {
    const { data: org } = await adminClient
      .from("organizations")
      .select("subscription_plan")
      .eq("id", userOrg.organization_id)
      .single();

    const usageCheck = await checkUsageLimit(adminClient, userOrg.organization_id, org?.subscription_plan || "trial", "task_extract");
    if (!usageCheck.allowed) {
      if (usageCheck.insufficient_credits) {
        return insufficientCreditsResponse(usageCheck.required_credits ?? 1, usageCheck.remaining_credits ?? 0);
      }
      return NextResponse.json(
        { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
        { status: 429 }
      );
    }
  }

  // Fetch full email body from Microsoft Graph for better task extraction
  let bodyContent = email.body_preview || "";
  if (email.outlook_message_id) {
    try {
      const tokenResult = await getValidMicrosoftToken(user.id);
      if (tokenResult.accessToken) {
        const graphRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${email.outlook_message_id}?$select=body`,
          { headers: { Authorization: `Bearer ${tokenResult.accessToken}` } }
        );
        if (graphRes.ok) {
          const graphData = await graphRes.json();
          if (graphData.body?.content) {
            bodyContent = cleanEmailForAI(graphData.body.content);
          }
        }
      }
    } catch {
      // Fallback to body_preview
    }
  }

  let result;
  try {
    result = await extractTasks(
      anthropicApiKey,
      {
        sender_email: email.sender_email,
        sender_name: email.sender_name || "",
        subject: email.subject,
        body: bodyContent,
      },
      projectContext,
      undefined,
      (usage) => {
        trackApiUsage({
          supabase: adminClient,
          userId: user.id,
          organizationId: userOrg?.organization_id ?? "",
          actionType: "task_extract",
          apiProvider: "anthropic",
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          metadata: { email_id: body.email_id },
        });
      }
    );
  } catch (error: any) {
    console.error("[extract-tasks] AI error:", error?.message);
    const err = classifyAIError(error);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }

  // ── D-FIX5 — optional persistence ────────────────────────────────
  // Callers used to throw the result away: the panel called this route on every
  // open (paying Claude each time) and rendered a list of tasks that existed
  // nowhere. With `persist: true` the extracted tasks are inserted right here,
  // scoped to the email's project, and returned with their real ids.
  const persist = body.persist === true || body.persist === "true";
  const extracted = result.tasks || [];

  if (!persist || extracted.length === 0) {
    return NextResponse.json({ success: true, persisted: false, tasks: extracted });
  }

  if (!email.project_id) {
    return NextResponse.json({
      success: true,
      persisted: false,
      tasks: extracted,
      error: "no_project",
      message: "L'email n'est rattaché à aucun projet — impossible de créer les tâches.",
    });
  }

  // Anti-IDOR: the email is already scoped to `user.id`, but the project it
  // points at must belong to the caller's organisation before we write to it.
  const { data: project } = await adminClient
    .from("projects")
    .select("id, organization_id")
    .eq("id", email.project_id)
    .maybeSingle();

  if (!project || !userOrg?.organization_id || project.organization_id !== userOrg.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = extracted
    .filter((t: any) => t?.title)
    .map((t: any) => ({
      project_id: email.project_id,
      created_by: user.id,
      title: t.title,
      description: t.description || null,
      priority: t.priority || "medium",
      status: "todo" as const,
      source: "email" as const,
      source_id: email.id,
      source_reference: `Email: ${email.subject}`,
      assigned_to_name: t.assigned_to_name || null,
      assigned_to_company: t.assigned_to_company || null,
      due_date: t.due_date || null,
    }));

  const { data: inserted, error: insertErr } = await (adminClient as any)
    .from("tasks")
    .insert(rows)
    .select("id, title, assigned_to_name, due_date, priority, status");

  if (insertErr) {
    console.error("[extract-tasks] Task insert failed:", insertErr.message);
    return NextResponse.json(
      { success: false, persisted: false, tasks: extracted, error: insertErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    persisted: true,
    created: inserted?.length || 0,
    tasks: inserted || [],
  });
}
