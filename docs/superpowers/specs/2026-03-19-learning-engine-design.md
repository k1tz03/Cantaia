# Cantaia Learning Engine — Design Specification

> **Date:** 2026-03-19
> **Auteur:** Julien Ray + Claude
> **Statut:** Draft — En attente de validation
> **Objectif:** Transformer Cantaia d'un outil d'analyse statique en une plateforme d'intelligence qui apprend de chaque interaction utilisateur

---

## 1. Problème

Cantaia possède des milliers de données (prix, plans, emails, corrections) mais l'IA est amnésique. Chaque analyse repart de zéro. Les corrections manuelles sont stockées mais ne nourrissent pas les modèles. Les tables d'intelligence (C1/C2/C3) existent mais ne sont pas injectées dans les pipelines IA.

**Conséquence :** Les résultats IA restent au même niveau de précision quel que soit le volume de données accumulé. Le système ne tire pas parti de son propre historique.

## 2. Vision

Créer un **flywheel d'intelligence** : chaque interaction (correction de prix, analyse de plan, classification d'email, projet terminé) rend le système plus précis. Plus l'utilisateur utilise Cantaia, plus les résultats sont fiables, ce qui encourage plus d'usage.

**Cible à 12 mois :** Une organisation avec 6 mois d'historique obtient des estimations à ±8% (vs ±25-40% aujourd'hui avec CRB générique).

## 3. Audience

- **Directeurs généraux / CEO** : ROI visible, gains de temps, réduction des risques budgétaires
- **Chefs de projet construction** : précision des chiffres, planning réaliste calibré sur leur expérience, alertes proactives

## 4. Principes de design

1. **Chaque interaction est une donnée** — rien ne se perd
2. **L'apprentissage est invisible** — le système s'améliore sans effort conscient de l'utilisateur
3. **La transparence est totale** — l'utilisateur voit d'où vient chaque chiffre et pourquoi
4. **L'effet réseau crée le moat** — plus d'organisations = meilleures données pour tous
5. **YAGNI** — on câble l'existant avant de créer du nouveau

---

## 5. Section 1 — Boucle Prix

### 5.1 Capture exhaustive des événements prix

Chaque interaction contenant un signal prix est interceptée et stockée.

| Événement | Déclencheur | Données capturées | Table cible |
|-----------|-------------|-------------------|-------------|
| Offre fournisseur reçue | `POST /api/submissions/receive-quote` | Tous les `offer_line_items` : CFC, description, prix unitaire, unité | `offer_line_items` (existe) |
| Offre retenue (adjudication) | Bouton "Attribuer" sur ComparisonTab | Prix retenus marqués `is_awarded=true` + auto-calibration déclenchée | `price_calibrations` (existe, jamais alimentée auto) |
| Correction manuelle de prix | Modal correction sur EstimationResultV2 | Prix estimé vs prix réel, écart, CFC, discipline | `price_calibrations` (existe) |
| Import de prix historiques | Cantaia Prix > Import | Lignes importées avec source, date, fournisseur | `ingested_offer_lines` (existe) |
| Email avec prix détecté | Sync Outlook > `isPriceResponseEmail()` | Prix extraits automatiquement, liés au fournisseur | `offer_line_items` (partiellement câblé) |

**Manque clé :** L'adjudication ne déclenche rien. `auto-calibration.ts` existe mais n'est appelé nulle part. Câbler sur l'événement "Attribuer".

### 5.2 Price Resolver V3 — scoring multi-critères

Remplacer le matching binaire (match/no match) par un scoring de pertinence :

```
score = 0
+ 40 pts  CFC code exact match
+ 25 pts  CFC prefix match (211.3 → 211)
+ 20 pts  keyword overlap ≥60% sur descriptions
+ 10 pts  même unité
+ 5 pts   même région
+ bonus   temporal decay : <6 mois ×1.0, 6-12 mois ×0.8, >12 mois ×0.6

Seuil minimum : 35 pts
Résultat : top 30 par score, percentiles pondérés par score
```

**Fichier impacté :** `packages/core/src/plans/estimation/price-resolver.ts`

### 5.3 Auto-calibration câblée

Quand un fournisseur est retenu dans Soumissions :
1. Comparer chaque `offer_line_item` retenu avec l'estimation budget
2. Calculer coefficient de correction : `coeff = prix_réel / prix_estimé`
3. Stocker dans `price_calibrations` (CFC, description, unité, région)
4. Le price-resolver applique ce coefficient en Tier 1 pour les futurs devis

