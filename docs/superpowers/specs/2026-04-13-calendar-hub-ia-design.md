# Calendar Hub IA — Design & Implementation Plan

> **Date**: 2026-04-13
> **Module**: Calendar + Agent Project Memory + Agent Meeting Prep
> **Design**: V3 Hub IA (validated)
> **Launch target**: Pre-launch sprint

---

## 1. Vue d'ensemble

Le calendrier Cantaia est un **hub intelligent en 3 colonnes** qui remplace la dependance Outlook. Il est connecte a tous les modules Cantaia (Mail, Soumissions, Planning, Taches, Fournisseurs, PV, Visites, Rapports) et integre deux nouveaux agents IA autonomes.

### Objectifs
1. **Remplacer Outlook** — sync bidirectionnelle Microsoft Graph Calendar, import calendriers externes (membres hors Cantaia)
2. **Hub cross-module** — deadlines soumissions, retards planning, emails urgents, taches en retard surfacent dans le calendrier
3. **Agent Project Memory** — memoire persistante par projet, agrege toute l'activite cross-module
4. **Agent Meeting Prep** — 2h avant chaque reunion, genere un dossier de preparation automatique

---

## 2. Architecture

### 2.1 Layout 3 colonnes (V3 Hub IA)

```
┌─────────────────────────────────────────────────────────────────┐
│  Toolbar: titre, nav, view switcher (Hub/Jour/Semaine/Mois/Equipe) │
├─────────────────────────────────────────────────────────────────┤
│  AI Command Bar: saisie naturelle + chips rapides              │
├──────────┬────────────────────────────┬────────────────────────┤
│ Agenda   │ Timeline (grille horaire)  │ Intelligence Panel     │
│ Stream   │                            │  - Meteo chantier      │
│ (300px)  │ Events colores par type    │  - Suggestions IA      │
│          │ Drag & drop               │  - Equipe dispo        │
│ Events + │ Now line                  │  - Deadlines           │
│ Taches + │ Ghost drag               │  - Feed modules        │
│ Deadlines│                            │  - Meeting Prep        │
│          │                            │                        │
└──────────┴────────────────────────────┴────────────────────────┘
```

### 2.2 Vues disponibles (View Switcher)

| Vue | Description |
|-----|-------------|
| **Hub** | 3 colonnes (defaut) — agenda + timeline + intelligence |
| **Jour** | Grille horaire classique pleine largeur |
| **Semaine** | 7 jours (style Google Calendar / V1) |
| **Mois** | Vue mensuelle avec dots events |
| **Equipe** | Resource planning (style V2) — lignes = membres, colonnes = jours |

### 2.3 Sync & Import Calendriers

#### Microsoft Graph Calendar (bidirectionnel)
- **Import** : `GET /me/calendarView` — importe les events Outlook du user connecte
- **Export** : `POST /me/events` — cree des events depuis Cantaia vers Outlook
- **Webhook** : notifications push Graph pour sync temps reel
- **Delta sync** : `GET /me/calendarView/delta` pour sync incrementale

#### Calendriers externes (membres hors Cantaia)
- **Admin Consent** : avec Azure AD admin consent (`Calendars.Read` scope delegue), lecture des calendriers de TOUS les membres de l'org Microsoft 365
- **Route** : `GET /users/{email}/calendarView` — lit le calendrier d'un collegue non-Cantaia
- **Table `external_calendars`** : stocke les calendriers externes ajoutes par l'utilisateur
- **UI** : dans le panneau Intelligence, section "Equipe" avec toggle pour ajouter des membres externes par email
- **Affichage** : events externes en overlay semi-transparent (meme pattern que V1 ghost events)
- **Fallback ICS** : import de fichiers .ics pour les orgs sans Microsoft 365

#### Scopes OAuth necessaires
- `Calendars.Read` — lire ses events
- `Calendars.ReadWrite` — creer/modifier des events
- `Calendars.Read.Shared` — lire les calendriers partages
- `User.ReadBasic.All` — rechercher des membres de l'org (pour import externe)

---

## 3. Base de Donnees (Migration 075)

### 3.1 Table `calendar_events`

