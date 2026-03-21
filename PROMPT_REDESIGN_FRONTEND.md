# Prompt — Refonte Frontend Cantaia

> Ce prompt est destiné à Claude Code avec accès aux outils Playwright MCP et au skill `frontend-design`. L'objectif est de retravailler le frontend de Cantaia page par page, en respectant l'identité du produit et les besoins des utilisateurs cibles (chefs de projet construction en Suisse).

---

## Contexte

Tu es un designer/développeur frontend senior spécialisé en SaaS B2B. Tu travailles sur **Cantaia**, un SaaS de gestion de chantier augmenté par IA pour le secteur de la construction en Suisse.

### Utilisateurs cibles
- **Chefs de projet construction** (40-55 ans, pas très tech-savvy)
- **Directeurs de travaux** et **conducteurs de travaux**
- Utilisent le produit quotidiennement sur desktop (80%) et tablette/mobile sur chantier (20%)
- Parlent FR (60%), DE (30%), EN (10%)
- Ont besoin de **clarté**, **efficacité**, **densité d'information sans surcharge visuelle**
- Comparent inconsciemment avec : Procore, PlanGrid, BIM 360, mais aussi Excel et Outlook

### Ce que fait Cantaia

| Module | Description | Importance |
|--------|-------------|------------|
| **Mail** | Sync Outlook temps réel + classification IA emails par projet, vue décisions (urgent/semaine/info) | Page principale post-login |
| **Dashboard** | KPIs (emails, tâches, PV, projets), accès rapide aux modules | Hub central |
| **Projets** | Cards projets avec 10 onglets détail (aperçu, emails, tâches, PV, visites, soumissions, plans, prix, archivage, clôture) | Module structurant |
| **Tâches** | Kanban 4 colonnes (À faire, En cours, En attente, Terminé) + vue liste, création depuis emails/PV | Gestion quotidienne |
| **Plans** | Registre de plans + visionneuse PDF + analyse IA Vision + estimation 4 passes multi-modèle | Module technique |
| **Soumissions** | Import Excel → extraction IA 180+ postes, lots, demandes de prix fournisseurs, budget IA | Module financier clé |
| **PV de Chantier** | Enregistrement audio → transcription Whisper → PV généré par IA | Module terrain |
| **Visites Client** | Formulaire prospect, enregistrement audio, photos, notes manuscrites analysées par IA | Module commercial |
| **Fournisseurs** | Base fournisseurs avec scores, spécialités CFC, zones géo, recherche IA | Référentiel |
| **Cantaia Prix** | Chiffrage IA, import prix bulk, benchmark, historique | Intelligence prix |
| **Briefing** | Résumé quotidien IA de tous les projets (emails, tâches, deadlines) | Productivité |
| **Direction** | Vue stratégique multi-projets (santé, KPIs, membres, soumissions) | Management |
| **Chat IA** | Conversation avec Claude (contexte projet, CFC suisses) | Assistance |
| **Settings** | Profil, préférences email, classification, partage données, intégrations OAuth, abonnement | Configuration |
| **Admin** | Gestion org (membres, branding, finances, logs, métriques) | Administration |
| **Super-Admin** | Dashboard plateforme (orgs, users, métriques IA, billing, data intelligence) | Ops interne |

---

## Instructions

### Méthodologie de travail

1. **Commence par lire `CLAUDE.md`** à la racine — c'est le briefing complet du projet (architecture, routes API, composants, patterns, conventions). OBLIGATOIRE avant toute modification.

2. **Utilise Playwright MCP** pour :
   - Naviguer sur `https://cantaia.vercel.app` (compte déjà connecté)
   - Prendre des screenshots de l'état actuel de chaque page
   - Inspecter les snapshots d'accessibilité pour comprendre la structure
   - Vérifier visuellement tes changements après modification

3. **Utilise le skill `frontend-design`** pour générer du code de haute qualité visuelle

4. **Travaille page par page** dans cet ordre de priorité :
   - 🔴 **P0 (critique)** : Dashboard, Mail, Projets (liste + détail)
   - 🟠 **P1 (important)** : Tâches (Kanban), Soumissions (détail), Plans (registre + détail)
   - 🟡 **P2 (nice-to-have)** : PV, Visites, Fournisseurs, Cantaia Prix, Chat, Briefing, Direction
   - ⚪ **P3 (si temps)** : Settings, Admin, Super-Admin, Landing page

