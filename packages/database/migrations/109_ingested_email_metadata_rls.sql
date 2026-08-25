-- ============================================================
-- Migration 109: RLS on ingested_email_metadata
-- ============================================================
-- 046 created ingested_email_metadata (org_id, historical email senders, subjects
-- and keywords) without RLS or any policy. 081 fixed the sibling ingestion tables
-- from 045/047 (ingested_offer_lines / ingested_plan_quantities /
-- ingested_plan_ratios) but not this one — so it stays cross-tenant readable and
-- writable with the anon key. Apply the same org-scoped isolation.
--
-- The materialized view mv_email_classification_rules (046) is owned by its
-- creator and does not honour RLS, so its refresh is unaffected.
--
-- Also (re)declares the four secondary indexes from 046 with IF NOT EXISTS —
-- 046 created them non-idempotently (idx_email_meta_domain/project/org/date),
-- which aborts a clean replay of 046. Declaring them here makes the schema
-- converge on re-run; on a DB where 046 already ran these are no-ops.
--
-- Idempotent: to_regclass guard + DROP POLICY IF EXISTS.

DO $$
BEGIN
  IF to_regclass('public.ingested_email_metadata') IS NULL THEN
    RAISE NOTICE 'ingested_email_metadata not found — skipping (migration 046 not applied)';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE ingested_email_metadata ENABLE ROW LEVEL SECURITY';

  EXECUTE 'DROP POLICY IF EXISTS "ingested_email_metadata_org_isolation" ON ingested_email_metadata';
  EXECUTE $pol$
    CREATE POLICY "ingested_email_metadata_org_isolation" ON ingested_email_metadata
      FOR ALL
      USING     (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()))
      WITH CHECK (org_id = (SELECT organization_id FROM users WHERE id = auth.uid()))
  $pol$;

  EXECUTE 'DROP POLICY IF EXISTS "ingested_email_metadata_superadmin_all" ON ingested_email_metadata';
  EXECUTE $pol$
    CREATE POLICY "ingested_email_metadata_superadmin_all" ON ingested_email_metadata
      FOR ALL
      USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true))
      WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.is_superadmin = true))
  $pol$;
END $$;

-- Idempotent (re)declaration of 046's non-idempotent indexes.
CREATE INDEX IF NOT EXISTS idx_email_meta_domain  ON ingested_email_metadata(from_domain);
CREATE INDEX IF NOT EXISTS idx_email_meta_project ON ingested_email_metadata(detected_project);
CREATE INDEX IF NOT EXISTS idx_email_meta_org     ON ingested_email_metadata(org_id);
CREATE INDEX IF NOT EXISTS idx_email_meta_date    ON ingested_email_metadata(date_sent);