```sql
CREATE TABLE calendar_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id        UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Core fields
  title             TEXT NOT NULL,
  description       TEXT,
  location          TEXT,
  event_type        TEXT NOT NULL DEFAULT 'meeting'
                    CHECK (event_type IN ('meeting','site_visit','call','deadline','construction','milestone','other')),
  
  -- Timing
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  all_day           BOOLEAN DEFAULT FALSE,
  timezone          TEXT DEFAULT 'Europe/Zurich',
  
  -- Recurrence (RFC 5545 RRULE)
  recurrence_rule   TEXT,           -- ex: 'FREQ=WEEKLY;BYDAY=MO'
  recurrence_end    TIMESTAMPTZ,
  parent_event_id   UUID REFERENCES calendar_events(id) ON DELETE CASCADE,
  
  -- Microsoft Graph sync
  outlook_event_id  TEXT,           -- Graph event ID for bidirectional sync
  outlook_change_key TEXT,          -- Graph changeKey for conflict detection
  sync_source       TEXT DEFAULT 'cantaia'
                    CHECK (sync_source IN ('cantaia','outlook','external','agent')),
  last_synced_at    TIMESTAMPTZ,
  
  -- Visual
  color             TEXT,           -- override couleur projet
  
  -- AI-generated metadata
  ai_suggested      BOOLEAN DEFAULT FALSE,
  ai_prep_status    TEXT DEFAULT 'none'
                    CHECK (ai_prep_status IN ('none','pending','ready','delivered')),
  ai_prep_data      JSONB,          -- meeting prep content generated by agent
  
  -- Status
  status            TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('tentative','confirmed','cancelled')),
  
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendar_events_user_date ON calendar_events (user_id, start_at, end_at);
CREATE INDEX idx_calendar_events_org_date  ON calendar_events (organization_id, start_at);
CREATE INDEX idx_calendar_events_project   ON calendar_events (project_id);
CREATE INDEX idx_calendar_events_outlook   ON calendar_events (outlook_event_id) WHERE outlook_event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_calendar_events_outlook_uniq ON calendar_events (user_id, outlook_event_id) WHERE outlook_event_id IS NOT NULL;
```

### 3.2 Table `calendar_invitations`

```sql
CREATE TABLE calendar_invitations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  attendee_email  TEXT NOT NULL,
  attendee_name   TEXT,
  attendee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  response_status TEXT NOT NULL DEFAULT 'pending'
                  CHECK (response_status IN ('pending','accepted','declined','tentative')),
  is_organizer    BOOLEAN DEFAULT FALSE,
  notified_at     TIMESTAMPTZ,
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calendar_invitations_event ON calendar_invitations (event_id);
CREATE INDEX idx_calendar_invitations_user  ON calendar_invitations (attendee_user_id);
CREATE INDEX idx_calendar_invitations_email ON calendar_invitations (attendee_email);
```

### 3.3 Table `external_calendars`

```sql
CREATE TABLE external_calendars (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  added_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- External member info
  member_email    TEXT NOT NULL,
  member_name     TEXT,
  source          TEXT NOT NULL DEFAULT 'microsoft'
                  CHECK (source IN ('microsoft','ics','manual')),
  
  -- Microsoft Graph specific
  graph_user_id   TEXT,            -- Azure AD user ID for Graph API calls
  
  -- ICS specific
  ics_url         TEXT,            -- URL for ICS feed import
  
  -- Settings
  color           TEXT DEFAULT '#71717A',
  is_active       BOOLEAN DEFAULT TRUE,
  last_synced_at  TIMESTAMPTZ,
  sync_error      TEXT,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_external_calendars_uniq 
  ON external_calendars (organization_id, member_email, added_by);
```

### 3.4 Table `calendar_sync_state`

```sql
CREATE TABLE calendar_sync_state (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta_link      TEXT,            -- Graph delta sync link
  last_sync_at    TIMESTAMPTZ,
  sync_status     TEXT DEFAULT 'idle'
                  CHECK (sync_status IN ('idle','syncing','error')),
  error_message   TEXT,
  events_imported INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_calendar_sync_user ON calendar_sync_state (user_id);
```

### 3.5 Table `project_memory`

