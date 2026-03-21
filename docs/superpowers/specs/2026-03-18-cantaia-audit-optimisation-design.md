# Cantaia — Audit & Optimisation Design Spec

> Date: 2026-03-18
> Auteur: Claude (audit) + Julien RAY (validation)
> Statut: VALIDÉ — prêt pour implémentation
> Approche: Quick Wins First (8 semaines, 3 phases)

---

## 1. Contexte & Diagnostic

### 1.1 État des lieux

Cantaia est un SaaS de gestion de chantier augmenté par IA, ciblant les chefs de projet construction en Suisse. L'audit complet (code + fonctionnel + UX + API) a couvert :

- **75 pages** : 57% fonctionnelles, 43% placeholder/stub
- **126 composants** dans 20 dossiers
- **139 routes API** : auth B+, zero rate limiting, zero tests
- **262 tests fonctionnels** (checklist Playwright) : 229 OK, 12 partiels, 14 non testés

### 1.2 Problèmes critiques identifiés

| # | Problème | Impact | Module |
|---|----------|--------|--------|
| 1 | SubmissionEditor sauvegarde uniquement en localStorage | Perte de données au logout | Soumissions |
| 2 | Kanban tâches en lecture seule (pas de drag & drop) | Workflow tâches cassé | Tâches |
| 3 | 32 pages placeholder (43% du site vide) | Impression d'inachevé, confusion navigation | Global |
| 4 | Référentiel CFC : 55 prix sur 500+ nécessaires | Estimation IA imprécise (~60% fallback IA) | Plans/Prix |
| 5 | Pas de bottom navigation mobile | 5+ taps pour accéder à une page secondaire | Navigation |
| 6 | Page /mail avec strings FR hardcodées | i18n cassé pour EN/DE | Mail |
| 7 | Prompt soumissions minimaliste (9 lignes) | ~20% CFC codes faux/null | Soumissions |
| 8 | Budget IA dans onglet séparé | Friction UX, allers-retours entre onglets | Soumissions |
| 9 | Score fournisseur basé sur données manuelles | Pas de scoring automatique depuis les données réelles | Fournisseurs |
| 10 | Dashboard/Briefing/Mail = 3 pages séparées | 6+ clics pour traiter un email urgent le matin | Navigation |

### 1.3 Ce qui fonctionne bien

- Pipeline email 7 niveaux (classification → tâches → plans) : excellente intégration
- Estimation multi-modèle 4 passes (Claude + GPT-4o + Gemini) : architecture solide
- Interconnections modules : 18/21 testées OK (projet ↔ PV, soumission, plans, tâches)
- Sécurité : 34/45 vulnérabilités corrigées, CSP complet, IDOR fixés
- Auth OAuth Microsoft + session 7j stable
- i18n FR/EN/DE fonctionnel sur la majorité des pages

### 1.4 Analyse IA — État détaillé

**Plans (estimation pipeline)** :
- Prompts : 8.5/10 — bon contexte SIA/CFC suisse, manque NPK et calibration par phase
- Consensus engine : 7.5/10 — pondération modèles devrait être 2:1.5:0.5 (Claude:GPT:Gemini) au lieu de 1:1:1
- Price resolver : 6.5/10 — bugs de colonnes fixés en V2, mais 55 prix CFC insuffisants
- Confiance : plafonné 0.95, bonus corrections, bon système de calibration

**Soumissions (analyse Excel)** :
- Prompt : 6/10 — 9 lignes, pas de normalisation unités, pas de multi-langue, pas de validation quantités
- Parsing JSON : 8/10 — 4 stratégies de fallback, assistant prefill, chunking 80K chars
- Budget IA : 7/10 — 6-tier price resolver fonctionne mais UX fragmentée (onglet séparé)

**Classification email** :
- Prompt : 8/10 — bon contexte CH, 4 catégories trop grossières pour la construction
- Pipeline : 9/10 — 7 niveaux, apprentissage, détection spam, excellent

