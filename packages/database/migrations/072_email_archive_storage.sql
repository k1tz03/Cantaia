-- ============================================================
-- Migration 072: Email Archive Storage Enhancement
-- Adds storage columns to email_archives for Supabase Storage integration.
-- Previously archives only tracked local paths (for future Tauri desktop).
-- Now supports web-based storage via Supabase Storage bucket.
-- ============================================================

-- Add storage columns
ALTER TABLE email_archives ADD COLUMN IF NOT EXISTS storage_path TEXT;
-- Full path within the Supabase Storage bucket (e.g., "org-id/project-id/01_Correspondance/2026-04-01_Implenia_Offre.eml")

ALTER TABLE email_archives ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'email-archives';
-- Supabase Storage bucket name

ALTER TABLE email_archives ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT 0;
-- Size in bytes of the stored .eml file

-- Index on storage_path for dedup lookups
CREATE INDEX IF NOT EXISTS idx_archives_storage_path ON email_archives(storage_path);

-- Index on project + status for fast archive queries
CREATE INDEX IF NOT EXISTS idx_archives_project_status ON email_archives(project_id, status);
