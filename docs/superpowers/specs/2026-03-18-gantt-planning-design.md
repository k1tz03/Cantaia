# Cantaia Planning Gantt — Design Spec

> Date: 2026-03-18
> Auteur: Claude (brainstorming avec Julien RAY)
> Statut: En attente de validation utilisateur

---

## 1. Vue d'ensemble

### Objectif
Permettre aux chefs de projet de générer automatiquement un planning de chantier Gantt à partir d'une soumission analysée, puis de l'ajuster visuellement avec assistance IA continue.

### Approche validée
**Hybride** — L'IA propose un planning brouillon basé sur les données de la soumission (lots, quantités, CFC), l'utilisateur ajuste visuellement (drag des barres), l'IA détecte les incohérences en continu.

### Principes
- L'IA est l'**assistant**, pas le décideur
- Chaque durée affiche son **calcul transparent** (quantité × ratio × facteurs)
- Les corrections utilisateur **alimentent l'apprentissage** (ratios se calibrent)
- Le planning est un **document de chantier** — exportable, imprimable, partageable

---

## 2. Architecture technique

### Librairie Gantt
**Custom avec dnd-kit + Tailwind CSS** (pas de lib externe)
- dnd-kit déjà installé (utilisé pour Kanban + SubmissionEditor)
- Contrôle total sur le design (cohérent avec l'esthétique Cantaia)
- Zéro licence commerciale
- Dépendances (flèches) en SVG `<path>` entre barres

### Layout
**Classic Split** (standard industrie, type MS Project)
- Panneau gauche : liste hiérarchique des tâches (lots > phases > tâches)
- Panneau droite : barres Gantt sur timeline
- Séparateur redimensionnable (localStorage `cantaia_planning_split_width`)
- Ligne "Aujourd'hui" rouge verticale
- Zoom : jour / semaine / mois

### Nouveaux fichiers

```
packages/database/migrations/054_planning_tables.sql
packages/core/src/planning/
  ├── index.ts
  ├── planning-generator.ts      # Génération IA du planning
  ├── productivity-ratios.ts     # 50+ ratios construction suisse
  ├── dependency-rules.ts        # Dépendances standards CFC
  ├── duration-calculator.ts     # Calcul durées (ratios × facteurs)
  └── critical-path.ts           # Algorithme chemin critique
apps/web/src/app/api/planning/
  ├── generate/route.ts          # POST — génère planning depuis soumission
  ├── [id]/route.ts              # GET/PATCH — lecture/mise à jour planning
  ├── [id]/export-pdf/route.ts   # GET — export PDF A3
  ├── [id]/export-png/route.ts   # GET — export PNG
  └── [id]/share/route.ts        # POST — créer lien partageable
apps/web/src/app/[locale]/(app)/projects/[id]/planning/
  └── page.tsx                   # Page planning (onglet projet)
apps/web/src/app/[locale]/(public)/planning/[token]/
  └── page.tsx                   # Vue publique partageable (lecture seule)
apps/web/src/components/planning/
  ├── GanttChart.tsx             # Composant principal (classic split)
  ├── GanttTimeline.tsx          # Panneau droite (barres + SVG)
  ├── GanttTaskList.tsx          # Panneau gauche (liste hiérarchique)
  ├── GanttBar.tsx               # Barre draggable individuelle
  ├── GanttDependencyArrows.tsx  # Flèches SVG entre barres
  ├── GanttMilestone.tsx         # Losange jalon
  ├── GanttHeader.tsx            # Header avec zoom + actions
  ├── GanttConfigModal.tsx       # Modal de configuration pré-génération
  ├── DurationTooltip.tsx        # Tooltip calcul transparent
  └── CriticalPathHighlight.tsx  # Surbrillance chemin critique
```

---

## 3. Modèle de données

### Nouvelles tables (migration 054)

```sql
-- Planning principal (1 par projet, basé sur une soumission)
CREATE TABLE project_plannings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  submission_id UUID REFERENCES submissions(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  start_date DATE NOT NULL,
  target_end_date DATE,
  calculated_end_date DATE,
  project_type TEXT DEFAULT 'new'
    CHECK (project_type IN ('new', 'renovation', 'extension', 'interior')),
  location_canton TEXT,
  config JSONB DEFAULT '{}',  -- nb_equipes, facteurs custom, etc.
  ai_generation_log JSONB,    -- log de génération pour transparence
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Phases / groupes de tâches (= lots CFC regroupés)
CREATE TABLE planning_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_id UUID NOT NULL REFERENCES project_plannings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cfc_codes TEXT[],           -- ex: ['211', '211.1', '211.2']
  color TEXT NOT NULL,        -- couleur de la barre groupe
  sort_order INTEGER NOT NULL,
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tâches individuelles du planning
CREATE TABLE planning_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_id UUID NOT NULL REFERENCES project_plannings(id) ON DELETE CASCADE,
  phase_id UUID NOT NULL REFERENCES planning_phases(id) ON DELETE CASCADE,
  submission_item_id UUID REFERENCES submission_items(id),
  name TEXT NOT NULL,
  description TEXT,
  cfc_code TEXT,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_days INTEGER NOT NULL,
  -- Transparence du calcul
  quantity NUMERIC,
  unit TEXT,
  productivity_ratio NUMERIC,      -- ratio utilisé (m²/jour, m³/jour, etc.)
  productivity_source TEXT,         -- 'crb_2025', 'user_override', 'ai_estimate'
  adjustment_factors JSONB,         -- {"season": 1.2, "complexity": 1.1}
  base_duration_days NUMERIC,       -- durée avant ajustements
  -- Assignation
  supplier_id UUID REFERENCES suppliers(id),
  team_size INTEGER DEFAULT 1,
  -- Statut
  progress NUMERIC DEFAULT 0        -- 0.0 à 1.0
    CHECK (progress >= 0 AND progress <= 1),
  is_milestone BOOLEAN DEFAULT false,
  milestone_type TEXT,               -- 'start', 'reception_provisoire', 'custom'
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Dépendances entre tâches
CREATE TABLE planning_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_id UUID NOT NULL REFERENCES project_plannings(id) ON DELETE CASCADE,
  predecessor_id UUID NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
  successor_id UUID NOT NULL REFERENCES planning_tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'FS'
    CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
  lag_days INTEGER DEFAULT 0,       -- décalage (ex: +7j séchage béton)
  source TEXT DEFAULT 'auto'        -- 'auto' (IA) ou 'manual' (utilisateur)
    CHECK (source IN ('auto', 'manual')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Liens partageables
CREATE TABLE planning_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_id UUID NOT NULL REFERENCES project_plannings(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,       -- token URL public
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Corrections de durée (apprentissage)
CREATE TABLE planning_duration_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  cfc_code TEXT NOT NULL,
  unit TEXT NOT NULL,
  original_ratio NUMERIC NOT NULL,
  corrected_ratio NUMERIC NOT NULL,
  project_type TEXT,
  canton TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE project_plannings ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE planning_duration_corrections ENABLE ROW LEVEL SECURITY;

-- Standard org-based RLS policies
CREATE POLICY "org_access" ON project_plannings
  FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
CREATE POLICY "org_access" ON planning_phases
  FOR ALL USING (planning_id IN (SELECT id FROM project_plannings WHERE organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())));
CREATE POLICY "org_access" ON planning_tasks
  FOR ALL USING (planning_id IN (SELECT id FROM project_plannings WHERE organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())));
CREATE POLICY "org_access" ON planning_dependencies
  FOR ALL USING (planning_id IN (SELECT id FROM project_plannings WHERE organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())));
CREATE POLICY "org_access" ON planning_shares
  FOR ALL USING (planning_id IN (SELECT id FROM project_plannings WHERE organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())));
CREATE POLICY "org_access" ON planning_duration_corrections
  FOR ALL USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Index
CREATE INDEX idx_planning_project ON project_plannings(project_id);
CREATE INDEX idx_planning_tasks_planning ON planning_tasks(planning_id);
CREATE INDEX idx_planning_deps_planning ON planning_dependencies(planning_id);
CREATE INDEX idx_planning_shares_token ON planning_shares(token);
CREATE INDEX idx_duration_corrections_cfc ON planning_duration_corrections(organization_id, cfc_code);
```

---

## 4. Génération IA du planning

### Flux de génération

```
1. Utilisateur clique "Générer le planning" (soumission ou projet)
     ↓
2. Modal de configuration :
   - Date de début (obligatoire)
   - Date de fin souhaitée (optionnel)
   - Type de projet : Neuf / Rénovation / Extension / Aménagement intérieur
   - Canton (pour coefficients régionaux + météo)
   - Contraintes spéciales (texte libre, optionnel)
     ↓
3. API POST /api/planning/generate
   - Étape 1 : Regrouper les items soumission par CFC → phases
   - Étape 2 : Calculer durées (ratios × quantités × facteurs)
   - Étape 3 : Appliquer dépendances standards CFC
   - Étape 4 : Claude ajuste selon contexte (saison, type, canton)
   - Étape 5 : Calculer chemin critique
   - Étape 6 : Insérer jalons (Début chantier + Réception provisoire)
     ↓
4. Résultat sauvé en DB → redirect vers /projects/[id]/planning
```

### Ratios de productivité (50+ entrées)

Fichier `packages/core/src/planning/productivity-ratios.ts` :

```typescript
export interface ProductivityRatio {
  cfc_code: string;
  description: string;
  unit: string;
  productivity_per_day: number;    // unités par jour par équipe
  team_size_default: number;       // taille équipe standard
  seasonal_factor: {
    winter: number;     // déc-fév (ex: 1.3 = +30% durée)
    spring: number;     // mar-mai
    summer: number;     // jun-aoû
    autumn: number;     // sep-nov
  };
}
```

Exemples de ratios :

| CFC | Description | Unité | Productivité/jour | Équipe |
|-----|-------------|-------|-------------------|--------|
| 113 | Terrassement mécanique | m³ | 80 | 1 pelle + 1 manœuvre |
| 211 | Béton armé C25/30 | m³ | 10 | 4 ouvriers + grue |
| 211.1 | Coffrage standard | m² | 20 | 3 coffreurs |
| 211.2 | Ferraillage B500B | kg | 500 | 2 ferrailleurs |
| 216 | Maçonnerie porteur | m² | 10 | 2 maçons |
| 221 | Fenêtres PVC triple | pce | 4 | 2 poseurs |
| 232 | Câblage électrique | ml | 40 | 2 électriciens |
| 242 | Chauffage au sol | m² | 25 | 2 installateurs |
| 251 | Roughing-in sanitaire | point | 3 | 2 plombiers |
| 271 | Chape ciment | m² | 50 | 3 chapistes |
| 281 | Carrelage sol | m² | 12 | 2 carreleurs |
| 285 | Peinture intérieure | m² | 50 | 2 peintres |

### Formule de calcul

```
durée_base = ceil(quantité / productivité_par_jour / nb_équipes)

facteur_saison = seasonal_factor[saison_du_mois_de_démarrage]
facteur_type = renovation ? 1.3 : extension ? 1.15 : 1.0
facteur_canton = regional_coefficients[canton]  // déjà dans cfc-prices.ts

durée_finale = ceil(durée_base × facteur_saison × facteur_type × facteur_canton)
```

### Dépendances standards CFC

Fichier `packages/core/src/planning/dependency-rules.ts` :

```typescript
export const STANDARD_DEPENDENCIES: DependencyRule[] = [
  // Gros-œuvre séquentiel
  { from_cfc: '113', to_cfc: '211', type: 'FS', lag: 0 },      // Terrassement → Béton
  { from_cfc: '211', to_cfc: '211.1', type: 'SS', lag: 0 },     // Béton + Coffrage en parallèle
  { from_cfc: '211', to_cfc: '211.2', type: 'SS', lag: 0 },     // Béton + Ferraillage en parallèle
  { from_cfc: '211', to_cfc: '216', type: 'FS', lag: 2 },       // Béton → Maçonnerie (+2j séchage)

  // Enveloppe après structure
  { from_cfc: '211', to_cfc: '221', type: 'FS', lag: 0 },       // Structure → Fenêtres
  { from_cfc: '211', to_cfc: '224', type: 'FS', lag: 0 },       // Structure → Façade

  // Techniques après mise hors d'eau
  { from_cfc: '221', to_cfc: '232', type: 'FS', lag: 0 },       // Fenêtres → Électricité
  { from_cfc: '221', to_cfc: '242', type: 'FS', lag: 0 },       // Fenêtres → CVC
  { from_cfc: '221', to_cfc: '251', type: 'FS', lag: 0 },       // Fenêtres → Sanitaire

  // Finitions après techniques
  { from_cfc: '232', to_cfc: '271', type: 'FS', lag: 0 },       // Électricité → Chapes
  { from_cfc: '242', to_cfc: '271', type: 'FS', lag: 0 },       // CVC → Chapes
  { from_cfc: '251', to_cfc: '271', type: 'FS', lag: 0 },       // Sanitaire → Chapes
  { from_cfc: '271', to_cfc: '281', type: 'FS', lag: 21 },      // Chapes → Carrelage (+21j séchage)
  { from_cfc: '271', to_cfc: '285', type: 'FS', lag: 14 },      // Chapes → Peinture (+14j séchage)
];
```

### Ajustement IA (Claude)

Prompt envoyé à Claude après le calcul mécanique :

```
Tu es un planificateur de chantier expert en construction suisse.
Voici un planning brouillon généré mécaniquement depuis une soumission.

Projet : {project.name}
Type : {config.project_type}
Canton : {config.canton}
Date début : {config.start_date}
Contraintes : {config.constraints}

Planning brouillon :
{phases_and_tasks_with_durations}

Vérifie et ajuste :
1. Les dépendances sont-elles logiques ?
2. Les durées sont-elles réalistes pour ce type de projet ?
3. Y a-t-il des contraintes saisonnières (gel, pluie) sur la période ?
4. Y a-t-il des chevauchements possibles pour optimiser ?
5. Y a-t-il des temps de séchage/prise oubliés ?

Retourne le planning ajusté en JSON.
```

---

## 5. Interface utilisateur

### 5.1 Page Planning `/projects/[id]/planning`

**Header** (sticky top) :
- Titre du planning + projet
- Zoom : Jour | **Semaine** (défaut) | Mois
- Boutons : "Régénérer (IA)", "Exporter PDF", "Exporter PNG", "Partager"
- Indicateur : "Durée totale : 187 jours · Fin estimée : 22 sept. 2026"
- Badge chemin critique : "Chemin critique : 143 jours"

**Panneau gauche — Liste des tâches** (35% largeur, redimensionnable) :
- Arbre hiérarchique : Phase > Tâche
- Chaque phase : nom, couleur, icône expand/collapse, durée totale
- Chaque tâche : nom, durée (jours), dates, fournisseur (si assigné)
- Double-clic sur durée → éditable inline
- Tooltip au survol de la durée : calcul transparent

```
📁 Gros-œuvre (78 jours)
  ├── Fondations          22j   12.03 → 10.04
  ├── Béton dalles RDC    15j   11.04 → 01.05
  ├── Coffrage murs R+1   18j   02.05 → 25.05
  └── Béton dalles R+1    12j   26.05 → 10.06
◆ Mise hors d'eau                     10.06
📁 Fenêtres & Portes (21 jours)
  └── Pose fenêtres PVC   21j   11.06 → 09.07
📁 Électricité (35 jours)
  ├── Câblage principal    18j   11.06 → 04.07
  └── Tableaux             12j   05.07 → 20.07
```

**Panneau droite — Timeline Gantt** (65% largeur) :
- Barres horizontales colorées par phase
- Barres de phase (transparentes) englobant les sous-tâches
- Jalons en losange ◆ (jaune)
- Flèches SVG entre tâches dépendantes (gris, pointillé pour FS, plein pour SS)
- Ligne rouge "Aujourd'hui"
- Chemin critique surligné (bordure rouge sur les barres critiques)
- Drag horizontal : déplacer une barre → cascade les dépendantes
- Drag bord droit : redimensionner durée
- Barre de progression (remplissage partiel, ex: 60% fait)

**Interactions Gantt** :
- Clic sur barre → sélectionne (highlight bleu) + affiche détail dans panneau gauche
- Double-clic → ouvre modal d'édition (durée, dates, fournisseur, notes)
- Drag point de connexion (petit cercle) → créer/supprimer dépendance
- Clic droit → menu contextuel (supprimer, dupliquer, ajouter jalon, supprimer dépendance)
- Scroll horizontal : naviguer dans le temps
- Scroll vertical : naviguer dans les tâches
- Ctrl+Z : undo (historique des 20 dernières actions)

**Détection incohérences IA** :
- Bannière orange en haut : "⚠️ 2 incohérences détectées"
- Clic → liste des problèmes avec suggestions
- Ex: "Électricité commence avant que la structure soit terminée. Décaler au 11.06 ?"
- Bouton "Corriger automatiquement" ou "Ignorer"

### 5.2 Modal de configuration (pré-génération)

Champs :
- Date de début chantier (datepicker, obligatoire)
- Date de fin souhaitée (datepicker, optionnel)
- Type de projet : radio (Neuf / Rénovation / Extension / Aménagement intérieur)
- Canton : select (26 cantons CH)
- Nombre d'équipes par phase : nombre (défaut 1 par phase, ajustable)
- Contraintes spéciales : textarea (optionnel, ex: "pas de travaux en août — vacances")
- Bouton : "Générer le planning" (spinner pendant 10-20s)

### 5.3 Tooltip calcul transparent

Au survol d'une barre ou de la durée dans la liste :

```
┌─────────────────────────────────────────┐
│ Coffrage murs R+1                       │
│                                         │
│ Quantité : 620 m²                       │
│ Ratio : 20 m²/jour (source: CRB 2025)  │
│ Équipes : 1                             │
│ Base : 620 ÷ 20 ÷ 1 = 31 jours         │
│                                         │
│ Ajustements :                           │
│   Saison printemps : ×1.0               │
│   Type neuf : ×1.0                      │
│   Canton VD : ×1.02                     │
│                                         │
│ Durée finale : 32 jours                 │
│                                         │
│ [✏️ Modifier la durée]                  │
└─────────────────────────────────────────┘
```

---

## 6. Export et partage

### 6.1 Export PDF A3 paysage

- Généré côté serveur via `jspdf` (déjà installé)
- Format A3 paysage (420×297mm)
- Contenu :
  - Header : logo Cantaia + nom projet + dates + "Généré par Cantaia — cantaia.ch"
  - Corps : rendu du Gantt (phases, barres, jalons, chemin critique)
  - Footer : légende couleurs + date de génération + numéro de page
- Route : `GET /api/planning/[id]/export-pdf`

### 6.2 Export PNG

- Screenshot côté client (html2canvas, déjà disponible via Canvas API)
- Résolution 2x pour impression
- Watermark discret bas-droite : "cantaia.ch"
- Téléchargement immédiat

### 6.3 Lien partageable

- Route `POST /api/planning/[id]/share` → génère token unique
- URL : `https://cantaia.ch/planning/{token}`
- Page publique `/planning/[token]` :
  - Header : logo Cantaia + "Propulsé par Cantaia" + lien "Essai gratuit"
  - Gantt en lecture seule (pas de drag, pas d'édition)
  - Zoom jour/semaine/mois
  - Responsive (mobile : scroll horizontal)
  - Expiration optionnelle (30 jours par défaut)
  - Le créateur peut révoquer le lien

### Branding sur tous les exports

| Export | Branding |
|--------|----------|
| **PDF** | Logo Cantaia en haut à gauche + "Généré par Cantaia — cantaia.ch" en footer |
| **PNG** | Watermark "cantaia.ch" en bas à droite, semi-transparent |
| **Lien** | Header pleine largeur "Propulsé par Cantaia" + CTA "Essai gratuit" |

---

## 7. Apprentissage et calibration

### Corrections de durée

Quand l'utilisateur modifie manuellement une durée :
1. La correction est sauvée dans `planning_duration_corrections`
2. Le ratio original et le ratio corrigé sont enregistrés
3. Pour les prochains plannings, le système utilise le ratio corrigé si disponible
4. Priorité : ratio corrigé org > ratio CRB 2025 > estimation IA

### Formule de calibration

```
ratio_calibré = moyenne_pondérée(
  ratio_crb × 0.3,
  ratio_corrections_récentes × 0.7  // 5 dernières corrections même CFC
)
```

Après 5+ corrections pour un même CFC, le ratio est considéré "calibré" et l'IA ne l'ajuste plus.

---

## 8. Intégrations modules existants

| Module | Intégration |
|--------|-------------|
| **Action Board** | Tâches du planning en retard → items dans le feed d'actions |
| **Briefing** | "Aujourd'hui : coulage dalle R+1" + "Cette semaine : début ferraillage R+2" |
| **Tâches (Kanban)** | Bouton "Pousser vers Tâches" → crée des tâches avec `source: 'planning'` |
| **Vue Direction** | Jalons + barre avancement dans les cards projet |
| **Fournisseurs** | Assignation fournisseur par phase → historique enrichi |
| **Soumissions** | Bouton "Générer le planning" sur la page soumission |

---

## 9. Navigation et routing

### Nouvel onglet projet
Ajout de **"Planning"** comme 11e onglet dans `/projects/[id]` (entre "Archivage" et "Clôture").

### Sidebar
Pas de nouveau lien sidebar — le planning est accessible via le projet.

### Middleware
Ajouter `/projects/*/planning` aux routes protégées (déjà couvert par `/projects`).

### Point d'entrée soumission
Bouton "Générer le planning" dans le header de `/submissions/[id]` (à côté de "Ré-analyser").

---

## 10. Estimation d'effort

| Composant | Effort | Priorité |
|-----------|--------|----------|
| Migration DB (6 tables) | S (1 jour) | P0 |
| Ratios de productivité (50 entrées) | S (1 jour) | P0 |
| Dépendances standards CFC | S (0.5 jour) | P0 |
| API génération planning | L (3-4 jours) | P0 |
| Composant GanttChart (classic split) | XL (5-7 jours) | P0 |
| Drag & resize barres (dnd-kit) | L (3-4 jours) | P0 |
| Flèches SVG dépendances | M (2 jours) | P1 |
| Chemin critique | M (2 jours) | P1 |
| Tooltip calcul transparent | S (1 jour) | P1 |
| Export PDF A3 | M (2-3 jours) | P1 |
| Export PNG | S (0.5 jour) | P1 |
| Lien partageable + page publique | M (2-3 jours) | P2 |
| Détection incohérences IA | M (2 jours) | P2 |
| Apprentissage corrections durée | M (2 jours) | P2 |
| Intégrations modules (Action Board, Briefing, Direction) | L (3 jours) | P2 |
| i18n (FR/EN/DE) | M (2 jours) | P2 |
| **TOTAL** | **~30-35 jours** | |

### Séquençage recommandé

**Sprint 1 (2 semaines)** : Migration + ratios + API génération + composant Gantt base + drag
**Sprint 2 (2 semaines)** : Dépendances + chemin critique + exports + tooltips
**Sprint 3 (1 semaine)** : Lien partageable + IA incohérences + apprentissage + intégrations
