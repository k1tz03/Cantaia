-- Migration 032: Normalization rules + Aggregation queue (C2 infrastructure)

-- Reference table for normalizing descriptions across tenants
CREATE TABLE IF NOT EXISTS normalization_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_patterns TEXT[] NOT NULL DEFAULT '{}',
  canonical_description TEXT NOT NULL,
  cfc_code TEXT,
  standard_unit TEXT,
  confidence NUMERIC DEFAULT 1.0,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_normalization_rules_cfc ON normalization_rules(cfc_code);
CREATE INDEX IF NOT EXISTS idx_normalization_rules_desc ON normalization_rules(canonical_description);
CREATE INDEX IF NOT EXISTS idx_normalization_rules_patterns ON normalization_rules USING gin(raw_patterns);

-- Aggregation event queue — triggers feed events here, CRON processes them
CREATE TABLE IF NOT EXISTS aggregation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table TEXT NOT NULL,
  source_id UUID NOT NULL,
  org_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('INSERT', 'UPDATE', 'DELETE')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_aggregation_queue_pending ON aggregation_queue(processed_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_aggregation_queue_source ON aggregation_queue(source_table, created_at);

-- Seed initial normalization rules for common Swiss construction items
INSERT INTO normalization_rules (raw_patterns, canonical_description, cfc_code, standard_unit) VALUES
  (ARRAY['béton armé', 'beton arme', 'béton armé C25/30', 'béton armé C30/37'], 'Béton armé', '211', 'm3'),
  (ARRAY['coffrage', 'coffrage bois', 'coffrage métallique'], 'Coffrage', '211.1', 'm2'),
  (ARRAY['armature', 'ferraillage', 'acier d''armature', 'fer à béton'], 'Armature acier', '211.2', 'kg'),
  (ARRAY['échafaudage', 'echafaudage', 'échafaudage de façade'], 'Échafaudage', '120', 'm2'),
  (ARRAY['terrassement', 'excavation', 'fouille', 'déblai'], 'Terrassement', '113', 'm3'),
  (ARRAY['maçonnerie', 'maconnerie', 'mur en briques', 'mur en blocs'], 'Maçonnerie', '221', 'm2'),
  (ARRAY['isolation thermique', 'isolation', 'isolation façade', 'isolation murs'], 'Isolation thermique', '224', 'm2'),
  (ARRAY['étanchéité', 'etancheite', 'étanchéité toiture', 'membrane'], 'Étanchéité', '225', 'm2'),
  (ARRAY['peinture', 'peinture intérieure', 'peinture murale'], 'Peinture', '281', 'm2'),
  (ARRAY['carrelage', 'carrelage sol', 'faïence', 'carrelage mural'], 'Carrelage', '271', 'm2'),
  (ARRAY['plâtrerie', 'platrerie', 'enduit plâtre', 'plâtre'], 'Plâtrerie', '273', 'm2'),
  (ARRAY['menuiserie', 'menuiserie bois', 'porte bois', 'fenêtre bois'], 'Menuiserie bois', '241', 'pce'),
  (ARRAY['serrurerie', 'métallerie', 'garde-corps', 'rampe'], 'Serrurerie / Métallerie', '242', 'ml'),
  (ARRAY['chauffage', 'installation chauffage', 'radiateur'], 'Installation chauffage', '251', 'fft'),
  (ARRAY['ventilation', 'installation ventilation', 'VMC'], 'Installation ventilation', '252', 'fft'),
  (ARRAY['sanitaire', 'installation sanitaire', 'plomberie'], 'Installation sanitaire', '253', 'fft'),
  (ARRAY['électricité', 'electricite', 'installation électrique', 'courant fort'], 'Installation électrique', '261', 'fft'),
  (ARRAY['ascenseur', 'monte-charge', 'élévateur'], 'Ascenseur', '291', 'pce'),
  (ARRAY['toiture', 'couverture', 'tuiles', 'tôle'], 'Couverture toiture', '226', 'm2'),
  (ARRAY['chape', 'chape ciment', 'chape fluide'], 'Chape', '272', 'm2')
ON CONFLICT DO NOTHING;
