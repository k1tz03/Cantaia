import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyEmail, classifyEmailByKeywords, isUnknownProjectSubject, type ProjectForClassification } from "@cantaia/core/ai";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { trackApiUsage } from "@cantaia/core/tracking";

/** Strip HTML tags for AI classification */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Detect potential new project from email subject.
 * Extracts the first segment (before – or : or -) which is often the project name/code.
 */
function detectPotentialProject(subject: string): {
  name: string;
  reference: string | null;
  client: string | null;
  location: string | null;
  type: string | null;
  extracted_contacts: { name: string; company: string | null; email: string; role: string | null }[];
  confidence: number;
} | null {
  // Clean subject: remove TR: RE: FW: FWD: WG: AW: prefixes
  const clean = (subject || "")
    .replace(/^(TR|RE|FW|FWD|WG|AW)\s*:\s*/gi, "")
    .replace(/^(TR|RE|FW|FWD|WG|AW)\s*:\s*/gi, "") // double prefix like "TR: RE:"
    .trim();

  if (!clean || clean.length < 3) return null;

  // Split on common separators: – (em dash), - (hyphen after spaces), :
  const segments = clean.split(/\s*[–]\s*|\s+[-:]\s+/);
  const firstSegment = segments[0]?.trim();

  if (!firstSegment || firstSegment.length < 2 || firstSegment.length > 40) return null;

  // Ignore generic words that aren't project names
  const genericStarts = [
    "offre", "facture", "devis", "commande", "livraison", "bienvenue",
    "invitation", "newsletter", "rappel", "confirmation", "information",
    "mise à jour", "update", "hello", "bonjour", "urgent",
  ];
  const firstLower = firstSegment.toLowerCase();
  if (genericStarts.some((w) => firstLower.startsWith(w))) return null;

  // Check if it looks like a project code (all caps, 2-10 chars)
  const isCode = /^[A-Z]{2,10}$/.test(firstSegment);
  // Check if it looks like a project name (capitalized words)
  const isName = /^[A-ZÉÈÊËÀÂÄÙÛÜÔÖÎÏÇ]/.test(firstSegment) && firstSegment.length <= 30;

  if (isCode || isName) {
    return {
      name: firstSegment,
      reference: isCode
        ? firstSegment
        : firstSegment.replace(/\s+/g, "").substring(0, 5).toUpperCase(),
      client: null,
      location: null,
      type: null,
      extracted_contacts: [],
      confidence: isCode ? 0.8 : 0.6,
    };
  }

  return null;
}

/**
 * POST /api/ai/reclassify-all
 * Re-runs classification on all unprocessed emails.
 * Uses local keyword matching first, then Claude AI as fallback.
 */