```sql
CREATE TABLE project_memory (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Aggregated intelligence
  summary         TEXT,                    -- AI-generated project summary
  key_facts       JSONB DEFAULT '[]',      -- [{fact, source, date, importance}]
  active_risks    JSONB DEFAULT '[]',      -- [{risk, severity, source, detected_at}]
  pending_decisions JSONB DEFAULT '[]',    -- [{decision, context, deadline, stakeholders}]
  open_items      JSONB DEFAULT '[]',      -- [{item, type, assignee, due_date, source}]
  supplier_status JSONB DEFAULT '{}',      -- {supplier_id: {last_contact, pending_items, score}}
  timeline_events JSONB DEFAULT '[]',      -- [{event, date, type, impact}]
  
  -- Cross-module aggregation timestamps
  last_emails_scan    TIMESTAMPTZ,
  last_tasks_scan     TIMESTAMPTZ,
  last_submissions_scan TIMESTAMPTZ,
  last_meetings_scan  TIMESTAMPTZ,
  last_plans_scan     TIMESTAMPTZ,
  last_reports_scan   TIMESTAMPTZ,
  
  -- Metadata
  version         INTEGER DEFAULT 1,
  agent_session_id UUID,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,           -- memory refresh needed after this
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_project_memory_project ON project_memory (project_id);
CREATE INDEX idx_project_memory_org ON project_memory (organization_id);
```

### 3.6 Table `meeting_preparations`

```sql
CREATE TABLE meeting_preparations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id        UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Generated content
  project_summary     TEXT,              -- Current project status
  unread_emails       JSONB DEFAULT '[]', -- [{subject, sender, received_at, preview, urgency}]
  overdue_tasks       JSONB DEFAULT '[]', -- [{title, assignee, due_date, lot_code, days_overdue}]
  open_reserves       JSONB DEFAULT '[]', -- [{description, severity, location, deadline}]
  pending_submissions JSONB DEFAULT '[]', -- [{title, status, deadline, suppliers_pending}]
  key_points          JSONB DEFAULT '[]', -- [{point, source, priority}] — AI-detected discussion points
  suggested_agenda    JSONB DEFAULT '[]', -- [{topic, duration_min, context}]
  attendee_context    JSONB DEFAULT '[]', -- [{name, email, role, last_interaction}]
  
  -- Status
  status          TEXT NOT NULL DEFAULT 'generating'
                  CHECK (status IN ('generating','ready','delivered','viewed')),
  delivered_at    TIMESTAMPTZ,
  viewed_at       TIMESTAMPTZ,
  
  -- Agent metadata
  agent_session_id UUID,
  tokens_used     INTEGER DEFAULT 0,
  generation_time_ms INTEGER,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_meeting_prep_event ON meeting_preparations (event_id, user_id);
CREATE INDEX idx_meeting_prep_user_status ON meeting_preparations (user_id, status);
```

### 3.7 RLS Policies (toutes les tables)

Pattern standard :
- SELECT : `organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())`
- INSERT : `user_id = auth.uid()`
- UPDATE : org match
- Triggers `update_updated_at()` sur toutes les tables

---

## 4. Core Services (`packages/core/src/calendar/`)

### 4.1 Fichiers a creer

| Fichier | Responsabilite |
|---------|---------------|
| `calendar-sync.ts` | Sync bidirectionnelle Microsoft Graph Calendar |
| `external-calendar-sync.ts` | Import calendriers membres hors Cantaia (Graph /users/{email} + ICS) |
| `event-service.ts` | CRUD events, recurrence, invitations |
| `ai-scheduler.ts` | Commande naturelle → event, suggestion creneaux, detection conflits |
| `intelligence-feed.ts` | Agregation cross-module pour le panneau Intelligence |
| `weather-service.ts` | API meteo pour les chantiers (Open-Meteo, gratuit) |
| `types.ts` | Types TypeScript |
| `index.ts` | Barrel exports |

### 4.2 `calendar-sync.ts` — Microsoft Graph bidirectionnel

```typescript
// Fonctions principales :
syncCalendarFromGraph(userId, accessToken, deltaLink?) → { events[], newDeltaLink }
pushEventToGraph(accessToken, event) → outlookEventId
updateEventOnGraph(accessToken, outlookEventId, changes)
deleteEventOnGraph(accessToken, outlookEventId)
resolveConflicts(localEvent, graphEvent) → MergeResult
```

