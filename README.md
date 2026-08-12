# Hub Perso

Hub personnel **privé** : derniers emails, emails importants conservés, coffre-fort de
documents (fiches de paie, contrats, factures…) et suivi financier — avec verrou PIN,
recherche plein texte, échéances, archivage automatique et export ZIP.

Next.js 15 (App Router) + Supabase (Auth, Postgres, Storage) + Claude (Anthropic).

## Fonctionnalités

| Module | Description |
|--------|-------------|
| **Emails** | Derniers emails synchronisés (table `email_records`), étoile pour conserver les importants |
| **Coffre-fort** | Upload de documents par catégorie, bucket privé + signed URLs, recherche plein texte (tsvector FR sur le contenu des PDF), échéances avec rappels |
| **Archivage auto** | Scan des emails récents, détection fiches de paie/factures/impôts/contrats, téléchargement des PDF via Microsoft Graph |
| **Export ZIP** | Tous les documents + emails conservés en `.eml` (RFC 2822) + index JSON |
| **Verrou PIN** | Step-up auth 6 chiffres au-dessus de la session (cookie JWT 30 min, 5 essais → blocage 15 min) |
| **Finances** (`/finance`) | Comptes (courant, épargne, 3e pilier, investissements…), relevés de solde mensuels, évolution du patrimoine, allocation, analyse IA avec pistes de placement (éducatif, disclaimer systématique) |

## Sécurité

- Accès réservé : session Supabase **+** flag `is_superadmin` sur la table `users`
  (guard `requireHubAccess`) **+** verrou PIN optionnel.
- Toutes les données sont scopées `user_id = auth.uid()` (RLS sans bypass).
- Fichiers dans le bucket privé `personal-vault` — jamais d'URL publique.

## Installation

```bash
cp .env.example .env.local   # remplir les variables
npm install                  # ou pnpm install
npm run dev                  # http://localhost:3000
```

### Base de données

Ce projet pointe sur le **même projet Supabase que Cantaia** (recommandé — ton compte,
tes emails et tes tokens Microsoft sont réutilisés tels quels). Appliquer dans le
SQL Editor, dans l'ordre :

1. `supabase/migrations/001_personal_hub.sql` — tables documents/emails conservés + bucket `personal-vault`
2. `supabase/migrations/002_personal_hub_v2.sql` — verrou PIN, recherche plein texte, échéances, finances

Si tu utilises un projet Supabase vierge : crée d'abord une table `users`
(`id uuid PK = auth.users.id`, `email text`, `is_superadmin boolean`) et une table
`email_records` minimale, puis applique les 2 migrations. Les sections emails et
archivage auto resteront vides sans le pipeline de sync de Cantaia.

### Connexion

`/login` — email + mot de passe Supabase, ou lien magique. Si ton compte Cantaia a été
créé via OAuth Microsoft, utilise le **lien magique** (pas de mot de passe défini) ou
définis un mot de passe via Supabase Dashboard → Authentication → Users.

## Déploiement (Vercel)

1. Importer le repo dans Vercel
2. Renseigner les variables d'environnement de `.env.example`
3. Deploy — chaque page est `noindex` et tout est derrière l'auth

## Structure

```
src/
├── app/
│   ├── page.tsx              # Hub (emails + coffre-fort)
│   ├── finance/page.tsx      # Suivi financier
│   ├── login/page.tsx        # Connexion Supabase
│   └── api/hub/**            # 13 routes API (documents, emails, lock, export, finance…)
├── components/hub/HubLockGate.tsx
├── lib/
│   ├── supabase/             # clients server/browser/admin/middleware
│   ├── hub/access.ts         # guard superadmin + verrou PIN
│   ├── security/pin.ts       # hash PIN SHA-256 salé
│   ├── microsoft/tokens.ts   # tokens Graph (refresh + chiffrement AES-256-GCM)
│   ├── outlook/graph-client.ts
│   └── emails/eml-generator.ts
└── middleware.ts             # redirection /login si non connecté
supabase/migrations/          # 2 migrations SQL
```