**Fichiers impactés :**
- `packages/core/src/plans/estimation/auto-calibration.ts` (existe, connecter)
- `apps/web/src/app/api/submissions/[id]/route.ts` (trigger sur status=awarded)

### 5.4 Indexation inflation

Appliquer un ajustement temporel aux prix de référence :

```typescript
prix_ajusté = prix_ref × (1 + taux_inflation_annuel) ^ années_écoulées
// taux_inflation_annuel = 0.028 (2.8% construction CH 2025)
// Configurable par org dans pricing_config
```

**Fichier impacté :** `packages/core/src/plans/estimation/price-resolver.ts` (Tier 5 CRB + Tier 2/3 historique)

### 5.5 Feedback UI prix

Bannière en haut de chaque estimation budget :
- Compteur de prix dans la base org
- Précision moyenne (calculée depuis `price_calibrations`)
- Répartition des sources (% historique interne / marché / CRB / IA)
- Sparkline évolution mensuelle

**Fichier impacté :** `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx` (onglet Budget IA)

---

## 6. Section 2 — Boucle Plans

### 6.1 Pondération dynamique des modèles

Après chaque correction de quantité via `QuantityCorrectionModal` :
1. Identifier quel modèle avait la valeur la plus proche (données dans `valeurs_par_modele`)
2. Mettre à jour `model_error_profiles` : écart moyen par modèle × discipline × type CFC

Formule de poids :
```
poids = 1 / (1 + ecart_moyen_pct / 10)
normalisé : somme des 3 poids = 3.0
```

Injection : le consensus engine lit `model_error_profiles` au début de chaque analyse et passe les poids à `buildConsensus()`.

**Fichiers impactés :**
- `packages/core/src/plans/estimation/consensus-engine.ts` (lire les poids)
- `apps/web/src/app/api/plans/corrections/route.ts` (mettre à jour model_error_profiles)
- `packages/core/src/plans/estimation/dynamic-confidence.ts` (déjà partiellement implémenté)

### 6.2 Profils bureau d'architecte

À chaque analyse (Passe 1), extraire `auteur_bureau` du cartouche. Alimenter `bureau_profiles` :

| Champ | Description |
|-------|-------------|
| `bureau_name` | Nom du bureau (normalisé) |
| `plans_analyzed` | Compteur incrémental |
| `avg_quality_score` | Moyenne qualité image |
| `cotation_reliability` | Fiabilité des cotations (0-1) |
| `common_omissions` | Éléments souvent manquants (JSONB array) |
| `quantity_bias` | Biais moyen sur les quantités (%) |
| `best_model` | Modèle IA le plus fiable pour ce bureau |

Injection dans le prompt Passe 2 : contexte bureau ajouté si ≥3 plans analysés.

**Fichiers impactés :**
- `packages/core/src/plans/estimation/pipeline.ts` (injection prompt)
- `packages/core/src/plans/estimation/calibration-engine.ts` (alimentation profil)
- `apps/web/src/app/api/plans/estimate-v2/route.ts` (lecture profil)

### 6.3 Seuils de consensus adaptatifs

Remplacer les seuils fixes (10%/15%) par des seuils par discipline :

| Discipline | Concordance forte | Concordance partielle |
|------------|-------------------|----------------------|
| Béton, acier (structurel) | ≤5% | ≤10% |
| Surfaces (sols, peinture) | ≤8% | ≤15% |
| Électricité, CVC (comptage) | ≤12% | ≤20% |
| Finitions, aménagement | ≤15% | ≤25% |

Initialement hardcodés, puis affinés automatiquement depuis `model_error_profiles`.

**Fichier impacté :** `packages/core/src/plans/estimation/consensus-engine.ts`

### 6.4 Cross-plan verification connectée

Quand un projet a ≥2 plans analysés de disciplines différentes :
1. Appeler `crossPlanVerification()` automatiquement
2. Vérifier cohérence (surface étage ≈ surface fondation, volume béton cohérent)
3. Afficher résultats en bannière (cohérences vertes, écarts orange)
4. Bonus confiance +0.10 si cross-verification passe

