# Refonte Navigation Cantaia — Design Spec

**Date** : 2026-03-20
**Auteur** : Claude + Julien Ray
**Statut** : Approuvé (brainstorming)

---

## 1. Problème

La sidebar actuelle de Cantaia affiche 15 éléments dans une liste plate sans regroupement logique. Les utilisateurs (chefs de projet construction) pensent en termes de **projets**, mais la navigation est organisée par **outils**. Il en résulte :

- Aucune hiérarchie visuelle — l'utilisateur scanne 15 items pour trouver ce qu'il cherche
- Pas de contexte projet — naviguer entre Mail et une soumission perd le fil du projet
- Noms ambigus ("JM" pour le chat IA, "Action Board" redondant avec Dashboard)
- 11 onglets horizontaux serrés sur la page projet détail
- Aucun breadcrumb sur les pages profondes
- Page `/pricing-intelligence` en 404 (orpheline)

## 2. Principes directeurs

1. **Centré projet** — le projet est l'unité de travail principale, la navigation doit le refléter
2. **Adaptatif** — ne montrer que ce qui est pertinent (pas de liens vers des sections vides)
3. **Contexte intelligent** — le projet actif suit l'utilisateur automatiquement
4. **Minimal mais complet** — réduire le nombre d'items visibles sans cacher des fonctionnalités essentielles

## 3. Structure de la sidebar

### 3.1 Trois sections

La sidebar passe de 15 items plats à 3 sections logiques :

```
┌─────────────────────────┐
│  🔷 Cantaia              │
├─────────────────────────┤
│  QUOTIDIEN               │
│  📊 Dashboard            │
│  ✉️  Mail           (25)  │
│  📋 Briefing             │
├─────────────────────────┤
│  RÉFÉRENTIELS            │
│  🏢 Fournisseurs         │
│  📈 Cantaia Prix         │
│  💬 Assistant IA         │
├─────────────────────────┤
│  PROJET ACTIF            │
│  🔵 Central Malley    ⌄  │
│     📋 Tâches       (9)  │
│     📐 Plans        (2)  │
│     📑 Soumissions  (1)  │
│     📅 Planning          │
│     💰 Prix              │
│     ⋯  Voir tout         │
├─────────────────────────┤
│  ⚙️  Paramètres           │
│  🔧 Administration       │
├─────────────────────────┤
│  👤 Julien          [↗]  │
└─────────────────────────┘
```

### 3.2 Section QUOTIDIEN

Outils utilisés tous les jours, indépendants d'un projet spécifique :

| Item | Route | Notes |
|------|-------|-------|
| Dashboard | `/dashboard` | Absorbe l'ancien "Direction" comme onglet/section "Vue organisation" |
| Mail | `/mail` | Badge unread conservé |
| Briefing | `/briefing` | Résumé quotidien IA |

