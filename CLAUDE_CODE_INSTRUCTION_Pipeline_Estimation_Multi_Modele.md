# INSTRUCTION CLAUDE CODE — Implémentation Pipeline Estimation Prix Multi-Modèle

> Ce document est une instruction complète pour Claude Code.
> Lis-le entièrement avant de commencer à coder.
> Travaille fichier par fichier, dans l'ordre indiqué.

---

## CONTEXTE PROJET

CANTAIA est un SaaS Next.js de gestion de chantier avec IA.
- Framework : Next.js (App Router)
- BDD : Supabase (PostgreSQL)
- Auth : Supabase Auth
- Storage : Supabase Storage
- IA principale : Anthropic Claude Sonnet 4.5
- Transcription : OpenAI Whisper
- Paiements : Stripe (prévu)
- Styling : Tailwind CSS + shadcn/ui
- Langues : FR, EN, DE (next-intl)

Le module Plans existe déjà (`/plans`). Il détecte les plans dans les emails,
les enregistre dans `plan_registry` + `plan_versions`, et permet une analyse
Vision IA basique. Le problème : l'estimation de prix actuelle est trop vague,
avec des prix déconnectés de la réalité suisse. Les clients perdent confiance.

## OBJECTIF

Implémenter un pipeline d'estimation de prix en 4 passes avec consensus
multi-modèle (Claude + GPT-4o + Gemini) pour les passes critiques (métré
et chiffrage). Le résultat doit être d'une qualité professionnelle qui
inspire une confiance absolue au client.

---

## PHASE 1 — DÉPENDANCES ET CONFIGURATION

### 1.1 Installer les packages nécessaires

```bash
npm install openai @google/generative-ai
```

### 1.2 Variables d'environnement

Ajoute dans `.env.local` (NE PAS écraser les existantes, juste ajouter) :

```env
# Multi-model estimation pipeline
OPENAI_API_KEY=sk-... # GPT-4o Vision
GEMINI_API_KEY=AI... # Gemini 2.0 Pro Vision
```

L'API key Anthropic (`ANTHROPIC_API_KEY`) existe déjà dans le projet.

---

## PHASE 2 — TYPES TYPESCRIPT

### Crée le fichier : `lib/plans/estimation/types.ts`

