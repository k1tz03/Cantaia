-- ============================================================
-- Migration 090: Credit system (balances, ledger, RPCs)
-- ============================================================
-- Replaces the per-plan `aiCalls` monthly quota with a credit meter shared by
-- pay-as-you-go orgs (credit packs) and subscribers (monthly allocation).
--
-- Consumption order: subscription credits first (they expire with the cycle),
-- then purchased credits (12 months validity).
--
-- Server integration:
--   packages/config/credit-costs.ts   → CREDIT_COSTS / CREDIT_PACKS / CREDIT_PLANS
--   packages/config/plan-features.ts  → checkUsageLimit() calls consume_credits
--   apps/web/src/lib/credits.ts       → getCreditBalance / consumeCredits / grantCredits
--
-- Both RPCs are SECURITY DEFINER and revoked from anon/authenticated: they are
-- only ever called with the service role (API routes / webhooks).

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS credit_balances (
  organization_id       UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- Granted by the subscription, reset/topped-up on every paid invoice.
  subscription_credits  INTEGER NOT NULL DEFAULT 0 CHECK (subscription_credits >= 0),
  -- Bought as packs (or granted as signup bonus / manual adjustment).
  purchased_credits     INTEGER NOT NULL DEFAULT 0 CHECK (purchased_credits >= 0),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE credit_balances IS
  'Migration 090. One row per organization. The PRESENCE of a row is what switches an org from the legacy aiCalls quota to credit metering (see checkUsageLimit).';

CREATE TABLE IF NOT EXISTS credit_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Signed: negative for consumption / expiry, positive for grants.
  amount           INTEGER NOT NULL,
  -- Total balance (subscription + purchased) right after this movement.
  balance_after    INTEGER NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN (
                     'signup_bonus',
                     'purchase',
                     'subscription_grant',
                     'subscription_expiry',
                     'consumption',
                     'refund',
                     'admin_adjust'
                   )),
  -- api_usage_logs.action_type for consumption rows, NULL otherwise.
  action_type      TEXT,
  -- Stripe session/invoice id, route name, or free-form note.
  reference        TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE credit_transactions IS
  'Migration 090. Append-only credit ledger. Never updated or deleted — corrections are new admin_adjust rows.';

CREATE INDEX IF NOT EXISTS idx_credit_transactions_org_created
  ON credit_transactions (organization_id, created_at DESC);

-- ------------------------------------------------------------
-- RLS — read-only for members, writes reserved to the service role
-- ------------------------------------------------------------

ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_balances_select ON credit_balances;
CREATE POLICY credit_balances_select ON credit_balances
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
  );

DROP POLICY IF EXISTS credit_transactions_select ON credit_transactions;
CREATE POLICY credit_transactions_select ON credit_transactions
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
    OR (SELECT is_superadmin FROM users WHERE id = auth.uid()) = true
  );

-- No INSERT/UPDATE/DELETE policies on purpose: only the service role (which
-- bypasses RLS) may move credits, through the two RPCs below.

-- ------------------------------------------------------------
-- RPC consume_credits — atomic debit
-- ------------------------------------------------------------
-- Locks the balance row (FOR UPDATE) so two concurrent AI calls can never
-- overdraw. Returns success=false and changes NOTHING when the balance is
-- insufficient (no negative balances, no partial debits).

