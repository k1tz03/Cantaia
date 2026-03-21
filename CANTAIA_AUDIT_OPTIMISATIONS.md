# CANTAIA — Rapport d'Audit & Optimisations

> **Date** : 2026-03-05
> **Auditeur** : Claude Opus 4.6
> **Fichiers analysés** : 567 (TS/TSX)
> **Routes API** : ~95+
> **Composants React** : ~55
> **Pages** : ~70

---

## Résumé exécutif

| Priorité | Nombre |
|----------|--------|
| Critiques | 13 |
| Importants | 21 |
| Améliorations | 24 |
| Nice-to-have | 12 |

**Estimation effort total** : ~175h de développement (~22 jours)
**Dont items critiques seuls** : ~50h (~6 jours)

### Métriques clés identifiées

| Métrique | Valeur | Statut |
|----------|--------|--------|
| `select("*")` dans les routes API | 57+ occurrences | Critique |
| `any` TypeScript | 128+ occurrences (30 fichiers) | Amélioration |
| `console.log/warn/error` | 103+ occurrences (30 fichiers) | Important |
| Fichiers > 800 lignes | 9 fichiers | Important |
| Fichier le plus long | `cantaia-prix/page.tsx` — 2160 lignes | Critique |
| Empty states utilisés | 0 (composant existe mais jamais importé) | Important |
| Skeletons / loading.tsx | 0 | Important |
| Breadcrumbs | 0 | Important |
| Debounce | 0 | Amélioration |
| Virtualisation listes | 0 | Amélioration |
| Dynamic imports | 0 | Amélioration |
| Sitemap / robots.txt | 0 | Critique |
| OpenGraph tags | 0 | Critique |
| Favicon / PWA manifest | 0 | Critique |
| Sentry / monitoring | 0 | Critique |
| not-found.tsx | 0 | Amélioration |
| Prompt caching Anthropic | 0 | Critique |
| Fallback modèle IA | 0 | Critique |
| Retry/backoff IA | 0 | Critique |

### Ce qui est bien fait (ne pas toucher)

- **Prompt classification email** (`prompts.ts:15-113`) : 3 cas, 8 règles, few-shot, JSON schema, multilingue
- **Prompt chat JM** (`prompts.ts:471-650`) : encyclopédie SIA, restriction professionnelle, 180 lignes
- **Prompt plan analysis** (`prompts.ts:285-458`) : gestion vues multiples, déduplication, 8 types de plans
- **RLS Supabase** : activé sur toutes les tables sensibles (002_rls_policies.sql + migrations suivantes)
- **Auth middleware** (`middleware.ts`) : structure solide avec subdomain multi-tenant, 5-tier org resolution
- **Fonts** : optimisées via `next/font/google` avec `display: "swap"` (layout.tsx:8-23)
- **Landing** : Server Components, pas de `"use client"` sur la page principale
- **Usage tracking IA** : tracking coûts CHF fire-and-forget sur tous les appels
- **Keyboard shortcuts email** : j/k/e/r/a/s/Esc implementés (`useEmailKeyboardShortcuts.ts`)
- **Classification L0 locale** : algorithme de scoring robuste avec 9 règles (email-classifier.ts:205-382)
- **Zod validation** : réponses IA validées avec schema pour classification, tasks, plans
- **DOMPurify** : emails HTML sanitisés avec whitelist stricte (EmailDetailPanel.tsx:593-595)
- **localStorage persistance** : largeur panel mail, vue projets/tâches/plans

---

## 1. NAVIGATION / UX

### 1.1 Sidebar collapse non persisté

- **Priorité** : Amélioration
- **Fichier(s)** : `apps/web/src/components/app/Sidebar.tsx:42`
- **Problème** : `const [collapsed, setCollapsed] = useState(false)` — l'état collapsed est en state local. Au refresh, la sidebar revient toujours à l'état ouvert.
- **Impact utilisateur** : Frustration pour les utilisateurs qui préfèrent la sidebar réduite.
- **Solution proposée** : Persister dans localStorage comme pour `cantaia_mail_list_width`.
- **Code suggéré** :

```tsx
// Avant
const [collapsed, setCollapsed] = useState(false);

// Après
const [collapsed, setCollapsed] = useState(() => {
  if (typeof window !== "undefined") {
    return localStorage.getItem("cantaia_sidebar_collapsed") === "true";
  }
  return false;
});
useEffect(() => {
  localStorage.setItem("cantaia_sidebar_collapsed", String(collapsed));
}, [collapsed]);
```

- **Effort estimé** : 0.5h

---

### 1.2 Aucun breadcrumb dans l'application

- **Priorité** : Important
- **Fichier(s)** : Toutes les pages (aucun fichier breadcrumb trouvé)
- **Problème** : Grep pour "breadcrumb" retourne 0 résultat. Sur les pages imbriquées (`/projects/[id]`, `/meetings/[id]`, `/plans/[id]`), l'utilisateur ne sait pas où il se trouve dans l'arborescence. Les pages de détail n'ont qu'un bouton ArrowLeft, pas de fil d'Ariane.
- **Impact utilisateur** : Perte de repères, difficulté à remonter dans la navigation.
- **Solution proposée** : Créer un composant `Breadcrumb` basé sur le pathname et l'intégrer dans le layout `(app)`.
- **Effort estimé** : 4h

---

### 1.3 Onglets projet en state local, pas en URL

- **Priorité** : Important
- **Fichier(s)** : `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx:59`
- **Problème** : `const [activeTab, setActiveTab] = useState<string>("overview")` — les 10 onglets du projet (overview, emails, tasks, meetings, visits, submissions, plans, prix, archiving, closure) sont gérés en state local. Le refresh ramène toujours à "overview". Le lien `/projects/123` ne peut pas pointer vers un onglet précis.
- **Impact utilisateur** : On ne peut pas partager un lien vers l'onglet emails d'un projet, ni bookmarker. Le back navigateur ne fonctionne pas entre onglets.
- **Solution proposée** : Utiliser `useSearchParams` comme déjà fait dans `settings/page.tsx:64` (`searchParams.get("tab")`).
- **Effort estimé** : 2h

---

### 1.4 Aucun raccourci clavier global / recherche Cmd+K

- **Priorité** : Amélioration
- **Fichier(s)** : Aucun fichier `CommandDialog` ou `cmdk` trouvé
- **Problème** : Pas de Cmd+K pour recherche globale, pas de raccourcis pour naviguer entre modules. Les raccourcis clavier n'existent que pour le module email (`useEmailKeyboardShortcuts.ts` : j/k/e/r/a/s).
- **Impact utilisateur** : Les power users (chefs de projet) doivent tout faire à la souris.
- **Solution proposée** : Installer `cmdk` et créer un `CommandPalette` global avec recherche cross-modules (projets, emails, tâches, fournisseurs).
- **Effort estimé** : 8h

---

### 1.5 Navigation mobile limitée à 5 items

- **Priorité** : Amélioration
- **Fichier(s)** : `apps/web/src/components/app/Sidebar.tsx:159-164`
- **Problème** : Le bottom nav mobile ne couvre que Dashboard, Mail, Projects, Tasks, Settings. Les 5 autres modules (Plans, Submissions, Suppliers, Prix, PV) sont inaccessibles sur mobile sans taper l'URL.
- **Impact utilisateur** : 50% des modules manquants sur mobile.
- **Solution proposée** : Ajouter un bouton "Plus" (menu hamburger) qui affiche les modules restants en sheet bottom.
- **Effort estimé** : 3h

---

### 1.6 Email detail caché sur tablette (breakpoint md)

- **Priorité** : Important
- **Fichier(s)** : `apps/web/src/app/[locale]/(app)/mail/page.tsx:293-299`
- **Problème** : `selectedEmail ? "hidden lg:flex" : "w-full"` — sur les écrans md (tablettes, petits laptops 768-1024px), le panel de détail d'email est CACHÉ même quand un email est sélectionné.
- **Impact utilisateur** : Impossible de lire un email sur tablette.
- **Solution proposée** : Afficher le panel en plein écran (overlay) sur md, ou ajuster le breakpoint.
- **Effort estimé** : 2h

---

