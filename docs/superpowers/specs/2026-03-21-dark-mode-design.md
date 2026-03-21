# Dark Mode — Design Spec

> Date: 2026-03-21
> Status: Approved
> Scope: App complète (hors marketing, auth, super-admin)

---

## 1. Vue d'ensemble

Ajouter un mode sombre à l'application Cantaia avec toggle 3 états (Clair / Sombre / Système) en bas de la sidebar. Approche par variables CSS centralisées dans `globals.css` + migration des couleurs hardcodées vers des tokens sémantiques.

### Infrastructure existante (prête)
- `next-themes` v0.4.4 installé et configuré (`attribute="class"`, `defaultTheme="system"`, `enableSystem`)
- Tailwind `darkMode: "class"` activé
- `suppressHydrationWarning` sur `<html>`
- `disableTransitionOnChange: true` (pas de flash)

### Ce qui manque
- Variables CSS dark dans `globals.css`
- Migration des couleurs hardcodées vers tokens sémantiques (~180 fichiers)
- Toggle UI
- `useTheme()` jamais appelé

---

## 2. Palette CSS Variables

Style visuel : **dark bleuâtre** (slate). Cohérent avec le brand blue Cantaia.

### `globals.css` — Bloc `.dark`

```css
.dark {
  --background: 222 47% 11%;           /* slate-900 */
  --foreground: 210 40% 98%;           /* slate-50 */
  --card: 217 33% 17%;                 /* slate-800 */
  --card-foreground: 210 40% 98%;      /* slate-50 */
  --popover: 222 47% 15%;             /* entre slate-800 et slate-900, légèrement plus élevé */
  --popover-foreground: 210 40% 98%;   /* slate-50 */
  --primary: 217 91% 60%;             /* brand blue — inchangé */
  --primary-foreground: 0 0% 100%;     /* white */
  --secondary: 217 33% 17%;           /* slate-800 */
  --secondary-foreground: 210 40% 98%; /* slate-50 */
  --muted: 215 28% 17%;               /* slate-800 légèrement chaud */
  --muted-foreground: 217 10% 64%;    /* slate-400 */
  --accent: 217 25% 22%;              /* slate-700/800, visible au hover sur cards */
  --accent-foreground: 210 40% 98%;    /* slate-50 */
  --destructive: 0 72% 51%;           /* red-600 — lisible sur fond sombre */
  --destructive-foreground: 0 0% 100%; /* white */
  --border: 217 20% 24%;              /* slate-700, visible sur cards slate-800 */
  --input: 217 20% 24%;               /* idem border, donne un contour visible aux inputs */
  --ring: 217 91% 60%;                /* brand blue */
}
```

**Différences clés** : `--border`/`--input` (24% lightness) sont plus clairs que `--card` (17%) pour assurer des contours visibles. `--accent` (22%) est entre les deux pour des hover states perceptibles. `--destructive` est un rouge vif (51% lightness) lisible sur fond sombre.

### `globals.css` — Modifications color-scheme et body

```css
/* Sur :root, pas body — affecte scrollbars natifs et contrôles formulaires */
:root { color-scheme: light; }
.dark { color-scheme: dark; }

body {
  /* Retirer: color-scheme: light; */
}

input, select, textarea {
  /* Retirer: color-scheme: light; */
  /* Retirer: background-color: white; */
}
```

### Scrollbars

```css
.dark ::-webkit-scrollbar-thumb {
  background-color: hsl(217 20% 30%);
}
.dark ::-webkit-scrollbar-thumb:hover {
  background-color: hsl(217 20% 40%);
}
.dark {
  scrollbar-color: hsl(217 20% 30%) transparent;
}
```

---

## 3. Toggle Button

### Composant `ThemeToggle.tsx`

- **Emplacement** : Bas de la sidebar, juste au-dessus du profil utilisateur
- **Comportement** : Clic cyclique `light` → `dark` → `system` → `light`
- **Icones** : `Sun` (light), `Moon` (dark), `Monitor` (system) — lucide-react
- **Label** : Sidebar ouverte = icone + texte ("Clair" / "Sombre" / "Système"). Sidebar collapsed = icone seule centrée
- **Tooltip** (collapsed) : Mode actuel
- **Hook** : `useTheme()` de `next-themes`
- **i18n** : Clés `nav.themeLight`, `nav.themeDark`, `nav.themeSystem`
- **Stockage** : next-themes gère localStorage (clé `theme`), rien en DB

