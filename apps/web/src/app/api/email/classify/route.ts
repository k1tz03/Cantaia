import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyEmail, classifyEmailByKeywords, cleanEmailForAI, type ProjectForClassification } from "@cantaia/core/ai";
import { trackApiUsage } from "@cantaia/core/tracking";
import { checkLocalRules, detectSpamNewsletter, learnFromClassificationAction } from "@cantaia/core/emails";
import { parseBody, validateRequired } from "@/lib/api/parse-body";

/**
 * POST /api/email/classify
 * Classify a single email using the 3-level pipeline.
 * Can be called manually from UI or automatically after sync.
 *
 * Body: { email_id: string }
 */
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

  const { email_id } = body;
  const admin = createAdminClient();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  // Get user's org
  const { data: userOrg } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  const orgId = userOrg?.organization_id;

  // Get the email
  const { data: email, error: emailErr } = await (admin as any)
    .from("email_records")
    .select("id, from_email, sender_email, subject, body_preview, sender_name, from_name, body_text, body_html, received_at")
    .eq("id", email_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (emailErr || !email) {
    return NextResponse.json({ error: "Email not found" }, { status: 404 });
  }

  const senderEmail = email.from_email || email.sender_email || "";

  // Load user preferences
  let userPrefs = { auto_dismiss_spam: true, auto_dismiss_newsletters: false, auto_move_outlook: false };
  if (orgId) {
    const { data: prefs } = await (admin as any)
      .from("email_preferences")
      .select("auto_dismiss_spam, auto_dismiss_newsletters, auto_move_outlook")
      .eq("user_id", user.id)
      .maybeSingle();
    if (prefs) userPrefs = prefs;
  }

  // Load projects
  let projects: ProjectForClassification[] = [];
  if (orgId) {
    const { data: projectsData } = await admin
      .from("projects")
      .select("id, name, code, email_keywords, email_senders, city, client_name")
      .eq("organization_id", orgId)
      .in("status", ["active", "planning"]);
    projects = (projectsData || []) as ProjectForClassification[];
  }

  // ═══════════════════════════════════════════════════════════
  // LEVEL 1: LOCAL LEARNED RULES
  // ═══════════════════════════════════════════════════════════
  if (orgId) {
    const localMatch = await checkLocalRules(admin, orgId, senderEmail);
    if (localMatch) {
      await (admin as any)
        .from("email_records")
        .update({
          project_id: localMatch.projectId,
          classification: "info_only",
          ai_confidence: localMatch.confidence,
          ai_reasoning: "Classified by learned local rule (no AI call)",
          classification_status: "auto_classified",
          email_category: "project",
          triage_status: "unprocessed",
          is_processed: true,
        })
        .eq("id", email_id);

      return NextResponse.json({
        success: true,
        level: "local_rules",
        match_type: "existing_project",
        project_id: localMatch.projectId,
        confidence: localMatch.confidence,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LEVEL 2: SPAM / NEWSLETTER FILTER
  // ═══════════════════════════════════════════════════════════
  const spamCheck = detectSpamNewsletter({
    from_email: senderEmail,
    subject: email.subject,
    body_preview: email.body_preview || "",
  });

  if (spamCheck.detected) {
    const shouldAutoDismiss =
      (spamCheck.type === "spam" && userPrefs.auto_dismiss_spam) ||
      (spamCheck.type === "newsletter" && userPrefs.auto_dismiss_newsletters);

    await (admin as any)
      .from("email_records")
      .update({
        email_category: spamCheck.type === "spam" ? "spam" : "newsletter",
        ai_confidence: spamCheck.confidence,
        ai_reasoning: spamCheck.reason,
        classification_status: "auto_classified",
        triage_status: shouldAutoDismiss ? "processed" : "unprocessed",
        process_action: shouldAutoDismiss ? "auto_dismissed" : null,
        processed_at: shouldAutoDismiss ? new Date().toISOString() : null,
        is_processed: true,
      })
      .eq("id", email_id);

    return NextResponse.json({
      success: true,
      level: "spam_filter",
      type: spamCheck.type,
      auto_dismissed: shouldAutoDismiss,
      confidence: spamCheck.confidence,
    });
  }

  // ═══════════════════════════════════════════════════════════
  // LEVEL 2b: LOCAL KEYWORD CLASSIFICATION
  // ═══════════════════════════════════════════════════════════
  if (projects.length > 0) {
    const keywordMatch = classifyEmailByKeywords(
      {
        subject: email.subject,
        sender_email: senderEmail,
        sender_name: email.sender_name || email.from_name || undefined,
        body_preview: email.body_preview || undefined,
      },
      projects
    );

    if (keywordMatch && keywordMatch.confidence >= 0.5) {
      await (admin as any)
        .from("email_records")
        .update({
          project_id: keywordMatch.projectId,
          classification: "info_only",
          ai_confidence: keywordMatch.confidence,
          classification_status: "auto_classified",
          email_category: "project",
          ai_reasoning: `Local keyword match: ${keywordMatch.reasons.join(", ")}`,
          triage_status: "unprocessed",
          is_processed: true,
        })
        .eq("id", email_id);

      return NextResponse.json({
        success: true,
        level: "keyword_match",
        match_type: "existing_project",
        project_id: keywordMatch.projectId,
        confidence: keywordMatch.confidence,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LEVEL 3: CLAUDE AI CLASSIFICATION
  // ═══════════════════════════════════════════════════════════
  if (!anthropicApiKey) {
    await (admin as any)
      .from("email_records")
      .update({
        is_processed: true,
        triage_status: "pending_classification",
        classification_status: "unprocessed",
      })
      .eq("id", email_id);

    return NextResponse.json({
      success: true,
      level: "no_ai_key",
      message: "No Anthropic API key configured",
    });
  }

  // Use stored body or body_preview
  let bodyFull = email.body_text || email.body_preview || "";
  if (!bodyFull && email.body_html) {
    bodyFull = cleanEmailForAI(email.body_html);
  }

  const result = await classifyEmail(
    anthropicApiKey,
    {
      sender_email: senderEmail,
      sender_name: email.sender_name || email.from_name || "",
      subject: email.subject,
      body_preview: email.body_preview || "",
      body_full: bodyFull || undefined,
      received_at: email.received_at,
    },
    projects,
    undefined,
    (usage) => {
      trackApiUsage({
        supabase: admin,
        userId: user.id,
        organizationId: orgId ?? "",
        actionType: "email_classify",
        apiProvider: "anthropic",
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        metadata: { email_id },
      });
    }
  );

  const confidencePercent = Math.round(result.confidence * 100);

  if (result.match_type === "existing_project") {
    await (admin as any)
      .from("email_records")
      .update({
        project_id: result.project_id || null,
        classification: result.classification || "info_only",
        ai_summary: result.summary_fr,
        ai_confidence: result.confidence,
        ai_classification_confidence: result.classification_confidence || confidencePercent,
        ai_project_match_confidence: confidencePercent,
        classification_status: result.confidence >= 0.92 ? "auto_classified" : "suggested",
        email_category: "project",
        ai_reasoning: result.reasoning || null,
        triage_status: "unprocessed",
        is_processed: true,
      })
      .eq("id", email_id);
  } else if (result.match_type === "new_project") {
    await (admin as any)
      .from("email_records")
      .update({
        project_id: null,
        classification: result.classification || "action_required",
        ai_summary: result.summary_fr,
        ai_confidence: result.confidence,
        classification_status: "new_project_suggested",
        email_category: "project",
        suggested_project_data: result.suggested_project || null,
        ai_reasoning: result.reasoning || null,
        triage_status: "unprocessed",
        is_processed: true,
      })
      .eq("id", email_id);
  } else {
    const isLowConfidence = result.confidence < 0.50;
    await (admin as any)
      .from("email_records")
      .update({
        project_id: null,
        classification: "info_only",
        ai_summary: result.summary_fr,
        ai_confidence: result.confidence,
        classification_status: isLowConfidence ? "unprocessed" : "classified_no_project",
        email_category: result.email_category || "personal",
        ai_reasoning: result.reasoning || null,
        triage_status: isLowConfidence ? "pending_classification" : "unprocessed",
        is_processed: true,
      })
      .eq("id", email_id);
  }

  // Learn from high-confidence AI results
  if (result.confidence >= 0.92 && result.project_id && orgId) {
    try {
      await learnFromClassificationAction({
        supabase: admin,
        organizationId: orgId,
        senderEmail,
        subject: email.subject,
        projectId: result.project_id,
        action: "confirm",
      });
    } catch { /* learning must never block classification */ }
  }

  return NextResponse.json({
    success: true,
    level: "claude_ai",
    match_type: result.match_type,
    project_id: result.project_id,
    confidence: result.confidence,
    classification: result.classification,
    email_category: result.email_category,
    reasoning: result.reasoning,
    contains_task: result.contains_task,
  });
}