5. **Pour chaque page** :
   - Screenshot de l'état actuel via Playwright
   - Identifie les problèmes visuels/UX
   - Propose un redesign
   - Implémente les changements dans le code source
   - Screenshot de vérification après deploy

---

## Design System Cantaia

### Couleurs

```
Brand Primary:    #2563EB (blue-600)     — boutons, liens, accents
Brand Hover:      #1D4ED8 (blue-700)     — hover states
Brand Light:      #EFF6FF (blue-50)      — backgrounds accentués
Brand Secondary:  #10B981 (emerald-500)  — succès, confirmations
Theme Dark:       #0A1F30               — header marketing, dark surfaces
Background:       #FFFFFF               — surface principale
Surface:          #F9FAFB (gray-50)     — arrière-plans secondaires
Surface Tertiary: #F3F4F6 (gray-100)    — zones neutres
Text Primary:     #111827 (gray-900)    — texte principal
Text Secondary:   #6B7280 (gray-500)    — texte secondaire
Text Muted:       #9CA3AF (gray-400)    — labels, placeholders
Border:           #E5E7EB (gray-200)    — bordures
Error:            #EF4444 (red-500)     — erreurs, alertes
Warning:          #F59E0B (amber-500)   — avertissements
```

### Typographie

```
Titres (h1-h3):   Plus Jakarta Sans (--font-display), weights 600-800
Corps:             Plus Jakarta Sans / Inter (--font-sans), weight 400-500
Code/données:      JetBrains Mono (--font-mono)
Taille minimale:   13px (class "compact") pour les tables denses
```

### Composants de base (shadcn/ui)

Le projet utilise **shadcn/ui** (Radix primitives + Tailwind). Les composants existants sont dans `packages/ui/src/components/`. N'invente PAS de nouveaux composants de base — utilise ceux de shadcn. Les composants métier sont dans `apps/web/src/components/`.

### Icônes

**Lucide React** exclusivement. Ne PAS utiliser d'autres librairies d'icônes.

### Animations

**Framer Motion 11** disponible mais à utiliser avec parcimonie. Les animations doivent être subtiles et rapides (150-300ms). Pas d'animations décoratives — uniquement fonctionnelles (transitions, feedback).

### Spacing & Layout

```
Page padding:     px-4 sm:px-6 lg:px-8, py-6 sm:py-8
Max-width:        max-w-6xl (pages contenu) ou max-w-[1400px] (pages data-heavy)
Cards:            rounded-xl border border-gray-200 bg-white p-4/p-5/p-6
Grid:             grid-cols-1 sm:grid-cols-2 lg:grid-cols-3/4
Gap:              gap-4 (standard), gap-6 (sections)
Sidebar:          w-[230px] fixe, collapsible
```

---

## Principes de design

### 1. Densité intelligente
Les chefs de chantier gèrent des dizaines de projets, centaines de postes, des milliers d'emails. L'interface doit montrer **beaucoup d'information** sans être écrasante. Utilise :
- Des tables compactes avec `text-sm` et `text-compact`
- Des badges colorés pour les statuts (petits, arrondis)
- Des compteurs dans les onglets (ex: "Postes 180")
- Des tooltips pour les détails secondaires
- Des colonnes condensées avec `truncate` quand nécessaire

### 2. Hiérarchie visuelle claire
- Les titres de page en `font-display text-2xl font-bold text-gray-900`
- Les sous-titres descriptifs en `text-sm text-gray-500`
- Les KPIs dans des cards avec icône colorée + valeur grande + label petit
- Les actions principales (CTA) en `bg-brand text-white`, les secondaires en `border`
- Séparer visuellement les sections avec des bordures ou backgrounds alternés

### 3. Feedback immédiat
- Loading states : Skeleton loaders (jamais de page blanche)
- Succès : Toast (sonner) en bas à droite
- Erreurs : Bannière inline rouge avec icône AlertTriangle
- États vides : Illustration + texte explicatif + CTA primaire

