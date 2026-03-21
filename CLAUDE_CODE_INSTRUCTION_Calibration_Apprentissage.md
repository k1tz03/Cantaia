# INSTRUCTION CLAUDE CODE — Système de Calibration et Apprentissage

> Ce document est un COMPLÉMENT au fichier
> CLAUDE_CODE_INSTRUCTION_Pipeline_Estimation_Multi_Modele.md
> Lis d'abord ce fichier, puis implémente les phases ci-dessous
> APRÈS avoir terminé les phases 1-11 du document principal.
> Place tous les fichiers dans les mêmes dossiers que le pipeline principal.

---

## CONTEXTE

Le pipeline d'estimation multi-modèle produit des scores de confiance
de 0.45-0.70 à la première utilisation. Ce complément implémente le
système de calibration et d'apprentissage qui fait monter ces scores
vers 0.90+ au fil du temps, à la fois pour les QUANTITÉS (analyse de plans)
et pour les PRIX (chiffrage).

Deux boucles de feedback indépendantes :
- Boucle QUANTITÉS : corrections métré → profils d'erreur → prompts adaptatifs
- Boucle PRIX : offres réelles → coefficients calibration → prix ajustés

---

## PHASE 12 — TYPES ADDITIONNELS

### Ajoute dans : `lib/plans/estimation/types.ts`

