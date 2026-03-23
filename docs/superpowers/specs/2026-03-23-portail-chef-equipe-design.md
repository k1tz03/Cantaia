# Portail Chef d'Équipe — Design Spec

> Module Cantaia permettant aux chefs d'équipe d'accéder aux informations chantier et de remplir des rapports journaliers depuis leur mobile, via un lien unique + code PIN.

---

## 1. Accès & Authentification

### Flux
1. Le conducteur de travaux active le portail dans l'onglet "Rapports chantier" du projet
2. Il génère un lien (`/portal/{projectId}`) + code PIN 6 chiffres
3. Il partage le lien par WhatsApp/SMS/email au chef d'équipe
4. Le chef d'équipe ouvre le lien → saisit le code PIN
5. Code valide → cookie JWT signé (`portal_session_{projectId}`, 7 jours)
6. Le conducteur peut régénérer le code à tout moment → l'ancien est invalidé

### Sécurité
- PIN stocké en SHA-256 + salt par projet (jamais en clair)
- Rate limiting : 5 tentatives puis blocage 15 min
- Cookie JWT signé avec le salt du projet
- Pas de compte utilisateur, pas de Supabase Auth
- Route publique `/portal/[projectId]` — hors layout `(app)`

### Code PIN
- 6 chiffres, partagé par projet (tous les chefs d'équipe du même projet utilisent le même code)
- Régénérable par le conducteur (invalidation immédiate de l'ancien)
- Le chef d'équipe saisit son nom à la première connexion (stocké dans le cookie)

---

## 2. Pages du portail (mobile-first)

### Bottom navigation : 4 onglets

#### Onglet 1 : Chantier
- Nom du projet, code, numéro
- Adresse cliquable (ouvre Google Maps / Waze en natif sur mobile)
- Description/annotation du conducteur de travaux
- Statut du projet

#### Onglet 2 : Soumission
- Postes de la soumission sélectionnée par le conducteur
- **Aucun prix** — uniquement : N°, description, quantité, unité
- Accordéon par groupe (ex: "Béton — 32 postes")
- Barre de recherche

#### Onglet 3 : Plans
- Liste des plans du projet (depuis `plan_registry`)
- Vignette + nom + discipline
- Clic → PDF/image plein écran avec zoom pinch

#### Onglet 4 : Rapport
- Date du jour (modifiable pour rattraper un oubli)
- Bouton "Nouveau rapport" si aucun pour la date
- Liste des rapports passés (7 derniers jours) avec statut

---

## 3. Formulaire rapport journalier

### Section 1 : Personnel présent
- Liste des ouvriers du projet (configurés au préalable, persistante)
- Checkbox pour cocher les présents du jour
- Pour chaque présent : une ou plusieurs lignes de travail
  - Type de travail : texte libre (ex: "Terrassement talus nord")
  - Durée : heures, par tranches de 0.5h
  - Bouton "+ Ajouter un travail"
- Tag "Conducteur camionnette" (toggle) sur un ouvrier
- Bouton "+ Ajouter un ouvrier" pour compléter la liste (ajout persistant)
- Bouton supprimer un ouvrier (soft delete)

### Section 2 : Machines
- Bouton "+ Ajouter une machine"
- Par machine : description texte libre (ex: "Pelleteuse 2t5"), durée (heures)
- Toggle "Louée" optionnel

### Section 3 : Bons de livraison
- Bouton "+ Ajouter un bon"
- Par bon : numéro (texte), fournisseur (texte), photo (capture caméra directe `capture="environment"`)
- Miniature de la photo avec possibilité de reprendre

### Section 4 : Remarques
- Textarea libre (météo, incidents, retards)

### Actions
- **Sauvegarder brouillon** — enregistre sans verrouiller
- **Envoyer** — verrouille le rapport, visible par conducteur et assistantes
- Non modifiable après envoi (sauf déverrouillage par le conducteur)

### Pas de listes pré-fournies
- Types de travaux : texte libre
- Machines : texte libre
- Fournisseurs : texte libre
- Ouvriers : liste persistante modifiable (ajout/suppression)

---

## 4. Base de données (Migration 061)

### Modification table `projects`
```sql
ALTER TABLE projects ADD COLUMN portal_enabled BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN portal_pin_hash TEXT;
ALTER TABLE projects ADD COLUMN portal_pin_salt TEXT;
ALTER TABLE projects ADD COLUMN portal_description TEXT;
ALTER TABLE projects ADD COLUMN portal_submission_id UUID REFERENCES submissions(id);
```

### Table `portal_crew_members`
```sql
CREATE TABLE portal_crew_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_crew_members_project ON portal_crew_members(project_id);
```

### Table `site_reports`
```sql
CREATE TABLE site_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  submitted_by_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'locked')),
  remarks TEXT,
  weather TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, report_date, submitted_by_name)
);
CREATE INDEX idx_site_reports_project ON site_reports(project_id);
CREATE INDEX idx_site_reports_date ON site_reports(report_date);
```

### Table `site_report_entries`
```sql
CREATE TABLE site_report_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES site_reports(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('labor', 'machine', 'delivery_note')),
  -- labor
  crew_member_id UUID REFERENCES portal_crew_members(id),
  work_description TEXT,
  duration_hours DECIMAL(5,2),
  is_driver BOOLEAN DEFAULT false,
  -- machine
  machine_description TEXT,
  is_rented BOOLEAN DEFAULT false,
  -- delivery_note
  note_number TEXT,
  supplier_name TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_report_entries_report ON site_report_entries(report_id);
```

### Pas de RLS
Routes portail utilisent admin client avec validation cookie JWT.

---

## 5. Routes API

### Portail (routes publiques, validation par cookie session)

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/portal/[projectId]/auth` | POST | Vérifier PIN → set cookie session |
| `/api/portal/[projectId]/info` | GET | Infos projet (nom, code, adresse, description) |
| `/api/portal/[projectId]/submission` | GET | Postes soumission SANS prix |
| `/api/portal/[projectId]/plans` | GET | Liste plans du projet |
| `/api/portal/[projectId]/crew` | GET/POST/DELETE | CRUD liste ouvriers |
| `/api/portal/[projectId]/reports` | GET/POST | Liste rapports / créer rapport |
| `/api/portal/[projectId]/reports/[reportId]` | GET/PATCH | Détail / modifier rapport |
| `/api/portal/[projectId]/reports/[reportId]/submit` | POST | Soumettre (draft → submitted) |
| `/api/portal/[projectId]/reports/[reportId]/upload` | POST | Upload photo bon de livraison |

### App interne (auth Supabase standard)

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/projects/[id]/portal` | GET/POST | Config portail (activer, PIN, description, soumission) |
| `/api/projects/[id]/portal/regenerate-pin` | POST | Régénérer PIN |
| `/api/projects/[id]/site-reports` | GET | Liste rapports pour onglet projet |
| `/api/projects/[id]/site-reports/[reportId]` | GET/PATCH | Détail + déverrouiller |

### Validation cookie portail
Chaque route `/api/portal/*` vérifie le cookie `portal_session_{projectId}`. Le cookie contient un JWT signé avec le salt du projet, expiration 7 jours.

---

## 6. Onglet "Rapports chantier" (côté conducteur)

### Section haute : Configuration portail
- Toggle "Activer le portail"
- Lien à partager (URL complète + bouton copier)
- Code PIN affiché en gros + bouton "Régénérer" avec confirmation
- Dropdown soumission à afficher
- Textarea description / instructions

### Section basse : Liste des rapports
- Table : date, chef d'équipe, statut (brouillon/envoyé/verrouillé), nb ouvriers, heures totales
- Clic → détail lecture seule
- Bouton "Déverrouiller" pour corrections
- Filtre par semaine / mois

---

## 7. Scope hors spec (futures specs)

- **Spec 2 — Centralisation assistantes** : Page dédiée pour accéder aux heures et bons de livraison de tous les projets
- **Spec 3 — Statistiques direction** : Rentabilité projet (heures/CHF), coûts fournitures, KPIs direction
