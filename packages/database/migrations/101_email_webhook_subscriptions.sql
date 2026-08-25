-- ============================================================
-- Migration 101: Microsoft Graph webhook subscription state
--
-- Real-time mail was dead by construction: `POST /api/outlook/webhook`
-- resolved the notifying user with
--
--     .eq("webhook_subscription_id", notification.subscriptionId)
--
-- and `ensureOutlookWebhook()` / the renewal cron read
-- `webhook_expiration` — but NEITHER COLUMN EXISTED in any migration.
-- Every one of those queries returned a PostgREST 400 ("column does not
-- exist") which the callers swallow as a non-fatal warning, so the whole
-- webhook path silently no-op'd: notifications were rejected, no
-- subscription was ever created, and nothing said so.
--
-- Graph mail subscriptions also expire after ~4230 minutes (< 3 days), so
-- the state has to be persisted somewhere for the renewal sweep
-- (`/api/cron/renew-webhooks`, suggested schedule `0 */12 * * *`) to know
-- what is due.
--
-- `users.outlook_needs_sync` is added for the same reason: the webhook
-- handler flags it and the legacy sync path reads it.
-- ============================================================

-- ── email_connections: subscription bookkeeping ──────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'email_connections'
  ) THEN

    ALTER TABLE email_connections
      -- Graph subscription id returned by POST /subscriptions
      ADD COLUMN IF NOT EXISTS webhook_subscription_id TEXT,
      -- Graph-reported expiry; the cron renews anything under 24 h away
      ADD COLUMN IF NOT EXISTS webhook_expiration      TIMESTAMPTZ;

    -- The webhook handler looks a connection up BY subscription id on every
    -- notification: without this index that is a full scan per notification.
    -- Partial + UNIQUE: a Graph subscription id maps to exactly one
    -- connection, and the many NULL rows (google/imap, or microsoft before
    -- the first subscription) stay out of the index entirely.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_conn_webhook_sub
      ON email_connections (webhook_subscription_id)
      WHERE webhook_subscription_id IS NOT NULL;

    -- Renewal sweep: "active microsoft connections expiring soon".
    CREATE INDEX IF NOT EXISTS idx_email_conn_webhook_exp
      ON email_connections (webhook_expiration)
      WHERE webhook_expiration IS NOT NULL;

  END IF;
END $$;

-- ── users: flag set by a notification, cleared by the sync ────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS outlook_needs_sync BOOLEAN NOT NULL DEFAULT false;

  END IF;
END $$;