**Fichiers impactés :**
- `packages/core/src/plans/estimation/cross-plan-verification.ts` (existe, connecter)
- `apps/web/src/app/api/plans/estimate-v2/route.ts` (trigger après Passe 4)
- `apps/web/src/components/plans/PlanAlertsBanner.tsx` (affichage)

### 6.5 Feedback UI plans

Sur la page résultat d'estimation :
- Score consensus coloré (vert/jaune/rouge)
- Tooltip par poste : valeurs des 3 modèles + médiane pondérée
- Badge modèle dominant par discipline
- Alerte si bureau connu + nombre de plans analysés
- Micro-animation après correction : "Précision améliorée de X%"

---

## 7. Section 3 — Boucle Planning

### 7.1 Claude valide et enrichit le planning

Après la génération algorithmique, une Passe IA via Claude Sonnet :

**Input :** planning complet (phases, tâches, durées, dépendances) + contexte projet (budget, surface, corps de métier) + données historiques org (durées réelles vs estimées, facteur moyen de dépassement)

**Output structuré :**
1. `duration_corrections[]` — tâches avec durée irréaliste + durée corrigée + justification
2. `missing_dependencies[]` — liens SS/FF/SF manquants entre tâches
3. `risks[]` — 3-5 risques avec probabilité et impact en jours
4. `recommendations[]` — optimisations (overlaps, fast-tracking, anticipations)
5. `summary` — paragraphe en langage naturel

Les corrections sont appliquées automatiquement, puis CPM recalculé.

**Fichiers impactés :**
- `packages/core/src/planning/planning-generator.ts` (ajout passe IA post-génération)
- `apps/web/src/app/api/planning/generate/route.ts` (appel Claude)
- Nouveau champ `ai_risks` (JSONB) sur `planning_tasks`

### 7.2 Activation des dépendances intra-phase

Activer les 23 règles de `dependency-rules.ts` dans le générateur :

| Exemple | Type | Lag |
|---------|------|-----|
| Ferraillage → Béton coulage | FS | 0j |
| Fenêtres → Électricité encastrée | SS | +5j |
| Chapes → Revêtements sols | FS | +21j (séchage) |
| Électricité finitions → Peinture | FF | -3j |

Après agrégation en tâches synthétiques, scanner les paires CFC dans `DEPENDENCY_RULES` et créer les dépendances. Recalculer CPM.

**Impact attendu :** Planning passe de ~118j (optimiste) à ~145-160j (réaliste).

**Fichiers impactés :**
- `packages/core/src/planning/planning-generator.ts` (injection dépendances)
- `packages/core/src/planning/dependency-rules.ts` (existe, lire)
- `packages/core/src/planning/critical-path.ts` (recalcul avec SS/FF)

### 7.3 Calibration depuis les projets terminés

Quand un projet passe en statut `completed` :
1. Comparer durée planifiée vs durée réelle par tâche/phase
2. Calculer ratio de correction par corps de métier
3. Stocker dans `planning_duration_corrections` (existe, jamais alimentée)
4. Les prochains plannings utilisent ce ratio au lieu du CRB brut

**Fichiers impactés :**
- `apps/web/src/app/api/projects/[id]/route.ts` (trigger sur status=completed)
- `packages/core/src/planning/duration-calculator.ts` (lire corrections org)
- Nouveau composant UI : modal "Enregistrer les durées réelles" post-projet

### 7.4 Facteurs contextuels injectés

| Facteur | Source | Impact |
|---------|--------|--------|
| Délais de livraison | `supplier_offers.delivery_delay` historique | Tâche "Commande X" ajoutée N semaines avant pose |
| Fiabilité fournisseur | `suppliers.reliability_score` | Score <70% → buffer +15% durée |
| Complexité site | Input utilisateur (accès, étages, zone) | Facteur multiplicatif |
| Capacité équipe | Input utilisateur (effectifs par corps) | Override team_size CRB |

**Fichiers impactés :**
- `packages/core/src/planning/planning-generator.ts` (paramètres config élargis)
- `apps/web/src/components/planning/GanttConfigModal.tsx` (inputs utilisateur)

### 7.5 Résumé IA en langage naturel

Paragraphe généré par Claude affiché en bannière au-dessus du Gantt. Inclut : durée totale, chemin critique, risques météo/saisonniers, suggestions d'optimisation, alertes fournisseurs.

### 7.6 Feedback UI planning