**Éléments supprimés de la sidebar :**
- **Action Board** — supprimé, redondant avec Dashboard
- **Direction** — fusionné dans Dashboard (ajout d'un toggle ou onglet "Mon organisation")
- **Tâches (global)** — accessible via Dashboard (section tâches urgentes) et via le projet actif
- **PV de chantier (global)** — accessible via le projet actif uniquement
- **Visites (global)** — accessible via le projet actif uniquement

**Routes globales conservées (accès hors sidebar) :**

Les pages `/tasks`, `/pv-chantier` et `/visits` restent fonctionnelles mais ne sont plus dans la sidebar. Elles restent accessibles via :
- La Command Palette (Cmd+K)
- Le Dashboard (liens rapides)
- L'URL directe

Aucun redirect n'est ajouté sur ces routes — elles continuent de fonctionner normalement. Ces pages affichent les données tous projets confondus, ce qui reste utile pour une vue globale.

### 3.3 Section RÉFÉRENTIELS

Données transversales pas liées à un projet unique :

| Item | Route | Notes |
|------|-------|-------|
| Fournisseurs | `/suppliers` | Annuaire global, inchangé |
| Cantaia Prix | `/cantaia-prix` | Outil d'estimation global, inchangé |
| Assistant IA | `/chat` | Renommé de "JM" — plus explicite |

### 3.4 Section PROJET ACTIF

Cœur de la refonte. Affiche le projet en cours avec ses outils pertinents.

**Switcher de projet :**
- Clic sur le nom du projet → dropdown
- Liste des projets récents (5 max), triés par `updated_at` du projet (déjà existant en DB, mis à jour par Supabase à chaque modification)
- Barre de recherche dans le dropdown pour projets nombreux
- Badge couleur par projet (couleur existante dans `projects.color`)
- État "Aucun projet sélectionné" : message "Sélectionnez un projet" + lien vers `/projects`. Aucun outil adaptatif n'est affiché dans cet état.

**Outils adaptatifs :**

Chaque outil est un lien vers la page projet détail avec le bon onglet : `/projects/[id]?tab=<tab>`.

| Outil | Route sidebar | Condition d'affichage | Compteur |
|-------|--------------|----------------------|----------|
| Aperçu | `/projects/[id]` (onglet Overview par défaut) | Toujours | — |
| Tâches | `/projects/[id]?tab=tasks` | Toujours | Nombre de tâches ouvertes |
| Planning | `/projects/[id]?tab=planning` (vue onglet inline, pas la page dédiée) | Toujours | — |
| Plans | `/projects/[id]?tab=plans` | Si `plan_count >= 1` | Nombre de plans |
| Soumissions | `/projects/[id]?tab=submissions` | Si `submission_count >= 1` | Nombre de soumissions |
| PV de séance | `/projects/[id]?tab=meetings` | Si `meeting_count >= 1` | Nombre de PV |
| Visites | `/projects/[id]?tab=visits` | Si `visit_count >= 1` | Nombre de visites |
| Emails | `/projects/[id]?tab=emails` | Si `email_count >= 1` | Nombre d'emails classés |
| Prix | `/projects/[id]?tab=prix` | Si `has_budget_estimate === true` | — |

**"Voir tout" :**
- Dernier item, toujours visible
- Navigue vers `/projects/[id]` (page projet détail complète)
- Donne accès aux onglets moins fréquents : Archivage, Clôture, Paramètres projet

**Sidebar collapsée :**
Quand la sidebar est en mode collapsed (icônes uniquement), la section PROJET ACTIF affiche l'icône du projet (initiale + couleur). Au survol ou clic : popover avec le nom du projet et la liste des outils adaptatifs.

### 3.5 Section bas de sidebar

Inchangée :
- Paramètres → `/settings`
- Administration → `/admin` (visible selon rôle : project_manager, director, admin, superadmin)
- Profil utilisateur + bouton déconnexion

## 4. Changement de contexte intelligent

Le projet actif se met à jour automatiquement dans ces situations :

| Trigger | Comportement |
|---------|-------------|
| Navigation vers `/projects/[id]/*` | Switch immédiat vers ce projet |
| Ouverture soumission (`/submissions/[id]`) | La page soumission détail fait `GET /api/submissions/[id]` qui retourne `project_id`. L'`ActiveProjectProvider` appelle `setActiveProject(project_id)`. |
| Ouverture plan (`/plans/[id]`) | La page plan détail fait `GET /api/plans/[id]` qui retourne `project_id`. L'`ActiveProjectProvider` appelle `setActiveProject(project_id)`. |
| Clic email classé dans un projet | Le composant email a déjà `email.project_id` en mémoire. Si non null → `setActiveProject(project_id)`. |
| Clic projet dans Dashboard | Switch vers ce projet via `setActiveProject(project_id)` |
| Navigation vers page transversale (Mail, Dashboard, Settings, Suppliers, Cantaia Prix, Chat) | **Pas de changement** — le dernier projet actif reste. Ces pages ne dépendent pas du projet actif et n'interagissent pas avec `ActiveProjectProvider`. |

**Persistance :**
- Stocké dans `localStorage` sous la clé `cantaia_active_project_id`
- Restauré au chargement de l'app
- Si le projet stocké n'existe plus (supprimé/archivé) → état "Aucun projet"

**Implémentation :**
- Nouveau context React : `ActiveProjectProvider`
- Expose : `activeProject`, `setActiveProject(id)`, `projectTools` (liste adaptative), `refreshCounts()`, `isLoading`
- Le provider fetch les compteurs du projet actif via un endpoint léger (`GET /api/projects/[id]/nav-counts`)
- `setActiveProject(id)` met à jour `localStorage` et déclenche un fetch des compteurs
- Le provider est placé dans le layout `(app)` au même niveau que `AuthProvider`
- **Gestion d'erreur** : si `nav-counts` retourne 403 (projet d'une autre org, ex: changement de subdomain) → le provider vide `localStorage`, passe en état "Aucun projet" silencieusement. Pas de message d'erreur visible (le projet n'appartient simplement plus au contexte courant).

## 5. Breadcrumbs légers

### 5.1 Format

```
Central Malley / Soumissions
↑ cliquable        ↑ page courante (non cliquable)
```

### 5.2 Règles

| Contexte | Breadcrumb affiché |
|----------|-------------------|
| Page projet (aperçu) | `Central Malley` |
| Onglet projet (tâches, plans...) | `Central Malley / Tâches` |
| Détail dans un projet (soumission détail) | `Central Malley / Soumissions` |
| Page transversale (Mail, Dashboard...) | Aucun breadcrumb |
| Page settings/admin | Aucun breadcrumb |

### 5.3 Composant