```typescript
// ═══════════════════════════════════════════════════
// Types pour le pipeline d'estimation 4 passes
// ═══════════════════════════════════════════════════

// ─── Passe 1 : Identification ───

export interface Passe1Result {
  cartouche: {
    numero_plan: string | null;
    indice_revision: string | null;
    date: string | null;
    auteur_bureau: string | null;
    projet: string | null;
    echelle: string | null;
  };
  classification: {
    discipline: 'architecture' | 'structure' | 'cvcs' | 'electricite' | 'sanitaire' | 'facades' | 'amenagement_exterieur' | 'demolition';
    type_plan: 'plan_etage' | 'coupe' | 'facade' | 'detail' | 'situation' | 'schema_principe' | 'plan_toiture' | 'plan_fondation';
    phase_sia: 'esquisse' | 'avant-projet' | 'projet' | 'execution' | 'mise_a_jour';
    vues_presentes: string[];
  };
  contexte_metrage: {
    echelle_detectee: string;
    echelle_fiable: boolean;
    cotations_presentes: boolean;
    legende_presente: boolean;
    qualite_image: 'haute' | 'moyenne' | 'basse';
    zones_illisibles: string[];
  };
  avertissements: string[];
}

// ─── Passe 2 : Métré ───

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'assumption';
export type PriceSource = 'historique_interne' | 'benchmark_cantaia' | 'referentiel_crb' | 'ratio_estimation' | 'estimation_ia' | 'consensus_multi_ia' | 'prix_non_disponible';

export interface SousPoste {
  sous_poste: string;
  quantite: number;
  unite: string;
  ratio_utilise: string | null;
  source_ratio: string;
}

export interface PosteMetrage {
  cfc_code: string;
  cfc_libelle: string;
  description_detaillee: string;
  quantite: number;
  unite: string;
  methode_mesure: string;
  vue_source: string;
  confiance: ConfidenceLevel;
  hypotheses: string[];
  decomposition: SousPoste[];
}

export interface ZoneMetrage {
  zone: string;
  dimensions_zone: {
    longueur: number | null;
    largeur: number | null;
    hauteur: number | null;
    surface: number | null;
    source_mesure: 'cotation' | 'echelle' | 'proportion';
  };
  postes: PosteMetrage[];
}

export interface Passe2Result {
  metrage_par_zone: ZoneMetrage[];
  elements_hors_plan: Array<{
    description: string;
    raison: string;
    plan_requis: string;
  }>;
  totaux_par_cfc: Array<{
    cfc_code: string;
    cfc_libelle: string;
    quantite_totale: number;
    unite: string;
    nb_zones: number;
    confiance_moyenne: ConfidenceLevel;
  }>;
  avertissements_metrage: string[];
  surface_reference: {
    surface_brute_plancher: number | null;
    surface_nette_plancher: number | null;
    surface_facade: number | null;
    volume_bati: number | null;
    source: string;
  };
}

// ─── Consensus multi-modèle ───

export type ModelProvider = 'claude' | 'gpt4o' | 'gemini';

export interface ModelMetrage {
  provider: ModelProvider;
  result: Passe2Result;
  latency_ms: number;
  tokens_used: number;
  error: string | null;
}

export interface PosteConsensus {
  cfc_code: string;
  description: string;
  quantite_consensuelle: number;
  unite: string;
  confiance_consensus: 'high' | 'medium' | 'low' | 'flag';
  valeurs_par_modele: Array<{
    provider: ModelProvider;
    quantite: number;
    ecart_vs_median_pct: number;
  }>;
  methode_consensus: 'concordance_forte' | 'concordance_partielle' | 'divergence' | 'detection_unique' | 'detection_double';
  outlier: ModelProvider | null;
  note: string | null;
}

export interface ConsensusResult {
  postes: PosteConsensus[];
  modeles_utilises: ModelProvider[];
  modeles_en_erreur: Array<{ provider: ModelProvider; error: string }>;
  stats: {
    total_postes: number;
    concordance_forte_pct: number;
    concordance_partielle_pct: number;
    divergence_pct: number;
    score_consensus_global: number; // 0-100
  };
  metrage_fusionne: Passe2Result; // Le métré final après consensus
}

// ─── Passe 3 : Vérification ───

export interface Passe3Result {
  verification_ratios: Array<{
    ratio_teste: string;
    valeur_calculee: number;
    plage_reference: string;
    verdict: 'conforme' | 'attention' | 'anomalie';
    commentaire: string;
  }>;
  alertes_coherence: Array<{
    severite: 'critique' | 'attention' | 'info';
    poste_concerne: string;
    probleme: string;
    suggestion: string;
  }>;
  doublons_potentiels: Array<{
    poste_1: string;
    poste_2: string;
    raison_suspicion: string;
  }>;
  elements_probablement_manquants: Array<{
    cfc_code: string;
    description: string;
    raison: string;
    impact_estimation: 'faible' | 'moyen' | 'significatif';
    quantite_estimee: string | null;
  }>;
  score_fiabilite_metrage: {
    score: number;
    facteurs_positifs: string[];
    facteurs_negatifs: string[];
    recommandation: string;
  };
}

// ─── Passe 4 : Chiffrage ───

export interface PrixUnitaire {
  min: number | null;
  median: number | null;
  max: number | null;
  source: PriceSource;
  detail_source: string;
  date_reference: string;
  ajustements: string[];
}

export interface PosteChiffre {
  cfc_code: string;
  cfc_libelle: string;
  description: string;
  quantite: number;
  unite: string;
  prix_unitaire: PrixUnitaire;
  total: { min: number | null; median: number | null; max: number | null };
  confiance_quantite: ConfidenceLevel;
  confiance_prix: 'high' | 'medium' | 'low' | 'estimation';
  confiance_combinee: string;
  note: string | null;
}

export interface Passe4Result {
  parametres_estimation: {
    region: string;
    coefficient_regional: number;
    type_batiment: string;
    periode: string;
    ajustements_appliques: Array<{
      type: string;
      coefficient: number;
      justification: string;
    }>;
  };
  estimation_par_cfc: Array<{
    cfc_code: string;
    cfc_libelle: string;
    postes: PosteChiffre[];
    sous_total_cfc: { min: number; median: number; max: number };
  }>;
  recapitulatif: {
    sous_total_travaux: { min: number; median: number; max: number };
    frais_generaux: { pourcentage: number; montant_median: number; justification: string };
    benefice_risques: { pourcentage: number; montant_median: number; justification: string };
    divers_imprevus: { pourcentage: number; montant_median: number; justification: string };
    total_estimation: { min: number; median: number; max: number };
    prix_au_m2_sbp: { min: number; median: number; max: number };
    plage_reference_m2_sbp: { min: number; max: number; source: string };
  };
  analyse_fiabilite: {
    score_global: number;
    repartition_sources: {
      historique_interne_pct: number;
      benchmark_cantaia_pct: number;
      referentiel_crb_pct: number;
      ratio_estimation_pct: number;
      estimation_ia_pct: number;
      consensus_multi_ia_pct: number;
      prix_non_disponible_pct: number;
    };
    postes_a_risque: Array<{
      poste: string;
      montant_median: number;
      raison_risque: string;
      action_recommandee: string;
    }>;
    recommandation_globale: string;
    prochaines_etapes: string[];
  };
  comparaison_marche: {
    prix_m2_estime: number;
    prix_m2_marche_bas: number;
    prix_m2_marche_median: number;
    prix_m2_marche_haut: number;
    position: 'sous_marche' | 'dans_marche' | 'au_dessus_marche';
    commentaire: string;
  };
}

// ─── Pipeline complet ───

export interface EstimationPipelineResult {
  plan_id: string;
  project_id: string;
  org_id: string;
  created_at: string;
  passe1: Passe1Result;
  consensus_metrage: ConsensusResult;
  passe3: Passe3Result;
  passe4: Passe4Result;
  pipeline_stats: {
    total_duration_ms: number;
    passe1_duration_ms: number;
    passe2_duration_ms: number; // Inclut les 3 modèles en parallèle
    consensus_duration_ms: number;
    passe3_duration_ms: number;
    passe4_duration_ms: number;
    total_tokens: number;
    total_cost_usd: number;
    models_used: ModelProvider[];
  };
}
```