```typescript
// ═══════════════════════════════════════════════════
// Types pour le système de calibration et apprentissage
// ═══════════════════════════════════════════════════

// ─── Corrections quantités (plans) ───

export interface QuantityCorrection {
  id: string;
  org_id: string;
  plan_id: string;
  estimation_id: string;
  cfc_code: string;
  description: string;
  // Contexte de l'erreur (crucial pour l'apprentissage)
  discipline: string;
  type_plan: string;
  bureau_auteur: string | null;
  echelle: string | null;
  qualite_image: 'haute' | 'moyenne' | 'basse';
  // La correction
  quantite_estimee: number;
  quantite_corrigee: number;
  unite: string;
  ecart_pct: number; // (corrigee - estimee) / estimee * 100
  methode_mesure_originale: string;
  // Quel modèle avait la valeur la plus proche ?
  modele_plus_proche: ModelProvider | null;
  modele_plus_eloigne: ModelProvider | null;
  valeurs_par_modele: Record<ModelProvider, number>;
  // Raison de la correction
  raison: 'erreur_lecture' | 'mauvaise_echelle' | 'double_comptage' | 'element_manque' | 'element_en_trop' | 'mauvaise_unite' | 'autre';
  commentaire: string | null;
  created_at: string;
}

// ─── Calibration prix ───

export interface PriceCalibration {
  id: string;
  org_id: string;
  cfc_code: string;
  description_normalized: string;
  unite: string;
  region: string;
  // L'estimation originale
  estimation_id: string;
  prix_estime_median: number;
  source_estimation: PriceSource;
  // Le prix réel (issu de l'offre fournisseur adjugée)
  prix_reel: number;
  source_prix_reel: 'offre_fournisseur' | 'decompte_final' | 'correction_manuelle';
  fournisseur_hash: string | null; // SHA-256 du nom, jamais le nom réel
  // Le coefficient de calibration
  coefficient: number; // prix_reel / prix_estime
  ecart_pct: number;
  created_at: string;
}

// ─── Profil d'erreur par modèle ───

export interface ModelErrorProfile {
  provider: ModelProvider;
  discipline: string;
  type_element_cfc: string; // Préfixe CFC (ex: "215" pour béton)
  // Stats basées sur les corrections
  nb_corrections: number;
  ecart_moyen_pct: number; // Moyenne des écarts (signé : positif = surestime)
  ecart_median_pct: number;
  ecart_stddev_pct: number;
  tendance: 'surestime' | 'sous_estime' | 'neutre'; // Si |ecart_moyen| > 5%
  coefficient_correction: number; // Facteur à appliquer (ex: 0.87 si surestime de 13%)
  fiabilite: number; // 0-1, basé sur la constance (1/stddev normalisé)
  derniere_maj: string;
}

// ─── Profil de bureau d'études ───

export interface BureauProfile {
  bureau_nom_hash: string; // SHA-256 du nom
  bureau_nom_display: string; // Nom lisible (stocké uniquement en C1)
  org_id: string; // C1 — privé par organisation
  nb_plans_analyses: number;
  // Conventions détectées
  conventions: {
    position_cartouche: 'bas_droite' | 'bas_gauche' | 'haut_droite' | 'autre';
    style_cotation: 'interieur' | 'exterieur' | 'mixte';
    echelle_favorite: string; // ex: "1:100"
    format_numero_plan: string | null; // ex: "XXX-YY-ZZ"
    hachures_beton: string | null;
    epaisseur_traits: 'fin' | 'standard' | 'epais';
  };
  // Erreurs fréquentes sur les plans de ce bureau
  erreurs_frequentes: Array<{
    type: string;
    description: string;
    frequence_pct: number;
  }>;
  // Performance IA par discipline sur les plans de ce bureau
  performance_par_discipline: Record<string, {
    nb_plans: number;
    ecart_moyen_pct: number;
    score_confiance_moyen: number;
  }>;
  derniere_maj: string;
}

// ─── Vérification croisée inter-plans ───

export interface CrossPlanVerification {
  project_id: string;
  plans_compares: Array<{
    plan_id: string;
    discipline: string;
    numero: string;
  }>;
  verifications: Array<{
    element: string; // ex: "Murs extérieurs RDC"
    cfc_code: string;
    unite: string;
    valeurs_par_plan: Array<{
      plan_id: string;
      discipline: string;
      quantite: number;
    }>;
    ecart_max_pct: number;
    coherent: boolean; // true si écart < 15%
    note: string;
  }>;
  score_coherence_projet: number; // 0-100
  alertes: string[];
}

// ─── Score de confiance dynamique ───

export interface DynamicConfidenceFactors {
  // Facteurs de base
  base_consensus_score: number; // 0-1, issu du consensus multi-modèle
  // Bonus calibration quantités
  calibration_qty_bonus: number; // 0-0.25, basé sur nb corrections passées pour ce type
  calibration_qty_source: string; // ex: "15 corrections sur CFC 215, discipline structure"
  // Bonus calibration prix
  calibration_price_bonus: number; // 0-0.30, basé sur nb prix réels pour ce CFC
  calibration_price_source: string;
  // Bonus bureau connu
  bureau_bonus: number; // 0-0.10, si bureau reconnu avec historique
  bureau_source: string | null;
  // Bonus vérification croisée
  cross_plan_bonus: number; // 0-0.10, si cohérence inter-plans vérifiée
  cross_plan_source: string | null;
  // Score final calculé
  score_final: number; // min(1.0, base + bonus), plafonné à 0.95
  label: string; // "Estimation haute fiabilité" etc.
  details: string; // Explication lisible de comment le score est calculé
}
```

---

## PHASE 13 — MIGRATIONS SQL

### Crée le fichier : `supabase/migrations/043_calibration_system.sql`

