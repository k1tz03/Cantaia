# Cantaia — Briefing Complet du Projet

> Ce fichier est le document de référence pour Claude. Il décrit l'intégralité du projet Cantaia : architecture, stack technique, base de données, routes API, pages, composants, patterns et conventions.

---

## 1. Vue d'ensemble

**Cantaia** est un SaaS de gestion de chantier augmenté par IA, destiné aux chefs de projet construction en Suisse.

- **Nom de marque** : Cantaia (anciennement BUILDWISE, renommé le 26/02/2026)
- **Taglines** : FR "L'IA au service du chantier" / EN "AI-powered construction management" / DE "KI-gestützte Baustellenverwaltung"
- **Domaines** : cantaia.ch (principal), cantaia.com, cantaia.app
- **Multi-tenant** : subdomaines (ex: `hrs.cantaia.ch`)

### Cinq produits

| Produit | Description | Status |
|---------|-------------|--------|
| **Cantaia Soumissions** | Gestion des soumissions, appels d'offres, comparaison fournisseurs | ACTIF |
| **Cantaia Mail** | Sync Outlook en temps réel + classification IA des emails par projet | ACTIF |
| **Cantaia Prix** | Intelligence prix (chiffrage IA, import prix, analyse, historique) | ACTIF |
| **Cantaia PV** | Procès-verbaux de chantier | GREYED OUT (teaser) |
| **Plans** | Registre de plans + estimation multi-modèle | ACTIF |

### Redirect post-login : `/mail`

---

## 2. Architecture Monorepo

```
cantaia/ (racine)
├── apps/
│   ├── web/                 # Next.js 15 — application principale
│   ├── desktop/             # Electron (prévu)
│   └── outlook-addin/       # Plugin Outlook (prévu)
├── packages/
│   ├── core/                # Logique métier, IA, services (~87 fichiers TS)
│   ├── database/            # 51 migrations SQL + types TypeScript
│   ├── ui/                  # Composants React partagés (shadcn-based)
│   └── config/              # Tailwind, tsconfig, constantes
├── scripts/
│   ├── classify-emails.ts   # Script classification ad-hoc
│   ├── test-price-resolver.ts # Test résolution prix
│   └── data-ingestion/      # Scripts d'ingestion de données historiques
├── docs/
└── turbo.json               # Turborepo config
```

- **Package manager** : pnpm 9.15.4 (via corepack)
- **Node.js** : >=20.0.0
- **Build** : Turborepo 2.8.9
- **Workspaces** : `apps/*` + `packages/*`

---

## 3. Stack Technique

| Couche | Technologie |
|--------|------------|
| **Frontend** | React 19 + TypeScript |
| **Framework** | Next.js 15 (App Router) avec `--turbopack` en dev |
| **Styling** | Tailwind CSS 3.4 + shadcn/ui (Radix primitives) |
| **State** | React Context + useReducer (Zustand 5.0 disponible mais non utilisé) |
| **Animations** | Framer Motion 11.15 |
| **Charts** | Recharts 2.15 |
| **Forms** | React Hook Form 7.54 + Zod 3.24 |
| **i18n** | next-intl 3.26 (FR/EN/DE, défaut: FR) |
| **DB** | Supabase (PostgreSQL + Auth + Storage + RLS) |
| **Auth** | Supabase Auth (Microsoft OAuth, Google OAuth, Email) |
| **Backend** | Next.js API Routes (Vercel serverless) |
| **IA (principal)** | Anthropic Claude API (Sonnet 4.5) |
| **IA (vision)** | Claude Vision + GPT-4o Vision + Gemini 2.0 Flash |
| **Transcription** | OpenAI Whisper |
| **Paiements** | Stripe |
| **Monitoring** | Sentry (v10, `@sentry/nextjs`) |
| **Email** | Microsoft Graph API + Gmail API + IMAP/SMTP (via `imapflow`/`nodemailer`) |
| **Fichiers** | docx, jspdf, xlsx, papaparse, pdf-parse, file-saver |
| **Audio** | lamejs (MP3 encoding), ffmpeg-static |
| **DnD** | dnd-kit (soumissions, tâches) |
| **Déploiement** | Vercel |

### Packages workspace

| Package | Rôle | Exports principaux |
|---------|------|--------------------|
| `@cantaia/core` | Logique métier | `./ai`, `./outlook`, `./services`, `./models`, `./plans`, `./plans/estimation`, `./plans/estimation/pipeline`, `./plans/estimation/types`, `./plans/estimation/auto-calibration`, `./suppliers`, `./submissions`, `./emails`, `./pricing`, `./briefing`, `./visits`, `./tracking`, `./utils`, `./platform` |
| `@cantaia/database` | Types + migrations | `./types.ts` |
| `@cantaia/ui` | Composants partagés | `./` (StatusBadge, PriorityIndicator, LanguageSwitcher, cn), `./components/*`, `./lib/utils` |
| `@cantaia/config` | Config partagée | `./tailwind`, `./tsconfig/*`, `./constants` (APP_NAME, LOCALES, CURRENCIES, SUBSCRIPTION_PLANS, AI_MODELS, etc.) |

---

## 4. Configuration Clé

### next.config.ts
```typescript
transpilePackages: ["@cantaia/ui", "@cantaia/core", "@cantaia/database"]
serverExternalPackages: ["ffmpeg-static", "pdf-parse"]
// Security headers: X-Frame-Options DENY, HSTS (max-age=63072000 + preload), nosniff,
//   Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy camera=() microphone=(self)
// Sentry integration via withSentryConfig()
// i18n via createNextIntlPlugin("./src/i18n/request.ts")
```

### Fonts (Google Fonts)
- `Inter` (sans) → `--font-sans`
- `Playfair_Display` (heading) → `--font-heading`
- `JetBrains_Mono` (mono) → `--font-mono`
- `Plus_Jakarta_Sans` (display, weights 400-800) → `--font-display`

### PWA Manifest
```json
{ "name": "Cantaia", "display": "standalone", "theme_color": "#0A1F30", "background_color": "#F5F2EB" }
```

### i18n
```typescript
locales: ["fr", "en", "de"], defaultLocale: "fr"
// Messages: apps/web/messages/{fr,en,de}.json
// Structure: common, nav, coming_soon, products, ...
```

### Root Layout Providers (ordre top→bottom)
1. `NextIntlClientProvider` — i18n messages
2. `ThemeProvider` (next-themes) — dark/light mode
3. `Toaster` (sonner) — notifications bottom-right
4. `CookieConsent` — bannière RGPD (gate Sentry)

### App Layout Providers `(app)`
1. `AuthProvider` — session, user, signOut
2. `BrandingProvider` — couleurs, logos org
3. `AppEmailProvider` — emails, unreadCount, sync state
4. Sidebar, CommandPalette, OnboardingChecklist, OnboardingGuard

### Middleware (`middleware.ts`)
- **Locale routing** : next-intl sur toutes les routes non-API
- **Auth** : Supabase session check sur routes protégées (cookies 7 jours, `SameSite=Lax`)
- **Subdomain** : Production `hrs.cantaia.ch` → org "hrs" ; Dev `?org=hrs` ou header `x-organization-subdomain`
- **Subdomaines réservés** : www, app, api, admin, super-admin, mail, smtp, ftp, dev, staging, test, demo, help, support, docs, status, blog, cdn, static
- **Routes protégées** (31) : `/dashboard`, `/projects`, `/tasks`, `/meetings`, `/settings`, `/briefing`, `/direction`, `/admin`, `/super-admin`, `/analytics`, `/api-costs`, `/clients`, `/debug`, `/logs`, `/submissions`, `/mail`, `/pv`, `/suppliers`, `/pricing-intelligence`, `/plans`, `/visits`, `/onboarding`

### Variables d'environnement
```
# Supabase (requis)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Microsoft Azure AD
MICROSOFT_CLIENT_ID
MICROSOFT_CLIENT_SECRET
MICROSOFT_TENANT_ID
MICROSOFT_REDIRECT_URI
MICROSOFT_TOKEN_ENCRYPTION_KEY  # AES-256-GCM pour tokens at-rest

# AI
ANTHROPIC_API_KEY               # Claude (principal, requis)
OPENAI_API_KEY                  # Whisper + GPT-4o Vision
GEMINI_API_KEY                  # Gemini 2.0 Flash (estimation)

# Stripe
STRIPE_SECRET_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET

# Sentry
SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN
SENTRY_ORG
SENTRY_PROJECT

# App
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_APP_NAME=Cantaia
BASE_DOMAIN=cantaia.ch

# CRON
CRON_SECRET                     # Auth pour routes cron

# Resend
RESEND_API_KEY

# Admin
ADMIN_SECRET_KEY
```

### Vercel CRON (`vercel.json`)
```json
{ "path": "/api/email/sync/cron",            "schedule": "0 7 * * *"   }  // Daily 7h
{ "path": "/api/cron/aggregate-benchmarks",   "schedule": "0 2 * * *"   }  // Daily 2h
{ "path": "/api/cron/extract-patterns",       "schedule": "0 3 * * 0"   }  // Weekly dim 3h
```

---

## 5. Base de Données (51 migrations)

### Tables principales

#### Organisations & Utilisateurs
- **`organizations`** : name, address, city, country, subscription_plan (trial/starter/pro/enterprise), stripe_customer_id, trial_ends_at, max_users, max_projects, logo_url, primary_color, branding_enabled, pricing_config (JSONB)
- **`users`** : id (FK auth.users), organization_id, email, first_name, last_name, role (project_manager/site_manager/foreman/director/admin/superadmin), avatar_url, phone, preferred_language (fr/en/de), microsoft_access_token, microsoft_refresh_token, microsoft_token_expires_at, outlook_sync_enabled, is_superadmin, onboarding_completed, job_title, age_range, gender
- **`project_members`** : project_id, user_id, role

#### Projets
- **`projects`** : name, code, description, client_name, address, city, status (planning/active/paused/on_hold/closing/completed/archived), email_keywords[], email_senders[], start_date, end_date, budget_total, color, archived_at

#### Emails
- **`email_records`** : user_id, project_id, outlook_message_id, subject, sender_email, sender_name, recipients[], received_at, body_preview, body_text, body_html, has_attachments, classification (action_required/info_only/urgent/waiting_response/archived), ai_classification_confidence, ai_summary, is_processed, classification_status, email_category, suggested_project_data (JSONB), ai_reasoning, price_extracted
- **`email_connections`** : user_id, organization_id, provider (microsoft/google/imap), oauth_access_token, oauth_refresh_token, oauth_token_expires_at, email_address, display_name, status, last_sync_at, sync_delta_link, total_emails_synced
- **`email_classification_rules`** : rule_type, rule_value, project_id, classification, confidence_boost

#### Plans
- **`plan_registry`** : project_id, plan_number, plan_title, plan_type, discipline, lot_id, cfc_code, zone, scale, format, author_company, status, is_current_version, tags (JSONB)
- **`plan_versions`** : plan_id, version_code, version_number, file_url, file_name, file_size, file_type, source_email_id, ai_detected, ai_confidence, validation_status
- **`plan_analyses`** : plan_id, plan_version_id, model_used, analysis_result (JSONB: plan_type, title_block, legend_items[], quantities[]), confidence, status
- **`plan_estimates`** : plan_id, plan_analysis_id, config (JSONB), estimate_result (JSONB), subtotal, grand_total, confidence_summary

#### Tâches
- **`tasks`** : project_id, created_by, assigned_to, title, description, status (todo/in_progress/waiting/done/cancelled), priority (low/medium/high/urgent), source (email/meeting/manual/reserve), due_date, lot_code, comments (JSONB), history (JSONB), attachments (JSONB)

#### Réunions & PV
- **`meetings`** : project_id, title, meeting_number, meeting_date, location, status, audio_url, transcription_raw, pv_content (JSONB), participants (JSONB), sent_to[], sent_at
- **`daily_briefings`** : user_id, briefing_date, content (JSONB)

#### Soumissions & Prix
- **`suppliers`** : company_name, contact_name, email, phone, specialties (JSONB), cfc_codes (JSONB), response_rate, reliability_score, overall_score, supplier_type (fournisseur/prestataire)
- **`submissions`** : project_id, title, reference, status (draft/sent/responses/comparing/awarded/completed), deadline
- **`submission_lots`** → **`submission_chapters`** → **`submission_items`** : hiérarchie lot > chapitre > poste
- **`price_requests`** : submission_id, supplier_id, tracking_code, portal_token, status
- **`supplier_offers`** → **`offer_line_items`** : offres fournisseurs avec prix unitaires, comparaison

