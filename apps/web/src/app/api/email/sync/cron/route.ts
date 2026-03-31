import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailProvider, isTokenExpired, type EmailConnectionConfig } from "@cantaia/core/emails";

// Allow up to 5 minutes for bulk cron syncs across many connections
export const maxDuration = 300;

/** Chunk size for batch DB inserts (Supabase PostgREST limit) */
const INSERT_BATCH_SIZE = 200;

/**
 * POST /api/email/sync/cron
 * Triggered by Vercel Cron (every 5 minutes) or external cron.
 * Syncs all active email connections + resets expired snoozes.
 * Protected by CRON_SECRET header.
 *
 * Optimized for bulk: batch inserts instead of one-by-one,
 * maxDuration=300 for large mailboxes.
 */
export async function POST(request: NextRequest) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const results: { userId: string; synced: number; error?: string }[] = [];

  // 1. Get all active email connections with sync enabled
  const { data: connections } = await (admin as any)
    .from("email_connections")
    .select("*")
    .eq("status", "active")
    .eq("sync_enabled", true);

  console.log(`[cron/sync] Found ${(connections || []).length} active connections to sync`);

  for (const connection of connections || []) {
    try {
      const provider = getEmailProvider(connection.provider);

      // Refresh token if needed
      if ((connection.provider === "microsoft" || connection.provider === "google") &&
          isTokenExpired(connection.oauth_token_expires_at) &&
          provider.refreshToken) {
        const tokens = await provider.refreshToken(connection as EmailConnectionConfig);
        await (admin as any)
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
      }

      // Use delta query if available, otherwise date-based
      let emailCount = 0;
      if (connection.provider === "microsoft" && provider.fetchEmailsDelta) {
        const { emails, deltaLink } = await provider.fetchEmailsDelta(connection as EmailConnectionConfig);
        emailCount = emails.length;

        // Insert new emails (dedup by provider_message_id) — BATCH INSERT
        if (emails.length > 0) {
          const externalIds = emails.map(e => e.externalId);
          // Query in two safe calls to avoid SQL injection via .or() string interpolation
          const { data: existingByProvider } = await (admin as any)
            .from("email_records")
            .select("provider_message_id, outlook_message_id")
            .eq("user_id", connection.user_id)
            .in("provider_message_id", externalIds);
          const { data: existingByOutlook } = await (admin as any)
            .from("email_records")
            .select("provider_message_id, outlook_message_id")
            .eq("user_id", connection.user_id)
            .in("outlook_message_id", externalIds);
          const existing = [...(existingByProvider || []), ...(existingByOutlook || [])];

          const existingSet = new Set<string>();
          for (const row of existing || []) {
            if (row.provider_message_id) existingSet.add(row.provider_message_id);
            if (row.outlook_message_id) existingSet.add(row.outlook_message_id);
          }

          const newEmails = emails.filter(e => !existingSet.has(e.externalId));

          // Batch insert in chunks of INSERT_BATCH_SIZE instead of one-by-one
          if (newEmails.length > 0) {
            const rows = newEmails.map(raw => ({
              user_id: connection.user_id,
              organization_id: connection.organization_id,
              provider: connection.provider,
              provider_message_id: raw.externalId,
              provider_thread_id: raw.conversationId || null,
              from_email: raw.from || "",
              from_name: raw.fromName || null,
              to_emails: raw.to || [],
              cc_emails: raw.cc || [],
              outlook_message_id: raw.externalId,
              sender_email: raw.from || "",
              sender_name: raw.fromName || null,
              recipients: [...raw.to, ...(raw.cc || [])],
              received_at: raw.date.toISOString(),
              sent_at: raw.date.toISOString(),
              body_preview: raw.bodyText?.substring(0, 500) || null,
              has_attachments: false,
              triage_status: "unprocessed",
              is_processed: false,
              subject: raw.subject || "(Sans objet)",
            }));

            let insertedCount = 0;
            for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
              const chunk = rows.slice(i, i + INSERT_BATCH_SIZE);
              try {
                // upsert with ignoreDuplicates to handle race conditions gracefully
                const { data: inserted } = await (admin as any)
                  .from("email_records")
                  .insert(chunk)
                  .select("id");
                insertedCount += inserted?.length || chunk.length;
              } catch (batchErr) {
                // If batch fails (duplicate constraint), fall back to one-by-one for this chunk
                console.warn(`[cron/sync] Batch insert failed for chunk ${i}–${i + chunk.length}, falling back to individual inserts:`, batchErr);
                for (const row of chunk) {
                  try {
                    await (admin as any).from("email_records").insert(row);
                    insertedCount++;
                  } catch {
                    // Skip duplicates
                  }
                }
              }
            }
            emailCount = insertedCount;
            console.log(`[cron/sync] Inserted ${insertedCount}/${newEmails.length} emails for connection ${connection.id} (batch mode)`);
          } else {
            emailCount = 0;
          }
        }

        // Update delta link
        const updatePayload: Record<string, unknown> = {
          last_sync_at: new Date().toISOString(),
          total_emails_synced: (connection.total_emails_synced || 0) + emailCount,
        };
        if (deltaLink) updatePayload.sync_delta_link = deltaLink;
        await (admin as any).from("email_connections").update(updatePayload).eq("id", connection.id);
      } else {
        // Date-based fallback
        const sinceDate = connection.last_sync_at
          ? new Date(connection.last_sync_at)
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const rawEmails = await provider.fetchEmails(connection as EmailConnectionConfig, sinceDate);
        emailCount = rawEmails.length;

        await (admin as any)
          .from("email_connections")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("id", connection.id);
      }

      results.push({ userId: connection.user_id, synced: emailCount });
    } catch (err) {
      console.error(`[cron/sync] Failed for connection ${connection.id}:`, err);
      results.push({
        userId: connection.user_id,
        synced: 0,
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  // 2. Reset expired snoozes across ALL users
  let snoozesReset = 0;
  try {
    const now = new Date().toISOString();
    const { data: expired } = await (admin as any)
      .from("email_records")
      .update({ triage_status: "unprocessed", snooze_until: null })
      .eq("triage_status", "snoozed")
      .lte("snooze_until", now)
      .select("id");
    snoozesReset = expired?.length || 0;
  } catch (err) {
    console.warn("[cron/sync] Snooze reset failed:", err);
  }

  const totalSynced = results.reduce((sum, r) => sum + r.synced, 0);
  console.log(`[cron/sync] Done: ${results.length} connections synced, ${totalSynced} emails total, ${snoozesReset} snoozes reset`);

  return NextResponse.json({
    success: true,
    connections_synced: results.length,
    total_emails_synced: totalSynced,
    results,
    snoozes_reset: snoozesReset,
  });
}