```sql
-- ═══════════════════════════════════════════════════
-- Système de calibration et apprentissage
-- ═══════════════════════════════════════════════════

-- Table des corrections de quantités (Couche 1 — privée)
CREATE TABLE IF NOT EXISTS quantity_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  plan_id UUID NOT NULL REFERENCES plan_registry(id),
  estimation_id UUID NOT NULL,
  cfc_code TEXT NOT NULL,
  description TEXT NOT NULL,
  -- Contexte de l'erreur
  discipline TEXT NOT NULL,
  type_plan TEXT NOT NULL,
  bureau_auteur TEXT, -- Nom en clair (C1 privé)
  echelle TEXT,
  qualite_image TEXT CHECK (qualite_image IN ('haute', 'moyenne', 'basse')),
  -- La correction
  quantite_estimee NUMERIC NOT NULL,
  quantite_corrigee NUMERIC NOT NULL,
  unite TEXT NOT NULL,
  ecart_pct NUMERIC GENERATED ALWAYS AS (
    CASE WHEN quantite_estimee != 0
      THEN ((quantite_corrigee - quantite_estimee) / quantite_estimee * 100)
      ELSE 0
    END
  ) STORED,
  methode_mesure_originale TEXT,
  -- Modèles
  modele_plus_proche TEXT,
  modele_plus_eloigne TEXT,
  valeurs_par_modele JSONB DEFAULT '{}',
  -- Raison
  raison TEXT NOT NULL CHECK (raison IN (
    'erreur_lecture', 'mauvaise_echelle', 'double_comptage',
    'element_manque', 'element_en_trop', 'mauvaise_unite', 'autre'
  )),
  commentaire TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour requêtes fréquentes
CREATE INDEX idx_qty_corrections_org ON quantity_corrections(org_id);
CREATE INDEX idx_qty_corrections_cfc ON quantity_corrections(cfc_code);
CREATE INDEX idx_qty_corrections_discipline ON quantity_corrections(discipline);
CREATE INDEX idx_qty_corrections_bureau ON quantity_corrections(bureau_auteur);

-- RLS
ALTER TABLE quantity_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quantity_corrections_org_isolation" ON quantity_corrections
  USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────

-- Table de calibration prix (Couche 1 — privée)
CREATE TABLE IF NOT EXISTS price_calibrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  cfc_code TEXT NOT NULL,
  description_normalized TEXT NOT NULL,
  unite TEXT NOT NULL,
  region TEXT NOT NULL,
  -- Estimation originale
  estimation_id UUID NOT NULL,
  prix_estime_median NUMERIC NOT NULL,
  source_estimation TEXT NOT NULL,
  -- Prix réel
  prix_reel NUMERIC NOT NULL,
  source_prix_reel TEXT NOT NULL CHECK (source_prix_reel IN (
    'offre_fournisseur', 'decompte_final', 'correction_manuelle'
  )),
  fournisseur_hash TEXT,
  -- Calibration
  coefficient NUMERIC GENERATED ALWAYS AS (
    CASE WHEN prix_estime_median != 0
      THEN prix_reel / prix_estime_median
      ELSE 1
    END
  ) STORED,
  ecart_pct NUMERIC GENERATED ALWAYS AS (
    CASE WHEN prix_estime_median != 0
      THEN ((prix_reel - prix_estime_median) / prix_estime_median * 100)
      ELSE 0
    END
  ) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_cal_org ON price_calibrations(org_id);
CREATE INDEX idx_price_cal_cfc_region ON price_calibrations(cfc_code, region);

ALTER TABLE price_calibrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "price_calibrations_org_isolation" ON price_calibrations
  USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────

-- Table des profils de bureau d'études (Couche 1 — privée)
CREATE TABLE IF NOT EXISTS bureau_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  bureau_nom TEXT NOT NULL,
  bureau_nom_hash TEXT NOT NULL, -- SHA-256 pour C2
  nb_plans_analyses INTEGER DEFAULT 0,
  conventions JSONB DEFAULT '{}',
  erreurs_frequentes JSONB DEFAULT '[]',
  performance_par_discipline JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, bureau_nom_hash)
);

ALTER TABLE bureau_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bureau_profiles_org_isolation" ON bureau_profiles
  USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────

-- Table des profils d'erreur par modèle (Couche 2 — agrégée, SANS org_id)
-- Alimentée par le CRON hebdomadaire uniquement si ≥5 corrections d'orgs différentes
CREATE TABLE IF NOT EXISTS model_error_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('claude', 'gpt4o', 'gemini')),
  discipline TEXT NOT NULL,
  type_element_cfc TEXT NOT NULL, -- Préfixe CFC
  nb_corrections INTEGER NOT NULL,
  contributor_count INTEGER NOT NULL, -- Nombre d'orgs distinctes
  ecart_moyen_pct NUMERIC NOT NULL,
  ecart_median_pct NUMERIC NOT NULL,
  ecart_stddev_pct NUMERIC NOT NULL,
  tendance TEXT CHECK (tendance IN ('surestime', 'sous_estime', 'neutre')),
  coefficient_correction NUMERIC NOT NULL DEFAULT 1.0,
  fiabilite NUMERIC NOT NULL DEFAULT 0.5,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, discipline, type_element_cfc)
);

-- Pas de RLS sur C2 — accessible à tous
-- Mais vérification contributor_count >= 5 à l'insertion

-- ─────────────────────────────────────────────────

-- Table des vérifications croisées inter-plans (Couche 1)
CREATE TABLE IF NOT EXISTS cross_plan_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  plans_compares JSONB NOT NULL, -- Array de {plan_id, discipline}
  verifications JSONB NOT NULL, -- Array de résultats
  score_coherence_projet NUMERIC NOT NULL,
  alertes JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cross_plan_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cross_plan_org_isolation" ON cross_plan_verifications
  USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));

-- ─────────────────────────────────────────────────

-- Vue matérialisée pour les coefficients de calibration prix
-- Rafraîchie par le CRON horaire
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_calibration_coefficients AS
SELECT
  org_id,
  cfc_code,
  region,
  COUNT(*) AS nb_calibrations,
  AVG(coefficient) AS coefficient_moyen,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY coefficient) AS coefficient_median,
  STDDEV(coefficient) AS coefficient_stddev,
  MIN(created_at) AS premiere_calibration,
  MAX(created_at) AS derniere_calibration
FROM price_calibrations
WHERE created_at > NOW() - INTERVAL '12 months' -- Fenêtre glissante 12 mois
GROUP BY org_id, cfc_code, region
HAVING COUNT(*) >= 2; -- Au moins 2 points de calibration

CREATE UNIQUE INDEX idx_mv_cal_coeff ON mv_calibration_coefficients(org_id, cfc_code, region);

-- ─────────────────────────────────────────────────

-- Vue matérialisée pour les coefficients de calibration quantités
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_qty_calibration AS
SELECT
  org_id,
  cfc_code,
  discipline,
  bureau_auteur,
  COUNT(*) AS nb_corrections,
  AVG(ecart_pct) AS ecart_moyen_pct,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ecart_pct) AS ecart_median_pct,
  STDDEV(ecart_pct) AS ecart_stddev_pct,
  -- Le coefficient de correction : si l'IA sous-estime de 10%, coefficient = 1.10
  CASE
    WHEN AVG(ecart_pct) != 0 THEN 1 + (AVG(ecart_pct) / 100)
    ELSE 1.0
  END AS coefficient_correction,
  MAX(created_at) AS derniere_correction
FROM quantity_corrections
WHERE created_at > NOW() - INTERVAL '12 months'
GROUP BY org_id, cfc_code, discipline, bureau_auteur
HAVING COUNT(*) >= 3; -- Au moins 3 corrections

CREATE UNIQUE INDEX idx_mv_qty_cal ON mv_qty_calibration(org_id, cfc_code, discipline, bureau_auteur);

-- ─────────────────────────────────────────────────

-- Fonction pour rafraîchir les vues matérialisées
CREATE OR REPLACE FUNCTION refresh_calibration_views()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_calibration_coefficients;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_qty_calibration;
END;
$$ LANGUAGE plpgsql;
```

