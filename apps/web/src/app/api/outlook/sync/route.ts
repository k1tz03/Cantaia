import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { syncUserEmails, type SyncDependencies } from "@cantaia/core/outlook";
import { classifyEmail, classifyEmailByKeywords, isUnknownProjectSubject, type ProjectForClassification } from "@cantaia/core/ai";
import { isPotentialPlan, detectPlansInEmail, savePlanFromAttachment } from "@cantaia/core/plans";
import { getAttachments as graphGetAttachments } from "@cantaia/core/outlook";
import { trackApiUsage, logActivityAsync } from "@cantaia/core/tracking";
import { checkLocalRules, detectSpamNewsletter, determineArchivePath, getEmailProvider, isTokenExpired, type ArchiveEmailInput, type EmailConnectionConfig } from "@cantaia/core/emails";
import type { ArchiveStructure, ArchiveFilenameFormat } from "@cantaia/database";

/** Strip HTML tags from email body for AI classification */
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

export async function POST(request: Request) {
  // 1. Verify auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;

  // Support ?full=true to force a full resync (clears last_sync_at)
  const { searchParams } = new URL(request.url);
  if (searchParams.get("full") === "true") {
    await adminClient
      .from("users")
      .update({ last_sync_at: null })
      .eq("id", user.id);
    if (process.env.NODE_ENV === "development") console.log("[outlook/sync] Full resync requested — cleared last_sync_at");
  }

  // 2. Get user's organization
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  // 3. Determine sync strategy: new email_connections table or legacy Microsoft tokens
  let { data: emailConnection } = await adminClient
    .from("email_connections")
    .select("id, user_id, organization_id, provider, oauth_access_token, oauth_refresh_token, oauth_token_expires_at, oauth_scopes, email_address, display_name, status, last_sync_at, sync_delta_link, total_emails_synced, created_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Auto-create email_connection from legacy Microsoft tokens if missing
  if (!emailConnection && userOrg?.organization_id) {
    const { data: legacyUser } = await adminClient
      .from("users")
      .select("microsoft_access_token, microsoft_refresh_token, microsoft_token_expires_at, email")
      .eq("id", user.id)
      .maybeSingle();

    if (legacyUser?.microsoft_access_token) {
      if (process.env.NODE_ENV === "development") console.log("[outlook/sync] Auto-creating email_connection from legacy Microsoft tokens");
      const { data: newConn } = await adminClient
        .from("email_connections")
        .insert({
          user_id: user.id,
          organization_id: userOrg.organization_id,
          provider: "microsoft",
          oauth_access_token: legacyUser.microsoft_access_token,
          oauth_refresh_token: legacyUser.microsoft_refresh_token || null,
          oauth_token_expires_at: legacyUser.microsoft_token_expires_at || null,
          oauth_scopes: "openid email profile offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read",
          email_address: legacyUser.email || user.email!,
          display_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
          status: "active",
        } as any)
        .select("id, user_id, organization_id, provider, oauth_access_token, oauth_refresh_token, oauth_token_expires_at, oauth_scopes, email_address, display_name, status, last_sync_at, sync_delta_link, total_emails_synced, created_at")
        .maybeSingle();

      if (newConn) {
        emailConnection = newConn;
        if (process.env.NODE_ENV === "development") console.log("[outlook/sync] Email connection auto-created successfully");
      }
    }
  }

  let emailsSynced = 0;
  let emailsSkipped = 0;
  let syncError: string | undefined;

  if (emailConnection) {
    // ── New multi-provider sync via email_connections (supports delta) ──
    const result = await syncViaProvider(adminClient, user.id, emailConnection, userOrg?.organization_id || undefined);
    emailsSynced = result.emailsSynced;
    emailsSkipped = result.emailsSkipped;
    syncError = result.error;
  } else {
    // ── Legacy Microsoft sync (backward compat) ──
    const result = await syncLegacyMicrosoft(adminClient, user.id);
    emailsSynced = result.emailsSynced;
    emailsSkipped = result.emailsSkipped;
    syncError = result.error;
  }

  if (syncError) {
    return NextResponse.json(
      {
        error: syncError,
        emails_synced: 0,
        emails_classified: 0,
        tasks_created: 0,
        new_projects_suggested: 0,
      },
      { status: 500 }
    );
  }

  // 4. Reset expired snoozes → back to unprocessed
  // Snooze reset disabled — triage_status/snooze_until columns not yet in DB
  const snoozesReset = 0;

  // 5. Pre-load archive-enabled projects for auto-archiving
  const archiveProjectsMap = new Map<string, {
    name: string;
    organization_id: string;
    archive_path: string | null;
    archive_structure: string;
    archive_filename_format: string;
  }>();

  if (userOrg?.organization_id) {
    const { data: archiveProjects } = await adminClient
      .from("projects")
      .select("id, name, organization_id, archive_path, archive_structure, archive_filename_format, archive_enabled")
      .eq("organization_id", userOrg.organization_id)
      .eq("archive_enabled", true);

    for (const ap of archiveProjects || []) {
      archiveProjectsMap.set(ap.id, {
        name: ap.name,
        organization_id: ap.organization_id,
        archive_path: ap.archive_path,
        archive_structure: ap.archive_structure || "by_category",
        archive_filename_format: ap.archive_filename_format || "date_sender_subject",
      });
    }
  }

  // 6. Load user email preferences for auto-dismiss decisions
  let userPrefs: { auto_dismiss_spam: boolean; auto_dismiss_newsletters: boolean; auto_move_outlook: boolean } = {
    auto_dismiss_spam: true,
    auto_dismiss_newsletters: false,
    auto_move_outlook: false,
  };
  if (userOrg?.organization_id) {
    const { data: prefs } = await (adminClient as any)
      .from("email_preferences")
      .select("auto_dismiss_spam, auto_dismiss_newsletters, auto_move_outlook")
      .eq("user_id", user.id)
      .maybeSingle();
    if (prefs) {
      userPrefs = prefs;
    }
  }

  // 7. Classify unprocessed emails — 3-LEVEL PIPELINE (MAIL.4)
  let emailsClassified = 0;
  let tasksCreated = 0;
  let newProjectsSuggested = 0;
  let emailsArchived = 0;
  let spamDismissed = 0;
  let plansSaved = 0;

  // Get graph token for plan attachment downloads
  let graphTokenForPlans: string | undefined;
  try {
    const tokenResult = await getValidMicrosoftToken(user.id);
    graphTokenForPlans = tokenResult.accessToken || undefined;
  } catch { /* no token available */ }

  // Build a function to fetch full email body
  const getFullBody = await buildBodyFetcher(user.id, emailConnection);

  let projects: ProjectForClassification[] = [];
  if (userOrg?.organization_id) {
    const { data: projectsData } = await adminClient
      .from("projects")
      .select("id, name, code, email_keywords, email_senders, city, client_name")
      .eq("organization_id", userOrg.organization_id)
      .in("status", ["active", "planning"]);
    projects = (projectsData || []) as ProjectForClassification[];
  }

  // Get unprocessed emails
  const { data: unprocessedEmails } = await (adminClient as any)
    .from("email_records")
    .select("id, subject, sender_email, sender_name, body_preview, received_at, project_id, classification, is_processed, has_attachments, outlook_message_id, recipients")
    .eq("user_id", user.id)
    .eq("is_processed", false)
    .order("received_at", { ascending: false })
    .limit(100);

  if (process.env.NODE_ENV === "development") console.log(`[sync] ${(unprocessedEmails || []).length} unprocessed emails to classify, ${projects.length} projects available`);

  for (const email of unprocessedEmails || []) {
    try {
      const senderEmail = email.sender_email || "";

      // ═══════════════════════════════════════════════════════════
      // LEVEL 0: PRICE REQUEST TRACKING CODE DETECTION
      // ═══════════════════════════════════════════════════════════
      if (userOrg?.organization_id) {
        try {
          const { detectPriceResponse } = await import("@cantaia/core/submissions");
          const priceMatch = await detectPriceResponse(
            adminClient,
            userOrg.organization_id,
            {
              body: email.body_preview || "",
              sender_email: senderEmail,
              subject: email.subject || "",
            }
          );

          if (priceMatch) {
            // Get the project_id from the submission
            const { data: submission } = await (adminClient as any)
              .from("submissions")
              .select("project_id")
              .eq("id", priceMatch.submissionId)
              .maybeSingle();

            // Update the email record: link to price request and classify
            await (adminClient as any)
              .from("email_records")
              .update({
                linked_price_request_id: priceMatch.priceRequestId,
                classification: "action_required",
                project_id: submission?.project_id || null,
                classification_status: "auto_classified",
                email_category: "project",
                ai_reasoning: `Level 0: Linked to price request via ${priceMatch.matchMethod}${priceMatch.trackingCode ? ` (${priceMatch.trackingCode})` : ""}`,
              })
              .eq("id", email.id);

            // Update the price_request status to responded
            await (adminClient as any)
              .from("price_requests")
              .update({
                status: "responded",
                responded_at: new Date().toISOString(),
              })
              .eq("id", priceMatch.priceRequestId);

            if (process.env.NODE_ENV === "development") console.log(`[sync] Level 0: Linked email "${email.subject}" to price request ${priceMatch.priceRequestId} (${priceMatch.matchMethod})`);
            emailsClassified++;
            continue;
          }
        } catch (l0Err) {
          console.warn("[sync] Level 0 detection error:", l0Err);
          // Level 0 failure must never block the rest of the pipeline
        }

        // ── Level 0b: SUB- tracking code detection (new submissions module) ──
        try {
          const { extractSubmissionTrackingCodes: extractTrackingCodes } = await import("@cantaia/core/submissions");
          const emailText = `${email.subject || ""} ${email.body_preview || ""}`;
          const subCodes = extractTrackingCodes(emailText);

          if (subCodes.length > 0) {
            const trackingCode = subCodes[0];
            const { data: priceRequest } = await (adminClient as any)
              .from("submission_price_requests")
              .select("id, submission_id, project_id, supplier_id")
              .eq("tracking_code", trackingCode)
              .maybeSingle();

            if (priceRequest) {
              // Classify email as action_required and link to project
              await (adminClient as any)
                .from("email_records")
                .update({
                  classification: "action_required",
                  project_id: priceRequest.project_id || null,
                  classification_status: "auto_classified",
                  email_category: "project",
                  ai_reasoning: `Level 0b: Submission tracking code detected (${trackingCode})`,
                  price_extracted: false,
                })
                .eq("id", email.id);

              // Update price request status
              await (adminClient as any)
                .from("submission_price_requests")
                .update({ status: "responded" })
                .eq("id", priceRequest.id);

              console.log(`[sync] Level 0b: Linked email "${email.subject}" to submission price request via ${trackingCode}`);
              emailsClassified++;
              continue;
            }
          }
        } catch (l0bErr) {
          // Level 0b failure must never block the rest of the pipeline
        }
      }

      // ═══════════════════════════════════════════════════════════
      // LEVEL 1: LOCAL LEARNED RULES (free, no AI)
      // ═══════════════════════════════════════════════════════════
      if (userOrg?.organization_id) {
        const localMatch = await checkLocalRules(adminClient, userOrg.organization_id, senderEmail);
        if (localMatch) {
          if (process.env.NODE_ENV === "development") console.log(`[sync] L1 Local rule match for "${email.subject}": project=${localMatch.projectId}, confidence=${localMatch.confidence}`);
          await (adminClient as any)
            .from("email_records")
            .update({
              project_id: localMatch.projectId,
              classification: "info_only",
              ai_classification_confidence: Math.round(localMatch.confidence * 100),
              ai_project_match_confidence: Math.round(localMatch.confidence * 100),
              ai_reasoning: "Classified by learned local rule (no AI call)",
              classification_status: "auto_classified",
              email_category: "project",
            })
            .eq("id", email.id);
          emailsClassified++;
          continue;
        }
      }

      // ═══════════════════════════════════════════════════════════
      // LEVEL 2: SPAM / NEWSLETTER FILTER (fast, no AI)
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

        if (process.env.NODE_ENV === "development") console.log(`[sync] L2 ${spamCheck.type} detected: "${email.subject}" (dismiss=${shouldAutoDismiss})`);

        await (adminClient as any)
          .from("email_records")
          .update({
            email_category: spamCheck.type === "spam" ? "spam" : "newsletter",
            ai_classification_confidence: Math.round(spamCheck.confidence * 100),
            ai_reasoning: spamCheck.reason,
            classification_status: "auto_classified",
          })
          .eq("id", email.id);
        emailsClassified++;
        if (shouldAutoDismiss) spamDismissed++;
        continue;
      }

      // ═══════════════════════════════════════════════════════════
      // LEVEL 2b: LOCAL KEYWORD CLASSIFICATION (fast, no AI)
      // ═══════════════════════════════════════════════════════════
      if (projects.length > 0) {
        const keywordMatch = classifyEmailByKeywords(
          {
            subject: email.subject,
            sender_email: senderEmail,
            sender_name: email.sender_name || undefined,
            body_preview: email.body_preview || undefined,
            recipients: email.recipients || [],
          },
          projects
        );

        if (keywordMatch && keywordMatch.confidence >= 0.6) {
          if (process.env.NODE_ENV === "development") console.log(`[sync] L2b Keyword match for "${email.subject}": project=${keywordMatch.projectId}, score=${keywordMatch.score}`);
          await (adminClient as any)
            .from("email_records")
            .update({
              project_id: keywordMatch.projectId,
              classification: "info_only",
              ai_classification_confidence: Math.round(keywordMatch.confidence * 100),
              ai_project_match_confidence: Math.round(keywordMatch.confidence * 100),
              classification_status: "auto_classified",
              email_category: "project",
              ai_reasoning: `Local keyword match: ${keywordMatch.reasons.join(", ")}`,
            })
            .eq("id", email.id);
          emailsClassified++;
          continue;
        }
      }

      // Skip AI if subject clearly identifies an unknown project
      if (isUnknownProjectSubject(email.subject, projects)) {
        if (process.env.NODE_ENV === "development") console.log(`[sync] SKIP AI: "${email.subject}" — first segment is unknown project`);
        await (adminClient as any)
          .from("email_records")
          .update({ classification_status: "auto_classified" })
          .eq("id", email.id);
        continue;
      }

      // ═══════════════════════════════════════════════════════════
      // LEVEL 3: CLAUDE AI CLASSIFICATION
      // ═══════════════════════════════════════════════════════════
      if (!anthropicApiKey) {
        // No AI key — mark as unprocessed for manual classification
        await (adminClient as any)
          .from("email_records")
          .update({
            classification_status: "unprocessed",
          })
          .eq("id", email.id);
        continue;
      }

      // Fetch full body for better classification
      let bodyFull: string | undefined;
      const messageId = email.outlook_message_id;
      if (messageId) {
        try {
          bodyFull = await getFullBody(messageId);
        } catch (bodyErr) {
          console.warn(`[sync] Full body fetch error:`, bodyErr);
        }
      }

      const result = await classifyEmail(
        anthropicApiKey,
        {
          sender_email: senderEmail,
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
            actionType: "email_classify",
            apiProvider: "anthropic",
            model: usage.model,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            metadata: { email_id: email.id },
          });
        }
      );

      // Build update payload based on match_type
      const confidencePercent = Math.round(result.confidence * 100);

      // Collect enriched signals from L3 classification to persist in suggested_project_data
      const enrichedSignals: Record<string, unknown> = {};
      if (result.prices_detected && result.prices_detected.length > 0) {
        enrichedSignals.prices_detected = result.prices_detected;
      }
      if (result.deadlines_detected && result.deadlines_detected.length > 0) {
        enrichedSignals.deadlines_detected = result.deadlines_detected;
      }
      if (result.supplier_match) {
        enrichedSignals.supplier_match = result.supplier_match;
      }
      if (result.delay_detected) {
        enrichedSignals.delay_detected = result.delay_detected;
      }
      if (result.order_confirmation) {
        enrichedSignals.order_confirmation = result.order_confirmation;
      }
      const hasEnrichedSignals = Object.keys(enrichedSignals).length > 0;

      if (result.match_type === "existing_project") {
        const isAutoClassified = result.confidence >= 0.85;
        await (adminClient as any)
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
            ...(hasEnrichedSignals ? { suggested_project_data: enrichedSignals } : {}),
          })
          .eq("id", email.id);

      } else if (result.match_type === "new_project") {
        const newProjectData = {
          ...(result.suggested_project || {}),
          ...(hasEnrichedSignals ? enrichedSignals : {}),
        };
        await (adminClient as any)
          .from("email_records")
          .update({
            project_id: null,
            classification: result.classification || "action_required",
            ai_summary: result.summary_fr,
            ai_classification_confidence: result.classification_confidence || confidencePercent,
            ai_project_match_confidence: 0,
            classification_status: "new_project_suggested",
            email_category: "project",
            suggested_project_data: Object.keys(newProjectData).length > 0 ? newProjectData : null,
            ai_reasoning: result.reasoning || null,
          })
          .eq("id", email.id);
        newProjectsSuggested++;

      } else {
        // no_project — could be personal, admin, etc.
        const isLowConfidence = result.confidence < 0.50;
        await (adminClient as any)
          .from("email_records")
          .update({
            project_id: null,
            classification: "info_only",
            ai_summary: result.summary_fr,
            ai_classification_confidence: confidencePercent,
            ai_project_match_confidence: 0,
            classification_status: isLowConfidence ? "unprocessed" : "classified_no_project",
            email_category: result.email_category || "personal",
            ai_reasoning: result.reasoning || null,
            ...(hasEnrichedSignals ? { suggested_project_data: enrichedSignals } : {}),
          })
          .eq("id", email.id);
      }

      emailsClassified++;

      // Learn from high-confidence AI classification
      if (result.confidence >= 0.85 && result.project_id && userOrg?.organization_id) {
        try {
          const { learnFromClassificationAction } = await import("@cantaia/core/emails");
          await learnFromClassificationAction({
            supabase: adminClient,
            organizationId: userOrg.organization_id,
            senderEmail,
            subject: email.subject,
            projectId: result.project_id,
            action: "confirm",
          });
        } catch { /* learning must never block sync */ }
      }

      // Create task if detected and project exists
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

      // Auto-archive if project has archiving enabled
      const classifiedProjectId = result.project_id;
      if (classifiedProjectId && archiveProjectsMap.has(classifiedProjectId)) {
        try {
          const archiveProject = archiveProjectsMap.get(classifiedProjectId)!;
          const basePath = archiveProject.archive_path || `C:\\Chantiers\\${archiveProject.name}`;
          const archiveInput: ArchiveEmailInput = {
            emailId: email.id,
            projectName: archiveProject.name,
            senderEmail,
            senderName: email.sender_name || null,
            subject: email.subject,
            receivedAt: email.received_at,
            classification: result.classification || null,
            attachmentNames: [],
          };
          const pathResult = determineArchivePath(
            archiveInput,
            archiveProject.archive_structure as ArchiveStructure,
            archiveProject.archive_filename_format as ArchiveFilenameFormat
          );
          const fullPath = pathResult.folder
            ? `${basePath}\\${pathResult.folder}\\${pathResult.fileName}.eml`
            : `${basePath}\\${pathResult.fileName}.eml`;

          await adminClient.from("email_archives").insert({
            email_id: email.id,
            project_id: classifiedProjectId,
            organization_id: archiveProject.organization_id,
            local_path: fullPath,
            folder_name: pathResult.folder || null,
            file_name: pathResult.fileName,
            attachments_saved: [],
            status: "pending",
          });
          emailsArchived++;
        } catch (archiveErr) {
          console.warn(`[sync] Auto-archive failed for email ${email.id}:`, archiveErr);
        }
      }

      // Auto-save plan attachments if email is classified under a project
      if (classifiedProjectId && email.has_attachments && email.outlook_message_id && graphTokenForPlans) {
        try {
          const attachments = await graphGetAttachments(graphTokenForPlans, email.outlook_message_id);
          const potentialPlans = attachments.filter((a) =>
            isPotentialPlan({ id: a.id, name: a.name, contentType: a.contentType, size: a.size })
          );

          if (potentialPlans.length > 0) {
            const detections = await detectPlansInEmail(
              email.id,
              potentialPlans.map((a) => ({ id: a.id, name: a.name, contentType: a.contentType, size: a.size })),
              {
                sender_email: senderEmail,
                sender_name: email.sender_name || "",
                subject: email.subject,
                body_excerpt: email.body_preview || "",
                project_name: projects.find((p) => p.id === classifiedProjectId)?.name || "",
                project_code: projects.find((p) => p.id === classifiedProjectId)?.code || "",
                lots_list: "",
                existing_plans_summary: "",
              }
            );

            for (let i = 0; i < detections.length; i++) {
              const det = detections[i];
              if (det.is_plan && det.confidence >= 0.7) {
                const att = potentialPlans[i];
                const saved = await savePlanFromAttachment({
                  supabase: adminClient,
                  graphAccessToken: graphTokenForPlans,
                  messageId: email.outlook_message_id,
                  attachment: { id: att.id, name: att.name, contentType: att.contentType, size: att.size },
                  detection: det,
                  emailId: email.id,
                  projectId: classifiedProjectId,
                  organizationId: userOrg?.organization_id || "",
                  userId: user.id,
                });
                if (saved) plansSaved++;
              }
            }
          }
        } catch (planErr) {
          console.warn(`[sync] Plan detection failed for email ${email.id}:`, planErr);
        }
      }
    } catch (err) {
      console.error(`[sync] Failed to classify email ${email.id} ("${email.subject}"):`, err);
      await (adminClient as any)
        .from("email_records")
        .update({ classification_status: "unprocessed" })
        .eq("id", email.id);
    }
  }

  // 8. Log results
  const providerName = emailConnection?.provider || "microsoft_legacy";
  await adminClient.from("app_logs").insert({
    user_id: user.id,
    level: "info",
    source: "email_sync",
    message: `Sync pipeline completed (${providerName})`,
    details: {
      provider: providerName,
      emails_synced: emailsSynced,
      emails_skipped: emailsSkipped,
      emails_classified: emailsClassified,
      tasks_created: tasksCreated,
      new_projects_suggested: newProjectsSuggested,
      emails_archived: emailsArchived,
      plans_saved: plansSaved,
      spam_dismissed: spamDismissed,
      snoozes_reset: snoozesReset,
    },
  });

  logActivityAsync({
    supabase: adminClient,
    userId: user.id,
    organizationId: userOrg?.organization_id ?? "",
    action: "sync_emails",
    metadata: {
      provider: providerName,
      emails_synced: emailsSynced,
      emails_classified: emailsClassified,
      tasks_created: tasksCreated,
      new_projects_suggested: newProjectsSuggested,
      emails_archived: emailsArchived,
      plans_saved: plansSaved,
      spam_dismissed: spamDismissed,
      snoozes_reset: snoozesReset,
    },
  });

  return NextResponse.json({
    success: true,
    provider: providerName,
    emails_synced: emailsSynced,
    emails_classified: emailsClassified,
    tasks_created: tasksCreated,
    new_projects_suggested: newProjectsSuggested,
    emails_archived: emailsArchived,
    plans_saved: plansSaved,
    spam_dismissed: spamDismissed,
    snoozes_reset: snoozesReset,
  });
}

