# CANTAIA — Architecture Prompt : Estimation de Prix depuis Plans

> Objectif : transformer l'analyse de prix en une estimation de qualité professionnelle
> qui inspire une confiance absolue au client.
> Version 1.0 — Mars 2026

---

## 1. DIAGNOSTIC : Pourquoi l'estimation actuelle échoue

### Problèmes identifiés

| Problème | Cause racine | Impact client |
|----------|-------------|---------------|
| Prix déconnectés de la réalité | Claude "invente" des prix depuis ses connaissances générales | Perte de confiance immédiate |
| Quantités imprécises | Un seul pass Vision sans vérification croisée | Doute sur toute l'estimation |
| Pas de transparence méthodologique | Le client voit un chiffre final sans comprendre comment on y arrive | Impossible de challenger = impossible de faire confiance |
| Pas de contexte suisse | Prix moyens mondiaux au lieu de prix suisses régionaux | Écarts de 30-80% avec la réalité |
| Granularité insuffisante | "Béton armé : 500 CHF/m³" au lieu de décomposer coffrage + ferraillage + coulage + pompage | Un professionnel voit immédiatement que c'est amateur |
| Aucune fourchette | Un prix unique au lieu de min/médian/max | Fausse précision qui détruit la crédibilité |

### Le problème fondamental

L'IA ne doit PAS estimer des prix. L'IA doit :
1. Extraire des quantités avec précision chirurgicale
2. Appliquer des prix de référence vérifiables (BDD, CRB, historique)
3. Quand elle n'a pas de référence → le DIRE explicitement et donner une fourchette large

**Règle d'or : il vaut mieux dire "je n'ai pas de référence fiable pour ce poste"
que de donner un prix faux.**

---

## 2. NOUVELLE ARCHITECTURE : Pipeline en 4 passes

L'estimation en un seul prompt est la source de tous les problèmes.
Le nouveau pipeline sépare strictement chaque responsabilité.

```
PLAN (PDF/Image)
      │
      ▼
┌─────────────────────────────┐
│  PASSE 1 — IDENTIFICATION   │
│  Type de plan, échelle,     │
│  cartouche, discipline      │
│  Modèle : Claude Vision     │
│  Tokens : 2000 max          │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  PASSE 2 — MÉTRÉ            │
│  Extraction quantités       │
│  détaillées par zone        │
│  Modèle : Claude Vision     │
│  Tokens : 8000 max          │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  PASSE 3 — VÉRIFICATION     │
│  Contrôle cohérence,        │
│  ratios, double-comptage    │
│  Modèle : Claude Sonnet     │
│  Tokens : 4000 max          │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│  PASSE 4 — CHIFFRAGE        │
│  Application prix unitaires │
│  BDD d'abord, IA en dernier │
│  Modèle : Claude Sonnet     │
│  Tokens : 8000 max          │
└─────────────┬───────────────┘
              │
              ▼
        ESTIMATION FINALE
        avec traçabilité complète
```

---

## 3. PASSE 1 — IDENTIFICATION DU PLAN

### Prompt système

```
Tu es un métreur professionnel suisse avec 25 ans d'expérience.

Ta SEULE tâche : identifier le plan qui t'est présenté.

Analyse l'image et extrais UNIQUEMENT les informations suivantes.
Ne fais AUCUNE estimation de quantité ni de prix à cette étape.

Réponds UNIQUEMENT en JSON valide, sans texte avant ni après.
```

### Prompt utilisateur

```
Analyse ce plan de construction et identifie :

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
  pour éviter le double-comptage
```

---

## 4. PASSE 2 — MÉTRÉ (Extraction des quantités)

### Prompt système

```
Tu es un métreur professionnel suisse (25 ans d'expérience) spécialisé
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

Réponds UNIQUEMENT en JSON valide.
```

### Prompt utilisateur

```
Contexte du plan (issu de la Passe 1) :
{passe_1_result}

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
  pour la vérification de cohérence en Passe 3
```

---