#### Clôture de projet
- **`project_receptions`** : reception_type (provisional/final/partial), reception_date, guarantee_2y_end, guarantee_5y_end
- **`reception_reserves`** : description, location, severity (minor/major/blocking), status, deadline
- **`closure_documents`** : document_type, document_url

#### Administration
- **`admin_activity_logs`** : action, metadata, ip_address
- **`admin_daily_metrics`** : total_users, active_users_today, emails_synced, api_cost_chf, revenue_chf
- **`admin_config`** : key-value store
- **`api_usage_logs`** : action_type, api_provider, model, tokens, estimated_cost_chf
- **`usage_events`** : event_type, metadata

### Data Intelligence (3 couches C1/C2/C3)

#### C1 — Données privées (par organisation)
- **`aggregation_consent`** : opt-in par module (prix, fournisseurs, plans, pv, visites, chat, mail, taches, briefing)
- **`email_classification_feedback`** : corrections de classification
- **`email_response_templates`** : templates de réponse par type
- **`submission_corrections`**, **`plan_analysis_corrections`**, **`pv_corrections`**, **`visit_report_corrections`** : corrections humaines
- **`chat_feedback`** : rating up/down sur messages IA
- **`supplier_preferences`** : preferred/blacklisted/neutral
- **`estimate_accuracy_log`** : écart estimation vs réel
- **`task_status_log`** : historique changements de statut

#### C2 — Benchmarks agrégés (anonymes, multi-org, min 3 contributeurs)
- **`normalization_rules`** : 20 items CFC suisses de base (béton armé, coffrage, etc.)
- **`aggregation_queue`** : file d'attente pour agrégation (triggers sur tables C1)
- **`market_benchmarks`** : prix par CFC/region/trimestre (median, p25, p75, tendance)
- **`regional_price_index`** : indice régional (panier de 50 items CFC)
- **`supplier_market_scores`** : scores anonymisés par discipline/région
- **`project_benchmarks`**, **`task_benchmarks`**, **`pv_quality_benchmarks`**, **`visit_report_benchmarks`**, **`email_benchmarks`**, **`chat_analytics`**

#### C3 — Patterns IA
- **`ai_quality_metrics`** : métriques par provider/modèle
- **`prompt_optimization_log`** : historique optimisation prompts
- **`pattern_library`** : bibliothèque de patterns extraits

### Calibration (Migration 043)
- **`quantity_corrections`** : correction de quantité estimée vs réelle, avec discipline, bureau, échelle, qualité image
- **`price_calibrations`** : prix estimé vs prix réel, coefficient de correction
- **`bureau_profiles`** : conventions et erreurs fréquentes par bureau d'architecte
- **`model_error_profiles`** (C2) : écart moyen par modèle IA / discipline / type CFC
- **`cross_plan_verifications`** : cohérence inter-disciplines
- **Vues matérialisées** : `mv_correction_trends`, `mv_price_calibration_accuracy`

### Ingestion (Migrations 045-047)
- **`ingested_offer_lines`** : lignes de prix historiques importées
- **`ingested_plan_quantities`** : quantités historiques importées
- **Vue matérialisée** `mv_reference_prices` : agrégation des prix ingérés

### Migrations récentes (048-051)
- **048** : `onboarding_completed` tracking
- **049** : `submissions` enhanced fields
- **050** : submission tracking fields
- **051** : manual supplier addition to submissions

### RLS (Row Level Security)
- Pattern standard : `organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())`
- Superadmin : accès total
- User-scoped : `user_id = auth.uid()` (emails, briefings, préférences)
- C2 benchmarks : pas de filtre org_id (données publiques anonymisées)
- Service role : bypass RLS pour cron/backend

---

## 6. Routes API (~135 endpoints)

### Auth
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/auth/callback` | GET | OAuth callback — 5 niveaux de résolution d'org, stockage tokens, migration utilisateur, redirect vers onboarding si premier login |

### Email Sync & Classification
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/outlook/sync` | POST | Sync multi-provider → classification 7 niveaux (L0 tracking code, L1 règles locales, L2 spam, L2b keywords, L3 Claude AI) → détection plans → extraction tâches |
| `/api/outlook/webhook` | POST/PUT | Webhook Microsoft Graph (notifications temps réel) |
| `/api/outlook/email-body` | GET | Corps complet email via Graph |
| `/api/outlook/attachments` | GET | Liste pièces jointes |
| `/api/outlook/attachments/download` | GET | Télécharger PJ |
| `/api/outlook/send-reply` | POST | Envoyer réponse email |
| `/api/outlook/folders` | GET | Dossiers Outlook |
| `/api/outlook/move-email` | POST | Déplacer email |
| `/api/outlook/archive` | POST | Archiver email |
| `/api/email/sync/cron` | POST | Sync cron planifié |
| `/api/email/folders` | GET/POST | Dossiers email / créer dossier |
| `/api/email/thread` | GET | Thread email |
| `/api/email/send` | POST | Envoyer email |

### Email (Legacy + Extensions)
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/emails/inbox` | GET | Boîte de réception (pagination) |
| `/api/emails/confirm-classification` | POST | Confirmer/corriger classification |
| `/api/emails/create-project-from-email` | POST | Créer projet depuis email |
| `/api/emails/save-connection` | POST/DELETE | Sauver/supprimer connexion email |
| `/api/emails/get-connection` | GET | Statut connexion |
| `/api/emails/test-connection` | POST | Tester connexion |
| `/api/emails/preferences` | GET/POST | Préférences email (auto-dismiss, archivage) |
| `/api/emails/archive` | POST | Archiver emails |
| `/api/emails/archive-download` | GET | Télécharger archive emails |
| `/api/emails/update` | POST | Mettre à jour email record |
| `/api/email/search` | GET | Rechercher emails avec filtres |
| `/api/email/classify` | POST | Classifier email |
| `/api/email/learn` | POST | Apprendre de classification |
| `/api/email/[id]/move` | POST | Déplacer email |
| `/api/email/[id]/snooze` | PATCH | Snooze email |
| `/api/email/[id]/archive` | POST | Archiver email |
| `/api/email/[id]/process` | PATCH | Marquer email traité |

### IA
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/ai/classify-email` | POST | Classification IA (Claude, pipeline 3 niveaux) |
| `/api/ai/extract-tasks` | POST | Extraction tâches (corps complet via Graph) |
| `/api/ai/generate-reply` | POST | Réponse IA |
| `/api/ai/generate-pv` | POST | Génération PV (Claude Sonnet 4.5) |
| `/api/ai/generate-briefing` | POST | Briefing quotidien |
| `/api/ai/analyze-plan` | POST | Analyse plan (Claude Vision) |
| `/api/ai/analyze-plan/[analysisId]` | PATCH | Corriger quantités analyse |
| `/api/ai/reclassify-all` | POST | Reclassifier tous les emails (batch, concurrency=5) |

### Plans & Estimation
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/plans` | GET | Liste plans (pagination, filtres project_id/source_email_id) |
| `/api/plans/[id]` | GET/PATCH | Détail plan + versions / Mettre à jour plan |
| `/api/plans/upload` | POST | Upload plan |
| `/api/plans/rescan` | POST | Re-scanner plan |
| `/api/plans/estimate-v2` | POST | Pipeline estimation 4 passes multi-modèle |
| `/api/plans/corrections` | POST | Correction quantité (calibration) |
| `/api/plans/calibration` | POST | Prix réel (calibration) |
| `/api/plans/auto-calibrate` | POST | Auto-calibration depuis offre attribuée |

### Projets
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/projects/list` | GET | Liste projets (enrichis: task/email counts, next meeting) |
| `/api/projects/create` | POST | Créer projet (auto-création org si besoin) |
| `/api/projects/[id]` | GET/PUT/DELETE | Détail projet |
| `/api/projects/[id]/emails` | GET | Tous les emails du projet (select *) |
| `/api/projects/closure/generate-pv` | POST | PV de clôture |
| `/api/projects/archive-settings` | POST | Config archivage |

### Tâches
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/tasks` | GET/POST | Liste/créer tâches |
| `/api/tasks/[id]` | GET/PUT/PATCH/DELETE | Détail tâche |
| `/api/tasks/by-email` | GET | Tâches liées à un email |

### Soumissions
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/submissions` | GET/POST | Liste/créer soumissions |
| `/api/submissions/[id]` | GET/DELETE | Détail/supprimer soumission |
| `/api/submissions/extract` | POST | Extraire données soumission |
| `/api/submissions/extract-prices` | POST | Extraire prix soumission |
| `/api/submissions/send-price-request` | POST | Envoyer demande de prix |
| `/api/submissions/[id]/send-price-requests` | POST | Envoyer demandes à plusieurs fournisseurs |
| `/api/submissions/[id]/compare` | GET | Comparer prix fournisseurs |
| `/api/submissions/[id]/analyze` | POST | Analyse IA soumission |
| `/api/submissions/[id]/preview-email` | GET | Prévisualiser email demande de prix |
| `/api/submissions/[id]/price-alerts` | GET | Alertes prix soumission |
| `/api/submissions/[id]/relance` | POST | Envoyer relance fournisseur |
| `/api/submissions/export` | POST | Exporter soumission |
| `/api/submissions/receive-quote` | POST | Webhook réception devis fournisseur |

### Prix
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/pricing/config` | GET/PUT | Config tarification org |
| `/api/pricing/benchmark` | GET | Benchmark interne org |
| `/api/pricing/estimate-from-plan` | POST | Estimer depuis plan |
| `/api/pricing/estimates` | GET/POST | Liste/créer estimations |
| `/api/pricing/estimates/[id]` | GET | Détail estimation |
| `/api/pricing/extract-from-files` | POST | Extraction prix fichiers (.msg/.eml/.pdf/.txt) |
| `/api/pricing/extract-from-files/import` | POST | Importer prix extraits |
| `/api/pricing/extract-from-emails` | POST | Extraction prix emails |
| `/api/pricing/extract-from-emails/process` | POST | Traiter extraction |
| `/api/pricing/extract-from-emails/import` | POST | Importer |
| `/api/pricing/extract-from-emails/status` | GET | Statut extraction |
| `/api/pricing-alerts` | GET/PATCH | Alertes prix |

### Fournisseurs
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/suppliers` | GET/POST | Liste/créer fournisseurs |
| `/api/suppliers/[id]` | GET/PATCH/DELETE | Détail fournisseur |
| `/api/suppliers/[id]/prices` | GET | Offres + lignes prix |
| `/api/suppliers/[id]/enrich` | POST | Enrichissement IA |
| `/api/suppliers/search` | POST | Recherche fournisseurs (IA) |
| `/api/suppliers/import` | POST | Import bulk |

### PV & Réunions
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/pv` | GET/POST | Liste/créer PV |
| `/api/pv/[id]` | GET/PUT/DELETE | Détail PV |
| `/api/pv/[id]/finalize` | POST | Finaliser PV |
| `/api/pv/[id]/export-pdf` | GET | Export PDF |
| `/api/pv/transcribe` | POST | Transcrire audio (Whisper) |
| `/api/meetings/export` | POST | Export réunion |

### Visites
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/visits/transcribe` | POST | Transcrire audio visite |
| `/api/visits/generate-report` | POST | Générer rapport |
| `/api/visits/export-report` | POST | Exporter rapport |

### Chat IA
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/chat` | POST | Message chat (SSE streaming, Claude) |
| `/api/chat/conversations` | GET/POST | Conversations |
| `/api/chat/conversations/[id]` | GET/PATCH/DELETE | Détail conversation |

### Briefing
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/briefing/today` | GET | Briefing du jour |
| `/api/briefing/generate` | POST | Générer briefing |

### Benchmarks & Data Intelligence
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/benchmarks/market` | GET | Prix marché C2 (requiert opt-in 'prix') |
| `/api/benchmarks/suppliers` | GET | Scores fournisseurs C2 (requiert opt-in) |
| `/api/benchmarks/projects` | GET | Benchmarks projets C2 |
| `/api/benchmarks/normalization` | GET | Règles de normalisation CFC |
| `/api/settings/consent` | GET/POST | Consentement partage données par module |

### CRON (requiert CRON_SECRET)
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/cron/aggregate-benchmarks` | POST | Agrégation C2 (9 fonctions RPC) |
| `/api/cron/extract-patterns` | POST | Extraction patterns C3 hebdomadaire |
| `/api/cron/calibrate` | POST | Rafraîchissement calibration (vues matérialisées + model error profiles) |

