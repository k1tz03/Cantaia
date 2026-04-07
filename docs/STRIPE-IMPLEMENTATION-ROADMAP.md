# Cantaia — Roadmap Implementation Stripe & Access Control

> Document de reference — Avril 2026
> Tous les changements necessaires pour mettre en place la facturation per-user et le blocage d'acces par plan.

---

## 1. Configuration Stripe (Dashboard)

### Products & Prices a creer

| Plan | Price ID Env Var | Type | Prix | Devise | Recurrence |
|------|-----------------|------|------|--------|------------|
| Starter | `STRIPE_PRICE_STARTER` | Per-seat (metered) | 49 CHF | CHF | Mensuel |
| Pro | `STRIPE_PRICE_PRO` | Per-seat (metered) | 89 CHF | CHF | Mensuel |
| Enterprise | `STRIPE_PRICE_ENTERPRISE` | Per-seat (metered) | 119 CHF | CHF | Mensuel |

### Etapes dans le Stripe Dashboard

1. Creer un Product "Cantaia Starter" → ajouter Price 49 CHF/mois recurring, usage_type=licensed
2. Creer un Product "Cantaia Pro" → ajouter Price 89 CHF/mois recurring, usage_type=licensed
3. Creer un Product "Cantaia Enterprise" → ajouter Price 119 CHF/mois recurring, usage_type=licensed
4. Copier les Price IDs (ex: `price_1Qxx...`) dans les variables Vercel :
   - `STRIPE_PRICE_STARTER=price_xxx`
   - `STRIPE_PRICE_PRO=price_xxx`
   - `STRIPE_PRICE_ENTERPRISE=price_xxx`

### Per-seat billing

Le modele per-user signifie que Stripe facture `quantity` * `unit_amount`. Lors du checkout :
- `quantity` = nombre d'utilisateurs selectionne
- Le client peut ajouter des sieges plus tard via `/api/stripe/add-seats`
- Proration automatique lors des changements de plan

---

## 2. Modifications API Stripe

### `/api/stripe/create-checkout` (MODIFIER)

Changements necessaires :
```
- Ajouter `quantity` dans le body (nombre d'utilisateurs)
- Passer `quantity` dans `line_items` Stripe
- Valider : quantity >= plan.minUsers && quantity <= plan.maxUsers
- Starter : quantity entre 1 et 5
- Pro : quantity entre 5 et 30
- Enterprise : quantity >= 15
- Stocker `max_users = quantity` dans metadata + table organizations
```

**Fichier** : `apps/web/src/app/api/stripe/create-checkout/route.ts`

### `/api/stripe/update-subscription` (MODIFIER)

Changements necessaires :
```
- Supporter le changement de plan ET de quantity
- Proration : Stripe gere automatiquement avec `proration_behavior: 'create_prorations'`
- Valider min/maxUsers du nouveau plan
- Mettre a jour organizations.max_users
```

**Fichier** : `apps/web/src/app/api/stripe/update-subscription/route.ts`

### `/api/stripe/add-seats` (MODIFIER)

Changements necessaires :
```
- Valider que new_quantity <= plan.maxUsers
- Si Pro et quantity > 30 → suggerer upgrade Enterprise
- Mettre a jour subscription quantity via Stripe API
- Mettre a jour organizations.max_users
```

**Fichier** : `apps/web/src/app/api/stripe/add-seats/route.ts`

### `/api/webhooks/stripe` (MODIFIER)

Changements necessaires :
```
- Sur checkout.session.completed : lire quantity depuis session.line_items
- Stocker subscription_plan + max_users dans organizations
- Sur subscription.updated : sync quantity changes
- Sur invoice.payment_succeeded : log avec quantity pour MRR tracking
```

**Fichier** : `apps/web/src/app/api/webhooks/stripe/route.ts`

---

## 3. Blocage d'Acces par Plan (Feature Gating)

### 3.1 Config (`packages/config/plan-features.ts`)

Deja mis a jour avec les nouvelles limites. Les modules gates :