---

## PHASE 14 — MOTEUR DE CALIBRATION

### Crée le fichier : `lib/plans/estimation/calibration-engine.ts`

Ce fichier contient 4 fonctions principales :

#### 1. `getQuantityCalibration()`

```typescript
/**
 * Récupère le coefficient de calibration pour les quantités
 * basé sur l'historique de corrections.
 *
 * Cherche dans cet ordre (du plus spécifique au plus général) :
 * 1. Même CFC + même discipline + même bureau → très spécifique
 * 2. Même CFC + même discipline (tout bureau) → spécifique
 * 3. Même CFC (toute discipline) → générique
 * 4. Pas de calibration → coefficient = 1.0
 *
 * Retourne le coefficient et le nombre de corrections sur lequel il se base.
 */
async function getQuantityCalibration(params: {
  org_id: string;
  cfc_code: string;
  discipline: string;
  bureau_auteur: string | null;
}): Promise<{
  coefficient: number;
  nb_corrections: number;
  specificity: 'cfc_discipline_bureau' | 'cfc_discipline' | 'cfc_only' | 'none';
  confidence_bonus: number; // 0-0.25 basé sur nb_corrections et constance
}>
```

La logique du `confidence_bonus` :
- 0 corrections → bonus = 0
- 3-5 corrections → bonus = 0.05
- 6-10 corrections → bonus = 0.10
- 11-20 corrections → bonus = 0.15
- 21-50 corrections → bonus = 0.20
- 50+ corrections ET stddev < 10% → bonus = 0.25

