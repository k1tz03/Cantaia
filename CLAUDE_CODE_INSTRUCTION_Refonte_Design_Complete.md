# INSTRUCTION CLAUDE CODE — Refonte Design Complète CANTAIA

> Lis cette instruction en entier avant de commencer.
> Tu vas refaire le design visuel de CANTAIA : landing page ET application.
> L'objectif : un design system cohérent, moderne, professionnel.
> On passe d'un look "banque privée 2019" (beige + or + serif)
> à un look "SaaS premium 2026" (blanc + bleu + géométrique).

---

## PARTIE A — DESIGN SYSTEM GLOBAL

Avant de toucher à quoi que ce soit, crée un fichier de design tokens
qui sera partagé entre la landing page et l'application.

### Crée le fichier : `packages/ui/src/styles/design-tokens.ts`

```typescript
export const colors = {
  // Backgrounds
  bg: {
    primary: '#FFFFFF',        // Fond principal (pages, cards)
    secondary: '#F9FAFB',      // Fond alterné (sections, sidebar hover)
    tertiary: '#F3F4F6',       // Fond inputs, zones neutres
    dark: '#111827',           // Sections sombres, footer, navbar app
    darkHover: '#1F2937',      // Hover sur fond sombre
  },
  // Marque
  brand: {
    primary: '#2563EB',        // Bleu — CTAs, liens, actifs
    primaryHover: '#1D4ED8',   // Bleu foncé — hover
    primaryLight: '#EFF6FF',   // Bleu très pâle — badges, backgrounds
    secondary: '#10B981',      // Vert émeraude — succès, données réelles
    secondaryLight: '#ECFDF5', // Vert pâle — badges succès
  },
  // Texte
  text: {
    primary: '#111827',        // Titres, texte principal
    secondary: '#6B7280',      // Sous-titres, descriptions
    tertiary: '#9CA3AF',       // Placeholders, hints
    onDark: '#FFFFFF',         // Texte sur fond sombre
    onDarkSecondary: '#D1D5DB',// Texte secondaire sur fond sombre
    link: '#2563EB',           // Liens
  },
  // Statuts
  status: {
    success: '#10B981',
    successBg: '#ECFDF5',
    warning: '#F59E0B',
    warningBg: '#FFFBEB',
    error: '#EF4444',
    errorBg: '#FEF2F2',
    info: '#3B82F6',
    infoBg: '#EFF6FF',
  },
  // Bordures
  border: {
    light: '#E5E7EB',          // Bordures cartes, inputs, séparateurs
    medium: '#D1D5DB',         // Bordures plus marquées
    focus: '#2563EB',          // Focus ring
  },
} as const;

export const fonts = {
  heading: '"Plus Jakarta Sans", system-ui, sans-serif',
  body: '"Plus Jakarta Sans", system-ui, sans-serif',
  mono: '"JetBrains Mono", "Fira Code", monospace',
} as const;

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.05)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.04)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.04)',
} as const;
```

### Mets à jour le tailwind.config.ts principal

Ajoute ces couleurs custom dans la section `extend.colors` :

```typescript
extend: {
  colors: {
    brand: {
      DEFAULT: '#2563EB',
      hover: '#1D4ED8',
      light: '#EFF6FF',
      secondary: '#10B981',
      'secondary-light': '#ECFDF5',
    },
    surface: {
      primary: '#FFFFFF',
      secondary: '#F9FAFB',
      tertiary: '#F3F4F6',
      dark: '#111827',
    },
  },
  fontFamily: {
    sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
    mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
  },
}
```

### Ajoute la font Plus Jakarta Sans

Dans le layout racine (app/layout.tsx ou équivalent) :

```typescript
import { Plus_Jakarta_Sans } from 'next/font/google';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
});
```

Applique `plusJakarta.variable` sur le `<html>` ou `<body>`.
Supprime toute référence à Playfair Display, Georgia, ou serif fonts.

---

## PARTIE B — REFONTE DE L'APPLICATION

### B.1 — SIDEBAR

La sidebar actuelle est trop fade. Voici les changements :