## 5. PASSE 3 — VÉRIFICATION DE COHÉRENCE

### Prompt système

```
Tu es un économiste de la construction suisse (20 ans d'expérience)
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

Réponds UNIQUEMENT en JSON valide.
```

### Prompt utilisateur

```
Voici le métré extrait (Passe 2) :
{passe_2_result}

Surface de référence : {surface_brute_plancher} m² SBP
Type de bâtiment : {type_batiment}

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
}
```

---

## 6. PASSE 4 — CHIFFRAGE (Application des prix)

### Prompt système

```
Tu es un économiste de la construction suisse (20 ans d'expérience)
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
  - Zurich : 100
  - Berne : 95
  - Bâle : 98
  - Genève : 105
  - Lausanne / Vaud : 102
  - Valais : 90
  - Fribourg : 93
  - Neuchâtel : 92
  - Tessin : 88
  - Suisse centrale (Lucerne, Zoug) : 97
  - Suisse orientale (St-Gall, Thurgovie) : 92
  - Grisons : 95
  - Jura : 88

AJUSTEMENTS OBLIGATOIRES :
  - Accès chantier difficile (centre-ville, montagne) : +5-15%
  - Petites quantités (< seuil économique) : +10-25%
  - Urgence / délai serré : +5-10%
  - Travail de nuit ou week-end : +25-50%
  - Hauteur > 10m : +5-10% sur main d'œuvre
  - Hiver (novembre-mars) : +5-10% sur terrassement et GO

Réponds UNIQUEMENT en JSON valide.
```

### Prompt utilisateur

```
Métré vérifié (Passe 2 + corrections Passe 3) :
{metrage_verifie}

Résultat vérification cohérence (Passe 3) :
{passe_3_result}

Paramètres du projet :
- Région : {region} (ex: Vaud)
- Type de bâtiment : {type_batiment}
- Phase SIA : {phase_sia}
- Accès chantier : {acces} (normal | difficile | très difficile)
- Période travaux prévue : {periode}
- Taux horaire organisation : {taux_horaire} CHF/h

Prix historiques internes disponibles :
{prix_historiques_internes}

Benchmarks marché Cantaia disponibles :
{benchmarks_cantaia}

Produis l'estimation détaillée :

{
  "parametres_estimation": {
    "region": "string",
    "coefficient_regional": nombre,
    "type_batiment": "string",
    "periode": "string",
    "ajustements_appliques": [
      {
        "type": "string",
        "coefficient": nombre,
        "justification": "string"
      }
    ]
  },
  "estimation_par_cfc": [
    {
      "cfc_code": "string",
      "cfc_libelle": "string",
      "postes": [
        {
          "description": "string — description détaillée",
          "quantite": nombre,
          "unite": "string",
          "prix_unitaire": {
            "min": nombre,
            "median": nombre,
            "max": nombre,
            "source": "historique_interne | benchmark_cantaia | referentiel_crb | ratio_estimation | estimation_ia | prix_non_disponible",
            "detail_source": "string — ex: 'Offre Fournisseur X, projet Y, mars 2025' ou 'Médiane Cantaia, Vaud, T1 2026, 5 contributeurs'",
            "date_reference": "string",
            "ajustements": ["string — liste des ajustements appliqués"]
          },
          "total": {
            "min": nombre,
            "median": nombre,
            "max": nombre
          },
          "confiance_quantite": "high | medium | low | assumption",
          "confiance_prix": "high | medium | low | estimation",
          "confiance_combinee": "string — ex: 'quantité high × prix medium = fiabilité bonne'",
          "note": "string ou null — remarque importante pour le lecteur"
        }
      ],
      "sous_total_cfc": {
        "min": nombre,
        "median": nombre,
        "max": nombre
      }
    }
  ],
  "recapitulatif": {
    "sous_total_travaux": {
      "min": nombre,
      "median": nombre,
      "max": nombre
    },
    "frais_generaux": {
      "pourcentage": nombre,
      "montant_median": nombre,
      "justification": "string — ex: 12% standard entreprise générale"
    },
    "benefice_risques": {
      "pourcentage": nombre,
      "montant_median": nombre,
      "justification": "string"
    },
    "divers_imprevus": {
      "pourcentage": nombre,
      "montant_median": nombre,
      "justification": "string — ex: 5% phase projet, 3% phase exécution"
    },
    "total_estimation": {
      "min": nombre,
      "median": nombre,
      "max": nombre
    },
    "prix_au_m2_sbp": {
      "min": nombre,
      "median": nombre,
      "max": nombre
    },
    "plage_reference_m2_sbp": {
      "min": nombre,
      "max": nombre,
      "source": "string — ex: CRB 2025, logement collectif, Vaud"
    }
  },
  "analyse_fiabilite": {
    "score_global": "nombre 0-100",
    "repartition_sources": {
      "historique_interne_pct": nombre,
      "benchmark_cantaia_pct": nombre,
      "referentiel_crb_pct": nombre,
      "ratio_estimation_pct": nombre,
      "estimation_ia_pct": nombre,
      "prix_non_disponible_pct": nombre
    },
    "postes_a_risque": [
      {
        "poste": "string",
        "montant_median": nombre,
        "raison_risque": "string",
        "action_recommandee": "string"
      }
    ],
    "recommandation_globale": "string — synthèse pour le décideur",
    "prochaines_etapes": [
      "string — actions concrètes pour fiabiliser l'estimation"
    ]
  },
  "comparaison_marche": {
    "prix_m2_estime": nombre,
    "prix_m2_marche_bas": nombre,
    "prix_m2_marche_median": nombre,
    "prix_m2_marche_haut": nombre,
    "position": "sous_marche | dans_marche | au_dessus_marche",
    "commentaire": "string"
  }
}
```