- `<ProjectBreadcrumb />` — composant client
- Lit le projet actif depuis `ActiveProjectProvider`
- Positionné au-dessus du titre de page (`h1`)
- Style : texte `text-sm text-muted-foreground`, projet en lien bleu
- Le nom du projet est cliquable → navigue vers `/projects/[id]`

## 6. Nouvelle route API

### `GET /api/projects/[id]/nav-counts`

Endpoint léger pour alimenter la sidebar adaptative.

**Auth & sécurité :**
- Authentification Supabase requise (`createClient()` + `getUser()`)
- Vérification IDOR : le projet doit appartenir à l'`organization_id` de l'utilisateur (même pattern que les autres routes projets)
- Retourne 401 si non authentifié, 403 si le projet n'appartient pas à l'org

**Réponse :**
```json
{
  "task_count": 9,
  "plan_count": 2,
  "submission_count": 1,
  "meeting_count": 1,
  "visit_count": 0,
  "email_count": 0,
  "has_budget_estimate": true
}
```

Le champ `has_budget_estimate` est déterminé par `COUNT(*) FILTER (WHERE budget_estimate IS NOT NULL) > 0` sur la table `submissions`.

**Performance :** une seule requête SQL avec des sous-requêtes `SELECT COUNT(*)` par table, filtrées par `project_id`. Le `has_budget_estimate` utilise un `COUNT FILTER` sur `submissions`. Appelé au switch de projet, mis en cache dans le state React.

**Invalidation du cache :**
- Re-fetch au focus window (`window.addEventListener("focus")`)
- Le provider expose `refreshCounts()` — appelé par les composants qui modifient les données du projet (ex: création de tâche, upload de plan, création de soumission). Les pages projet détail appellent `refreshCounts()` après chaque mutation réussie.
- Re-fetch automatique au `setActiveProject(id)` si l'id change

## 7. Migration Dashboard + Direction

### 7.1 Dashboard augmenté

La page `/dashboard` absorbe le contenu de `/direction` :

- **Vue par défaut** : KPIs personnels (emails, tâches, briefing) — ce qui existe déjà
- **Nouveau toggle/onglet "Organisation"** : vue Direction actuelle (tous les projets, budget total, alertes critiques, santé projets)
- Visible uniquement pour les rôles `project_manager`, `director`, `admin`, `superadmin`

### 7.2 Pages supprimées

