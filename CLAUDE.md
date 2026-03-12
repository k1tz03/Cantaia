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
- `price-resolver.ts` — 4 tiers (historique_interne → benchmark_cantaia → referentiel_crb → prix_non_disponible)
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

### Non corrigés (à investiguer)

| ID | Sévérité | Module | Description | Impact |
|----|----------|--------|-------------|--------|
| MAIL.1 | Moyenne | `/api/mail/decisions` | `priceIndicators` toujours undefined — le calcul d'indicateurs prix est incomplet dans la route decisions | Badge prix non affiché |
| EMAIL.6 | Haute | `/api/email/sync/cron` | Potentielle injection SQL dans la requête de déduplication (interpolation de string) | Sécurité |
| OUTLOOK.1 | Moyenne | `/api/outlook/sync` | Désync possible entre `email_connections` et `users` pour les tokens (pas de transaction) | Token stale possible |
| OUTLOOK.6 | Basse | `/api/outlook/webhook` | Validation `clientState` silencieusement ignorée si le secret n'est pas défini | Sécurité webhook |
| OUTLOOK.7 | Moyenne | `/api/outlook/webhook` | Handler PUT (subscribe) n'a pas de vérification d'auth | Sécurité webhook |

### TODO manuels pour Julien
1. Appliquer migration 011 sur Supabase (`plan_registry`)
2. Créer bucket Storage "plans" (public, 50MB max)
3. Appliquer migrations 024-040 (data intelligence)
4. Appliquer migration 043 (calibration)
5. Appliquer migrations 049-051 (submissions enhanced)
6. Définir `CRON_SECRET` sur Vercel
7. Définir `GEMINI_API_KEY` sur Vercel
8. Vérifier `OPENAI_API_KEY` (déjà utilisé pour Whisper)
