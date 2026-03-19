-- Migration 056: Add Stripe plan management columns to organizations
-- Required for: Stripe webhook handlers, subscription lifecycle tracking

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'active';
-- Values: active, past_due, canceled, trialing

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_period_end TIMESTAMPTZ;
-- End of current billing period (for cancel_at_period_end)

COMMENT ON COLUMN organizations.plan_status IS 'Stripe subscription status: active, past_due, canceled, trialing';
COMMENT ON COLUMN organizations.plan_period_end IS 'End of current Stripe billing period';
