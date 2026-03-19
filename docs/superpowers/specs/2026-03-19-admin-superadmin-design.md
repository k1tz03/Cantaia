# Refonte Admin Org, Super-Admin & Migration cantaia.io

> Spec validee le 2026-03-19. Couvre la refonte complete des panneaux Admin (org) et Super-Admin de Cantaia, l'integration Stripe, les plans tarifaires, et la migration de domaine vers cantaia.io.

---

## 1. Contexte & Objectifs

### Problemes actuels

1. **Admin org** : Pages partiellement fonctionnelles, donnees hardcodees, pas de vue unifiee pour un responsable d'organisation. Boutons morts (logo upload, resend invite). Onglet finances = placeholder.
2. **Super-Admin** : Couts IA = 0 en production (`api_usage_logs` vide malgre 17+ routes appelant `trackApiUsage()`). Pas d'outils operationnels (force sync, impersonation, debug). Pages metriques/billing partiellement connectees.
3. **Domaine** : Le codebase reference cantaia.ch/cantaia.com/cantaia.app mais **seul cantaia.io est detenu**. Toutes les references sont incorrectes.
4. **Stripe** : Integration minimale (webhook basique). Pas de gestion d'abonnement dans l'app, pas de feature gating, pas de limites IA.

### Objectifs

- **Admin org** : Panneau de controle unique pour un responsable d'organisation — activite membres, sante equipe, gestion membres, abonnement Stripe, factures. **SANS couts IA** (reserves au super-admin).
- **Super-Admin** : Dashboard ultra complet avec couts IA fonctionnels, outils operationnels, controle total de la plateforme.
- **Stripe** : Integration complete dans l'app (pas de portail externe pour les plans).
- **Domaine** : Migration complete vers cantaia.io.

---

## 2. Admin Org — Panneau de controle

### 2.1 Structure

4 onglets dans `/admin` :

| Onglet | Contenu |
|--------|---------|
| **Vue d'ensemble** | Feed activite + sante equipe |
| **Membres** | Gestion equipe (invite, roles, suppression) |
| **Abonnement** | Plan actuel, Stripe, factures |
| **Parametres** | Branding, alertes, config org |

### 2.2 Onglet Vue d'ensemble

**Feed d'activite** (temps reel, derniers 7 jours) :
- Emails synchronises par membre
- Taches creees/completees
- PV generes
- Plans analyses
- Soumissions envoyees

Sources : `email_records`, `tasks`, `meetings`, `plan_registry`, `submissions` — filtres par `organization_id`, tries par date desc.

**Sante equipe** :
- Card par membre avec indicateurs :
  - Taches en retard (rouge si > 3)
  - Taches en cours
  - Derniere connexion (grise si > 7 jours)
  - Emails non traites
- Alerte visuelle si un membre a beaucoup de taches en retard
- Sources : `tasks` (status != done, due_date < now), `users` (last_sign_in_at via Supabase Auth)

**KPIs organisation** :
- Projets actifs
- Taches ouvertes / en retard
- Emails non traites
- Prochaines echeances soumissions

### 2.3 Onglet Membres

- **Table** : nom, email, role, derniere connexion, taches en retard, statut (actif/invite)
- **Actions** : inviter membre, changer role, renvoyer invitation, supprimer membre
- **Limites** : affiche `X / Y utilisateurs` selon le plan (ex: "3 / 3 utilisateurs Pro")
- **API existantes** : `POST /api/invites`, `GET /api/admin/clients`

### 2.4 Onglet Abonnement

**Plan actuel** :
- Nom du plan, prix, prochaine facture, moyen de paiement (4 derniers chiffres)
- Bouton "Changer de plan" → modal avec les 3 plans (Starter/Pro/Enterprise)
- Bouton "Annuler l'abonnement" → confirmation + `cancel_at_period_end`

**Factures** :
- Liste des factures Stripe avec date, montant, statut, lien PDF
- `GET /api/stripe/invoices` → `stripe.invoices.list({ customer })`

**Moyen de paiement** :
- Affichage carte actuelle
- Bouton "Modifier" → Stripe Billing Portal (uniquement pour la carte, pas les plans)

**Ce qui n'est PAS dans cet onglet** : couts IA, metriques API, analytics de consommation. Ces donnees sont exclusivement dans le super-admin.

### 2.5 Onglet Parametres

