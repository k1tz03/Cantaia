# INSTRUCTION CLAUDE CODE — Refonte Landing Page CANTAIA

> Lis cette instruction en entier avant de commencer.
> Tu vas refaire la landing page de CANTAIA de zéro.
> L'objectif : passer d'un look "banque privée 2019" à un SaaS moderne,
> aéré, professionnel et crédible pour des chefs de projet construction suisses.

---

## CONTEXTE

CANTAIA est un SaaS de gestion de chantier augmenté par IA pour la Suisse.
La landing page actuelle a un fond navy sombre, une typo italique serif,
des grilles de cartes monotones, et aucun screenshot du produit.

Référence d'inspiration : Beekeeper (beekeeper.io) — fond clair, sections
aérées, mockups produit, alternance texte/visuels, CTAs clairs.

On NE copie PAS Beekeeper. On crée l'identité propre de CANTAIA :
un outil suisse, né sur le terrain, pour des professionnels exigeants.

---

## NOUVELLE DIRECTION ESTHÉTIQUE

### Palette de couleurs — ABANDONNER le navy+or

```
NOUVEAU :
- Background principal : #FAFAFA (gris très clair, presque blanc)
- Background sections alternées : #FFFFFF (blanc pur)
- Background section "social proof" / CTA : #111827 (gris très foncé, quasi noir)
- Couleur primaire : #2563EB (bleu vif professionnel — confiance, tech)
- Couleur accent : #10B981 (vert émeraude — succès, données, fiabilité)
- Texte principal : #111827 (quasi noir)
- Texte secondaire : #6B7280 (gris moyen)
- Bordures / lignes : #E5E7EB (gris clair)
- Badges / tags : #EFF6FF (bleu très pâle) avec texte #2563EB
```

### Typographie — ABANDONNER le serif italique

```
- Titres (h1, h2) : "Plus Jakarta Sans" (Google Fonts) — Bold, moderne, clean
  Alternative : "Outfit" ou "Sora"
- Sous-titres (h3, h4) : même famille, SemiBold
- Body texte : "Plus Jakarta Sans" Regular, 16-18px, line-height 1.6
- PAS de serif, PAS d'italique sauf pour des citations
- PAS de Playfair Display, PAS de Georgia
```

### Principes de layout

```
- Max-width container : 1200px, centré
- Sections : padding vertical généreux (80-120px)
- Alternance fond clair / fond blanc entre les sections
- Une section sur fond sombre (hero ou CTA final)
- Mockups/screenshots à droite, texte à gauche (et inversé pour la section suivante)
- JAMAIS de grille de 4 cartes identiques — varier les layouts
- Beaucoup d'espace blanc — laisser respirer
```

---

## STRUCTURE DE LA PAGE — Section par section

### SECTION 1 — NAVBAR (sticky)

```
Layout : Logo gauche | Liens centre | CTA droite
Background : blanc avec border-bottom subtile (#E5E7EB)
Box-shadow léger au scroll (shadow-sm)

Liens : Fonctionnalités | Tarifs | À propos
CTA : "Essai gratuit" (bouton bleu #2563EB, texte blanc, rounded-lg)
Pas de sélecteur de langue dans la nav (le mettre dans le footer)
Pas de "Connexion" visible — mettre un lien texte discret

Le logo CANTAIA en texte (Plus Jakarta Sans Bold) + une petite icône
simple (pas l'engrenage actuel qui fait "industrie lourde").
```

### SECTION 2 — HERO (fond blanc ou très légèrement gris)