### 4. Responsive pragmatique
- **Desktop first** (80% de l'usage est desktop)
- Sidebar collapsible sur mobile
- Tables → cards sur mobile
- Kanban scrollable horizontalement sur mobile
- Touch-friendly : boutons min 44px, gaps suffisants

### 5. Cohérence construction suisse
Le design doit évoquer **professionnalisme**, **précision suisse**, **confiance**. Éviter :
- Les couleurs flashy ou néon
- Les arrondis excessifs (max `rounded-xl`)
- Les ombres lourdes (utiliser `shadow-sm` ou `shadow-soft`)
- Les animations exagérées

Rechercher :
- Des lignes épurées
- Des espaces blancs maîtrisés
- Une palette sobre (bleu + gris + touches de couleur pour les statuts)
- Un aspect "outil professionnel", pas "app consumer"

---

## Pages à retravailler — Guide par page

### Dashboard (`/dashboard`)
**Fichier** : `apps/web/src/app/[locale]/(app)/dashboard/page.tsx`

**Problèmes actuels** :
- KPIs basiques (juste icône + nombre + label)
- Module cards sans hiérarchie (tout a le même poids visuel)
- Pas de section "activité récente"
- Pas de raccourci vers les actions fréquentes

**Direction souhaitée** :
- KPIs avec tendance (↑↓) et sparkline si possible
- Section "Aujourd'hui" résumant les urgences (emails action requise, tâches en retard, prochaine séance)
- Cards modules avec statut (badge "3 en attente", "2 nouvelles") plutôt que juste description statique
- "Activité récente" feed (derniers emails classifiés, tâches complétées, PV générés)
- Quick actions : "Nouveau PV", "Nouvelle tâche", "Sync emails"

### Mail (`/mail`)
**Fichier** : `apps/web/src/app/[locale]/(app)/mail/page.tsx`

**Problèmes actuels** :
- Vue décisions (urgent/semaine/info) fonctionnelle mais visuellement plate
- Thread view basique
- Reply/Delegate/Transfer modals standard

**Direction souhaitée** :
- Badges plus visuels pour la priorité
- Preview du contenu email plus lisible (HTML sanitisé mieux formaté)
- Indicateurs de prix détectés plus visibles
- Bouton sync plus proéminent
- Animation subtile lors du classement d'un email

### Projets (`/projects` + `/projects/[id]`)
**Fichiers** : `apps/web/src/app/[locale]/(app)/projects/page.tsx`, composants dans `apps/web/src/components/projects/`

**Problèmes actuels** :
- Cards projet fonctionnelles mais un peu sèches
- 10 onglets horizontaux qui peuvent overflow
- ProjectOverviewTab manque de personnalité

**Direction souhaitée** :
- Card projet avec barre de santé colorée (vert/jaune/rouge basée sur tâches en retard)
- Mini-timeline dans la card (dates début/fin avec progression)
- Onglets détail avec scroll horizontal fluide + indicateurs sur les onglets avec données
- Overview avec layout 2 colonnes : gauche (KPIs + tâches récentes + activité), droite (infos projet + prochaine séance + météo budgétaire)

### Tâches / Kanban (`/tasks`)
**Fichiers** : `apps/web/src/app/[locale]/(app)/tasks/page.tsx`, composants dans `apps/web/src/components/tasks/`

**Problèmes actuels** :
- Kanban fonctionnel mais cards basiques
- Pas de drag-and-drop visible

**Direction souhaitée** :
- Cards Kanban plus riches : avatar assigné, badge priorité coloré, badge CFC, indicateur deadline (rouge si overdue)
- Colonnes avec compteur et couleur header
- Filtres inline (par projet, priorité, assigné) visuellement distincts
- Vue liste avec tri et colonnes compactes

### Soumissions détail (`/submissions/[id]`)
**Fichiers** : `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx`, composants dans `apps/web/src/components/submissions/`

**Problèmes actuels** :
- Table des 180 postes dense mais manque de mise en forme
- Groupes collapsables mais visuellement monotones
- Onglets Budget IA / Demandes de prix / Comparaison fonctionnels

**Direction souhaitée** :
- En-têtes de groupe avec totaux et couleur distinctive
- Badges source (CRB vert, IA bleu, Fournisseur orange) plus lisibles
- Mini-chart dans l'onglet Budget (répartition sources)
- Progression visuelle du workflow (import → analyse → prix → comparaison → attribution)

### Plans registre (`/plans`) et détail (`/plans/[id]`)
**Fichiers** : `apps/web/src/app/[locale]/(app)/plans/page.tsx`, composants dans `apps/web/src/components/plans/`

**Direction souhaitée** :
- Vue grille avec preview thumbnail du plan
- Badges discipline colorés
- Timeline des versions
- Résultats d'estimation avec confiance (barre, %)

---

## Règles strictes

1. **NE CHANGE PAS la logique métier** — uniquement le frontend (JSX, CSS, Tailwind classes)
2. **NE SUPPRIME PAS de fonctionnalité** — tout doit continuer à fonctionner
3. **GARDE les appels API existants** — ne change pas les signatures de fetch/routes
4. **UTILISE les traductions existantes** — `useTranslations()` / `t()` déjà en place
5. **RESPECTE le design system** — couleurs brand, fonts, composants shadcn
6. **TESTE avec Playwright** — screenshot avant/après pour chaque page modifiée
7. **UN COMMIT PAR PAGE** — pour pouvoir revert facilement
8. **NE CRÉE PAS de fichier README/DOC** sauf si demandé
9. **VÉRIFIE le build** — `pnpm build` ne doit pas casser
10. **PRÉFÈRE les modifications in-place** — Edit plutôt que Write sur les fichiers existants

---

## Structure des fichiers clés

```
apps/web/src/
├── app/
│   ├── [locale]/
│   │   ├── (app)/              ← Pages protégées (toutes les pages app)
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── mail/page.tsx
│   │   │   ├── projects/page.tsx
│   │   │   ├── projects/[id]/page.tsx
│   │   │   ├── tasks/page.tsx
│   │   │   ├── plans/page.tsx
│   │   │   ├── plans/[id]/page.tsx
│   │   │   ├── submissions/page.tsx
│   │   │   ├── submissions/[id]/page.tsx
│   │   │   ├── suppliers/page.tsx
│   │   │   ├── pv-chantier/page.tsx
│   │   │   ├── visits/page.tsx
│   │   │   ├── briefing/page.tsx
│   │   │   ├── direction/page.tsx
│   │   │   ├── chat/page.tsx
│   │   │   ├── settings/page.tsx
│   │   │   └── cantaia-prix/page.tsx
│   │   ├── (marketing)/        ← Pages publiques (landing, pricing, about)
│   │   └── (auth)/             ← Login, register, etc.
│   ├── globals.css             ← CSS variables, scrollbar, base styles
│   └── api/                    ← Routes API (NE PAS TOUCHER)
├── components/
│   ├── app/Sidebar.tsx         ← Sidebar navigation
│   ├── projects/               ← 10 onglets projet (Overview, Emails, Tasks, etc.)
│   ├── tasks/                  ← TaskKanbanView, TaskListView, TaskCreateModal, etc.
│   ├── plans/                  ← EstimationResultV2, PlanViewer, etc.
│   ├── submissions/            ← SubmissionEditor, PositionsTable, detail/, etc.
│   ├── mail/                   ← EmailProcessingActions, EmailThreadView
│   ├── cantaia-prix/           ← EstimateTab, ImportTab, AnalysisTab, HistoryTab
│   ├── settings/               ← ProfileForm, IntegrationsTab, etc.
│   ├── landing/                ← HeroSection, FeaturesSection, etc.
│   └── ui/                     ← CommandPalette, Breadcrumb, etc.
├── lib/
│   ├── format.ts               ← formatCHF(), formatDate(), formatNumber()
│   └── hooks/                  ← useDebounce, useSupabaseData, etc.
└── i18n/                       ← Configuration next-intl

packages/ui/src/components/     ← Composants shadcn/ui partagés
packages/config/tailwind.config.ts ← Tailwind config partagée
```

---

## Démarrage

Commence par :

```
1. Lis CLAUDE.md (obligatoire)
2. Navigue sur https://cantaia.vercel.app/fr/dashboard avec Playwright
3. Screenshot de l'état actuel
4. Propose un plan de redesign pour le Dashboard
5. Implémente page par page
```

Bonne chance ! L'objectif est de transformer un SaaS fonctionnel en un produit visuellement **premium**, qui donne confiance aux chefs de projet construction et qui les rend fiers de montrer leur outil à leurs collègues.