---

## 7. PRIX DE RÉFÉRENCE SUISSES PAR CFC (à intégrer en BDD)

Ces prix servent de fallback quand il n'y a pas de données historiques.
Ils doivent être stockés dans la table `normalization_rules` ou une table
dédiée `reference_prices` et mis à jour annuellement.

### CFC 1 — Travaux préparatoires

| Code CFC | Description | Unité | Prix min CHF | Prix médian CHF | Prix max CHF | Région réf. | Période |
|----------|-------------|-------|-------------|-----------------|-------------|-------------|---------|
| 111 | Démolition bâtiment (sans désamiantage) | m³ | 25 | 40 | 65 | CH moyenne | 2025 |
| 112 | Démolition avec tri sélectif | m³ | 45 | 65 | 95 | CH moyenne | 2025 |
| 113 | Désamiantage | m² | 80 | 150 | 300 | CH moyenne | 2025 |
| 117 | Abattage d'arbres (diamètre > 30cm) | pce | 500 | 1200 | 3000 | CH moyenne | 2025 |

### CFC 2 — Gros œuvre

| Code CFC | Description | Unité | Prix min CHF | Prix médian CHF | Prix max CHF | Région réf. | Période |
|----------|-------------|-------|-------------|-----------------|-------------|-------------|---------|
| 211.1 | Fouilles en pleine masse (terrain meuble) | m³ | 18 | 28 | 45 | CH moyenne | 2025 |
| 211.2 | Fouilles en pleine masse (terrain rocheux) | m³ | 55 | 85 | 140 | CH moyenne | 2025 |
| 211.3 | Fouilles en tranchée | m³ | 25 | 40 | 65 | CH moyenne | 2025 |
| 211.4 | Remblayage compacté | m³ | 15 | 22 | 35 | CH moyenne | 2025 |
| 211.5 | Évacuation de matériaux (décharge) | m³ | 25 | 45 | 75 | CH moyenne | 2025 |
| 211.6 | Étanchéité sous radier (bitumineuse) | m² | 35 | 55 | 80 | CH moyenne | 2025 |
| 215.0 | Béton non armé C25/30 | m³ | 220 | 280 | 360 | CH moyenne | 2025 |
| 215.1 | Béton armé C30/37 (fourniture + coulage) | m³ | 280 | 350 | 450 | CH moyenne | 2025 |
| 215.2 | Béton armé C30/37 pompé | m³ | 300 | 380 | 480 | CH moyenne | 2025 |
| 215.3 | Coffrage plan (dalles) | m² | 35 | 50 | 70 | CH moyenne | 2025 |
| 215.4 | Coffrage vertical (voiles, murs) | m² | 45 | 65 | 90 | CH moyenne | 2025 |
| 215.5 | Coffrage courbe ou complexe | m² | 80 | 120 | 180 | CH moyenne | 2025 |
| 215.6 | Ferraillage standard (fourni posé) | kg | 2.20 | 2.80 | 3.60 | CH moyenne | 2025 |
| 215.7 | Treillis soudé (fourni posé) | kg | 2.00 | 2.50 | 3.20 | CH moyenne | 2025 |
| 216.0 | Maçonnerie bloc béton (20cm) | m² | 85 | 120 | 160 | CH moyenne | 2025 |
| 216.1 | Maçonnerie brique (paroi simple) | m² | 95 | 135 | 180 | CH moyenne | 2025 |