CREATE OR REPLACE FUNCTION consume_credits(
  p_org       UUID,
  p_amount    INTEGER,
  p_action    TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL
)
RETURNS TABLE (success BOOLEAN, remaining_subscription INTEGER, remaining_purchased INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub      INTEGER;
  v_pur      INTEGER;
  v_from_sub INTEGER;
  v_from_pur INTEGER;
  v_new_sub  INTEGER;
  v_new_pur  INTEGER;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'consume_credits: p_org is required';
  END IF;

  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'consume_credits: p_amount must be >= 0 (got %)', p_amount;
  END IF;

  -- Make sure a row exists so FOR UPDATE has something to lock.
  INSERT INTO credit_balances (organization_id)
  VALUES (p_org)
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT cb.subscription_credits, cb.purchased_credits
    INTO v_sub, v_pur
    FROM credit_balances cb
   WHERE cb.organization_id = p_org
     FOR UPDATE;

  -- Free action (CREDIT_COSTS = 0): nothing to debit, no ledger noise.
  IF p_amount = 0 THEN
    RETURN QUERY SELECT TRUE, v_sub, v_pur;
    RETURN;
  END IF;

  IF (v_sub + v_pur) < p_amount THEN
    RETURN QUERY SELECT FALSE, v_sub, v_pur;
    RETURN;
  END IF;

  -- Subscription credits first (they expire), then purchased credits.
  v_from_sub := LEAST(v_sub, p_amount);
  v_from_pur := p_amount - v_from_sub;
  v_new_sub  := v_sub - v_from_sub;
  v_new_pur  := v_pur - v_from_pur;

  UPDATE credit_balances
     SET subscription_credits = v_new_sub,
         purchased_credits    = v_new_pur,
         updated_at           = now()
   WHERE organization_id = p_org;

  INSERT INTO credit_transactions
    (organization_id, amount, balance_after, kind, action_type, reference)
  VALUES
    (p_org, -p_amount, v_new_sub + v_new_pur, 'consumption', p_action, p_reference);

  RETURN QUERY SELECT TRUE, v_new_sub, v_new_pur;
END;
$$;

COMMENT ON FUNCTION consume_credits(UUID, INTEGER, TEXT, TEXT) IS
  'Migration 090. Atomically debits credits (subscription first, then purchased). Returns success=false without side effects when the balance is insufficient.';

REVOKE ALL ON FUNCTION consume_credits(UUID, INTEGER, TEXT, TEXT) FROM anon, authenticated;

-- ------------------------------------------------------------
-- RPC grant_credits — atomic credit
-- ------------------------------------------------------------
-- kind = 'subscription_grant'  → monthly allocation, carry-over capped at
--                                2x the allocation (spec: max 1 month rollover)
-- kind = 'subscription_expiry' → deducts from subscription_credits only
-- any other kind               → moves purchased_credits (p_amount may be
--                                negative for admin_adjust / clawbacks)
--
-- p_created_by is optional and only used for the audit trail (admin_adjust).

CREATE OR REPLACE FUNCTION grant_credits(
  p_org        UUID,
  p_amount     INTEGER,
  p_kind       TEXT,
  p_reference  TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
-- NOTE: the OUT column names are prefixed `new_` on purpose — PL/pgSQL would
-- otherwise treat `subscription_credits` / `purchased_credits` as ambiguous
-- between the OUT variable and the credit_balances columns.
RETURNS TABLE (new_subscription_credits INTEGER, new_purchased_credits INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub     INTEGER;
  v_pur     INTEGER;
  v_new_sub INTEGER;
  v_new_pur INTEGER;
  v_deduct  INTEGER;
  v_taken   INTEGER;
BEGIN
  IF p_org IS NULL THEN
    RAISE EXCEPTION 'grant_credits: p_org is required';
  END IF;

  IF p_amount IS NULL THEN
    RAISE EXCEPTION 'grant_credits: p_amount is required';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN (
    'signup_bonus', 'purchase', 'subscription_grant', 'subscription_expiry',
    'consumption', 'refund', 'admin_adjust'
  ) THEN
    RAISE EXCEPTION 'grant_credits: invalid kind %', p_kind;
  END IF;

  INSERT INTO credit_balances (organization_id)
  VALUES (p_org)
  ON CONFLICT (organization_id) DO NOTHING;

  SELECT cb.subscription_credits, cb.purchased_credits
    INTO v_sub, v_pur
    FROM credit_balances cb
   WHERE cb.organization_id = p_org
     FOR UPDATE;

  -- No-op guard: a 0 grant (or a non-positive monthly allocation) must never
  -- wipe an existing balance nor write an empty ledger row.
  IF p_amount = 0 OR (p_kind = 'subscription_grant' AND p_amount <= 0) THEN
    RETURN QUERY SELECT v_sub, v_pur;
    RETURN;
  END IF;

  IF p_kind = 'subscription_grant' THEN
    -- Top-up with a 1-month carry-over cap.
    v_new_sub := LEAST(v_sub + p_amount, 2 * p_amount);
    v_new_pur := v_pur;

  ELSIF p_kind = 'subscription_expiry' THEN
    -- Expiry only ever touches subscription credits.
    v_deduct  := ABS(p_amount);
    v_new_sub := GREATEST(0, v_sub - v_deduct);
    v_new_pur := v_pur;

  ELSIF p_amount > 0 THEN
    v_new_sub := v_sub;
    v_new_pur := v_pur + p_amount;

  ELSE
    -- Negative adjustment: take from purchased first, then subscription.
    v_deduct  := ABS(p_amount);
    v_taken   := LEAST(v_pur, v_deduct);
    v_new_pur := v_pur - v_taken;
    v_new_sub := GREATEST(0, v_sub - (v_deduct - v_taken));
  END IF;

  UPDATE credit_balances
     SET subscription_credits = v_new_sub,
         purchased_credits    = v_new_pur,
         updated_at           = now()
   WHERE organization_id = p_org;

  INSERT INTO credit_transactions
    (organization_id, amount, balance_after, kind, action_type, reference, created_by)
  VALUES
    (
      p_org,
      -- Ledger records the REAL movement, not the requested amount
      -- (subscription_grant is capped, negative adjustments are floored at 0).
      (v_new_sub + v_new_pur) - (v_sub + v_pur),
      v_new_sub + v_new_pur,
      p_kind,
      NULL,
      p_reference,
      p_created_by
    );

  RETURN QUERY SELECT v_new_sub, v_new_pur;
END;
$$;

COMMENT ON FUNCTION grant_credits(UUID, INTEGER, TEXT, TEXT, UUID) IS
  'Migration 090. Atomically credits an organization. subscription_grant caps the carry-over at 2x the monthly allocation; other kinds move purchased_credits.';

REVOKE ALL ON FUNCTION grant_credits(UUID, INTEGER, TEXT, TEXT, UUID) FROM anon, authenticated;

-- ------------------------------------------------------------
-- Backfill → migration 091
-- ------------------------------------------------------------
-- This migration intentionally creates NO balance rows: an organization
-- WITHOUT a `credit_balances` row keeps running on the legacy monthly quota
-- (see checkUsageLimit in packages/config/plan-features.ts). Creating a row
-- switches that org to credit metering IMMEDIATELY.
--
-- The switch-over lives in `091_credits_backfill.sql`, which grants the
-- signup bonus (300) plus the plan's monthly allocation to every organization
-- that has no balance yet. Apply 090 then 091.
