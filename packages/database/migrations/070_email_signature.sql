-- Migration 070: Add email_signature to users
-- Stores the user's persistent email signature (HTML text)

ALTER TABLE users ADD COLUMN IF NOT EXISTS email_signature TEXT DEFAULT '';