Strategie de sync :
1. **Initial sync** : `GET /me/calendarView?startDateTime=...&endDateTime=...` (6 mois passé, 12 mois futur)
2. **Delta sync** : `GET /me/calendarView/delta` avec deltaLink stocke en DB
3. **Push** : POST/PATCH/DELETE vers Graph quand l'event est cree/modifie dans Cantaia
4. **Conflict resolution** : `changeKey` Graph vs `updated_at` local, last-write-wins avec warning

### 4.3 `external-calendar-sync.ts` — Calendriers externes

```typescript
// Import calendrier d'un membre Microsoft 365 (admin consent requis)
syncExternalMember(accessToken, memberEmail, orgId) → ExternalEvent[]

// Import depuis URL ICS
syncICSCalendar(icsUrl) → ExternalEvent[]

// Recherche membres org dans Azure AD
searchOrgMembers(accessToken, query) → AzureADUser[]
```

Scopes requis : `Calendars.Read.Shared` + `User.ReadBasic.All`
Fallback : si pas d'admin consent, l'utilisateur peut partager un lien ICS

### 4.4 `intelligence-feed.ts` — Agregation cross-module

Collecte en parallele (7 sources) :
1. **Soumissions** : deadlines dans les 14 prochains jours
2. **Planning** : taches Gantt en retard ou a risque
3. **Mail** : emails action_required non traites
4. **Taches** : overdue + due today
5. **Fournisseurs** : alertes actives
6. **PV/Reunions** : prochains PV planifies
7. **Rapports chantier** : rapports non soumis

Retourne un flux JSON typé pour le panneau Intelligence.

### 4.5 `ai-scheduler.ts` — Commande IA naturelle

```typescript
parseNaturalCommand(text, context) → ParsedEventIntent
findAvailableSlots(attendeeIds, duration, constraints) → TimeSlot[]
suggestOptimalTime(eventIntent, teamAvailability) → Suggestion
detectConflicts(userId, startAt, endAt) → Conflict[]
```

Utilise Claude Haiku pour parser les commandes naturelles :
- "reunion CVC mardi a 14h avec Sophie" → { type: meeting, day: mardi, time: 14:00, attendees: [Sophie], project: match CVC }
- "trouve un creneau cette semaine pour point budget" → cherche slots libres communs
- "optimise ma semaine" → reequilibre les reunions, suggere des creneaux vides pour travail deep

---

## 5. Agent "Project Memory" (`project-memory`)

### 5.1 Declenchement
- **CRON** : toutes les 4 heures (`0 */4 * * *`)
- **On-demand** : quand un agent (meeting-prep, briefing) a besoin du contexte projet

### 5.2 Pipeline

```
Pour chaque projet actif de l'organisation :
  1. Collecter emails recents (30 derniers jours, classifies action_required/urgent)
  2. Collecter taches (open, overdue, in_progress)
  3. Collecter soumissions (status, deadlines, offres recues)
  4. Collecter PV/reunions (derniers PV, action items)
  5. Collecter planning (taches Gantt en retard, jalons proches)
  6. Collecter rapports chantier (reserves ouvertes)
  7. Collecter historique fournisseurs (derniers contacts, scores)
  
  → Claude Haiku synthetise en :
    - summary (2-3 phrases etat actuel)
    - key_facts[] (faits saillants)
    - active_risks[] (risques detectes)
    - pending_decisions[] (decisions en attente)
    - open_items[] (points ouverts)
    - supplier_status{}
    - timeline_events[] (evenements recents importants)
  
  → Upsert dans project_memory
```

### 5.3 Integration

La project_memory est consommee par :
- **Meeting Prep** — contexte projet pour la preparation de reunion
- **Briefing** — enrichit le briefing quotidien
- **Calendar Intelligence** — alimente le panneau droit
- **Chat IA** — contexte projet dans les conversations
- **Email Drafter** — contexte pour generer des reponses

### 5.4 Configuration agent (registry.ts)