export async function POST() {
  try {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const adminClient = createAdminClient();

  // Get user's projects
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  let projects: ProjectForClassification[] = [];
  if (userOrg?.organization_id) {
    const { data: projectsData } = await adminClient
      .from("projects")
      .select("id, name, code, email_keywords, email_senders, city, client_name")
      .eq("organization_id", userOrg.organization_id)
      .in("status", ["active", "planning"]);
    projects = (projectsData || []) as ProjectForClassification[];
  }

  console.log(`[reclassify-all] ${projects.length} projects available for classification`);
  if (projects.length > 0) {
    console.log(`[reclassify-all] Projects:`, projects.map(p => `${p.name} (${p.code || "N/A"})`));
  }

  // Get Microsoft token for fetching full email bodies
  let graphAccessToken: string | undefined;
  try {
    const tokenResult = await getValidMicrosoftToken(user.id);
    graphAccessToken = tokenResult.accessToken || undefined;
    console.log(`[reclassify-all] Microsoft token: ${graphAccessToken ? "OK" : "MISSING"}`);
  } catch {
    console.warn("[reclassify-all] Could not get Microsoft token for full body fetch");
  }

  // Get ALL user emails for reclassification (including already-classified ones)
  const { data: emails } = await adminClient
    .from("email_records")
    .select("*")
    .eq("user_id", user.id)
    .order("received_at", { ascending: false })
    .limit(200);

  let emailsClassified = 0;
  let emailsReclassified = 0;
  let emailsDeclassified = 0;
  let emailsClassifiedLocal = 0;
  let newProjectsSuggested = 0;
  let tasksCreated = 0;

  // Collect IDs of emails that just need is_processed=true (batch at end)
  const markProcessedIds: string[] = [];

  console.log(`[reclassify-all] ${(emails || []).length} emails to reclassify, AI key: ${anthropicApiKey ? "OK" : "MISSING"}`);

  for (const email of emails || []) {
    try {
      console.log(`[reclassify-all] Classifying: "${email.subject}" from ${email.sender_email}`);

      // ── FIRST PASS: Local keyword classification (fast, no AI cost) ──
      const localMatch = projects.length > 0
        ? classifyEmailByKeywords(
            {
              subject: email.subject,
              sender_email: email.sender_email,
              sender_name: email.sender_name || undefined,
              body_preview: email.body_preview || undefined,
            },
            projects
          )
        : null;

      if (localMatch) {
        const changed = email.project_id !== localMatch.projectId;
        if (changed) {
          console.log(`[reclassify-all] LOCAL match: project=${localMatch.projectId}, score=${localMatch.score}, reasons=[${localMatch.reasons.join(", ")}]`);
          await adminClient
            .from("email_records")
            .update({
              project_id: localMatch.projectId,
              classification: email.classification || "info_only",
              ai_classification_confidence: Math.round(localMatch.confidence * 100),
              ai_project_match_confidence: Math.round(localMatch.confidence * 100),
              classification_status: "auto_classified",
              suggested_project_data: null,
              is_processed: true,
            })
            .eq("id", email.id);

          if (email.project_id) emailsReclassified++;
          else emailsClassified++;
          emailsClassifiedLocal++;
        }
        continue;
      }

      // ── No local match: KEEP existing classification ──
      if (email.project_id) {
        console.log(`[reclassify-all] KEEP: "${email.subject}" stays in project ${email.project_id} (no local match but already classified)`);
        if (!email.is_processed) {
          markProcessedIds.push(email.id);
        }
        continue;
      }

      // ── Check for potential new project suggestion ──
      if (!email.project_id) {
        const suggestion = detectPotentialProject(email.subject);
        if (suggestion) {
          console.log(`[reclassify-all] New project suggestion: "${suggestion.name}" from "${email.subject}"`);
          await adminClient
            .from("email_records")
            .update({
              classification: "action_required",
              classification_status: "new_project_suggested",
              suggested_project_data: suggestion,
              is_processed: true,
            })
            .eq("id", email.id);
          newProjectsSuggested++;
          continue;
        }
      }

      // ── SECOND PASS: Claude AI for unclassified emails only ──
      if (email.project_id || !anthropicApiKey) {
        if (!email.is_processed) {
          markProcessedIds.push(email.id);
        }
        continue;
      }

      // Skip AI if the subject clearly identifies an unknown project
      if (isUnknownProjectSubject(email.subject, projects)) {
        console.log(`[reclassify-all] SKIP AI: "${email.subject}" — first segment is unknown project`);
        if (!email.is_processed) {
          markProcessedIds.push(email.id);
        }
        continue;
      }

      // Fetch full body from Microsoft Graph
      let bodyFull: string | undefined;
      if (graphAccessToken && email.outlook_message_id) {
        try {
          const graphRes = await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${email.outlook_message_id}?$select=body`,
            { headers: { Authorization: `Bearer ${graphAccessToken}` } }
          );
          if (graphRes.ok) {
            const graphData = await graphRes.json();
            if (graphData.body?.content) {
              bodyFull = stripHtml(graphData.body.content).substring(0, 10000);
              console.log(`[reclassify-all] Full body fetched: ${bodyFull.length} chars`);
            }
          }
        } catch {
          console.warn(`[reclassify-all] Graph body fetch failed for ${email.outlook_message_id}`);
        }
      }

      const result = await classifyEmail(
        anthropicApiKey,
        {
          sender_email: email.sender_email,
          sender_name: email.sender_name || "",
          subject: email.subject,
          body_preview: email.body_preview || "",
          body_full: bodyFull,
          received_at: email.received_at,
        },
        projects,
        undefined,
        (usage) => {
          trackApiUsage({
            supabase: adminClient,
            userId: user.id,
            organizationId: userOrg?.organization_id ?? "",
            actionType: "reclassify",
            apiProvider: "anthropic",
            model: usage.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            metadata: { email_id: email.id },
          });
        }
      );

      console.log(`[reclassify-all] AI Result: classification=${result.classification}, project_id=${result.project_id}, confidence=${result.classification_confidence}`);

      await adminClient
        .from("email_records")
        .update({
          project_id: result.project_id,
          classification: result.classification,
          ai_summary: result.summary_fr,
          ai_classification_confidence: result.classification_confidence,
          ai_project_match_confidence: result.project_match_confidence,
          is_processed: true,
        })
        .eq("id", email.id);

      emailsClassified++;

      if (result.contains_task && result.task?.title && result.project_id) {
        await (adminClient as any).from("tasks").insert({
          project_id: result.project_id,
          created_by: user.id,
          title: result.task.title,
          priority: result.task.priority || "medium",
          source: "email" as const,
          source_id: email.id,
          source_reference: `Email: ${email.subject}`,
          assigned_to_name: result.task.assigned_to_name,
          assigned_to_company: result.task.assigned_to_company,
          due_date: result.task.due_date,
        });
        tasksCreated++;
      }
    } catch (err) {
      console.error(`[reclassify-all] Failed for "${email.subject}":`, err);
      // Mark as processed to avoid infinite retry loops
      try {
        await adminClient
          .from("email_records")
          .update({ is_processed: true })
          .eq("id", email.id);
      } catch { /* ignore */ }
    }
  }

  // Batch update all emails that just need is_processed=true
  if (markProcessedIds.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < markProcessedIds.length; i += CHUNK) {
      const chunk = markProcessedIds.slice(i, i + CHUNK);
      await adminClient
        .from("email_records")
        .update({ is_processed: true })
        .in("id", chunk);
    }
    console.log(`[reclassify-all] Batch marked ${markProcessedIds.length} emails as processed`);
  }

  console.log(`[reclassify-all] Done: ${emailsClassified} new, ${emailsReclassified} reclassified, ${emailsDeclassified} declassified, ${newProjectsSuggested} suggestions, ${tasksCreated} tasks`);

  return NextResponse.json({
    success: true,
    emails_classified: emailsClassified + emailsReclassified,
    emails_reclassified: emailsReclassified,
    emails_declassified: emailsDeclassified,
    emails_classified_local: emailsClassifiedLocal,
    new_projects_suggested: newProjectsSuggested,
    tasks_created: tasksCreated,
  });
  } catch (err) {
    console.error("[reclassify-all] FATAL error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error", success: false },
      { status: 500 }
    );
  }
}
