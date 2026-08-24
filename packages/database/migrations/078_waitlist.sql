-- Migration 070: Waitlist (launch teaser email capture)
-- Public-facing waitlist for the pre-launch countdown page at /soon.
-- Writes go through the service role (no public INSERT policy).
-- Reads are limited to superadmins via RLS.

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  email_lower TEXT GENERATED ALWAYS AS (LOWER(TRIM(email))) STORED,
  locale TEXT,                         -- 'fr' | 'en' | 'de'
  source TEXT,                         -- 'teaser' | 'linkedin' | etc.
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  confirmed_at TIMESTAMPTZ,            -- reserved for future double opt-in
  notified_at TIMESTAMPTZ,             -- set when launch email is sent
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique on normalized email (case-insensitive, trimmed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_email_lower
  ON waitlist (email_lower);

-- Fast sorting by creation time (for admin dashboard)
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at
  ON waitlist (created_at DESC);

-- Fast filter by source (for analytics)
CREATE INDEX IF NOT EXISTS idx_waitlist_source
  ON waitlist (source) WHERE source IS NOT NULL;

-- RLS: locked down. All writes via service role (admin client).
-- Superadmins can read for analytics.
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can view waitlist"
  ON waitlist FOR SELECT
  USING (
    (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
  );

CREATE POLICY "Superadmins can update waitlist"
  ON waitlist FOR UPDATE
  USING (
    (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
  );

-- Note: no INSERT or DELETE policy — handled only via service role key.