### CFC 2 — Enveloppe

| Code CFC | Description | Unité | Prix min CHF | Prix médian CHF | Prix max CHF | Région réf. | Période |
|----------|-------------|-------|-------------|-----------------|-------------|-------------|---------|
| 221.0 | Fenêtre PVC double vitrage standard | m² | 450 | 600 | 800 | CH moyenne | 2025 |
| 221.1 | Fenêtre bois-alu triple vitrage | m² | 700 | 950 | 1300 | CH moyenne | 2025 |
| 221.2 | Porte-fenêtre coulissante (alu) | m² | 800 | 1100 | 1500 | CH moyenne | 2025 |
| 224.0 | Isolation façade EPS (16cm) | m² | 55 | 75 | 100 | CH moyenne | 2025 |
| 224.1 | Isolation façade laine de roche (16cm) | m² | 65 | 90 | 120 | CH moyenne | 2025 |
| 225.0 | Crépi extérieur (2 couches) | m² | 45 | 65 | 90 | CH moyenne | 2025 |
| 225.1 | Façade ventilée (fibrociment type Eternit) | m² | 120 | 180 | 260 | CH moyenne | 2025 |
| 227.0 | Étanchéité toiture plate (bitume 2 couches) | m² | 45 | 65 | 90 | CH moyenne | 2025 |
| 227.1 | Toiture plate végétalisée extensive | m² | 70 | 100 | 140 | CH moyenne | 2025 |
| 228.0 | Couverture tuiles (terre cuite) | m² | 80 | 120 | 170 | CH moyenne | 2025 |

### CFC 23 — Installations électriques

| Code CFC | Description | Unité | Prix min CHF | Prix médian CHF | Prix max CHF | Région réf. | Période |
|----------|-------------|-------|-------------|-----------------|-------------|-------------|---------|
| 232.0 | Installation électrique (logement standard) | m² SBP | 80 | 110 | 150 | CH moyenne | 2025 |
| 232.1 | Installation électrique (bureau) | m² SBP | 100 | 140 | 190 | CH moyenne | 2025 |
| 232.2 | Point lumineux (fourni posé) | pce | 250 | 400 | 650 | CH moyenne | 2025 |
| 232.3 | Prise courant (fourni posé) | pce | 120 | 180 | 280 | CH moyenne | 2025 |

### CFC 24 — CVC

| Code CFC | Description | Unité | Prix min CHF | Prix médian CHF | Prix max CHF | Région réf. | Période |
|----------|-------------|-------|-------------|-----------------|-------------|-------------|---------|
| 241.0 | Chauffage sol (eau chaude, fourni posé) | m² | 55 | 80 | 110 | CH moyenne | 2025 |
| 242.0 | Ventilation double-flux (logement) | m² SBP | 50 | 75 | 105 | CH moyenne | 2025 |
| 242.1 | Ventilation double-flux (bureau) | m² SBP | 65 | 95 | 130 | CH moyenne | 2025 |
| 244.0 | PAC air-eau (fournie posée, 15kW) | fft | 25000 | 35000 | 50000 | CH moyenne | 2025 |
| 244.1 | PAC géothermique (sondes incluses) | fft | 45000 | 65000 | 90000 | CH moyenne | 2025 |