---

## PHASE 3 — DONNÉES DE RÉFÉRENCE

### Crée le fichier : `lib/plans/estimation/reference-data/cfc-prices.ts`

Exporte un tableau `CFC_REFERENCE_PRICES` contenant les prix de référence
suisses par code CFC. Voici la structure et les données à inclure :

```typescript
export interface CFCReferencePrice {
  cfc_code: string;
  description: string;
  unite: string;
  prix_min: number;
  prix_median: number;
  prix_max: number;
  region_ref: string; // "CH moyenne"
  periode: string; // "2025"
}

export const CFC_REFERENCE_PRICES: CFCReferencePrice[] = [
  // CFC 1 — Travaux préparatoires
  { cfc_code: '111', description: 'Démolition bâtiment (sans désamiantage)', unite: 'm³', prix_min: 25, prix_median: 40, prix_max: 65, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '112', description: 'Démolition avec tri sélectif', unite: 'm³', prix_min: 45, prix_median: 65, prix_max: 95, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '113', description: 'Désamiantage', unite: 'm²', prix_min: 80, prix_median: 150, prix_max: 300, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 2 — Gros œuvre : Terrassement
  { cfc_code: '211.1', description: 'Fouilles en pleine masse (terrain meuble)', unite: 'm³', prix_min: 18, prix_median: 28, prix_max: 45, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.2', description: 'Fouilles en pleine masse (terrain rocheux)', unite: 'm³', prix_min: 55, prix_median: 85, prix_max: 140, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.3', description: 'Fouilles en tranchée', unite: 'm³', prix_min: 25, prix_median: 40, prix_max: 65, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.4', description: 'Remblayage compacté', unite: 'm³', prix_min: 15, prix_median: 22, prix_max: 35, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.5', description: 'Évacuation de matériaux (décharge)', unite: 'm³', prix_min: 25, prix_median: 45, prix_max: 75, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '211.6', description: 'Étanchéité sous radier (bitumineuse)', unite: 'm²', prix_min: 35, prix_median: 55, prix_max: 80, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 2 — Gros œuvre : Béton
  { cfc_code: '215.0', description: 'Béton non armé C25/30', unite: 'm³', prix_min: 220, prix_median: 280, prix_max: 360, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.1', description: 'Béton armé C30/37 (fourniture + coulage)', unite: 'm³', prix_min: 280, prix_median: 350, prix_max: 450, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.2', description: 'Béton armé C30/37 pompé', unite: 'm³', prix_min: 300, prix_median: 380, prix_max: 480, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.3', description: 'Coffrage plan (dalles)', unite: 'm²', prix_min: 35, prix_median: 50, prix_max: 70, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.4', description: 'Coffrage vertical (voiles, murs)', unite: 'm²', prix_min: 45, prix_median: 65, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.5', description: 'Coffrage courbe ou complexe', unite: 'm²', prix_min: 80, prix_median: 120, prix_max: 180, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.6', description: 'Ferraillage standard (fourni posé)', unite: 'kg', prix_min: 2.20, prix_median: 2.80, prix_max: 3.60, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '215.7', description: 'Treillis soudé (fourni posé)', unite: 'kg', prix_min: 2.00, prix_median: 2.50, prix_max: 3.20, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '216.0', description: 'Maçonnerie bloc béton (20cm)', unite: 'm²', prix_min: 85, prix_median: 120, prix_max: 160, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 2 — Enveloppe
  { cfc_code: '221.0', description: 'Fenêtre PVC double vitrage standard', unite: 'm²', prix_min: 450, prix_median: 600, prix_max: 800, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '221.1', description: 'Fenêtre bois-alu triple vitrage', unite: 'm²', prix_min: 700, prix_median: 950, prix_max: 1300, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '224.0', description: 'Isolation façade EPS (16cm)', unite: 'm²', prix_min: 55, prix_median: 75, prix_max: 100, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '224.1', description: 'Isolation façade laine de roche (16cm)', unite: 'm²', prix_min: 65, prix_median: 90, prix_max: 120, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '225.0', description: 'Crépi extérieur (2 couches)', unite: 'm²', prix_min: 45, prix_median: 65, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '225.1', description: 'Façade ventilée (fibrociment)', unite: 'm²', prix_min: 120, prix_median: 180, prix_max: 260, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '227.0', description: 'Étanchéité toiture plate (bitume 2 couches)', unite: 'm²', prix_min: 45, prix_median: 65, prix_max: 90, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '228.0', description: 'Couverture tuiles (terre cuite)', unite: 'm²', prix_min: 80, prix_median: 120, prix_max: 170, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 23 — Électricité
  { cfc_code: '232.0', description: 'Installation électrique (logement standard)', unite: 'm² SBP', prix_min: 80, prix_median: 110, prix_max: 150, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '232.1', description: 'Installation électrique (bureau)', unite: 'm² SBP', prix_min: 100, prix_median: 140, prix_max: 190, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 24 — CVC
  { cfc_code: '241.0', description: 'Chauffage sol (eau chaude, fourni posé)', unite: 'm²', prix_min: 55, prix_median: 80, prix_max: 110, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '242.0', description: 'Ventilation double-flux (logement)', unite: 'm² SBP', prix_min: 50, prix_median: 75, prix_max: 105, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '244.0', description: 'PAC air-eau (fournie posée, 15kW)', unite: 'fft', prix_min: 25000, prix_median: 35000, prix_max: 50000, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 25 — Sanitaire
  { cfc_code: '251.0', description: 'Installation sanitaire (logement standard)', unite: 'm² SBP', prix_min: 55, prix_median: 80, prix_max: 110, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.0', description: 'WC suspendu (fourni posé)', unite: 'pce', prix_min: 1200, prix_median: 1800, prix_max: 2800, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.1', description: 'Lavabo (fourni posé, standard)', unite: 'pce', prix_min: 800, prix_median: 1200, prix_max: 2000, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '253.2', description: 'Douche de plain-pied (fournie posée)', unite: 'pce', prix_min: 2500, prix_median: 4000, prix_max: 6500, region_ref: 'CH moyenne', periode: '2025' },

  // CFC 27 — Aménagements intérieurs
  { cfc_code: '271.0', description: 'Chape ciment (60-80mm)', unite: 'm²', prix_min: 28, prix_median: 40, prix_max: 55, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '273.0', description: 'Carrelage sol (standard, 30×60)', unite: 'm²', prix_min: 65, prix_median: 95, prix_max: 140, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '274.0', description: 'Parquet chêne (fourni posé)', unite: 'm²', prix_min: 80, prix_median: 120, prix_max: 180, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '275.0', description: 'Peinture intérieure (2 couches, murs)', unite: 'm²', prix_min: 18, prix_median: 28, prix_max: 42, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '276.0', description: 'Plâtre projeté (murs)', unite: 'm²', prix_min: 22, prix_median: 32, prix_max: 45, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '276.1', description: 'Faux-plafond (plaques de plâtre)', unite: 'm²', prix_min: 55, prix_median: 80, prix_max: 110, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '281.0', description: 'Porte intérieure (bois, standard)', unite: 'pce', prix_min: 800, prix_median: 1200, prix_max: 1800, region_ref: 'CH moyenne', periode: '2025' },
  { cfc_code: '281.1', description: 'Porte coupe-feu EI30', unite: 'pce', prix_min: 1500, prix_median: 2200, prix_max: 3200, region_ref: 'CH moyenne', periode: '2025' },
];
```

