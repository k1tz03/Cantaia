import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { syncUserEmails, type SyncDependencies } from "@cantaia/core/outlook";
import { classifyEmail, classifyEmailByKeywords, isUnknownProjectSubject, type ProjectForClassification } from "@cantaia/core/ai";
import { trackApiUsage, logActivityAsync } from "@cantaia/core/tracking";
import { checkLocalRules, determineArchivePath, getEmailProvider, isTokenExpired, type ArchiveEmailInput, type EmailConnectionConfig } from "@cantaia/core/emails";
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

export async function POST() {
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

  // 2. Get user's organization
  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  // 3. Determine sync strategy: new email_connections table or legacy Microsoft tokens
  const { data: emailConnection } = await adminClient
    .from("email_connections")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let emailsSynced = 0;
  let emailsSkipped = 0;
  let syncError: string | undefined;

  if (emailConnection) {
    // ── New multi-provider sync via email_connections ──
    const result = await syncViaProvider(adminClient, user.id, emailConnection);
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

  // 4. Pre-load archive-enabled projects for auto-archiving after classification
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

  // 5. Classify unprocessed emails with AI
  let emailsClassified = 0;
  let tasksCreated = 0;
  let newProjectsSuggested = 0;
  let emailsArchived = 0;

  if (anthropicApiKey) {
    // Build a function to fetch full email body via the provider
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
    const { data: unprocessedEmails } = await adminClient
      .from("emails")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_processed", false)
      .order("received_at", { ascending: false });

    console.log(`[sync] ${(unprocessedEmails || []).length} unprocessed emails to classify, ${projects.length} projects available`);

    for (const email of unprocessedEmails || []) {
      try {
        // Check local learned rules first (skip Claude if we have a high-confidence match)
        if (userOrg?.organization_id) {
          const localMatch = await checkLocalRules(adminClient, userOrg.organization_id, email.sender_email);
          if (localMatch) {
            console.log(`[sync] Local rule match for "${email.subject}": project=${localMatch.projectId}, confidence=${localMatch.confidence}`);
            await adminClient
              .from("emails")
              .update({
                project_id: localMatch.projectId,
                classification: "info_only",
                ai_summary: null,
                ai_classification_confidence: Math.round(localMatch.confidence * 100),
                ai_project_match_confidence: Math.round(localMatch.confidence * 100),
                classification_status: "auto_classified",
                email_category: "project",
                ai_reasoning: "Classified by learned local rule (no AI call)",
                is_processed: true,
              })
              .eq("id", email.id);
            emailsClassified++;
            continue;
          }
        }

        // ── Local keyword classification (fast first-pass) ──
        if (projects.length > 0) {
          const keywordMatch = classifyEmailByKeywords(
            {
              subject: email.subject,
              sender_email: email.sender_email,
              sender_name: email.sender_name || undefined,
              body_preview: email.body_preview || undefined,
            },
            projects
          );

          if (keywordMatch && keywordMatch.confidence >= 0.5) {
            console.log(`[sync] Keyword match for "${email.subject}": project=${keywordMatch.projectId}, score=${keywordMatch.score}, reasons=[${keywordMatch.reasons.join(", ")}]`);
            await adminClient
              .from("emails")
              .update({
                project_id: keywordMatch.projectId,
                classification: "info_only",
                ai_summary: null,
                ai_classification_confidence: Math.round(keywordMatch.confidence * 100),
                ai_project_match_confidence: Math.round(keywordMatch.confidence * 100),
                classification_status: "auto_classified",
                email_category: "project",
                ai_reasoning: `Local keyword match: ${keywordMatch.reasons.join(", ")}`,
                is_processed: true,
              })
              .eq("id", email.id);
            emailsClassified++;
            continue;
          }
        }

        // Skip AI if the subject clearly identifies an unknown project
        if (isUnknownProjectSubject(email.subject, projects)) {
          console.log(`[sync] SKIP AI: "${email.subject}" — first segment is unknown project`);
          await adminClient
            .from("emails")
            .update({ is_processed: true })
            .eq("id", email.id);
          continue;
        }

        // Fetch full body via provider for better classification
        let bodyFull: string | undefined;
        if (email.outlook_message_id) {
          try {
            bodyFull = await getFullBody(email.outlook_message_id);
          } catch (bodyErr) {
            console.warn(`[sync] Full body fetch error:`, bodyErr);
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
          await adminClient
            .from("emails")
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
            .from("emails")
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
          newProjectsSuggested++;

        } else {
          await adminClient
            .from("emails")
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

        emailsClassified++;

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
              senderEmail: email.sender_email,
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
      } catch (err) {
        console.error(`[sync] Failed to classify email ${email.id} ("${email.subject}"):`, err);
        await adminClient
          .from("emails")
          .update({ is_processed: true, classification_status: "unprocessed" })
          .eq("id", email.id);
      }
    }
  }

  // 6. Log results
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
    },
  });

  logActivityAsync({
    supabase: adminClient,
    userId: user.id,
    organizationId: userOrg?.organization_id ?? "",
    action: "sync_emails",
    metadata: { provider: providerName, emails_synced: emailsSynced, emails_classified: emailsClassified, tasks_created: tasksCreated, new_projects_suggested: newProjectsSuggested, emails_archived: emailsArchived },
  });

  return NextResponse.json({
    success: true,
    provider: providerName,
    emails_synced: emailsSynced,
    emails_classified: emailsClassified,
    tasks_created: tasksCreated,
    new_projects_suggested: newProjectsSuggested,
    emails_archived: emailsArchived,
  });
}