### Sidebar — Branding en dark mode

Le `sidebarColor` du `BrandingProvider` est appliqué en `style={{ backgroundColor }}` inline qui overriderait `bg-background`. En dark mode, conditionner l'application : `useTheme()` dans Sidebar, si `resolvedTheme === "dark"` → ne pas appliquer le `style` inline. La sidebar utilise alors `bg-background` (slate-900).

### Intégration Sidebar

```
┌─────────────────────┐
│  Logo Cantaia       │
├─────────────────────┤
│  Quotidien          │
│    Dashboard        │
│    Mail             │
│    Briefing         │
│  Référentiels       │
│    Fournisseurs     │
│    Cantaia Prix     │
│    Assistant IA     │
│  Projet Actif       │
│    [ProjectSection] │
├─────────────────────┤
│  ☀ Clair            │  ← ThemeToggle (nouveau)
│  👤 Julien Ray      │  ← Profil existant
└─────────────────────┘
```

---

## 4. Migration des couleurs hardcodées

### Table de correspondance

#### Gray palette
| Hardcodé | Token sémantique |
|----------|-----------------|
| `bg-white` | `bg-background` |
| `bg-gray-50`, `bg-gray-100` | `bg-muted` |
| `bg-gray-200` | `bg-muted` |
| `text-gray-900`, `text-gray-800` | `text-foreground` |
| `text-gray-700` | `text-foreground` |
| `text-gray-600`, `text-gray-500` | `text-muted-foreground` |
| `text-gray-400`, `text-gray-300` | `text-muted-foreground` |
| `border-gray-200`, `border-gray-300` | `border-border` |
| `border-[#E5E7EB]` | `border-border` |
| `hover:bg-gray-50`, `hover:bg-gray-100` | `hover:bg-muted` |
| `divide-gray-200` | `divide-border` |
| `ring-gray-300` | `ring-border` |

#### Slate palette (826+ occurrences text, 166 bg, 270 border)
| Hardcodé | Token sémantique |
|----------|-----------------|
| `bg-slate-50`, `bg-slate-100` | `bg-muted` |
| `bg-slate-200`, `bg-slate-300` | `bg-muted` |
| `text-slate-900`, `text-slate-800` | `text-foreground` |
| `text-slate-700` | `text-foreground` |
| `text-slate-600`, `text-slate-500` | `text-muted-foreground` |
| `text-slate-400`, `text-slate-300` | `text-muted-foreground` |
| `border-slate-100`, `border-slate-200`, `border-slate-300` | `border-border` |
| `hover:bg-slate-50`, `hover:bg-slate-100` | `hover:bg-muted` |

#### Brand / Blue palette
| Hardcodé | Token sémantique |
|----------|-----------------|
| `bg-blue-50`, `bg-brand-50`, `bg-brand/10` | `bg-primary/10` |
| `text-blue-600`, `text-blue-700` | `text-primary` |
| `border-blue-200` | `border-primary/20` |

#### Status colors (badges, alertes, banners)
Les couleurs de statut (`bg-green-50`, `bg-red-50`, `bg-yellow-50`, `bg-amber-50`, etc.) utilisent le pattern `-50` pour le fond light. En dark mode, remplacer par opacity : `bg-green-500/10 dark:bg-green-500/20` etc. Garder la couleur de texte telle quelle (`text-green-700` → ajouter `dark:text-green-400`).

#### Hex arbitraires (446 occurrences)
Les valeurs `bg-[#...]`, `text-[#...]`, `border-[#...]` dans les composants app seront migrées au cas par cas vers le token sémantique le plus proche. Pour la sidebar, les hex comme `text-[#6B7280]` → `text-muted-foreground`, `border-[#E5E7EB]` → `border-border`, `text-[#2563EB]` → `text-primary`.

#### Shadows
Les `shadow-sm`/`shadow` deviennent invisibles en dark mode (rgba noir sur fond noir). Ajouter `dark:shadow-[0_1px_3px_rgba(0,0,0,0.3)]` ou border fallback sur les éléments élevés (cards, modals, dropdowns).

### Priorité de migration

