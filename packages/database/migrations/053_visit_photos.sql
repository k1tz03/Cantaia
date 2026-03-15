-- Migration 053: Visit Photos & Handwritten Notes Analysis
-- Adds photo capture and AI handwriting recognition to client visits

-- ── Table: visit_photos ──
CREATE TABLE IF NOT EXISTS visit_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id UUID NOT NULL REFERENCES client_visits(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  photo_type TEXT NOT NULL DEFAULT 'site' CHECK (photo_type IN ('site', 'handwritten_notes')),
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  sort_order INTEGER DEFAULT 0,
  caption TEXT,
  location_description TEXT,
  -- AI analysis fields (for handwritten_notes type)
  ai_transcription TEXT,
  ai_sketch_description TEXT,
  ai_analysis_status TEXT DEFAULT 'pending' CHECK (ai_analysis_status IN ('pending', 'processing', 'completed', 'failed')),
  ai_confidence REAL,
  ai_analysis_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_visit_photos_visit_id ON visit_photos(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_photos_org_id ON visit_photos(organization_id);
CREATE INDEX IF NOT EXISTS idx_visit_photos_type ON visit_photos(photo_type);

-- RLS
ALTER TABLE visit_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visit_photos_org_access" ON visit_photos
  FOR ALL
  USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "visit_photos_service_role" ON visit_photos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Add columns to client_visits ──
ALTER TABLE client_visits ADD COLUMN IF NOT EXISTS photos_count INTEGER DEFAULT 0;
ALTER TABLE client_visits ADD COLUMN IF NOT EXISTS handwritten_notes_transcription TEXT;

-- ── Trigger to update photos_count ──
CREATE OR REPLACE FUNCTION update_visit_photos_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE client_visits SET photos_count = (
      SELECT COUNT(*) FROM visit_photos WHERE visit_id = NEW.visit_id
    ) WHERE id = NEW.visit_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE client_visits SET photos_count = (
      SELECT COUNT(*) FROM visit_photos WHERE visit_id = OLD.visit_id
    ) WHERE id = OLD.visit_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_visit_photos_count
  AFTER INSERT OR DELETE ON visit_photos
  FOR EACH ROW
  EXECUTE FUNCTION update_visit_photos_count();