```typescript
{
  type: "project-memory",
  name: "Project Memory",
  model: "claude-sonnet-4-6",
  tools: [
    TOOL_FETCH_CANTAIA_CONTEXT,     // existant
    TOOL_FETCH_PROJECT_EMAILS,      // nouveau
    TOOL_FETCH_PROJECT_TASKS,       // nouveau
    TOOL_FETCH_PROJECT_SUBMISSIONS, // nouveau
    TOOL_FETCH_PROJECT_MEETINGS,    // nouveau
    TOOL_FETCH_PROJECT_PLANNING,    // nouveau
    TOOL_FETCH_PROJECT_REPORTS,     // nouveau
    TOOL_SAVE_PROJECT_MEMORY,       // nouveau
  ],
  maxDurationMs: 180_000,
}
```

---

## 6. Agent "Meeting Prep" (`meeting-prep`)

### 6.1 Declenchement
- **CRON** : toutes les 30 minutes (`*/30 * * * *`)
- Cherche les events dans les 2 prochaines heures avec `ai_prep_status = 'none'`

### 6.2 Pipeline

```
Pour chaque reunion imminente (dans 2h) :
  1. Identifier le projet lie (via event.project_id ou matching titre)
  2. Charger la project_memory (ou la generer si absente/expiree)
  3. Collecter :
     - Emails non traites sur ce projet
     - Taches en retard par lot
     - Reserves ouvertes
     - Soumissions en cours (offres recues, deadlines)
     - Participants et leur derniere interaction
  4. Claude Sonnet genere :
     - Résumé projet (2-3 phrases)
     - Points cles a aborder (detectes depuis emails/rapports)
     - Ordre du jour suggere avec durees
     - Contexte par participant
  5. Sauvegarder dans meeting_preparations
  6. Mettre a jour calendar_events.ai_prep_status = 'ready'
  7. Creer une agent_notification pour l'utilisateur
```

### 6.3 UI — Meeting Prep Card

Affiche dans le panneau Intelligence quand une prep est prete :
- Card orange avec icone sparkle
- Titre : "Dossier preparation — [titre reunion]"
- Resume 3 lignes
- Badges : "3 emails non lus", "2 taches en retard", "1 reserve ouverte"
- Bouton "Voir le dossier complet" → modal plein ecran

### 6.4 Modal Meeting Prep (plein ecran)