### CFC 25 — Sanitaire

| Code CFC | Description | Unité | Prix min CHF | Prix médian CHF | Prix max CHF | Région réf. | Période |
|----------|-------------|-------|-------------|-----------------|-------------|-------------|---------|
| 251.0 | Installation sanitaire (logement standard) | m² SBP | 55 | 80 | 110 | CH moyenne | 2025 |
| 253.0 | WC suspendu (fourni posé) | pce | 1200 | 1800 | 2800 | CH moyenne | 2025 |
| 253.1 | Lavabo (fourni posé, standard) | pce | 800 | 1200 | 2000 | CH moyenne | 2025 |
| 253.2 | Douche de plain-pied (fournie posée) | pce | 2500 | 4000 | 6500 | CH moyenne | 2025 |
| 253.3 | Baignoire (fournie posée, standard) | pce | 2000 | 3500 | 5500 | CH moyenne | 2025 |

### CFC 27 — Aménagements intérieurs

| Code CFC | Description | Unité | Prix min CHF | Prix médian CHF | Prix max CHF | Région réf. | Période |
|----------|-------------|-------|-------------|-----------------|-------------|-------------|---------|
| 271.0 | Chape ciment (60-80mm) | m² | 28 | 40 | 55 | CH moyenne | 2025 |
| 271.1 | Chape anhydrite (50-60mm) | m² | 32 | 45 | 60 | CH moyenne | 2025 |
| 273.0 | Carrelage sol (standard, 30×60) | m² | 65 | 95 | 140 | CH moyenne | 2025 |
| 273.1 | Carrelage mural (salle de bain) | m² | 75 | 110 | 160 | CH moyenne | 2025 |
| 274.0 | Parquet chêne (fourni posé) | m² | 80 | 120 | 180 | CH moyenne | 2025 |
| 275.0 | Peinture intérieure (2 couches, murs) | m² | 18 | 28 | 42 | CH moyenne | 2025 |
| 276.0 | Plâtre projeté (murs) | m² | 22 | 32 | 45 | CH moyenne | 2025 |
| 276.1 | Faux-plafond (plaques de plâtre) | m² | 55 | 80 | 110 | CH moyenne | 2025 |
| 281.0 | Porte intérieure (bois, standard) | pce | 800 | 1200 | 1800 | CH moyenne | 2025 |
| 281.1 | Porte coupe-feu EI30 | pce | 1500 | 2200 | 3200 | CH moyenne | 2025 |

### Ratios CHF/m² SBP par type de bâtiment (tout compris, CFC 2)

| Type | CHF/m² SBP min | CHF/m² SBP médian | CHF/m² SBP max | Source |
|------|---------------|-------------------|---------------|--------|
| Logement collectif (standard) | 3'200 | 3'800 | 4'800 | CRB 2024 |
| Logement collectif (haut standing) | 4'500 | 5'500 | 7'500 | CRB 2024 |
| Villa individuelle | 3'800 | 4'800 | 7'000 | CRB 2024 |
| Bureau / administratif | 3'500 | 4'200 | 5'500 | CRB 2024 |
| Scolaire | 4'000 | 4'800 | 6'000 | CRB 2024 |
| Commercial (surface de vente) | 2'200 | 3'000 | 4'200 | CRB 2024 |
| Industriel / entrepôt | 1'500 | 2'200 | 3'200 | CRB 2024 |
| EMS / institution | 4'500 | 5'500 | 7'000 | CRB 2024 |
| Rénovation lourde | 2'500 | 3'500 | 5'500 | CRB 2024 |

---

