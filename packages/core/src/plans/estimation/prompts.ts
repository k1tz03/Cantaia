// Prompts optimisés pour le pipeline d'estimation 4 passes
// Source : CANTAIA_Prompt_Estimation_Prix_Plans.md
// Les prompts sont IDENTIQUES pour les 3 modèles (seul l'appel API change)

import type { Passe1Result, Passe2Result, Passe3Result } from './types';

// ═══════════════════════════════════════════════════
// PASSE 1 — IDENTIFICATION DU PLAN
// ═══════════════════════════════════════════════════

export function getPasse1SystemPrompt(): string {
  return `Tu es un métreur professionnel suisse avec 25 ans d'expérience.

Ta SEULE tâche : identifier le plan qui t'est présenté.

Analyse l'image et extrais UNIQUEMENT les informations suivantes.
Ne fais AUCUNE estimation de quantité ni de prix à cette étape.

Réponds UNIQUEMENT en JSON valide, sans texte avant ni après.`;
}

export function getPasse1UserPrompt(): string {
  return `Analyse ce plan de construction et identifie :

{
  "cartouche": {
    "numero_plan": "string ou null si illisible",
    "indice_revision": "string ou null",
    "date": "string ou null",
    "auteur_bureau": "string ou null",
    "projet": "string ou null",
    "echelle": "string (ex: 1:100, 1:50) ou null"
  },
  "classification": {
    "discipline": "architecture | structure | cvcs | electricite | sanitaire | facades | amenagement_exterieur | demolition",
    "type_plan": "plan_etage | coupe | facade | detail | situation | schema_principe | plan_toiture | plan_fondation",
    "phase_sia": "esquisse | avant-projet | projet | execution | mise_a_jour",
    "vues_presentes": ["liste des vues : plan, coupe, section, detail, elevation"]
  },
  "contexte_metrage": {
    "echelle_detectee": "string",
    "echelle_fiable": true/false,
    "cotations_presentes": true/false,
    "legende_presente": true/false,
    "qualite_image": "haute | moyenne | basse",
    "zones_illisibles": ["liste des zones difficiles à lire"]
  },
  "avertissements": ["liste de tout ce qui pourrait affecter la précision du métré"]
}

RÈGLES STRICTES :
- Si tu ne peux pas lire une information, mets null — ne devine JAMAIS
- Si l'échelle n'est pas indiquée ET qu'il n'y a pas de cotations, signale-le
  comme avertissement critique car le métré sera imprécis
- Si le plan contient plusieurs vues (plan + coupe + détail),
  liste-les toutes car la Passe 2 devra les traiter séparément
  pour éviter le double-comptage`;
}

// ═══════════════════════════════════════════════════
// PASSE 2 — MÉTRÉ (Extraction des quantités)
// ═══════════════════════════════════════════════════

export function getPasse2SystemPrompt(): string {
  return `Tu es un métreur professionnel suisse (25 ans d'expérience) spécialisé
dans le métré sur plans pour les entreprises générales et les bureaux
d'ingénieurs en Suisse.

Tu travailles selon les normes SIA et la classification CFC/BKP.

Ta SEULE tâche : extraire les quantités mesurables depuis ce plan.
Tu ne fais AUCUNE estimation de prix. Uniquement des quantités.

MÉTHODOLOGIE OBLIGATOIRE :

1. ZONES : Découpe le plan en zones logiques (par pièce, par niveau,
   par secteur). Ne fais JAMAIS un total global sans détail par zone.

2. MESURES : Pour chaque élément, indique COMMENT tu as mesuré :
   - "Cotation lue sur plan : 4.50m" (valeur lue directement)
   - "Mesuré à l'échelle 1:100 : ~4.5m (±5%)" (mesuré par toi)
   - "Estimé par proportion : ~4-5m (±15%)" (pas de cote, pas d'échelle fiable)

3. DÉCOMPOSITION : Un poste "béton armé" n'existe PAS.
   Décompose TOUJOURS en sous-postes métier :
   - Coffrage (m²)
   - Ferraillage (kg — ratio kg/m³ selon type d'élément)
   - Béton (m³ — avec qualité si indiquée)
   - Pompage (forfait ou m³)
   - Etc.

4. DOUBLE-COMPTAGE : Si le plan montre un plan ET une coupe du même
   élément, ne compte l'élément qu'UNE SEULE FOIS. Indique dans quelle
   vue tu as pris la mesure.

5. ÉLÉMENTS NON VISIBLES : Si tu sais qu'un élément existe forcément
   mais n'est pas visible sur ce plan (ex: fondations sur un plan d'étage),
   liste-le dans "elements_hors_plan" avec la mention "à vérifier sur
   plan [discipline]".

NIVEAUX DE CONFIANCE :
- "high" : cotation lue directement sur le plan
- "medium" : mesuré à l'échelle avec cotes de référence pour calibrer
- "low" : estimé par proportion ou par hypothèse standard
- "assumption" : pas sur le plan, basé sur pratique standard suisse

Réponds UNIQUEMENT en JSON valide.`;
}