#### 2. `getPriceCalibration()`

```typescript
/**
 * Récupère le coefficient de calibration pour les prix
 * basé sur l'historique estimation vs prix réels.
 *
 * Cherche dans la vue matérialisée mv_calibration_coefficients.
 * Applique le coefficient à la source de prix pour la corriger.
 */
async function getPriceCalibration(params: {
  org_id: string;
  cfc_code: string;
  region: string;
}): Promise<{
  coefficient: number;
  nb_calibrations: number;
  confidence_bonus: number; // 0-0.30
}>
```

La logique du `confidence_bonus` pour les prix :
- 0 calibrations → bonus = 0
- 2-3 calibrations → bonus = 0.05
- 4-7 calibrations → bonus = 0.10
- 8-15 calibrations → bonus = 0.20
- 15+ calibrations ET stddev < 15% → bonus = 0.30

#### 3. `getModelErrorProfile()`

```typescript
/**
 * Récupère le profil d'erreur d'un modèle IA pour un type
 * d'élément et une discipline donnés.
 *
 * Utilisé par le consensus engine pour pondérer les résultats
 * de chaque modèle en fonction de sa fiabilité historique.
 *
 * Cherche d'abord en C1 (corrections propres à l'org),
 * puis en C2 (model_error_profiles agrégés cross-tenant).
 */
async function getModelErrorProfile(params: {
  provider: ModelProvider;
  discipline: string;
  cfc_prefix: string; // ex: "215" pour béton
  org_id: string;
}): Promise<{
  coefficient_correction: number;
  fiabilite: number; // 0-1, poids dans le consensus
  source: 'org_specific' | 'platform_aggregate' | 'none';
  nb_datapoints: number;
}>
```

#### 4. `getBureauProfile()`

```typescript
/**
 * Récupère le profil d'un bureau d'études basé sur
 * les analyses précédentes de ses plans.
 *
 * Retourne les conventions détectées et les erreurs fréquentes
 * pour enrichir le prompt de la Passe 2.
 */
async function getBureauProfile(params: {
  org_id: string;
  bureau_nom: string;
}): Promise<{
  profile: BureauProfile | null;
  prompt_enrichment: string; // Texte à injecter dans le prompt Passe 2
  confidence_bonus: number; // 0-0.10
}>
```

Le `prompt_enrichment` retourné ressemble à :
```
CONTEXTE BUREAU D'ÉTUDES : Ce plan provient du bureau [nom].
Sur les [N] plans précédents de ce bureau, les observations suivantes ont été faites :
- Conventions : cartouche en bas à droite, cotations extérieures, échelle habituelle 1:100
- Erreurs fréquentes de l'IA sur ces plans : [liste des erreurs avec fréquence]
- Points d'attention : [éléments souvent ratés ou surestimés]
Adapte ton analyse en conséquence.
```

---

## PHASE 15 — VÉRIFICATION CROISÉE INTER-PLANS

### Crée le fichier : `lib/plans/estimation/cross-plan-verification.ts`

```typescript
/**
 * Compare les quantités extraites de plusieurs plans du même projet
 * pour vérifier la cohérence.
 *
 * Exemple : si le plan archi et le plan structure montrent les mêmes
 * murs extérieurs, les quantités doivent être cohérentes.
 *
 * Éléments vérifiables entre disciplines :
 * - Archi ↔ Structure : murs porteurs, dalles, poteaux
 * - Archi ↔ Façades : surfaces de façade, ouvertures
 * - Structure ↔ CVC : trémies, réservations
 * - Archi ↔ Électricité : nombre de pièces (= nombre de circuits)
 */
async function verifyCrossPlan(params: {
  project_id: string;
  org_id: string;
}): Promise<CrossPlanVerification>
```