- Bannière calibration : "Planning calibré sur N projets" ou "Basé sur CRB standard"
- Indicateur confiance par tâche (vert=calibré org, jaune=CRB, rouge=fallback)
- Tooltip sur chaque barre : durée + CRB + historique org + facteur saisonnier
- Notification post-projet : "Voulez-vous enregistrer les durées réelles ?"

---

## 8. Section 4 — Boucle Classification + Effet Réseau

### 8.1 Classification qui apprend en continu

Quand un utilisateur reclasse un email :

1. **Règle par expéditeur** : 2 reclassements du même expéditeur → règle automatique dans `email_classification_rules`
2. **Règle par mot-clé** : 3 reclassements avec même mot-clé dans l'objet → règle automatique
3. **Pondération temporelle** : règle confirmée 5× ce mois > règle de 6 mois sans reconfirmation
4. **Patterns temporels** : emails avant 8h = 3× plus souvent urgents → signal L2

**Cible :** Après 100 corrections, L1 capture 60% des emails → économie tokens Claude.

**Fichiers impactés :**
- `packages/core/src/emails/classification-learning.ts` (enrichir `learnFromClassificationAction`)
- `apps/web/src/app/[locale]/(app)/mail/page.tsx` (trigger sur reclassement)

### 8.2 Extraction de valeur enrichie des emails

Enrichir le prompt de classification L3 pour extraire des signaux en parallèle :

```json
{
  "classification": "action_required",
  "confidence": 0.92,
  "signals": {
    "prices_detected": [{"description": "...", "prix": 4.50, "unite": "ml"}],
    "deadlines_detected": [{"text": "livraison semaine 22", "date": "2026-05-25"}],
    "supplier_match": "Müller Elektro AG",
    "delay_detected": false,
    "order_confirmation": false
  }
}
```

Coût supplémentaire : ~0 (même appel Claude, +200 tokens output).

**Fichiers impactés :**
- `packages/core/src/ai/email-classifier.ts` (enrichir prompt + parsing)
- `packages/core/src/ai/prompts.ts` (prompt enrichi)

### 8.3 Effet réseau Cross-Org (C2)

Injecter les données C2 dans l'expérience utilisateur :

**Prix marché :** À côté de chaque poste budgétaire, afficher "Marché romand : 280-350 CHF/m³ (12 entreprises)" si opt-in actif.

**Scores fournisseurs :** "Score marché 82/100 basé sur 47 projets de la région" dans la fiche fournisseur.

**Indice régional :** "Prix béton Suisse romande +4.2% ce trimestre" dans le briefing et les estimations.

**Fichiers impactés :**
- `apps/web/src/app/api/submissions/[id]/estimate-budget/route.ts` (enrichir avec C2)
- `apps/web/src/components/suppliers/` (afficher scores C2)
- `packages/core/src/briefing/briefing-generator.ts` (inclure tendances C2)

### 8.4 Dashboard d'intelligence collective

Nouveau composant `IntelligenceDashboard.tsx` affiché sur Dashboard et Direction :

- Compteurs org : prix, plans, projets calibrés, emails classifiés
- Compteurs marché C2 : prix collectifs, fournisseurs évalués, tendances
- Journal d'apprentissage : dernières améliorations du système
- Score de maturité IA (voir Section 5.5)

### 8.5 Gamification de la contribution

- Micro-animation après chaque correction
- Milestones : "100 prix vérifiés — précision passée de 78% à 91%"
- Incentive opt-in C2 : "Activez le partage → accédez à 12'400 prix"
- Score organisation visible

---

## 9. Section 5 — Innovations Wow

### 9.1 Simulation Monte Carlo sur le budget

Pour chaque poste, simuler 10'000 scénarios :

```
quantité ~ Normal(médiane_consensus, écart_type_consensus)
prix     ~ Normal(médiane_prix, écart_type_prix)
total    = Σ(quantité_i × prix_i)
```

Écart-type par source :
- Tier 1 (historique ≥5 prix) → écart-type réel observé
- Tier 5 (CRB) → (max - min) / 4
- Tier 6 (IA) → médiane × 0.20

Affichage : histogramme de distribution + intervalles P50/P80/P95 + identification des 3 postes qui concentrent le plus d'incertitude + recommandation actionnable.

**Implémentation :** Pure JavaScript côté client, <100ms pour 10'000 itérations. Composant Recharts (AreaChart).

