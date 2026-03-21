-- Migration 044: Encrypt Microsoft OAuth tokens at rest
-- Adds encrypted token columns and a server-side encryption key reference

-- Add encrypted token columns (the old columns will be migrated then dropped)
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_access_token_enc TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_refresh_token_enc TEXT;

-- Create a function to check if tokens are encrypted
-- (presence of encrypted columns with data = encrypted)
COMMENT ON COLUMN users.microsoft_access_token_enc IS 'AES-256-GCM encrypted Microsoft access token';
COMMENT ON COLUMN users.microsoft_refresh_token_enc IS 'AES-256-GCM encrypted Microsoft refresh token';

-- Note: The actual encryption/decryption happens in the application layer
-- using the MICROSOFT_TOKEN_ENCRYPTION_KEY environment variable.
-- After deploying the code changes:
-- 1. Run the migration to add new columns
-- 2. Deploy the code (reads from enc columns, falls back to old columns)
-- 3. Run a one-time script to encrypt existing tokens
-- 4. Drop old plaintext columns in a future migration