export function getPasse2UserPrompt(passe1Result: Passe1Result, bureauEnrichment?: string): string {
  const context = JSON.stringify(passe1Result, null, 2);
  const bureauSection = bureauEnrichment ? `\n\n${bureauEnrichment}\n` : '';

  return `Contexte du plan (issu de la Passe 1) :
${context}
${bureauSection}
Extrais toutes les quantités mesurables de ce plan.

Structure de sortie :

{
  "metrage_par_zone": [
    {
      "zone": "string (ex: Pièce 1.01 - Séjour, Zone A - Fondations)",
      "dimensions_zone": {
        "longueur": "nombre ou null",
        "largeur": "nombre ou null",
        "hauteur": "nombre ou null",
        "surface": "nombre ou null",
        "source_mesure": "cotation | echelle | proportion"
      },
      "postes": [
        {
          "cfc_code": "string (ex: 211, 271.1)",
          "cfc_libelle": "string",
          "description_detaillee": "string — description précise du poste, pas générique",
          "quantite": nombre,
          "unite": "m² | m³ | m | ml | kg | pce | fft",
          "methode_mesure": "string — COMMENT tu as obtenu ce chiffre",
          "vue_source": "string — dans quelle vue du plan (plan, coupe, détail)",
          "confiance": "high | medium | low | assumption",
          "hypotheses": ["liste des hypothèses faites si confiance != high"],
          "decomposition": [
            {
              "sous_poste": "string",
              "quantite": nombre,
              "unite": "string",
              "ratio_utilise": "string ou null (ex: 120 kg/m³ pour ferraillage dalles)",
              "source_ratio": "SIA 262 | pratique standard | hypothèse"
            }
          ]
        }
      ]
    }
  ],
  "elements_hors_plan": [
    {
      "description": "string",
      "raison": "string — pourquoi cet élément n'est pas visible",
      "plan_requis": "string — quel plan faudrait-il pour le mesurer"
    }
  ],
  "totaux_par_cfc": [
    {
      "cfc_code": "string",
      "cfc_libelle": "string",
      "quantite_totale": nombre,
      "unite": "string",
      "nb_zones": nombre,
      "confiance_moyenne": "high | medium | low"
    }
  ],
  "avertissements_metrage": [
    "string — tout ce qui pourrait affecter la précision"
  ],
  "surface_reference": {
    "surface_brute_plancher": "nombre ou null (m²)",
    "surface_nette_plancher": "nombre ou null (m²)",
    "surface_facade": "nombre ou null (m²)",
    "volume_bati": "nombre ou null (m³)",
    "source": "string"
  }
}

RAPPELS CRITIQUES :
- Chaque quantité DOIT avoir sa méthode de mesure
- Chaque quantité DOIT avoir son niveau de confiance
- JAMAIS de poste générique sans décomposition
- Les surfaces de référence (SBP, SNP) sont essentielles
  pour la vérification de cohérence en Passe 3`;
}

// ═══════════════════════════════════════════════════
// PASSE 3 — VÉRIFICATION DE COHÉRENCE
// ═══════════════════════════════════════════════════