Logique :
1. Récupérer tous les plan_analyses du projet
2. Pour chaque paire de disciplines ayant des éléments communs :
   - Comparer les quantités des éléments partagés
   - Calculer l'écart en %
   - Si écart < 10% → cohérent
   - Si écart 10-20% → attention
   - Si écart > 20% → alerte
3. Calculer un score de cohérence global (0-100)
4. Le confidence_bonus est de 0 à 0.10 selon le score :
   - Score ≥ 90 → bonus = 0.10
   - Score 70-89 → bonus = 0.05
   - Score < 70 → bonus = 0 (incohérence détectée)

---

## PHASE 16 — CALCULATEUR DE CONFIANCE DYNAMIQUE

### Crée le fichier : `lib/plans/estimation/dynamic-confidence.ts`

Ce fichier remplace la logique statique de `confidence-calculator.ts`
par un calcul dynamique qui intègre tous les bonus de calibration.

```typescript
/**
 * Calcule le score de confiance dynamique pour chaque poste
 * et pour l'estimation globale.
 *
 * Formule par poste :
 * score = min(0.95, base + qty_bonus + price_bonus + bureau_bonus + cross_bonus)
 *
 * Où :
 *   base = consensus_score × source_score × quantite_score
 *   qty_bonus = getQuantityCalibration().confidence_bonus
 *   price_bonus = getPriceCalibration().confidence_bonus
 *   bureau_bonus = getBureauProfile().confidence_bonus
 *   cross_bonus = verifyCrossPlan().confidence_bonus
 *
 * Le score est PLAFONNÉ à 0.95 car une estimation ne peut jamais
 * être aussi fiable qu'un prix contractuel.
 *
 * Score global = moyenne pondérée par montant de chaque poste
 */
async function calculateDynamicConfidence(params: {
  estimation: Passe4Result;
  consensus: ConsensusResult;
  org_id: string;
  project_id: string;
  discipline: string;
  bureau_auteur: string | null;
  region: string;
}): Promise<{
  postes: Array<{
    cfc_code: string;
    description: string;
    factors: DynamicConfidenceFactors;
  }>;
  score_global: number;
  label_global: string;
  evolution: {
    score_sans_calibration: number;
    score_avec_calibration: number;
    gain: number;
    explication: string; // ex: "La calibration a amélioré le score de 12 points grâce à 8 prix réels et 15 corrections de quantités"
  };
}>
```

Les labels :
- ≥ 90 : "Estimation haute fiabilité — données réelles majoritaires"
- 80-89 : "Estimation fiable — calibrée sur l'historique"
- 70-79 : "Estimation solide — quelques postes à confirmer"
- 60-69 : "Estimation indicative — historique en construction"
- 50-59 : "Estimation préliminaire — à consolider avec des devis"
- < 50 : "Pré-estimation — données insuffisantes"

---

## PHASE 17 — MISE À JOUR DU PIPELINE

### Modifie : `lib/plans/estimation/pipeline.ts`

Intègre la calibration dans le pipeline existant. Les modifications sont :

#### Dans la Passe 2 (avant le consensus) :
1. Identifier le bureau d'études depuis le résultat Passe 1
2. Appeler `getBureauProfile()` pour récupérer le prompt enrichi
3. Si un profil existe, ajouter le `prompt_enrichment` au prompt Passe 2
   AVANT de l'envoyer aux 3 modèles

#### Dans le consensus :
1. Pour chaque poste, appeler `getModelErrorProfile()` pour chaque modèle
2. Si des profils existent, utiliser les coefficients de correction
   pour ajuster les valeurs AVANT de calculer le consensus
3. Utiliser les scores de fiabilité comme poids dans le consensus
   (au lieu de poids égaux)

