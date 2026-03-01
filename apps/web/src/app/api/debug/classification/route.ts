import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyEmailByKeywords, type ProjectForClassification } from "@cantaia/core/ai";

/**
 * GET /api/debug/classification
 * Diagnostic: shows projects, their keywords, and tests classification for each email.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Get user's org
  const { data: userOrg } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization found" }, { status: 404 });
  }

  // Get projects with classification metadata
  const { data: projects } = await admin
    .from("projects")
    .select("id, name, code, email_keywords, email_senders, city, client_name, status")
    .eq("organization_id", userOrg.organization_id);

  const activeProjects = (projects || []).filter(
    (p) => p.status === "active" || p.status === "planning"
  ) as ProjectForClassification[];

  // Get emails
  const { data: emails } = await admin
    .from("email_records")
    .select("id, subject, sender_email, sender_name, from_email, from_name, body_preview, project_id, classification_status, ai_reasoning, is_processed, triage_status")
    .eq("user_id", user.id)
    .order("received_at", { ascending: false })
    .limit(50);

  // Test classification for each email
  const classificationTests = (emails || []).map((email) => {
    const senderEmail = email.from_email || email.sender_email || "";
    const senderName = email.from_name || email.sender_name || "";

    const localResult = activeProjects.length > 0
      ? classifyEmailByKeywords(
          {
            subject: email.subject,
            sender_email: senderEmail,
            sender_name: senderName,
            body_preview: email.body_preview || undefined,
          },
          activeProjects
        )
      : null;

    const matchedProject = localResult
      ? activeProjects.find((p) => p.id === localResult.projectId)
      : null;

    return {
      email_id: email.id,
      subject: email.subject,
      sender: `${senderName} <${senderEmail}>`,
      current_project_id: email.project_id,
      current_status: email.classification_status,
      is_processed: email.is_processed,
      triage_status: email.triage_status,
      ai_reasoning: email.ai_reasoning,
      local_match: localResult
        ? {
            project: matchedProject?.name || localResult.projectId,
            score: localResult.score,
            confidence: localResult.confidence,
            reasons: localResult.reasons,
          }
        : null,
    };
  });

  return NextResponse.json({
    organization_id: userOrg.organization_id,
    anthropic_key_configured: !!process.env.ANTHROPIC_API_KEY,
    projects_total: (projects || []).length,
    projects_active: activeProjects.length,
    projects: (projects || []).map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      status: p.status,
      email_keywords: p.email_keywords,
      email_senders: p.email_senders,
      city: p.city,
      client_name: p.client_name,
    })),
    emails_total: (emails || []).length,
    classification_tests: classificationTests,
  });
}

/**
 * POST /api/debug/classification
 * Force re-classify ALL emails (reset classification first).
 * This resets project_id and classification_status, then runs the full pipeline.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Reset ALL email classifications for this user
  const { data: resetEmails } = await admin
    .from("email_records")
    .update({
      project_id: null,
      classification_status: "unprocessed",
      is_processed: false,
      triage_status: "unprocessed",
      ai_reasoning: null,
      ai_confidence: null,
      ai_summary: null,
    } as any)
    .eq("user_id", user.id)
    .select("id");

  return NextResponse.json({
    success: true,
    emails_reset: (resetEmails || []).length,
    next_step: "Now call POST /api/ai/reclassify-all to re-classify all emails with the improved algorithm",
  });
}
