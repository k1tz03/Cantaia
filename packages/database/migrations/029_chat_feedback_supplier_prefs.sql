-- Migration 029: Chat feedback + Supplier preferences (C1 — Private)

-- Feedback on chat JM responses (thumbs up/down)
CREATE TABLE IF NOT EXISTS chat_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  message_index INTEGER NOT NULL,
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  comment TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_feedback_org ON chat_feedback(organization_id);
CREATE INDEX IF NOT EXISTS idx_chat_feedback_conv ON chat_feedback(conversation_id);

ALTER TABLE chat_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_chat_feedback" ON chat_feedback FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Internal supplier preferences (preferred/blacklisted)
CREATE TABLE IF NOT EXISTS supplier_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('preferred', 'blacklisted', 'neutral')),
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (organization_id, supplier_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_preferences_org ON supplier_preferences(organization_id);
CREATE INDEX IF NOT EXISTS idx_supplier_preferences_supplier ON supplier_preferences(supplier_id);

ALTER TABLE supplier_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_supplier_preferences" ON supplier_preferences FOR ALL
  USING (organization_id IN (SELECT organization_id FROM users WHERE id = auth.uid()));