## 8. AFFICHAGE CLIENT — Ce qui change tout

Le problème n'est pas seulement la précision des prix.
C'est aussi COMMENT le résultat est présenté au client.

### Ce qu'il ne faut PLUS faire

```
Béton armé C30/37     150 m³    350 CHF/m³    52'500 CHF
Ferraillage           18'000 kg  2.80 CHF/kg   50'400 CHF
Coffrage              620 m²     55 CHF/m²     34'100 CHF

TOTAL : 137'000 CHF
```

→ Le client ne sait pas d'où viennent les prix, ne peut pas challenger,
  ne fait pas confiance.

### Ce qu'il faut afficher

Chaque ligne doit montrer :

1. **La source du prix** avec un badge coloré :
   - 🟢 Vert : "Historique entreprise" (prix réel vérifié)
   - 🔵 Bleu : "Benchmark marché" (médiane ≥3 entreprises)
   - 🟡 Jaune : "Référentiel CRB" (prix indicatif)
   - 🟠 Orange : "Estimation par ratio" (fourchette large)
   - 🔴 Rouge : "Estimation IA" (à vérifier impérativement)
   - ⬜ Gris : "Prix non disponible" (demander un devis)

2. **La fourchette** (min — médian — max) avec barre graphique

3. **La méthode de mesure** de la quantité :
   - "Cotation lue" / "Mesuré à l'échelle" / "Estimé"

4. **Le score de confiance combiné** :
   - Confiance quantité × Confiance prix = Fiabilité poste

5. **Le total avec plage** :
   - "Total estimé : 1'250'000 — 1'480'000 — 1'720'000 CHF"
   - "Fiabilité globale : 73% (bonne — 62% des postes sur données réelles)"

### Score de fiabilité global

Le score affiché au client est calculé ainsi :

```
score_global = Σ (poids_poste × score_source × score_quantite) / Σ poids_poste

où :
  poids_poste = montant_median du poste / total_median
  score_source =
    historique_interne : 1.0
    benchmark_cantaia  : 0.85
    referentiel_crb    : 0.70
    ratio_estimation   : 0.45
    estimation_ia      : 0.25
  score_quantite =
    high       : 1.0
    medium     : 0.80
    low        : 0.50
    assumption : 0.30
```

Affichage :
- Score ≥ 80 : "Estimation haute fiabilité" (vert)
- Score 60-79 : "Estimation fiable — quelques postes à confirmer" (bleu)
- Score 40-59 : "Estimation indicative — à consolider" (orange)
- Score < 40 : "Pré-estimation — plans complémentaires nécessaires" (rouge)

---

## 9. IMPLÉMENTATION TECHNIQUE

### Fichiers à créer / modifier

```
/lib/plans/
├── pipeline/
│   ├── passe1-identification.ts    // Appel Claude Vision
│   ├── passe2-metrage.ts           // Appel Claude Vision
│   ├── passe3-verification.ts      // Appel Claude Sonnet (texte seul)
│   ├── passe4-chiffrage.ts         // Appel Claude Sonnet + BDD
│   ├── price-resolver.ts           // Résolution prix par hiérarchie de sources
│   ├── confidence-calculator.ts    // Calcul scores de confiance
│   └── index.ts                    // Orchestrateur du pipeline
├── reference-prices/
│   ├── cfc-prices-2025.json        // Prix de référence par CFC
│   ├── regional-coefficients.json  // Coefficients régionaux
│   └── ratios-m2-sbp.json          // Ratios par type de bâtiment
└── types/
    ├── passe1.types.ts
    ├── passe2.types.ts
    ├── passe3.types.ts
    └── passe4.types.ts

/supabase/migrations/
├── 041_reference_prices.sql        // Table prix de référence
└── 042_estimation_pipeline_log.sql // Logging du pipeline pour amélioration
```

### price-resolver.ts (logique de résolution)