**Fichier impacté :** Nouveau composant `apps/web/src/components/submissions/MonteCarloChart.tsx`

### 9.2 Multi-plan correlation (vérification 3D)

Quand un projet a ≥2 plans analysés de disciplines différentes, croiser automatiquement :

| Plan A × Plan B | Vérification |
|-----------------|-------------|
| Étage × Coupe | Surface × hauteur = volume cohérent |
| Étage × Fondation | Emprise sol ≈ fondation (±débords) |
| Architecture × Structure | Surfaces portantes cohérentes |
| Architecture × Façade | Périmètre × hauteur ≈ surface façade |
| Architecture × CVC | Pièces ≈ bouches ventilation |

Résultat : bannière cohérences (vert) + écarts (orange) + suggestions de plans complémentaires.

**Fichier impacté :** `packages/core/src/plans/estimation/cross-plan-verification.ts` (existe, connecter au pipeline)

### 9.3 Alertes intelligentes proactives

Un appel Claude après chaque estimation/planning avec contexte complet :

**Budget :** alertes prix anormaux, tendances marché, fournisseurs recommandés
**Planning :** risques chemin critique, risques météo, optimisations fast-tracking

Output JSON structuré → composant `AlertsBanner.tsx` avec sévérité rouge/jaune/vert.

**Fichiers impactés :**
- Nouvelle route `POST /api/ai/generate-alerts`
- Nouveau composant `apps/web/src/components/ui/IntelligentAlerts.tsx`

### 9.4 Résumé exécutif IA

Bouton "Générer le résumé exécutif" qui produit un document d'une page :
- Budget (estimation, P80, confiance, positionnement marché)
- Planning (durée, livraison, chemin critique)
- Top 3 risques avec impact
- Top 3 opportunités
- Intelligence Cantaia (volume de données utilisé)

Exportable en PDF (jspdf).

**Fichiers impactés :**
- Nouvelle route `POST /api/ai/executive-summary`
- Nouveau composant dans la page projet

### 9.5 Score de maturité IA par organisation

Composant montrant la progression :
- 5 barres de progression : Prix, Plans, Planning, Emails, Fournisseurs
- Score global /100
- Prochains paliers à atteindre
- Impact sur la précision

Calculé depuis les compteurs réels (tables existantes).

**Fichier impacté :** Nouveau composant `apps/web/src/components/app/IntelligenceScore.tsx`

---

## 10. Tables et champs impactés

### Tables existantes utilisées (aucune migration)

| Table | Usage |
|-------|-------|
| `offer_line_items` | Tier 1 prix, auto-calibration source |
| `ingested_offer_lines` | Tier 3 prix |
| `market_benchmarks` | Tier 4 + affichage C2 |
| `price_calibrations` | Auto-calibration stockage + calcul précision |
| `model_error_profiles` | Pondération modèles |
| `bureau_profiles` | Profils bureau architecte |
| `planning_duration_corrections` | Calibration planning org |
| `quantity_corrections` | Calcul écart modèles |
| `email_classification_rules` | Règles locales auto-créées |
| `email_classification_feedback` | Source apprentissage classification |
| `aggregation_consent` | Gate pour données C2 |
| `supplier_market_scores` | Scores fournisseurs C2 |
| `regional_price_index` | Tendances prix C2 |

### Nouveaux champs (migration légère)

| Table | Champ | Type | Description |
|-------|-------|------|-------------|
| `planning_tasks` | `ai_risks` | JSONB | Risques identifiés par Claude |
| `planning_tasks` | `ai_duration_correction` | integer | Correction durée suggérée par IA |
| `project_plannings` | `ai_summary` | text | Résumé en langage naturel |
| `project_plannings` | `ai_recommendations` | JSONB | Recommandations IA structurées |
| `organizations` | `intelligence_score` | integer | Score maturité IA (0-100) |
| `organizations` | `inflation_rate` | decimal | Taux inflation construction configurable |

---

## 11. Nouveaux fichiers à créer

| Fichier | Rôle |
|---------|------|
| `apps/web/src/components/submissions/MonteCarloChart.tsx` | Histogramme simulation Monte Carlo |
| `apps/web/src/components/app/IntelligenceDashboard.tsx` | Dashboard apprentissage IA |
| `apps/web/src/components/app/IntelligenceScore.tsx` | Score maturité org |
| `apps/web/src/components/ui/IntelligentAlerts.tsx` | Alertes proactives budget/planning |
| `apps/web/src/app/api/ai/generate-alerts/route.ts` | Route alertes intelligentes |
| `apps/web/src/app/api/ai/executive-summary/route.ts` | Route résumé exécutif |
| `packages/database/migrations/056_learning_engine.sql` | Migration nouveaux champs |