| Module | Trial | Starter | Pro | Enterprise |
|--------|-------|---------|-----|-----------|
| Mail (sync + classif IA) | 1 boite | 1 boite | Multi-boites | Multi-boites |
| Chat IA | 50 msg | 200 msg | 1000 msg | Illimite |
| Briefing quotidien | Oui | Oui | Oui | Oui |
| Projets | 3 | 5 | 30 | Illimite |
| Fournisseurs | 20 | 50 | Illimite | Illimite |
| **Soumissions** | Lecture | Lecture | **Complet** | Complet |
| **Plans (analyse)** | Upload | Upload | **Complet** | Complet |
| **PV de chantier** | Non | Non | **Complet** | Complet |
| **Planning IA** | Non | Non | **Complet** | Complet |
| **Portail terrain** | Non | Non | **Complet** | Complet |
| **Visites client** | Non | Non | **Complet** | Complet |
| **Rapports chantier** | Non | Non | **Complet** | Complet |
| Direction & Financials | Non | Non | Simplifie | **Complet** |
| Data Intelligence | Non | Non | Non | **Complet** |
| Branding custom | Non | Non | Non | **Complet** |
| API access | Non | Non | Non | **Complet** |

### 3.2 Middleware de verification (A CREER)

**Nouveau fichier** : `apps/web/src/lib/plan-guard.ts`

```typescript
// A implementer :
export async function requirePlan(
  orgId: string,
  requiredPlan: 'starter' | 'pro' | 'enterprise',
  feature?: string
): Promise<{ allowed: boolean; reason?: string }>

// Logique :
// 1. Fetch org.subscription_plan depuis DB
// 2. Comparer avec le plan requis (hierarchy: trial < starter < pro < enterprise)
// 3. Si feature specifie, verifier dans PLAN_FEATURES
// 4. Retourner allowed + reason pour le message d'erreur
```

### 3.3 Routes API a proteger

#### Routes Pro-only (retourner 403 si plan < pro)

| Route | Feature bloquee |
|-------|----------------|
| `POST /api/submissions` | Creation soumission (lecture seule en Starter) |
| `POST /api/submissions/[id]/send-price-requests` | Envoi demandes prix |
| `POST /api/submissions/[id]/analyze` | Analyse IA soumission |
| `POST /api/submissions/[id]/estimate-budget` | Budget IA |
| `POST /api/submissions/[id]/relance` | Relance fournisseur |
| `POST /api/ai/generate-pv` | Generation PV |
| `POST /api/pv` | Creation PV |
| `POST /api/pv/transcribe` | Transcription audio |
| `POST /api/planning/generate` | Generation planning IA |
| `POST /api/planning/[id]/export-pdf` | Export PDF planning |
| `POST /api/planning/[id]/share` | Partage planning |
| `POST /api/portal/[projectId]/*` | Toutes routes portail |
| `POST /api/visits/*` | Toutes routes visites |
| `POST /api/site-reports/*` | Toutes routes rapports chantier |

#### Routes Enterprise-only (retourner 403 si plan < enterprise)

| Route | Feature bloquee |
|-------|----------------|
| `GET /api/direction/stats` | Stats direction completes |
| `GET /api/benchmarks/*` | Data Intelligence C2 |
| `POST /api/organization/branding` | Branding custom |
| `POST /api/organization/upload-logo` | Upload logo custom |

### 3.4 Pages Frontend a proteger

#### Composant `PlanGate` (A CREER)

**Nouveau fichier** : `apps/web/src/components/app/PlanGate.tsx`

```typescript
// A implementer :
// Wrapper component qui :
// 1. Verifie le plan de l'org (via AuthProvider ou fetch)
// 2. Si acces autorise → affiche children
// 3. Si acces refuse → affiche overlay "Upgrade to Pro/Enterprise"
//    avec bouton vers /admin?tab=subscription
```

#### Pages a wrapper avec PlanGate

