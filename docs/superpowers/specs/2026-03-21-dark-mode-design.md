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
- Classes `dark:` / migration vers tokens sémantiques (~150 fichiers)
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
  --popover: 217 33% 17%;             /* slate-800 */
  --popover-foreground: 210 40% 98%;   /* slate-50 */
  --primary: 217 91% 60%;             /* brand blue — inchangé */
  --primary-foreground: 0 0% 100%;     /* white */
  --secondary: 217 33% 17%;           /* slate-800 */
  --secondary-foreground: 210 40% 98%; /* slate-50 */
  --muted: 215 28% 17%;               /* slate-800 légèrement différent */
  --muted-foreground: 217 10% 64%;    /* slate-400 */
  --accent: 217 33% 17%;              /* slate-800 */
  --accent-foreground: 210 40% 98%;    /* slate-50 */
  --destructive: 0 63% 31%;           /* red-900 */
  --destructive-foreground: 0 0% 100%; /* white */
  --border: 217 33% 17%;              /* slate-800 */
  --input: 217 33% 17%;               /* slate-800 */
  --ring: 217 91% 60%;                /* brand blue */
}
```

### `globals.css` — Modifications body/inputs

```css
body {
  color-scheme: light;  /* → retirer, remplacer par rien (géré par .dark) */
}

.dark body,
.dark input, .dark select, .dark textarea {
  color-scheme: dark;
}

input, select, textarea {
  color-scheme: light;          /* → retirer */
  background-color: white;     /* → retirer (utiliser bg-background) */
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

| Hardcodé | Token sémantique |
|----------|-----------------|
| `bg-white` | `bg-background` |
| `bg-gray-50`, `bg-gray-100` | `bg-muted` |
| `bg-gray-200` | `bg-muted` ou `bg-border` |
| `text-gray-900`, `text-gray-800` | `text-foreground` |
| `text-gray-700` | `text-foreground` |
| `text-gray-600`, `text-gray-500` | `text-muted-foreground` |
| `text-gray-400`, `text-gray-300` | `text-muted-foreground/60` ou `dark:text-slate-500` |
| `border-gray-200`, `border-gray-300` | `border-border` |
| `border-[#E5E7EB]` | `border-border` |
| `bg-blue-50` | `bg-primary/10` |
| `text-blue-600`, `text-blue-700` | `text-primary` |
| `hover:bg-gray-50`, `hover:bg-gray-100` | `hover:bg-muted` |
| `bg-slate-50` | `bg-muted` |
| `divide-gray-200` | `divide-border` |
| `ring-gray-300` | `ring-border` |
| `shadow-sm` | Reste inchangé (fonctionne en dark) |

### Priorité de migration

**P0 — Structure visible partout** :
- `globals.css` (variables + body/input)
- `Sidebar.tsx` + `ActiveProjectSection.tsx` + `ProjectSwitcher.tsx`
- Layout app `(app)/layout.tsx` (fond principal)
- `CommandPalette.tsx`

**P1 — Pages principales** :
- `dashboard/page.tsx` + `DashboardOrgView.tsx`
- `mail/page.tsx` (structure, PAS le contenu email HTML)
- `settings/page.tsx` + sous-composants
- `ProjectBreadcrumb.tsx`

**P2 — Pages projets** :
- `projects/page.tsx`, `projects/[id]/page.tsx`
- Tous les onglets projet (Overview, Emails, Plans, Prix, Submissions, Tasks, Meetings, Visits, Closure)

**P3 — Pages secondaires** :
- `submissions/`, `plans/`, `tasks/`, `suppliers/`
- `meetings/`, `pv-chantier/`, `visits/`, `briefing/`, `chat/`
- `cantaia-prix/`, `pricing-intelligence/`
- `admin/` (panneau org admin)

**P4 — Composants partagés** :
- `EmptyState.tsx`, `ConfirmDialog.tsx`, `Breadcrumb.tsx`
- `IntelligentAlerts.tsx`, `IntelligenceScore.tsx`
- Tous les composants dans `components/` non couverts par P0-P3

---

## 5. Cas spéciaux

### Sidebar — Branding org
Le `sidebarColor` du `BrandingProvider` (couleur custom par org) doit être ignoré en dark mode. La sidebar utilise `bg-background` + `border-border` en dark, indépendamment du branding.

### Emails HTML
Le contenu email rendu via `dangerouslySetInnerHTML` garde un wrapper `bg-white` forcé — les emails HTML ont leur propre styling et les assombrir casserait le rendu.

### Charts Recharts
- Grille, axes, tooltips : utiliser `stroke="currentColor"` ou les CSS variables
- Couleurs de données (bleu, vert, rouge) : inchangées
- Tooltip background : `bg-popover` + `text-popover-foreground`

### Logo Cantaia SVG
Les strokes hardcodés (`#2563EB`, `#10B981`) restent identiques — bleu et vert ressortent bien sur fond slate.

### Super-admin
Déjà en dark hardcodé (gray-900 + amber). Pas touché par cette migration.

### Marketing & Auth
Hors scope. Restent en light only.

---

## 6. Fichiers impactés (estimation)

| Catégorie | Fichiers | Type de changement |
|-----------|----------|-------------------|
| `globals.css` | 1 | Ajout bloc `.dark` + cleanup |
| `ThemeToggle.tsx` | 1 | Nouveau composant |
| `Sidebar.tsx` | 1 | Intégration toggle + migration couleurs |
| Messages i18n (×3) | 3 | 3 clés par locale |
| Composants app | ~80 | Migration couleurs hardcodées → tokens |
| Pages app | ~50 | Migration couleurs hardcodées → tokens |
| Layout app | 1 | Migration fond principal |
| **Total** | ~137 fichiers | |

---

## 7. Non-scope

- Pas de stockage du thème en DB (localStorage suffit via next-themes)
- Pas de dark mode sur les pages marketing/landing
- Pas de dark mode sur les pages auth (login/register)
- Pas de modification du super-admin (déjà dark)
- Pas de dark mode pour le contenu HTML des emails
- Pas de transition animée entre les thèmes (déjà désactivé)