### Crée le fichier : `lib/plans/estimation/reference-data/regional-coefficients.ts`

```typescript
export const REGIONAL_COEFFICIENTS: Record<string, number> = {
  'zurich': 1.00,
  'berne': 0.95,
  'bale': 0.98,
  'geneve': 1.05,
  'vaud': 1.02,
  'lausanne': 1.02,
  'valais': 0.90,
  'fribourg': 0.93,
  'neuchatel': 0.92,
  'tessin': 0.88,
  'lucerne': 0.97,
  'zoug': 0.97,
  'st-gall': 0.92,
  'thurgovie': 0.92,
  'grisons': 0.95,
  'jura': 0.88,
  'argovie': 0.96,
  'soleure': 0.94,
  'schaffhouse': 0.93,
  'appenzell': 0.90,
  'schwyz': 0.97,
  'obwald': 0.93,
  'nidwald': 0.93,
  'uri': 0.92,
  'glaris': 0.90,
};

export const RATIOS_M2_SBP: Record<string, { min: number; median: number; max: number; source: string }> = {
  'logement_collectif_standard': { min: 3200, median: 3800, max: 4800, source: 'CRB 2024' },
  'logement_collectif_standing': { min: 4500, median: 5500, max: 7500, source: 'CRB 2024' },
  'villa_individuelle': { min: 3800, median: 4800, max: 7000, source: 'CRB 2024' },
  'bureau_administratif': { min: 3500, median: 4200, max: 5500, source: 'CRB 2024' },
  'scolaire': { min: 4000, median: 4800, max: 6000, source: 'CRB 2024' },
  'commercial': { min: 2200, median: 3000, max: 4200, source: 'CRB 2024' },
  'industriel_entrepot': { min: 1500, median: 2200, max: 3200, source: 'CRB 2024' },
  'ems_institution': { min: 4500, median: 5500, max: 7000, source: 'CRB 2024' },
  'renovation_lourde': { min: 2500, median: 3500, max: 5500, source: 'CRB 2024' },
};
```

