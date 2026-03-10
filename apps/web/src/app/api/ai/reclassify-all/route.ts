import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { classifyEmail, classifyEmailByKeywords, isUnknownProjectSubject, cleanEmailForAI, isRetryableAIError, type ProjectForClassification } from "@cantaia/core/ai";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { trackApiUsage } from "@cantaia/core/tracking";

/** Run promises in batches with concurrency limit */
async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  const queue = [...items];
  const active: Promise<void>[] = [];
  while (queue.length > 0 || active.length > 0) {
    while (active.length < concurrency && queue.length > 0) {
      const item = queue.shift()!;
      const promise = fn(item).then(() => {
        active.splice(active.indexOf(promise), 1);
      });
      active.push(promise);
    }
    if (active.length > 0) await Promise.race(active);
  }
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

  if (process.env.NODE_ENV === "development") {
    console.log(`[reclassify-all] ${projects.length} projects available for classification`);
    if (projects.length > 0) {
      console.log(`[reclassify-all] Projects:`, projects.map(p => `${p.name} (${p.code || "N/A"})`));
    }
  }

  // Get Microsoft token for fetching full email bodies
  let graphAccessToken: string | undefined;
  try {
    const tokenResult = await getValidMicrosoftToken(user.id);
    graphAccessToken = tokenResult.accessToken || undefined;
    if (process.env.NODE_ENV === "development") console.log(`[reclassify-all] Microsoft token: ${graphAccessToken ? "OK" : "MISSING"}`);
  } catch {
    if (process.env.NODE_ENV === "development") console.warn("[reclassify-all] Could not get Microsoft token for full body fetch");
  }

  // Get ALL user emails for reclassification (including already-classified ones)
  const { data: emails } = await adminClient
    .from("email_records")
    .select("id, subject, sender_email, sender_name, body_preview, received_at, project_id, classification, ai_classification_confidence, classification_status, is_processed, outlook_message_id, recipients")
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

  if (process.env.NODE_ENV === "development") console.log(`[reclassify-all] ${(emails || []).length} emails to reclassify, AI key: ${anthropicApiKey ? "OK" : "MISSING"}`);

  // Emails that need AI classification (after local pass)
  const needsAiClassification: typeof emails = [];

  for (const email of emails || []) {
    try {

      // ── FIRST PASS: Local keyword classification (fast, no AI cost) ──
      const localMatch = projects.length > 0
        ? classifyEmailByKeywords(
            {
              subject: email.subject,
              sender_email: email.sender_email,
              sender_name: email.sender_name || undefined,
              body_preview: email.body_preview || undefined,
              recipients: email.recipients || [],
            },
            projects
          )
        : null;

      if (localMatch) {
        const changed = email.project_id !== localMatch.projectId;
        if (changed) {
          if (process.env.NODE_ENV === "development") console.log(`[reclassify-all] LOCAL match: project=${localMatch.projectId}, score=${localMatch.score}, reasons=[${localMatch.reasons.join(", ")}]`);
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

      // ── No local match: proceed to AI classification ──
      // (Even for already-classified emails — the existing classification may be wrong,
      // especially for forwarded emails where project signals are in the body, not headers)

      // ── Check for potential new project suggestion (only if no project yet) ──
      if (!email.project_id) {
        const suggestion = detectPotentialProject(email.subject);
        if (suggestion) {
          if (process.env.NODE_ENV === "development") console.log(`[reclassify-all] New project suggestion: "${suggestion.name}" from "${email.subject}"`);
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

      // ── SECOND PASS: Queue for AI classification ──
      if (!anthropicApiKey) {
        if (!email.is_processed) {
          markProcessedIds.push(email.id);
        }
        continue;
      }

      // Skip AI if the subject clearly identifies an unknown project
      if (isUnknownProjectSubject(email.subject, projects)) {
        if (process.env.NODE_ENV === "development") console.log(`[reclassify-all] SKIP AI: "${email.subject}" — first segment is unknown project`);
        if (!email.is_processed) {
          markProcessedIds.push(email.id);
        }
        continue;
      }

      // Queue for AI classification (will be processed in batch below)
      needsAiClassification.push(email);
    } catch (err) {
      console.error(`[reclassify-all] Failed local pass for "${email.subject}":`, err);
    }
  }

  // ── BATCH AI CLASSIFICATION with concurrency pool (5 parallel) ──
  if (anthropicApiKey && needsAiClassification.length > 0) {
    if (process.env.NODE_ENV === "development") console.log(`[reclassify-all] Starting AI batch: ${needsAiClassification.length} emails, concurrency=5`);

    await runWithConcurrency(needsAiClassification, async (email) => {
      try {
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
                bodyFull = cleanEmailForAI(graphData.body.content);
              }
            }
          } catch {
            if (process.env.NODE_ENV === "development") console.warn(`[reclassify-all] Graph body fetch failed for ${email.outlook_message_id}`);
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
            recipients: email.recipients || [],
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

        const previousProjectId = email.project_id;
        await adminClient
          .from("email_records")
          .update({
            project_id: result.project_id,
            classification: result.classification,
            ai_summary: result.summary_fr,
            ai_classification_confidence: result.classification_confidence,
            ai_project_match_confidence: result.project_match_confidence,
            classification_status: "auto_classified",
            is_processed: true,
          })
          .eq("id", email.id);

        if (previousProjectId && previousProjectId !== result.project_id) {
          emailsReclassified++;
        } else {
          emailsClassified++;
        }

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
        if (isRetryableAIError(err)) {
          console.error(`[reclassify-all] Rate limited / overloaded — aborting batch`);
          throw err; // Abort the entire batch
        }
        console.error(`[reclassify-all] AI failed for "${email.subject}":`, err);
        try {
          await adminClient
            .from("email_records")
            .update({ is_processed: true })
            .eq("id", email.id);
        } catch { /* ignore */ }
      }
    }, 5); // concurrency = 5
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
    if (process.env.NODE_ENV === "development") console.log(`[reclassify-all] Batch marked ${markProcessedIds.length} emails as processed`);
  }

  if (process.env.NODE_ENV === "development") console.log(`[reclassify-all] Done: ${emailsClassified} new, ${emailsReclassified} reclassified, ${emailsDeclassified} declassified, ${newProjectsSuggested} suggestions, ${tasksCreated} tasks`);

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
