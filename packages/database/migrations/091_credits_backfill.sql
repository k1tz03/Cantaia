-- ============================================================
-- Migration 091: Credits backfill — switch existing orgs to credit metering
-- ============================================================
-- Migration 090 deliberately created NO `credit_balances` rows: an org without
-- a row keeps running on the legacy monthly `aiCalls` quota (see
-- `checkUsageLimit` in packages/config/plan-features.ts). This migration flips
-- every existing organization over to the credit model in one go.
--
-- For each organization that has NO balance row yet:
--   1. signup_bonus       → 300 credits (SIGNUP_BONUS_CREDITS in
--                           packages/config/credit-costs.ts — keep in sync)
--   2. subscription_grant → the plan's monthly allocation, but ONLY for a
--                           paying plan (CREDIT_PLANS.monthly_credits):
--                             starter    →   600
--                             pro        → 2 200
--                             enterprise → 7 000
--                           trial / null / unknown → no subscription grant,
--                           they run on the signup bonus until they subscribe.
--
-- IDEMPOTENT: the driving query only selects orgs with no `credit_balances`
-- row, and `grant_credits` creates that row on its first call. Re-running the
-- migration is therefore a no-op — it will find nothing left to backfill.
--
-- REQUIRES migration 090 (credit_balances / credit_transactions /
-- grant_credits). It aborts with a clear message if 090 has not been applied.

DO $$
DECLARE
  v_org           RECORD;
  v_monthly       INTEGER;
  v_orgs          INTEGER := 0;
  v_subscriptions INTEGER := 0;
BEGIN
  -- ── Guard: migration 090 must be in place ────────────────
  IF to_regclass('public.credit_balances') IS NULL THEN
    RAISE EXCEPTION
      'Migration 091 requires migration 090 (credit_balances is missing). Apply 090_credits.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'grant_credits'
  ) THEN
    RAISE EXCEPTION
      'Migration 091 requires migration 090 (grant_credits() is missing). Apply 090_credits.sql first.';
  END IF;

  -- ── Backfill ─────────────────────────────────────────────
  -- The snapshot is taken up front: grant_credits() inserts the balance row on
  -- the signup bonus, so the NOT EXISTS test must not be re-evaluated between
  -- the two grants of the same organization.
  FOR v_org IN
    SELECT o.id, o.subscription_plan
      FROM organizations o
     WHERE NOT EXISTS (
             SELECT 1
               FROM credit_balances b
              WHERE b.organization_id = o.id
           )
  LOOP
    -- 1. Signup bonus — every organization gets it, paying or not.
    PERFORM * FROM grant_credits(v_org.id, 300, 'signup_bonus', 'backfill_091');
    v_orgs := v_orgs + 1;

    -- 2. Monthly allocation for organizations already on a paying plan, so a
    --    current subscriber is not downgraded to "bonus only" by the switch.
    v_monthly := CASE v_org.subscription_plan
                   WHEN 'starter'    THEN 600
                   WHEN 'pro'        THEN 2200
                   WHEN 'enterprise' THEN 7000
                   ELSE 0
                 END;

    IF v_monthly > 0 THEN
      PERFORM * FROM grant_credits(v_org.id, v_monthly, 'subscription_grant', 'backfill_091');
      v_subscriptions := v_subscriptions + 1;
    END IF;
  END LOOP;

  RAISE NOTICE
    'Migration 091: % organization(s) migrated to credit metering (% of them with a subscription grant).',
    v_orgs, v_subscriptions;
END;
$$;
