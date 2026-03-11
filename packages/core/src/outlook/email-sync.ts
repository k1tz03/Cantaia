// ============================================================
// Email Sync Service — Sync Outlook emails to Supabase
// ============================================================

import {
  getEmails,
  withRetry,
  GraphTokenExpiredError,
  type GraphEmailMessage,
} from "./graph-client";

export interface SyncDependencies {
  getValidToken: (userId: string) => Promise<{ accessToken?: string; error?: string }>;
  getUserLastSync: (userId: string) => Promise<string | null>;
  emailExists: (userId: string, outlookMessageId: string) => Promise<boolean>;
  insertEmail: (email: EmailInsertData) => Promise<void>;
  updateLastSync: (userId: string, syncAt: string) => Promise<void>;
  logSync: (userId: string, level: string, message: string, details?: Record<string, unknown>) => Promise<void>;
}

export interface EmailInsertData {
  user_id: string;
  outlook_message_id: string;
  subject: string;
  sender_email: string;
  sender_name: string | null;
  recipients: string[];
  received_at: string;
  body_preview: string | null;
  body_html?: string | null;
  body_text?: string | null;
  has_attachments: boolean;
  is_processed: boolean;
}

export interface SyncResult {
  success: boolean;
  emailsSynced: number;
  emailsSkipped: number;
  error?: string;
}

/**
 * Sync a user's Outlook emails to the database.
 * Uses dependency injection to decouple from Supabase client.
 */
export async function syncUserEmails(
  userId: string,
  deps: SyncDependencies
): Promise<SyncResult> {
  // 1. Get valid Microsoft token
  const tokenResult = await deps.getValidToken(userId);
  if (tokenResult.error || !tokenResult.accessToken) {
    await deps.logSync(userId, "error", "Failed to get Microsoft token", {
      error: tokenResult.error,
    });
    return { success: false, emailsSynced: 0, emailsSkipped: 0, error: tokenResult.error };
  }

  const accessToken = tokenResult.accessToken;

  // 2. Determine since date (last sync or 7 days ago)
  const lastSync = await deps.getUserLastSync(userId);
  const sinceDate = lastSync || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 3. Fetch emails from Microsoft Graph
  let emails: GraphEmailMessage[];
  try {
    emails = await withRetry(() => getEmails(accessToken, sinceDate));
  } catch (err) {
    const message = err instanceof GraphTokenExpiredError
      ? "Microsoft token expired during sync"
      : `Failed to fetch emails: ${err instanceof Error ? err.message : "Unknown"}`;
    await deps.logSync(userId, "error", message);
    return { success: false, emailsSynced: 0, emailsSkipped: 0, error: message };
  }

  // 4. Process each email
  let synced = 0;
  let skipped = 0;

  for (const email of emails) {
    try {
      // Check if already in DB
      const exists = await deps.emailExists(userId, email.id);
      if (exists) {
        skipped++;
        continue;
      }

      // Build recipients list
      const recipients = [
        ...(email.toRecipients || []).map((r) => r.emailAddress.address),
        ...(email.ccRecipients || []).map((r) => r.emailAddress.address),
      ];

      // Insert new email — save full body from Graph API
      const bodyHtml = email.body?.contentType === "html" ? email.body.content : null;
      const bodyText = email.body?.contentType === "text" ? email.body.content : null;

      await deps.insertEmail({
        user_id: userId,
        outlook_message_id: email.id,
        subject: email.subject || "(Sans objet)",
        sender_email: email.from?.emailAddress?.address || "",
        sender_name: email.from?.emailAddress?.name || null,
        recipients,
        received_at: email.receivedDateTime,
        body_preview: email.bodyPreview || null,
        body_html: bodyHtml || null,
        body_text: bodyText || null,
        has_attachments: email.hasAttachments || false,
        is_processed: false,
      });

      synced++;
    } catch (err) {
      await deps.logSync(userId, "warning", `Failed to sync email ${email.id}`, {
        error: err instanceof Error ? err.message : "Unknown",
        subject: email.subject,
      });
    }
  }

  // 5. Update last sync timestamp
  const syncAt = new Date().toISOString();
  await deps.updateLastSync(userId, syncAt);

  await deps.logSync(userId, "info", `Email sync completed`, {
    emailsSynced: synced,
    emailsSkipped: skipped,
    totalFetched: emails.length,
  });

  return { success: true, emailsSynced: synced, emailsSkipped: skipped };
}