// ── Multi-provider sync via email_connections table ──────────────────────────

interface EmailConnectionRecord {
  id: string;
  user_id: string;
  organization_id: string;
  provider: string;
  oauth_access_token: string | null;
  oauth_refresh_token: string | null;
  oauth_token_expires_at: string | null;
  oauth_scopes: string | null;
  email_address: string;
  display_name: string | null;
  status: string;
  last_sync_at: string | null;
  sync_delta_link: string | null;
  total_emails_synced: number;
  created_at: string;
}

async function syncViaProvider(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  connection: EmailConnectionRecord,
  _organizationId?: string
): Promise<{ emailsSynced: number; emailsSkipped: number; error?: string }> {
  try {
    const provider = getEmailProvider(connection.provider);

    // Refresh OAuth token if needed
    if ((connection.provider === "microsoft" || connection.provider === "google") &&
        isTokenExpired(connection.oauth_token_expires_at) &&
        provider.refreshToken) {
      try {
        const tokens = await provider.refreshToken(connection as unknown as EmailConnectionConfig);
        const newExpiresAt = tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : connection.oauth_token_expires_at;
        const newRefreshToken = tokens.refresh_token || connection.oauth_refresh_token;

        // Update BOTH tables to keep tokens in sync (prevents desync on rotation)
        await Promise.all([
          adminClient
            .from("email_connections")
            .update({
              oauth_access_token: tokens.access_token,
              oauth_refresh_token: newRefreshToken,
              oauth_token_expires_at: newExpiresAt,
            })
            .eq("id", connection.id),
          adminClient
            .from("users")
            .update({
              microsoft_access_token: tokens.access_token,
              microsoft_refresh_token: newRefreshToken,
              microsoft_token_expires_at: newExpiresAt,
            })
            .eq("id", userId),
        ]);

        connection.oauth_access_token = tokens.access_token;
        if (tokens.refresh_token) connection.oauth_refresh_token = tokens.refresh_token;
      } catch (refreshErr) {
        console.error(`[sync] Token refresh failed for ${connection.provider}:`, refreshErr);
        return { emailsSynced: 0, emailsSkipped: 0, error: `Token refresh failed: ${refreshErr instanceof Error ? refreshErr.message : "Unknown"}` };
      }
    }

    // ── Use delta query if Microsoft provider supports it ──
    let rawEmails: { externalId: string; from: string; fromName?: string; to: string[]; cc?: string[]; subject: string; date: Date; bodyText?: string; bodyHtml?: string; isRead: boolean; importance?: string; conversationId?: string; hasAttachments?: boolean }[] = [];
    let newDeltaLink: string | null = null;

    if (connection.provider === "microsoft" && provider.fetchEmailsDelta) {
      if (process.env.NODE_ENV === "development") console.log(`[sync] Using delta query for Microsoft (deltaLink exists: ${!!connection.sync_delta_link})`);
      const deltaResult = await provider.fetchEmailsDelta(connection as unknown as EmailConnectionConfig);
      rawEmails = deltaResult.emails;
      newDeltaLink = deltaResult.deltaLink;
    } else {
      // Fallback: date-based fetch
      const sinceDate = connection.last_sync_at
        ? new Date(connection.last_sync_at)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      rawEmails = await provider.fetchEmails(connection as unknown as EmailConnectionConfig, sinceDate);
    }

    let synced = 0;
    let skipped = 0;

    if (rawEmails.length === 0) {
      // Nothing to sync
    } else {
      // Batch check existing IDs
      const externalIds = rawEmails.map((r) => r.externalId).filter(Boolean);
      const existingIds = new Set<string>();

      const CHUNK_SIZE = 200;
      for (let i = 0; i < externalIds.length; i += CHUNK_SIZE) {
        const chunk = externalIds.slice(i, i + CHUNK_SIZE);
        // Check by outlook_message_id to deduplicate
        const { data: existingRows } = await (adminClient as any)
          .from("email_records")
          .select("outlook_message_id")
          .eq("user_id", userId)
          .in("outlook_message_id", chunk);
        for (const row of existingRows || []) {
          if (row.outlook_message_id) existingIds.add(row.outlook_message_id);
        }
      }

      // Prepare batch of new emails to insert — save full body alongside preview
      const toInsert = [];
      for (const raw of rawEmails) {
        if (existingIds.has(raw.externalId)) {
          skipped++;
          continue;
        }

        const plainText = raw.bodyText || (raw.bodyHtml ? stripHtml(raw.bodyHtml) : null);
        const bodyPreview = plainText ? plainText.substring(0, 500) : null;

        toInsert.push({
          user_id: userId,
          outlook_message_id: raw.externalId,
          sender_email: raw.from || "",
          sender_name: raw.fromName || null,
          recipients: [...raw.to, ...(raw.cc || [])],
          received_at: raw.date.toISOString(),
          body_preview: bodyPreview,
          body_html: raw.bodyHtml || null,
          body_text: plainText || null,
          has_attachments: raw.hasAttachments || false,
          is_processed: false,
          subject: raw.subject || "(Sans objet)",
        });
      }

      // Batch insert in chunks
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        try {
          await (adminClient as any).from("email_records").insert(chunk);
          synced += chunk.length;
        } catch (err) {
          // Fallback: insert individually
          for (const record of chunk) {
            try {
              await (adminClient as any).from("email_records").insert(record);
              synced++;
            } catch (individualErr) {
              console.warn(`[sync] Failed to sync email ${record.outlook_message_id}:`, individualErr);
            }
          }
        }
      }
    }

    // Update connection: last sync + delta link + totals
    const syncAt = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      last_sync_at: syncAt,
      total_emails_synced: (connection.total_emails_synced || 0) + synced,
    };
    if (newDeltaLink) {
      updatePayload.sync_delta_link = newDeltaLink;
    }
    await (adminClient as any)
      .from("email_connections")
      .update(updatePayload)
      .eq("id", connection.id);

    // Also update legacy last_sync_at on users
    await adminClient
      .from("users")
      .update({ last_sync_at: syncAt })
      .eq("id", userId);

    return { emailsSynced: synced, emailsSkipped: skipped };
  } catch (err) {
    const message = `Provider sync failed (${connection.provider}): ${err instanceof Error ? err.message : "Unknown"}`;
    console.error(`[sync] ${message}`);
    return { emailsSynced: 0, emailsSkipped: 0, error: message };
  }
}