---

## 2. Décisions de design validées

### 2.1 Approche de séquençage : Quick Wins First

**Phase 1 (Semaine 1-2)** : Fixes critiques + frustrations immédiates
**Phase 2 (Semaine 3-4)** : Core UX mobile + améliorations métier IA
**Phase 3 (Semaine 5-8)** : Big features (Action Board, CFC 300+, Direction)

### 2.2 Post-login redirect

Actuellement : `/mail`
Après Phase 3 : `/action-board`

---

## 3. Phase 1 — Quick Wins (Semaine 1-2)

### 3.1 SubmissionEditor DB Sync (#9) — CRITIQUE

**Fichier principal** : `apps/web/src/components/submissions/SubmissionEditor.tsx`

**Problème** : Auto-save toutes les 30s écrit en localStorage uniquement. Aucun appel API. Les modifications de lots/chapitres/postes sont perdues au logout.

**Design** :
- Ajouter `PATCH /api/submissions/[id]` appelé à chaque auto-save (30s) et on blur
- Write-through : écrire en localStorage ET en DB simultanément
- Au chargement : fetch DB d'abord, fallback localStorage si fetch échoue (mode offline)
- Indicateur visuel dans le header de l'éditeur :
  - "Sauvegardé ✓" (vert, auto-dismiss 3s)
  - "Enregistrement..." (spinner)
  - "Non sauvegardé — modifications locales" (orange, avec bouton "Sauvegarder maintenant")
  - "Erreur de sauvegarde — réessayer" (rouge, avec bouton retry)
- Conflit detection : si la version DB est plus récente que le localStorage, afficher un dialog "Modifications plus récentes trouvées — utiliser la version serveur ou locale ?"

**API** :
- `PATCH /api/submissions/[id]` : accepte `{ lots: [...], chapters: [...], items: [...] }` en JSON
- Validation : vérifier `submission.project.organization_id === user.organization_id`
- Response : `{ success: true, updated_at: timestamp }`

**Effort** : M (2-3 jours)

---

### 3.2 Kanban Drag & Drop (#2)

**Fichier principal** : `apps/web/src/components/tasks/TaskKanbanView.tsx`

**Problème** : 5 colonnes affichées mais cards non déplaçables. dnd-kit déjà installé et utilisé dans `SubmissionEditor.tsx`.

**Design** :
- Réutiliser le setup dnd-kit existant : `DndContext`, `useSortable`, `SortableContext`
- Chaque colonne = un `DroppableContainer` avec `id` = status (todo, in_progress, waiting, done, cancelled)
- Chaque card = un `SortableItem` avec `id` = task.id
- `onDragEnd(event)` :
  - Extraire `active.id` (task) et `over.id` (target column)
  - Optimistic update : déplacer la card immédiatement dans le state local
  - `PATCH /api/tasks/[id]` avec `{ status: newStatus }`
  - Si erreur : rollback + toast "Impossible de déplacer la tâche"
- Animation : `transition: transform 200ms ease` sur les cards pendant le drag
- Visual feedback : colonne cible highlight (border bleu) pendant le survol
- Memoizer `getProjectForTask()` avec `useMemo` + Map (actuellement O(n) par card)

**Effort** : M (2-3 jours)

---

### 3.3 Nettoyage 32 pages placeholder (#8)

**Pages à supprimer** (22 pages) :
- `/meetings/*` (6 pages) : legacy, remplacé par `/pv-chantier`
- `/admin/alerts` : stub, non connecté
- `/admin/logs` : stub, non connecté (garder `/admin/admin/logs` si existe)
- `/admin/settings` : stub
- `/admin/users` : stub (fonctionnalité dans `/admin/members`)
- `/admin/organizations/*` (2 pages) : stub (fonctionnalité dans super-admin)
- `/analytics` : stub
- `/api-costs` : stub
- `/clients` : stub
- `/debug` : stub (garder les routes API debug pour superadmin)
- `/logs` (admin group) : doublon