---

## PHASE 4 — CLIENTS IA MULTI-MODÈLE

### Crée le fichier : `lib/plans/estimation/ai-clients.ts`

Ce fichier expose 3 fonctions qui envoient un plan (image base64) avec
un prompt à chaque modèle et retournent le résultat JSON parsé.

Implémente les 3 clients :

1. **`callClaudeVision(imageBase64, mediaType, systemPrompt, userPrompt)`**
   - Utilise l'API Anthropic existante dans le projet (cherche comment
     les autres modules appellent Claude — probablement via `@anthropic-ai/sdk`)
   - Modèle : `claude-sonnet-4-5-20250514`
   - Max tokens : 8000
   - Envoie l'image en base64 avec `type: "image"`

2. **`callGPT4oVision(imageBase64, mediaType, systemPrompt, userPrompt)`**
   - Utilise le package `openai` qu'on vient d'installer
   - Modèle : `gpt-4o`
   - Max tokens : 8000
   - Envoie l'image via `image_url` avec `data:${mediaType};base64,${imageBase64}`

3. **`callGeminiVision(imageBase64, mediaType, systemPrompt, userPrompt)`**
   - Utilise le package `@google/generative-ai`
   - Modèle : `gemini-2.0-flash` (meilleur rapport qualité/prix pour la vision)
   - Max tokens : 8000
   - Envoie l'image via `inlineData`