### Admin & Super-Admin
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/admin/clients` | GET | Liste membres organisation |
| `/api/admin/compute-daily-metrics` | GET/POST | Métriques quotidiennes |
| `/api/admin/logs` | GET | Logs d'activité organisation |
| `/api/admin/usage-stats` | GET | Stats utilisation API |
| `/api/super-admin` | GET/POST | Vue d'ensemble super-admin + config updates |
| `/api/super-admin/sentry-errors` | GET | Erreurs Sentry |
| `/api/super-admin/data-intelligence` | GET/POST | Métriques data intelligence |

### Utilisateur & Organisation
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/user/profile` | GET/POST | Profil utilisateur |
| `/api/user/onboarding` | GET/PATCH | Statut onboarding |
| `/api/organization/branding` | GET/POST | Branding organisation |
| `/api/organization/upload-logo` | POST | Upload logo |
| `/api/invites` | GET/POST | Invitations utilisateur |

### Webhooks
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/webhooks/stripe` | POST | Stripe (checkout.completed, subscription.updated/deleted, invoice.payment_failed) |
| `/api/transcription/process` | POST | Traitement transcription |

### Mail (Module Décisions)
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/mail/decisions` | GET/PATCH | Décisions : urgent/thisWeek/info buckets, stats, orgMembers |
| `/api/mail/emails/[id]/thread` | GET | Thread complet via Graph conversationId (50 msgs max, backfill on-demand) |
| `/api/mail/backfill-bodies` | POST | Backfill corps emails depuis Graph (20 par appel) |
| `/api/mail/generate-summaries` | POST | Résumés IA via Claude (10 par appel) |

