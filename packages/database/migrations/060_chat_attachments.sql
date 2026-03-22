-- Migration 060: Chat file attachments
-- Adds attachments JSONB column to chat_messages for file uploads
-- Format: [{ file_url, file_name, file_size, file_type, extracted_text? }]

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