### 1.7 Aucun empty state utilisé

- **Priorité** : Important
- **Fichier(s)** : `apps/web/src/components/ui/EmptyState.tsx` (composant créé mais jamais importé)
- **Problème** : Le composant EmptyState existe avec action CTA, mais grep `"EmptyState"` ne retourne qu'une seule occurrence (sa propre définition). Aucune page ne l'utilise. Certaines pages ont des empty states custom (mail, projects) mais d'autres (suppliers) n'en ont pas.
- **Impact utilisateur** : Pages vides sans guidance : un nouvel utilisateur voit des listes vides sans savoir quoi faire.
- **Solution proposée** : Intégrer EmptyState dans chaque page de liste (mail, projects, tasks, plans, submissions, suppliers) avec des CTA contextuels.
- **Effort estimé** : 4h

---

### 1.8 Aucun loading state / skeleton

- **Priorité** : Important
- **Fichier(s)** : Aucun fichier `loading.tsx` trouvé, aucun import "Skeleton" trouvé
- **Problème** : Pas de `loading.tsx` dans aucun route group, pas de composant skeleton. Les pages chargent avec un `Loader2` spinner au mieux, ou un flash blanc au pire. Le changement d'onglet dans project detail n'a aucun feedback visuel pendant le chargement des données.
- **Impact utilisateur** : Perception de lenteur, CLS (Cumulative Layout Shift) élevé.
- **Solution proposée** : Ajouter des `loading.tsx` dans `(app)/`, `(admin)/`, et des skeletons pour les listes.
- **Effort estimé** : 6h

---

### 1.9 Pas de toast notifications pour erreurs API

- **Priorité** : Critique
- **Fichier(s)** : Toutes les pages avec fetch API
- **Problème** : Les échecs d'appels API sont silencieux côté utilisateur. Les erreurs sont logguées en console uniquement. Pas de système toast/snackbar implémenté.
- **Impact utilisateur** : L'utilisateur ne sait pas quand une action échoue (sync email, classification, sauvegarde).
- **Solution proposée** : Installer `sonner` ou utiliser Radix Toast, et wrapper les fetch avec notification d'erreur.
- **Effort estimé** : 3h

---

### 1.10 Pas de page 404 personnalisée

- **Priorité** : Amélioration
- **Fichier(s)** : Aucun `not-found.tsx` trouvé
- **Problème** : Les URLs invalides affichent la 404 Next.js par défaut, hors de la charte graphique.
- **Impact utilisateur** : Décrochage et impression d'application non professionnelle.
- **Solution proposée** : Créer `app/[locale]/not-found.tsx` avec un CTA de retour au dashboard.
- **Effort estimé** : 1h

---

### 1.11 Aucune recherche debounced

- **Priorité** : Amélioration
- **Fichier(s)** : Grep pour `debounce` dans tout le codebase → 0 résultat
- **Problème** : La recherche email (`mail/page.tsx`) fait un appel API (`/api/email/search`) potentiellement à chaque keystroke. Note : la recherche mail soumet sur Enter, ce qui atténue le problème, mais d'autres recherches pourraient ne pas le faire.
- **Impact utilisateur** : Appels API inutiles, latence perçue, coûts serveur.
- **Solution proposée** : Ajouter un `useDebounce` hook (300ms) sur les champs de recherche.
- **Effort estimé** : 1h

---

### 1.12 Aucune virtualisation des listes longues

- **Priorité** : Amélioration
- **Fichier(s)** : Grep pour `react-window`, `tanstack-virtual`, `react-virtualized` → 0 résultat
- **Problème** : Les listes d'emails, tâches, fournisseurs rendent tous les items dans le DOM. Avec 200+ emails ou 100+ tâches, les performances vont se dégrader.
- **Impact utilisateur** : Lenteur sur les comptes avec beaucoup de données.
- **Solution proposée** : Installer `@tanstack/react-virtual` pour les listes de mail, tâches, et soumissions.
- **Effort estimé** : 6h

---

### 1.13 Aucun onboarding / wizard

- **Priorité** : Important
- **Fichier(s)** : `apps/web/src/app/[locale]/(app)/dashboard/page.tsx`
- **Problème** : Le dashboard est une grille de 9 cartes de navigation. Aucun indicateur de configuration, pas de wizard "connectez votre email, créez votre premier projet". Pas de détection "first-time user".
- **Impact utilisateur** : Taux d'abandon élevé des nouveaux utilisateurs qui ne savent pas par où commencer.
- **Solution proposée** : Ajouter un composant `OnboardingChecklist` en haut du dashboard qui affiche les étapes complétées (email connecté, premier projet créé, etc.).
- **Effort estimé** : 8h

---

### 1.14 Pas de prefetching / dynamic imports

- **Priorité** : Amélioration
- **Fichier(s)** : Grep pour `dynamic(` → 0 résultat
- **Problème** : Aucun composant n'utilise `dynamic(() => import(...), { ssr: false })`. Les composants lourds comme `recharts`, `dnd-kit`, `jspdf`, `xlsx`, `papaparse` sont bundlés dans le JS initial.
- **Impact utilisateur** : Bundle JS lourd, temps de chargement initial élevé.
- **Solution proposée** : Utiliser `dynamic` pour les pages qui importent recharts (dashboard charts), dnd-kit (submissions), xlsx (exports).
- **Effort estimé** : 3h

---

### 1.15 Filtres non persistés dans l'URL

- **Priorité** : Amélioration
- **Fichier(s)** : `apps/web/src/app/[locale]/(app)/mail/page.tsx:71-80`
- **Problème** : Les filtres (tab active, projet filtré, ordre de tri) sont en state local. Seul `cantaia-prix` et `settings` utilisent `searchParams`.
- **Impact utilisateur** : Impossible de partager un lien vers "mes emails du projet X triés par date".
- **Solution proposée** : Migrer les filtres vers `useSearchParams` + `router.push()`.
- **Effort estimé** : 3h

---

### 1.16 Aucune confirmation pour actions destructives

- **Priorité** : Important
- **Fichier(s)** : Multiple pages avec suppression
- **Problème** : Pas de dialog de confirmation uniforme. Certaines pages utilisent `confirm()` natif (tasks:271), d'autres ont un dialog custom (PV), d'autres n'ont rien.
- **Impact utilisateur** : Risque de suppression accidentelle de données critiques.
- **Solution proposée** : Créer un composant `ConfirmDialog` uniforme et l'utiliser systématiquement.
- **Effort estimé** : 3h

---

## 2. OPTIMISATION IA

### 2.1 Prompt classification email

- **Priorité** : Bon — ne pas modifier
- **Fichier** : `packages/core/src/ai/prompts.ts:15-113`
- **Rating** : BON
- **Constat** : Prompt très bien structuré :
  - Rôle précis ("expert en gestion de projets de construction suisse")
  - 3 cas distincts (A/B/C) avec critères clairs
  - 8 règles strictes avec exemples
  - Format JSON exact avec schema
  - Gestion des edge cases (email vide, transferts, TR:/RE:/FW:)
  - Résumé multilingue (FR/EN/DE)
  - Extraction de tâche intégrée
- **Point d'attention** : Le prompt fait ~2800 tokens et est envoyé en entier à chaque classification. Le prompt caching Anthropic (point 2.12) résoudrait ce coût.

---

### 2.2 Prompt task extraction — à améliorer

- **Priorité** : Amélioration
- **Fichier** : `packages/core/src/ai/prompts.ts:122-153`
- **Rating** : A AMELIORER
- **Problème** : Prompt basique comparé au classificateur. Pas d'exemples few-shot, pas de rôle précis, pas de gestion des emails en allemand, pas de confiance par tâche, pas de `source_quote` dans la réponse effective.
- **Solution proposée** : Enrichir avec un rôle spécifique, des exemples few-shot, un champ confidence par tâche, le `source_quote` du schema.
- **Effort estimé** : 2h

---

### 2.3 Prompt PV génération

- **Priorité** : Bon — ne pas modifier
- **Fichier** : `packages/core/src/ai/prompts.ts:166-225`
- **Rating** : BON
- **Constat** : Bon prompt avec structure JSON claire, gestion des participants, séparation décisions/discussions, langue paramétrique.