### Debug
| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/debug/classification` | GET/POST | Debug classification |
| `/api/debug/supabase-test` | GET | Test Supabase |
| `/api/debug/microsoft-status` | GET | Statut OAuth Microsoft |
| `/api/debug/org-merge` | GET/POST | Merge organisations |

---

## 7. Pages & Routing (~84 pages)

Structure : `apps/web/src/app/[locale]/(group)/path/page.tsx`

### Marketing `(marketing)`
- `/` — Homepage (landing)
- `/pricing` — Tarification
- `/about` — À propos
- `/legal/cgv` — CGV
- `/legal/mentions` — Mentions légales
- `/legal/privacy` — Politique de confidentialité

### Auth `(auth)`
- `/login` — Connexion (email/password, Microsoft OAuth, Google OAuth)
- `/register` — Inscription
- `/forgot-password` — Mot de passe oublié
- `/reset-password` — Réinitialisation

### Onboarding `(onboarding)`
- `/onboarding` — Wizard 3 étapes (premier login)

### App `(app)` — Protégé (~50 pages)
- `/dashboard` — Tableau de bord principal (KPIs, stats)
- `/mail` — Module Cantaia Mail (vue décisions : urgent/thisWeek/info, thread Graph, délégation, transfert, sync Outlook)
- `/projects` — Liste projets
  - `/projects/[id]` — Détail projet (onglets: Overview, Emails, Plans, Prix, Submissions, Tasks, Meetings, Visits, Closure, Settings)
  - `/projects/[id]/settings` — Paramètres projet
  - `/projects/[id]/closure` — Workflow clôture
  - `/projects/[id]/closure/reception` — Document de réception (provisoire/définitive/partielle)
  - `/projects/[id]/closure/upload-signed` — Upload documents signés
  - `/projects/[id]/reserves` — Réserves clôture (défauts, délais, sévérité)
  - `/projects/new` — Nouveau projet
- `/plans` — Registre de plans
  - `/plans/[id]` — Détail plan (onglets: Info, Versions, Analysis, Estimation — pipeline 4 passes, confiance, calibration)
  - `/plans/upload` — Upload plan
- `/cantaia-prix` — Intelligence prix (4 onglets: Chiffrage IA, Import prix, Analyse prix, Historique)
- `/submissions` — Soumissions
  - `/submissions/[id]` — Détail soumission (lots > chapitres > postes, comparaison, tracking)
  - `/submissions/new` — Nouvelle soumission
- `/suppliers` — Fournisseurs (CFC codes, scores, spécialités, historique prix)
- `/tasks` — Tâches (vues Kanban + liste, filtres status/priority/assignee)
- `/meetings` — Réunions
  - `/meetings/[id]` — Détail réunion
  - `/meetings/[id]/edit` — Éditer réunion
  - `/meetings/[id]/record` — Enregistrer réunion (audio)
  - `/meetings/new` — Nouvelle réunion
- `/pv-chantier` — PV de chantier
  - `/pv-chantier/[id]` — Détail PV
  - `/pv-chantier/nouveau` — Nouveau PV
- `/pv` — Page PV legacy (placeholder/teaser)
- `/visits` — Visites de chantier
  - `/visits/[id]` — Détail visite (audio, transcription, rapport IA)
  - `/visits/new` — Nouvelle visite
- `/briefing` — Briefing quotidien (résumé IA)
- `/direction` — Vue direction/stratégie (métriques, santé projets)
- `/chat` — Chat IA (conversations Claude avec contexte projet)
- `/pricing-intelligence` — Analytique prix
- `/settings` — Paramètres (onglets: Profil, Préférences email, Classification, Partage données, Intégrations, Abonnement)

### Admin `(admin)` — Org Admin (~14 pages)
- `/admin` — Vue d'ensemble admin (métriques org, users, API usage)
- `/admin/members` — Membres équipe (inviter, supprimer, rôles)
- `/admin/branding` — Branding organisation (logo, couleurs, domaine)
- `/admin/finances` — Facturation (Stripe)
- `/admin/alerts` — Configuration alertes
- `/admin/logs` — Logs audit
- `/admin/users` — Gestion utilisateurs
- `/admin/settings` — Paramètres admin
- `/admin/time-savings` — Métriques gains de temps (productivité IA)
- `/admin/organizations/[id]` — Détail organisation
- `/analytics` — Dashboard analytics
- `/api-costs` — Coûts API
- `/branding` — Gestion branding
- `/clients` — Clients / projets overview
- `/debug` — Page debug (diagnostics)

### Super-Admin `(super-admin)` — Superadmin uniquement (9 pages)
- `/super-admin` — Dashboard (métriques globales, orgs, Sentry errors, revenue)
- `/super-admin/organizations` — Toutes les orgs
  - `/super-admin/organizations/[id]` — Détail org (membres, subscription, métriques)
  - `/super-admin/organizations/create` — Créer org
- `/super-admin/users` — Tous les utilisateurs
- `/super-admin/billing` — Facturation globale (Stripe, revenue, analytics)
- `/super-admin/metrics` — Métriques plateforme (API usage, DAU, coûts)
- `/super-admin/data-intelligence` — Dashboard data intel (C2 benchmarks, C3 patterns, agrégation)
- `/super-admin/config` — Config globale (feature flags, API keys)

### Layouts (7)
1. `[locale]/layout.tsx` — Root (fonts, intl, theme, toaster, cookies)
2. `(marketing)/layout.tsx` — MarketingHeader + MarketingFooter
3. `(auth)/layout.tsx` — Formulaire centré, grille subtile
4. `(onboarding)/layout.tsx` — AuthProvider, fond slate-50
5. `(app)/layout.tsx` — AuthProvider, BrandingProvider, AppEmailProvider, Sidebar, CommandPalette, OnboardingGuard
6. `(admin)/layout.tsx` — Sidebar admin collapsible
7. `(super-admin)/layout.tsx` — Sidebar dark (amber accents), vérification accès async

---

## 8. Composants Clés

### `apps/web/src/components/` (23 dossiers, 123 fichiers)

#### App Core (`app/`, 5 fichiers)
- `Sidebar.tsx` — Navigation latérale principale (collapsible, groupes projets, liens produits)
- `EmailDetailPanel.tsx` — Détail email complet (corps, PJ, réponse IA, tâches, classification)
- `OnboardingGuard.tsx` / `OnboardingChecklist.tsx` — Onboarding
- `ComingSoonProduct.tsx` — Page teaser produit (Cantaia PV)

#### Auth (`auth/`, 5 fichiers)
- `AuthCard.tsx`, `LoginForm.tsx`, `RegisterForm.tsx`, `MicrosoftButton.tsx`, `GoogleButton.tsx`

#### Mail (`mail/`, 2 fichiers)
- `EmailProcessingActions.tsx` — Actions: reply, forward, snooze, archive, mark done, extract tasks
- `EmailThreadView.tsx` — Vue thread email avec historique réponses
- Note : Le module mail principal (`/mail/page.tsx`) embarque ses propres composants inline (ReplyModal, DelegateModal, TransferModal, EmailCard, ThreadPanel)

#### Plans (`plans/`, 15 fichiers)
- `EstimationResultV2.tsx` — Résultats pipeline 4 passes (accordéon CFC, badges source, fourchettes, alertes)
- `QuantityCorrectionModal.tsx` — Modal correction quantité (calibration)
- `PriceCalibrationModal.tsx` — Modal prix réel (calibration)
- `ConfidenceEvolution.tsx` — Graphique recharts évolution confiance
- `PlanViewer.tsx` — Viewer PDF/image plans
- `PlanDetailHeader.tsx`, `PlanDetailTabs.tsx`, `PlanInfoTab.tsx`, `PlanVersionsTab.tsx`
- `PlanAnalysisTab.tsx`, `PlanEstimationTab.tsx`
- `PlanAlertsBanner.tsx`, `PlanReferenceAlert.tsx`, `PlanDistributeModal.tsx`
- `plan-detail-types.ts` — Types TypeScript

#### Projects (`projects/`, 10 fichiers — onglets)
- `ProjectOverviewTab.tsx`, `ProjectEmailsTab.tsx`, `ProjectPlansTab.tsx`, `ProjectPrixTab.tsx`, `ProjectSubmissionsTab.tsx`, `ProjectTasksTab.tsx`, `ProjectMeetingsTab.tsx`, `ProjectVisitsTab.tsx`, `ProjectClosureTab.tsx`, `ArchiveSettingsTab.tsx`

#### Cantaia Prix (`cantaia-prix/`, 10 fichiers)
- `EstimateTab.tsx` — Chiffrage IA
- `ImportTab.tsx` — Import prix (drag & drop bulk)
- `AnalysisTab.tsx` — Analyse prix benchmark
- `HistoryTab.tsx` — Historique
- `EstimateConfigSection.tsx`, `EstimateResultsSection.tsx`, `PlanSelectionSection.tsx`
- `ExtractionReviewList.tsx` — Review/import prix extraits
- `types.ts`, `index.ts`

#### Submissions (`submissions/`, 19 fichiers)
- `SubmissionEditor.tsx` — Éditeur principal (lot/chapitre/position)
- `SubmissionsList.tsx` — Liste avec filtres et recherche
- `PositionsTable.tsx` — Table postes (chapitres > positions)
- `EditableCell.tsx`, `SortableRow.tsx` (dnd-kit)
- `SubmissionStatusBadge.tsx`
- **Detail** (`detail/`, 11 fichiers) : `ComparisonTab.tsx`, `SuppliersTab.tsx`, `ItemsTab.tsx`, `TrackingTab.tsx`, `DocumentsTab.tsx`, `IntelligenceTab.tsx`, `NegotiationTab.tsx`, `SendPriceRequestModal.tsx`, `SubmissionDetailHeader.tsx`, `shared.ts`, `index.ts`

#### Tasks (`tasks/`, 9 fichiers)
- `TaskKanbanView.tsx` — Kanban 5 colonnes (todo, in_progress, waiting, done, cancelled)
- `TaskListView.tsx` — Vue liste avec tri
- `TaskCreateModal.tsx`, `TaskDetailPanel.tsx`, `TaskFilters.tsx`
- `TaskPageHeader.tsx`, `TaskCounters.tsx`, `TaskBulkActions.tsx`
- `task-utils.ts` — isOverdue, PRIORITY_CONFIG, KANBAN_COLUMNS

#### PV Chantier (`pv-chantier/`, 8 fichiers)
- `PVHeaderEditor.tsx`, `PVSectionEditor.tsx`, `PVSummaryEditor.tsx`
- `PVTopBar.tsx`, `PVSidePanel.tsx`, `PVConfirmDialog.tsx`
- `types.ts`, `usePVContent.ts` (hook state management)

#### Settings (`settings/`, 8 fichiers)
- `ProfileForm.tsx`, `EmailPreferencesTab.tsx`, `ClassificationSettingsTab.tsx`
- `DataSharingTab.tsx` — Opt-in par module (consentement C1)
- `IntegrationsTab.tsx` — Connexions Microsoft/Google/IMAP
- `SubscriptionTab.tsx` — Abonnement Stripe
- `OrganisationTab.tsx`, `SaveButton.tsx`

#### Suppliers (`suppliers/`, 3 fichiers)
- `AISearchDialog.tsx` — Recherche IA fournisseurs
- `SupplierFormDialog.tsx` — Formulaire créer/éditer
- `SupplierImportDialog.tsx` — Import bulk CSV

#### Emails (`emails/`, 2 fichiers)
- `ClassificationSuggestions.tsx` — Dropdown suggestions classification
- `CreateProjectFromEmailModal.tsx` — Modal créer projet depuis email

#### Providers (`providers/`, 4 fichiers)
- `AuthProvider.tsx`, `BrandingProvider.tsx`, `AppEmailProvider.tsx`, `OrganizationProvider.tsx`

#### Landing (`landing/`, 12 fichiers)
- `HeroSection.tsx`, `FeaturesSection.tsx`, `PricingSection.tsx`, `FAQSection.tsx`
- `HowItWorksSection.tsx`, `ProblemSection.tsx`, `ProofSection.tsx`
- `BentoGrid.tsx`, `SpotlightSection.tsx`, `FinalCTASection.tsx`, `AnimatedSection.tsx`
- `index.ts`

#### Marketing (`marketing/`, 2 fichiers)
- `Header.tsx`, `Footer.tsx`

#### UI partagé (`ui/`, 4 fichiers)
- `Breadcrumb.tsx`, `CommandPalette.tsx` (Cmd/Ctrl+K), `ConfirmDialog.tsx`, `EmptyState.tsx`

#### Autres
- `briefing/BriefingPanel.tsx` — Panel briefing quotidien
- `closure/GuaranteeAlerts.tsx` — Alertes garanties (2 ans, 5 ans)
- `visits/AudioRecorder.tsx` — Enregistrement audio (micro, upload Whisper)
- `CookieConsent.tsx` — Bannière RGPD, gate Sentry
- `ThemeProvider.tsx` — Dark/light mode

---

## 9. Modules Core (`packages/core/src/`, ~87 fichiers)

### AI (`ai/`, 8 fichiers)
- `prompts.ts` — Tous les prompts centralisés (classification, extraction tâches, réponse, analyse plan, briefing, PV)
- `email-classifier.ts` — Pipeline 3 niveaux (L1 règles locales → L2 spam/keywords → L3 Claude)
- `ai-utils.ts` — `callAnthropicWithRetry()`, `cleanEmailForAI()`, `createAnthropicClient()`, `classifyAIError()`, `isRetryableAIError()`, `AI_MODELS`, `MODEL_FOR_TASK`
- `task-extractor.ts` — Extraction tâches depuis corps email
- `reply-generator.ts` — Suggestions réponse IA
- `plan-analyzer.ts` — Analyse plans (Claude Vision)
- `chat-service.ts` — Chat conversationnel (Claude Sonnet 4.5)
- **Modèle principal** : `claude-sonnet-4-5-20250929`
- **Import dynamique** : `import("@anthropic-ai/sdk")` pour éviter bundling client

### Plans (`plans/`, 4 fichiers racine + 14 estimation)
- `plan-detector.ts` — `detectPlansInEmail()`, `isPotentialPlan()`, `emailSuggestsPlans()`
- `version-checker.ts` — `checkPlanReferences()`, `extractPlanReferences()`
- `plan-storage.ts` — `savePlanFromAttachment()` (Graph download → Storage upload → DB)

#### Estimation (`plans/estimation/`, 14 fichiers)
Pipeline 4 passes multi-modèle :
1. **Passe 1 (Identification)** : Cartouche, discipline, type, qualité image → Claude Vision
2. **Passe 2 (Métré)** : Quantités par CFC, consensus 3 modèles (Claude + GPT-4o + Gemini) en parallèle
3. **Passe 3 (Vérification)** : Ratios, cohérence, doublons → Claude
4. **Passe 4 (Chiffrage)** : Prix avec fourchettes (min/médiane/max), coefficients régionaux → Claude

- `types.ts`, `pipeline.ts`, `prompts.ts`, `ai-clients.ts`
- `consensus-engine.ts` — 5 niveaux (concordance_forte, partielle, divergence, detection_unique, detection_double)
- `price-resolver.ts` — 6 tiers avec matching par mots-clés (historique_interne → données ingérées → fallback textuel → benchmark_cantaia → referentiel_crb → prix_non_disponible)
- `confidence-calculator.ts`, `dynamic-confidence.ts` — Score plafonné 0.95, bonus corrections (+0.25 qty, +0.30 prix, +0.10 bureau, +0.10 cross-plan)
- `calibration-engine.ts`, `cross-plan-verification.ts`, `auto-calibration.ts`
- `reference-data/cfc-prices.ts` — 55+ prix CFC (CRB 2025)
- `reference-data/regional-coefficients.ts` — 25 coefficients régionaux, 9 ratios types bâtiment

### Emails (`emails/`, 10 fichiers)
#### Providers (`emails/providers/`, 5 fichiers)
- Factory : `getEmailProvider("microsoft"|"google"|"imap")`
- `microsoft-provider.ts` — OAuth + Microsoft Graph API + delta sync
- `gmail-provider.ts` — Gmail API
- `imap-provider.ts` — IMAP/SMTP générique (chiffrement mot de passe)
- `email-provider.interface.ts` — Interface de base

#### Root level
- `classification-learning.ts` — `learnFromClassificationAction()`, `checkLocalRules()`
- `spam-detector.ts` — `detectSpamNewsletter()`
- `email-archiver.ts` — `determineArchivePath()`, `getDefaultFolderTree()`, `buildArchiveFolderPrompt()`
- **Classification** : `classifyEmailByKeywords()` (score >= 8 + nameMatch requis, penalty premier segment -15)
- **Détection plans** : `isPotentialPlan()` pre-filtre, `detectPlansInEmail()`, `savePlanFromAttachment()`

### Pricing (`pricing/`, 6 fichiers)
- `email-price-extractor.ts` — `isPriceResponseEmail()`, `extractPricesFromEmailBody()`, `extractPricesFromPdf()`
- `file-price-extractor.ts` — Extraction depuis .msg/.eml/.pdf/.txt
- `batch-price-processor.ts` — Traitement batch avec progression
- `price-import-service.ts` — `importExtractedPrices()` vers DB
- `auto-estimator.ts` — `estimateFromPlanAnalysis()`, `normalizeDescription()`
- `.msg` parsing via `@kenjiuno/msgreader`

### Submissions (`submissions/`, 9 fichiers)
- `submission-parser.ts` — `buildSubmissionParsePrompt()`, `mockParseSubmission()`
- `supplier-matcher.ts` — `matchSuppliersToLot()`, `matchSuppliersToAllLots()`
- `price-request-generator.ts` — `generatePriceRequestEmail()`, `generateReminderEmail()`
- `tracking-code.ts` — `generateTrackingCode()`, `extractTrackingCode()`, `validateAndResolvePriceRequest()`
- `price-response-detector.ts` — `detectPriceResponse()`
- `price-extractor.ts` — `extractPricesFromEmail()`
- `price-comparator.ts` — `comparePrices()`
- `alert-generator.ts` — `generatePricingAlerts()`

### Suppliers (`suppliers/`, 5 fichiers)
- `supplier-service.ts` — `calculateSupplierScore()`, `filterSuppliers()`, `SUPPLIER_SPECIALTIES`, `GEO_ZONES`
- `supplier-search.ts` — `searchSuppliersAI()`
- `supplier-enricher.ts` — Enrichissement IA (cache_control pour prompt caching)
- `supplier-stats-updater.ts` — `updateSupplierStatsAfterOffer()`

### Models (`models/`, 9 fichiers, Zod schemas)
- `project.ts`, `task.ts`, `user.ts`, `email-record.ts`, `meeting.ts`, `plan-analysis.ts`, `data-intelligence.ts` (28 interfaces), `auth.ts`

### Outlook (`outlook/`, 3 fichiers)
- `graph-client.ts` — `getEmails()`, `withRetry()`, `GraphTokenExpiredError`
- `email-sync.ts` — `syncUserEmails()` avec injection de dépendances

### Briefing (`briefing/`, 3 fichiers)
- `briefing-collector.ts` — Collecte événements quotidiens (emails, tâches, réunions, projets)
- `briefing-generator.ts` — Génération briefing IA

### Visits (`visits/`, 3 fichiers)
- `transcription-service.ts` — `transcribeVisitAudio()` (Whisper)
- `visit-report-generator.ts` — `buildVisitReportPrompt()`, `getMockVisitReport()`

### Services (`services/`, 7 fichiers — interfaces)
- `project-service.ts`, `task-service.ts`, `meeting-service.ts`, `email-service.ts`
- `notification-service.ts`, `admin-service.ts`
- Type exports uniquement (implémentations dans les routes API)

### Tracking (`tracking/`, 3 fichiers)
- `api-cost-tracker.ts` — `trackApiUsage()` par provider/modèle
- `activity-logger.ts` — `logActivity()`, `logActivityAsync()`

### Utils (`utils/`, 5 fichiers)
- `formatters.ts` — Monnaie, dates, nombres
- `validators.ts` — Email, téléphone, URL
- `date-helpers.ts` — Manipulation dates
- `swiss-construction.ts` — Helpers CFC suisses, matériaux, normes

### Platform (`platform/`, 1 fichier)
- `index.ts` — `isTauriDesktop()`, `getArchiveMode()`

---

## 10. Lib Utilities (`apps/web/src/lib/`)

| Fichier | Rôle |
|---------|------|
| `supabase/server.ts` | Client Supabase SSR (cookies 7 jours, SameSite=Lax, secure en prod) |
| `supabase/client.ts` | Client Supabase browser |
| `supabase/admin.ts` | Client admin (bypass RLS, service role key) |
| `supabase/middleware.ts` | Client middleware (refresh tokens, sync cookies request+response) |
| `microsoft/tokens.ts` | `getValidMicrosoftToken()` — Lit `email_connections` d'abord, fallback `users`, refresh avec sync des 2 tables, JAMAIS de wipe |
| `crypto/token-encryption.ts` | AES-256-GCM: `encryptToken()`, `decryptToken()`, `isEncrypted()`, `safeEncrypt()`, `safeDecrypt()` |
| `env.ts` | Validation Zod variables d'env (server/client), typé `ServerEnv`/`ClientEnv` |
| `format.ts` | `formatCHF()`, `formatNumber()`, `formatDate()`, `formatDateTime()`, `formatPercent()` — locale suisse (fr-CH, de-CH, en-CH) |
| `logger.ts` | `logToDb()` — Log async vers table app_logs (fail silently) |
| `admin/require-superadmin.ts` | Guard superadmin (vérifie `is_superadmin`) |
| `api/pagination.ts` | `parsePagination()`, `paginatedJson()` — défaut 50, max 200 |
| `api/parse-body.ts` | `parseBody()`, `validateRequired()` — tuples {data, error} |
| `hooks/use-debounce.ts` | `useDebounce<T>(value, delay)` — défaut 300ms |
| `hooks/use-supabase-data.ts` | `useEmails()`, `useProjects()`, `useTasks()`, `useProject()`, `useUserProfile()` — loading/hasRealData |
| `hooks/use-form-section.ts` | `useFormSection<T>(initial, saveFn)` — dirty state, saving, error, confirmation |
| `contexts/email-context.tsx` | `EmailProvider`, `useEmailContext()` — emails[], readIds, unreadCount, pendingClassificationCount, syncing, syncEmails(), reclassifyAll(), markAsRead() |
| `audio/compress-audio.ts` | `compressAudioToMp3()` — Web Audio API + lamejs, 16 kHz mono 48 kbps |
| `audio/chunked-transcription.ts` | `transcribeAudioChunked()` — auto-compress/chunk > 24 MB pour Whisper |
| `mock-data.ts` | Interfaces: `EmailWithReadStatus`, `DisplayMode`, `ActivityItem`, `MockExtractedTask`, `MockPlan` |

---

## 11. Patterns & Conventions Critiques

### Nommage
- Table emails : `email_records` (PAS `emails`)
- Préfixe localStorage : `cantaia_` (ex: `cantaia_mail_list_width`)
- Couleur brand : `#2563EB` (blue) avec hover `#1D4ED8`, light `#EFF6FF`
- Brand secondary : `#10B981` (green)
- Theme color : `#0A1F30`
- Packages : `@cantaia/core`, `@cantaia/ui`, `@cantaia/database`, `@cantaia/config`