---

## 12. Fichiers existants modifiés

| Fichier | Modifications |
|---------|--------------|
| `packages/core/src/plans/estimation/price-resolver.ts` | V3 scoring multi-critères + inflation |
| `packages/core/src/plans/estimation/consensus-engine.ts` | Poids dynamiques + seuils adaptatifs |
| `packages/core/src/plans/estimation/pipeline.ts` | Injection profil bureau + cross-plan |
| `packages/core/src/plans/estimation/auto-calibration.ts` | Câbler trigger adjudication |
| `packages/core/src/plans/estimation/cross-plan-verification.ts` | Connecter au pipeline |
| `packages/core/src/plans/estimation/dynamic-confidence.ts` | Lire model_error_profiles |
| `packages/core/src/planning/planning-generator.ts` | Dépendances intra-phase + passe IA + calibration org |
| `packages/core/src/planning/critical-path.ts` | Support SS/FF/SF (pas seulement FS) |
| `packages/core/src/emails/classification-learning.ts` | Création auto de règles |
| `packages/core/src/ai/email-classifier.ts` | Extraction signaux enrichie |
| `packages/core/src/briefing/briefing-generator.ts` | Tendances C2 |
| `apps/web/src/app/api/planning/generate/route.ts` | Passe IA post-génération |
| `apps/web/src/app/api/plans/corrections/route.ts` | MAJ model_error_profiles |
| `apps/web/src/app/api/plans/estimate-v2/route.ts` | Lecture profil bureau |
| `apps/web/src/app/api/submissions/[id]/estimate-budget/route.ts` | Enrichir avec C2 + feedback |
| `apps/web/src/app/api/submissions/[id]/route.ts` | Trigger auto-calibration sur awarded |
| `apps/web/src/app/api/projects/[id]/route.ts` | Trigger calibration planning sur completed |
| `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx` | Monte Carlo + alertes + feedback |
| `apps/web/src/app/[locale]/(app)/projects/[id]/planning/page.tsx` | Résumé IA + alertes + calibration |
| `apps/web/src/components/planning/GanttConfigModal.tsx` | Inputs contextuels (effectifs, complexité) |
| `apps/web/src/components/plans/PlanAlertsBanner.tsx` | Cross-plan alerts |
| `apps/web/src/app/[locale]/(app)/mail/page.tsx` | Trigger apprentissage sur reclassement |

---

## 13. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|------------|--------|-----------|
| Boucle de feedback négative (corrections erronées dégradent le modèle) | Moyenne | Haute | Seuil minimum de corrections (≥3) avant d'appliquer, outlier detection |
| Coût API Claude pour passe planning | Basse | Moyenne | ~$0.02 par planning (1 appel Sonnet), négligeable |
| Performance Monte Carlo sur gros budgets (500+ postes) | Basse | Basse | Web Worker si >200 postes, sinon <100ms |
| Tables C2 vides (pas assez d'orgs opt-in) | Haute | Moyenne | Fallback gracieux : "Données marché insuffisantes, basé sur CRB" |
| Bureau profile avec peu de données (<3 plans) | Moyenne | Basse | Ne pas injecter dans le prompt si <3 plans, afficher "Profil en cours de construction" |

---

## 14. Métriques de succès

| Métrique | Baseline actuel | Cible 6 mois | Mesure |
|----------|----------------|-------------|--------|
| Précision budget (écart estimation vs réel) | ±25-40% | ±8-12% | `price_calibrations` ratio moyen |
| Précision planning (écart durée planifiée vs réelle) | ±40-50% | ±15-20% | `planning_duration_corrections` ratio moyen |
| Classification auto sans Claude (L1+L2) | ~30% | 60%+ | Compteur dans sync route |
| Couverture Tier 1 prix (historique interne) | ~15% des postes | 50%+ | Source breakdown dans estimate-budget |
| Score maturité IA moyen | N/A | 70/100 | `organizations.intelligence_score` |
| Temps moyen avant intervention utilisateur | N/A | -40% | Métriques usage |
