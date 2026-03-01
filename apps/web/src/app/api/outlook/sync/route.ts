import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { syncUserEmails, type SyncDependencies } from "@cantaia/core/outlook";
import { classifyEmail, classifyEmailByKeywords, isUnknownProjectSubject, type ProjectForClassification } from "@cantaia/core/ai";
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
    console.log("[outlook/sync] Full resync requested — cleared last_sync_at");
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
    .select("*")
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
      console.log("[outlook/sync] Auto-creating email_connection from legacy Microsoft tokens");
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
        .select("*")
        .maybeSingle();

      if (newConn) {
        emailConnection = newConn;
        console.log("[outlook/sync] Email connection auto-created successfully");
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
  let snoozesReset = 0;
  try {
    const now = new Date().toISOString();
    const { data: expiredSnoozes } = await (adminClient as any)
      .from("emails")
      .update({
        triage_status: "unprocessed",
        snooze_until: null,
      })
      .eq("user_id", user.id)
      .eq("triage_status", "snoozed")
      .lte("snooze_until", now)
      .select("id");
    snoozesReset = expiredSnoozes?.length || 0;
    if (snoozesReset > 0) {
      console.log(`[sync] Reset ${snoozesReset} expired snoozes`);
    }
  } catch (err) {
    console.warn("[sync] Snooze reset check failed:", err);
  }

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

  // Get unprocessed emails (using triage_status if available, falling back to is_processed)
  const { data: unprocessedEmails } = await (adminClient as any)
    .from("emails")
    .select("*")
    .eq("user_id", user.id)
    .or("triage_status.eq.unprocessed,is_processed.eq.false")
    .order("received_at", { ascending: false })
    .limit(100);

  console.log(`[sync] ${(unprocessedEmails || []).length} unprocessed emails to classify, ${projects.length} projects available`);

  for (const email of unprocessedEmails || []) {
    try {
      const senderEmail = email.from_email || email.sender_email || "";

      // ═══════════════════════════════════════════════════════════
      // LEVEL 1: LOCAL LEARNED RULES (free, no AI)
      // ═══════════════════════════════════════════════════════════
      if (userOrg?.organization_id) {
        const localMatch = await checkLocalRules(adminClient, userOrg.organization_id, senderEmail);
        if (localMatch) {
          console.log(`[sync] L1 Local rule match for "${email.subject}": project=${localMatch.projectId}, confidence=${localMatch.confidence}`);
          await (adminClient as any)
            .from("emails")
            .update({
              project_id: localMatch.projectId,
              classification: "info_only",
              ai_confidence: localMatch.confidence,
              ai_classification_confidence: Math.round(localMatch.confidence * 100),
              ai_project_match_confidence: Math.round(localMatch.confidence * 100),
              ai_reasoning: "Classified by learned local rule (no AI call)",
              classification_status: "auto_classified",
              email_category: "project",
              triage_status: "unprocessed",
              is_processed: true,
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

        console.log(`[sync] L2 ${spamCheck.type} detected: "${email.subject}" (dismiss=${shouldAutoDismiss})`);

        await (adminClient as any)
          .from("emails")
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
            sender_name: email.sender_name || email.from_name || undefined,
            body_preview: email.body_preview || undefined,
          },
          projects
        );

        if (keywordMatch && keywordMatch.confidence >= 0.5) {
          console.log(`[sync] L2b Keyword match for "${email.subject}": project=${keywordMatch.projectId}, score=${keywordMatch.score}`);
          await (adminClient as any)
            .from("emails")
            .update({
              project_id: keywordMatch.projectId,
              classification: "info_only",
              ai_confidence: keywordMatch.confidence,
              ai_classification_confidence: Math.round(keywordMatch.confidence * 100),
              ai_project_match_confidence: Math.round(keywordMatch.confidence * 100),
              classification_status: "auto_classified",
              email_category: "project",
              ai_reasoning: `Local keyword match: ${keywordMatch.reasons.join(", ")}`,
              triage_status: "unprocessed",
              is_processed: true,
            })
            .eq("id", email.id);
          emailsClassified++;
          continue;
        }
      }

      // Skip AI if subject clearly identifies an unknown project
      if (isUnknownProjectSubject(email.subject, projects)) {
        console.log(`[sync] SKIP AI: "${email.subject}" — first segment is unknown project`);
        await (adminClient as any)
          .from("emails")
          .update({ is_processed: true, triage_status: "unprocessed" })
          .eq("id", email.id);
        continue;
      }

      // ═══════════════════════════════════════════════════════════
      // LEVEL 3: CLAUDE AI CLASSIFICATION
      // ═══════════════════════════════════════════════════════════
      if (!anthropicApiKey) {
        // No AI key — mark as unprocessed for manual classification
        await (adminClient as any)
          .from("emails")
          .update({
            is_processed: true,
            triage_status: "pending_classification",
            classification_status: "unprocessed",
          })
          .eq("id", email.id);
        continue;
      }

      // Fetch full body for better classification
      let bodyFull: string | undefined;
      const messageId = email.provider_message_id || email.outlook_message_id;
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
          sender_name: email.sender_name || email.from_name || "",
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

      if (result.match_type === "existing_project") {
        const isAutoClassified = result.confidence >= 0.85;
        await (adminClient as any)
          .from("emails")
          .update({
            project_id: result.project_id || null,
            classification: result.classification || "info_only",
            ai_summary: result.summary_fr,
            ai_confidence: result.confidence,
            ai_classification_confidence: result.classification_confidence || confidencePercent,
            ai_project_match_confidence: confidencePercent,
            classification_status: isAutoClassified ? "auto_classified" : "suggested",
            email_category: "project",
            ai_reasoning: result.reasoning || null,
            triage_status: "unprocessed", // Always unprocessed — user must act
            is_processed: true,
          })
          .eq("id", email.id);

      } else if (result.match_type === "new_project") {
        await (adminClient as any)
          .from("emails")
          .update({
            project_id: null,
            classification: result.classification || "action_required",
            ai_summary: result.summary_fr,
            ai_confidence: result.confidence,
            ai_classification_confidence: result.classification_confidence || confidencePercent,
            ai_project_match_confidence: 0,
            classification_status: "new_project_suggested",
            email_category: "project",
            suggested_project_data: result.suggested_project || null,
            ai_reasoning: result.reasoning || null,
            triage_status: "unprocessed",
            is_processed: true,
          })
          .eq("id", email.id);
        newProjectsSuggested++;

      } else {
        // no_project — could be personal, admin, etc.
        const isLowConfidence = result.confidence < 0.50;
        await (adminClient as any)
          .from("emails")
          .update({
            project_id: null,
            classification: "info_only",
            ai_summary: result.summary_fr,
            ai_confidence: result.confidence,
            ai_classification_confidence: confidencePercent,
            ai_project_match_confidence: 0,
            classification_status: isLowConfidence ? "unprocessed" : "classified_no_project",
            email_category: result.email_category || "personal",
            ai_reasoning: result.reasoning || null,
            triage_status: isLowConfidence ? "pending_classification" : "unprocessed",
            is_processed: true,
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
      if (result.contains_task && result.task && result.project_id) {
        await adminClient.from("tasks").insert({
          project_id: result.project_id,
          created_by: user.id,
          title: result.task.title,
          priority: result.task.priority,
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
            senderName: email.sender_name || email.from_name || null,
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
    } catch (err) {
      console.error(`[sync] Failed to classify email ${email.id} ("${email.subject}"):`, err);
      await (adminClient as any)
        .from("emails")
        .update({ is_processed: true, triage_status: "unprocessed", classification_status: "unprocessed" })
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
    spam_dismissed: spamDismissed,
    snoozes_reset: snoozesReset,
  });
}

// ── Multi-provider sync via email_connections table ──────────────────────────

async function syncViaProvider(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: any,
  organizationId?: string
): Promise<{ emailsSynced: number; emailsSkipped: number; error?: string }> {
  try {
    const provider = getEmailProvider(connection.provider);

    // Refresh OAuth token if needed
    if ((connection.provider === "microsoft" || connection.provider === "google") &&
        isTokenExpired(connection.oauth_token_expires_at) &&
        provider.refreshToken) {
      try {
        const tokens = await provider.refreshToken(connection as EmailConnectionConfig);
        await adminClient
          .from("email_connections")
          .update({
            oauth_access_token: tokens.access_token,
            oauth_refresh_token: tokens.refresh_token || connection.oauth_refresh_token,
            oauth_token_expires_at: tokens.expires_in
              ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
              : connection.oauth_token_expires_at,
          })
          .eq("id", connection.id);

        connection.oauth_access_token = tokens.access_token;
        if (tokens.refresh_token) connection.oauth_refresh_token = tokens.refresh_token;
      } catch (refreshErr) {
        console.error(`[sync] Token refresh failed for ${connection.provider}:`, refreshErr);
        return { emailsSynced: 0, emailsSkipped: 0, error: `Token refresh failed: ${refreshErr instanceof Error ? refreshErr.message : "Unknown"}` };
      }
    }

    // ── Use delta query if Microsoft provider supports it ──
    let rawEmails: { externalId: string; from: string; fromName?: string; to: string[]; cc?: string[]; subject: string; date: Date; bodyText?: string; bodyHtml?: string; isRead: boolean; importance?: string; conversationId?: string }[] = [];
    let newDeltaLink: string | null = null;

    if (connection.provider === "microsoft" && provider.fetchEmailsDelta) {
      console.log(`[sync] Using delta query for Microsoft (deltaLink exists: ${!!connection.sync_delta_link})`);
      const deltaResult = await provider.fetchEmailsDelta(connection as EmailConnectionConfig);
      rawEmails = deltaResult.emails;
      newDeltaLink = deltaResult.deltaLink;
    } else {
      // Fallback: date-based fetch
      const sinceDate = connection.last_sync_at
        ? new Date(connection.last_sync_at)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      rawEmails = await provider.fetchEmails(connection as EmailConnectionConfig, sinceDate);
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
        // Check both new provider_message_id and legacy outlook_message_id
        const { data: existingRows } = await (adminClient as any)
          .from("emails")
          .select("provider_message_id, outlook_message_id")
          .eq("user_id", userId)
          .or(`provider_message_id.in.(${chunk.join(",")}),outlook_message_id.in.(${chunk.join(",")})`);
        for (const row of existingRows || []) {
          if (row.provider_message_id) existingIds.add(row.provider_message_id);
          if (row.outlook_message_id) existingIds.add(row.outlook_message_id);
        }
      }

      // Prepare batch of new emails to insert with RICHER data
      const toInsert = [];
      for (const raw of rawEmails) {
        if (existingIds.has(raw.externalId)) {
          skipped++;
          continue;
        }

        const bodyText = raw.bodyText || (raw.bodyHtml ? stripHtml(raw.bodyHtml) : null);
        const bodyPreview = bodyText ? bodyText.substring(0, 500) : null;

        toInsert.push({
          user_id: userId,
          organization_id: organizationId || null,
          // New fields from MAIL.1
          provider: connection.provider,
          provider_message_id: raw.externalId,
          provider_thread_id: raw.conversationId || null,
          from_email: raw.from || "",
          from_name: raw.fromName || null,
          to_emails: raw.to || [],
          cc_emails: raw.cc || [],
          body_text: bodyText?.substring(0, 50000) || null,
          body_html: raw.bodyHtml?.substring(0, 100000) || null,
          is_read_provider: raw.isRead,
          importance: raw.importance || "normal",
          sent_at: raw.date.toISOString(),
          // Legacy fields (backward compat)
          outlook_message_id: raw.externalId,
          sender_email: raw.from || "",
          sender_name: raw.fromName || null,
          recipients: [...raw.to, ...(raw.cc || [])],
          received_at: raw.date.toISOString(),
          body_preview: bodyPreview,
          has_attachments: false, // Will be updated when attachments are fetched
          // Triage: always starts as unprocessed
          triage_status: "unprocessed",
          is_processed: false,
          subject: raw.subject || "(Sans objet)",
        });
      }

      // Batch insert in chunks
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        try {
          await (adminClient as any).from("emails").insert(chunk);
          synced += chunk.length;
        } catch (err) {
          // Fallback: insert individually
          for (const record of chunk) {
            try {
              await (adminClient as any).from("emails").insert(record);
              synced++;
            } catch (individualErr) {
              console.warn(`[sync] Failed to sync email ${record.provider_message_id}:`, individualErr);
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
    .from("emails")
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
      await (adminClient as any).from("emails").insert({
        ...emailData,
        triage_status: "unprocessed",
      });
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emailConnection: any | null
): Promise<(messageId: string) => Promise<string | undefined>> {
  if (emailConnection) {
    const provider = getEmailProvider(emailConnection.provider);
    if (provider.getEmailBody) {
      return async (messageId: string) => {
        try {
          const body = await provider.getEmailBody!(emailConnection as EmailConnectionConfig, messageId);
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