```
Layout 2 colonnes : Texte à gauche (55%) | Mockup produit à droite (45%)

COLONNE GAUCHE :
- Badge en haut : "Conçu en Suisse pour la construction" 
  (fond #EFF6FF, texte #2563EB, icône drapeau suisse 🇨🇭, pill shape)
- Titre H1 : "Vos emails triés. Vos PV rédigés. Vos prix vérifiés."
  (Plus Jakarta Sans Bold, 48-56px, #111827)
  IMPORTANT : le titre décrit ce que le produit FAIT, pas ce qu'il EST.
  Pas de "assistant IA" ni de "plateforme". Des verbes, des résultats.
- Sous-titre : "CANTAIA analyse vos emails de chantier, génère vos 
  procès-verbaux et estime vos prix depuis des données réelles.
  Vous gagnez 2 heures par jour."
  (18px, #6B7280, max-width 520px)
- 2 boutons côte à côte :
  "Essai gratuit — 14 jours" (bleu #2563EB, grand, rounded-lg)
  "Voir la démo" (outline, border #E5E7EB, texte #111827)
- Sous les boutons, 3 badges inline :
  ✓ Normes SIA  ✓ Données en Europe  ✓ Sans carte bancaire
  (texte #6B7280, 14px, icône check verte #10B981)

COLONNE DROITE :
- Screenshot du dashboard CANTAIA dans un cadre de navigateur stylisé
  (barre de titre grise avec les 3 ronds rouge/jaune/vert)
- Si tu n'as pas de screenshot réel, crée un MOCKUP réaliste :
  Un faux dashboard montrant :
  - Sidebar gauche avec les modules (Mail, PV, Tâches, Plans)
  - Zone principale avec une inbox email
  - Un email surligné avec un badge "HRS Lausanne — 87% confiance"
  - Un petit panneau latéral "PV en cours — 3 min restantes"
- Ombre portée douce (shadow-2xl)
- Légère rotation (1-2 degrés) pour donner de la profondeur
```

### SECTION 3 — PREUVE SOCIALE (fond blanc)

```
Bande horizontale avec des logos clients ou des chiffres.

Si pas encore de logos clients (probable), utilise des chiffres :

Layout horizontal, centré, séparé par des lignes verticales fines :

"2'500+ offres analysées" | "60+ fournisseurs référencés" | "3 ans de données réelles" | "Made in Switzerland"

Style : chiffres en Plus Jakarta Sans Bold 32px bleu #2563EB,
labels en 14px #6B7280.

Quand tu auras des logos clients, remplace par :
"Ils nous font confiance" + logos en grayscale alignés.
```

### SECTION 4 — LE PROBLÈME (fond #FAFAFA)

```
Titre H2 centré : "Vous perdez 15 heures par semaine sur l'administratif"
Sous-titre : "Et chaque email non traité est un risque pour votre chantier."

3 cartes MAIS PAS une grille monotone. Layout asymétrique :
- Carte principale (grande, à gauche, occupe 50%) :
  Icône mail
  "150+ emails / jour"
  "12 chantiers dans une seule boîte. Chaque email non lu 
  est une décision qui glisse."
  Fond blanc, border gauche épaisse rouge (#EF4444)

- 2 petites cartes empilées à droite (chacune 50% de la colonne) :
  "2h par PV de séance"
  "Rédiger, formater, envoyer. Les décisions se perdent 
  entre deux réunions."
  Border gauche orange (#F59E0B)
  
  "Aucune vue d'ensemble"
  "Budgets, délais, fournisseurs — tout est éclaté entre 
  Excel, Outlook et WhatsApp."
  Border gauche jaune (#EAB308)

C'est visuel, c'est varié, et la taille de la carte principale 
attire l'œil sur le problème n°1 (les emails).
```

### SECTION 5 — LA SOLUTION : FEATURE 1 — MAIL (fond blanc)

```
Layout 2 colonnes : Texte à gauche | Mockup à droite

Titre H2 : "Vos emails classés par chantier en temps réel"
Sous-titre : "Connectez Outlook ou Gmail. CANTAIA trie, classifie
et priorise vos emails automatiquement."

3 bullet points avec icônes :
✅ Classification automatique par projet (87% de précision)
✅ Spam et newsletters filtrés sans effort  
✅ Tâches extraites directement depuis vos emails

Bouton : "Voir comment ça marche →" (lien texte bleu, pas un gros bouton)

MOCKUP à droite :
Un faux écran d'inbox CANTAIA montrant 4-5 emails avec :
- Des badges de projet colorés (HRS Lausanne, Cèdres, Dorigny)
- Un email marqué "Spam" en rouge
- Un email avec un badge "87%" de confiance en vert
- Style clair, fond blanc, typo propre
- Ombre douce, coins arrondis

Ce mockup peut être un div HTML/CSS stylisé, pas une image.
```