---

### 2.4 Prompt briefing — à améliorer

- **Priorité** : Amélioration
- **Fichier** : `packages/core/src/ai/prompts.ts:233-269`
- **Rating** : A AMELIORER
- **Problème** : Le prompt ne spécifie pas la langue de sortie (hardcodé en français). Le ton est défini mais manque d'exemples de briefing attendu. Le `max_tokens=4096` est sur-dimensionné pour un output de ~2KB.
- **Solution proposée** : Ajouter un paramètre `language`, un exemple de briefing idéal, réduire `max_tokens` à 2048.
- **Effort estimé** : 1h

---

### 2.5 Prompt plan analysis

- **Priorité** : Excellent — ne pas modifier
- **Fichier** : `packages/core/src/ai/prompts.ts:285-458`
- **Rating** : EXCELLENT
- **Constat** : Prompt exceptionnel (~175 lignes, ~5500 tokens). Rôle de métreur suisse 20 ans, gestion des vues multiples avec règle absolue contre le double-comptage, détection d'échelle exhaustive (7 emplacements possibles), 8 types de plans spécialisés, format JSON complet avec confidence par quantité. C'est le prompt le plus abouti du codebase.
- **Point d'attention** : Ce prompt massif bénéficierait énormément du prompt caching.

---

### 2.6 Prompt chat JM

- **Priorité** : Excellent — ne pas modifier
- **Fichier** : `packages/core/src/ai/prompts.ts:471-650`
- **Rating** : EXCELLENT
- **Constat** : Prompt massif (~180 lignes) avec connaissance encyclopédique des normes SIA (102, 103, 108, 112, 113, 118, 180-267, 380-480, 416, 430), codes CFC complets, restriction professionnelle, méthodologie "SIA-first", connaissance de la plateforme Cantaia.
- **Point d'attention** : Le system prompt est généré par requête mais identique pour un même projet. Le prompt caching est critique ici (~1200 tokens de system + context).

---

### 2.7 Prompt estimation prix