```
┌─────────────────────────────────────────────────────────┐
│  Preparation : Reunion CVC — Les Acacias                │
│  Lundi 13 avril, 09:00 - 10:30                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ■ Résumé projet                                       │
│    Le chantier progresse avec un retard de 3j sur le   │
│    lot CVC. 2 offres recues sur CFC 271...             │
│                                                         │
│  ■ Points a aborder (5)                                │
│    1. Reserve #12 fuite toit — non resolue depuis 14j  │
│    2. Offre Electro Plus +12% vs budget                │
│    3. Retard pose gaines — impact chemin critique       │
│    ...                                                  │
│                                                         │
│  ■ Emails non traites (3)                              │
│    📧 Re: CFC 271 devis — Electro Plus SA (il y a 2j) │
│    📧 Relance coffrage — Beton Express (il y a 5j)     │
│    ...                                                  │
│                                                         │
│  ■ Taches en retard (2)                                │
│    ☐ Relire PV #13 — haute priorite, retard 3j        │
│    ☐ Valider plan electricite — medium, retard 1j      │
│                                                         │
│  ■ Ordre du jour suggere                               │
│    1. Tour de table (5 min)                            │
│    2. Reserve #12 fuite (15 min)                       │
│    3. Offres electricite — decision (20 min)           │
│    4. Planning CVC — recalage (15 min)                 │
│    5. Points divers (10 min)                           │
│                                                         │
│  ■ Participants                                         │
│    Sophie Mueller — derniere interaction il y a 2j     │
│    Pierre Dubois — 1 email en attente de reponse       │
│                                                         │
│  [Exporter PDF]  [Envoyer aux participants]  [Fermer]  │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Routes API (~20 nouvelles routes)

### Calendar
| Route | Methode | Description |
|-------|---------|-------------|
| `/api/calendar/events` | GET | Liste events (date range, filtres projet/type/user) |
| `/api/calendar/events` | POST | Creer event (+ push Graph si sync active) |
| `/api/calendar/events/[id]` | GET | Detail event + invitations + prep |
| `/api/calendar/events/[id]` | PATCH | Modifier event (+ sync Graph) |
| `/api/calendar/events/[id]` | DELETE | Supprimer event (+ sync Graph) |
| `/api/calendar/events/[id]/invite` | POST | Ajouter participants |
| `/api/calendar/events/[id]/respond` | POST | Repondre a une invitation |
| `/api/calendar/sync` | POST | Declencher sync Microsoft Graph |
| `/api/calendar/team-availability` | GET | Disponibilite equipe (creneaux libres/occupes) |
| `/api/calendar/intelligence` | GET | Feed cross-module (deadlines, retards, emails, taches) |
| `/api/calendar/ai-command` | POST | Commande IA naturelle → action |
| `/api/calendar/external` | GET/POST | Lister/ajouter calendriers externes |
| `/api/calendar/external/[id]` | DELETE | Retirer un calendrier externe |
| `/api/calendar/external/sync` | POST | Sync calendriers externes |
| `/api/calendar/external/search-members` | GET | Recherche membres Azure AD org |

### Agents
| Route | Methode | Description |
|-------|---------|-------------|
| `/api/agents/project-memory/[projectId]` | GET | Lire la memoire projet |
| `/api/agents/meeting-prep/[eventId]` | GET | Lire la preparation de reunion |
| `/api/cron/project-memory` | POST | CRON: refresh memoires projets (4h) |
| `/api/cron/meeting-prep` | POST | CRON: generer preps reunions imminentes (30 min) |

---

## 8. Composants UI

### Page `/calendar`

| Composant | Fichier | Description |
|-----------|---------|-------------|
| `CalendarPage` | `calendar/page.tsx` | Page principale, state management, routing vues |
| `CalendarToolbar` | `calendar/CalendarToolbar.tsx` | Nav, view switcher, recherche |
| `AICommandBar` | `calendar/AICommandBar.tsx` | Barre saisie naturelle + chips |
| `AgendaStream` | `calendar/AgendaStream.tsx` | Colonne gauche (300px) — flux chronologique |
| `CalendarTimeline` | `calendar/CalendarTimeline.tsx` | Colonne centre — grille horaire avec events |
| `IntelligencePanel` | `calendar/IntelligencePanel.tsx` | Colonne droite (320px) — IA + feeds |
| `WeekView` | `calendar/WeekView.tsx` | Vue semaine classique (7 jours) |
| `MonthView` | `calendar/MonthView.tsx` | Vue mois |
| `TeamView` | `calendar/TeamView.tsx` | Vue equipe (ressources) |
| `CreateEventModal` | `calendar/CreateEventModal.tsx` | Modal creation event |
| `EventCard` | `calendar/EventCard.tsx` | Card event dans agenda/timeline |
| `MeetingPrepModal` | `calendar/MeetingPrepModal.tsx` | Modal preparation reunion plein ecran |
| `MeetingPrepCard` | `calendar/MeetingPrepCard.tsx` | Card preparation dans Intelligence |
| `WeatherWidget` | `calendar/WeatherWidget.tsx` | Meteo chantier |
| `TeamAvailabilityStrip` | `calendar/TeamAvailabilityStrip.tsx` | Mini disponibilite equipe |
| `DeadlineCountdown` | `calendar/DeadlineCountdown.tsx` | Countdown deadlines |
| `ModuleFeedCards` | `calendar/ModuleFeedCards.tsx` | Cards cross-module (soumissions, mail, planning) |
| `ExternalCalendarManager` | `calendar/ExternalCalendarManager.tsx` | Gestion calendriers externes |

### Sidebar
- Ajouter `{ href: "/calendar", labelKey: "calendar", icon: CalendarDays, status: "active" }` dans `dailyItems` juste apres `/mail`

---

## 9. Vercel CRON (ajouts)

```json
{ "path": "/api/cron/project-memory",  "schedule": "0 */4 * * *" }
{ "path": "/api/cron/meeting-prep",    "schedule": "*/30 * * * *" }
```

---

## 10. Connexions Cross-Module (le moat)

| Module source | Donnee | Affichage calendrier |
|--------------|--------|---------------------|
| **Soumissions** | Deadlines, offres recues | Deadline events (rouge), card "Offre recue" |
| **Planning** | Taches Gantt en retard, jalons | Alert dans Intelligence, timeline overlay |
| **Mail** | Emails action_required | Badge count, card dans Intelligence |
| **Taches** | Overdue + due today | Section "Taches du jour" dans Agenda |
| **Fournisseurs** | Alertes actives, relances | Card dans Intelligence |
| **PV** | Reunions planifiees, action items | Events dans timeline |
| **Visites** | Visites planifiees | Events verts dans timeline |
| **Rapports** | Rapports non soumis | Alert dans Intelligence |
| **Briefing** | Resume quotidien | Alimenté par project_memory |
| **Email Drafter** | Brouillons prets | Badge sur events lies |
| **Followup Engine** | Relances en attente | Card dans Intelligence |

### Flux de donnees

```
                    ┌─────────────────┐
                    │  Calendar Hub   │
                    │   (affichage)   │
                    └────────┬────────┘
                             │ reads
                    ┌────────┴────────┐
                    │ /api/calendar/  │
                    │  intelligence   │
                    └────────┬────────┘
                             │ aggregates
         ┌───────┬───────┬───┴───┬───────┬───────┬───────┐
         │       │       │       │       │       │       │
      Emails  Tasks  Submissions Planning  PV  Reports  Suppliers
         │       │       │       │       │       │       │
         └───────┴───────┴───┬───┴───────┴───────┴───────┘
                             │ feeds into
                    ┌────────┴────────┐
                    │ project_memory  │ ← Agent Project Memory (4h)
                    └────────┬────────┘
                             │ consumed by
                    ┌────────┴────────┐
                    │ meeting_prep    │ ← Agent Meeting Prep (30min)
                    │ email_drafter   │
                    │ briefing        │
                    │ chat_ia         │
                    └─────────────────┘