### Auth & Tokens Microsoft
- `getValidMicrosoftToken(userId)` — Fonction centrale, lit `email_connections` PUIS `users`, refresh met à jour LES DEUX tables
- `syncViaProvider()` dans `outlook/sync/route.ts` — Met aussi à jour les deux tables
- Tokens chiffrés AES-256-GCM si `MICROSOFT_TOKEN_ENCRYPTION_KEY` est défini
- `safeEncrypt()`/`safeDecrypt()` avec fallback gracieux
- **IMPORTANT** : Ne JAMAIS wiper les tokens en cas d'échec de refresh

### IA
- Import dynamique : `import("@anthropic-ai/sdk")` pour éviter bundling côté client
- Prompt caching Anthropic : `cache_control: { type: "ephemeral" }` sur les prompts système
- Retry : `callAnthropicWithRetry()` avec gestion 429/503/529
- `classifyAIError()` et `isRetryableAIError()` dans tous les catch des routes IA

### Classification Emails
- Pipeline 7 niveaux dans `/api/outlook/sync` :
  - L0: Tracking code prix
  - L1: Règles locales apprises
  - L2: Spam/newsletter
  - L2b: Keywords (score >= 8 + hasNameOrRefMatch)
  - L3: Claude AI
- Keyword classifier : penalty premier segment -15, Rule 7b/9 (recipients +8)

### Supabase
- `@supabase/ssr` v0.5.2 a un bug de types : utiliser admin client ou cast `(x as any)`
- `createAdminClient()` pour les opérations backend (bypass RLS)
- `createClient()` pour les opérations utilisateur (respecte RLS)

### State Management
- React Context + useReducer (pas Zustand)
- `EmailContext` : emails[], readIds, unreadCount, pendingClassificationCount, syncing — utilisé par Sidebar (badge) et Dashboard uniquement
- Mail page (`/mail`) : state local (fetchData → `/api/mail/decisions`), ne dépend PAS d'EmailContext
- `EmailDetailPanel` : utilisé par ProjectEmailsTab uniquement (pas par le module Mail)
- Providers : AuthProvider, BrandingProvider, AppEmailProvider, OrganizationProvider

### Callbacks & Refresh
- `EmailDetailPanel` : callback `onEmailUpdated` trigger refetch
- Auth callback : 5 tiers de résolution org, JWT parsing pour `expires_in` réel
- Session : cookies 7 jours

### HTML Email
- Sanitisation via `DOMPurify` (côté client)

---

## 12. Build & Dev

```bash
# Dev
pnpm dev                    # Turbo dev (tous les packages)

# Build
pnpm build                  # Turbo build
pnpm --filter @cantaia/web build  # Build web uniquement

# Type check
pnpm type-check

# Lint
pnpm lint

# Clean
pnpm clean
```

### Turborepo
- `build` : outputs `.next/**`, `dist/**`, `out/**` (exclut .next/cache)
- `dev` : persistent, no cache
- `lint`, `type-check` : dépendent de ^build

### Vercel
- Déploiement automatique sur push `main`
- CRON routes configurées dans `vercel.json` (sync email 7h, benchmarks 2h, patterns dim 3h)
- Variables d'environnement à configurer manuellement sur Vercel

---

## 13. État Actuel (Mars 2026)

- **Build** : ~83 pages, ~131 routes API, 0 erreurs
- **Migrations** : 001-051
- **Composants** : 123 fichiers dans 23 dossiers
- **Core** : ~87 fichiers TypeScript
- **Post-login redirect** : `/mail`
- **Admin** : visible aux org admins (role=admin) + superadmins
- **Super-admin** : 9 pages (overview, orgs, orgs/create, orgs/[id], users, billing, metrics, data-intelligence, config)
- **Sentry** : configuré, gated derrière cookie consent RGPD
- **Cookie consent** : bannière RGPD avec `cantaia_cookies_consent` cookie

### Migration Mail (2026-03-12)

Le module `/mail-test` (prototype décision-based) a été promu en module `/mail` officiel. L'ancien module inbox-based a été remplacé.

**Changements :**
- `apps/web/src/app/[locale]/(app)/mail/page.tsx` : réécrit avec vue décisions (urgent/thisWeek/info), threads Graph, modals Reply/Delegate/Transfer
- `apps/web/src/app/[locale]/(app)/mail-test/` : **supprimé**
- `apps/web/src/app/api/mail-test/` (4 routes) : **supprimé** (fonctionnalité déjà dans `/api/mail/`)
- `apps/web/src/hooks/useEmailKeyboardShortcuts.ts` : **supprimé** (n'était utilisé que par l'ancien mail)
- `middleware.ts` : `/mail-test` retiré des routes protégées
- Ajout bouton sync (POST `/api/outlook/sync`) avec toast
- Remplacement de tous les `alert()` par des banners d'erreur inline dans les modals