// ── Legacy Microsoft sync (backward compat for users without email_connections) ──

async function syncLegacyMicrosoft(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ emailsSynced: number; emailsSkipped: number; error?: string }> {
  const existingMsgIds = new Set<string>();
  const { data: existingRows } = await adminClient
    .from("email_records")
    .select("outlook_message_id")
    .eq("user_id", userId)
    .not("outlook_message_id", "is", null);
  for (const row of existingRows || []) {
    if (row.outlook_message_id) existingMsgIds.add(row.outlook_message_id);
  }

  const deps: SyncDependencies = {
    getValidToken: async (uid) => {
      const result = await getValidMicrosoftToken(uid);
      return {
        accessToken: result.accessToken || undefined,
        error: result.error || undefined,
      };
    },

    getUserLastSync: async (uid) => {
      const { data } = await adminClient
        .from("users")
        .select("last_sync_at")
        .eq("id", uid)
        .maybeSingle();
      return data?.last_sync_at || null;
    },

    emailExists: async (_uid, outlookMessageId) => {
      return existingMsgIds.has(outlookMessageId);
    },

    insertEmail: async (emailData) => {
      await (adminClient as any).from("email_records").insert(emailData);
    },

    updateLastSync: async (uid, syncAt) => {
      await adminClient
        .from("users")
        .update({ last_sync_at: syncAt })
        .eq("id", uid);
    },

    logSync: async (uid, level, message, details) => {
      await adminClient.from("app_logs").insert({
        user_id: uid,
        level: level as "info" | "warning" | "error" | "critical",
        source: "outlook_sync",
        message,
        details: details || {},
      });
    },
  };

  const syncResult = await syncUserEmails(userId, deps);
  return {
    emailsSynced: syncResult.emailsSynced,
    emailsSkipped: syncResult.emailsSkipped,
    error: syncResult.success ? undefined : syncResult.error,
  };
}