**Pages doublons à supprimer** (2 pages) :
- `/admin/branding` → garder `/admin/admin/branding`
- `/pricing-intelligence` → garder `/cantaia-prix`

**Pages à garder** (8 pages) :
- `/admin/time-savings` : fonctionnel avec données réelles
- `/admin/finances` : fonctionnel
- `/admin/members` : fonctionnel
- `/admin/admin/branding` : fonctionnel
- Auth pages (forgot/reset-password) : fonctionnelles
- Legal pages (cgv, mentions, privacy) : contenu minimal mais nécessaire

**Middleware** : retirer les routes supprimées de la liste des routes protégées dans `middleware.ts`

**Effort** : S (1 jour)

---

### 3.4 Mail page i18n (#10)

**Fichier principal** : `apps/web/src/app/[locale]/(app)/mail/page.tsx` (~650 lignes)

**Problème** : Dizaines de strings FR hardcodées ("Décisions du jour", "Urgent", "Cette semaine", "Info", "Répondre", "Déléguer", "Transférer", "Archiver", etc.)

**Design** :
- Ajouter `const t = useTranslations("mail")` en haut du composant
- Créer section `mail` dans les 3 fichiers de messages :
  - `messages/fr.json` : ~50 clés
  - `messages/en.json` : ~50 clés
  - `messages/de.json` : ~50 clés
- Couvre : titres de buckets, boutons d'action, labels de stats, messages d'erreur, placeholder texte, modals (ReplyModal, DelegateModal, TransferModal), messages de confirmation, états vides
- Garder la cohérence avec les traductions existantes (réutiliser `common.reply`, `common.archive` si disponibles)

**Effort** : S (1 jour)

---

## 4. Phase 2 — Core UX (Semaine 3-4)

### 4.1 Bottom Navigation Mobile (#3)

**Fichier principal** : `apps/web/src/components/app/Sidebar.tsx`

**Design** :
- Nouvelle div `fixed bottom-0 inset-x-0 z-50` visible uniquement `< md` breakpoint
- 4 items : Mail (avec badge unread), Tâches, Projets, Plus (ouvre le menu sheet actuel)
- Icônes 24px, touch targets 48px minimum, labels sous les icônes
- Active state : icône + label en couleur brand, les autres en gris
- Safe area padding : `pb-safe` pour iPhones avec encoche
- Le sidebar hamburger actuel disparaît sur mobile (remplacé par la bottom nav)

**Bouton FAB "+"** :
- Position : `fixed bottom-20 right-4` (au-dessus de la bottom nav)
- Icône Plus, fond brand blue, shadow
- Au tap : menu radial avec 3 options :
  - "Nouvelle tâche" → `TaskCreateModal` (pré-sélectionne le projet si on est sur `/projects/[id]`)
  - "Prendre photo" → `PhotoCapture` (upload vers visite en cours ou nouvelle)
  - "Note vocale" → Enregistrement audio rapide (30s max, upload vers visite ou tâche)
- Animation : rotation 45° de l'icône + quand ouvert

**Effort** : M (2-3 jours)

---

### 4.2 Soumissions prompt amélioré + Budget IA inline (#5)

**Fichiers** :
- Prompt : `apps/web/src/app/api/submissions/[id]/analyze/route.ts`
- UI : `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx`

**Prompt amélioré** (9 → ~60 lignes) :

Ajouts clés :
```
- Normalisation unités : m=ml=lm, m²=qm, m³=cbm, pce=St.=Stk, kg=kg, t=t, h=h, j=jour, forfait=gl=global
- Multi-langue : si le document contient de l'allemand ou de l'italien, extraire dans la langue source et ajouter un champ "language_detected"
- Attribution CFC stricte : coffrage=211.1, béton=211.2, ferraillage=211.3, maçonnerie=221, etc.
- Validation quantités : rejeter si valeur > 1'000'000 (probable montant CHF), rejeter si description contient "total", "sous-total", "TVA"
- Standardisation produits : extraire marque + gamme + grade (ex: "Sika" + "101" + "Prime")
- Material groups étendu : 20+ groupes au lieu de 9 (ajouter: Ascenseurs, Stores, Serrurerie, Peinture, Plâtrerie, Carrelage, Parquet, Cuisine, Salle de bain, Ventilation, Chauffage, Électricité courant fort, Électricité courant faible)
```