```typescript
// Pseudo-code de la résolution de prix par hiérarchie

async function resolvePrice(
  cfc_code: string,
  description: string,
  unit: string,
  region: string,
  quarter: string,
  org_id: string
): Promise<PriceResolution> {

  // 1. Chercher dans l'historique interne
  const internal = await supabase
    .from('offer_line_items')
    .select('unit_price, created_at, supplier_offers!inner(org_id)')
    .eq('supplier_offers.org_id', org_id)
    .ilike('description_normalized', `%${cfc_code}%`)
    .order('created_at', { ascending: false })
    .limit(10);

  if (internal.data && internal.data.length >= 2) {
    return {
      source: 'historique_interne',
      min: percentile(internal.data.map(d => d.unit_price), 0.25),
      median: percentile(internal.data.map(d => d.unit_price), 0.50),
      max: percentile(internal.data.map(d => d.unit_price), 0.75),
      detail: `${internal.data.length} offres internes, dernière: ${internal.data[0].created_at}`,
      confidence: 1.0,
    };
  }

  // 2. Chercher dans les benchmarks Cantaia (Couche 2)
  const benchmark = await supabase
    .from('market_benchmarks')
    .select('*')
    .eq('cfc_code', cfc_code)
    .eq('region', region)
    .eq('quarter', quarter)
    .gte('contributor_count', 3)
    .single();

  if (benchmark.data) {
    return {
      source: 'benchmark_cantaia',
      min: benchmark.data.price_p25,
      median: benchmark.data.price_median,
      max: benchmark.data.price_p75,
      detail: `Benchmark Cantaia, ${region}, ${quarter}, ${benchmark.data.contributor_count} contributeurs`,
      confidence: 0.85,
    };
  }

  // 3. Chercher dans les prix de référence CFC
  const reference = await supabase
    .from('reference_prices')
    .select('*')
    .eq('cfc_code', cfc_code)
    .single();

  if (reference.data) {
    const coeff = REGIONAL_COEFFICIENTS[region] || 1.0;
    return {
      source: 'referentiel_crb',
      min: reference.data.prix_min * coeff,
      median: reference.data.prix_median * coeff,
      max: reference.data.prix_max * coeff,
      detail: `Référentiel CRB ${reference.data.periode}, coefficient ${region}: ${coeff}`,
      confidence: 0.70,
    };
  }

  // 4. Pas de prix disponible
  return {
    source: 'prix_non_disponible',
    min: null,
    median: null,
    max: null,
    detail: 'Aucune référence de prix trouvée — demander un devis fournisseur',
    confidence: 0,
  };
}
```

---

## 10. CHECKLIST AVANT MISE EN PRODUCTION

- [ ] Passe 1 testée sur 20 plans de disciplines différentes
- [ ] Passe 2 testée et comparée avec métrés manuels réels (écart < 15%)
- [ ] Passe 3 détecte au moins 80% des incohérences volontairement introduites
- [ ] Passe 4 : 0% de prix "estimation_ia" quand des données internes existent
- [ ] Table reference_prices remplie avec ≥100 postes CFC
- [ ] Coefficients régionaux validés pour les 26 cantons
- [ ] Interface affiche la source de chaque prix avec badge couleur
- [ ] Interface affiche la fourchette min/médian/max pour chaque poste
- [ ] Score de fiabilité global calculé et affiché
- [ ] Export PDF/DOCX de l'estimation avec traçabilité complète
- [ ] Logging pipeline complet pour mesurer la précision et améliorer

---

## 11. MÉTRIQUES DE SUCCÈS

| Métrique | Cible | Mesure |
|----------|-------|--------|
| Écart estimation vs prix réel final | < ±15% sur médian | Comparaison post-adjudication |
| % postes avec source "historique" ou "benchmark" | > 60% | Répartition sources dans Passe 4 |
| % postes avec source "estimation_ia" | < 10% | Même mesure |
| Taux d'acceptation client (estimation non contestée) | > 75% | Feedback utilisateur |
| Temps de génération pipeline complet | < 45 secondes | Timer API |
| Score fiabilité moyen affiché | > 65/100 | Moyenne des estimations |
