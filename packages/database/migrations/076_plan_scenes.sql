-- ============================================================
-- CANTAIA — Migration 076: Plan Scenes (3D Viewer Phase 1 — ADR-001)
-- ============================================================
-- Stores the BuildingScene IR (v1.0.0) produced by Passe 5 of the plan
-- estimation pipeline, plus the user correction log and the disclaimer
-- acceptance ledger required for Swiss SIA liability positioning.
--
-- Tables:
--   * plan_scenes              — one row per extraction (lineage via parent_scene_id)
--   * plan_scene_corrections   — append-only user corrections on scene elements
--   * ai_disclaimer_acceptance — audit trail of "visualisation non contractuelle" acceptance
--
-- All three tables have RLS enabled with the canonical org-scoped pattern:
--   organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
-- ============================================================

-- ------------------------------------------------------------
-- 1) plan_scenes
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plan_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership & targeting
  plan_id UUID NOT NULL REFERENCES plan_registry(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Lineage: re-extractions and schema migrations chain through parent_scene_id
  parent_scene_id UUID REFERENCES plan_scenes(id) ON DELETE SET NULL,

  -- BuildingScene IR payload
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  scene_data JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Extraction lifecycle
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,

  -- Quality metrics
  confidence_score NUMERIC(4,3) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  model_divergence NUMERIC(4,3) CHECK (model_divergence IS NULL OR (model_divergence >= 0 AND model_divergence <= 1)),

  -- Audit
  extracted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  extracted_at TIMESTAMPTZ,

  -- Cost tracking (for ops dashboards; trackApiUsage remains the source of truth)
  tokens_used INTEGER,
  cost_chf NUMERIC(10,4),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plan_scenes_plan
  ON plan_scenes (plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_scenes_org
  ON plan_scenes (organization_id);
CREATE INDEX IF NOT EXISTS idx_plan_scenes_status
  ON plan_scenes (extraction_status);
CREATE INDEX IF NOT EXISTS idx_plan_scenes_parent
  ON plan_scenes (parent_scene_id);
-- GIN on scene_data for future JSONB queries (element lookups, provenance filters)
CREATE INDEX IF NOT EXISTS idx_plan_scenes_data_gin
  ON plan_scenes USING GIN (scene_data jsonb_path_ops);

-- Keep updated_at fresh on UPDATE
CREATE OR REPLACE FUNCTION trg_plan_scenes_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plan_scenes_updated_at ON plan_scenes;
CREATE TRIGGER trg_plan_scenes_updated_at
  BEFORE UPDATE ON plan_scenes
  FOR EACH ROW
  EXECUTE FUNCTION trg_plan_scenes_touch_updated_at();

-- ------------------------------------------------------------
-- 2) plan_scene_corrections
-- ------------------------------------------------------------
-- Append-only log. UI renders the latest correction per (scene_id, element_id).

CREATE TABLE IF NOT EXISTS plan_scene_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  scene_id UUID NOT NULL REFERENCES plan_scenes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Targets a BuildingElement.id inside scene_data. Plain TEXT (not FK) because
  -- elements live inside JSONB; integrity is enforced by the API layer.
  element_id TEXT NOT NULL,

  correction_type TEXT NOT NULL
    CHECK (correction_type IN ('geometry', 'material', 'opening_type', 'level_assignment', 'delete', 'add')),

  -- Original element snapshot (nullable for 'add'). Corrected value is required.
  original_value JSONB,
  corrected_value JSONB NOT NULL,

  -- Freeform user note
  notes TEXT,

  corrected_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scene_corrections_scene
  ON plan_scene_corrections (scene_id);
CREATE INDEX IF NOT EXISTS idx_scene_corrections_org
  ON plan_scene_corrections (organization_id);
CREATE INDEX IF NOT EXISTS idx_scene_corrections_scene_element
  ON plan_scene_corrections (scene_id, element_id);

-- ------------------------------------------------------------
-- 3) ai_disclaimer_acceptance
-- ------------------------------------------------------------
-- Records when a user accepts the "visualisation indicative — non contractuelle"
-- disclaimer for a given feature. SIA liability shield (see acceptance-criteria.md).
-- Scoped per-user rather than per-org because acceptance is personal.

CREATE TABLE IF NOT EXISTS ai_disclaimer_acceptance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Feature key. 'visualization3d' for the 3D viewer; reserved for future features.
  feature TEXT NOT NULL,

  -- Optional: scoping an acceptance to a specific scene (per-scene gate).
  scene_id UUID REFERENCES plan_scenes(id) ON DELETE CASCADE,

  -- Versioned disclaimer copy (so we can detect stale acceptances after a
  -- legal update and force re-acceptance).
  disclaimer_version TEXT NOT NULL,

  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_disclaimer_acceptance_user_feature
  ON ai_disclaimer_acceptance (user_id, feature);
CREATE INDEX IF NOT EXISTS idx_disclaimer_acceptance_scene
  ON ai_disclaimer_acceptance (scene_id) WHERE scene_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4) RLS
-- ------------------------------------------------------------

ALTER TABLE plan_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_scene_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_disclaimer_acceptance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage plan scenes in their org" ON plan_scenes;
CREATE POLICY "Users can manage plan scenes in their org" ON plan_scenes
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage plan scene corrections in their org" ON plan_scene_corrections;
CREATE POLICY "Users can manage plan scene corrections in their org" ON plan_scene_corrections
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );

-- Per-user acceptance. Users see only their own rows; superadmins bypass via service role.
DROP POLICY IF EXISTS "Users can manage their own disclaimer acceptance" ON ai_disclaimer_acceptance;
CREATE POLICY "Users can manage their own disclaimer acceptance" ON ai_disclaimer_acceptance
  FOR ALL USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 5) Convenience view: latest scene per plan
-- ------------------------------------------------------------
-- Used by GET /api/plans/[id]/scene. Returns the most recent completed scene
-- (fallback to most recent of any status if none are completed).

CREATE OR REPLACE VIEW plan_scenes_latest AS
SELECT DISTINCT ON (plan_id)
  id,
  plan_id,
  organization_id,
  parent_scene_id,
  schema_version,
  scene_data,
  extraction_status,
  error_message,
  confidence_score,
  model_divergence,
  extracted_by,
  extracted_at,
  tokens_used,
  cost_chf,
  created_at,
  updated_at
FROM plan_scenes
ORDER BY
  plan_id,
  CASE extraction_status WHEN 'completed' THEN 0 ELSE 1 END,
  created_at DESC;

COMMENT ON TABLE plan_scenes IS
  '3D viewer Phase 1 (ADR-001). One row per BuildingScene IR extraction. Lineage via parent_scene_id.';
COMMENT ON TABLE plan_scene_corrections IS
  'Append-only user corrections on BuildingScene elements. UI renders latest per (scene_id, element_id).';
COMMENT ON TABLE ai_disclaimer_acceptance IS
  'SIA liability ledger: records acceptance of the "visualisation non contractuelle" disclaimer per user/feature.';
