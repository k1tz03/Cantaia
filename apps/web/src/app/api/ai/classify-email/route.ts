import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyEmail, type ProjectForClassification, classifyAIError } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

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
    .select("id, sender_email, sender_name, subject, body_preview, received_at, project_id, outlook_message_id")
    .eq("id", body.email_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (emailError || !email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // Get user's projects (include city + client_name for better matching)
  const { data: userData } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  let projects: ProjectForClassification[] = [];
  if (userData?.organization_id) {
    const { data: projectsData } = await adminClient
      .from("projects")
      .select("id, name, code, email_keywords, email_senders, city, client_name")
      .eq("organization_id", userData.organization_id)
      .in("status", ["active", "planning"]);
    projects = (projectsData || []) as ProjectForClassification[];
  }

  // Classify with enhanced 3-case classifier
  let result;
  try {
    result = await classifyEmail(
      anthropicApiKey,
      {
        sender_email: email.sender_email,
        sender_name: email.sender_name || "",
        subject: email.subject,
        body_preview: email.body_preview || "",
        received_at: email.received_at,
      },
      projects,
      undefined,
      (usage) => {
        trackApiUsage({
          supabase: adminClient,
          userId: user.id,
          organizationId: userData?.organization_id ?? "",
          actionType: "email_classify",
          apiProvider: "anthropic",
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          metadata: { email_id: body.email_id },
        });
      }
    );
  } catch (error: any) {
    console.error("[classify-email] AI error:", error?.message);
    const err = classifyAIError(error);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }

  // Build update payload based on match_type
  const confidencePercent = Math.round(result.confidence * 100);

  if (result.match_type === "existing_project") {
    const isAutoClassified = result.confidence >= 0.85;
    await adminClient
      .from("email_records")
      .update({
        project_id: result.project_id || null,
        classification: result.classification || "info_only",
        ai_summary: result.summary_fr,
        ai_classification_confidence: result.classification_confidence || confidencePercent,
        ai_project_match_confidence: confidencePercent,
        classification_status: isAutoClassified ? "auto_classified" : "suggested",
        email_category: "project",
        ai_reasoning: result.reasoning || null,
        is_processed: true,
      })
      .eq("id", email.id);
  } else if (result.match_type === "new_project") {
    await adminClient
      .from("email_records")
      .update({
        project_id: null,
        classification: result.classification || "action_required",
        ai_summary: result.summary_fr,
        ai_classification_confidence: result.classification_confidence || confidencePercent,
        ai_project_match_confidence: 0,
        classification_status: "new_project_suggested",
        email_category: "project",
        suggested_project_data: result.suggested_project || null,
        ai_reasoning: result.reasoning || null,
        is_processed: true,
      })
      .eq("id", email.id);
  } else {
    await adminClient
      .from("email_records")
      .update({
        project_id: null,
        classification: "info_only",
        ai_summary: result.summary_fr,
        ai_classification_confidence: confidencePercent,
        ai_project_match_confidence: 0,
        classification_status: "classified_no_project",
        email_category: result.email_category || "personal",
        ai_reasoning: result.reasoning || null,
        is_processed: true,
      })
      .eq("id", email.id);
  }

  return NextResponse.json({ success: true, result });
}