**Budget IA inline** :
- Supprimer le composant `BudgetTabContent` comme onglet séparé
- Ajouter les colonnes `PU Méd.`, `Total`, `Source` directement dans `ItemsTabContent`
- Bannière en haut : "Estimer les prix — XX postes sans prix" + bouton bleu
- Au clic : `POST /api/submissions/[id]/estimate-budget`
- Les colonnes se remplissent en temps réel (polling 2s ou SSE)
- Badges source inline : Fournisseur (vert), CRB (teal), Marché (purple), IA (bleu), En attente (gris)
- Total par groupe de matériaux dans le header de chaque section expandable

**Effort** : M (3-4 jours)

---

### 4.3 Fournisseurs scoring automatique (#6)

**Fichiers** :
- Service : `packages/core/src/suppliers/supplier-service.ts`
- UI : `apps/web/src/app/[locale]/(app)/suppliers/page.tsx`

**Formule de scoring automatique** :

```
score = (délai × 0.30) + (prix × 0.25) + (taux_réponse × 0.20) + (qualité × 0.15) + (fiabilité × 0.10)

Où :
- délai = 100 - min(100, avg_response_days × 10)
  Calculé depuis : price_requests.created_at → supplier_offers.created_at

- prix = 100 - min(100, abs(avg_price_deviation_percent) × 2)
  Calculé depuis : offer_line_items.unit_price vs market_benchmarks.median_price

- taux_réponse = (offers_count / requests_count) × 100
  Calculé depuis : supplier_offers.count / price_requests.count

- qualité = (manual_rating / 5) × 100
  Source : suppliers.overall_score (note manuelle existante)

- fiabilité = min(100, completed_projects × 20)
  Calculé depuis : submissions WHERE status = 'completed' AND awarded_supplier_id = supplier.id
```

**Recalcul** : à chaque nouvelle offre reçue, à chaque clôture de soumission

**Historique enrichi** dans le detail panel :
- Nouvelle section "Timeline" : liste chronologique inversée
  - "15.03 — Offre béton reçue (Central Malley) — CHF 45'200"
  - "10.03 — Demande de prix envoyée (Tour Horizon)"
  - "01.03 — Email reçu de contact@beton-express.ch"
- Graphique Recharts : tendance prix moyen par CFC sur 6/12 mois (si données suffisantes)
- Badge alerte si certification expirée (comparaison date courante vs champ texte certifications)

**Effort** : M (3-4 jours)

---

## 5. Phase 3 — Big Features (Semaine 5-8)

### 5.1 Action Board (#1)

**Nouveau fichier** : `apps/web/src/app/[locale]/(app)/action-board/page.tsx`

**Redirect** : modifier `middleware.ts` pour rediriger post-login vers `/action-board` au lieu de `/mail`

**API** : `GET /api/action-board`