- Branding (logo, couleur primaire) — fix du bouton upload mort
- Configuration alertes
- Parametre org (nom, adresse)

### 2.6 Pages admin supprimees ou fusionnees

Les pages actuelles suivantes sont **fusionnees** dans les 4 onglets :
- `/admin/members` → onglet Membres
- `/admin/finances` → onglet Abonnement
- `/admin/branding` → onglet Parametres
- `/admin/alerts` → onglet Parametres
- `/admin/settings` → onglet Parametres
- `/admin/users` → onglet Membres
- `/admin/logs` → supprime (les logs d'audit ne sont pas utiles pour un admin org)
- `/admin/time-savings` → supprime (metriques IA = super-admin)
- `/admin/organizations/[id]` → supprime (c'est une page super-admin)
- `/analytics` → supprime (analytics = super-admin)
- `/api-costs` → supprime (couts = super-admin)
- `/branding` → fusionne dans onglet Parametres
- `/clients` → supprime (doublon)
- `/debug` → supprime (debug = super-admin)

**Resultat** : 14 pages → 1 page a 4 onglets.

---

## 3. Super-Admin — Dashboard complet

### 3.1 Structure

7 pages :

| Page | Route | Contenu |
|------|-------|---------|
| **Dashboard** | `/super-admin` | KPIs temps reel, activite recente, alertes |
| **Organisations** | `/super-admin/organizations` | Liste orgs + detail |
| **Utilisateurs** | `/super-admin/users` | Tous les users, couts IA par user |
| **Couts IA** | `/super-admin/ai-costs` | **NOUVELLE PAGE** — analytics detailles |
| **Facturation** | `/super-admin/billing` | Revenue, MRR, ARR, factures |
| **Operations** | `/super-admin/operations` | **NOUVELLE PAGE** — outils operationnels |
| **Config** | `/super-admin/config` | Feature flags, config globale |

### 3.2 Dashboard (`/super-admin`)

**KPIs temps reel** (tous depuis vraies donnees) :
- Utilisateurs actifs (24h / 7j / 30j) — `users.last_sign_in_at`
- Orgs actives — `organizations` avec au moins 1 user actif 30j
- MRR — calcule depuis `subscription_plan` x tarifs
- Appels IA ce mois — `api_usage_logs` count
- Cout IA ce mois — `api_usage_logs` sum `estimated_cost_chf`
- Marge — MRR - cout IA projete
- Stockage total — scan buckets Supabase

**Activite recente** (feed) :
- Derniers appels IA, emails synces, projets crees, taches creees
- Source : action `recent-activity` existante

**Alertes** :
- Paiements echoues (Stripe)
- Orgs en trial expirant dans 3 jours
- Erreurs Sentry critiques
- Users inactifs > 30 jours

### 3.3 Couts IA (`/super-admin/ai-costs`) — NOUVELLE PAGE

**Prerequis critique** : Corriger le bug `api_usage_logs` vide en production (voir Section 6 pour le diagnostic et les hypotheses). Cette page est inutile tant que le tracking ne fonctionne pas.

**Contenu** :
- **Vue globale** : cout total, appels totaux, cout moyen/appel, projection mensuelle
- **Par organisation** : tableau org, plan, membres, appels, cout, revenue, marge %
- **Par utilisateur** : tableau user, org, appels, cout, derniere activite
- **Par fonction IA** : tableau action_type (classify-email, generate-reply, analyze-plan...), appels, cout, % total
- **Tendance** : AreaChart quotidien (cout + appels) — selecteur periode 7j/30j/90j
- **Distribution** : BarChart par heure du jour, par jour de la semaine
- **Top consumers** : Top 10 users par cout, top 10 orgs par cout

Source : `api_usage_logs` via action API `analytics` existante (apres fix du bug tracking).

### 3.4 Operations (`/super-admin/operations`) — NOUVELLE PAGE

**Outils operationnels** :

| Outil | Description | API |
|-------|-------------|-----|
| **Force sync emails** | Declencher la sync email pour un user/org | `POST /api/outlook/sync` avec admin override |
| **Force briefing** | Regenerer le briefing d'un user | `POST /api/briefing/generate` avec admin override |
| **Run CRONs** | Declencher manuellement les 4 CRONs | `POST /api/cron/*` avec `CRON_SECRET` |
| **Impersonation** | Se connecter en tant qu'un user | `supabase.auth.admin.generateLink({ type: 'magiclink', email })` |
| **Sentry errors** | Dernieres erreurs (existant) | `GET /api/super-admin?action=sentry-errors` |
| **Debug org** | Diagnostics org (tokens, connections, sync state) | Existant dans `/api/debug/*` |
| **Merge orgs** | Fusionner 2 organisations | Existant dans `/api/debug/org-merge` |
| **Invalidate cache** | Rafraichir vues materialisees | `POST /api/cron/calibrate` |

**Impersonation** :
- Le super-admin clique "Se connecter en tant que X"
- API genere un magic link via `supabase.auth.admin.generateLink()`
- Ouvre dans un nouvel onglet
- Banniere rouge en haut de l'app : "Vous etes connecte en tant que [Prenom Nom] — Retour super-admin"
- Pas de modification de session du super-admin (nouvel onglet independant)

### 3.5 Pages existantes ameliorees

**Organisations** (`/super-admin/organizations`) :
- Liste : plan, MRR, membres, appels IA, cout IA, marge, statut
- Detail : onglet stats IA deja implemente (Session 2026-03-15), ajouter onglet membres, onglet config

**Utilisateurs** (`/super-admin/users`) :
- Colonnes : nom, email, org, role, appels IA, cout IA, derniere connexion
- Filtre par org, tri par cout desc
- Action : impersonate, reset password, disable

**Facturation** (`/super-admin/billing`) :
- MRR/ARR calcules depuis les plans reels
- Distribution par plan (pie chart)
- Revenue vs Couts IA (bar chart mensuel)
- Liste orgs avec plan, statut paiement, derniere facture

**Config** (`/super-admin/config`) :
- Feature flags (existant dans `admin_config`)
- Limites par plan (editable)
- Maintenance mode toggle

---

## 4. Plans tarifaires & Stripe

### 4.1 Grille tarifaire

| | **Trial** | **Starter** | **Pro** | **Enterprise** |
|---|---|---|---|---|
| **Prix** | 0 CHF / 7 jours | 149 CHF/mois | 349 CHF/mois | Sur devis (des 790 CHF) |
| **Utilisateurs** | 1 | 1 | 3 inclus (+99 CHF/user) | Illimite |
| **Projets** | 2 | 5 | Illimite | Illimite |
| **Emails sync** | 50 | 500/mois | Illimite | Illimite |
| **Appels IA/mois** | 20 | 200 | 1 000 | Illimite |
| **Plans analyse** | 2 | 10/mois | 50/mois | Illimite |
| **Soumissions** | 1 | 5 actives | Illimite | Illimite |
| **Budget IA** | Non | Oui | Oui | Oui |
| **Planning generation** | Non | Basique (sans Monte Carlo) | Complet | Complet |
| **Data Intelligence C2** | Non | Non | Oui | Oui |
| **Branding custom** | Non | Non | Oui | Oui |
| **Support** | Email | Email (48h) | Prioritaire (24h) | Dedie + onboarding |
| **Export DOCX/PDF** | Non | Oui | Oui | Oui |
| **Stockage** | 100 MB | 2 GB | 10 GB | Illimite |

### 4.2 Enforcement des limites IA

Nouveau middleware `checkUsageLimit(userId, orgId, actionType)` :

1. Lire `organizations.subscription_plan`
2. Compter appels IA ce mois dans `api_usage_logs` (WHERE `created_at >= premier du mois`)
3. Comparer au quota `PLAN_FEATURES[plan].aiCalls`
4. Si depasse → retourner `429 { error: "usage_limit_reached", required_plan }`
5. Si OK → continuer, `trackApiUsage()` apres succes

**Routes concernees** (17+) : toutes les routes `/api/ai/*`, `/api/plans/estimate-v2`, `/api/chat`, `/api/submissions/[id]/analyze`, `/api/submissions/[id]/estimate-budget`, `/api/visits/generate-report`, `/api/visits/analyze-notes`, `/api/planning/generate`.

**Exclusions** : La classification email automatique (sync cron) ne compte PAS dans le quota utilisateur — cout plateforme.

**Soft limit** : A 80% du quota → banniere warning dans l'app. A 100% → routes IA bloquees, reste de l'app fonctionne normalement.

### 4.3 Feature gating

Configuration centralisee dans `@cantaia/config` :

```typescript
const PLAN_FEATURES = {
  trial:      { maxProjects: 2, maxUsers: 1, aiCalls: 20, budgetAI: false, planning: false, dataIntel: false, branding: false, export: false, maxStorage: 100_000_000 },
  starter:    { maxProjects: 5, maxUsers: 1, aiCalls: 200, budgetAI: true, planning: 'basic', dataIntel: false, branding: false, export: true, maxStorage: 2_000_000_000 },
  pro:        { maxProjects: Infinity, maxUsers: 3, aiCalls: 1000, budgetAI: true, planning: 'full', dataIntel: true, branding: true, export: true, maxStorage: 10_000_000_000 },
  enterprise: { maxProjects: Infinity, maxUsers: Infinity, aiCalls: Infinity, budgetAI: true, planning: 'full', dataIntel: true, branding: true, export: true, maxStorage: Infinity },
}
```

**Cote UI** : Features verrouillees affichent un badge "Pro" ou "Enterprise" avec tooltip et CTA upgrade. Pas de pages cachees — tout visible mais grise.

**Cote API** : Chaque route verifie le plan. Retourne `403 { error: "plan_required", required_plan: "pro" }`.

Helper `canAccess(orgPlan, feature)` utilise cote client ET serveur.

### 4.4 Stripe — Architecture produits

```
Stripe Products:
├── prod_cantaia_starter
│   └── price_starter_monthly (149 CHF/mois, recurring)
├── prod_cantaia_pro
│   ├── price_pro_monthly (349 CHF/mois, recurring)
│   └── price_pro_extra_user (99 CHF/mois, recurring, quantity-based)
└── prod_cantaia_enterprise
    └── price_enterprise_custom (sur devis, recurring)
```

**Trial** : Pas de produit Stripe. Gere cote app via `organizations.trial_ends_at`.

### 4.5 Colonne de reference pour le plan

La table `organizations` a deux colonnes liees au plan :
- `subscription_plan` (TEXT, migration 001) — valeurs : `trial`, `starter`, `pro`, `enterprise`
- `plan` (TEXT, migration 016) — doublon historique

**Decision** : `subscription_plan` est la **colonne autoritaire**. Toutes les lectures (feature gating, `checkUsageLimit()`, dashboard) lisent `subscription_plan`. Le webhook Stripe ecrit dans `subscription_plan`. La colonne `plan` (migration 016) est ignoree et sera supprimee dans une migration de cleanup.

**Colonnes manquantes** : Le webhook Stripe existant ecrit dans `plan_status` et `plan_period_end`, mais **ces colonnes n'existent dans aucune migration**. Une nouvelle migration est necessaire :

```sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'active';
-- values: active, past_due, canceled, trialing
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_period_end TIMESTAMPTZ;
-- date de fin de la periode courante (pour cancel_at_period_end)
```

### 4.6 Flux Stripe

**Souscription initiale** :
1. User choisit un plan dans `/admin` onglet Abonnement (ou page bloquante post-trial)
2. `POST /api/stripe/create-checkout` → Stripe Checkout Session
3. Redirect vers Stripe hosted checkout
4. Webhook `checkout.session.completed` → update `organizations.subscription_plan` + `stripe_customer_id` + `stripe_subscription_id` + `plan_status = 'active'`
5. Redirect vers `/admin?tab=subscription&success=true`

**Changement de plan** :
- `POST /api/stripe/update-subscription` → `stripe.subscriptions.update()` avec prorata
- Webhook `customer.subscription.updated` → sync `subscription_plan` + `plan_status`

**Ajout users (Pro)** :
- `POST /api/stripe/add-seats` → update quantity sur subscription item extra_user

**Annulation** :
- `POST /api/stripe/cancel-subscription` → `cancel_at_period_end: true`
- Continue jusqu'a fin de periode, puis webhook `customer.subscription.deleted` → downgrade

**Factures** :
- `GET /api/stripe/invoices` → `stripe.invoices.list({ customer })` avec lien PDF

**Moyen de paiement** :
- `POST /api/stripe/create-portal-session` → Billing Portal (uniquement pour la carte)

**Webhooks traites** :
- `checkout.session.completed` → activation plan
- `customer.subscription.updated` → sync plan/statut
- `customer.subscription.deleted` → downgrade vers trial expire
- `invoice.payment_succeeded` → log facture
- `invoice.payment_failed` → banniere "Paiement echoue" + email via Resend

### 4.7 Trial → Expiration

- 7 jours apres creation org (`organizations.trial_ends_at`)
- J-3, J-1, J0 : email de rappel via Resend
- Apres expiration : page bloquante full-screen "Votre essai est termine" avec les 3 plans
- App en lecture seule (consultation emails, projets) mais actions IA et creations bloquees

---

## 5. Migration domaine cantaia.io

### 5.1 Contexte

**cantaia.ch, cantaia.com, cantaia.app n'appartiennent PAS a Julien.** Seul **cantaia.io** est detenu. Tout le codebase reference des domaines incorrects.

### 5.2 Fichiers impactes (code)

| Fichier | Changement |
|---------|------------|
| `CLAUDE.md` | Tous les domaines, `BASE_DOMAIN`, subdomaines, redirects SEO |
| `.env` / `.env.example` | `BASE_DOMAIN=cantaia.io`, `NEXT_PUBLIC_APP_URL=https://cantaia.io` |
| `next.config.ts` | Supprimer redirects 301 cantaia.com/cantaia.app → cantaia.ch. Nouveau : redirect www.cantaia.io → cantaia.io |
| `middleware.ts` | Subdomain detection `*.cantaia.io` |
| `apps/web/src/lib/env.ts` | Validation `BASE_DOMAIN` |
| Sitemap (`sitemap.ts`) | URLs cantaia.io |
| Robots (`robots.ts`) | URLs cantaia.io |
| Metadata (toutes pages) | URLs cantaia.io |
| OG Image (`opengraph-image.tsx`) | URL cantaia.io |
| JSON-LD (landing, marketing layout) | `@id` et URLs cantaia.io |
| `manifest.json` | `start_url`, `scope` |
| Messages i18n (`fr.json`, `en.json`, `de.json`) | Si des URLs sont dans les traductions |
| CSP header (`next.config.ts`) | Domaine connect-src |
| `packages/core/src/submissions/price-request-generator.ts` | URLs tracking/portail fournisseur |
| `packages/core/src/submissions/tracking-code.ts` | URLs portail fournisseur |

**Note** : Faire un `grep -r "cantaia\.ch\|cantaia\.com\|cantaia\.app" --include="*.ts" --include="*.tsx" --include="*.json"` sur tout le codebase pour attraper les fichiers manquants.

### 5.3 Configuration externe (manuelle)

| Service | Action |
|---------|--------|
| **Vercel** | Ajouter cantaia.io comme domaine custom |
| **DNS** | A record ou CNAME vers Vercel pour cantaia.io |
| **Azure AD** | Mettre a jour redirect_uri vers `https://cantaia.io/api/auth/microsoft-connect` |
| **Supabase** | Mettre a jour redirect URLs autorisees |
| **Stripe** | Mettre a jour webhook URL vers `https://cantaia.io/api/webhooks/stripe` |
| **Google Search Console** | Verifier cantaia.io, soumettre sitemap |
| **Sentry** | Mettre a jour allowed domains |

### 5.4 Subdomaines

Pattern identique sur `.cantaia.io` :
- `hrs.cantaia.io` (multi-tenant org)
- Subdomaines reserves inchanges : www, app, api, admin, super-admin, mail, smtp, ftp, dev, staging, test, demo, help, support, docs, status, blog, cdn, static

---

## 6. Bug critique : api_usage_logs vide

### Probleme

La table `api_usage_logs` est **vide en production** malgre 17+ routes API qui appellent `trackApiUsage()`. Le dashboard super-admin affiche donc "0 appels IA" et "0 CHF".

### Causes a investiguer

La cause racine n'est **pas** le type de client Supabase — l'inspection du code montre que les 15+ call sites passent deja `adminClient` a `trackApiUsage()`, et la RLS (migration 004) a un `WITH CHECK (true)` pour service role. Les hypotheses a verifier :

1. **Migration 004 non appliquee en production** — la table `api_usage_logs` n'existe peut-etre pas
2. **`trackApiUsage()` echoue silencieusement** — le catch avale l'erreur sans log
3. **Le `supabaseClient` passe a `trackApiUsage()` est en realite un client user** malgre le nom `admin` dans les routes (verifier chaque call site)
4. **La table existe mais avec un schema different** de ce que le code attend

### Fix

1. Verifier en production que la table `api_usage_logs` existe (`SELECT count(*) FROM api_usage_logs`)
2. Inspecter `api-cost-tracker.ts` : ajouter un `console.error` dans le catch pour exposer l'erreur reelle
3. Tester en staging avec un appel IA et verifier que la ligne apparait
4. Si la table n'existe pas → appliquer la migration
5. Si l'erreur est un probleme de colonnes → adapter le code au schema reel

Ce fix est un **prerequis** pour toute la section Couts IA du super-admin.

---

## 7. Nouvelles routes API

| Route | Methode | Description |
|-------|---------|-------------|
| `POST /api/stripe/create-checkout` | POST | Creer Stripe Checkout Session |
| `POST /api/stripe/update-subscription` | POST | Changer de plan (prorata) |
| `POST /api/stripe/cancel-subscription` | POST | Annuler (fin de periode) |
| `POST /api/stripe/add-seats` | POST | Ajouter users (Pro) |
| `GET /api/stripe/invoices` | GET | Liste factures avec PDF |
| `POST /api/stripe/create-portal-session` | POST | Billing Portal (carte uniquement) |
| `GET /api/admin/team-health` | GET | Sante equipe (taches retard, activite) |
| `GET /api/admin/activity-feed` | GET | Feed activite org |
| `POST /api/super-admin/impersonate` | POST | Generer magic link pour impersonation |
| `POST /api/super-admin/force-sync` | POST | Forcer sync email d'un user |
| `POST /api/super-admin/force-briefing` | POST | Forcer briefing d'un user |

### Routes existantes modifiees

| Route | Modification |
|-------|-------------|
| Toutes routes `/api/ai/*` (17+) | Ajout `checkUsageLimit()` middleware |
| `/api/webhooks/stripe` | Ajout handlers `invoice.payment_succeeded`, `invoice.payment_failed` |
| `GET /api/super-admin` | Nouvelles actions : `ai-costs-summary`, `operations-status` |
| `POST /api/organization/upload-logo` | Fix du bouton mort |

---

## 8. Nouveaux fichiers

| Fichier | Role |
|---------|------|
| `packages/database/migrations/054_stripe_plan_columns.sql` | Ajoute `plan_status` et `plan_period_end` sur `organizations` |
| `packages/config/src/plan-features.ts` | `PLAN_FEATURES`, `canAccess()`, `checkUsageLimit()` |
| `apps/web/src/app/api/stripe/create-checkout/route.ts` | Checkout Stripe |
| `apps/web/src/app/api/stripe/update-subscription/route.ts` | Changement plan |
| `apps/web/src/app/api/stripe/cancel-subscription/route.ts` | Annulation |
| `apps/web/src/app/api/stripe/add-seats/route.ts` | Ajout users |
| `apps/web/src/app/api/stripe/invoices/route.ts` | Liste factures |
| `apps/web/src/app/api/stripe/create-portal-session/route.ts` | Billing Portal |
| `apps/web/src/app/api/admin/team-health/route.ts` | Sante equipe |
| `apps/web/src/app/api/admin/activity-feed/route.ts` | Feed activite |
| `apps/web/src/app/api/super-admin/impersonate/route.ts` | Impersonation |
| `apps/web/src/app/api/super-admin/force-sync/route.ts` | Force sync |
| `apps/web/src/app/api/super-admin/force-briefing/route.ts` | Force briefing |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/ai-costs/page.tsx` | Page couts IA |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/operations/page.tsx` | Page operations |
| `apps/web/src/components/admin/AdminOverviewTab.tsx` | Onglet vue d'ensemble |
| `apps/web/src/components/admin/AdminMembersTab.tsx` | Onglet membres |
| `apps/web/src/components/admin/AdminSubscriptionTab.tsx` | Onglet abonnement |
| `apps/web/src/components/admin/AdminSettingsTab.tsx` | Onglet parametres |
| `apps/web/src/components/admin/TeamHealthCard.tsx` | Card sante equipe |
| `apps/web/src/components/admin/ActivityFeed.tsx` | Feed activite |
| `apps/web/src/components/stripe/PlanSelector.tsx` | Selecteur de plan |
| `apps/web/src/components/stripe/InvoicesList.tsx` | Liste factures |
| `apps/web/src/components/stripe/UsageLimitBanner.tsx` | Banniere limite atteinte |
| `apps/web/src/components/super-admin/ImpersonationBanner.tsx` | Banniere impersonation |

---

## 9. Fichiers existants modifies

| Fichier | Modification |
|---------|-------------|
| `apps/web/src/app/[locale]/(admin)/admin/page.tsx` | Rewrite complet → 4 onglets |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/page.tsx` | Fix KPIs, alertes, activite |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/organizations/page.tsx` | Colonnes couts IA |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/users/page.tsx` | Colonnes couts IA, impersonate |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/billing/page.tsx` | MRR/ARR reels, revenue vs couts |
| `apps/web/src/app/[locale]/(super-admin)/super-admin/config/page.tsx` | Limites par plan editables |
| `apps/web/src/app/api/webhooks/stripe/route.ts` | Nouveaux handlers webhook |
| `apps/web/src/app/api/super-admin/route.ts` | Nouvelles actions |
| `packages/core/src/tracking/api-cost-tracker.ts` | Fix tracking INSERT (voir Section 6 pour diagnostic) |
| `middleware.ts` | Domaine cantaia.io, trial expiration redirect |
| `next.config.ts` | Domaine, CSP, redirects |
| `CLAUDE.md` | Domaines, plans tarifaires, nouvelles routes |
| `.env.example` | `BASE_DOMAIN=cantaia.io` |
| Sitemap, robots, metadata, OG, JSON-LD | URLs cantaia.io |
| Messages i18n (fr/en/de.json) | Nouvelles cles admin, super-admin, plans, stripe |

---

## 10. Pages admin supprimees

Les pages suivantes sont supprimees ou redirigees car leur contenu est fusionne dans la nouvelle page admin a 4 onglets ou deplace vers le super-admin :

| Page supprimee | Destination |
|----------------|-------------|
| `/admin/members` | → onglet Membres de `/admin` |
| `/admin/finances` | → onglet Abonnement de `/admin` |
| `/admin/branding` | → onglet Parametres de `/admin` |
| `/admin/alerts` | → onglet Parametres de `/admin` |
| `/admin/settings` | → onglet Parametres de `/admin` |
| `/admin/users` | → onglet Membres de `/admin` |
| `/admin/logs` | Supprime (super-admin only) |
| `/admin/time-savings` | Supprime (super-admin only) |
| `/admin/organizations/[id]` | Supprime (super-admin only) |
| `/analytics` | Supprime (super-admin only) |
| `/api-costs` | Supprime (super-admin only) |
| `/branding` | → onglet Parametres de `/admin` |
| `/clients` | Supprime (doublon) |
| `/debug` | Supprime (super-admin only) |

---

## 11. Risques & Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| `api_usage_logs` vide en prod | Couts IA = 0, analytics inutiles | Investiguer et fixer en priorite (Section 6) |
| Migration domaine casse les OAuth flows | Utilisateurs deconnectes | Mettre a jour Azure AD + Supabase AVANT le deploy |
| Stripe checkout en CHF non supporte | Paiement impossible | Verifier support CHF chez Stripe (supporte depuis 2019) |
| Trial expiration trop aggressive | Perte d'utilisateurs potentiels | Lecture seule apres expiration (pas de suppression de donnees) |
| Feature gating bloque des workflows critiques | Frustration utilisateur | Gating uniquement sur les features premium, pas sur le core |
| Impersonation — securite | Acces non autorise | Log de chaque impersonation, magic link expire 5 min, banniere visible |

---

## 12. Ordre d'implementation recommande

1. **Fix api_usage_logs** (prerequis pour tout le reste du super-admin)
2. **Migration cantaia.io** (impacte toute la config, faire tot)
3. **Plan features & gating** (`PLAN_FEATURES`, `canAccess()`, `checkUsageLimit()`)
4. **Routes Stripe** (6 nouvelles routes)
5. **Admin org rewrite** (4 onglets, suppression 14 pages)
6. **Super-admin nouvelles pages** (Couts IA, Operations)
7. **Super-admin ameliorations** (Dashboard, Organisations, Users, Billing)
8. **Trial expiration flow** (emails Resend, page bloquante)
9. **Impersonation** (super-admin → user)
10. **CLAUDE.md update**

---

## 13. Dependances avec autres specs

| Spec | Dependance |
|------|-----------|
| **Learning Engine** (2026-03-19) | Le fix `api_usage_logs` est partage. Les limites IA impactent les feedback loops. |
| **Gantt Planning** (2026-03-18) | La feature `planning` est gatee par plan (basic vs full). |
| **Audit & Optimisation** (2026-03-18) | Les corrections de pages admin sont remplacees par cette refonte. |