**Architecture du nouveau module Mail :**
- State local via `fetchData()` → `GET /api/mail/decisions` (ne dépend pas d'EmailContext)
- Buckets : urgent (action_required + urgent), thisWeek (action_required récent), info (info_only)
- Thread : `GET /api/mail/emails/[id]/thread` → Graph conversationId → jusqu'à 50 messages
- Backfill on-demand : si body_html/body_text manquants, fetch depuis Graph et sauvegarde en DB
- Réponse IA : ReplyModal envoie `thread_context` (messages du thread) à `/api/ai/generate-reply`
- Envoi email : `/api/email/send` (reply, forward, new) avec auto-refresh tokens
- EmailContext reste utilisé par Sidebar (badge unread) et Dashboard

---

## 14. Registre d'Erreurs & Problèmes Identifiés

### Corrigés (2026-03-12)

| ID | Module | Description | Fix |
|----|--------|-------------|-----|
| MAIL.FIX1 | Mail modals | `alert()` bloquant pour les erreurs d'envoi/délégation/transfert | Remplacé par state `sendError`/`delegateError`/`transferError` + banner inline avec icône AlertTriangle |
| MAIL.FIX2 | Mail page | Pas de bouton sync dans le nouveau module (l'ancien utilisait EmailContext.syncEmails) | Ajouté `syncEmails()` dédié avec POST `/api/outlook/sync` + toast résultat |
| MAIL.FIX3 | Mail page | Auth redirect cassé (vérifiait status 403 au lieu de 401) | Corrigé : `if (res.status === 401) router.replace("/login")` |
| MAIL.FIX4 | Build | `delegateError`/`transferError` déclarés mais non utilisés (TS error) | Ajouté affichage JSX dans les footers des modals Delegate et Transfer |
| MAIL.FIX5 | Mail page | Contenu email tronqué — seul `body_preview` (500 chars) affiché au lieu du corps complet | Decisions API retourne maintenant `body_html` + `body_text` ; fallback immédiat utilise body_html > body_text > body_preview |
| MAIL.FIX6 | Thread API | Images `cid:` cassées dans les threads — références non résolues | Thread route résout les `cid:` en base64 data URIs via Graph attachments API (pour chaque message du thread + fallback DB) |
| MAIL.FIX7 | Mail page | XSS — HTML email injecté via `dangerouslySetInnerHTML` sans sanitisation | Ajouté `DOMPurify.sanitize()` avec config permissive (images, tables, styles) sur toutes les 3 insertions HTML |
| MAIL.FIX8 | CSS | Images email débordent du conteneur, pas de max-width | Ajouté styles `.email-content img { max-width: 100%; height: auto }` + word-break dans globals.css |
| SUB.FIX1 | Soumissions analyze | Timeout 55s trop court pour Excel 46KB+ — Claude Haiku prend 40-55s sur 10K+ tokens de texte brut | `maxDuration` 60→300, timeout interne 55s→120s, Anthropic SDK timeout 60s→120s |
| SUB.FIX2 | Soumissions analyze | Excel text extraction bloated — colonnes vides, lignes vides, données inutiles envoyées à Claude | Filtrage colonnes <20% remplissage, suppression lignes vides, trim trailing empty cells |
| SUB.FIX3 | Soumissions analyze | Pas de chunking — documents >40K chars tronqués, perte de postes | Chunking par 80K chars (~20K tokens) avec traitement séquentiel et merge des résultats |
| SUB.FIX4 | Soumissions client | Polling timeout client 90s trop court pour le nouveau timeout serveur | Polling timeout 90s→180s |

### Corrigés — Audit Sécurité (2026-03-12)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC.FIX1 | CRITIQUE | `/api/tasks/[id]` | IDOR — PATCH/DELETE sans vérification d'organisation. Tout utilisateur authentifié pouvait modifier/supprimer les tâches d'autres orgs | Ajouté vérification org via project → organization_id avant update/delete |
| SEC.FIX2 | CRITIQUE | `/api/tasks` POST | IDOR — Création de tâches sans vérifier que le project_id appartient à l'org de l'utilisateur | Ajouté vérification project.organization_id === user.organization_id |
| SEC.FIX3 | CRITIQUE | `/api/email/sync/cron` | Injection SQL — `.or(\`provider_message_id.in.(\${externalIds.join(",")})\`)` interpolait des IDs externes non sanitisés | Remplacé par 2 requêtes `.in()` séparées (safe parameterized) |
| SEC.FIX4 | HAUTE | `/api/outlook/webhook` PUT | Pas de vérification d'auth — n'importe qui pouvait créer des subscriptions webhook | Ajouté auth Supabase + vérification userId === user.id |
| SEC.FIX5 | HAUTE | `/api/auth/callback` | Open redirect — paramètre `next` non validé, permettait redirection vers sites externes | Validé : doit commencer par `/` et ne pas commencer par `//` |
| SEC.FIX6 | HAUTE | `/api/chat` | Promises non catchées (fire-and-forget sans .catch) — crash silencieux Node | Ajouté `.catch()` sur insert chat_messages et update chat_conversations |
| SEC.FIX7 | MOYENNE | `/api/ai/classify-email` | Seuil classification 0.92 vs 0.85 dans sync route — incohérence | Standardisé à 0.85 (même que sync route) |
| SEC.FIX8 | HAUTE | `/api/plans/estimate-v2` | Pas de `maxDuration` — timeout Vercel default 60s pour pipeline multi-modèle 4 passes | Ajouté `maxDuration = 300` |
| SEC.FIX9 | CRITIQUE | `/api/submissions/[id]/analyze` | IDOR — pas de vérification que la soumission appartient à l'org | Ajouté vérification org via project → organization_id |
| SEC.FIX10 | CRITIQUE | `/api/pv/[id]` GET | IDOR — accès à n'importe quel PV sans vérification d'organisation | Ajouté vérification meeting.project.organization_id |
| SEC.FIX11 | CRITIQUE | `/api/pv/[id]` PUT | IDOR — modification de n'importe quel PV | Ajouté vérification org avant update |
| SEC.FIX12 | CRITIQUE | `/api/pv/[id]/export-pdf` | IDOR — export PDF de n'importe quel PV | Ajouté vérification meeting.project.organization_id |
| SEC.FIX13 | CRITIQUE | `/api/submissions/[id]` GET | IDOR — accès complet aux données de soumission (items, quotes, prix) d'autres orgs | Ajouté vérification submission.project.organization_id |
| SEC.FIX14 | CRITIQUE | `/api/submissions/[id]` DELETE | IDOR — suppression de soumissions d'autres orgs + leurs fichiers Storage | Ajouté vérification org + check existence avant delete |
| SEC.FIX15 | CRITIQUE | `/api/submissions/[id]/preview-email` | IDOR — génération d'emails de prix pour soumissions d'autres orgs | Ajouté vérification org après fetch userProfile |
| SEC.FIX16 | CRITIQUE | `/api/submissions/[id]/price-alerts` | IDOR — accès aux alertes prix de soumissions d'autres orgs | Ajouté vérification submission ownership via project.organization_id |

### Non corrigés (à investiguer)

| ID | Sévérité | Module | Description | Impact |
|----|----------|--------|-------------|--------|
| MAIL.1 | Moyenne | `/api/mail/decisions` | `priceIndicators` toujours undefined — le calcul d'indicateurs prix est incomplet dans la route decisions | Badge prix non affiché |
| OUTLOOK.1 | Moyenne | `/api/outlook/sync` | Désync possible entre `email_connections` et `users` pour les tokens (pas de transaction) | Token stale possible |
| OUTLOOK.6 | Basse | `/api/outlook/webhook` POST | Validation `clientState` silencieusement ignorée si `OUTLOOK_WEBHOOK_SECRET` n'est pas défini (skip silencieux) | Sécurité webhook dégradée |

### Corrigés — Optimisation SEO (2026-03-12)

| ID | Catégorie | Fichier | Description | Fix |
|----|-----------|---------|-------------|-----|
| SEO.FIX1 | CRITIQUE | `[locale]/layout.tsx` | Metadata FR-only, pas de hreflang, pas d'alternates, pas de canonical, metadataBase fixe | Converti `metadata` statique → `generateMetadata()` dynamique par locale (FR/EN/DE). Ajouté hreflang `alternates.languages`, canonical, `googleBot` directives `max-image-preview: large` |
| SEO.FIX2 | CRITIQUE | `sitemap.ts` | Seulement 3 URLs, pas de locales, pas de pages légales, pas d'alternates | 24 URLs (8 pages × 3 locales) avec `alternates.languages` par entrée. Ajouté: login, register, CGV, mentions, privacy |
| SEO.FIX3 | HAUTE | `robots.ts` | Manquait disallow pour toutes les routes app protégées (/dashboard, /mail, /projects, etc.) | Ajouté disallow pour ~20 routes app (*/dashboard, */mail, */projects, */tasks, */onboarding, etc.) |
| SEO.FIX4 | CRITIQUE | `(marketing)/page.tsx` | Aucune metadata sur la homepage. Pas de keywords. Pas de JSON-LD | Ajouté `generateMetadata()` 3 langues avec title/description/keywords optimisés SEO construction suisse. Ajouté JSON-LD `@graph`: Organization + SoftwareApplication + WebSite |
| SEO.FIX5 | HAUTE | `(marketing)/pricing/page.tsx` | Aucune metadata sur la page tarifs | Ajouté `generateMetadata()` 3 langues + JSON-LD Product schema (CHF 99, availability) |
| SEO.FIX6 | HAUTE | `(marketing)/about/page.tsx` | Aucune metadata sur la page à propos | Ajouté `generateMetadata()` 3 langues avec descriptions SEO |
| SEO.FIX7 | HAUTE | `(auth)/layout.tsx` | Pages login/register/forgot-password indexables par Google | Ajouté `robots: { index: false, follow: false }` dans le layout auth (couvre toutes les pages auth) |
| SEO.FIX8 | MOYENNE | `legal/{cgv,mentions,privacy}/page.tsx` | Aucune metadata sur les 3 pages légales | Ajouté `metadata` avec title, description, canonical + alternates hreflang |
| SEO.FIX9 | CRITIQUE | OG Image | `/og-image.png` référencé dans metadata mais fichier inexistant — aperçu social cassé | Créé `opengraph-image.tsx` dynamique (Next.js ImageResponse) avec branding Cantaia, tagline, feature pills, gradient bleu |
| SEO.FIX10 | HAUTE | Favicon | Aucun favicon, aucun apple-icon. Onglet navigateur sans icône | Créé `icon.tsx` (32×32) et `apple-icon.tsx` (180×180) dynamiques avec lettre "C" + gradient brand |
| SEO.FIX11 | HAUTE | `next.config.ts` | Pas de redirects domaines alternatifs → contenu dupliqué | Ajouté 301 redirects: cantaia.com, www.cantaia.com, cantaia.app, www.cantaia.ch → cantaia.ch. Ajouté `images.formats: ["avif", "webp"]` |
| SEO.FIX12 | MOYENNE | `(marketing)/layout.tsx` | Pas de données structurées Organization | Ajouté JSON-LD Organization schema (name, url, logo, foundingDate, knowsAbout) dans le layout marketing |
| SEO.FIX13 | BASSE | `manifest.json` | Description mixte DE/EN incohérente. Icons manquants. start_url "/" au lieu de post-login | Corrigé description FR, start_url `/fr/mail`, lang `fr`, categories `business/productivity`, icons pointent vers les routes dynamiques |

### Résumé SEO technique

| Aspect | Avant | Après |
|--------|-------|-------|
| **Hreflang** | Aucun | FR/EN/DE + x-default sur toutes les pages |
| **Canonical** | Aucun | Généré par locale + page |
| **Sitemap** | 3 URLs (FR only) | 24 URLs (8 pages × 3 locales + alternates) |
| **Robots** | 3 disallow | 23 disallow (toutes routes app protégées) |
| **OG Image** | Fichier manquant | Généré dynamiquement (1200×630) |
| **Favicon** | Aucun | 32×32 + Apple 180×180 dynamiques |
| **JSON-LD** | Aucun | Organization + SoftwareApplication + WebSite + Product |
| **Keywords** | Aucun | 10-12 mots-clés par langue, optimisés construction CH |
| **Metadata pages** | 1 (root layout FR) | 9 pages avec metadata locale-aware |
| **Auth noindex** | Non | Oui (layout auth) |
| **Domain redirects** | Aucun | 4 redirects 301 → cantaia.ch |
| **GoogleBot** | Défaut | max-image-preview: large, max-snippet: -1 |

---

## 15. Internationalisation (i18n) — Audit & Corrections (Mars 2026)

### Fichiers de traduction
- `apps/web/messages/fr.json` — 2 532+ clés
- `apps/web/messages/en.json` — 2 532+ clés
- `apps/web/messages/de.json` — 2 532+ clés
- **Parité 100%** entre les 3 locales (aucune clé manquante)

### Corrections appliquées

#### Landing page (11 composants convertis à `useTranslations()`)
| Composant | Strings corrigées | Section i18n |
|-----------|-------------------|--------------|
| `HeroSection.tsx` | badge, titre 3 lignes, sous-titre, CTA, trust badges | `landing.hero` |
| `ProblemSection.tsx` | titre, sous-titre, 3 pain points | `landing.problem` |
| `FeaturesSection.tsx` | titre email, sous-titre, 3 bullets, CTA | `landing.features.email*` |
| `SpotlightSection.tsx` | titre PV, sous-titre, 3 bullets | `landing.spotlight.pv*` |
| `BentoGrid.tsx` (FeaturePrixSection) | titre prix, sous-titre, 3 bullets | `landing.features.price*` |
| `HowItWorksSection.tsx` | titre, 3 étapes (titre + desc) | `landing.howItWorks` |
| `FAQSection.tsx` (TrustSection) | titre, 3 cards, 4 stats | `landing.proof` |
| `PricingSection.tsx` | titre, sous-titre, nom plan, prix, 6 features, CTA, note | `landing.pricing` |
| `FinalCTASection.tsx` | titre, sous-titre, 2 CTA | `landing.finalCta` |
| `Header.tsx` (marketing) | nav links, login, essai gratuit | `landing.nav` |
| `Footer.tsx` (marketing) | description, sections, links, copyright | `landing.footer` |

#### Sidebar (1 correction)
- `Sidebar.tsx` : "Admin" hardcodé → `t("admin")` via `useTranslations("nav")`

#### AI error messages (multilingue)
- `packages/core/src/ai/ai-utils.ts` : `classifyAIError()` accepte un paramètre `locale` (fr/en/de)
- 3 messages d'erreur traduits en FR/EN/DE (rate limit, overload, unavailable)

### Points non corrigés (impact mineur, refactoring lourd)
| Élément | Fichiers | Raison |
|---------|----------|--------|
| `"(Sans objet)"` (défaut sujet email) | 7 fichiers (sync, providers) | Utilisé profondément dans le pipeline sync, nécessiterait de passer le locale à travers toute la chaîne |
| `"Divers"` (dossier archivage) | `email-archiver.ts` (6 occurrences) | Noms de dossiers Outlook créés côté serveur |
| `"Non classé"` (contexte classification) | `extract-tasks/route.ts` | Valeur par défaut interne pour le prompt IA |
| Mockups landing (contenu démo) | HeroSection, FeaturesSection, SpotlightSection, BentoGrid | Texte illustratif dans les mockups UI (noms, emails fictifs) — ne nécessite pas de traduction |
| Erreurs extraction prix | `file-price-extractor.ts`, `extract-from-files/route.ts` | 6 messages d'erreur FR dans le pipeline d'extraction prix |
| Erreurs analyse soumission | `submissions/[id]/analyze/route.ts` | 5 messages d'erreur FR dans l'analyse IA de soumissions |

### Pattern i18n
- **Landing/marketing** : `useTranslations("landing.section")` dans chaque composant client
- **App (sidebar, etc.)** : `useTranslations("nav")` déjà en place
- **API errors** : `classifyAIError(err, locale)` pour les erreurs IA
- **Traductions** : Toutes dans `apps/web/messages/{fr,en,de}.json`, section `landing` = 12 sous-sections

---

## 16. Fix Analyse Soumissions — Timeout Bug (Mars 2026)

### Problème
L'analyse de soumissions Excel (même petites, ex: 46 Ko) échouait avec "L'analyse a pris trop de temps".

### Cause racine (3 problèmes combinés)
1. **Route API synchrone** : La route `POST /api/submissions/[id]/analyze` exécutait l'analyse complète (download → parse → Claude API → DB insert) de manière synchrone. Si Vercel tuait la fonction serverless avant la fin, le catch block ne s'exécutait pas → la DB restait bloquée en `analysis_status: "analyzing"` indéfiniment.
2. **`Promise.race` + `setTimeout` dangling** : L'ancien code utilisait `Promise.race([claudeCall, timeout])` avec un `setTimeout` qui n'était jamais nettoyé en cas de succès, gardant l'event loop actif inutilement en serverless.
3. **Frontend `await fetch`** : `handleReanalyze` faisait `await fetch(...)` bloquant, alors que la réponse API n'avait pas de valeur utile (le polling gère le suivi).

### Fix appliqué

#### Backend (`apps/web/src/app/api/submissions/[id]/analyze/route.ts`)
- **`after()` pattern** (Next.js 15) : La route retourne immédiatement `202 Accepted`, puis exécute l'analyse en arrière-plan via `after()`. La fonction reste active jusqu'à `maxDuration` (300s).
- **Suppression `Promise.race`/`setTimeout`** : Reliance sur le timeout SDK Anthropic natif (`timeout: 180_000`).
- **Extraction en fonctions** : `performAnalysis()`, `setAnalysisError()` pour lisibilité et error handling robuste.
- **`maxDuration = 300`** : Permet jusqu'à 5 min d'exécution sur Vercel Pro.

#### Frontend (`apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx`)
- **`handleReanalyze` fire-and-forget** : `fetch(...).catch(() => {})` sans `await`, puisque le polling gère le suivi.
- **Timeout client 300s** (au lieu de 180s) : Aligné avec `maxDuration` serveur.
- **Vérification finale avant timeout** : Un dernier fetch au serveur avant de déclarer "trop de temps", au cas où l'analyse a terminé juste avant.

### Fix 2 — "Failed to parse AI response" (12 mars 2026)

#### Problème
Même après le fix timeout, l'analyse échouait avec "Failed to parse AI response". Claude retournait du JSON mal formé ou avec du texte autour que le parser ne gérait pas.

#### Cause racine
1. **Pas de prefill** : Sans contrainte, Claude ajoutait du texte avant/après le JSON (preamble, explications)
2. **Parser trop fragile** : Un seul `JSON.parse` + un repair à depth=0 qui ne trouvait jamais les items individuels (depth=2 dans `{"items":[{...}]}`)
3. **Pas de gestion des trailing commas** : Les LLM génèrent souvent `[{...}, {...},]` (virgule finale invalide en JSON)

#### Fix appliqué
- **Assistant prefill** : Message assistant pré-rempli `{"items": [` force Claude à continuer en JSON pur, sans preamble
- **Parser 4 stratégies** : (1) JSON.parse direct, (2) fix trailing commas + close truncated, (3) extraction objets à depth=1/2, (4) regex fallback
- **String-aware depth tracking** : Le parser respecte les `{` `}` à l'intérieur des strings JSON
- **Logging détaillé** : Preview de la réponse Claude logguée, erreur avec le contenu pour debug

### Ce qui n'a PAS fonctionné (historique des tentatives)
| Tentative | Pourquoi ça ne marchait pas |
|-----------|---------------------------|
| `Promise.race` avec timeout 120s | Le `setTimeout` dangling empêchait le garbage collection en serverless ; si Vercel tuait la fn, le catch ne s'exécutait pas |
| Augmenter le timeout client à 180s | Ne résolvait pas le problème serveur — la fn était tuée avant |
| Retry côté client | Le serveur restait bloqué en "analyzing", les retries étaient ignorés |
| Parser JSON simple (`JSON.parse` + repair depth=0) | Ne gérait pas le preamble Claude, les trailing commas, ni les objets à depth > 0 |

---

## 17. Soumissions — 4 améliorations (2026-03-12)

### 17.1 Optimisation vitesse d'analyse
- **Prompt compacté** : prompt système raccourci (~40% plus court)
- **Parallelisation chunks** : traitement par lots de 3 chunks simultanés (`Promise.all`, `MAX_CONCURRENT = 3`)
- **Prompt caching** : `cache_control: { type: "ephemeral" }` sur le message système → réutilisé entre chunks
- **Résultat** : réduction significative du temps d'analyse

### 17.2 Extraction nom de produit
- **Champ `product_name`** ajouté à `submission_items` (migration 052)
- **Extraction IA** : le prompt d'analyse extrait automatiquement le nom du produit (ex: "OH-ch-Gravierflora Myko" depuis un long libellé)
- **Affichage** : chip violet dans la liste des postes

### 17.3 Sélection multi-catégorie pour demandes de prix
- **Mode "Sélection libre"** : toggle entre "Par groupe" (par material_group) et "Sélection libre"
- **Sélection libre** : tableau plat de tous les postes avec checkboxes + picker fournisseurs
- **API** : `item_ids?: string[]` ajouté au payload de `/api/submissions/[id]/send-price-requests`

### 17.4 Budget IA (estimation prix soumission)
- **Nouvel onglet "Budget IA"** dans la page soumission
- **API** : `POST /api/submissions/[id]/estimate-budget`
  - Étape 1 : Match CFC reference prices (CRB 2025) par `cfc_code` + `unit`
  - Étape 2 : Estimation IA (Claude Haiku) pour les postes non matchés
  - Étape 3 : Calcul totaux (min/median/max)
- **Migration 052** : `budget_estimate JSONB` + `budget_estimated_at TIMESTAMPTZ` sur `submissions`
- **UI** : bannière totaux, badges source (CRB vert, IA bleu), tableau détaillé par groupe

---

## 18. Audit Sécurité Complet (2026-03-13)

Audit de sécurité exhaustif couvrant 136 routes API, l'authentification, la gestion de session, les uploads de fichiers, les injections, et l'infrastructure. 45 vulnérabilités identifiées, 30 corrigées.

### Corrigés — Audit Sécurité V2 (2026-03-13)

#### Routes sans authentification (CRITIQUE)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX1 | CRITIQUE | `/api/projects/closure/generate-pv` | Aucune authentification — endpoint accessible publiquement | Ajouté `createClient()` + `getUser()` guard, retourne 401 si non authentifié |
| SEC2.FIX2 | CRITIQUE | `/api/outlook/archive` | Aucune authentification — requêtes d'archivage sans vérification | Ajouté auth Supabase + guard 401 |

#### IDOR — PV & Réunions (CRITIQUE)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX3 | CRITIQUE | `/api/pv/[id]/finalize` | IDOR — tout utilisateur authentifié peut finaliser les réunions d'autres orgs | Ajouté vérification org via `meetings → projects!inner(organization_id)` |
| SEC2.FIX4 | CRITIQUE | `/api/pv/transcribe` | IDOR — tout utilisateur peut écraser l'audio/transcription de réunions d'autres orgs | Ajouté vérification `meeting.projects.organization_id === userProfile.organization_id` |
| SEC2.FIX5 | CRITIQUE | `/api/ai/generate-pv` | IDOR — génération/écrasement de PV de réunions d'autres orgs | Ajouté vérification org avec join projet avant consommation des données meeting |

#### Injection SQL via PostgREST `.or()` (CRITIQUE)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX6 | CRITIQUE | `/api/suppliers` GET | Injection — `search` interpolé directement dans `.or()` PostgREST. Un `%,organization_id.eq.X` pouvait injecter des clauses filtre arbitraires via admin client (bypass RLS) | Sanitisation : `search.replace(/[%_,().]/g, "")` avant interpolation |
| SEC2.FIX7 | CRITIQUE | `/api/projects/create` | Injection — `body.code` sans aucune sanitisation dans `.or()`. `body.name` ne filtrait que `%_`, pas `,().` | Sanitisation complète `[%_,().]` sur `body.name` et `body.code` |

#### IDOR — Soumissions (HAUTE)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX8 | HAUTE | `/api/submissions/[id]/send-price-requests` | IDOR — envoi d'emails de demande de prix pour soumissions d'autres orgs | Ajouté vérification `submission.projects.organization_id` |
| SEC2.FIX9 | HAUTE | `/api/submissions/[id]/estimate-budget` | IDOR — lecture items + écriture budget sur soumissions d'autres orgs | Ajouté fetch submission avec join projet + vérification org |
| SEC2.FIX10 | HAUTE | `/api/submissions/[id]/relance` | IDOR — envoi de relances fournisseurs pour soumissions d'autres orgs | Ajouté vérification org + return 403 si pas de `project_id` |
| SEC2.FIX11 | MOYENNE | `/api/submissions/[id]/analyze` | IDOR conditionnel — org check sautée si `project_id` null | Rendu la vérification org inconditionnelle : `!project_id` → 403 |
| SEC2.FIX12 | MOYENNE | `/api/submissions` POST | IDOR — `project_id` non vérifié contre l'org de l'utilisateur | Ajouté vérification `project.organization_id === profile.organization_id` |

#### IDOR — Plans (MOYENNE)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX13 | MOYENNE | `/api/plans/upload` | IDOR — `project_id` non vérifié avant insertion plan | Ajouté vérification org du projet |
| SEC2.FIX14 | MOYENNE | `/api/plans/estimate-v2` | IDOR — `plan_id` non vérifié avant pipeline estimation 4 passes multi-modèle | Ajouté vérification org via `plan_registry.organization_id` |
| SEC2.FIX15 | MOYENNE | `/api/plans/corrections` | IDOR — corrections de quantité applicables à plans d'autres orgs | Ajouté vérification org via `plan_registry` |
| SEC2.FIX16 | MOYENNE | `/api/plans/calibration` | IDOR — calibration prix applicable à analyses d'autres orgs | Ajouté vérification org via `plan_analyses → plan_registry` |

#### IDOR — PV création (MOYENNE)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX17 | MOYENNE | `/api/pv` POST | IDOR — création de meeting sous `project_id` d'une autre org | Ajouté vérification `project.organization_id === userProfile.organization_id` |

#### XSS (HAUTE)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX18 | HAUTE | `EmailDetailPanel.tsx` | XSS — DOMPurify autorisait `data:` URIs (toutes, pas juste images). `data:text/html,<script>...` exécutable au clic | Regex restreinte à `data:image\/` uniquement |
| SEC2.FIX19 | HAUTE | `mail/page.tsx` | XSS — même problème DOMPurify `data:` URI | Regex restreinte à `data:image\/` uniquement |
| SEC2.FIX20 | HAUTE | `mail/page.tsx` | XSS SSR — `sanitizeEmailHtml()` retournait le HTML brut côté serveur (`typeof window === "undefined"`) | Retourne `""` au lieu de `html` côté SSR |

#### Privilege Escalation (HAUTE)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX21 | HAUTE | `/api/invites` POST | Escalade de privilèges — `user_id` du body accepté sans vérification d'identité. Un attaquant avec un token d'invitation pouvait reassigner n'importe quel utilisateur à une autre org | Ajouté `createClient()` + `getUser()` auth, puis vérification `body.user_id === user.id` |

#### Debug Routes (HAUTE/CRITIQUE)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX22 | CRITIQUE | `/api/debug/org-merge` | Route de merge d'organisations accessible à tous les utilisateurs authentifiés — opérations destructives cross-org (déplacement projets, connections email, suppression users/orgs) | Ajouté vérification `is_superadmin` sur GET et POST |
| SEC2.FIX23 | HAUTE | `/api/debug/microsoft-status` | Informations sensibles exposées (tokens OAuth, connections email, IDs utilisateurs) sans restriction de rôle | Ajouté vérification `is_superadmin` |

#### Upload & Stockage (HAUTE)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX24 | HAUTE | `/api/organization/upload-logo` | SVG accepté en upload — peut contenir `<script>` et event handlers JS. Servi publiquement depuis bucket Supabase = stored XSS | Retiré `image/svg+xml` de `ALLOWED_TYPES` |
| SEC2.FIX25 | HAUTE | `plan-storage.ts` | Path traversal — `attachment.name` (Microsoft Graph) utilisé directement dans le chemin storage sans sanitisation. `../../` possible | Ajouté `attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_")` |
| SEC2.FIX26 | HAUTE | `/api/submissions` POST | Path traversal — `file.name` utilisé directement dans le chemin storage | Ajouté `fileName.replace(/[^a-zA-Z0-9._-]/g, "_")` |

#### Infrastructure Sécurité

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX27 | HAUTE | `next.config.ts` | Aucun Content-Security-Policy header — toute XSS peut exfiltrer des données, charger des scripts externes | Ajouté CSP complet : `default-src 'self'`, script/style/img/font/connect/frame-src avec domaines autorisés, `frame-ancestors 'none'`, `object-src 'none'` |
| SEC2.FIX28 | MOYENNE | `supabase/server.ts` | Flag `httpOnly` non explicitement défini sur les cookies de session — dépendance sur le default de la librairie | Ajouté `httpOnly: true` explicitement |
| SEC2.FIX29 | MOYENNE | `supabase/middleware.ts` | Même problème `httpOnly` sur les cookies middleware | Ajouté `httpOnly: true` explicitement |
| SEC2.FIX30 | MOYENNE | `env.ts` | `MICROSOFT_TOKEN_ENCRYPTION_KEY` et `OUTLOOK_WEBHOOK_SECRET` absents du schéma de validation — défaillance silencieuse en production | Ajouté au schéma Zod : `MICROSOFT_TOKEN_ENCRYPTION_KEY: z.string().length(64).optional()`, `OUTLOOK_WEBHOOK_SECRET: z.string().min(16).optional()` |

#### Auth Client (MOYENNE)

| ID | Sévérité | Module | Description | Fix |
|----|----------|--------|-------------|-----|
| SEC2.FIX31 | MOYENNE | `AuthProvider.tsx` | `getSession()` utilisé au chargement initial — ne valide PAS le JWT côté serveur (lit simplement le cookie local). Un cookie forgé serait accepté | Remplacé par `getUser()` (validation serveur) en premier, puis `getSession()` uniquement si l'utilisateur est vérifié |

### Non corrigés — Audit Sécurité V2 (à implémenter)

| ID | Sévérité | Module | Description | Impact | Action recommandée |
|----|----------|--------|-------------|--------|-------------------|
| SEC2.NC1 | HAUTE | Tous les endpoints | Aucun rate limiting sur aucune route API (136 routes). Les routes IA (`/api/ai/*`, `/api/plans/estimate-v2`, `/api/chat`) peuvent être appelées en boucle → coûts API illimités | Amplification de coûts API, brute-force auth | Implémenter un middleware rate limiting (ex: `@upstash/ratelimit` avec Redis) |
| SEC2.NC2 | HAUTE | Tous les endpoints POST | Aucune protection CSRF. `SameSite=Lax` est une mitigation partielle mais ne bloque pas les form POST cross-site simples | Attaques CSRF théoriquement possibles | Ajouter validation header `Origin` ou token CSRF |
| SEC2.NC3 | HAUTE | Bucket Storage `plans` | Plans stockés dans un bucket public — URLs accessibles sans auth. Documents de construction sensibles exposés | Fuite de documents confidentiels | Migrer vers bucket privé + signed URLs |
| SEC2.NC4 | MOYENNE | Auth callback | Tokens OAuth Microsoft écrits en clair dans la DB si `MICROSOFT_TOKEN_ENCRYPTION_KEY` n'est pas défini (pas d'erreur, fallback silencieux) | Tokens lisibles en DB en cas de compromission Supabase | Rendre `MICROSOFT_TOKEN_ENCRYPTION_KEY` requis en production |
| SEC2.NC5 | MOYENNE | Auth callback | `migrateUserData()` exécute 6 updates + 1 delete sans transaction DB — état incohérent possible si interrompu | Données partiellement migrées | Wrapper dans une transaction RPC |
| SEC2.NC6 | MOYENNE | Session | Session 7 jours sans sliding expiry ni step-up auth pour opérations sensibles (changement email, admin) | Session longue durée non re-validée | Ajouter re-auth pour opérations critiques |
| SEC2.NC7 | BASSE | Encryption | Pas de mécanisme de rotation de clé pour `MICROSOFT_TOKEN_ENCRYPTION_KEY` — rotation = tous les tokens cassés | Lock-in sur une seule clé | Ajouter versioning au format chiffré |
| SEC2.NC8 | BASSE | `/api/ai/analyze-plan` | `file_url` de la DB fetché via `fetch()` sans validation de domaine (pas d'allowlist Supabase) | SSRF potentiel si `file_url` compromise en DB | Valider que l'URL pointe vers le domaine Supabase attendu |
| SEC2.NC9 | BASSE | Uploads | Validation par extension de fichier uniquement, pas de magic bytes. MIME type client-side ignoré | Fichiers malformés acceptés | Ajouter vérification magic bytes pour PDF/XLSX |
| SEC2.NC10 | BASSE | `/api/transcription/process` | Pas de limite de taille serveur pour uploads audio | Consommation mémoire/coûts API | Ajouter vérification taille max |

### Résumé Sécurité V2

| Catégorie | Trouvées | Corrigées | Restantes |
|-----------|----------|-----------|-----------|
| **CRITIQUE** (no auth, IDOR, SQL injection) | 12 | 12 | 0 |
| **HAUTE** (XSS, privilege escalation, path traversal, CSP) | 16 | 14 | 2 |
| **MOYENNE** (cookies, env, auth client, IDOR conditionnel) | 12 | 8 | 4 |
| **BASSE** (SSRF, magic bytes, rotation clés, file size) | 5 | 0 | 5 |
| **Total** | **45** | **34** | **11** |

### Architecture sécurité après audit

| Aspect | Avant | Après |
|--------|-------|-------|
| **CSP** | Aucun | Complet (default, script, style, img, font, connect, frame, frame-ancestors, base-uri, form-action, object-src) |
| **Cookie httpOnly** | Implicite (dépendance librairie) | Explicite `httpOnly: true` |
| **Auth initial client** | `getSession()` (non vérifié) | `getUser()` (vérifié côté serveur) |
| **Routes sans auth** | 2 | 0 |
| **IDOR routes** | 14 | 0 |
| **SQL injection** | 2 | 0 |
| **XSS vectors** | 3 | 0 |
| **Debug routes** | Accessibles à tous | Restreintes superadmin |
| **SVG upload** | Autorisé | Bloqué |
| **Path traversal** | 2 vecteurs | 0 |
| **Env validation** | Partielle | `MICROSOFT_TOKEN_ENCRYPTION_KEY` + `OUTLOOK_WEBHOOK_SECRET` validés |
| **DOMPurify `data:` URI** | Toutes (`data:text/html` XSS) | `data:image/*` uniquement |
| **Invite escalation** | `user_id` non vérifié | `user_id === auth.uid()` |

---

## 19. Fix Budget IA Soumissions — Sources de Prix (2026-03-13 → 2026-03-15)

### Problème (persistant)
Le Budget IA des soumissions affichait **100% des postes comme "estimés IA"** alors que la base de données contient des prix réels (offres fournisseurs, prix ingérés, benchmarks marché, référentiel CRB 2025 avec 55+ entrées).

### Historique : Fix V1 (2026-03-13) — N'A PAS RÉSOLU le problème
Le premier fix a remplacé le matching CFC basique par `resolvePrice()` et ajouté la normalisation d'unités. **Mais `resolvePrice()` lui-même était cassé** — les 6 tiers échouaient silencieusement à cause de noms de colonnes incorrects.

### Cause racine réelle — Fix V2 (2026-03-15)
**4 bugs critiques dans `price-resolver.ts`** faisaient que CHAQUE tier lançait une erreur PostgREST, attrapée silencieusement par les `catch {}`, faisant tout tomber en IA :

#### Bug 1 : Tier 1 — 3 noms de colonnes incorrects dans `offer_line_items`
Le code cherchait des colonnes qui N'EXISTENT PAS dans la table `offer_line_items` (migration 012) :
- `.eq('supplier_offers.org_id', org_id)` → la colonne s'appelle `organization_id` (pas `org_id`), et `offer_line_items` a directement `organization_id` sans besoin de join
- `.or(`cfc_code.eq...`)` → la colonne s'appelle `cfc_subcode` (pas `cfc_code`)
- `description_normalized.ilike...` → la colonne s'appelle `normalized_description` (pas `description_normalized`)
- **Résultat** : PostgREST retournait une erreur 400, le `catch {}` l'avalait, tier 1 sauté.

#### Bug 2 : Tier 1 — Recherche de CFC code dans les descriptions
`.or(`...description_normalized.ilike.%${cfc_code}%`)` cherchait le CODE CFC (ex: "215.3") dans les descriptions textuelles des offres. Même avec le bon nom de colonne, chercher "215.3" dans "Béton armé pour fondations" ne matche jamais.

#### Bug 3 : Tier 3 — Colonne `is_forfait` inexistante
`.eq('is_forfait', false)` dans la requête sur `ingested_offer_lines` — cette colonne N'EXISTE PAS dans la table (migration 045). PostgREST 400 → catch → tier 3 sauté.

#### Bug 4 : Tier 5 — Matching description par inclusion exacte
```typescript
r.description.toLowerCase().includes(descLower)  // CRB "Béton armé" contient la description longue ?
descLower.includes(r.description.toLowerCase())   // Description contient exactement "Béton armé C30/37 (fourniture + coulage)" ?
```
Trop strict — une description de soumission comme "Fourniture et mise en place de bordures en béton préfabriquées" ne contient jamais exactement "Béton armé C30/37 (fourniture + coulage)".

### Fix V2 appliqué (2026-03-15)

#### `price-resolver.ts` — Réécriture complète
- **Tier 1 fix** : Colonnes corrigées (`organization_id`, `cfc_subcode`, `normalized_description`). Query directe sans join `supplier_offers`.
- **Tier 1 enhancement** : Recherche par mots-clés de description (3 étapes) :
  1. Par `cfc_subcode` si disponible
  2. Par mot-clé principal (le plus long = plus discriminant) dans `normalized_description` OU `supplier_description`
  3. Par 2e mot-clé si le 1er n'a rien donné
- **Tier 3 fix** : Suppression de `.eq('is_forfait', false)` (colonne inexistante)
- **Tier 5 enhancement** : Matching par score de similarité mots-clés (≥40% de chevauchement) au lieu d'inclusion exacte de substring
- **Sanitisation** : `sanitizeForFilter()` sur toutes les valeurs interpolées dans `.or()` PostgREST
- **Logging** : `console.warn` sur les erreurs de chaque tier au lieu de `catch {}` silencieux
- **Extraction de mots-clés** : `extractKeywords()` avec stop words FR/DE, tri par longueur (plus discriminants en premier)
- **Similarité** : `keywordOverlap()` pour le matching CRB — score basé sur les mots en commun ou contenus

#### `estimate-budget/route.ts` — Logging amélioré
- Log détaillé des sources par tier : `[BUDGET] Sources: {"historique_interne":15,"referentiel_crb":8,"prix_non_disponible":73}`
- Warning par item en cas d'échec de `resolvePrice()`

### Ce qui n'a PAS fonctionné (historique complet)
| Tentative | Pourquoi ça ne marchait pas |
|-----------|---------------------------|
| Fix V1 (2026-03-13) : intégration `resolvePrice()` | `resolvePrice()` lui-même était cassé — 3 noms de colonnes incorrects dans tier 1, colonne inexistante dans tier 3, tous les tiers échouaient silencieusement |
| Matching CFC avec `cfcMatch.unite === item.unit` | Les unités Excel (`m2`) ne matchent jamais les unités CFC unicode (`m²`) — 0 résultat sur 55 entrées |
| Pas de fallback par description quand `cfc_code` est null | La majorité des items de soumission n'ont pas de `cfc_code` — tous tombaient en IA |
| Route isolée avec son propre matching | Duplication de logique, miss des 5 autres sources de prix |
| `.or(`cfc_code.eq.${val},description_normalized.ilike...`)` | Colonnes `cfc_code` et `description_normalized` n'existent pas dans `offer_line_items` (ce sont `cfc_subcode` et `normalized_description`) — PostgREST 400 silencieux |
| `.eq('supplier_offers.org_id', org_id)` avec join | `supplier_offers` a `organization_id` pas `org_id` — et `offer_line_items` a sa propre colonne `organization_id` sans besoin de join |
| `.eq('is_forfait', false)` sur `ingested_offer_lines` | Colonne `is_forfait` n'existe pas dans la table — PostgREST 400 silencieux |
| Description matching par `includes()` exact | "Béton armé C30/37 (fourniture + coulage)" ne sera jamais un substring de "Fourniture et mise en place de bordures en béton" |

### Architecture prix après fix V2

```
estimate-budget (soumissions)
   ↓
resolvePrice() ← même moteur que Cantaia Prix
   ├── 1. Historique interne (offer_line_items)
   │    ├── 1a. Par cfc_subcode (exact + préfixe)
   │    ├── 1b. Par mot-clé principal dans normalized_description/supplier_description
   │    └── 1c. Par 2e mot-clé si 1b échoue
   ├── 2. Données ingérées (mv_reference_prices, par CFC)
   ├── 3. Fallback textuel (ingested_offer_lines, par description keyword)
   ├── 4. Benchmark Cantaia (market_benchmarks, CFC + région + trimestre)
   ├── 5. Référentiel CRB (55 prix statiques, keyword overlap ≥40%)
   └── 6. Non disponible → fallback IA Claude Haiku
```

### Fix V3 — Intégration prix dans l'onglet Postes (2026-03-15)

#### Problème
Après le fix V2 du price-resolver, l'onglet "Postes" affichait toujours "En attente" pour tous les items sans aucun prix. Le statut "En attente" signifie qu'aucun fournisseur n'a encore soumis de devis — c'est le comportement normal. Mais les prix estimés du Budget IA n'étaient visibles que dans l'onglet "Budget IA" séparé, pas dans la vue principale des postes.

#### Fix appliqué (`submissions/[id]/page.tsx`)
- **Passage des données budget** : `ItemsTabContent` reçoit maintenant `budgetEstimates` (depuis `submission.budget_estimate.estimates`)
- **Colonnes conditionnelles** : Si un budget IA existe, ajout des colonnes "PU Méd." et "Total" dans le tableau des postes
- **Colonne Source** : Remplace l'ancien "Statut" par une colonne "Source" avec badges colorés :
  - **Fournisseur** (vert) : prix réel d'un devis fournisseur (prioritaire)
  - **Réel** (emerald) : `historique_interne` — prix issus d'offres passées
  - **CRB** (teal) : `referentiel_crb` — référentiel statique CRB 2025
  - **Marché** (purple) : `benchmark_cantaia` — benchmark cross-tenant
  - **IA** (bleu) : `estimation_ia` — estimation Claude Haiku
  - **En attente** (gris) : aucun prix disponible
- **Total par groupe** : Affichage du total CHF estimé dans le header de chaque groupe de postes
- **Tooltips** : Survol du badge source affiche `detail_source` (ex: "12 offres internes, dernière: 2025-11-15")

---

### TODO manuels pour Julien
1. Appliquer migration 011 sur Supabase (`plan_registry`)
2. Créer bucket Storage "plans" (**PRIVÉ**, 50MB max) — SEC2.NC3
3. Appliquer migrations 024-040 (data intelligence)
4. Appliquer migration 043 (calibration)
5. Appliquer migrations 049-052 (submissions enhanced + budget)
6. Définir `CRON_SECRET` sur Vercel (min 16 chars)
7. Définir `GEMINI_API_KEY` sur Vercel
8. Vérifier `OPENAI_API_KEY` (déjà utilisé pour Whisper)
9. Configurer DNS: cantaia.com et cantaia.app doivent pointer vers Vercel pour que les redirects 301 fonctionnent
10. Soumettre sitemap dans Google Search Console: `https://cantaia.ch/sitemap.xml`
11. Vérifier la propriété cantaia.ch dans Google Search Console (si pas déjà fait)
12. **SÉCURITÉ** : Définir `MICROSOFT_TOKEN_ENCRYPTION_KEY` sur Vercel (64 chars hex = 32 bytes AES-256) — SEC2.NC4
13. **SÉCURITÉ** : Définir `OUTLOOK_WEBHOOK_SECRET` sur Vercel (min 16 chars) — OUTLOOK.6
14. **SÉCURITÉ** : Migrer bucket "plans" de public à privé + adapter le code pour utiliser signed URLs — SEC2.NC3
15. **SÉCURITÉ** : Implémenter rate limiting sur les routes IA (recommandé: `@upstash/ratelimit`) — SEC2.NC1