```
AVANT : fond crème, icônes ternes, pas de hiérarchie
APRÈS : fond blanc avec border-right, icônes colorées, module actif bien marqué

Fond : bg-white + border-r border-gray-200
Largeur : 240px (collapsible à 64px)

Logo en haut : "CANTAIA" en Plus Jakarta Sans Bold, texte #111827
                Petit icône géométrique simple à gauche (pas l'engrenage actuel)

Items de navigation :
- Inactif : texte #6B7280, icône #9CA3AF, bg transparent
  Hover : bg-gray-50, texte #111827
- Actif : bg-blue-50 (#EFF6FF), texte #2563EB, icône #2563EB
  Border-left 3px solid #2563EB
- Badge compteur (mail 25) : bg-blue-600 text-white rounded-full px-2 text-xs

Groupes de navigation (optionnel) :
- "QUOTIDIEN" : Mail, Tâches, PV de chantier
- "PROJETS" : Projets, Plans, Soumissions
- "DONNÉES" : Fournisseurs, Cantaia Prix
- "ASSISTANT" : JM

En bas de la sidebar :
- Plan Trial 12j restants → badge bg-amber-50 text-amber-700
- Avatar utilisateur : cercle avec initiales bg-blue-100 text-blue-700
- Bouton "Réduire" : icône chevron, discret

Transition : 200ms ease sur le collapse/expand
```

### B.2 — HEADER / TOP BAR (dans les pages de l'app)

```
Si il y a un header au-dessus du contenu principal :
- Fond blanc, border-b border-gray-200
- Titre de la page à gauche (Plus Jakarta Sans SemiBold, 24px, #111827)
- Breadcrumb si pertinent : Dashboard > Mail > Central Malley
  (texte #9CA3AF, séparateur /, dernier élément #111827)
- Actions à droite (boutons, filtres)
```

### B.3 — DASHBOARD

```
AVANT : grille 3×3 de cartes identiques avec icônes colorées
APRÈS : layout avec hiérarchie, stats en haut, modules en dessous

ZONE 1 — Barre de bienvenue (en haut, pleine largeur) :
"Bonjour, Julien" (Plus Jakarta Sans Bold, 28px, #111827)
"Vous avez 25 emails non lus et 3 tâches urgentes"
(16px, #6B7280)
Pas de fond spécial, juste du texte. Simple et direct.

ZONE 2 — Stats rapides (4 cartes horizontales) :
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 📨 25        │ │ ✅ 12        │ │ 📋 3         │ │ 🏗️ 5         │
│ Emails       │ │ Tâches       │ │ PV cette     │ │ Projets      │
│ non lus      │ │ en cours     │ │ semaine      │ │ actifs       │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘

Style : bg-white, border border-gray-200, rounded-xl, p-5
Chiffre : Plus Jakarta Sans Bold 32px #111827
Label : 14px #6B7280
Icône : 20px dans un cercle bg-blue-50 text-blue-600
        (ou bg-green-50 text-green-600 pour les tâches, etc.)
Hover : shadow-md transition

ZONE 3 — Raccourcis modules (en dessous, grille 2 colonnes) :
Garde les cartes modules MAIS :
- Seulement les 4-6 modules les plus utilisés (pas 9)
- Plus petites, plus discrètes que les stats
- Icône + titre + description courte
- Style : bg-white, border border-gray-200, rounded-lg, p-4
  Hover : border-blue-200, shadow-sm
- Les icônes utilisent les couleurs du design system
  (bleu, vert, amber) pas les couleurs random actuelles
```

### B.4 — MODULE MAIL

```
Le layout split panel est bon. Les changements sont cosmétiques :

FOND GLOBAL : bg-white (pas beige)

LISTE EMAILS (panneau gauche) :
- Fond : bg-white
- Email non lu : fond bg-white, texte bold, point bleu à gauche
- Email lu : fond bg-gray-50, texte normal
- Email sélectionné : bg-blue-50, border-l-2 border-blue-600
- Badge projet : bg-blue-100 text-blue-700 rounded-full px-2 py-0.5 text-xs
  (remplacer le style actuel "● Central Malley - Aire A" par un pill propre)
- Badge "Action" : bg-amber-100 text-amber-700
- Badge "Spam" : bg-red-100 text-red-700
- Hover : bg-gray-50
- Séparateur entre emails : border-b border-gray-100

DÉTAIL EMAIL (panneau droit) :
- Fond : bg-white
- En-tête : expéditeur en SemiBold #111827, adresse en #6B7280
- Badge projet : même style pill que dans la liste
- Section "RÉSUMÉ IA" : 
  Fond bg-blue-50, border-l-4 border-blue-600, rounded-r-lg, p-4
  Icône ✨ en bleu
  Texte en #111827
- Section "TÂCHES DÉTECTÉES" : 
  Icône ✅ en vert
  Liste de tâches avec checkbox
- Section "PROPOSITION DE RÉPONSE IA" :
  Fond bg-gray-50, rounded-lg, p-4
  Bouton "Utiliser cette réponse" bg-blue-600 text-white
- Actions rapides en bas :
  Boutons outline : border-gray-200 text-gray-700 hover:bg-gray-50
  "Marquer urgent" en rouge : text-red-600 hover:bg-red-50
```