### SECTION 6 — FEATURE 2 — PV (fond #FAFAFA)

```
Layout 2 colonnes INVERSÉ : Mockup à gauche | Texte à droite

Titre H2 : "Votre PV de séance en 5 minutes au lieu de 2 heures"
Sous-titre : "Enregistrez la réunion. CANTAIA transcrit, structure
et envoie le procès-verbal aux participants."

3 bullet points :
🎙️ Transcription automatique (français, allemand, anglais)
📋 Structure SIA avec décisions et actions
📧 Envoyé aux participants en un clic

MOCKUP à gauche :
Un faux écran de PV montrant :
- En haut : "PV de chantier — Cèdres — Séance #12"
- Barre audio avec timeline (45:12 de durée)
- Étapes : ✅ Transcrit → ✅ PV généré → ✅ Envoyé (5 dest.)
- Aperçu du PV avec quelques lignes de texte
- Badge : "5 min au lieu de 2h"
```

### SECTION 7 — FEATURE 3 — PRIX (fond blanc)

```
Layout 2 colonnes : Texte à gauche | Mockup à droite

Titre H2 : "Des estimations basées sur des prix réels, pas sur du vent"
Sous-titre : "CANTAIA compare vos prix avec 2'500+ offres fournisseurs 
réelles du marché suisse."

3 bullet points :
📊 Prix médians par code CFC et par région
🟢 Badge "Données réelles" sur chaque ligne vérifiée
📈 Score de fiabilité transparent (pas de boîte noire)

MOCKUP à droite :
Un faux tableau d'estimation avec :
- 3-4 lignes de postes CFC (Béton armé, Coffrage, Ferraillage)
- Colonnes : Description | Qté | PU | Total | Source
- Badges verts "Données réelles" sur 2 lignes
- Un badge jaune "Réf. CRB" sur 1 ligne
- Score de fiabilité : "78% — Estimation fiable" en vert
- Fourchette min-médian-max affichée

C'est LE mockup qui doit impressionner un chef de projet.
Si les prix affichés sont crédibles (utilise des vrais prix suisses :
béton 350 CHF/m³, coffrage 55 CHF/m², ferraillage 2.80 CHF/kg),
le visiteur se dit immédiatement "ces gens connaissent mon métier".
```

### SECTION 8 — COMMENT ÇA MARCHE (fond #FAFAFA)

```
Titre H2 centré : "Opérationnel en 5 minutes"

3 étapes horizontales reliées par une ligne pointillée :

① "Connectez Outlook"
   Icône : logo Outlook/Microsoft
   "OAuth en 2 clics. Aucune installation."

② "Créez votre premier projet"  
   Icône : dossier + étoile
   "Donnez un nom. CANTAIA scanne vos emails."

③ "C'est parti"
   Icône : fusée
   "Emails classés, tâches créées, briefing demain matin."

Style : cercles numérotés (fond bleu #2563EB, texte blanc),
ligne pointillée entre les cercles (#E5E7EB),
texte sous chaque cercle.
```

### SECTION 9 — CONFIANCE / SUISSE (fond #111827 — section sombre)

```
Titre H2 blanc centré : "Conçu par et pour des chefs de projet construction"

3 cartes sur fond semi-transparent (bg-white/5, border bg-white/10) :

🇨🇭 "Pensé pour la Suisse"
   "Codes CFC, normes SIA, multilingue FR/DE/EN, prix en CHF."

🏗️ "Né sur le terrain"
   "Développé par un chef de projet qui gère 5+ chantiers 
   simultanément. Chaque feature résout un vrai problème."

🔒 "Vos données restent en Europe"
   "Hébergement européen. Chiffrement de bout en bout.
   Conforme RGPD et droit suisse."

Sous les cartes, bandeau de chiffres :
"2'500+ prix réels" | "60+ fournisseurs" | "3 langues" | "5 min pour démarrer"
Style : chiffres en blanc bold, labels en gris clair.
```