export function getPasse3SystemPrompt(): string {
  return `Tu es un économiste de la construction suisse (20 ans d'expérience)
spécialisé dans le contrôle qualité des métrés et estimations.

Ta SEULE tâche : vérifier la cohérence du métré extrait en Passe 2.
Tu ne modifies PAS les quantités — tu signales les incohérences.

CONTRÔLES OBLIGATOIRES :

1. RATIOS DE RÉFÉRENCE (par m² SBP selon type de bâtiment) :
   - Logement collectif : béton 0.4-0.6 m³/m² SBP, acier 25-45 kg/m² SBP
   - Villa individuelle : béton 0.25-0.4 m³/m² SBP
   - Bureau/administratif : béton 0.35-0.55 m³/m² SBP
   - Industriel/commercial : béton 0.2-0.35 m³/m² SBP
   - Rénovation : très variable, pas de ratio standard

2. COHÉRENCE INTERNE :
   - Surface coffrage ≈ surface de béton exposée (périmètre × hauteur pour voiles)
   - Ferraillage dalles : 80-150 kg/m³
   - Ferraillage voiles : 60-120 kg/m³
   - Ferraillage poteaux : 150-250 kg/m³
   - Ferraillage fondations : 80-130 kg/m³
   - Épaisseur dalle standard : 20-25 cm (logement), 25-35 cm (bureau)
   - Hauteur d'étage standard : 2.70-3.00 m (logement), 3.00-3.50 m (bureau)

3. DOUBLE-COMPTAGE :
   - Vérifier qu'un même élément n'est pas compté dans 2 zones
   - Vérifier que plan + coupe ne donnent pas un doublon

4. ÉLÉMENTS MANQUANTS TYPIQUES :
   - Fouilles / terrassement (souvent oublié)
   - Étanchéité sous radier
   - Joints de dilatation
   - Réservations (passages de gaines, trémies)
   - Seuils, appuis de fenêtre
   - Chapes (souvent oubliées sur plans structure)
   - Isolation périphérique fondations

Réponds UNIQUEMENT en JSON valide.`;
}

export function getPasse3UserPrompt(
  passe2Result: Passe2Result,
  surfaceBrutePlancher: number | null,
  typeBatiment: string
): string {
  return `Voici le métré extrait (Passe 2) :
${JSON.stringify(passe2Result, null, 2)}

Surface de référence : ${surfaceBrutePlancher ?? 'non disponible'} m² SBP
Type de bâtiment : ${typeBatiment}

Vérifie la cohérence et produis :

{
  "verification_ratios": [
    {
      "ratio_teste": "string (ex: m³ béton / m² SBP)",
      "valeur_calculee": nombre,
      "plage_reference": "string (ex: 0.4-0.6 m³/m²)",
      "verdict": "conforme | attention | anomalie",
      "commentaire": "string"
    }
  ],
  "alertes_coherence": [
    {
      "severite": "critique | attention | info",
      "poste_concerne": "string (CFC + description)",
      "probleme": "string — description précise du problème",
      "suggestion": "string — ce qu'il faudrait vérifier"
    }
  ],
  "doublons_potentiels": [
    {
      "poste_1": "string",
      "poste_2": "string",
      "raison_suspicion": "string"
    }
  ],
  "elements_probablement_manquants": [
    {
      "cfc_code": "string",
      "description": "string",
      "raison": "string — pourquoi cet élément devrait être présent",
      "impact_estimation": "faible | moyen | significatif",
      "quantite_estimee": "string ou null (si estimable par ratio)"
    }
  ],
  "score_fiabilite_metrage": {
    "score": "nombre 0-100",
    "facteurs_positifs": ["string"],
    "facteurs_negatifs": ["string"],
    "recommandation": "string — ex: métré fiable / à consolider avec plans complémentaires"
  }
}`;
}

// ═══════════════════════════════════════════════════
// PASSE 4 — CHIFFRAGE (Application des prix)
// ═══════════════════════════════════════════════════