### B.5 — MODULE CHAT JM

```
AVANT : fond blanc, avatar or/doré, questions suggestions bland
APRÈS : plus vivant, JM a une identité visuelle propre

FOND : bg-gray-50 pour la zone de chat (pas blanc pur — ça fait vide)

Avatar JM : cercle bg-blue-600 avec les lettres "JM" en blanc Bold
(pas le cercle doré actuel)

Sidebar conversations : 
- Fond bg-white, border-r border-gray-200
- Item actif : bg-blue-50, text-blue-700
- Item inactif : text-gray-600

Zone de chat :
- Messages JM : bg-white, border border-gray-200, rounded-2xl, p-4
  Texte #111827, shadow-sm
- Messages utilisateur : bg-blue-600, text-white, rounded-2xl, p-4
  Aligné à droite

Questions suggérées :
- Style : bg-white, border border-gray-200, rounded-xl, p-4
  Hover : border-blue-300, shadow-sm
  Texte : #374151
  Icône : 💬 ou ❓ en bleu

Input en bas :
- Fond bg-white, border border-gray-300, rounded-xl
  Focus : border-blue-500, ring-2 ring-blue-100
- Bouton envoi : bg-blue-600, rounded-full, icon flèche blanche
```

### B.6 — MODULE FOURNISSEURS

```
Le tableau est bien structuré. Changements :

FOND : bg-white

Header tableau :
- bg-gray-50, texte uppercase tracking-wider text-xs #6B7280
- Pas de fond coloré, sobre

Lignes :
- Alternance bg-white / bg-gray-50 très subtile
- Hover : bg-blue-50/30 (bleu très transparent)
- Avatar fournisseur : cercle bg-blue-100 text-blue-700
  (au lieu des cercles colorés random)
  OU utiliser la première lettre du nom
- Badge "Fournisseur" : bg-blue-100 text-blue-700
- Badge "Prestataire" : bg-purple-100 text-purple-700
- Badge spécialité : bg-gray-100 text-gray-700 rounded-full
- Statut "Actif" : cercle vert + texte vert
- Statut "Nouveau" : cercle amber + texte amber
- Score 0/100 : remplacer par une barre de progression
  ou un badge coloré selon le score

Boutons en haut :
- "Recherche IA" : bg-blue-600 text-white (CTA principal)
- "Importer CSV" : border border-gray-300 text-gray-700
- "+ Ajouter" : bg-green-600 text-white
```

### B.7 — COMPOSANTS GLOBAUX (Cards, Buttons, Inputs, Badges)

```
BOUTONS :
- Primary : bg-blue-600 text-white hover:bg-blue-700 rounded-lg px-4 py-2.5
  Font : Plus Jakarta Sans SemiBold 14px
  Shadow : shadow-sm
  Transition : 150ms
- Secondary : bg-white border border-gray-300 text-gray-700 hover:bg-gray-50
- Danger : bg-red-600 text-white hover:bg-red-700
- Ghost : text-gray-600 hover:text-gray-900 hover:bg-gray-100
- Taille large : px-6 py-3 text-base
- Taille small : px-3 py-1.5 text-sm

INPUTS :
- bg-white border border-gray-300 rounded-lg px-3 py-2.5
  Focus : border-blue-500 ring-2 ring-blue-100
  Placeholder : text-gray-400
  Error : border-red-500 ring-2 ring-red-100

CARDS :
- bg-white border border-gray-200 rounded-xl
  Hover (si cliquable) : shadow-md border-gray-300 transition
  Padding : p-5 ou p-6

BADGES :
- Default : bg-gray-100 text-gray-700 rounded-full px-2.5 py-0.5 text-xs font-medium
- Blue : bg-blue-100 text-blue-700
- Green : bg-green-100 text-green-700
- Amber : bg-amber-100 text-amber-700
- Red : bg-red-100 text-red-700
- Pill shape (arrondi complet) : rounded-full
- Tag shape (moins arrondi) : rounded-md

TABLES :
- Header : bg-gray-50 text-xs uppercase tracking-wider text-gray-500
- Rows : border-b border-gray-100
- Hover : bg-gray-50
- Selected : bg-blue-50

MODALS :
- Overlay : bg-black/50 backdrop-blur-sm
- Content : bg-white rounded-2xl shadow-2xl max-w-lg
- Header : border-b border-gray-200 p-6
- Body : p-6
- Footer : border-t border-gray-100 p-4 bg-gray-50 rounded-b-2xl

TOASTS / NOTIFICATIONS :
- Success : bg-green-50 border border-green-200 text-green-800
- Error : bg-red-50 border border-red-200 text-red-800
- Info : bg-blue-50 border border-blue-200 text-blue-800
```