### SECTION 10 — PRICING (fond blanc)

```
Titre H2 centré : "Un seul plan. Tout inclus."
Sous-titre : "Pas de modules payants cachés."

UNE SEULE carte prix centrée (max-width 480px) :

"CANTAIA Fondateur"
"99 CHF / mois"
"Prix bloqué 12 mois pour les premiers utilisateurs"

Liste features :
✓ Triage intelligent des emails
✓ PV de séance automatiques  
✓ Gestion des tâches IA
✓ Briefing quotidien
✓ Estimation de prix sur données réelles
✓ Support prioritaire

Bouton : "Essai gratuit — 14 jours" (bleu, pleine largeur)
Sous le bouton : "Sans engagement. Sans carte bancaire."

Style : carte avec ombre (shadow-xl), border-top épaisse bleu #2563EB,
fond blanc, coins arrondis.

PAS de grille 3 colonnes avec Starter/Pro/Enterprise.
Un seul plan simple. On ajoutera les autres plus tard.
```

### SECTION 11 — CTA FINAL (fond gradient : #2563EB → #1D4ED8)

```
Titre H1 blanc centré : "Prêt à gagner 2 heures par jour ?"
Sous-titre blanc : "Rejoignez les chefs de projet qui ont transformé 
leur gestion de chantier."

2 boutons :
"Essai gratuit — 14 jours" (fond blanc, texte bleu)
"Demander une démo" (outline blanc, texte blanc)
```

### SECTION 12 — FOOTER (fond #111827)

```
Layout 4 colonnes :
- Logo CANTAIA + tagline courte + réseaux sociaux
- Produit : Fonctionnalités, Tarifs, Changelog
- Ressources : Blog, Documentation, Support
- Légal : CGV, Politique de confidentialité, Mentions légales

Sélecteur de langue ici (FR | DE | EN)

Tout en bas : "© 2026 CANTAIA — Conçu en Suisse 🇨🇭"
```

---

## DIRECTIVES TECHNIQUES

1. Modifie la page landing existante (probablement app/page.tsx 
   ou app/(marketing)/page.tsx — cherche le bon fichier)

2. Utilise Tailwind CSS + les composants existants du projet

3. Ajoute la font "Plus Jakarta Sans" via next/font :
   ```tsx
   import { Plus_Jakarta_Sans } from 'next/font/google';
   const plusJakarta = Plus_Jakarta_Sans({ 
     subsets: ['latin'],
     weight: ['400', '500', '600', '700', '800'],
   });
   ```

4. Les mockups produit sont des divs HTML/CSS stylisés, 
   PAS des images. Ça permet de les modifier facilement.
   Fais-les réalistes : vrais noms de projets suisses, 
   vrais prix CFC, vrais noms de fournisseurs.

5. Animations subtiles au scroll (apparition fade-in des sections).
   Utilise Framer Motion si déjà dans le projet, sinon CSS animations
   avec IntersectionObserver.

6. RESPONSIVE : la page DOIT être parfaite sur mobile.
   Sur mobile : les 2 colonnes deviennent 1 colonne,
   le mockup passe sous le texte.

7. Performance : les mockups sont du HTML, pas des images lourdes.
   Pas de vidéo auto-play. Pas de carousel complexe.

8. Supprime TOUT le contenu de la landing actuelle.
   C'est une refonte complète, pas un patch.

---

## DÉTAILS DES MOCKUPS À CRÉER EN HTML/CSS