#### Dans la Passe 4 (chiffrage) :
1. Pour chaque poste, appeler `getPriceCalibration()`
2. Si un coefficient existe, l'appliquer au prix résolu :
   prix_ajuste = prix_resolu × coefficient_calibration
3. Pour chaque quantité, appeler `getQuantityCalibration()`
4. Si un coefficient existe, ajuster la quantité :
   quantite_ajustee = quantite_consensus × coefficient_calibration

#### Après la Passe 4 :
1. Si d'autres plans du même projet ont été analysés,
   appeler `verifyCrossPlan()` pour vérifier la cohérence
2. Appeler `calculateDynamicConfidence()` au lieu de l'ancien calcul statique
3. Inclure l'évolution du score dans le résultat

---

## PHASE 18 — API CORRECTIONS

### Crée le fichier : `app/api/plans/corrections/route.ts`

Route POST pour sauvegarder une correction de quantité :

```
POST /api/plans/corrections
Body: {
  plan_id: string,
  estimation_id: string,
  cfc_code: string,
  description: string,
  quantite_corrigee: number,
  unite: string,
  raison: string,
  commentaire?: string
}
```

La route doit :
1. Récupérer les infos de l'estimation originale (quantité estimée,
   valeurs par modèle, discipline, type plan, bureau)
2. Calculer l'écart en %
3. Déterminer quel modèle était le plus proche et le plus éloigné
4. Insérer dans `quantity_corrections`
5. Mettre à jour le `bureau_profiles` si bureau connu
   (incrémenter compteurs, recalculer erreurs fréquentes)
6. Retourner la correction sauvegardée

### Crée le fichier : `app/api/plans/calibration/route.ts`

Route POST pour enregistrer un prix réel (calibration) :

```
POST /api/plans/calibration
Body: {
  estimation_id: string,
  cfc_code: string,
  prix_reel: number,
  source: "offre_fournisseur" | "decompte_final" | "correction_manuelle",
  fournisseur_nom?: string
}
```

La route doit :
1. Récupérer le prix estimé original
2. Calculer le coefficient (prix_reel / prix_estime)
3. Hasher le nom du fournisseur si fourni
4. Insérer dans `price_calibrations`
5. Rafraîchir la vue matérialisée si ≥ 2 calibrations pour ce CFC + région
6. Retourner la calibration sauvegardée

---

## PHASE 19 — CRON CALIBRATION

### Crée le fichier : `app/api/cron/calibrate/route.ts`

CRON Vercel exécuté toutes les heures. Il fait :

1. `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_calibration_coefficients`
2. `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_qty_calibration`
3. Vérifier s'il y a de nouvelles corrections depuis le dernier run
4. Si oui, recalculer les `model_error_profiles` pour les combinaisons
   provider × discipline × cfc qui ont ≥ 5 corrections de ≥ 5 orgs distinctes
5. Logger les métriques dans `api_usage_logs`

```typescript
export const config = {
  schedule: '30 * * * *', // Toutes les heures à :30
};
```

---

## PHASE 20 — COMPOSANT UI CORRECTIONS

### Crée le fichier : `app/plans/components/QuantityCorrectionModal.tsx`

Modal qui s'ouvre quand le client clique sur une quantité dans le tableau
d'estimation pour la corriger.

Contenu du modal :
1. Valeur estimée (non éditable) avec badge consensus (3/3, 2/3, etc.)
2. Détail par modèle (expandable) : Claude: X, GPT-4o: Y, Gemini: Z
3. Champ "Quantité corrigée" (input number)
4. Sélecteur "Raison de la correction" (dropdown avec les 7 raisons)
5. Champ "Commentaire" (textarea optionnel)
6. L'écart en % calculé en temps réel pendant la saisie
7. Bouton "Enregistrer la correction"
8. Message de confirmation : "Cette correction améliorera les futures
   estimations sur ce type d'élément"

### Crée le fichier : `app/plans/components/PriceCalibrationModal.tsx`

Modal qui s'ouvre quand le client veut renseigner un prix réel.

