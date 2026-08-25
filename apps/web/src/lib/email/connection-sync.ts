// ============================================================
// Cantaia — Connection-level sync (fetch → insert → classify)
//
// Used by the scheduled cron (`/api/email/sync/cron`) and by the Graph webhook
// (`POST /api/outlook/webhook`) so a real-time notification triggers exactly
// the same work as the nightly pass.
//
// D-FIX3: before this, the cron only INSERTED emails. Classification lived
// solely in the interactive `/api/outlook/sync` route, so users who relied on
// the schedule found an untriaged inbox every morning.
// ============================================================

import type { createAdminClient } from "@/lib/supabase/admin";
import {
  getEmailProvider,
  isTokenExpired,
  type EmailConnectionConfig,
  type RawEmail,
} from "@cantaia/core/emails";
import { getValidMicrosoftToken } from "@/lib/microsoft/tokens";
import {
  buildClassificationContext,
  classifyPendingEmails,
  type EmailConnectionRecord,
} from "@/lib/email/classification-pipeline";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Chunk size for batch DB inserts (Supabase PostgREST limit) */
const INSERT_BATCH_SIZE = 200;

export interface ConnectionSyncResult {
  userId: string;
  connectionId: string;
  synced: number;
  classified: number;
  tasksCreated: number;
  archived: number;
  plansSaved: number;
  quotesExtracted: number;
  timedOut: boolean;
  aiSkipped: boolean;
  error?: string;
}

function emptyResult(connection: { id: string; user_id: string }): ConnectionSyncResult {
  return {
    userId: connection.user_id,
    connectionId: connection.id,
    synced: 0,
    classified: 0,
    tasksCreated: 0,
    archived: 0,
    plansSaved: 0,
    quotesExtracted: 0,
    timedOut: false,
    aiSkipped: false,
  };
}

/**
 * Dedup against email_records, then batch-insert the new emails of one
 * connection. Shared by the Microsoft delta path and the Gmail/IMAP
 * date-based path (which, before the 08/2026 audit, fetched and COUNTED its
 * emails but never inserted a single row — Gmail/IMAP mailboxes reported
 * "synced" while `email_records` stayed empty and nothing was ever
 * classified).
 *
 * Every row is user- and organization-scoped from the connection itself.
 * Returns the number of rows actually inserted.
 */
export async function dedupAndInsertEmails(
  admin: AdminClient,
  connection: any,
  emails: RawEmail[],
  opts: { mirrorOutlookId: boolean }
): Promise<number> {
  if (emails.length === 0) return 0;

  const externalIds = emails.map((e) => e.externalId);
  // Two safe `.in()` calls — never interpolate external ids into `.or()`.
  const { data: existingByProvider, error: provErr } = await (admin as any)
    .from("email_records")
    .select("provider_message_id, outlook_message_id")
    .eq("user_id", connection.user_id)
    .in("provider_message_id", externalIds);
  if (provErr) console.warn(`[connection-sync] dedup(provider) failed: ${provErr.message}`);

  const { data: existingByOutlook, error: outlookErr } = await (admin as any)
    .from("email_records")
    .select("provider_message_id, outlook_message_id")
    .eq("user_id", connection.user_id)
    .in("outlook_message_id", externalIds);
  if (outlookErr) console.warn(`[connection-sync] dedup(outlook) failed: ${outlookErr.message}`);

  const existingSet = new Set<string>();
  for (const row of [...(existingByProvider || []), ...(existingByOutlook || [])]) {
    if (row.provider_message_id) existingSet.add(row.provider_message_id);
    if (row.outlook_message_id) existingSet.add(row.outlook_message_id);
  }

  const newEmails = emails.filter((e) => !existingSet.has(e.externalId));
  if (newEmails.length === 0) return 0;

  const rows = newEmails.map((raw) => ({
    user_id: connection.user_id,
    organization_id: connection.organization_id,
    provider: connection.provider,
    provider_message_id: raw.externalId,
    provider_thread_id: raw.conversationId || null,
    from_email: raw.from || "",
    from_name: raw.fromName || null,
    to_emails: raw.to || [],
    cc_emails: raw.cc || [],
    // Legacy Outlook mirror columns — only meaningful for Microsoft mail.
    outlook_message_id: opts.mirrorOutlookId ? raw.externalId : null,
    sender_email: raw.from || "",
    sender_name: raw.fromName || null,
    recipients: [...raw.to, ...(raw.cc || [])],
    received_at: raw.date.toISOString(),
    sent_at: raw.date.toISOString(),
    body_preview: raw.bodyText?.substring(0, 500) || null,
    body_text: raw.bodyText || null,
    body_html: raw.bodyHtml || null,
    has_attachments: raw.hasAttachments || false,
    triage_status: "unprocessed",
    is_processed: false,
    subject: raw.subject || "(Sans objet)",
  }));

  let insertedCount = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const chunk = rows.slice(i, i + INSERT_BATCH_SIZE);
    // supabase-js resolves with `{ error }` — it does not throw, so the
    // fallback must branch on `error`, not sit in a catch block.
    const { data: inserted, error: batchErr } = await (admin as any)
      .from("email_records")
      .insert(chunk)
      .select("id");
    if (!batchErr) {
      insertedCount += inserted?.length || chunk.length;
      continue;
    }
    console.warn(
      `[connection-sync] batch insert failed for chunk ${i}–${i + chunk.length} (${batchErr.message}) — retrying individually`
    );
    for (const row of chunk) {
      const { error: rowErr } = await (admin as any).from("email_records").insert(row);
      if (!rowErr) insertedCount++;
    }
  }
  return insertedCount;
}