Chaque fonction doit :
- Mesurer la latence (Date.now() avant/après)
- Parser le JSON de la réponse (avec gestion des ```json fences)
- Retourner `{ result, latency_ms, tokens_used, error }` — ne JAMAIS throw,
  retourner l'erreur dans le champ `error` pour que le consensus fonctionne
  même si un modèle échoue
- Logger l'appel dans la console : `[estimation] Claude: 3420ms, 2150 tokens`

---

## PHASE 5 — PROMPTS DES 4 PASSES

### Crée le fichier : `lib/plans/estimation/prompts.ts`

Ce fichier exporte les prompts système et utilisateur pour chaque passe.
Les prompts sont des fonctions qui prennent les paramètres nécessaires
et retournent les strings.

IMPORTANT : les prompts doivent être IDENTIQUES pour les 3 modèles
dans la Passe 2 (métré). Seul le format d'appel API change, pas le prompt.
C'est crucial pour que le consensus soit comparable.

Copie les prompts EXACTEMENT tels que définis dans le document
`CANTAIA_Prompt_Estimation_Prix_Plans.md` qui est à la racine du projet.
Ce document contient les prompts complets et optimisés pour chaque passe :
- Section 3 → Passe 1 (identification)
- Section 4 → Passe 2 (métré)
- Section 5 → Passe 3 (vérification)
- Section 6 → Passe 4 (chiffrage)

Les prompts sont longs et détaillés — c'est voulu. Ne les raccourcis pas.

---

## PHASE 6 — MOTEUR DE CONSENSUS

### Crée le fichier : `lib/plans/estimation/consensus-engine.ts`

Ce fichier prend les 3 résultats de métré (un par modèle) et produit
un métré consensuel.

Logique à implémenter :

```
function buildConsensus(metrages: ModelMetrage[]): ConsensusResult

Pour chaque code CFC trouvé dans au moins un métré :
  1. Collecter les quantités de chaque modèle pour ce poste
  2. Calculer la médiane des quantités
  3. Calculer l'écart de chaque modèle vs la médiane

  SI les 3 modèles ont ce poste ET écart max < 10% :
    → concordance_forte, prendre la médiane, confiance = "high"

  SI 2 modèles ont ce poste dans un écart < 15% et le 3ème diverge :
    → concordance_partielle, prendre la médiane des 2 concordants
    → marquer l'outlier, confiance = "medium"

  SI les 3 modèles ont ce poste mais écarts > 15% :
    → divergence, prendre la médiane des 3 quand même
    → confiance = "low", flag pour vérification manuelle

  SI seulement 2 modèles détectent ce poste :
    → detection_double, prendre la moyenne des 2
    → confiance = "medium"

  SI seulement 1 modèle détecte ce poste :
    → detection_unique, garder la valeur mais confiance = "low"
    → ajouter une note "Détecté uniquement par {provider}"

Fusionner le tout dans un Passe2Result unifié (metrage_fusionne)
avec les confiances mises à jour selon le consensus.

Calculer les stats globales :
  - concordance_forte_pct
  - concordance_partielle_pct
  - divergence_pct
  - score_consensus_global (moyenne pondérée par montant des confiances)
```

---

## PHASE 7 — RÉSOLVEUR DE PRIX

### Crée le fichier : `lib/plans/estimation/price-resolver.ts`

Ce fichier résout le prix unitaire pour chaque poste en suivant
la hiérarchie stricte des sources.

```
async function resolvePrice(params: {
  cfc_code: string;
  description: string;
  unite: string;
  region: string;
  quarter: string;  // ex: "2026-Q1"
  org_id: string;
}): Promise<PrixUnitaire>

Hiérarchie (DANS CET ORDRE, s'arrêter dès qu'une source répond) :

1. Historique interne (table offer_line_items via supplier_offers)
   - Chercher les prix des 12 derniers mois pour ce CFC + cette org
   - Si ≥ 2 datapoints : calculer min/médian/max
   - Source = "historique_interne"

2. Benchmark Cantaia (table market_benchmarks)
   - Chercher pour ce CFC + cette région + ce trimestre
   - Vérifier contributor_count ≥ 3
   - Source = "benchmark_cantaia"

3. Référentiel CFC (fichier cfc-prices.ts)
   - Chercher par cfc_code exact, puis par préfixe (ex: 215 si 215.3 pas trouvé)
   - Appliquer le coefficient régional
   - Source = "referentiel_crb"

4. Si aucune source trouvée :
   - Source = "prix_non_disponible"
   - min/median/max = null
   - detail = "Aucune référence — demander un devis fournisseur"
```

NOTE : ne PAS implémenter de fallback "estimation_ia" dans le resolver.
Les prix IA seront gérés séparément par un appel multi-modèle dans le
pipeline principal, uniquement pour les postes "prix_non_disponible".

---

## PHASE 8 — ORCHESTRATEUR DU PIPELINE

### Crée le fichier : `lib/plans/estimation/pipeline.ts`

C'est le fichier principal qui orchestre les 4 passes.

```
async function runEstimationPipeline(params: {
  plan_id: string;
  project_id: string;
  org_id: string;
  image_base64: string;
  media_type: string;
  region: string;
  type_batiment: string;
  acces_chantier: 'normal' | 'difficile' | 'tres_difficile';
  periode_travaux: string;
}): Promise<EstimationPipelineResult>

Étapes :

1. PASSE 1 — Identification (Claude seul, rapide)
   - Appeler callClaudeVision avec le prompt Passe 1
   - Parser le résultat → Passe1Result
   - Si qualite_image === "basse", ajouter un avertissement global

2. PASSE 2 — Métré multi-modèle (3 modèles en parallèle)
   - Construire le prompt Passe 2 en incluant le résultat Passe 1
   - Lancer Promise.all([
       callClaudeVision(prompt_passe2),
       callGPT4oVision(prompt_passe2),
       callGeminiVision(prompt_passe2),
     ])
   - Si un modèle échoue, continuer avec les 2 autres
   - Si 2 modèles échouent, continuer avec 1 seul (dégradé gracieux)

3. CONSENSUS
   - Appeler buildConsensus() avec les résultats des 3 modèles
   - Le résultat est un métré consensuel avec scores de confiance

4. PASSE 3 — Vérification (Claude seul, texte)
   - Envoyer le métré consensuel au prompt Passe 3 (pas besoin de Vision)
   - Inclure la surface_brute_plancher et le type_batiment
   - Parser le résultat → Passe3Result
   - Si des éléments manquants sont détectés, les ajouter au métré
     avec confiance "assumption"

5. PASSE 4 — Chiffrage
   - Pour chaque poste du métré vérifié :
     a. Appeler resolvePrice() pour obtenir le prix unitaire
     b. Si source === "prix_non_disponible", collecter ces postes
   - Pour les postes sans prix :
     Optionnel : lancer un appel multi-modèle (Claude + GPT-4o + Gemini)
     en parallèle pour estimer le prix. Prendre la médiane des 3.
     Source = "consensus_multi_ia", confiance = 0.45
   - Calculer tous les totaux, sous-totaux, frais généraux, etc.
   - Calculer le score de fiabilité global
   - Comparer le prix/m² SBP aux ratios de référence

6. SAUVEGARDE
   - Sauvegarder le résultat complet dans plan_estimates (table existante)
     ou dans une nouvelle table plan_estimation_v2 si la structure est
     trop différente de l'existante
   - Logger les métriques du pipeline dans api_usage_logs

7. RETOURNER EstimationPipelineResult
```

---

## PHASE 9 — ROUTE API

### Crée le fichier : `app/api/plans/estimate-v2/route.ts`

Route POST qui :
1. Vérifie l'authentification (session Supabase)
2. Récupère le plan depuis Supabase Storage (ou reçoit le base64 en body)
3. Valide les paramètres (region, type_batiment, etc.)
4. Appelle `runEstimationPipeline()`
5. Retourne le résultat JSON
6. Gère les erreurs proprement (try/catch, status codes appropriés)

Le body attendu :
```json
{
  "plan_id": "uuid",
  "project_id": "uuid",
  "region": "vaud",
  "type_batiment": "logement_collectif_standard",
  "acces_chantier": "normal",
  "periode_travaux": "2026-Q2"
}
```

L'image est récupérée depuis Supabase Storage via le plan_id
(cherche dans plan_versions la dernière version, récupère le file_path,
télécharge depuis Supabase Storage, convertis en base64).

---

## PHASE 10 — CALCUL DU SCORE DE FIABILITÉ

### Crée le fichier : `lib/plans/estimation/confidence-calculator.ts`

Implémente la formule de score de fiabilité :

```
score_global = Σ (poids_poste × score_source × score_quantite) / Σ poids_poste

poids_poste = montant_median_du_poste / total_median_global

score_source :
  historique_interne = 1.0
  benchmark_cantaia = 0.85
  referentiel_crb = 0.70
  consensus_multi_ia = 0.45
  ratio_estimation = 0.45
  estimation_ia = 0.25
  prix_non_disponible = 0.0

score_quantite :
  high = 1.0
  medium = 0.80
  low = 0.50
  assumption = 0.30

Affichage :
  ≥ 80 : "Estimation haute fiabilité"
  60-79 : "Estimation fiable — quelques postes à confirmer"
  40-59 : "Estimation indicative — à consolider"
  < 40 : "Pré-estimation — plans complémentaires nécessaires"
```

Exporte aussi une fonction `calculateSourceDistribution()` qui calcule
le pourcentage du montant total couvert par chaque source.

---

## PHASE 11 — COMPOSANT UI (React)

### Crée le fichier : `app/plans/components/EstimationResultV2.tsx`

Composant React (shadcn/ui + Tailwind) qui affiche le résultat de l'estimation.

Structure de l'interface :

1. **En-tête** :
   - Score de fiabilité global (gros chiffre + couleur + label)
   - Barre de progression colorée montrant la répartition des sources
     (vert = historique, bleu = benchmark, jaune = CRB, orange = ratio, rouge = IA)
   - Total estimé en fourchette : "1'250'000 — 1'480'000 — 1'720'000 CHF"
   - Prix/m² SBP avec comparaison marché

2. **Tableau par CFC** (accordéon, un groupe par code CFC principal) :
   - En-tête CFC : code + libellé + sous-total fourchette
   - Lignes postes avec :
     - Badge source coloré (🟢🔵🟡🟠🔴⬜)
     - Description + quantité + unité
     - Prix unitaire (fourchette)
     - Total (fourchette)
     - Badge consensus ("3/3", "2/3", "1/3") si multi-modèle
     - Score confiance combiné
   - Les postes "flag" ou "divergence" sont surlignés en orange

3. **Panneau latéral ou section "Alertes"** :
   - Éléments manquants détectés
   - Postes à risque
   - Doublons potentiels
   - Prochaines étapes recommandées

4. **Section "Transparence"** :
   - Stats du pipeline (durée, modèles utilisés, coût)
   - Stats consensus (% concordance forte/partielle/divergence)
   - Détail par modèle expandable pour chaque poste

5. **Actions** :
   - Bouton "Exporter PDF" (prévu)
   - Bouton "Exporter DOCX" (prévu)
   - Bouton "Relancer l'estimation" (relance le pipeline)

Utilise les couleurs CANTAIA :
- Navy : #0A1F30
- Gold : #C4A661
- Parchment : #F5F2EB
- Steel : #8A9CA8

Formatte les montants en CHF suisse (apostrophe comme séparateur de milliers,
pas d'espace, pas de virgule : 1'250'000).

---

## ORDRE D'EXÉCUTION

Travaille dans cet ordre exact :
1. Phase 2 — Types (c'est la base, tout le reste en dépend)
2. Phase 3 — Données de référence
3. Phase 4 — Clients IA multi-modèle
4. Phase 5 — Prompts
5. Phase 6 — Moteur de consensus
6. Phase 7 — Résolveur de prix
7. Phase 10 — Calcul fiabilité
8. Phase 8 — Orchestrateur pipeline
9. Phase 9 — Route API
10. Phase 11 — Composant UI

Après chaque phase, fais un `console.log` de test pour vérifier
que le fichier compile sans erreur TypeScript.

---

## CONTRAINTES

- Ne modifie PAS les fichiers existants des autres modules sauf si
  strictement nécessaire (ex: ajouter un import dans un fichier de routes)
- Tous les nouveaux fichiers vont dans `lib/plans/estimation/`
  sauf la route API et le composant UI
- Gère TOUJOURS les erreurs — un modèle qui échoue ne doit JAMAIS
  crasher le pipeline
- Tous les appels API externes (Claude, GPT-4o, Gemini) doivent être
  en parallèle quand c'est possible (Promise.all)
- Les prix sont TOUJOURS en CHF HT
- Le formatage des montants est TOUJOURS suisse : 1'234'567 CHF
- Les commentaires dans le code sont en français