// ── Multi-provider sync via email_connections table ──────────────────────────

async function syncViaProvider(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  connection: any
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

        // Update in-memory connection for this sync
        connection.oauth_access_token = tokens.access_token;
        if (tokens.refresh_token) connection.oauth_refresh_token = tokens.refresh_token;
      } catch (refreshErr) {
        console.error(`[sync] Token refresh failed for ${connection.provider}:`, refreshErr);
        return { emailsSynced: 0, emailsSkipped: 0, error: `Token refresh failed: ${refreshErr instanceof Error ? refreshErr.message : "Unknown"}` };
      }
    }

    // Determine since date
    const sinceDate = connection.last_sync_at
      ? new Date(connection.last_sync_at)
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Fetch emails via provider
    const rawEmails = await provider.fetchEmails(connection as EmailConnectionConfig, sinceDate);

    let synced = 0;
    let skipped = 0;

    if (rawEmails.length === 0) {
      // Nothing to sync
    } else {
      // Batch check: fetch all existing outlook_message_ids for this user in one query
      const externalIds = rawEmails.map((r) => r.externalId).filter(Boolean);
      const existingIds = new Set<string>();

      // Supabase .in() supports up to ~300 items; chunk if needed
      const CHUNK_SIZE = 200;
      for (let i = 0; i < externalIds.length; i += CHUNK_SIZE) {
        const chunk = externalIds.slice(i, i + CHUNK_SIZE);
        const { data: existingRows } = await adminClient
          .from("emails")
          .select("outlook_message_id")
          .eq("user_id", userId)
          .in("outlook_message_id", chunk);
        for (const row of existingRows || []) {
          if (row.outlook_message_id) existingIds.add(row.outlook_message_id);
        }
      }

      // Prepare batch of new emails to insert
      const toInsert = [];
      for (const raw of rawEmails) {
        if (existingIds.has(raw.externalId)) {
          skipped++;
          continue;
        }

        const bodyPreview = raw.bodyText
          ? raw.bodyText.substring(0, 500)
          : raw.bodyHtml
            ? stripHtml(raw.bodyHtml).substring(0, 500)
            : null;

        toInsert.push({
          user_id: userId,
          outlook_message_id: raw.externalId,
          subject: raw.subject || "(Sans objet)",
          sender_email: raw.from || "",
          sender_name: raw.fromName || null,
          recipients: [...raw.to, ...(raw.cc || [])],
          received_at: raw.date.toISOString(),
          body_preview: bodyPreview,
          has_attachments: raw.attachments.length > 0,
          is_processed: false,
        });
      }

      // Batch insert in chunks
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        try {
          await adminClient.from("emails").insert(chunk);
          synced += chunk.length;
        } catch (err) {
          // Fallback: insert individually if batch fails (e.g. duplicate key)
          for (const record of chunk) {
            try {
              await adminClient.from("emails").insert(record);
              synced++;
            } catch (individualErr) {
              console.warn(`[sync] Failed to sync email ${record.outlook_message_id}:`, individualErr);
            }
          }
        }
      }
    }

    // Update last sync on the connection
    const syncAt = new Date().toISOString();
    await adminClient
      .from("email_connections")
      .update({
        last_sync_at: syncAt,
        total_emails_synced: (connection.total_emails_synced || 0) + synced,
      })
      .eq("id", connection.id);

    // Also update legacy last_sync_at on users for backward compat
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
  // Pre-load existing message IDs to avoid N+1 queries in emailExists
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
      await adminClient.from("emails").insert(emailData);
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
    // Use the provider's getEmailBody if available
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
