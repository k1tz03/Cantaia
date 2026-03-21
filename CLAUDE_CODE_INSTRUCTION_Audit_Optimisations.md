# INSTRUCTION CLAUDE CODE — Audit & Optimisations CANTAIA

> Ce document est une instruction d'audit complète.
> Tu ne codes RIEN avant d'avoir terminé l'audit complet.
> Tu produis un rapport structuré avec des recommandations priorisées.
> Chaque recommandation doit être actionable avec le fichier concerné,
> le problème identifié, et la solution proposée.

---

## CONTEXTE

CANTAIA est un SaaS Next.js de gestion de chantier augmenté par IA,
destiné aux chefs de projet construction en Suisse.
Le produit est fonctionnel mais nécessite un audit d'optimisation
avant le lancement commercial.

Stack :
- Next.js (App Router) + React
- Supabase (PostgreSQL, Auth, Storage)
- Tailwind CSS + shadcn/ui
- Anthropic Claude Sonnet 4.5 (IA principale)
- OpenAI Whisper (transcription)
- Framer Motion (animations landing)
- next-intl (i18n FR/EN/DE)

Modules : Mail, Soumissions, Fournisseurs, Prix, Plans, Projets,
Tâches, Réunions/PV, Visites, Chat JM, Briefing, Dashboard, Admin.

---

## TA MISSION

Analyse l'intégralité du codebase et produis un rapport d'audit
organisé en 3 sections :

1. **OPTIMISATION NAVIGATION / UX** — L'expérience utilisateur
2. **OPTIMISATION IA** — La performance et la pertinence de l'IA
3. **OPTIMISATION TECHNIQUE DU SITE** — Performance, sécurité, code

Pour chaque section, tu dois :
- Scanner TOUS les fichiers concernés
- Identifier les problèmes concrets (pas des généralités)
- Proposer des solutions avec le code ou la modification exacte
- Prioriser : 🔴 Critique, 🟠 Important, 🟡 Amélioration, 🟢 Nice-to-have

---

## MÉTHODE DE TRAVAIL

### Étape 1 : Cartographie

Commence par explorer la structure du projet :

```bash
# Structure globale
find . -type f -name "*.tsx" -o -name "*.ts" | head -200
find . -path ./node_modules -prune -o -type f -name "*.tsx" -print | wc -l

# Structure des pages (navigation)
ls -la app/
find app -name "page.tsx" -o -name "layout.tsx" | sort

# Composants partagés
ls -la components/
ls -la components/ui/

# Librairies et modules
ls -la lib/

# Routes API
find app/api -name "route.ts" | sort

# Configuration
cat next.config.js
cat tailwind.config.ts
cat package.json
```

### Étape 2 : Audit fichier par fichier

Pour chaque section ci-dessous, lis les fichiers indiqués et analyse-les
selon les critères donnés.

### Étape 3 : Rapport

Produis le rapport dans un fichier Markdown :
`CANTAIA_AUDIT_OPTIMISATIONS.md` à la racine du projet.

---

## SECTION 1 — OPTIMISATION NAVIGATION / UX

### Fichiers à analyser

```
# Layout principal et navigation
app/layout.tsx
app/(app)/layout.tsx (ou équivalent layout authentifié)
components/Sidebar.tsx (ou navigation principale)
components/MobileNav.tsx (ou navigation mobile)
components/Header.tsx

# Toutes les pages (page.tsx)
find app -name "page.tsx" | sort

# Composants de navigation
find . -path ./node_modules -prune -o -name "*nav*" -print -o -name "*sidebar*" -print -o -name "*menu*" -print -o -name "*breadcrumb*" -print

# Dashboard
app/dashboard/page.tsx

# Redirections et middleware
middleware.ts
```

### Critères d'analyse NAVIGATION

Pour chaque point, vérifie et rapporte :

**1.1 Architecture de navigation**
- La sidebar est-elle collapsable sur desktop ? Le state est-il persisté ?
- Y a-t-il un breadcrumb sur chaque page pour savoir où on est ?
- Les onglets/tabs dans les pages (ex: détail projet) ont-ils des URLs
  distinctes (ex: /projects/123/emails vs /projects/123/tasks) ou
  est-ce du state local qui se perd au refresh ?
