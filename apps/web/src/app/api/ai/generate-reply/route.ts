import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReply, cleanEmailForAI, classifyAIError, type ReplyInstructions } from "@cantaia/core/ai";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { trackApiUsage } from "@cantaia/core/tracking";
import { parseBody, validateRequired } from "@/lib/api/parse-body";
import { checkUsageLimit } from "@cantaia/config/plan-features";

export const maxDuration = 60;

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
    .select("id, sender_email, sender_name, subject, body_preview, project_id, outlook_message_id, recipients, received_at")
    .eq("id", body.email_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (emailError || !email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  // Get user profile
  const { data: userProfile } = await adminClient
    .from("users")
    .select("first_name, last_name, role, organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userProfile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  // Get company name + check usage limit
  let companyName = "Cantaia";
  if (userProfile.organization_id) {
    const { data: org } = await adminClient
      .from("organizations")
      .select("name, subscription_plan")
      .eq("id", userProfile.organization_id)
      .maybeSingle();
    if (org) companyName = org.name;

    const usageCheck = await checkUsageLimit(adminClient, userProfile.organization_id, org?.subscription_plan || "trial");
    if (!usageCheck.allowed) {
      return NextResponse.json(
        { error: "usage_limit_reached", current: usageCheck.current, limit: usageCheck.limit, required_plan: usageCheck.requiredPlan },
        { status: 429 }
      );
    }
  }

  // Get project context if assigned
  let projectContext = null;
  if (email.project_id) {
    const { data: project } = await adminClient
      .from("projects")
      .select("name, code")
      .eq("id", email.project_id)
      .maybeSingle();
    if (project) {
      projectContext = { name: project.name, code: project.code };
    }
  }

  // Try to get full email body from Microsoft Graph for better context
  let bodyFull: string | undefined;
  if (email.outlook_message_id) {
    try {
      const tokenResult = await getValidMicrosoftToken(user.id);
      if (tokenResult.accessToken) {
        const graphRes = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${email.outlook_message_id}?$select=body`,
          {
            headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
          }
        );
        if (graphRes.ok) {
          const graphData = await graphRes.json();
          if (graphData.body?.content) {
            bodyFull = cleanEmailForAI(graphData.body.content);
          }
        }
      }
    } catch {
      // Fall back to body_preview
    }
  }

  // If thread_context is provided, prepend it to bodyFull for richer AI context
  if (body.thread_context && typeof body.thread_context === "string") {
    const threadPrefix = `--- FIL DE CONVERSATION COMPLET ---\n${body.thread_context}\n--- FIN DU FIL ---\n\nDernier message (à répondre) :\n`;
    bodyFull = threadPrefix + (bodyFull || email.body_preview || "");
  }

  // Extract optional reply instructions from request body
  const replyInstructions: ReplyInstructions | undefined =
    (body.tone || body.length || body.instructions)
      ? {
          tone: body.tone as ReplyInstructions["tone"],
          length: body.length as ReplyInstructions["length"],
          userInstructions: body.instructions as string | undefined,
        }
      : undefined;

  if (process.env.NODE_ENV === "development") console.log(`[generate-reply] Calling generateReply for email "${email.subject}" (id: ${email.id})`);
  if (process.env.NODE_ENV === "development") console.log(`[generate-reply] Project: ${projectContext?.name || "none"}, Full body: ${bodyFull ? `${bodyFull.length} chars` : "NO"}, Has thread: ${!!body.thread_context}`);

  let result;
  try {
    result = await generateReply(
    anthropicApiKey,
    {
      sender_name: email.sender_name || "",
      sender_email: email.sender_email,
      subject: email.subject,
      body_preview: email.body_preview || "",
      body_full: bodyFull,
      recipients: email.recipients || [],
      received_at: email.received_at,
    },
    projectContext,
    {
      first_name: userProfile.first_name,
      last_name: userProfile.last_name,
      role: userProfile.role,
      company_name: companyName,
    },
    replyInstructions,
    undefined,
    (usage) => {
      trackApiUsage({
        supabase: adminClient,
        userId: user.id,
        organizationId: userProfile.organization_id ?? "",
        actionType: "email_reply",
        apiProvider: "anthropic",
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        metadata: { email_id: body.email_id },
      });
    }
    );
  } catch (error: any) {
    console.error("[generate-reply] AI error:", error?.message);
    const err = classifyAIError(error);
    return NextResponse.json({ error: err.message }, { status: err.status });
  }

  if (process.env.NODE_ENV === "development") console.log(`[generate-reply] Result: reply=${result.reply_text.length} chars, no_reply=${result.no_reply_needed}, error=${result.error || "none"}`);

  if (result.error) {
    return NextResponse.json(
      { error: result.error },
      { status: 500 }
    );
  }

  // ── Track AI reply generation (fire-and-forget) ──
  try {
    (adminClient as any).from("email_classification_feedback").insert({
      email_id: body.email_id,
      organization_id: userProfile.organization_id,
      user_id: user.id,
      feedback_type: "ai_reply_generated",
      original_value: null,
      new_value: result.reply_text.substring(0, 500),
      metadata: {
        tone: body.tone || null,
        length: body.length || null,
        model_used: "claude-sonnet-4-5-20250929",
        no_reply_needed: result.no_reply_needed,
        reply_length: result.reply_text.length,
        had_thread_context: !!body.thread_context,
        had_full_body: !!bodyFull,
      },
    }).then(() => {}).catch((err: any) => {
      console.error("[generate-reply] Failed to log AI reply feedback:", err?.message);
    });
  } catch (feedbackErr) {
    console.error("[generate-reply] feedback tracking error:", feedbackErr);
  }

  return NextResponse.json({
    success: true,
    reply_text: result.reply_text,
    no_reply_needed: result.no_reply_needed,
  });
}