// ── Build a function to fetch full email body via the right provider ──

async function buildBodyFetcher(
  userId: string,
  emailConnection: EmailConnectionRecord | null
): Promise<(messageId: string) => Promise<string | undefined>> {
  if (emailConnection) {
    const provider = getEmailProvider(emailConnection.provider);
    if (provider.getEmailBody) {
      return async (messageId: string) => {
        try {
          const body = await provider.getEmailBody!(emailConnection as unknown as EmailConnectionConfig, messageId);
          if (body.bodyHtml) return stripHtml(body.bodyHtml).substring(0, 10000);
          if (body.bodyText) return body.bodyText.substring(0, 10000);
        } catch {
          // Fall through
        }
        return undefined;
      };
    }
    return async () => undefined;
  }

  // Legacy: fetch from Microsoft Graph
  let graphAccessToken: string | undefined;
  try {
    const tokenResult = await getValidMicrosoftToken(userId);
    graphAccessToken = tokenResult.accessToken || undefined;
  } catch {
    console.warn("[sync] Could not get Microsoft token for full body fetch");
  }

  return async (messageId: string) => {
    if (!graphAccessToken) return undefined;
    try {
      const graphRes = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}?$select=body`,
        { headers: { Authorization: `Bearer ${graphAccessToken}` } }
      );
      if (graphRes.ok) {
        const graphData = await graphRes.json();
        if (graphData.body?.content) {
          return stripHtml(graphData.body.content).substring(0, 10000);
        }
      }
    } catch {
      // Fall through
    }
    return undefined;
  };
}