---

## PARTIE C — REFONTE LANDING PAGE

[Identique au fichier précédent CLAUDE_CODE_INSTRUCTION_Refonte_Landing.md
mais avec les couleurs mises à jour ci-dessus]

La landing page utilise exactement le même design system que l'app.
Reprends TOUTE la structure des 12 sections décrites dans le fichier
CLAUDE_CODE_INSTRUCTION_Refonte_Landing.md avec les nouvelles couleurs.

---

## ORDRE D'EXÉCUTION

1. **Design tokens + Tailwind config** (15 min)
   Crée le fichier de tokens, mets à jour tailwind.config.ts,
   ajoute la font Plus Jakarta Sans dans le layout

2. **CSS global** (10 min)
   Supprime les anciennes couleurs (navy, gold, parchment, beige)
   dans le CSS global (globals.css ou equivalent)
   Remplace par les nouvelles valeurs

3. **Sidebar** (30 min)
   C'est le composant visible sur TOUTES les pages — le plus impactant

4. **Dashboard** (30 min)
   La première page que voit l'utilisateur après login

5. **Module Mail** (20 min)
   C'est le module le plus utilisé

6. **Module Chat JM** (15 min)

7. **Module Fournisseurs** (15 min)

8. **Composants globaux** (30 min)
   Buttons, inputs, cards, badges, tables, modals
   Cherche les composants partagés dans components/ui/
   et applique le nouveau style

9. **Landing page** (1h)
   Refonte complète selon les 12 sections décrites

10. **Vérification responsive** (15 min)
    Toutes les pages principales en mobile (DevTools Chrome 375px)

11. **Build check** (5 min)
    Vérifie que tout compile

---

## CE QUE TU NE FAIS PAS

- Ne change PAS la logique métier (routes API, traitement IA, etc.)
- Ne change PAS la structure des pages (les composants restent les mêmes)
- Ne change PAS le routing
- Ne supprime PAS de fonctionnalités
- Tu changes UNIQUEMENT le visuel : couleurs, typo, espacements, bordures, ombres
- Si un composant utilise des classes Tailwind, remplace les classes
- Si un composant utilise du CSS-in-JS ou des variables CSS, mets-les à jour
- Si un composant utilise des couleurs hardcodées en hex, remplace-les

---

## RÉSUMÉ DU CHANGEMENT VISUEL

| Élément | AVANT | APRÈS |
|---------|-------|-------|
| Fond principal | Beige/crème (#F5F2EB) | Blanc (#FFFFFF) |
| Fond secondaire | Navy (#0A1F30) | Gris clair (#F9FAFB) |
| Couleur accent | Or (#C4A661) | Bleu (#2563EB) |
| Couleur succès | Or | Vert émeraude (#10B981) |
| Font titres | Playfair Display (serif italic) | Plus Jakarta Sans (sans Bold) |
| Font body | Mélange serif/sans | Plus Jakarta Sans |
| Bordures | Subtiles/absentes | Visibles (#E5E7EB) |
| Ombres | Rares | Plus présentes (shadow-sm à shadow-xl) |
| Coins arrondis | Moyens | Plus marqués (rounded-xl) |
| Icônes sidebar | Couleurs random | Monochromes + actif en bleu |
| Badges | Or/doré | Couleurs sémantiques (bleu, vert, amber, red) |
| Sensation | Banque privée, luxe, lourd | SaaS moderne, aéré, professionnel |