Agrège en parallèle :
```typescript
const [emails, tasks, submissions, plans, receptions] = await Promise.all([
  // Emails urgent + action_required (max 20)
  admin.from("email_records")
    .select("id, subject, sender_name, sender_email, project_id, classification, received_at, body_preview, ai_summary")
    .eq("organization_id", orgId)
    .in("classification", ["urgent", "action_required"])
    .eq("is_processed", false)
    .order("received_at", { ascending: false })
    .limit(20),

  // Tâches overdue + due today
  admin.from("tasks")
    .select("id, title, project_id, status, priority, due_date, assigned_to")
    .eq("organization_id", orgId) // via project join
    .in("status", ["todo", "in_progress", "waiting"])
    .lte("due_date", todayPlus7)
    .order("due_date", { ascending: true }),

  // Soumissions avec deadline < 7 jours
  admin.from("submissions")
    .select("id, title, project_id, deadline, status")
    .eq("organization_id", orgId) // via project join
    .in("status", ["sent", "responses"])
    .lte("deadline", todayPlus7),

  // Plans avec alertes
  admin.from("plan_registry")
    .select("id, plan_title, project_id, status, validation_status")
    .eq("organization_id", orgId)
    .in("validation_status", ["pending", "rejected"]),

  // Garanties expirantes < 30 jours
  admin.from("project_receptions")
    .select("id, project_id, guarantee_2y_end, guarantee_5y_end")
    .lte("guarantee_2y_end", todayPlus30)
]);
```

**Scoring de priorité** par item :
```
email urgent → 100
email action_required (< 24h) → 90
tâche overdue > 3 jours → 85
deadline soumission < 2 jours → 80
tâche overdue 1-3 jours → 70
email action_required (> 24h) → 60
deadline soumission 2-7 jours → 50
plan en attente approbation → 40
garantie expirante → 30
tâche due aujourd'hui → 20
```

**UI** :
- Zone 1 (sticky) : salutation + 4 KPI pills + sync button
- Zone 2 (feed scrollable) : cards triées par score, max 30 items
- Zone 3 (collapsible) : résumé IA textuel

**Chaque card** :
```
[Icône source] [Badge projet (couleur)]  [Titre contextualisé]
                                          [Sous-titre : détail]
                              [Bouton 1] [Bouton 2] [Bouton 3]
```

**Actions par type** :
- Email → Répondre / Déléguer / Archiver
- Tâche overdue → Marquer fait / Relancer / Reporter
- Deadline soumission → Voir / Envoyer relance
- Plan pending → Approuver / Voir plan
- Garantie → Voir projet / Planifier visite

**Mobile** : swipe gauche = archiver/done, swipe droite = snooze

**Effort** : XL (2-3 semaines)

---

### 5.2 Enrichissement CFC 300+ (#4)

**Migration** : nouvelle table `cfc_reference_prices` dans Supabase

```sql
CREATE TABLE cfc_reference_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cfc_code TEXT NOT NULL,           -- ex: "211.2"
  cfc_label TEXT NOT NULL,          -- ex: "Béton armé C30/37"
  description TEXT,                 -- description détaillée
  unit TEXT NOT NULL,               -- ex: "m³"
  price_min NUMERIC NOT NULL,       -- CHF
  price_median NUMERIC NOT NULL,
  price_max NUMERIC NOT NULL,
  region TEXT DEFAULT 'CH',         -- code canton ou 'CH' pour moyenne
  source TEXT DEFAULT 'CRB 2025',
  valid_from DATE DEFAULT '2025-01-01',
  valid_until DATE DEFAULT '2025-12-31',
  category TEXT,                    -- CFC level 1 (Preparation, Gros-oeuvre, etc.)
  subcategory TEXT,                 -- CFC level 2
  material_variants JSONB,          -- ex: {"C20/25": 0.85, "C40/50": 1.20} (coefficients relatifs)
  phase_precision JSONB DEFAULT '{"esquisse": 0.30, "avant_projet": 0.15, "projet": 0.10, "execution": 0.05}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_cfc_ref_code ON cfc_reference_prices(cfc_code);
CREATE INDEX idx_cfc_ref_category ON cfc_reference_prices(category);
```

**Données** : 300+ entrées couvrant :
- CFC 1 (10), CFC 2 (45), CFC 22 (20), CFC 23 (25), CFC 24 (20), CFC 25 (15), CFC 27 (25), CFC 3x (20), CFC 4x (15), autres (105+)