**P0 — Structure visible partout** :
- `globals.css` (variables + body/input + scrollbars)
- `Sidebar.tsx` + `ActiveProjectSection.tsx` + `ProjectSwitcher.tsx`
- Layout app `(app)/layout.tsx` (fond principal)
- Layout admin `(admin)/layout.tsx` (sidebar admin + fond)
- Loading screens (`(app)/loading.tsx`, `(admin)/loading.tsx`)
- `error.tsx`, `not-found.tsx` au niveau `[locale]`
- `CookieConsent.tsx` (rendu à la racine, visible en dark)

**P1 — Pages principales** :
- `dashboard/page.tsx` + `DashboardOrgView.tsx`
- `mail/page.tsx` (structure, PAS le contenu email HTML)
- `settings/page.tsx` + sous-composants settings
- `ProjectBreadcrumb.tsx`
- `CommandPalette.tsx`
- Toaster : ajouter `theme="system"` au composant `<Toaster>`

**P2 — Pages projets** :
- `projects/page.tsx`, `projects/[id]/page.tsx`
- Tous les onglets projet (Overview, Emails, Plans, Prix, Submissions, Tasks, Meetings, Visits, Closure)

**P3 — Pages secondaires** :
- `submissions/`, `plans/`, `tasks/`, `suppliers/`
- `meetings/`, `pv-chantier/`, `visits/`, `briefing/`, `chat/`
- `cantaia-prix/`, `pricing-intelligence/`
- `onboarding/`

**P4 — Composants partagés** :
- `EmptyState.tsx`, `ConfirmDialog.tsx`, `Breadcrumb.tsx`
- `IntelligentAlerts.tsx`, `IntelligenceScore.tsx`
- `packages/ui/src/components/shared/StatusBadge.tsx`
- Tous les composants dans `components/` non couverts par P0-P3

---

## 5. Cas spéciaux

### Emails HTML
Le contenu email rendu via `dangerouslySetInnerHTML` garde un wrapper `bg-white` forcé — les emails HTML ont leur propre styling et les assombrir casserait le rendu.

### Charts Recharts
- Grille, axes, tooltips : utiliser `stroke="currentColor"` ou les CSS variables
- Couleurs de données (bleu, vert, rouge) : inchangées
- Tooltip background : `bg-popover` + `text-popover-foreground`
- Ajouter des CSS variables chart si nécessaire : `--chart-1` à `--chart-5`

### Logo Cantaia SVG
Les strokes hardcodés (`#2563EB`, `#10B981`) restent identiques — bleu et vert ressortent bien sur fond slate.

### Super-admin
Déjà en dark hardcodé (gray-900 + amber). Pas touché par cette migration.

### Marketing & Auth
Hors scope. Restent en light only.

### Types/constantes avec couleurs hardcodées
Fichiers comme `plan-detail-types.ts` qui définissent des classes couleur dans des objets TS devront utiliser des `dark:` conditionnels. Pattern : `"bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"`.

---

## 6. Fichiers impactés (estimation)

| Catégorie | Fichiers | Type de changement |
|-----------|----------|-------------------|
| `globals.css` | 1 | Ajout bloc `.dark` + scrollbars + cleanup |
| `ThemeToggle.tsx` | 1 | Nouveau composant |
| `Sidebar.tsx` | 1 | Intégration toggle + migration couleurs + branding conditionnel |
| Messages i18n (×3) | 3 | 3 clés par locale |
| Layouts (app, admin) | 2 | Migration fond + border |
| Root-level (error, not-found, cookie) | 3 | Migration couleurs |
| Loading screens | 2 | Migration couleurs |
| Composants app | ~90 | Migration couleurs hardcodées → tokens |
| Pages app | ~55 | Migration couleurs hardcodées → tokens |
| Packages UI | ~5 | StatusBadge et composants partagés |
| Root layout (Toaster) | 1 | Ajout `theme="system"` |
| **Total** | ~170 fichiers | |

---

## 7. Non-scope

- Pas de stockage du thème en DB (localStorage suffit via next-themes)
- Pas de dark mode sur les pages marketing/landing
- Pas de dark mode sur les pages auth (login/register)
- Pas de modification du super-admin (déjà dark)
- Pas de dark mode pour le contenu HTML des emails
- Pas de transition animée entre les thèmes (déjà désactivé)
