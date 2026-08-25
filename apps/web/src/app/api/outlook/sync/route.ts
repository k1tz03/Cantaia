import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import { syncUserEmails, type SyncDependencies } from "@cantaia/core/outlook";
import { logActivityAsync } from "@cantaia/core/tracking";
import { getEmailProvider, isTokenExpired, type EmailConnectionConfig, type RawEmail } from "@cantaia/core/emails";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  buildClassificationContext,
  classifyPendingEmails,
  resetExpiredSnoozes,
  type EmailConnectionRecord,
} from "@/lib/email/classification-pipeline";
import { ensureOutlookWebhook } from "@/lib/email/webhook-subscription";
import { dedupAndInsertEmails } from "@/lib/email/connection-sync";

// Allow up to 5 minutes for bulk syncs (500+ emails with classification pipeline)
export const maxDuration = 300;

/** Leave ~40 s of headroom before Vercel kills the function. */
const CLASSIFY_BUDGET_MS = 240_000;

export async function POST(request: Request) {
  const startedAt = Date.now();

  // 1. Verify auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1b. Rate limit: a sync fans out to ~100 Claude calls, so cap it per user (B6)
  const limitResult = await rateLimit(`sync:user:${user.id}`, { limit: 6, windowSec: 3600 });
  if (!limitResult.allowed) {
    return rateLimitResponse(limitResult) as unknown as NextResponse;
  }

  const adminClient = createAdminClient();

  // Support ?full=true to force a full resync (clears last_sync_at)
  const { searchParams } = new URL(request.url);
  if (searchParams.get("full") === "true") {
    const { error: resetErr } = await adminClient
      .from("users")
      .update({ last_sync_at: null })
      .eq("id", user.id);
    if (resetErr) {
      console.warn("[outlook/sync] Full-resync reset failed:", resetErr.message);
    } else if (process.env.NODE_ENV === "development") {
      console.log("[outlook/sync] Full resync requested — cleared last_sync_at");
    }
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
      const { data: newConn, error: connInsertErr } = await adminClient
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

      if (connInsertErr) {
        console.warn("[outlook/sync] Email connection auto-create failed:", connInsertErr.message);
      } else if (newConn) {
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
    const result = await syncLegacyMicrosoft(adminClient, user.id, userOrg?.organization_id || null);
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
  const snoozesReset = await resetExpiredSnoozes(adminClient, user.id);

  // 5. Classify — SAME cascade as the nightly cron (single implementation).
  const ctx = await buildClassificationContext(adminClient, user.id, {
    organizationId: userOrg?.organization_id ?? null,
    connection: emailConnection as EmailConnectionRecord | null,
    deadlineAt: startedAt + CLASSIFY_BUDGET_MS,
    limit: 100,
  });
  const stats = await classifyPendingEmails(ctx);

  // 5b. D-FIX4 — keep the Graph change-notification subscription alive. Fire and
  // forget: real-time mail is a bonus, never a reason to fail a sync.
  if (emailConnection?.provider === "microsoft" && ctx.graphToken) {
    ensureOutlookWebhook(adminClient, user.id, ctx.graphToken).catch(() => {});
  }

  // 6. Log results
  const providerName = emailConnection?.provider || "microsoft_legacy";
  const details = {
    provider: providerName,
    emails_synced: emailsSynced,
    emails_skipped: emailsSkipped,
    emails_classified: stats.emailsClassified,
    tasks_created: stats.tasksCreated,
    new_projects_suggested: stats.newProjectsSuggested,
    emails_archived: stats.emailsArchived,
    plans_saved: stats.plansSaved,
    spam_dismissed: stats.spamDismissed,
    quotes_extracted: stats.quotesExtracted,
    snoozes_reset: snoozesReset,
    classification_timed_out: stats.timedOut,
  };

  const { error: logErr } = await adminClient.from("app_logs").insert({
    user_id: user.id,
    level: "info",
    source: "email_sync",
    message: `Sync pipeline completed (${providerName})`,
    details,
  });
  if (logErr) console.warn("[outlook/sync] app_logs insert failed:", logErr.message);

  logActivityAsync({
    supabase: adminClient,
    userId: user.id,
    organizationId: userOrg?.organization_id ?? "",
    action: "sync_emails",
    metadata: details,
  });

  return NextResponse.json({
    success: true,
    provider: providerName,
    emails_synced: emailsSynced,
    emails_classified: stats.emailsClassified,
    tasks_created: stats.tasksCreated,
    new_projects_suggested: stats.newProjectsSuggested,
    emails_archived: stats.emailsArchived,
    plans_saved: stats.plansSaved,
    spam_dismissed: stats.spamDismissed,
    quotes_extracted: stats.quotesExtracted,
    snoozes_reset: snoozesReset,
    classification_timed_out: stats.timedOut,
    // B6: surface the quota state so the client can warn the user that emails
    // were synced but not AI-classified.
    ai_classification_skipped: ctx.aiQuotaExceeded,
    ...(ctx.aiQuotaInfo ? { usage_limit: ctx.aiQuotaInfo } : {}),
  });
}

// ── Multi-provider sync via email_connections table ──────────────────────────

async function syncViaProvider(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  connection: EmailConnectionRecord,
  organizationId?: string
): Promise<{ emailsSynced: number; emailsSkipped: number; error?: string }> {
  try {
    const provider = getEmailProvider(connection.provider);

    // For Microsoft: use getValidMicrosoftToken() which handles decryption + refresh + dual-table sync
    if (connection.provider === "microsoft") {
      const tokenResult = await getValidMicrosoftToken(userId);
      if ("error" in tokenResult) {
        return { emailsSynced: 0, emailsSkipped: 0, error: tokenResult.error };
      }
      connection.oauth_access_token = tokenResult.accessToken;
    } else if ((connection.provider === "google") &&
        isTokenExpired(connection.oauth_token_expires_at) &&
        provider.refreshToken) {
      try {
        const tokens = await provider.refreshToken(connection as unknown as EmailConnectionConfig);
        const newExpiresAt = tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : connection.oauth_token_expires_at;
        const newRefreshToken = tokens.refresh_token || connection.oauth_refresh_token;

        const { error: refreshWriteErr } = await adminClient
          .from("email_connections")
          .update({
            oauth_access_token: tokens.access_token,
            oauth_refresh_token: newRefreshToken,
            oauth_token_expires_at: newExpiresAt,
          })
          .eq("id", connection.id);
        if (refreshWriteErr) {
          console.warn(`[sync] Token refresh persist failed for ${connection.id}: ${refreshWriteErr.message}`);
        }

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

    // Persist via the CANONICAL multi-provider writer (connection-sync). The
    // previous inline implementation dedup'd only on outlook_message_id and set
    // outlook_message_id for Gmail/IMAP too — which, after DP-A aligned the cron
    // to insert Gmail/IMAP rows with provider_message_id + outlook_message_id
    // NULL, guaranteed duplicate rows whenever the interactive sync and the cron
    // both ran. dedupAndInsertEmails dedups on BOTH id columns and only mirrors
    // outlook_message_id for Microsoft, so the two paths now agree.
    (connection as { organization_id?: string | null }).organization_id =
      organizationId || connection.organization_id || null;
    // rawEmails is annotated with a narrower inline shape than RawEmail (it omits
    // `attachments`), but the provider returns full RawEmail objects at runtime.
    const synced = await dedupAndInsertEmails(adminClient, connection, rawEmails as unknown as RawEmail[], {
      mirrorOutlookId: connection.provider === "microsoft",
    });
    const skipped = Math.max(0, rawEmails.length - synced);

    // Update connection: last sync + delta link + totals
    const syncAt = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      last_sync_at: syncAt,
      total_emails_synced: (connection.total_emails_synced || 0) + synced,
    };
    if (newDeltaLink) {
      updatePayload.sync_delta_link = newDeltaLink;
    }
    const { error: connUpdateErr } = await (adminClient as any)
      .from("email_connections")
      .update(updatePayload)
      .eq("id", connection.id);
    if (connUpdateErr) {
      console.warn(`[sync] Connection update failed for ${connection.id}: ${connUpdateErr.message}`);
    }

    // Also update legacy last_sync_at on users
    const { error: userSyncErr } = await adminClient
      .from("users")
      .update({ last_sync_at: syncAt })
      .eq("id", userId);
    if (userSyncErr) {
      console.warn(`[sync] users.last_sync_at update failed for ${userId}: ${userSyncErr.message}`);
    }

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
  userId: string,
  organizationId: string | null = null
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
      const { error } = await (adminClient as any).from("email_records").insert(emailData);
      if (error) {
        console.warn(`[sync/legacy] email insert failed: ${error.message}`);
      }
    },

    updateLastSync: async (uid, syncAt) => {
      const { error } = await adminClient
        .from("users")
        .update({ last_sync_at: syncAt })
        .eq("id", uid);
      if (error) console.warn(`[sync/legacy] last_sync_at update failed: ${error.message}`);
    },

    logSync: async (uid, level, message, details) => {
      const { error } = await adminClient.from("app_logs").insert({
        user_id: uid,
        level: level as "info" | "warning" | "error" | "critical",
        source: "outlook_sync",
        message,
        details: details || {},
      });
      if (error) console.warn(`[sync/legacy] app_logs insert failed: ${error.message}`);
    },
  };

  const syncResult = await syncUserEmails(userId, deps, organizationId ?? null);
  return {
    emailsSynced: syncResult.emailsSynced,
    emailsSkipped: syncResult.emailsSkipped,
    error: syncResult.success ? undefined : syncResult.error,
  };
}