Contenu :
1. Prix estimé (fourchette min/médian/max, non éditable)
2. Source du prix estimé (badge couleur)
3. Champ "Prix réel" (input number)
4. Sélecteur source : "Offre fournisseur" / "Décompte final" / "Correction manuelle"
5. Champ "Fournisseur" (optionnel, avec note "nom anonymisé dans les benchmarks")
6. L'écart en % calculé en temps réel
7. Bouton "Enregistrer"

### Crée le fichier : `app/plans/components/ConfidenceEvolution.tsx`

Petit composant affiché dans l'en-tête de l'estimation qui montre
l'évolution du score de confiance :

- Score actuel (gros chiffre + couleur)
- Barre montrant la décomposition : base + calibration qty + calibration prix + bureau + cross-plan
- Message : "Score amélioré de +12 points grâce à votre historique
  (8 prix réels, 15 corrections de quantités)"
- Si score < 60 : suggestion "Corrigez les quantités marquées en orange
  pour améliorer la fiabilité des prochaines estimations"

---

## PHASE 21 — AUTO-CALIBRATION DEPUIS SOUMISSIONS

### Crée le fichier : `lib/plans/estimation/auto-calibration.ts`

Ce fichier contient un trigger qui s'exécute automatiquement quand
une offre fournisseur est saisie dans le module Soumissions.

```typescript
/**
 * Quand une offre fournisseur est ajugée (marquée comme retenue)
 * dans le module Soumissions, cette fonction :
 *
 * 1. Cherche si une estimation existe pour le même projet
 * 2. Pour chaque ligne de l'offre, tente de matcher avec un poste estimé
 *    (par CFC code + description normalisée)
 * 3. Pour chaque match trouvé, crée automatiquement une entrée
 *    dans price_calibrations
 * 4. Rafraîchit les vues matérialisées
 *
 * Le matching est fait par :
 * - Code CFC exact (priorité 1)
 * - Description normalisée similaire (priorité 2, fuzzy matching)
 * - Unité identique (obligatoire)
 */
async function autoCalibrate(params: {
  org_id: string;
  project_id: string;
  submission_id: string;
  offer_id: string; // L'offre adjugée
}): Promise<{
  calibrations_creees: number;
  postes_matche: number;
  postes_non_matche: number;
  details: Array<{
    cfc_code: string;
    description: string;
    prix_estime: number;
    prix_reel: number;
    ecart_pct: number;
  }>;
}>
```

### Route API pour déclencher l'auto-calibration :

Crée : `app/api/plans/auto-calibrate/route.ts`

Route POST appelée quand une offre est adjugée dans le module Soumissions.
Le frontend doit appeler cette route après l'adjudication.

---

## ORDRE D'EXÉCUTION (phases 12-21)

1. Phase 12 — Types additionnels
2. Phase 13 — Migration SQL
3. Phase 14 — Moteur de calibration (4 fonctions)
4. Phase 15 — Vérification croisée inter-plans
5. Phase 16 — Calculateur de confiance dynamique
6. Phase 17 — Mise à jour du pipeline principal
7. Phase 18 — Routes API corrections + calibration
8. Phase 19 — CRON calibration
9. Phase 20 — Composants UI (3 composants)
10. Phase 21 — Auto-calibration depuis soumissions

---

## CONTRAINTES

- Les corrections et calibrations sont TOUJOURS en Couche 1 (org_id obligatoire)
- Les profils d'erreur modèle en Couche 2 nécessitent ≥5 orgs distinctes
- Le score de confiance est PLAFONNÉ à 0.95 (jamais 1.0)
- Les coefficients de calibration utilisent une fenêtre glissante de 12 mois
- Les vues matérialisées sont rafraîchies CONCURRENTLY (pas de lock)
- Le prompt enrichissement bureau ne doit JAMAIS contenir de données
  d'un autre tenant — uniquement les conventions et erreurs fréquentes
  détectées sur les plans de CE client
- L'auto-calibration ne crée une entrée que si le match CFC est fiable
  (pas de match approximatif sur les prix — mieux vaut ne pas calibrer
  que de calibrer avec un mauvais match)