/**
 * Fetch new mail for one connection, persist it, then run the SHARED
 * classification cascade over everything still pending for that user.
 *
 * Never throws — a failing connection must not abort a multi-tenant sweep.
 */
export async function syncAndClassifyConnection(
  admin: AdminClient,
  connection: any,
  opts: { deadlineAt?: number; classify?: boolean; classifyLimit?: number } = {}
): Promise<ConnectionSyncResult> {
  const result = emptyResult(connection);
  const classify = opts.classify !== false;

  try {
    const provider = getEmailProvider(connection.provider);

    // ── Token refresh ──
    if (connection.provider === "microsoft") {
      const tokenResult = await getValidMicrosoftToken(connection.user_id);
      if ("error" in tokenResult) {
        result.error = tokenResult.error;
        return result;
      }
      connection.oauth_access_token = tokenResult.accessToken;
    } else if (
      connection.provider === "google" &&
      isTokenExpired(connection.oauth_token_expires_at) &&
      provider.refreshToken
    ) {
      const tokens = await provider.refreshToken(connection as EmailConnectionConfig);
      const { error: refreshErr } = await (admin as any)
        .from("email_connections")
        .update({
          oauth_access_token: tokens.access_token,
          oauth_refresh_token: tokens.refresh_token || connection.oauth_refresh_token,
          oauth_token_expires_at: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : connection.oauth_token_expires_at,
        })
        .eq("id", connection.id);
      if (refreshErr) {
        console.warn(`[connection-sync] token persist failed for ${connection.id}: ${refreshErr.message}`);
      }
      connection.oauth_access_token = tokens.access_token;
      if (tokens.refresh_token) connection.oauth_refresh_token = tokens.refresh_token;
    }

    // ── Fetch ──
    if (connection.provider === "microsoft" && provider.fetchEmailsDelta) {
      const { emails, deltaLink } = await provider.fetchEmailsDelta(connection as EmailConnectionConfig);

      result.synced = await dedupAndInsertEmails(admin, connection, emails, {
        mirrorOutlookId: true,
      });

      const updatePayload: Record<string, unknown> = {
        last_sync_at: new Date().toISOString(),
        total_emails_synced: (connection.total_emails_synced || 0) + result.synced,
      };
      if (deltaLink) updatePayload.sync_delta_link = deltaLink;
      const { error: connErr } = await (admin as any)
        .from("email_connections")
        .update(updatePayload)
        .eq("id", connection.id);
      if (connErr) console.warn(`[connection-sync] connection update failed: ${connErr.message}`);
    } else {
      // Date-based fallback (Gmail / IMAP).
      // AUDIT 08/2026 — this branch used to fetch and set `result.synced` but
      // never INSERTED anything: see dedupAndInsertEmails. It now persists the
      // fetched emails so the classification cascade below has rows to triage.
      const sinceDate = connection.last_sync_at
        ? new Date(connection.last_sync_at)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const rawEmails = await provider.fetchEmails(connection as EmailConnectionConfig, sinceDate);

      result.synced = await dedupAndInsertEmails(admin, connection, rawEmails, {
        mirrorOutlookId: false,
      });

      const { error: connErr } = await (admin as any)
        .from("email_connections")
        .update({
          last_sync_at: new Date().toISOString(),
          total_emails_synced: (connection.total_emails_synced || 0) + result.synced,
        })
        .eq("id", connection.id);
      if (connErr) console.warn(`[connection-sync] connection update failed: ${connErr.message}`);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : "Unknown";
    console.error(`[connection-sync] fetch failed for connection ${connection.id}:`, err);
    // Still fall through to classification: emails inserted by a previous pass
    // deserve to be triaged even when this fetch failed.
  }

  // ── Classify ──
  if (classify) {
    try {
      if (opts.deadlineAt && Date.now() > opts.deadlineAt) {
        result.timedOut = true;
        return result;
      }
      const ctx = await buildClassificationContext(admin, connection.user_id, {
        organizationId: connection.organization_id ?? null,
        connection: connection as EmailConnectionRecord,
        deadlineAt: opts.deadlineAt,
        limit: opts.classifyLimit ?? 100,
      });
      const stats = await classifyPendingEmails(ctx);
      result.classified = stats.emailsClassified;
      result.tasksCreated = stats.tasksCreated;
      result.archived = stats.emailsArchived;
      result.plansSaved = stats.plansSaved;
      result.quotesExtracted = stats.quotesExtracted;
      result.timedOut = stats.timedOut;
      result.aiSkipped = stats.aiClassificationSkipped;
    } catch (classifyErr) {
      console.error(`[connection-sync] classification failed for ${connection.user_id}:`, classifyErr);
      result.error = result.error || (classifyErr instanceof Error ? classifyErr.message : "classification failed");
    }
  }

  return result;
}

/**
 * Load the exact connection a Graph notification targets, by its
 * webhook_subscription_id. Preferred over loadActiveConnection for the webhook
 * mini-sync: a user who has since added a newer Gmail/IMAP connection must NOT
 * have their Outlook notification sync the wrong mailbox.
 */
export async function loadConnectionBySubscriptionId(
  admin: AdminClient,
  subscriptionId: string
): Promise<any | null> {
  const { data, error } = await (admin as any)
    .from("email_connections")
    .select("*")
    .eq("webhook_subscription_id", subscriptionId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    console.warn(`[connection-sync] connection lookup by subscription ${subscriptionId} failed: ${error.message}`);
    return null;
  }
  return data;
}

/** Load the newest active connection for one user (webhook targeted sync). */
export async function loadActiveConnection(admin: AdminClient, userId: string): Promise<any | null> {
  const { data, error } = await (admin as any)
    .from("email_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn(`[connection-sync] connection lookup failed for ${userId}: ${error.message}`);
    return null;
  }
  return data;
}
