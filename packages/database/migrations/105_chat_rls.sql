-- ============================================================
-- Migration 105: RLS on chat_conversations / chat_messages
-- ============================================================
-- Migration 021 created chat_conversations + chat_messages (full AI conversation
-- content, plus attachments added in 060) WITHOUT enabling RLS or any policy, and
-- no later migration fixed it. On Supabase, public-schema tables are reachable
-- with the anon key by default → any client could read/write every org's chat
-- history. The application talks to these tables exclusively through
-- createAdminClient() (service role, bypasses RLS), so enabling RLS with
-- owner-scoped policies closes the hole without changing app behaviour.
--
-- Idempotent: guarded by to_regclass + DROP POLICY IF EXISTS. Safe to re-run.

-- ── chat_conversations : owner-scoped (+ superadmin) ────────────────────────
DO $$
BEGIN
  IF to_regclass('public.chat_conversations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS chat_conversations_owner_all ON chat_conversations';
    EXECUTE $pol$
      CREATE POLICY chat_conversations_owner_all ON chat_conversations
        FOR ALL
        TO authenticated
        USING     (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS chat_conversations_superadmin_all ON chat_conversations';
    EXECUTE $pol$
      CREATE POLICY chat_conversations_superadmin_all ON chat_conversations
        FOR ALL
        USING (
          EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true)
        )
        WITH CHECK (
          EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true)
        )
    $pol$;
  ELSE
    RAISE NOTICE 'chat_conversations not found — skipping (migration 021 not applied)';
  END IF;
END $$;

-- ── chat_messages : via the parent conversation (+ superadmin) ──────────────
DO $$
BEGIN
  IF to_regclass('public.chat_messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS chat_messages_owner_all ON chat_messages';
    EXECUTE $pol$
      CREATE POLICY chat_messages_owner_all ON chat_messages
        FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM chat_conversations c
            WHERE c.id = chat_messages.conversation_id
              AND c.user_id = auth.uid()
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM chat_conversations c
            WHERE c.id = chat_messages.conversation_id
              AND c.user_id = auth.uid()
          )
        )
    $pol$;

    EXECUTE 'DROP POLICY IF EXISTS chat_messages_superadmin_all ON chat_messages';
    EXECUTE $pol$
      CREATE POLICY chat_messages_superadmin_all ON chat_messages
        FOR ALL
        USING (
          EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true)
        )
        WITH CHECK (
          EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true)
        )
    $pol$;
  ELSE
    RAISE NOTICE 'chat_messages not found — skipping (migration 021 not applied)';
  END IF;
END $$;