- Le bouton retour du navigateur fonctionne-t-il correctement partout ?
- Y a-t-il des raccourcis clavier globaux (Cmd+K pour recherche, etc.) ?

**1.2 Flux utilisateur principal**
- Combien de clics faut-il pour aller de la connexion au premier email classifié ?
- Combien de clics pour créer un projet et y associer des emails ?
- Combien de clics pour lancer une estimation de prix depuis un plan ?
- Y a-t-il des "dead ends" (pages sans action suivante évidente) ?
- Les actions principales sont-elles accessibles en 1-2 clics max ?

**1.3 Responsive et mobile**
- Chaque page a-t-elle un layout mobile dédié ou c'est juste du responsive cassé ?
- Le bottom tab bar mobile couvre-t-il tous les modules principaux ?
- Les tableaux larges (soumissions, fournisseurs) sont-ils scrollables ou
  complètement illisibles sur mobile ?
- Les modals sont-elles adaptées mobile (full-screen au lieu de centré) ?
- Le split-panel email fonctionne-t-il en mode portrait mobile ?

**1.4 Feedback et états**
- Y a-t-il des loading states (skeletons, spinners) sur CHAQUE page ?
- Y a-t-il des empty states explicites (pas de projets, pas d'emails, etc.)
  avec une action claire ("Créez votre premier projet") ?
- Les erreurs sont-elles affichées clairement (toast, inline, etc.) ?
- Y a-t-il des confirmations pour les actions destructives (supprimer) ?
- Les formulaires ont-ils de la validation inline (pas juste au submit) ?

**1.5 Onboarding**
- Un nouveau utilisateur sait-il quoi faire en arrivant sur le dashboard ?
- Y a-t-il un wizard de configuration initiale (connecter email, créer
  premier projet, importer contacts) ?
- Les features complexes (classification IA, estimation prix) ont-elles
  des tooltips ou guides contextuels ?
- Y a-t-il un indicateur de progression de configuration ?

**1.6 Recherche et filtres**
- Y a-t-il une recherche globale (cross-modules) ?
- Les filtres sont-ils persistés dans l'URL (pour partager/bookmarker) ?
- La recherche est-elle debounced (pas d'appel à chaque keystroke) ?
- Les résultats de recherche montrent-ils le module d'origine ?

**1.7 Performance perçue**
- Y a-t-il du prefetching sur les liens de navigation (next/link) ?
- Les transitions entre pages sont-elles fluides ou y a-t-il un flash blanc ?
- Les listes longues (emails, tâches) utilisent-elles de la virtualisation
  (react-window, tanstack-virtual) ou chargent tout d'un coup ?
- Les images/avatars sont-elles optimisées (next/image, lazy loading) ?

---

## SECTION 2 — OPTIMISATION IA

### Fichiers à analyser

```
# Tous les fichiers qui appellent l'API Anthropic/Claude
grep -rl "anthropic\|claude\|ANTHROPIC" lib/ app/api/ --include="*.ts" --include="*.tsx"

# Tous les prompts système
grep -rl "system\|role.*system\|systemPrompt\|system_prompt" lib/ app/api/ --include="*.ts"

# Module Mail (classification)
lib/mail/ ou lib/email/ (trouver le bon chemin)
app/api/mail/ ou app/api/email/

# Module Plans (analyse Vision)
lib/plans/
app/api/plans/

# Module Chat JM
lib/chat/ ou le fichier du chat
app/api/chat/

# Module PV/Réunions
lib/meetings/
app/api/meetings/

# Module Soumissions (extraction)
lib/submissions/
app/api/submissions/

# Module Fournisseurs (recherche/enrichissement IA)
lib/suppliers/
app/api/suppliers/

# Module Briefing
lib/briefing/
app/api/briefing/

# Module Visites
lib/visits/
app/api/visits/

# Module Prix (estimation)
lib/pricing/ ou lib/prix/
app/api/pricing/ ou app/api/prix/
```

### Critères d'analyse IA

**2.1 Qualité des prompts**

Pour CHAQUE prompt système trouvé dans le codebase :
- Le prompt est-il précis ou vague ? (ex: "analyse ce document" = vague)
- Le prompt spécifie-t-il le FORMAT de sortie exact (JSON schema) ?
- Le prompt a-t-il des RÈGLES STRICTES ou laisse-t-il l'IA improviser ?
- Le prompt a-t-il des EXEMPLES (few-shot) pour les cas ambigus ?
- Le prompt spécifie-t-il la LANGUE de sortie ?
- Le prompt a-t-il un RÔLE précis (ex: "métreur suisse 25 ans d'expérience")
  ou juste "tu es un assistant" ?
- Le prompt gère-t-il les CAS LIMITES (que faire si l'info manque) ?
- Le max_tokens est-il calibré (trop bas = réponse tronquée, trop haut = lent) ?

Classe chaque prompt : 🟢 Bon / 🟡 À améliorer / 🔴 À refaire

**2.2 Pipeline de classification email**

Analyse la pipeline L0 → L1 → L2 :
- Le L0 (spam/newsletter) couvre-t-il assez de patterns ?
- Le L1 (mots-clés) a-t-il des faux positifs fréquents ?
- Le L2 (Claude) est-il appelé quand le L1 suffirait ?
  (= gaspillage de tokens/argent)
- Y a-t-il un mécanisme de feedback (correction utilisateur → amélioration) ?
- Les emails en allemand sont-ils bien gérés par le L1 ?
- Le score de confiance est-il utilisé correctement
  (ex: confiance 95% = auto-classifié, confiance 60% = demander confirmation) ?

**2.3 Gestion des tokens et coûts**

- Y a-t-il un comptage de tokens AVANT l'envoi pour éviter de dépasser
  la context window ?
- Les corps d'email sont-ils tronqués intelligemment (garder le haut,
  couper les signatures/disclaimers) ou envoyés en entier ?
- Les pièces jointes sont-elles résumées ou envoyées brutes ?
- Y a-t-il du caching sur les résultats IA identiques (même email reclassifié) ?
- Le streaming SSE (chat JM) est-il correctement implémenté ?
- Les appels API ont-ils un timeout raisonnable ?
- Y a-t-il un rate limiting côté client (empêcher le spam de requêtes IA) ?

**2.4 Robustesse des appels IA**

- Y a-t-il un try/catch sur CHAQUE appel API IA ?
- Y a-t-il un fallback quand l'IA échoue (ex: Sonnet → Haiku) ?
- Les réponses JSON sont-elles validées (schema validation) ou juste parsées
  avec un JSON.parse() qui crash si le format est mauvais ?
- Y a-t-il un mécanisme de retry sur les erreurs 429 (rate limit)
  et 500 (erreur serveur) ?
- Les réponses tronquées (max_tokens atteint) sont-elles détectées
  et re-demandées ?
- Y a-t-il un logging structuré des appels IA (tokens, latence, succès/échec)
  pour le monitoring ?

**2.5 Qualité des résultats IA par module**

Pour chaque module qui utilise l'IA, évalue :
- La sortie est-elle structurée (JSON) ou du texte libre que le frontend
  doit parser à l'arrache ?
- La sortie couvre-t-elle les cas limites (email vide, plan illisible,
  audio inaudible, document non-construction) ?
- Le résultat est-il utilisé directement ou y a-t-il un post-traitement ?
- Le résultat est-il affiché avec un indicateur de confiance ?

**2.6 Optimisations IA spécifiques à proposer**

- Prompt caching : les prompts systèmes sont-ils envoyés en cache
  (Anthropic prompt caching) pour réduire coûts et latence ?
- Batch processing : les emails en attente de classification L2 sont-ils
  batchés ou envoyés un par un ? (batcher = moins de cold starts)
- Modèle adaptatif : les tâches simples (résumé email court) utilisent-elles
  Haiku au lieu de Sonnet pour économiser ?
- Pre-processing : les corps d'email sont-ils nettoyés (HTML → texte,
  suppression signatures, suppression disclaimers) AVANT l'envoi à l'IA ?
- Context stuffing : les longs threads email sont-ils résumés avant envoi
  ou envoyés en entier (= gaspillage de tokens sur le reply chain) ?

---

## SECTION 3 — OPTIMISATION TECHNIQUE DU SITE

### Fichiers à analyser

```
# Configuration
next.config.js
tailwind.config.ts
tsconfig.json
package.json
.env.local (structure, pas les valeurs)

# Middleware
middleware.ts

# Pages principales (performance)
app/layout.tsx
app/page.tsx (landing)
app/dashboard/page.tsx
app/mail/page.tsx

# API routes les plus appelées
app/api/email/sync/route.ts
app/api/email/classify/route.ts
app/api/chat/route.ts

# Supabase
lib/supabase/ ou utils/supabase/
supabase/migrations/ (les dernières)

# Composants lourds
find . -path ./node_modules -prune -o -name "*.tsx" -print -exec wc -l {} + | sort -rn | head -20
```

### Critères d'analyse TECHNIQUE

**3.1 Performance Next.js**

- Les pages statiques (landing, pricing, docs) utilisent-elles SSG
  ou sont-elles rendues côté serveur à chaque requête ?
- Les composants lourds (éditeur email, kanban, tableaux) sont-ils
  en `dynamic(() => import(...), { ssr: false })` pour ne pas bloquer
  le premier render ?
- Y a-t-il des `use client` inutiles sur des composants qui pourraient
  être des Server Components ?
- Les images utilisent-elles `next/image` avec width/height explicites ?
- Le bundle JS est-il analysé (next/bundle-analyzer) ?
  Quels sont les plus gros chunks ?
- Y a-t-il des imports de librairies entières au lieu de tree-shaking ?
  (ex: `import _ from 'lodash'` au lieu de `import debounce from 'lodash/debounce'`)
- Les fonts (Playfair Display, Inter, JetBrains Mono) sont-elles optimisées
  avec `next/font` ou chargées via Google Fonts externe ?

**3.2 Performance Supabase / BDD**

- Les requêtes Supabase ont-elles des `.select()` ciblés ou font-elles
  des `select('*')` qui ramènent toutes les colonnes ?
- Y a-t-il des requêtes N+1 ? (boucle qui fait 1 requête par élément
  au lieu d'une seule requête avec filtre)
- Les tables principales ont-elles les bons index ?
  Vérifie en particulier :
  - `email_records` : index sur (org_id, project_id, triage_status, created_at)
  - `tasks` : index sur (project_id, status, due_date)
  - `suppliers` : index sur (org_id, specialties, region)
- Y a-t-il de la pagination sur les listes longues (emails, tâches) ou
  tout est chargé d'un coup ?
- Les données temps-réel (Supabase Realtime) sont-elles utilisées
  là où c'est pertinent (nouveaux emails, changement statut tâche) ?
- Y a-t-il du RLS (Row Level Security) sur TOUTES les tables sensibles ?
  Vérifie chaque table.

**3.3 Sécurité**

- Les tokens Microsoft/Google sont-ils stockés chiffrés en BDD
  ou en clair ?
- Les routes API vérifient-elles TOUTES la session ET l'org_id ?
  Cherche des routes qui oublient la vérification.
- Y a-t-il des données sensibles dans le code côté client
  (clés API, secrets dans les composants React) ?
- Les inputs utilisateur sont-ils sanitisés (XSS, SQL injection) ?
- Le CORS est-il configuré correctement ?
- Les webhooks (Stripe, Microsoft) vérifient-ils la signature ?
- Y a-t-il des routes API publiques qui devraient être protégées ?

**3.4 Gestion d'erreurs**

- Y a-t-il un error boundary global (app/error.tsx) ?
- Y a-t-il des error boundaries par module ?
- Les erreurs API sont-elles catchées et affichées correctement
  au lieu d'un écran blanc ?
- Les erreurs Supabase sont-elles loguées quelque part
  (Sentry, LogRocket, ou au minimum console structurée) ?
- Y a-t-il un not-found.tsx pour les 404 ?

**3.5 Code quality**

- Y a-t-il des fichiers de plus de 500 lignes qui devraient être découpés ?
- Y a-t-il de la duplication de code (même logique dans plusieurs fichiers) ?
- Les types TypeScript sont-ils stricts (pas de `any` partout) ?
  Compte le nombre de `any` dans le codebase.
- Y a-t-il des TODO/FIXME/HACK oubliés dans le code ?
- Les variables d'environnement sont-elles typées (env.ts ou zod schema) ?
- Y a-t-il des console.log de debug qui traînent en production ?

**3.6 SEO et Landing Page**

- La landing page a-t-elle des meta tags (title, description, OG) ?
- Y a-t-il un sitemap.xml et un robots.txt ?
- Les pages publiques ont-elles des balises structurées (schema.org) ?
- La landing est-elle rapide ? (pas de JS lourd au chargement initial)
- Les animations Framer Motion bloquent-elles le premier render ?
- Y a-t-il un favicon et des icônes PWA configurés ?

**3.7 Internationalisation**

- Toutes les strings visibles sont-elles traduites via next-intl
  ou y a-t-il du texte en dur en français dans les composants ?
- Les 3 langues (FR, EN, DE) ont-elles la même couverture
  ou il manque des traductions ?
- Les formats de date/nombre/monnaie respectent-ils la locale ?
  (ex: 1'234'567 CHF en suisse, pas 1,234,567)
- Le sélecteur de langue est-il accessible facilement ?

**3.8 Accessibilité (a11y)**

- Les éléments interactifs ont-ils des labels ARIA ?
- Les couleurs ont-elles un contraste suffisant (WCAG AA) ?
  Vérifie en particulier Gold (#C4A661) sur blanc/crème
- La navigation au clavier fonctionne-t-elle (Tab, Enter, Escape) ?
- Les images ont-elles des alt texts ?
- Les formulaires ont-ils des labels associés aux inputs ?

---

## FORMAT DU RAPPORT

Produis le rapport dans `CANTAIA_AUDIT_OPTIMISATIONS.md` avec cette structure :

```markdown
# CANTAIA — Rapport d'Audit & Optimisations
> Date : [date]
> Fichiers analysés : [nombre]
> Routes API : [nombre]
> Composants React : [nombre]

## Résumé exécutif
- X optimisations critiques 🔴
- X optimisations importantes 🟠
- X améliorations 🟡
- X nice-to-have 🟢
- Estimation effort total : X jours de développement

---

## 1. NAVIGATION / UX

### 1.1 [Titre du point]
- **Priorité** : 🔴 Critique
- **Fichier(s)** : `app/mail/page.tsx`, `components/Sidebar.tsx`
- **Problème** : [description précise du problème observé dans le code]
- **Impact utilisateur** : [ce que l'utilisateur subit concrètement]
- **Solution proposée** : [description de la solution]
- **Code suggéré** :
  ```tsx
  // Avant
  [code actuel problématique]

  // Après
  [code corrigé]
  ```
- **Effort estimé** : 2h

[Répéter pour chaque point]

---

## 2. OPTIMISATION IA

### 2.1 [Titre du point]
[Même structure]

---

## 3. OPTIMISATION TECHNIQUE

### 3.1 [Titre du point]
[Même structure]

---

## 4. PLAN D'ACTION PRIORISÉ

| # | Section | Titre | Priorité | Effort | Impact |
|---|---------|-------|----------|--------|--------|
| 1 | IA | Refonte prompt classification | 🔴 | 4h | Haute |
| 2 | Tech | Ajout index BDD manquants | 🔴 | 1h | Haute |
| 3 | UX | Empty states sur toutes les pages | 🟠 | 6h | Moyenne |
| ... | | | | | |

Ordonné par : Critique d'abord, puis par ratio impact/effort décroissant.
```

---

## RÈGLES

- Ne propose PAS de solutions génériques ("il faudrait optimiser").
  Chaque recommandation doit pointer vers un fichier PRÉCIS avec
  le problème EXACT trouvé dans le code.
- Si tu trouves un prompt IA qui est bon, dis-le aussi. L'audit
  n'est pas que négatif — signaler ce qui marche bien aide à savoir
  quoi ne pas toucher.
- Pour les prompts IA, recopie le prompt actuel ET propose le prompt
  amélioré côte à côte pour que la différence soit visible.
- Le rapport doit être EXHAUSTIF. Mieux vaut 80 points que 15.
  Le but est de ne rien rater.
- Chaque point du rapport doit avoir une estimation d'effort en heures
  pour permettre la planification.
- Ne modifie AUCUN fichier du projet pendant l'audit.
  Tu ANALYSES et tu RAPPORTES. Les modifications viendront après.

---

## COMMANDE DE LANCEMENT

Commence par la cartographie (Étape 1), puis analyse section par section.
Prends ton temps — la qualité du rapport est plus importante que la vitesse.
Quand tu as terminé l'audit complet, crée le fichier rapport et présente
un résumé avec les 5 optimisations les plus critiques.