**Code** :
- Modifier `price-resolver.ts` tier 5 : requêter `cfc_reference_prices` au lieu de `cfc-prices.ts` statique
- Ajouter matching par `material_variants` (coefficient multiplicateur)
- Ajouter ajustement `phase_precision` dans la passe 4 du pipeline
- Admin UI dans super-admin : CRUD sur `cfc_reference_prices`

**Effort** : L (1 semaine données + 2-3 jours code)

---

### 5.3 Vue Direction multi-projet dense (#7)

**Fichier** : `apps/web/src/app/[locale]/(app)/direction/page.tsx` (réécriture)

**Layout** :
- Sticky top : barre de synthèse (total projets, budget total, tâches en retard, alertes)
- Filtres : statut (actif/pause/clôture), chef de projet, période
- Grille responsive : `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`

**Card projet** :
```
┌─────────────────────────────────────┐
│ ● Central Malley          [9240302] │  ← pastille santé + nom + code
│─────────────────────────────────────│
│ Budget  ████████░░ 62%   CHF 5.3M  │  ← barre progression
│ Tâches  3 en retard / 12 actives   │  ← rouge si > 0
│ Soumis. Deadline: 20.03 (2j)       │  ← orange si < 7j
│ PV      Séance #4 — 15.03          │  ← dernier PV
│─────────────────────────────────────│
│ ⚠ 2 plans obsolètes  ⚠ 1 alerte   │  ← badges alertes
└─────────────────────────────────────┘
```

**Données** : agrégées depuis les API existantes (projects/list enrichi + tasks + submissions + pv + plans)

**Export** : bouton "Rapport Direction" → PDF généré côté client (jspdf) avec 1 page par projet

**Effort** : M (2-3 jours)

---

## 6. Résumé des efforts

| # | Amélioration | Phase | Effort | Semaine |
|---|-------------|-------|--------|---------|
| 9 | SubmissionEditor DB sync | 1 | M (2-3j) | 1 |
| 2 | Kanban drag & drop | 1 | M (2-3j) | 1 |
| 8 | Nettoyage 32 pages | 1 | S (1j) | 1-2 |
| 10 | Mail i18n | 1 | S (1j) | 2 |
| 3 | Bottom nav mobile + FAB | 2 | M (2-3j) | 3 |
| 5 | Soumissions prompt + inline | 2 | M (3-4j) | 3-4 |
| 6 | Fournisseurs scoring | 2 | M (3-4j) | 3-4 |
| 1 | Action Board | 3 | XL (2-3sem) | 5-7 |
| 4 | CFC 300+ prix | 3 | L (1sem+) | 5-6 |
| 7 | Direction multi-projet | 3 | M (2-3j) | 7-8 |
| | **TOTAL** | | | **~8 semaines** |

---

## 7. Risques identifiés

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Action Board trop complexe pour 2-3 semaines | Haute | Retard Phase 3 | Livrer v1 minimale (emails + tâches), v2 avec soumissions/plans |
| CFC 300+ données incorrectes | Moyenne | Estimations fausses | Valider avec 3 projets réels avant mise en production |
| Conflits de données SubmissionEditor (localStorage vs DB) | Moyenne | Perte de modifications | Timestamp-based conflict resolution |
| Scoring fournisseur biaisé par données insuffisantes | Haute | Score non représentatif | Afficher "Score préliminaire" si < 3 interactions, seuil minimum |
| Bottom nav interfère avec CookieConsent banner | Basse | Chevauchement UI | z-index management, CookieConsent en priority |

---

## 8. Hors périmètre (identifié mais reporté)

- Rate limiting API (SEC2.NC1) — critique sécurité, mais architecture séparée
- Tests automatisés E2E — nécessaire mais effort XL séparé
- Dark mode complet — ThemeProvider existe, variables Tailwind pas appliquées
- Webhook temps réel pour emails (WebSocket/Pusher) — remplacé par sync manuelle + CRON
- NPK norms dans les prompts IA — nécessite expertise métier supplémentaire
- Recherche full-text cross-modules (Elasticsearch/Algolia) — architecture séparée