### Mockup Inbox Email (Section 5)
```
┌─ CANTAIA — Emails ──────────────────────────┐
│ 📥 Boîte de réception          Tous | Non lus│
│─────────────────────────────────────────────│
│ 🟢 Marc Dupont                    il y a 12m │
│   Réservation grue — semaine 14              │
│   ┌──────────────┐                           │
│   │ HRS Lausanne │ 87%                       │
│   └──────────────┘                           │
│─────────────────────────────────────────────│
│ 🔴 Hilti AG — Catalogue 2026       Spam     │
│─────────────────────────────────────────────│
│ 🟢 Julie Favre — Arch.            il y a 1h │
│   Plans façade rév. C                        │
│   ┌─────────────┐ ┌────────┐                │
│   │ Cèdres      │ │ 📎 PDF │                │
│   └─────────────┘ └────────┘                │
│─────────────────────────────────────────────│
│ 🟡 Schaller SARL               il y a 3h    │
│   RE: Offre garde-corps                      │
│   ┌──────────────┐                           │
│   │ EMS L'Orée   │ 72%                       │
│   └──────────────┘                           │
└─────────────────────────────────────────────┘
```

### Mockup PV de Séance (Section 6)
```
┌─ PV de chantier — Cèdres — Séance #12 ─────┐
│                                              │
│ 🎙️ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 45:12     │
│                                              │
│ ✅ Transcription terminée                    │
│ ✅ PV généré — 12 décisions, 8 actions       │
│ ✅ Envoyé à 5 participants                   │
│                                              │
│ ⏱️ 5 min au lieu de 2h                       │
│                                              │
│ ┌────────────────────────────────────────┐   │
│ │ 3. Décisions                           │   │
│ │                                        │   │
│ │ 3.1 Le béton du radier sera coulé      │   │
│ │     semaine 15. Pompage confirmé       │   │
│ │     par Holcim.                        │   │
│ │                                        │   │
│ │ 3.2 Les plans façade rév. C sont       │   │
│ │     approuvés. Distribution par        │   │
│ │     l'architecte d'ici vendredi.       │   │
│ └────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### Mockup Estimation Prix (Section 7)
```
┌─ Estimation — Résidence Les Cèdres ─────────┐
│                                              │
│ Score de fiabilité : ████████░░ 78%          │
│ "Estimation fiable — quelques postes         │
│  à confirmer"                                │
│                                              │
│ CFC   Description         Qté   PU    Total │
│───────────────────────────────────────────── │
│ 215.1 Béton armé C30/37  145m³  350  50'750 │
│       🟢 Données réelles — 37 offres         │
│                                              │
│ 215.3 Coffrage dalles    620m²   55  34'100 │
│       🟢 Données réelles — 28 offres         │
│                                              │
│ 215.6 Ferraillage B500  18t    2'800 50'400 │
│       🟡 Réf. CRB 2025                      │
│                                              │
│──────────────────────────────── ─────────── │
│ TOTAL ESTIMÉ                      1'480'000  │
│ Fourchette : 1'250'000 — 1'720'000 CHF      │
└──────────────────────────────────────────────┘
```

---

## CE QUE TU NE FAIS PAS

- Ne touche PAS aux pages de l'app (dashboard, mail, etc.)
- Ne modifie PAS le routing ni le middleware
- Ne change PAS les couleurs de l'app, UNIQUEMENT la landing page
- N'ajoute PAS de librairies UI externes (pas de Chakra, pas de MUI)
- N'utilise PAS d'images stockées (tout en HTML/CSS/SVG)
- N'ajoute PAS de vidéo

---

## ORDRE D'EXÉCUTION

1. Identifie le fichier de la landing page actuelle
2. Sauvegarde l'ancien contenu dans un commentaire ou fichier séparé
3. Remplace par la nouvelle structure section par section
4. Ajoute la font Plus Jakarta Sans
5. Crée les 3 mockups produit en HTML/CSS
6. Ajoute les animations au scroll
7. Vérifie le responsive mobile (DevTools Chrome)
8. Vérifie que le build compile sans erreur
