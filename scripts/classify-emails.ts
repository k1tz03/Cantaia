/**
 * Standalone script to classify all unprocessed emails.
 * Uses admin client (no Next.js auth needed).
 * Run: npx tsx scripts/classify-emails.ts
 */
import { createClient } from "@supabase/supabase-js";
import { classifyEmail, classifyEmailByKeywords, isUnknownProjectSubject } from "@cantaia/core/ai";
import { checkLocalRules, detectSpamNewsletter } from "@cantaia/core/emails";
import type { ProjectForClassification } from "@cantaia/core/ai";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vusjmfkanmdsuiumeumb.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || "";

if (!SUPABASE_KEY || !ANTHROPIC_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or ANTHROPIC_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // 1. Get all users with their org
  const { data: users } = await supabase.from("users").select("id, email, organization_id");
  console.log(`Found ${(users || []).length} users`);

  for (const user of users || []) {
    if (!user.organization_id) continue;
    console.log(`\n═══ Processing user: ${user.email} ═══`);

    // 2. Get active projects
    const { data: projectsData } = await supabase
      .from("projects")
      .select("id, name, code, email_keywords, email_senders, city, client_name")
      .eq("organization_id", user.organization_id)
      .in("status", ["active", "planning"]);
    const projects = (projectsData || []) as ProjectForClassification[];
    console.log(`  ${projects.length} active projects`);

    // 3. Get unprocessed emails
    const { data: emails } = await supabase
      .from("email_records")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_processed", false)
      .order("received_at", { ascending: false })
      .limit(100);

    console.log(`  ${(emails || []).length} unprocessed emails to classify`);

    let classified = 0;
    let skipped = 0;

    for (const email of emails || []) {
      const senderEmail = email.sender_email || "";
      const subject = email.subject || "";

      try {
        // ── LEVEL 1: Local learned rules ──
        const localMatch = await checkLocalRules(supabase as any, user.organization_id, senderEmail);
        if (localMatch) {
          await supabase.from("email_records").update({
            project_id: localMatch.projectId,
            classification: "info_only",
            ai_classification_confidence: Math.round(localMatch.confidence * 100),
            ai_project_match_confidence: Math.round(localMatch.confidence * 100),
            ai_reasoning: "Classified by learned local rule (no AI call)",
            classification_status: "auto_classified",
            email_category: "project",
            is_processed: true,
          } as any).eq("id", email.id);
          console.log(`  ✓ L1 Rule: "${subject.substring(0, 50)}..." → ${localMatch.projectId}`);
          classified++;
          continue;
        }

        // ── LEVEL 2: Spam/Newsletter filter ──
        const spamCheck = detectSpamNewsletter({
          from_email: senderEmail,
          subject,
          body_preview: email.body_preview || "",
        });
        if (spamCheck.detected) {
          await supabase.from("email_records").update({
            email_category: spamCheck.type === "spam" ? "spam" : "newsletter",
            ai_classification_confidence: Math.round(spamCheck.confidence * 100),
            ai_reasoning: spamCheck.reason,
            classification_status: "auto_classified",
            is_processed: true,
          } as any).eq("id", email.id);
          console.log(`  ✓ L2 ${spamCheck.type}: "${subject.substring(0, 50)}..."`);
          classified++;
          continue;
        }

        // ── LEVEL 2b: Local keyword match ──
        if (projects.length > 0) {
          const keywordMatch = classifyEmailByKeywords(
            { subject, sender_email: senderEmail, sender_name: email.sender_name || undefined, body_preview: email.body_preview || undefined },
            projects
          );
          if (keywordMatch && keywordMatch.confidence >= 0.6) {
            const matchedProject = projects.find(p => p.id === keywordMatch.projectId);
            await supabase.from("email_records").update({
              project_id: keywordMatch.projectId,
              classification: "info_only",
              ai_classification_confidence: Math.round(keywordMatch.confidence * 100),
              ai_project_match_confidence: Math.round(keywordMatch.confidence * 100),
              classification_status: "auto_classified",
              email_category: "project",
              ai_reasoning: `Local keyword match: ${keywordMatch.reasons.join(", ")}`,
              is_processed: true,
            } as any).eq("id", email.id);
            console.log(`  ✓ L2b Keywords: "${subject.substring(0, 50)}..." → ${matchedProject?.name || keywordMatch.projectId}`);
            classified++;
            continue;
          }
        }

        // Skip if subject identifies unknown project
        if (isUnknownProjectSubject(subject, projects)) {
          await supabase.from("email_records").update({ is_processed: true } as any).eq("id", email.id);
          console.log(`  ⊘ Skip unknown project: "${subject.substring(0, 50)}..."`);
          skipped++;
          continue;
        }

        // ── LEVEL 3: Claude AI classification ──
        const result = await classifyEmail(
          ANTHROPIC_KEY,
          {
            sender_email: senderEmail,
            sender_name: email.sender_name || "",
            subject,
            body_preview: email.body_preview || "",
            received_at: email.received_at,
          },
          projects
        );

        const confidencePercent = Math.round(result.confidence * 100);

        if (result.match_type === "existing_project") {
          const isAuto = result.confidence >= 0.85;
          const matchedProject = projects.find(p => p.id === result.project_id);
          await supabase.from("email_records").update({
            project_id: result.project_id || null,
            classification: result.classification || "info_only",
            ai_summary: result.summary_fr,
            ai_classification_confidence: result.classification_confidence || confidencePercent,
            ai_project_match_confidence: confidencePercent,
            classification_status: isAuto ? "auto_classified" : "suggested",
            email_category: "project",
            ai_reasoning: result.reasoning || null,
            is_processed: true,
          } as any).eq("id", email.id);
          console.log(`  ✓ L3 AI ${isAuto ? "auto" : "suggested"}: "${subject.substring(0, 50)}..." → ${matchedProject?.name || result.project_id} (${confidencePercent}%)`);
        } else if (result.match_type === "new_project") {
          await supabase.from("email_records").update({
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
          } as any).eq("id", email.id);
          console.log(`  ★ L3 AI new_project: "${subject.substring(0, 50)}..." (${confidencePercent}%)`);
        } else {
          const isLow = result.confidence < 0.50;
          await supabase.from("email_records").update({
            project_id: null,
            classification: "info_only",
            ai_summary: result.summary_fr,
            ai_classification_confidence: confidencePercent,
            ai_project_match_confidence: 0,
            classification_status: isLow ? "unprocessed" : "classified_no_project",
            email_category: result.email_category || "personal",
            ai_reasoning: result.reasoning || null,
            is_processed: true,
          } as any).eq("id", email.id);
          console.log(`  ○ L3 AI no_project: "${subject.substring(0, 50)}..." (${result.email_category}, ${confidencePercent}%)`);
        }
        classified++;

      } catch (err: any) {
        console.error(`  ✗ Error classifying "${subject.substring(0, 50)}...":`, err.message || err);
        await supabase.from("email_records").update({ is_processed: true, classification_status: "unprocessed" } as any).eq("id", email.id);
        skipped++;
      }
    }

    console.log(`\n  Done: ${classified} classified, ${skipped} skipped`);
  }

  console.log("\n═══ Classification complete ═══");
}

main().catch(console.error);