- **Priorité** : Bon — ne pas modifier
- **Fichier** : `packages/core/src/ai/prompts.ts:665-719`
- **Rating** : BON
- **Constat** : Prix de référence suisses intégrés (16 catégories avec fourchettes), vérifications de prix aberrants (>500 CHF/m2, >20'000 CHF/pce), règles critiques claires. Bon prompt.

---

### 2.8 Prompt supplier search — à améliorer

- **Priorité** : Amélioration
- **Fichier** : `packages/core/src/ai/prompts.ts:734-774`
- **Rating** : A AMELIORER
- **Problème** : Demande des entreprises "RÉELLES et VÉRIFIABLES" mais un LLM ne peut pas garantir que ses données d'entraînement sont à jour. Risque d'hallucination de fournisseurs avec des coordonnées inventées.
- **Solution proposée** : Ajouter un disclaimer "Vérifier l'existence" dans le résultat affiché à l'utilisateur, baisser la confidence par défaut, ajouter "Ne jamais inventer d'informations de contact — n'inclure que ce dont tu es certain à 90%+".
- **Effort estimé** : 1.5h

---

### 2.9 Prompt supplier enrichment — à améliorer

- **Priorité** : Amélioration
- **Fichier** : `packages/core/src/ai/prompts.ts:787-816`
- **Rating** : A AMELIORER
- **Problème** : Même risque d'hallucination que le prompt de recherche. Le prompt demande des informations complémentaires mais le LLM peut inventer des données (email, téléphone, année de fondation).
- **Solution proposée** : Renforcer la règle "Ne jamais inventer d'informations de contact".
- **Effort estimé** : 0.5h

---

### 2.10 Prompt reply generation — à améliorer

- **Priorité** : Amélioration
- **Fichier** : `packages/core/src/ai/reply-generator.ts:83-144`
- **Rating** : A AMELIORER
- **Problème** :
  - Contradiction : "Tu dois TOUJOURS générer une réponse" vs `__NO_REPLY_NEEDED__` marker
  - Output = free text sans JSON schema = structure imprévisible
  - `max_tokens=1024` sur-dimensionné (réponses typiquement 100-400 tokens)
  - Ne détecte pas la langue de l'email entrant (toujours FR)
- **Solution proposée** : Clarifier les cas NO_REPLY, réduire `max_tokens` à 600, ajouter détection de langue.
- **Effort estimé** : 2h

---

### 2.11 Aucun fallback de modèle IA

- **Priorité** : Critique
- **Fichier(s)** : Tous les fichiers dans `packages/core/src/ai/`
- **Problème** : Tous les appels utilisent `claude-sonnet-4-5-20250929` sans fallback. Si le modèle est surchargé (429) ou en erreur (500), la fonctionnalité tombe en panne sans alternative. Le Graph API client (`graph-client.ts:296`) a un retry avec backoff, mais PAS les appels Anthropic.
- **Impact utilisateur** : Classification, chat, PV, plans — tout plante simultanément.
- **Solution proposée** : Implémenter un fallback `Sonnet → Haiku` pour les tâches non critiques, et un retry avec backoff exponentiel pour les 429/500.
- **Code suggéré** :

```typescript
async function callAnthropicWithRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; backoff?: number[] } = {}
): Promise<T> {
  const { maxRetries = 3, backoff = [1000, 3000, 5000] } = options;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (i === maxRetries) throw err;
      const status = err?.status || err?.statusCode;
      if (status === 429 || status >= 500) {
        await new Promise(r => setTimeout(r, backoff[i] || 5000));
        continue;
      }
      throw err; // 400, 401 = don't retry
    }
  }
  throw new Error("Unreachable");
}
```

- **Effort estimé** : 4h

---

### 2.12 Aucun retry / backoff sur les appels Anthropic

- **Priorité** : Critique
- **Fichier(s)** : `email-classifier.ts:92-152`, `chat-service.ts:30-36`, `reply-generator.ts:167-176`, `plan-analyzer.ts`, `task-extractor.ts`
- **Problème** : Les appels Claude sont dans un simple `try/catch` qui retourne un résultat par défaut en cas d'erreur. Aucun retry sur erreur 429 (rate limit), 500 (serveur), ou timeout réseau.
- **Impact utilisateur** : Erreurs transitoires qui auraient réussi au 2ème essai causent des échecs silencieux.
- **Solution proposée** : Wrapper commun `callAnthropicWithRetry()` (voir code 2.11).
- **Effort estimé** : 3h (combiné avec 2.11)

---

### 2.13 Aucun prompt caching Anthropic

- **Priorité** : Critique
- **Fichier(s)** : Tous les AI clients
- **Problème** : Grep pour `cache_control`, `prompt-caching` → 0 résultat. Les system prompts (surtout le chat JM de 180 lignes ~1200 tokens et le plan analysis de 175 lignes ~5500 tokens) sont envoyés en intégralité à chaque requête. Le prompt de classification (~2800 tokens) est identique pour chaque email d'un même utilisateur.
- **Impact** : Coûts IA ~2x supérieurs au nécessaire, latence +300ms par appel.
- **Économie estimée** :
  - Classification : 2700 tokens × 100K appels/mois × $0.003/1K = **~$8,100/mois** économisés (90% réduction)
  - Plans : 5400 tokens × 10K plans/mois × $0.003/1K = **~$1,620/mois**
  - **Total potentiel : ~$10K/mois**
- **Solution proposée** : Activer le prompt caching Anthropic avec `cache_control: { type: "ephemeral" }` sur les blocs system.
- **Code suggéré** :

```typescript
// Dans email-classifier.ts
const response = await client.messages.create({
  model,
  max_tokens: 600,
  messages: [{
    role: "user",
    content: [{
      type: "text",
      text: prompt,
      cache_control: { type: "ephemeral" } // cache 5 min
    }]
  }],
});
```

- **Effort estimé** : 2h

---

### 2.14 Pas de modèle adaptatif (Haiku pour tâches simples)

- **Priorité** : Critique
- **Fichier(s)** : Tous les AI clients
- **Problème** : Chaque appel IA utilise Sonnet ($3/M input, $15/M output). Les tâches simples pourraient utiliser Haiku ($0.80/M input, $4/M output) à ~70% moins cher.
- **Solution proposée** :
  - **Haiku** : task extraction, supplier enrichment, briefing
  - **Sonnet** : classification email, reply generation, price extraction
  - **Sonnet (vision)** : plan analysis
- **Économie estimée** : ~$6,400/mois (40% du total IA)
- **Effort estimé** : 4h (+ 4h de tests A/B pour valider la qualité)

---

### 2.15 Corps d'email non nettoyé avant envoi IA

- **Priorité** : Important
- **Fichier(s)** : `email-classifier.ts:85`, `reply-generator.ts`, `extract-tasks/route.ts`
- **Problème** :
  - `bodyContent.substring(0, 10000)` — tronqué à 10k caractères bruts, pas nettoyé
  - Tailles de troncation incohérentes : 10K (classifier), 8K (reply), 10K (tasks), illimité (briefing)
  - Les signatures email, disclaimers juridiques, chaînes de reply (>>) consomment des tokens inutiles
  - 3 fonctions `stripHtml()` quasi identiques dupliquées dans les routes API
- **Impact** : Gaspillage de tokens (coûts), pollution du contexte (qualité).
- **Solution proposée** : Créer un `cleanEmailForAI()` utilitaire unique.
- **Code suggéré** :

```typescript
function cleanEmailForAI(html: string, maxChars: number = 8000): string {
  // 1. Strip HTML
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                  .replace(/<[^>]+>/g, ' ')
                  .replace(/&nbsp;/g, ' ')
                  .replace(/\s+/g, ' ');

  // 2. Remove email signature
  text = text.split(/^--\s*$/m)[0];

  // 3. Remove legal disclaimers
  const disclaimerPatterns = [
    /Ce message est confidentiel[\s\S]*/i,
    /This email is confidential[\s\S]*/i,
    /Diese Nachricht ist vertraulich[\s\S]*/i,
  ];
  for (const p of disclaimerPatterns) {
    text = text.replace(p, '');
  }

  // 4. Truncate intelligently (at sentence boundary)
  if (text.length > maxChars) {
    const truncated = text.substring(0, maxChars);
    const lastSentence = truncated.lastIndexOf('.');
    return lastSentence > maxChars * 0.8
      ? truncated.substring(0, lastSentence + 1)
      : truncated;
  }
  return text.trim();
}
```

- **Effort estimé** : 3h

---

### 2.16 Aucun timeout sur les appels IA

- **Priorité** : Important
- **Fichier(s)** : Tous les AI clients — Grep `AbortController|timeout` → 0 résultat
- **Problème** : Les appels Claude n'ont pas de timeout explicite. Un appel bloqué peut geler la requête API pendant 10+ minutes (la limite Vercel `maxDuration = 60` dans certaines routes est le seul garde-fou).
- **Solution proposée** : Ajouter un `AbortController` avec un timeout de 30s pour les appels non-streaming, 60s pour les streaming.
- **Effort estimé** : 2h

---

### 2.17 Console.log de debug intensifs dans les services IA

- **Priorité** : Important
- **Fichier(s)** : `email-classifier.ts` (7 console.log), `reply-generator.ts` (7 console.log), `plan-analyzer.ts` (3 console.log)
- **Problème** : 17+ console.log de debug dans les services IA qui seront exécutés en production. Cela fuit de l'information sensible (contenus email, résultats IA bruts) dans les logs serveur.
- **Solution proposée** : Remplacer par le logger structuré existant (`@/lib/logger.ts`) ou conditionner avec `NODE_ENV === "development"`.
- **Effort estimé** : 1h

---

### 2.18 Réponse JSON parsée sans robustesse suffisante

- **Priorité** : Amélioration
- **Fichier(s)** : `email-classifier.ts:127`
- **Problème** : Le parsing gère les code blocks markdown et utilise Zod pour validation (bon), mais `JSON.parse(jsonStr)` crashera si Claude retourne du JSON invalide (trailing comma, commentaires). Pas de fallback JSON repair. Quand le parse ou la validation échoue, TOUTES les données sont perdues (retour au DEFAULT_RESULT).
- **Solution proposée** : Ajouter un try/catch spécifique avec tentative d'extraction du premier objet JSON.
- **Code suggéré** :

```typescript
// Avant
const parsed = JSON.parse(jsonStr);

// Après
let parsed;
try {
  parsed = JSON.parse(jsonStr);
} catch {
  // Tentative d'extraction du premier objet JSON
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (match) {
    parsed = JSON.parse(match[0]);
  } else {
    return DEFAULT_RESULT;
  }
}
```

- **Effort estimé** : 1h

---

### 2.19 Pas de détection de réponse tronquée

- **Priorité** : Amélioration
- **Fichier(s)** : Tous les AI clients
- **Problème** : Si `max_tokens` est atteint, la réponse est tronquée silencieusement. Le champ `response.stop_reason === "max_tokens"` n'est jamais vérifié. Pour des JSON longs (plan analysis avec max_tokens=8000), le JSON sera coupé et le parse échouera.
- **Impact utilisateur** : Analyse de plan qui échoue silencieusement et retourne un résultat par défaut.
- **Solution proposée** : Vérifier `stop_reason` et logger un warning ou retry avec prompt demandant une réponse plus courte.
- **Effort estimé** : 2h

---

### 2.20 Classification L2 non batchée

- **Priorité** : Amélioration
- **Fichier(s)** : `apps/web/src/app/api/ai/reclassify-all/route.ts`
- **Problème** : La reclassification traite les emails un par un dans une boucle séquentielle. Avec 200 emails, c'est 200 appels API séquentiels (~5 minutes).
- **Solution proposée** : Utiliser `Promise.all()` avec un pool de concurrence (5-10 en parallèle) pour réduire le temps total à ~30 secondes.
- **Effort estimé** : 2h

---

### 2.21 Pas de support allemand dans le classifieur local

- **Priorité** : Amélioration
- **Fichier(s)** : `packages/core/src/ai/email-classifier.ts:205-382`
- **Problème** : Le classifieur L0 par mots-clés est en français/anglais uniquement. Les termes allemands courants ("Angebot", "Kosten", "Baustelle", "Offerte", "Abmelden") ne sont pas reconnus.
- **Impact utilisateur** : Clients germanophones auront plus de classifications envoyées à Claude (L2), augmentant les coûts.
- **Solution proposée** : Ajouter les patterns allemands dans les règles de détection spam et les mots-clés.
- **Effort estimé** : 2h + 4h de test

---

### 2.22 Confiance L0 mal calibrée

- **Priorité** : Amélioration
- **Fichier(s)** : `email-classifier.ts:367`
- **Problème** : `confidence: Math.min(score / 18, 0.99)` — le diviseur 18 est un magic number non calibré. Le score max typique est 10-15, ce qui donne une confiance de 0.55-0.83, trop basse pour des matchs pourtant forts.
- **Solution proposée** : Utiliser une fonction sigmoïde ou mapper score 8-18 → confiance 0.60-0.95.
- **Effort estimé** : 1h

---

### 2.23 Auto-classification à 85% = trop de faux positifs à l'échelle

- **Priorité** : Important
- **Fichier(s)** : `apps/web/src/app/api/ai/classify-email/route.ts:98`
- **Problème** : `const isAutoClassified = result.confidence >= 0.85` — à 85% de confiance, 1 email sur 6.7 est potentiellement mal classé. Pour 10K emails/mois, cela représente ~1,490 erreurs.
- **Impact utilisateur** : Emails mal routés vers les mauvais projets, perte de confiance dans le système.
- **Solution proposée** : Augmenter le seuil à 0.92 ou implémenter un mécanisme de "suggested" avec confirmation utilisateur pour le range 0.85-0.92.
- **Effort estimé** : 2h

---

### 2.24 Feedback classification collecté mais non exploité

- **Priorité** : Important
- **Fichier(s)** : Table `email_classification_feedback` (migration C1), `confirm-classification/route.ts`
- **Problème** : Le feedback de correction utilisateur est collecté dans la table C1, mais aucune boucle de rétroaction n'améliore le classificateur. Pas de A/B testing, pas de mesure d'accuracy.
- **Solution proposée** : Utiliser le feedback pour ajuster les mots-clés du projet (ajouter automatiquement les expéditeurs confirmés) et mesurer un taux d'accuracy hebdomadaire.
- **Effort estimé** : 6h

---

### 2.25 Estimation pipeline 3 modèles en parallèle — coûteux

- **Priorité** : Important
- **Fichier(s)** : `packages/core/src/plans/estimation/pipeline.ts`, `ai-clients.ts`
- **Problème** : Le pipeline V2 appelle Claude + GPT-4o + Gemini 2.0 Flash en parallèle pour chaque passe, avec consensus. Coût : ~$0.60 par plan (3 modèles × 4 passes × 8000 max_tokens).
- **Solution proposée** : Considérer Claude Opus seul (meilleure accuracy que le consensus 3 modèles moyens), ou garder 2 modèles max. Économie : 75% des coûts d'estimation.
- **Effort estimé** : 8h (refactoring + tests)

---

### 2.26 Chat : contexte illimité (50 messages)

- **Priorité** : Amélioration
- **Fichier(s)** : `apps/web/src/app/api/chat/route.ts:99-103`
- **Problème** : `.limit(50)` — le chat charge les 50 derniers messages comme contexte. Avec des messages longs, cela peut représenter 50K+ tokens par requête.
- **Solution proposée** : Implémenter une sliding window : garder seulement les 20 derniers messages, ou résumer les anciens avec un appel Haiku.
- **Effort estimé** : 4h

---

### 2.27 Whisper : langue hardcodée à "fr"

- **Priorité** : Amélioration
- **Fichier(s)** : `apps/web/src/app/api/pv/transcribe/route.ts`
- **Problème** : La langue de transcription est hardcodée à "fr". Les réunions en allemand ou les réunions bilingues FR/DE seront mal transcrites.
- **Solution proposée** : Détecter la langue depuis les paramètres du projet ou la locale de l'utilisateur.
- **Effort estimé** : 1h

---

## 3. OPTIMISATION TECHNIQUE

### 3.1 57+ requêtes `select("*")` dans les routes API

- **Priorité** : Critique
- **Fichier(s)** : 30+ routes API
- **Problème** : `select("*")` ramène toutes les colonnes de la table, y compris des données potentiellement volumineuses (body_preview, ai_summary, suggested_project_data). Occurrences principales :
  - `outlook/sync/route.ts` : 3x select("*")
  - `tasks/route.ts` : 3x select("*")
  - `suppliers/route.ts` : 2x select("*")
  - `projects/[id]/emails/route.ts` : select("*")
  - `projects/list/route.ts` : select("*")
  - `briefing/generate/route.ts` : 4x select("*")
  - `emails/inbox/route.ts` : select("*")
  - `ai/reclassify-all/route.ts` : select("*")
  - Et ~45 autres occurrences
- **Impact** : Bande passante gaspillée, latence réseau, sécurité (data leaking potentiel).
- **Solution proposée** : Remplacer chaque `select("*")` par un select ciblé avec les colonnes nécessaires.
- **Effort estimé** : 6h

---

### 3.2 Aucune pagination sur les endpoints de liste

- **Priorité** : Critique
- **Fichier(s)** : `projects/list/route.ts`, `tasks/route.ts`, `suppliers/route.ts`, `projects/[id]/emails/route.ts`, `emails/inbox/route.ts`
- **Problème** : Les routes retournent TOUS les résultats. `emails/inbox/route.ts` a un `limit(500)` hardcodé mais pas de pagination. Avec la croissance, des tables de 5000+ lignes vont timeout.
- **Impact** : Performances dégradées avec la croissance, timeouts API Vercel (10s).
- **Solution proposée** : Ajouter `.range(offset, offset + pageSize)` avec paramètres `page` et `limit` dans les query params.
- **Effort estimé** : 4h

---

### 3.3 Tokens Microsoft stockés en clair dans la BDD

- **Priorité** : Critique
- **Fichier(s)** : `packages/database/types.ts:342-343`, `apps/web/src/lib/microsoft/tokens.ts`
- **Problème** : `microsoft_access_token` et `microsoft_refresh_token` sont stockés en texte clair dans la table `users`. Les mots de passe IMAP utilisent `pgcrypto` (`imap_password_encrypted` dans migration 018) mais PAS les tokens Microsoft/OAuth.
- **Impact** : Si la BDD est compromise (leak, backup non chiffré), les tokens permettent d'accéder aux boîtes email de tous les utilisateurs.
- **Solution proposée** : Chiffrer avec `pgp_sym_encrypt/pgp_sym_decrypt` comme déjà fait pour IMAP, ou utiliser Supabase Vault.
- **Effort estimé** : 4h

---

### 3.4 Webhook Stripe non implémenté

- **Priorité** : Critique
- **Fichier(s)** : `apps/web/src/app/api/webhooks/stripe/route.ts`
- **Problème** : Le handler retourne `{ error: "Not implemented — see Step 11" }` avec un 501. Aucune vérification de signature, aucun traitement d'événement. Le commentaire "Step 11" date de la création initiale.
- **Impact** : Les paiements Stripe ne sont pas traités. Pas de mise à jour de plan après achat. Bloquant pour la monétisation.
- **Solution proposée** : Implémenter le webhook avec vérification de signature Stripe et traitement des événements `checkout.session.completed`, `customer.subscription.updated`, `invoice.payment_failed`.
- **Effort estimé** : 8h

---

### 3.5 Webhook Outlook stub (TODO)

- **Priorité** : Important
- **Fichier(s)** : `apps/web/src/app/api/outlook/webhook/route.ts:16`
- **Problème** : `// TODO: Handle incoming change notifications` — le webhook est un stub qui ne fait que retourner le `validationToken` pour l'enregistrement, sans traiter les notifications de changement. Pas de vérification de signature Microsoft Graph.
- **Solution proposée** : Implémenter la validation des notifications Microsoft Graph et le traitement des événements (nouveau mail, modification).
- **Effort estimé** : 4h

---

### 3.6 Aucun monitoring d'erreurs (Sentry)

- **Priorité** : Critique
- **Fichier(s)** : Grep pour `Sentry`, `LogRocket`, `@sentry` → 0 résultat
- **Problème** : Aucun service de monitoring d'erreurs configuré. Les erreurs en production passent inaperçues. Le seul error boundary (`error.tsx`) log en console. Le logger structuré (`logger.ts`) existe mais log dans Supabase, pas dans un service dédié.
- **Impact** : Bugs en production non détectés, pas de données pour prioriser les corrections, pas d'alertes.
- **Solution proposée** : Intégrer Sentry (Next.js SDK) avec source maps, error boundaries, et performance monitoring.
- **Effort estimé** : 4h

---

### 3.7 Error boundary minimal et hardcodé en français

- **Priorité** : Important
- **Fichier(s)** : `apps/web/src/app/[locale]/error.tsx`
- **Problème** : Un seul error boundary global avec texte hardcodé en français ("Une erreur est survenue", "Réessayer"). Pas d'error boundary par module. Le bouton utilise `bg-blue-600` au lieu de la couleur brand. Un `global-error.tsx` existe aussi avec des styles inline.
- **Solution proposée** : Traduire via next-intl, utiliser les couleurs brand, ajouter un error boundary par route group `(app)/error.tsx`, `(admin)/error.tsx`.
- **Effort estimé** : 2h

---

### 3.8 128+ occurrences de `any` dans le codebase

- **Priorité** : Amélioration
- **Fichier(s)** : 30 fichiers, principalement `cantaia-prix/page.tsx` (26x), `projects/[id]/page.tsx` (12x), `pv-chantier/[id]/page.tsx` (9x)
- **Problème** : Les `any` contournent la sécurité TypeScript. Beaucoup viennent du bug `@supabase/ssr` v0.5.2 (`admin as any`) mais d'autres sont de la vraie dette technique (meetings, plans comme `any[]`).
- **Solution proposée** : Résoudre les `any` par module, en commençant par les plus critiques. Typer les réponses Supabase avec des generics. Upgrader `@supabase/ssr` quand le fix est disponible.
- **Effort estimé** : 8h

---

### 3.9 103+ console.log en production

- **Priorité** : Important
- **Fichier(s)** : 30 fichiers avec les plus grandes concentrations dans `reclassify-all/route.ts` (16x), `EmailDetailPanel.tsx` (11x), `chunked-transcription.ts` (16x), `analyze-plan/route.ts` (7x)
- **Problème** : Les logs sont structurés avec des préfixes `[module-name]` (bonne pratique), mais beaucoup sont des logs de debug qui fuient des données sensibles (contenus email, réponses IA brutes).
- **Solution proposée** : Remplacer par le logger structuré existant (`logger.ts`). Ajouter une règle ESLint `no-console` avec exceptions pour `console.error` uniquement.
- **Effort estimé** : 4h

---

### 3.10 Fichiers trop volumineux

- **Priorité** : Important
- **Fichiers concernés** :

| Fichier | Lignes | Recommandation |
|---------|--------|----------------|
| `cantaia-prix/page.tsx` | **2160** | Découper en 4 tabs : ChiffrageTab, ImportTab, AnalyseTab, HistoriqueTab |
| `submissions/page.tsx` | **1316** | Extraire SubmissionList, SubmissionExtractView |
| `plans/[id]/page.tsx` | **1283** | Extraire PlanAnalysisView, EstimationSection |
| `projects/[id]/page.tsx` | **1059** | Extraire chaque onglet en composant séparé |
| `pv-chantier/[id]/page.tsx` | **1043** | Extraire PVEditor, PVPreview |
| `submissions/[id]/page.tsx` | **994** | Extraire SubmissionDetail, OfferComparison |
| `outlook/sync/route.ts` | **949** | Extraire syncEmails, classifyBatch, savePlans |
| `EmailDetailPanel.tsx` | **887** | Extraire AttachmentList, TaskSection, ReplySection |
| `tasks/page.tsx` | **847** | Extraire TaskBoard, TaskTable, TaskFilters |

- **Effort estimé** : 12h

---

### 3.11 Aucun sitemap, robots.txt, OpenGraph tags

- **Priorité** : Critique (pour le SEO au lancement)
- **Fichier(s)** : Aucun `sitemap.ts`, `robots.ts`, aucun tag OG, aucun schema.org
- **Problème** : La landing page n'a que `<title>Cantaia</title>` et une description basique en anglais dans le layout. Pas de meta OG, pas de sitemap, pas de robots.txt, pas de schema.org JSON-LD.
- **Impact** : Référencement Google quasi nul, aperçu invalide quand partagé sur LinkedIn/Twitter.
- **Solution proposée** :

```typescript
// app/sitemap.ts
export default function sitemap() {
  return [
    { url: 'https://cantaia.ch', lastModified: new Date() },
    { url: 'https://cantaia.ch/pricing', lastModified: new Date() },
    { url: 'https://cantaia.ch/about', lastModified: new Date() },
  ];
}

// app/robots.ts
export default function robots() {
  return {
    rules: { userAgent: '*', allow: '/', disallow: '/api/' },
    sitemap: 'https://cantaia.ch/sitemap.xml',
  };
}

// layout.tsx metadata
export const metadata: Metadata = {
  title: "Cantaia — L'IA au service du chantier",
  description: "Gestion de chantier augmentée par IA pour les chefs de projet construction en Suisse.",
  openGraph: {
    title: "Cantaia",
    description: "L'IA au service du chantier",
    url: "https://cantaia.ch",
    type: "website",
    images: [{ url: "https://cantaia.ch/og-image.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image" },
};
```

- **Effort estimé** : 4h

---

### 3.12 Aucun favicon ni icônes PWA

- **Priorité** : Critique
- **Fichier(s)** : `apps/web/public/` — aucun favicon, aucun manifest.json
- **Problème** : Pas de favicon du tout. L'application n'a pas d'icône dans les onglets du navigateur, pas de manifest PWA pour l'ajout à l'écran d'accueil.
- **Impact** : Aspect non professionnel, impossible d'installer en PWA.
- **Solution proposée** : Créer le favicon (svg/ico/png), le manifest.json, et les apple-touch-icon.
- **Effort estimé** : 2h

---

### 3.13 Hardcoded French strings non traduites

- **Priorité** : Important
- **Fichier(s)** et strings identifiées :

| Fichier | Ligne | String hardcodée |
|---------|-------|-----------------|
| `Sidebar.tsx` | 265 | "Plan Trial" |
| `Sidebar.tsx` | 268 | "12j restants" |
| `Sidebar.tsx` | 310 | "Réduire" |
| `Sidebar.tsx` | 295 | "Déconnexion" |
| `Sidebar.tsx` | 80 | "Utilisateur" (fallback) |
| `dashboard/page.tsx` | 35 | "Utilisateur" (fallback) |
| `mail/page.tsx` | 47 | "maintenant" |
| `mail/page.tsx` | 48 | "min" |
| `mail/page.tsx` | 49 | "h" |
| `mail/page.tsx` | 50 | "j" |
| `error.tsx` | 19 | "Une erreur est survenue" |
| `error.tsx` | 22 | "Erreur inattendue..." |
| `error.tsx` | 28 | "Réessayer" |

- **Impact** : L'app ne fonctionne pas correctement en anglais ou allemand.
- **Solution proposée** : Remplacer par les clés de traduction `t()` correspondantes.
- **Effort estimé** : 2h

---

### 3.14 Couverture i18n — fichiers de même taille

- **Priorité** : Amélioration
- **Fichier(s)** : `apps/web/messages/fr.json` (2510 lignes), `en.json` (2510), `de.json` (2510)
- **Problème** : Les 3 fichiers ont exactement le même nombre de lignes, ce qui est bon signe pour la couverture des clés. Cependant, sans diff, impossible de savoir si les traductions DE sont réelles ou copiées du FR.
- **Solution proposée** : Lancer un script de comparaison des valeurs et vérifier manuellement les traductions DE.
- **Effort estimé** : 2h

---

### 3.15 Dates et nombres non formatés selon la locale suisse

- **Priorité** : Amélioration
- **Fichier(s)** : `mail/page.tsx:39-52`, format prix dans BentoGrid
- **Problème** : `formatRelativeDate` utilise `"fr-CH"` en dur. Les montants dans les soumissions et prix devraient utiliser le format suisse `1'234'567.00 CHF` (apostrophe comme séparateur de milliers), mais ce n'est pas vérifié globalement. Les prix dans la landing sont hardcodés ("195 CHF/m3").
- **Solution proposée** : Créer un `useFormatter()` hook basé sur la locale next-intl.

```typescript
const formatCHF = (amount: number, locale: string) =>
  new Intl.NumberFormat(locale === 'de' ? 'de-CH' : 'fr-CH', {
    style: 'currency',
    currency: 'CHF',
  }).format(amount);
```

- **Effort estimé** : 3h

---

### 3.16 `next/image` non utilisé

- **Priorité** : Amélioration
- **Fichier(s)** : `Sidebar.tsx:185` (`<img src={branding.logoUrl}>`), `plans/[id]/page.tsx` (3 `<img>`), `closure/upload-signed/page.tsx:203`
- **Problème** : 4+ occurrences de `<img>` au lieu de `<Image>` de next/image. Pas d'optimisation WEBP, pas de srcset responsive, pas de lazy-loading.
- **Solution proposée** : Remplacer `<img>` par `<Image>` avec width/height explicites.
- **Effort estimé** : 1h

---

### 3.17 next.config.ts minimal — pas de headers de sécurité

- **Priorité** : Important
- **Fichier(s)** : `apps/web/next.config.ts` (11 lignes)
- **Problème** : La config ne définit aucun header de sécurité (CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy).
- **Solution proposée** :

```typescript
const nextConfig: NextConfig = {
  transpilePackages: ["@cantaia/ui", "@cantaia/core", "@cantaia/database"],
  serverExternalPackages: ["ffmpeg-static"],
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
      ],
    }];
  },
};
```

- **Effort estimé** : 2h

---

### 3.18 Variables d'environnement non typées

- **Priorité** : Amélioration
- **Fichier(s)** : 38+ fichiers utilisant `process.env.X!` avec non-null assertion
- **Problème** : Pas de fichier `env.ts` ou schema Zod pour les variables d'environnement. Les `process.env.X!` crashent silencieusement à runtime si la var manque.
- **Solution proposée** :

```typescript
// lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(50),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(50),
  ANTHROPIC_API_KEY: z.string().startsWith("sk-ant-"),
  OPENAI_API_KEY: z.string().startsWith("sk-"),
  CRON_SECRET: z.string().min(16).optional(),
});

export const env = envSchema.parse(process.env);
```

- **Effort estimé** : 2h

---

### 3.19 RLS globalement bien configuré — point positif

- **Priorité** : Point positif
- **Fichier(s)** : `packages/database/migrations/002_rls_policies.sql` et migrations suivantes
- **Constat** : RLS activé sur toutes les tables principales : organizations, users, projects, project_members, email_records, tasks, meetings, daily_briefings, notifications, app_logs, usage_events, lots, messages, plan_registry, plan_versions, suppliers, submissions, project_receptions, reception_reserves, closure_documents. Chaque policy filtre par `auth.uid()` ou membership organisation.
- **Point d'attention** : Les vérifications super-admin (`is_superadmin`) sont au niveau applicatif (route), pas au niveau RLS. Considérer une defense-in-depth au niveau BDD.

---

### 3.20 Routes API — authentification généralement correcte — point positif

- **Priorité** : Point positif
- **Fichier(s)** : 48+ routes avec `supabase.auth.getUser()`
- **Constat** : La grande majorité des routes API vérifient `getUser()` en premier et retournent 401 si absent. Les routes utilisent `adminClient` (bypass RLS) après vérification du user, ce qui est correct pour les opérations cross-org quand l'utilisateur a été authentifié.

---

### 3.21 Routes CRON sans protection fail-closed

- **Priorité** : Important
- **Fichier(s)** : `api/cron/aggregate-benchmarks/route.ts`, `api/cron/extract-patterns/route.ts`, `api/email/sync/cron/route.ts`
- **Problème** : Les routes CRON vérifient `CRON_SECRET`, mais si la variable n'est pas configurée, le comportement exact doit être vérifié. Un fail-open serait une vulnérabilité.
- **Solution proposée** : S'assurer que l'absence de `CRON_SECRET` bloque la requête (fail-closed).
- **Effort estimé** : 1h

---

### 3.22 DOMPurify pour emails HTML — point positif

- **Priorité** : Point positif
- **Fichier(s)** : `apps/web/src/components/app/EmailDetailPanel.tsx:593-595`
- **Constat** : DOMPurify utilisé avec whitelist stricte (ALLOWED_TAGS, ALLOWED_ATTR). Bloque les scripts, iframes, onclick. Bonne pratique de sécurité.

---

### 3.23 Landing page sections "use client" pour animations

- **Priorité** : Amélioration
- **Fichier(s)** : `HeroSection.tsx`, `BentoGrid.tsx`, `AnimatedSection.tsx`, `FeaturesSection.tsx`
- **Problème** : Les sections landing sont marquées `"use client"` uniquement pour les animations Framer Motion. Le contenu statique (texte, images) est envoyé en JS au lieu d'être SSR.
- **Impact** : Bundle JS plus lourd pour la landing, premier render plus lent.
- **Solution proposée** : Séparer le contenu statique (Server Component) des animations (petit wrapper Client Component).
- **Effort estimé** : 4h

---

### 3.24 Framer Motion peut bloquer le premier paint

- **Priorité** : Amélioration
- **Fichier(s)** : `BentoGrid.tsx` (722 lignes), `HeroSection.tsx`
- **Problème** : Toutes les sections landing chargent les animations Framer Motion eagerly. BentoGrid initialise 7 animations complexes au chargement. Pas de détection `prefers-reduced-motion`.
- **Solution proposée** : Déférer les animations non-critiques, respecter la préférence utilisateur.

```typescript
const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const animate = !prefersReduced && isInView;
```

- **Effort estimé** : 2h

---

### 3.25 Aucune accessibilité ARIA sur les composants custom

- **Priorité** : Amélioration
- **Fichier(s)** : 6 fichiers seulement ont des attributs `aria-` ou `role=`, tous dans les composants landing et auth (via shadcn/ui). Les composants app custom (Sidebar, EmailDetailPanel, etc.) n'en ont pas.
- **Problème** : Le bottom nav mobile, le splitpanel email, le kanban tâches, les modals custom ne sont pas accessibles au clavier ni aux lecteurs d'écran.
- **Solution proposée** :
  - `role="navigation"` + `aria-label` sur la sidebar et le bottom nav
  - `aria-current="page"` sur les liens actifs
  - `aria-expanded` sur le menu hamburger
  - `aria-hidden="true"` sur les éléments décoratifs
- **Effort estimé** : 4h

---

### 3.26 Couleur Gold sur blanc — contraste WCAG insuffisant

- **Priorité** : Amélioration
- **Fichier(s)** : EmptyState (`bg-gold text-white`), Sidebar (`text-amber-500`), BentoGrid, HeroSection
- **Problème** : La couleur Gold `#C4A661` sur fond blanc a un ratio de contraste d'environ 2.8:1, en dessous du minimum WCAG AA de 4.5:1 pour le texte normal. Sur fond sombre `#0A1F30`, le ratio est ~3.5:1, toujours insuffisant.
- **Solution proposée** : Assombrir le gold à `#8B7340` pour les textes sur fond clair, garder `#C4A661` comme accent décoratif uniquement.
- **Effort estimé** : 1h

---

### 3.27 2 TODOs et 1 stub oubliés

- **Priorité** : Amélioration
- **Fichier(s)** :
  - `apps/web/src/app/[locale]/(app)/settings/page.tsx:442` : `// TODO: POST /api/user/preferences when connected to Supabase`
  - `apps/web/src/app/api/outlook/webhook/route.ts:16` : `// TODO: Handle incoming change notifications`
  - `apps/web/src/app/api/webhooks/stripe/route.ts:4` : `"Not implemented — see Step 11"`
- **Solution proposée** : Traiter les TODOs ou les déplacer dans un issue tracker.
- **Effort estimé** : N/A (tracking seulement)

---

## 4. PLAN D'ACTION PRIORISÉ

### Phase 1 — Critiques immédiats (~50h)

| # | Section | Titre | Priorité | Effort | Impact |
|---|---------|-------|----------|--------|--------|
| 1 | Tech | Chiffrer les tokens Microsoft en BDD | Critique | 4h | Sécurité |
| 2 | IA | Activer prompt caching Anthropic | Critique | 2h | -$10K/mois coûts IA |
| 3 | IA | Fallback modèle + retry/backoff | Critique | 7h | Fiabilité tous modules |
| 4 | IA | Modèle adaptatif Haiku/Sonnet | Critique | 4h+4h test | -60% coûts simples |
| 5 | Tech | Implémenter webhook Stripe | Critique | 8h | Monétisation |
| 6 | Tech | Monitoring Sentry | Critique | 4h | Visibilité production |
| 7 | Tech | Sitemap + robots.txt + OG tags | Critique | 4h | SEO lancement |
| 8 | Tech | Favicon + manifest PWA | Critique | 2h | Image professionnelle |
| 9 | Tech | Pagination endpoints de liste | Critique | 4h | Scalabilité |
| 10 | Tech | Remplacer 57x select("*") | Critique | 6h | Performance BDD |
| 11 | UX | Toast notifications erreurs API | Critique | 3h | UX feedback |

### Phase 2 — Importants (~60h)

| # | Section | Titre | Priorité | Effort | Impact |
|---|---------|-------|----------|--------|--------|
| 12 | UX | Empty states sur toutes les pages | Important | 4h | Onboarding |
| 13 | UX | Loading states / skeletons | Important | 6h | Performance perçue |
| 14 | UX | Breadcrumbs | Important | 4h | Navigation |
| 15 | UX | Onglets projet en URL | Important | 2h | UX navigation |
| 16 | UX | Email detail sur tablette | Important | 2h | Mobile UX |
| 17 | UX | Onboarding checklist | Important | 8h | Activation |
| 18 | UX | Confirmations suppression | Important | 3h | Sécurité données |
| 19 | IA | Nettoyage corps email avant IA | Important | 3h | Qualité + coûts |
| 20 | IA | Timeout sur appels IA | Important | 2h | Fiabilité |
| 21 | IA | Auto-classification seuil 0.92 | Important | 2h | Précision |
| 22 | IA | Feedback loop classification | Important | 6h | Amélioration continue |
| 23 | IA | Pipeline estimation 3→1 modèle | Important | 8h | -75% coûts estimation |
| 24 | Tech | Headers de sécurité next.config | Important | 2h | Sécurité |
| 25 | Tech | Strings FR hardcodées → i18n | Important | 2h | i18n |
| 26 | Tech | Console.log → logger structuré | Important | 4h | Sécurité + propreté |
| 27 | Tech | Error boundaries par module | Important | 2h | Résilience |
| 28 | Tech | Routes CRON fail-closed | Important | 1h | Sécurité |
| 29 | Tech | Webhook Outlook | Important | 4h | Sync temps réel |
| 30 | Tech | Découper fichiers > 800 lignes | Important | 12h | Maintenabilité |

### Phase 3 — Améliorations (~65h)

| # | Section | Titre | Priorité | Effort | Impact |
|---|---------|-------|----------|--------|--------|
| 31 | UX | Sidebar collapse persisté | Amélioration | 0.5h | UX |
| 32 | UX | Debounce recherche | Amélioration | 1h | Performance |
| 33 | UX | Dynamic imports composants lourds | Amélioration | 3h | Bundle size |
| 34 | UX | Filtres en URL | Amélioration | 3h | Partage liens |
| 35 | UX | Page 404 custom | Amélioration | 1h | Branding |
| 36 | UX | Navigation mobile complète | Amélioration | 3h | Mobile UX |
| 37 | UX | Virtualisation listes | Amélioration | 6h | Performance |
| 38 | UX | Cmd+K recherche globale | Amélioration | 8h | Power users |
| 39 | IA | Enrichir prompt task extraction | Amélioration | 2h | Qualité IA |
| 40 | IA | Améliorer prompt reply | Amélioration | 2h | Qualité IA |
| 41 | IA | Détecter réponses tronquées | Amélioration | 2h | Fiabilité |
| 42 | IA | Batching reclassification | Amélioration | 2h | Performance |
| 43 | IA | Console.log services IA | Amélioration | 1h | Sécurité |
| 44 | IA | Robustesse JSON parsing | Amélioration | 1h | Fiabilité |
| 45 | IA | Support allemand classifieur local | Amélioration | 6h | Marché DE |
| 46 | IA | Calibration confiance L0 | Amélioration | 1h | Précision |
| 47 | IA | Chat sliding window 50→20 | Amélioration | 4h | Coûts |
| 48 | IA | Whisper langue dynamique | Amélioration | 1h | i18n |
| 49 | IA | Disclaimer fournisseurs hallucination | Amélioration | 1.5h | Confiance |
| 50 | IA | Prompt briefing langue | Amélioration | 1h | i18n |
| 51 | Tech | Typer variables env (Zod) | Amélioration | 2h | DX |
| 52 | Tech | Réduire 128x `any` | Amélioration | 8h | Type safety |
| 53 | Tech | Accessibilité ARIA | Amélioration | 4h | a11y |
| 54 | Tech | Contraste Gold WCAG | Amélioration | 1h | a11y |
| 55 | Tech | Dates/nombres locale suisse | Amélioration | 3h | i18n |
| 56 | Tech | Vérifier traductions DE | Amélioration | 2h | i18n |
| 57 | Tech | next/image pour logos/images | Amélioration | 1h | Optimisation |
| 58 | Tech | Landing: séparer SSR/animations | Amélioration | 4h | Performance |
| 59 | Tech | prefers-reduced-motion | Amélioration | 2h | a11y |

---

## 5. ESTIMATION D'ÉCONOMIE IA

### Coûts mensuels estimés (avant optimisation)

| Module | Appels/mois | Tokens moyens | Coût estimé |
|--------|-------------|---------------|-------------|
| Classification email | 100K | 1024 out | $4,200 |
| Task extraction | 100K | 1024 out | $4,200 |
| Reply generation | 10K | 2048 out | $320 |
| Plan analysis | 2K | 8000 out | $960 |
| Briefing | 1K | 4096 out | $120 |
| Chat JM | 50K | 10K context | $1,500 |
| Estimation 4-pass (3 modèles) | 500 | 24K (3 modèles) | $1,800 |
| Whisper transcription | 200h audio | - | $2,400 |
| **TOTAL** | | | **~$15,500/mois** |

### Coûts après optimisations (phases 1-3)

| Optimisation | Économie |
|-------------|----------|
| Prompt caching | -$8,100 |
| Haiku pour tâches simples | -$6,400 |
| Troncation email standardisée | -$300 |
| Drop GPT/Gemini estimation | -$1,350 |
| Chat sliding window | -$300 |
| Structured output format | -$500 |
| Batch processing (moins de retries) | -$200 |
| **Nouveau total** | **~$7,750/mois** |
| **Économie** | **~50% (-$7,750/mois)** |

---

## 6. ANNEXES

### A. Liste des routes API sans pagination

```
/api/projects/list
/api/tasks
/api/suppliers
/api/projects/[id]/emails
/api/emails/inbox (limit 500 hardcodé)
/api/plans
/api/submissions (si existe)
```

### B. Liste des fichiers avec le plus de `select("*")`

```
briefing/generate/route.ts      4x select("*")
outlook/sync/route.ts           3x select("*")
tasks/route.ts                  3x select("*")
super-admin/route.ts            3x select("*")
suppliers/route.ts              2x select("*")
ai/analyze-plan/route.ts        2x select("*")
projects/[id]/route.ts          2x select("*")
```

### C. Liste complète des prompts IA et leur rating

| Prompt | Fichier | Lignes | Rating | Tokens |
|--------|---------|--------|--------|--------|
| Email Classification | prompts.ts | 15-113 | BON | ~2800 |
| Task Extraction | prompts.ts | 122-153 | A AMELIORER | ~600 |
| PV Generation | prompts.ts | 166-225 | BON | ~1200 |
| Briefing | prompts.ts | 233-269 | A AMELIORER | ~800 |
| Plan Analysis | prompts.ts | 285-458 | EXCELLENT | ~5500 |
| Chat JM | prompts.ts | 471-650 | EXCELLENT | ~4000 |
| Price Estimation | prompts.ts | 665-719 | BON | ~1500 |
| Supplier Search | prompts.ts | 734-774 | A AMELIORER | ~800 |
| Supplier Enrichment | prompts.ts | 787-816 | A AMELIORER | ~500 |
| Price Extraction | prompts.ts | 828-871 | BON | ~1200 |
| Free-Form Price | prompts.ts | 886-980 | BON | ~1800 |
| Reply Generation | reply-generator.ts | 83-144 | A AMELIORER | ~800 |

### D. Fichiers de plus de 500 lignes

```
2160  cantaia-prix/page.tsx
1316  submissions/page.tsx
1283  plans/[id]/page.tsx
1059  projects/[id]/page.tsx
1043  pv-chantier/[id]/page.tsx
 994  submissions/[id]/page.tsx
 949  outlook/sync/route.ts
 887  EmailDetailPanel.tsx
 847  tasks/page.tsx
 799  super-admin/data-intelligence/page.tsx
 779  suppliers/page.tsx
 763  pv-chantier/nouveau/page.tsx
 752  plans/page.tsx
 730  mail/page.tsx
 722  BentoGrid.tsx
 710  settings/page.tsx
 701  IntegrationsTab.tsx
 619  super-admin/organizations/create/page.tsx
 601  visits/export-report/route.ts
 580  visits/[id]/page.tsx
 577  projects/page.tsx
 551  ArchiveSettingsTab.tsx
 548  meetings/[id]/edit/page.tsx
 538  projects/closure/generate-pv/route.ts
```

---

> **Fin du rapport d'audit**
> Aucun fichier du projet n'a été modifié pendant cet audit.
> Les modifications viendront après validation des priorités par l'équipe.