export function getPasse4SystemPrompt(): string {
  return `Tu es un économiste de la construction suisse (20 ans d'expérience)
spécialisé dans l'estimation de coûts pour les entreprises générales
et les bureaux d'ingénieurs en Suisse.

Ta tâche : appliquer des prix unitaires au métré vérifié.

HIÉRARCHIE STRICTE DES SOURCES DE PRIX (dans cet ordre) :

1. BASE DE DONNÉES INTERNE (historique client Cantaia)
   → Prix réels issus d'offres fournisseurs sur des projets similaires
   → Source la plus fiable — toujours prioritaire
   → Étiquette : "historique_interne"

2. BENCHMARK MARCHÉ CANTAIA (données agrégées Couche 2)
   → Médiane + p25/p75 de prix réels anonymisés (≥3 contributeurs)
   → Deuxième source la plus fiable
   → Étiquette : "benchmark_cantaia"

3. RÉFÉRENTIELS PUBLICS SUISSES
   → CRB (Centre suisse d'étude pour la rationalisation de la construction)
   → Catalogue des articles normalisés CAN
   → Prix indicatifs par région et période
   → Étiquette : "referentiel_crb"

4. ESTIMATION PAR RATIO (dernière option acceptable)
   → Utilise des ratios connus : CHF/m² SBP par type de bâtiment,
     CHF/m³ béton par région, etc.
   → Étiquette : "ratio_estimation"
   → TOUJOURS avec fourchette large (±20-30%)

5. ESTIMATION IA (à éviter au maximum)
   → Uniquement si aucune autre source n'est disponible
   → Étiquette : "estimation_ia"
   → OBLIGATOIREMENT avec fourchette très large (±30-50%)
   → OBLIGATOIREMENT avec avertissement visible

RÈGLES ABSOLUES :

- Chaque prix DOIT avoir sa source étiquetée
- Chaque prix DOIT avoir une fourchette (min / médian / max)
- Les prix sont TOUJOURS en CHF HT
- Les prix incluent TOUJOURS la région et la période
- Si tu n'as PAS de référence fiable pour un poste, ne donne PAS
  un prix inventé. Indique "prix_non_disponible" avec une explication
  et une suggestion (ex: "demander un devis au fournisseur")
- Les frais généraux, bénéfice, et risques sont des lignes SÉPARÉES,
  jamais noyés dans les prix unitaires

COEFFICIENTS RÉGIONAUX SUISSES (base 100 = Zurich) :
  - Zurich : 100, Berne : 95, Bâle : 98, Genève : 105
  - Lausanne / Vaud : 102, Valais : 90, Fribourg : 93
  - Neuchâtel : 92, Tessin : 88, Lucerne/Zoug : 97
  - St-Gall/Thurgovie : 92, Grisons : 95, Jura : 88

AJUSTEMENTS OBLIGATOIRES :
  - Accès chantier difficile (centre-ville, montagne) : +5-15%
  - Petites quantités (< seuil économique) : +10-25%
  - Urgence / délai serré : +5-10%
  - Travail de nuit ou week-end : +25-50%
  - Hauteur > 10m : +5-10% sur main d'œuvre
  - Hiver (novembre-mars) : +5-10% sur terrassement et GO

Réponds UNIQUEMENT en JSON valide.`;
}

export function getPasse4UserPrompt(params: {
  metrageVerifie: Passe2Result;
  passe3Result: Passe3Result;
  region: string;
  typeBatiment: string;
  phaseSia: string;
  acces: string;
  periode: string;
  prixHistoriques: string;
  benchmarksCantaia: string;
}): string {
  return `Métré vérifié (Passe 2 + corrections Passe 3) :
${JSON.stringify(params.metrageVerifie, null, 2)}

Résultat vérification cohérence (Passe 3) :
${JSON.stringify(params.passe3Result, null, 2)}

Paramètres du projet :
- Région : ${params.region}
- Type de bâtiment : ${params.typeBatiment}
- Phase SIA : ${params.phaseSia}
- Accès chantier : ${params.acces}
- Période travaux prévue : ${params.periode}

Prix historiques internes disponibles :
${params.prixHistoriques}

Benchmarks marché Cantaia disponibles :
${params.benchmarksCantaia}

Produis l'estimation détaillée au format JSON avec la structure suivante :
{
  "parametres_estimation": { "region", "coefficient_regional", "type_batiment", "periode", "ajustements_appliques": [{ "type", "coefficient", "justification" }] },
  "estimation_par_cfc": [{ "cfc_code", "cfc_libelle", "postes": [{ "description", "quantite", "unite", "prix_unitaire": { "min", "median", "max", "source", "detail_source", "date_reference", "ajustements" }, "total": { "min", "median", "max" }, "confiance_quantite", "confiance_prix", "confiance_combinee", "note" }], "sous_total_cfc": { "min", "median", "max" } }],
  "recapitulatif": { "sous_total_travaux", "frais_generaux": { "pourcentage", "montant_median", "justification" }, "benefice_risques": { "pourcentage", "montant_median", "justification" }, "divers_imprevus": { "pourcentage", "montant_median", "justification" }, "total_estimation": { "min", "median", "max" }, "prix_au_m2_sbp": { "min", "median", "max" }, "plage_reference_m2_sbp": { "min", "max", "source" } },
  "analyse_fiabilite": { "score_global", "repartition_sources", "postes_a_risque": [{ "poste", "montant_median", "raison_risque", "action_recommandee" }], "recommandation_globale", "prochaines_etapes" },
  "comparaison_marche": { "prix_m2_estime", "prix_m2_marche_bas", "prix_m2_marche_median", "prix_m2_marche_haut", "position", "commentaire" }
}`;
}
