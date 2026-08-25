# Cantaia — Référence Projet

> Document de référence pour Claude. État du code au **25.08.2026** (post audit intégral du site + campagne de correction complète : 6 critiques de sécurité fermés — RLS manquantes, IDOR, escalade — module demandes de prix corrigé, ~390 findings traités, migrations 105→129). Rapports d'audit : demandes de prix https://claude.ai/code/artifact/4b54d513-7b3e-4a36-ba98-268164510205 · global https://claude.ai/code/artifact/90734b9a-8ebb-4cde-83c8-09986e14648a.
> Règle d'entretien : ce fichier décrit l'ÉTAT COURANT, pas l'historique. Ne pas y accumuler de changelogs de session — l'historique vit dans git et dans la mémoire persistante. Rapport d'audit détaillé : https://claude.ai/code/artifact/069975f9-d082-47bf-b84c-5d64e20eaf38

---

## 1. Vue d'ensemble

**Cantaia** : SaaS de gestion de chantier augmenté par IA pour chefs de projet construction en Suisse. Domaine `cantaia.io`, multi-tenant par sous-domaine (`hrs.cantaia.io`), lancé publiquement le 22.04.2026. Redirect post-login : `/mail`.

### Modules

| Module | Entrée | Notes |
|---|---|---|
| **Mail** | `/mail` | Vue décisions (urgent/semaine/info), sync Outlook + classification IA 8 niveaux, threads Graph, signature, archivage .eml, règles de dossiers apprises |
| **Soumissions** | `/submissions` | Analyse Excel/PDF par chunks pilotés client, demandes de prix multi-fournisseurs (`PriceRequestV2`), réception auto par tracking `SUB-`, comparaison, attribution |
| **Fournisseurs** | `/suppliers` | CRUD, import CSV, recherche/enrichissement IA, scores 5 dimensions calculés sur `submission_price_requests`/`submission_quotes` |
| **Plans** | `/plans` | Registre + versions + analyse Vision ; estimation V2 (pipeline 4 passes) derrière le flag `NEXT_PUBLIC_USE_MANAGED_AGENTS`, persistée dans `plan_estimates` |
| **Scene3D** | `/projects/[id]/3d?plan=` | Viewer 2.5D (R3F 9) branché sur `GET /api/plans/[id]/scene` + `POST /api/scenes/extract` (202+polling) ; gated Pro+ ; `?demo=1` = scène mock |
| **PV de chantier** | `/pv-chantier` | Audio → compression MP3 client → Whisper → PV Claude SIA → tâches → PDF. `/pv` redirige ici |
| **Visites clients** | `/visits` | Audio + photos + notes manuscrites (Vision), rapport IA, conversion prospect |
| **Planning** | `/projects/[id]/planning` | Génération ALGORITHMIQUE (phases SIA + CPM + 27 règles CFC) + validation IA post-génération ; Gantt complet ; partage public par token |
| **Portail chef d'équipe** | `/portal/[projectId]` | Public, PIN 6 chiffres + JWT, rapports journaliers, photos de bons |
| **Rapports chantier** | `/site-reports` | Heures + bons agrégés, exports, partage public org-level `/rapports/[token]` |
| **Calendrier** | `/calendar` | Table `calendar_events` + sync Outlook bidirectionnelle (delta, RRULE, sensibilité filtrée), commande IA en langage naturel, panneau intelligence 8 sources |
| **Agents autonomes** | transverse | Boucle agentique maison sur Messages API (PAS l'API Managed Agents) — 5 interactifs (SSE) + 3 crons (email-drafter, followup-engine, supplier-monitor) ; project-memory/meeting-prep existent mais handlers non implémentés, crons retirés |
| **Chat IA** | `/chat` | SSE streaming, Vision, upload PDF/Excel, conversations persistées |
| **Briefing** | `/briefing` | Génération quotidienne (cron + à la demande), email Resend |
| **Support** | `/support` | Tickets conversationnels user ↔ superadmin, PJ signed URLs |
| **Admin org** | `/admin` | 4 onglets ; accès `admin`/`director` uniquement (guard `requireOrgAdmin`) |
| **Super-admin** | `/super-admin` | 12 pages (analytics consolidé 5 onglets) ; guard `is_superadmin` sur toutes les routes |
| **Direction / Action board** | `/direction`, `/action-board` | Simples redirects vers `/dashboard` (vue org dans `DashboardOrgView`) |
| **Cantaia Prix** | `/cantaia-prix` | Masqué de la sidebar, 3 onglets actifs (Import/Analyse/Historique) ; onglet Chiffrage IA masqué |

---

## 2. Monorepo & Stack

```
apps/web              Next.js 15 (App Router, --turbopack en dev) — l'application
apps/desktop          Tauri v2 Windows (webview → cantaia.io) — ATTENTION : updater.pubkey vide, csp null
apps/outlook-addin    prévu
packages/core         logique métier (~106 fichiers TS) : ai, emails, submissions, suppliers, plans, planning, calendar, agents, visits, briefing, pricing, tracking, utils
packages/database     migrations SQL 001→129 + types.ts
packages/ui           composants partagés shadcn-based
packages/config       constants, plan-features, credit-costs, tailwind, tsconfig
```

- pnpm 9.15.4 (corepack), Node ≥ 20, Turborepo. React 19, TypeScript strict.
- Supabase (Postgres + Auth + Storage + RLS), Vercel (serverless + crons), Stripe, Sentry v10.
- IA : Anthropic Claude (principal — Sonnet 4.5 `claude-sonnet-4-5-20250929` / Haiku 4.5 `claude-haiku-4-5-20251001` via `AI_MODELS`/`MODEL_FOR_TASK` dans `packages/core/src/ai/ai-utils.ts` ; couche agents sur `claude-sonnet-4-6`), OpenAI (Whisper + GPT-4o consensus estimation), Gemini 2.5 Flash (consensus).
- i18n next-intl FR/EN/DE (défaut FR), messages dans `apps/web/messages/{fr,en,de}.json` — **parité stricte des clés obligatoire** (~4 150 clés/locale).
- Compteurs : 66 pages, ~236 routes API, 182 composants.

### Commandes

```bash
pnpm dev             # turbo dev
pnpm type-check      # tsc --noEmit (seul apps/web a le script ; core est vérifié transitivement)
pnpm lint
pnpm build
```

CI GitHub Actions : type-check + lint sur push/PR main. Tests e2e Playwright dans `apps/web/e2e/` (10 specs) : tournent contre `PLAYWRIGHT_BASE_URL` (défaut prod !), skip sans état d'auth, PAS en CI. 1 test de régression pipeline dans `packages/core/src/plans/estimation/__tests__/`.

---

## 3. Modèle économique — CRÉDITS (remplace les quotas)

Source de vérité : `packages/config/credit-costs.ts` (`CREDIT_COSTS`, `CREDIT_PACKS`, `CREDIT_PLANS`, `SIGNUP_BONUS_CREDITS = 100`).

- **Inscription** : 100 crédits offerts (grant aux 2 points de création d'org : auth/callback + projects/create).
- **Packs** (one-shot, 12 mois) : 100 = 19 CHF · 500 = 79 · 1 000 = 139 · 5 000 = 590.
- **Abonnements** (org/mois, crédits inclus, report max 1 mois = cap 2× allocation) : Starter 49 → 600 · Pro 149 → 2 200 (+ agents nocturnes) · Enterprise 399 → 7 000. ~2× moins cher au crédit que les packs.
- **Consommation** (extraits) : chat 1, réponse email 2, analyse soumission 20, PV 15, rapport visite 10, analyse plan 10, estimation V2 30, extraction 3D 40, planning 10, session agent 10, classification email 0 (incluse).

Implémentation :
- Migration **090** : `credit_balances`, `credit_transactions` (ledger), RPC atomiques `consume_credits` (abo d'abord, jamais de négatif) et `grant_credits`. Le backfill des orgs existantes est un bloc **commenté** en fin de 090 (décision produit).
- `checkUsageLimit(supabase, orgId, plan, actionType?)` dans `plan-features.ts` = point d'entrée unique (21 routes) : org avec ligne `credit_balances` → crédits (`insufficient_credits` → réponse **402** via `insufficientCreditsResponse()` de `apps/web/src/lib/credits.ts`) ; org sans ligne → quotas legacy (compat pré-migration).
- API : `GET /api/credits`, `POST /api/credits/checkout` (guard `requireOrgAdmin` ; packs = Stripe mode payment, abos = mode subscription), `GET /api/credits/transactions`, super-admin `credits/` + `credits/adjust`.
- Webhook Stripe : grant des packs au `checkout.session.completed` (mode payment), grant mensuel au `invoice.payment_succeeded`, idempotence via table `stripe_events` (088).
- UI : `CreditBadge` (AppHeader), `PaywallDialog` global ouvert par `handleInsufficientCredits(res)` sur 402 (21 sites dans 12 pages), `notifyCreditsChanged()` après chaque action IA, `SubscriptionTab` (solde/packs/plans/historique). `TrialGuard`/`UsageLimitBanner` = fallback legacy si `/api/credits` indisponible.

---

## 4. Configuration

### Variables d'environnement

```
# Supabase (requis)
NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
# Microsoft Azure AD
MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_TENANT_ID / MICROSOFT_REDIRECT_URI
MICROSOFT_TOKEN_ENCRYPTION_KEY   # AES-256-GCM — REQUIS en production (refine env.ts)
OUTLOOK_WEBHOOK_SECRET           # webhook Graph — 500 explicite si absent
EMAIL_ENCRYPTION_KEY             # AES-256-CBC mots de passe IMAP
# IA
ANTHROPIC_API_KEY (requis) / OPENAI_API_KEY (Whisper + GPT-4o) / GEMINI_API_KEY
# Stripe
STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY / STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_CREDIT_100 / _500 / _1000 / _5000          # packs (one-time)
STRIPE_PRICE_SUB_STARTER / _PRO / _ENTERPRISE           # abonnements (recurring)
STRIPE_PRICE_STARTER / _PRO / _ENTERPRISE               # legacy, fallback des SUB_*
# Divers
SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN / SENTRY_ORG / SENTRY_PROJECT
NEXT_PUBLIC_APP_URL / NEXT_PUBLIC_APP_NAME=Cantaia / BASE_DOMAIN=cantaia.io
CRON_SECRET (min 16) / RESEND_API_KEY / ADMIN_SECRET_KEY
NEXT_PUBLIC_USE_MANAGED_AGENTS   # flag : bascule estimation/analyse vers le flux agents
```

### Crons Vercel (`apps/web/vercel.json` — 15 entrées)

Vercel invoque en **GET** avec `Authorization: Bearer ${CRON_SECRET}` — toutes les routes cron exportent `GET` (délègue au POST) et vérifient via `isAuthorizedCron()` (`apps/web/src/lib/cron-auth.ts`). **C2 gelé** : `aggregate-benchmarks` et `extract-patterns` retirés du planning (handlers en no-op jusqu'à ≥15 orgs opt-in) ; leurs routes existent encore.

| Path | Horaire | Rôle |
|---|---|---|
| /api/cron/aggregate-activity | 1h | agrégats user_activity_daily |
| /api/cron/refresh-intelligence | 3h30 | refresh vues matérialisées |
| /api/cron/sync-financials | 4h | financials projets |
| /api/cron/calendar-sync | 5h15 | sync calendrier Outlook planifiée |
| /api/cron/calibrate | lun 5h | model_error_profiles + vues calibration |
| /api/cron/project-memory | 5h | agent mémoire projet |
| /api/cron/followup-engine | 6h | agent relances |
| /api/cron/task-reminders | 6h15 | rappels de tâches (échéances) |
| /api/cron/briefing | 6h45 | briefings + email Resend |
| /api/cron/meeting-prep | 6h30 | agent préparation de réunion |
| /api/email/sync/cron | 7h | sync email planifiée |
| /api/cron/credits-low-alert | 8h | alerte solde de crédits bas |
| /api/cron/renew-webhooks | toutes 12h | renouvellement subscriptions Graph (sinon expiration → temps réel mail perdu) |
| /api/cron/supplier-monitor | dim 22h | agent veille fournisseurs |
| /api/cron/email-drafter | 23h | agent brouillons (toutes les boîtes de l'org, budget temps 240s) |

`project-memory` et `meeting-prep` : routes présentes mais DÉPLANIFIÉES (tool handlers non implémentés — TODO en tête de fichier).

### Middleware (`apps/web/src/middleware.ts`)

Locale routing next-intl + garde d'auth Supabase (`getUser()` serveur) sur ~21 routes protégées (dont `/calendar`) + résolution de sous-domaine (prod `hrs.cantaia.io`, dev `?org=`). Pages publiques : marketing, auth, `/planning/[token]`, `/rapports/[token]`, `/portal/[projectId]`.

---

## 5. Base de données (migrations 001 → 129)

- **Gaps de numérotation** : 008, 042, 087 n'existent pas. `apply_all_missing.sql` est OBSOLÈTE (ne couvre que 014-020) — appliquer les fichiers individuellement.
- **État prod inconnu depuis le code** : la prod a reçu des patches manuels (la migration 067 en témoigne). Vérifier sur Supabase avant de raisonner "appliqué".
- RLS : pattern org-scopé standard `organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())` + policies superadmin ; service role pour le backend. La policy UPDATE de `users` est protégée par un **trigger** (080) qui interdit de modifier `role`/`is_superadmin`/`organization_id` hors service role.

### Tables par domaine (essentiel)

- **Org/Users** : `organizations` (subscription_plan, plan_status, branding, pricing_config), `users` (rôles project_manager/site_manager/foreman/director/admin + `is_superadmin`, tokens Microsoft chiffrés, email_signature), `project_members`, `organization_invites`.
- **Projets** : `projects` (status, email_keywords/senders, financials invoiced_amount/purchase_costs, portal_*), `project_receptions`, `reception_reserves`, `closure_documents`.
- **Emails** : `email_records` (⚠️ pas `emails`), `email_connections`, `email_classification_rules`, `email_folder_rules`, `email_classification_feedback` (⚠️ réservée aux corrections HUMAINES — alimente le benchmark C2, ne jamais y écrire d'événements techniques), `email_archives`.
- **Soumissions** : `submissions`, `submission_items` (⚠️ `cfc_code` et `cfc_subcode` coexistent, miroir par trigger — migration 083), `submission_price_requests` (+ `response_received_at`/`response_time_days`/`send_error` — 082), `submission_quotes` (`supplier_remarks`, `request_id`), tables legacy `price_requests`/`supplier_offers`/`offer_line_items` (encore lues par le L0 du sync et le price-resolver tier 1).
- **Plans** : `plan_registry`, `plan_versions`, `plan_analyses` (⚠️ analyses VISION uniquement : `analysis_result`/`confidence`), **`plan_estimates` = persistance du pipeline V2** (084), `plan_scenes` + `plan_scene_corrections` + `ai_disclaimer_acceptance` (076), vue `plan_scenes_latest` (security_invoker).
- **Calibration/Intelligence** : `quantity_corrections`, `price_calibrations` (⚠️ `coefficient`/`ecart_pct` sont GENERATED — ne jamais les écrire), `bureau_profiles` (clé = hash SHA-256 du nom normalisé), `model_error_profiles` (colonne `nb_corrections`), C2 : `market_benchmarks` (`price_median`/`price_p25`/`price_p75`/`contributor_count`), `aggregation_consent` (une ligne PAR module avec `opted_in`), `aggregation_queue`.
- **Planning** : `project_plannings`, `planning_phases`, `planning_tasks`, `planning_dependencies`, `planning_shares`, `planning_duration_corrections`.
- **Calendrier/Agents** : `calendar_events` (+ `calendar_invitations`, `calendar_sync_state`), `agent_sessions`, `email_drafts` (user-scoped), `followup_items` (index unique NON partiel — 085), `supplier_alerts`, `agent_notifications`.
- **Crédits** : `credit_balances`, `credit_transactions`, `stripe_events` (088).
- **Divers** : `tasks` (colonnes `assigned_to`/`source` enum email|meeting|manual|reserve/`source_id`), `meetings` (PV), `client_visits` + `visit_photos`, `site_reports` + `site_report_entries` (colonnes plates, PAS de JSONB `data`), `site_report_shares` (org-level), `support_tickets`/`support_messages`, `api_usage_logs`, `rate_limit_hits` (079) + RPC `rate_limit_hit`.

### Buckets Storage

`plans`, `audio` (+ photos visites), `submissions` (privé, policies scopées org — 081), `support`, `chat-attachments`, `site-report-photos` (086), `email-archives`, `meeting-audio`, `organization-assets`. **Convention : servir en signed URLs** (chat, support, photos visites/portail le font) — `plans` est encore en URL publique (dette connue).

---

## 6. Carte des routes API (~236)

Auth systématique (`getUser()`) + vérification `organization_id` sur toute route touchant des données org — c'est LE pattern anti-IDOR du projet, ne jamais l'omettre, même quand `project_id` est null (403 inconditionnel). Détail : explorer par Glob, la structure suit les modules.

- `api/auth/*` : callback OAuth 5 niveaux de résolution d'org (+ RPC `migrate_user_data`), `microsoft-connect` (flow direct, tokens chiffrés via safeEncrypt).
- `api/outlook/*` + `api/email(s)/*` + `api/mail/*` : sync (pipeline 8 niveaux, rate-limité 6/h, quota sur L3), threads, dossiers, contacts (3 stratégies Graph), send (JSON ou FormData PJ), decisions, image-proxy/cid-image (allowlist SSRF).
- `api/ai/*` : classify-email, extract-tasks, generate-reply, compose-email, generate-pv, generate-alerts, executive-summary, analyze-plan, reclassify-all.
- `api/submissions/*` : CRUD, analyze (chunks, watchdog 10 min), send-price-requests (statut `sent` APRÈS succès Graph), receive-quote (org-checked), filter-items (cache + quota), estimate-budget, supplier-email, upload-url.
- `api/plans/*` + `api/scenes/*` + `api/pricing/*` : registre, estimate-v2 (lit calibrations + model weights), corrections/calibration/auto-calibrate (bouclées sur plan_estimates), scenes extract/corrections/disclaimer.
- `api/planning/*` : generate (insert avant delete), [id] (contrat PATCH : actions nommées ET payloads directs delete_task_id/add_dependency/delete_dependency_id/{phase_id,name} ; payload inconnu → 400), export-pdf, share, public/[token].
- `api/portal/[projectId]/*` : PIN (rate-limité DB, timingSafeEqual), rapports, crew, upload photo.
- `api/calendar/*` : events (overlap correct, ownership sur PATCH/DELETE), sync (skip `sensitivity` private), ai-command, intelligence, external.
- `api/agents/*` : [type]/start (quota+rate-limit) / stream (SSE, claim atomique `pending`→`running`, re-stream refusé) / result, drafts (user-scoped), followups, supplier-alerts, notifications. Tool handlers dans `stream/tool-handlers.ts` (23 handlers, org-checks inconditionnels, chemins Storage scopés org).
- `api/credits/*`, `api/stripe/*` (6 routes, guard `requireOrgAdmin`), `api/webhooks/stripe` (signé, idempotent).
- `api/admin/*` (guard `requireOrgAdmin` sauf `clients` = annuaire volontairement ouvert aux membres), `api/super-admin/*` (guard superadmin systématique).
- `api/support/*`, `api/site-reports/*` (+ share + public/[token]), `api/direction/stats`, `api/tasks/*` (défaut limit 500), `api/projects/*`, `api/visits/*`, `api/pv/*`, `api/chat/*`, `api/briefing/*`, `api/user/*`, `api/organization/*`, `api/invites`, `api/intelligence/stats`, `api/benchmarks/*`, `api/settings/consent`, `api/debug/*` (superadmin only).

---

## 7. Frontend

### Layouts
`[locale]/layout.tsx` (fonts, intl, ThemeProvider `forcedTheme="dark"`, toaster, cookies) → groupes `(marketing)`, `(auth)` (noindex), `(onboarding)` (wizard 6 étapes + reprise), `(app)` (AuthProvider, BrandingProvider, AppEmailProvider, AppActiveProjectProvider, AppHeader + CreditBadge + CreditsUIProvider, Sidebar, CommandPalette, OnboardingGuard, TrialGuard, TourOverlay), `(admin)` (check-access au mount), `(super-admin)`, `(public)` (planning/rapports tokenisés), `portal/[projectId]` (bottom nav mobile).

### Design system (hardcodé — PAS de classes sémantiques Tailwind)
Dark forcé. `bg-[#0F0F11]` (pages), `bg-[#18181B]` (cards), `bg-[#111113]` (sidebar), bordures `#27272A`, texte `#FAFAFA` (primaire)/`#A1A1AA` (secondaire) — `#71717A` INTERDIT en couleur de texte (contraste insuffisant ; toléré uniquement en `placeholder-`/`bg-`), accent orange `#F97316` (hover `#EA580C`), sémantique : vert `#10B981`, rouge `#EF4444`, ambre `#F59E0B`, bleu `#3B82F6`. Fonts : Plus Jakarta Sans (headings, `font-display`), Inter (body), JetBrains Mono. ❌ `bg-background`, `text-foreground`, `prose-invert`. Emails HTML : wrapper `bg-white text-black`.

### Composants clés par dossier (`apps/web/src/components/`)
`app/` (Sidebar — lien /admin visible admin/director seulement, AppHeader, EmailDetailPanel, DashboardOrgView) · `mail/` (AIDraftPanel — les modals du module mail sont inline dans `mail/page.tsx`) · `submissions/` (**PriceRequestV2** = compositeur de demandes de prix par packages, MonteCarloChart — l'ancien wizard et l'éditeur ont été SUPPRIMÉS) · `plans/` + `scene3d/` (SceneViewer/SceneCanvas/adapter, LowConfidenceGate → disclaimer persisté) · `planning/` (16 fichiers Gantt) · `calendar/` (datetime-utils = source de vérité timezone) · `agents/` · `credits/` (CreditBadge, PaywallDialog + `handleInsufficientCredits`, CreditsUIProvider, packs/plans/history) · `chantier/` (landing actuelle — l'ancienne `landing/` est SUPPRIMÉE) · `admin/`, `super-admin/`, `stripe/`, `support/`, `portal/`, `visits/`, `pv-chantier/`, `settings/`, `onboarding/`, `tour/`, `ui/`.

### Marketing
Pages : home (LandingChantier), `/pricing`, `/produits`, `/modules`, `/about`, `/legal/*`. SEO : generateMetadata par locale + hreflang + JSON-LD (sans fake rating). `ChantierButton` = Link locale-aware pour les href internes.

---

## 8. Conventions & pièges critiques

### Sécurité / API
- **Anti-IDOR** : toute nouvelle route = auth + org-check inconditionnel (si `project_id` null → 403, ne pas sauter le check). Recherches `email_records` toujours scopées org/user.
- **Rôles** : `requireOrgAdmin()` (`apps/web/src/lib/admin/require-org-admin.ts`, admin|director|superadmin) pour Stripe/admin/branding ; `require-superadmin.ts` pour super-admin ; whitelist `ASSIGNABLE_ROLES` pour rôles/invitations.
- **Rate limiting** : `rateLimit(key, {limit, windowSec})` de `apps/web/src/lib/rate-limit.ts` (DB via RPC 079, fallback in-memory). Clés : `sync:user:<id>` 6/h, `agents:user:<id>` 10/h, `portal-pin:*`, `waitlist:*` (waitlist supprimée mais l'util reste).
- **Crédits** : nouvelle route IA = `checkUsageLimit(admin, orgId, plan, "<action_type>")` + garde 402 `insufficientCreditsResponse` + `trackApiUsage` ; côté client `handleInsufficientCredits(res)` + `notifyCreditsChanged()`.
- **Crons** : nouveau cron = export GET+POST + `isAuthorizedCron()` + entrée vercel.json + budget temps < `maxDuration`.
- HTML externe (emails, signatures) : TOUJOURS DOMPurify (pattern de `mail/page.tsx` : `data:` limité aux images, `""` en SSR). Uploads : jamais de SVG ; filenames sanitisés `[^a-zA-Z0-9._-]`.

### Tokens Microsoft
- `getValidMicrosoftToken(userId)` retourne `{accessToken} | {error}` — **jamais une string** ; tester `!("error" in res)`.
- Scopes (connexion ET refresh, alignés) : `openid email profile offline_access Mail.Read Mail.ReadWrite Mail.Send User.Read People.Read Contacts.Read`.
- Refresh : met à jour `email_connections` ET `users`, re-lit la DB avant refresh (anti-course), ne WIPE JAMAIS en cas d'échec. Chiffrement `safeEncrypt`/`safeDecrypt` (AES-256-GCM) partout, y compris microsoft-connect.

### IA
- Import dynamique `import("@anthropic-ai/sdk")`. Modèles UNIQUEMENT via `AI_MODELS`/`MODEL_FOR_TASK` (ai-utils) — ne pas hardcoder d'ID.
- **Prompt caching** : `cache_control` UNIQUEMENT sur des préfixes stables et réutilisés (system du chat, system 2-blocs de la classification email). Jamais sur du contenu unique (surtaxe +25 %).
- **Prefill assistant INTERDIT** (supprimé partout — cassait la migration vers les modèles 4.6+/Sonnet 5). À la place : instruction « Réponds UNIQUEMENT avec le JSON » + parser tolérant `parseAIJson()` (ai-utils).
- Retry : `callAnthropicWithRetry` AVEC `maxRetries: 0` sur le client SDK (sinon double retry). `classifyAIError(err, locale)` dans les catch.
- `trackApiUsage` sur TOUT appel facturé (la table de prix du tracker couvre Haiku 4.5, Sonnet 4.5/4.6, GPT-4o, Gemini 2.5 Flash, Whisper).
- Pas de mock en production : clé absente/échec → statut `failed` + erreur explicite (mocks gated `NODE_ENV === "development"`).

### Data / Supabase
- supabase-js ne throw PAS : toujours vérifier `{error}` (un try/catch autour d'un builder ne capte rien). `.is("col", null)` pour matcher NULL (pas `.eq`). Jamais de `.catch()` sur un builder PostgREST. Colonnes hors types : `(admin as any).from(...)`. `.or()` PostgREST : sanitiser les interpolations (`sanitizeForFilter`).
- `createAdminClient()` = backend (bypass RLS — l'org-check applicatif est donc OBLIGATOIRE), `createClient()` = user-scoped. Écritures admin (rôles, membres) via routes serveur, jamais via le client browser (la RLS les rend no-op silencieux).
- Persistance destructive : insérer le nouveau AVANT de supprimer l'ancien (planning generate, replace-entries).

### Frontend
- **Timezone** : Europe/Zurich. Datetimes construits via `components/calendar/datetime-utils.ts` (`toLocalISOString` avec offset DST) ; conversions Graph via `toGraphDateTime`/`graphDateTimeToUtcIso` (core/calendar). Jamais de `toISOString().split("T")[0]` pour une date locale.
- i18n : toute chaîne UI passe par `useTranslations` ; ajouter les clés dans LES 3 locales (parité contrôlée). Erreurs de fetch : vérifier `res.ok` et afficher l'échec (jamais de faux succès), 401 → `router.replace("/login")`.
- localStorage préfixe `cantaia_`. Framer Motion : `whileInView={{ once: true }}`.

### Outillage
- Bash : guillemets doubles obligatoires autour des chemins `[locale]`/`(app)`.
- `tsconfig.tsbuildinfo` est gitignoré. Imports inutilisés = erreur de build Vercel.
- Ne jamais `git push --force` sur main ; `pnpm type-check` avant commit.

---

## 9. Opérations en attente (à jour au 24.08.2026)

1. **Supabase** : appliquer les migrations **079 → 129** individuellement (dont les critiques de sécurité 105-109 : RLS chat/site_reports/portal_crew, policies service-role, invitations admin-only). Ne PAS utiliser `apply_all_missing.sql`. Vérifier l'état réel des 001-076 (patches manuels passés).
2. **Stripe** : créer les 7 prix (4 packs one-time + 3 abos recurring) + env `STRIPE_PRICE_CREDIT_*` / `STRIPE_PRICE_SUB_*` sur Vercel.
3. **Vercel env** : `MICROSOFT_TOKEN_ENCRYPTION_KEY` (requis prod), `OUTLOOK_WEBHOOK_SECRET`, vérifier `CRON_SECRET`, `RESEND_API_KEY`, `GEMINI_API_KEY`.
4. `git push` (commits locaux `ebfb8fa` → `e374ad8`), puis vérifier dans les logs Vercel que les crons répondent 200 (ils étaient en 405 avant le fix GET).
5. **Calendrier** : demander un re-sync complet par utilisateur (purge des événements privés importés avant le filtre `sensitivity`).
6. **Crédits** : décider et décommenter le backfill des orgs existantes (fin de migration 090) pour basculer du legacy quotas aux crédits.
7. **Desktop Tauri** : générer la clé updater (`pubkey` vide = mises à jour non signées) et un CSP avant toute distribution.
8. Dette consciente : bucket `plans` en URL publique → signed URLs ; chaîne legacy L0 `price_requests` à moderniser ; e2e à brancher en CI (contre un env de préview) ; ~5 appelants secondaires affichent une erreur générique au lieu du paywall 402 (EmailDetailPanel, email-context, ProjectPlanningTab, cantaia-prix, PlanAnalysisTab) ; agents project-memory/meeting-prep à implémenter ou supprimer ; utilisateurs existants : reconnexion Microsoft pour les scopes People/Contacts.