| Page | Plan requis | Comportement si bloque |
|------|-------------|----------------------|
| `/submissions/new` | Pro | Redirect vers liste (lecture seule) |
| `/submissions/[id]` (edit) | Pro | Vue lecture seule (pas d'actions) |
| `/pv-chantier/nouveau` | Pro | Overlay upgrade |
| `/pv-chantier/[id]` (edit) | Pro | Overlay upgrade |
| `/visits/new` | Pro | Overlay upgrade |
| `/projects/[id]/planning` | Pro | Overlay upgrade |
| `/site-reports` | Pro | Overlay upgrade |
| `/direction` | Enterprise (complet) | Version simplifiee en Pro, bloquee en Starter |
| `/pricing-intelligence` | Enterprise | Overlay upgrade |

### 3.5 Sidebar (restrictions visuelles)

Modifier `Sidebar.tsx` pour :
- **Starter** : griser/masquer les liens PV, Visites, Rapports chantier, Planning
- **Pro** : griser Direction (ou montrer version simplifiee)
- **Tous** : ajouter icone cadenas sur les features bloquees avec tooltip "Disponible en Pro/Enterprise"

---

## 4. Limites d'Usage (Quotas)

### 4.1 `checkUsageLimit()` (MODIFIER)

**Fichier** : `packages/config/plan-features.ts`

Mettre a jour les limites dans PLAN_FEATURES (deja fait) :

| Ressource | Trial | Starter | Pro | Enterprise |
|-----------|-------|---------|-----|-----------|
| maxUsers | 2 | 5 | 30 | Infinity |
| maxProjects | 3 | 5 | 30 | Infinity |
| maxAICallsPerMonth | 50 | 500 | 2000 | Infinity |
| maxStorageGB | 1 | 5 | 50 | 500 |
| maxSuppliersCount | 20 | 50 | Infinity | Infinity |

### 4.2 Routes avec `checkUsageLimit()` (14 routes IA)

Deja en place sur les routes IA. Verifier que les limites correspondent aux nouvelles valeurs.

### 4.3 `UsageLimitBanner` (MODIFIER)

**Fichier** : `apps/web/src/components/stripe/UsageLimitBanner.tsx`

Ajouter affichage du nombre de users utilises vs max :
```
"Votre equipe utilise 4/5 sieges. Passez au Pro pour jusqu'a 30 utilisateurs."
```

### 4.4 Controle nombre d'utilisateurs

**Nouveau** : Ajouter verification dans `/api/invites` POST :
```
- Compter users actuels de l'org
- Si count >= org.max_users → retourner 403
- Message : "Limite de X utilisateurs atteinte. Ajoutez des sieges ou passez au plan superieur."
```

---

## 5. UI Changes Restants

### 5.1 PlanSelector amélioré (MODIFIER)

**Fichier** : `apps/web/src/components/stripe/PlanSelector.tsx`

Ajouter :
- Input nombre d'utilisateurs (slider ou number input)
- Calcul prix total en temps reel : `quantity * pricePerUser`
- Validation min/max users par plan
- Affichage "A partir de X CHF/mois" dynamique

### 5.2 AdminSubscriptionTab amélioré (MODIFIER)

**Fichier** : `apps/web/src/components/admin/AdminSubscriptionTab.tsx`

Ajouter :
- Affichage sieges utilises vs max : "4/5 utilisateurs"
- Bouton "Ajouter des sieges" (appelle `/api/stripe/add-seats`)
- Barre de progression sieges

### 5.3 Page Pricing Marketing (VERIFIER)

**Fichier** : `apps/web/src/app/[locale]/(marketing)/pricing/page.tsx`

Deja mis a jour avec les nouveaux prix. Verifier :
- Toggle annuel/mensuel (optionnel, -20% annuel)
- FAQ section prix (optionnel)

---

## 6. Migrations DB

### Migration 063 (A CREER)

```sql
-- Mise a jour limites organisations existantes
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS seats_purchased INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS billing_period TEXT DEFAULT 'monthly';

-- Mettre a jour les valeurs par defaut pour les nouvelles orgs
-- trial: max_users=2, max_projects=3
-- starter: max_users=5, max_projects=5
-- pro: max_users=30, max_projects=30
-- enterprise: max_users=9999, max_projects=9999
```

---

## 7. Variables d'Environnement (Vercel)

| Variable | Valeur | Status |
|----------|--------|--------|
| `STRIPE_PRICE_STARTER` | `price_xxx` (a creer dans Stripe) | **A DEFINIR** |
| `STRIPE_PRICE_PRO` | `price_xxx` (a creer dans Stripe) | **A DEFINIR** |
| `STRIPE_PRICE_ENTERPRISE` | `price_xxx` (a creer dans Stripe) | **A DEFINIR** |
| `STRIPE_SECRET_KEY` | Deja defini | OK |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Deja defini | OK |
| `STRIPE_WEBHOOK_SECRET` | Deja defini | OK |

---

## 8. Checklist Implementation (Ordre recommande)

### Phase 1 — Stripe Setup (1-2 jours)
- [ ] Creer les 3 Products + Prices dans Stripe Dashboard
- [ ] Definir les 3 env vars sur Vercel
- [ ] Modifier `create-checkout` pour supporter quantity (per-seat)
- [ ] Modifier `update-subscription` pour quantity changes
- [ ] Modifier `add-seats` avec validation min/max
- [ ] Modifier webhook pour sync quantity → organizations.max_users
- [ ] Tester checkout flow end-to-end

### Phase 2 — Feature Gating Backend (1-2 jours)
- [ ] Creer `lib/plan-guard.ts` avec `requirePlan()`
- [ ] Proteger les ~15 routes Pro-only (403 si plan < pro)
- [ ] Proteger les ~4 routes Enterprise-only
- [ ] Ajouter verification seats dans `/api/invites`
- [ ] Tester chaque route avec plan trial/starter/pro

### Phase 3 — Feature Gating Frontend (1-2 jours)
- [ ] Creer composant `PlanGate.tsx`
- [ ] Wrapper les pages Pro-only
- [ ] Wrapper les pages Enterprise-only
- [ ] Modifier Sidebar (cadenas, griser)
- [ ] Modifier PlanSelector (input quantity)
- [ ] Modifier AdminSubscriptionTab (sieges, barre progression)
- [ ] Modifier UsageLimitBanner (sieges)

### Phase 4 — Tests & Deploy (1 jour)
- [ ] Tester trial → starter upgrade
- [ ] Tester starter → pro upgrade
- [ ] Tester pro → enterprise (contact flow)
- [ ] Tester ajout/retrait sieges
- [ ] Tester proration
- [ ] Tester webhook recovery (payment failed → retry)
- [ ] Deploy sur Vercel

---

## 9. Risques & Points d'Attention

| Risque | Mitigation |
|--------|-----------|
| Client selectionne Pro avec 5 users puis invite le 31eme | `add-seats` valide maxUsers=30 pour Pro, sinon → upgrade Enterprise |
| Downgrade Pro→Starter avec 8 users actifs | Bloquer downgrade si current_users > new_plan.maxUsers |
| Payment failed mid-month | Grace period 7 jours (Stripe `past_due`), puis bloquer acces |
| Enterprise via "Contactez-nous" (pas de self-serve) | Formulaire contact → Julien configure manuellement |
| Trial expire avec donnees | Overlay bloquant, pas de suppression. Donnees conservees 90 jours |
| Quantity mismatch Stripe vs DB | Webhook `subscription.updated` sync quantity → DB a chaque changement |

---

## 10. MRR Tracking (Super-Admin)

### Calcul MRR mis a jour

```
MRR = sum( org.seats_purchased * plan_price_per_user )

Exemples :
- Org A : Starter, 3 users → 3 * 49 = 147 CHF/mois
- Org B : Pro, 12 users → 12 * 89 = 1068 CHF/mois
- Org C : Enterprise, 25 users → 25 * 119 = 2975 CHF/mois
```

### Modifier `/api/super-admin` action `platform-metrics`

```
- MRR : sum(seats * price) pour toutes les orgs actives
- ARR : MRR * 12
- ARPU : MRR / total_users
- Revenue breakdown par plan
```

### Modifier page billing super-admin

```
- Afficher MRR par plan (Starter, Pro, Enterprise)
- Graph evolution MRR mensuel
- Churn rate par plan
- Net Revenue Retention
```