| Page | Action |
|------|--------|
| `/direction` | Contenu migré dans Dashboard onglet "Organisation". Redirect 308 au niveau de la page (`redirect()` dans `page.tsx`) vers `/dashboard?view=org`. La route reste dans `middleware.ts` protectedPaths. |
| `/pricing-intelligence` | Déjà supprimée (ni page ni route n'existent). Aucune action nécessaire. |
| `/action-board` | Route et API existent. Page `page.tsx` : remplacer par `redirect("/dashboard")`. API `route.ts` : supprimer (le Dashboard a ses propres routes). |

## 8. Renommages

| Ancien | Nouveau | Raison |
|--------|---------|--------|
| JM | Assistant IA | "JM" n'est pas parlant pour un nouvel utilisateur |
| PV de chantier | PV de séance | Alignement avec le vocabulaire SIA suisse (déjà utilisé dans les onglets projet). La route `/pv-chantier` reste inchangée (pas de rename de route, seulement le label UI). |
| Direction | — (supprimé) | Fusionné dans Dashboard |
| Action Board | — (supprimé) | Doublon Dashboard |

## 9. Sidebar mobile

La navigation mobile suit la même logique :

- **Barre du bas (5 items max)** : Dashboard, Mail, Projet actif (ouvre les outils), Assistant IA, Plus
- **Menu "Plus"** : Briefing, Fournisseurs, Cantaia Prix, Paramètres, Administration
- **Projet actif** : tap sur l'icône projet → sheet bottom avec switcher + outils adaptatifs
- **État "Aucun projet"** : l'icône projet en barre du bas affiche un `+` ou un placeholder. Tap → sheet bottom avec message "Sélectionnez un projet" + liste des projets récents

## 10. Ce qui ne change PAS

- Command Palette (Cmd+K) — déjà implémenté
- Sidebar collapsible — garde le comportement
- Super-Admin sidebar — reste séparée (dark theme, son propre layout)
- Badge unread Mail — conservé
- Icônes sidebar — conservées (lucide-react)
- Scroll sidebar — si la section projet actif + outils dépasse la hauteur, scroll interne

## 10b. Notes d'implémentation sidebar

**Réécriture du composant `Sidebar.tsx` :**
Le composant actuel utilise un modèle `NavItem[]` avec un champ `group` (`"main"`, `"daily"`, `"projects"`, `"data"`, `"assistant"`, `"management"`). Ce modèle est remplacé par une structure en 3 sections JSX explicites (Quotidien, Référentiels, Projet Actif) au lieu d'un rendu par boucle sur un array plat. Les `NavItem` des sections Quotidien et Référentiels restent dans un array mais avec un nouveau champ `section` au lieu de `group`. La section Projet Actif est un composant dédié (`<ActiveProjectSection />`) qui lit les données depuis `ActiveProjectProvider`.

**Headers de section :**
Les labels "QUOTIDIEN", "RÉFÉRENTIELS" et "PROJET ACTIF" sont des labels non cliquables et non interactifs (comme les headers de groupe dans la sidebar existante). Seul le **nom du projet** dans la section PROJET ACTIF est interactif (ouvre le dropdown switcher).

## 11. Clés i18n

Nouvelles clés à ajouter dans `apps/web/messages/{fr,en,de}.json` :

| Clé | FR | EN | DE |
|-----|----|----|-----|
| `nav.sections.daily` | Quotidien | Daily | Täglich |
| `nav.sections.references` | Référentiels | References | Referenzen |
| `nav.sections.activeProject` | Projet actif | Active project | Aktives Projekt |
| `nav.assistantAi` | Assistant IA | AI Assistant | KI-Assistent |
| `nav.briefing` | Briefing | Briefing | Briefing |
| `nav.selectProject` | Sélectionnez un projet | Select a project | Projekt auswählen |
| `nav.seeAll` | Voir tout | See all | Alle anzeigen |
| `nav.projectSearch` | Rechercher un projet… | Search project… | Projekt suchen… |
| `nav.recentProjects` | Projets récents | Recent projects | Neueste Projekte |
| `nav.overview` | Aperçu | Overview | Übersicht |
| `nav.pvSeance` | PV de séance | Meeting minutes | Sitzungsprotokoll |
| `dashboard.orgView` | Organisation | Organization | Organisation |
| `dashboard.personalView` | Mon tableau de bord | My dashboard | Mein Dashboard |
| `breadcrumb.tasks` | Tâches | Tasks | Aufgaben |
| `breadcrumb.plans` | Plans | Plans | Pläne |
| `breadcrumb.submissions` | Soumissions | Submissions | Submissions |
| `breadcrumb.meetings` | PV de séance | Meetings | Sitzungen |
| `breadcrumb.visits` | Visites | Visits | Besuche |
| `breadcrumb.emails` | Emails | Emails | E-Mails |
| `breadcrumb.prix` | Prix | Pricing | Preise |
| `breadcrumb.planning` | Planning | Planning | Planung |

Les clés existantes (`nav.dashboard`, `nav.mail`, `nav.suppliers`, `nav.cantaiaPrix`, `nav.settings`, `nav.admin`) sont conservées telles quelles.

## 12. Modifications middleware

### `middleware.ts` — `protectedPaths`

**Ajout :**
- `/pv-chantier` — n'est pas actuellement dans `protectedPaths`, doit y être ajouté (la page existe et nécessite auth)
- `/chat` — n'est pas actuellement protégé, ajouter pour cohérence (page app authentifiée)
- `/cantaia-prix` — n'est pas actuellement protégé, ajouter pour cohérence (page app authentifiée)

**Suppression :**
- `/pricing-intelligence` — déjà absente du code et de `protectedPaths`. Aucune action nécessaire (page et route n'existent plus).

**Inchangé :**
- `/tasks`, `/visits` restent protégés (pages toujours fonctionnelles, juste retirées de la sidebar)
- `/direction` reste protégé (redirigera vers `/dashboard?view=org`)
- `/action-board` — reste dans `protectedPaths` pour que le redirect fonctionne

## 13. Critères de succès

1. **Charge cognitive réduite** : la sidebar passe de 15 items plats (scan linéaire) à 3 groupes visuels (scan par section). Le nombre total de lignes peut atteindre ~15 dans un cas typique (3 Quotidien + 3 Référentiels + 1 header projet + 4 outils + 1 Voir tout + 2 Settings/Admin + 1 Profil), mais la hiérarchie visuelle réduit le nombre d'éléments à scanner mentalement à 3 (les sections). Worst-case (projet avec tous les outils) : ~19 lignes, mais les outils adaptatifs masquent les sections vides.
2. Zéro lien mort (plus de 404 `/pricing-intelligence`)
3. Le projet actif est toujours visible quand l'utilisateur travaille dans un contexte projet
4. Un nouvel utilisateur comprend la structure en < 30 secondes
5. Aucune fonctionnalité existante n'est perdue — tout reste accessible (Command Palette + routes directes + Dashboard)

## 14. Hors périmètre

- Refonte du contenu des pages (seulement la navigation)
- Modifications du super-admin
- Modifications de l'onboarding
- Nouveaux produits/fonctionnalités
- Changements de routes API existantes (sauf ajout `/nav-counts`)
- Renommage des routes URL (seuls les labels UI changent)