```

---

## 11. Ordre d'implementation

### Phase 1 — Base de donnees & Core (etapes 1-3)
1. Migration 075 (6 tables + RLS + indexes)
2. `packages/core/src/calendar/types.ts`
3. `packages/core/src/calendar/event-service.ts`
4. `packages/core/src/calendar/calendar-sync.ts`
5. `packages/core/src/calendar/external-calendar-sync.ts`

### Phase 2 — API Routes calendrier (etapes 4-5)
6. CRUD events (`/api/calendar/events`)
7. Sync Graph (`/api/calendar/sync`)
8. Team availability (`/api/calendar/team-availability`)
9. External calendars (`/api/calendar/external/*`)
10. Intelligence feed (`/api/calendar/intelligence`)

### Phase 3 — Agents (etapes 6-7)
11. Agent Project Memory — registry + tools + CRON
12. Agent Meeting Prep — registry + tools + CRON
13. Routes API agents
14. Vercel CRON config

### Phase 4 — UI (etapes 8-11)
15. Sidebar (ajouter Calendar)
16. Calendar page + Hub view (3 colonnes)
17. CreateEventModal
18. AICommandBar + ai-command route
19. IntelligencePanel + cross-module feeds
20. MeetingPrepModal + MeetingPrepCard
21. ExternalCalendarManager

### Phase 5 — Vues secondaires (etapes 12-13)
22. WeekView (style V1)
23. MonthView
24. TeamView (style V2)
25. Drag & drop (dnd-kit)

### Phase 6 — Polish (etape 14)
26. Weather widget
27. Notifications meeting prep
28. i18n (fr/en/de)
29. Build + type-check + deploy

---

## 12. Scopes OAuth a ajouter

Dans `microsoft-connect/route.ts` et `microsoft-provider.ts` :

```
Calendars.Read Calendars.ReadWrite Calendars.Read.Shared User.ReadBasic.All
```

Les utilisateurs existants devront reconnecter Microsoft pour obtenir ces scopes.

---

## 13. Variables d'environnement

Aucune nouvelle variable requise. Les calendriers utilisent les memes tokens Microsoft Graph que le module Mail.

Optionnel :
- `OPEN_METEO_API_KEY` — si on veut un service meteo premium (sinon Open-Meteo gratuit sans cle)
