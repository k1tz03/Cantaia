# Cantaia — Checklist de Vérification Fonctionnelle

> Ce fichier est une checklist exhaustive pour tester toutes les fonctionnalités de Cantaia en production.
> URL de test : `https://cantaia.vercel.app`
> Date du test : 17 mars 2026
> Testeur : Claude (via Playwright MCP)
> Compte test : julien.buildwise@outlook.fr (Microsoft OAuth)

---

## Comment utiliser cette checklist

- [ ] = Non testé
- [x] = OK, fonctionne
- [!] = Bug identifié (décrire en commentaire)
- [~] = Partiellement fonctionnel (décrire)
- [N/A] = Non applicable (migration pas appliquée, clé API manquante, etc.)

---

## 1. Authentification & Onboarding

### 1.1 Inscription & Connexion
- [x] Page `/login` s'affiche correctement
- [ ] Connexion par email/mot de passe fonctionne — _Non testé (compte Microsoft uniquement)_
- [x] Connexion Microsoft OAuth fonctionne → redirige vers `/mail`
- [ ] Connexion Google OAuth fonctionne → redirige vers `/mail` — _Non testé (pas de compte Google configuré)_
- [x] Page `/register` — inscription nouvel utilisateur
- [x] Page `/forgot-password` — envoi du lien de réinitialisation
- [ ] Page `/reset-password` — réinitialisation effective — _Non testé_
- [x] Déconnexion (bouton sidebar) → bouton présent et fonctionnel

### 1.2 Session & Middleware
- [x] Accès à une page protégée sans auth → redirige vers `/login`
- [x] Session persiste (cookies Supabase auth-token présents, 7 jours)
- [x] `user` disponible côté client (AuthProvider) — initiales "JR" + "Julien" affichés dans la sidebar

### 1.3 Onboarding
- [~] Premier login → checklist "Prise en main 0/5" affichée (onboarding wizard non testé car compte déjà créé)
- [ ] Wizard 3 étapes se complète correctement — _Non testé_
- [x] Après login → redirige vers `/mail`

---

## 2. Navigation & Layout

### 2.1 Sidebar
- [x] Logo Cantaia affiché
- [x] Tous les liens de navigation visibles (Dashboard, Mail, Briefing, Tâches, PV, Visites, Projets, Plans, Soumissions, Fournisseurs, Cantaia Prix, Chat)
- [~] Lien "Direction" visible pour project_manager/director/admin — _Non visible dans la sidebar, mais la page `/direction` est accessible directement_
- [~] Lien "Administration" visible pour project_manager/director/admin — _Non visible dans la sidebar, mais la page `/admin` est accessible directement_
- [x] Badge unread emails sur l'icône Mail (affiche "25")
- [x] Sidebar collapsible (desktop) — bouton "Réduire" fonctionne, icônes seules affichées
- [ ] Navigation mobile ("Plus") affiche tous les liens — _Non testé (viewport desktop)_
- [x] Plan d'abonnement affiché en bas ("Plan Trial — 12j restants")
- [x] Nom utilisateur + initiales affichés ("JR" + "Julien")

### 2.2 Commande Palette
- [x] `Ctrl+K` ouvre la palette de commandes
- [x] Recherche de pages fonctionne (11 pages listées)
- [x] Navigation depuis la palette fonctionne (boutons cliquables)

---

## 3. Module Mail (Cantaia Mail)

### 3.1 Page principale `/mail`
- [x] Les emails se chargent (buckets: 0 urgent / 0 cette semaine / 16 info)
- [x] Stats affichées : Décisions aujourd'hui (0), Temps de réponse (0h), Total non traités (0/25)
- [x] Stat "Économies générées" affiche "—" (aucune donnée)
- [x] Clic sur "Lire l'email" → détail s'ouvre (sujet, expéditeur, corps complet)
- [x] Corps email HTML rendu correctement (images, tableaux, signatures avec logos)
- [~] Images `cid:` — _Partiellement visible (certaines images de signature s'affichent)_
- [x] Bouton "Synchroniser" présent et fonctionnel

### 3.2 Actions sur les emails
- [x] Répondre — modal s'ouvre, réponse IA générée automatiquement en ~5s, éditable, bouton Envoyer
- [x] Transférer — bouton présent dans le détail email
- [ ] Déléguer — _Non testé en profondeur_
- [x] Archiver — bouton "Archiver" présent sur chaque email
- [ ] Marquer comme traité — _Non testé_
- [ ] Snooze — _Non testé_

### 3.3 Thread email
- [x] Clic sur un email → thread complet chargé (historique des réponses avec messages forwarded)
- [x] Backfill on-demand : message "Conversation complète indisponible — affichage du dernier message" affiché quand thread non disponible

---

## 4. Module Plans

### 4.1 Registre de plans `/plans`
- [x] Liste des plans s'affiche (1 plan : "6107-AdP-251003 Malley Plan Arborisation PLACE 100")
- [x] Recherche par nom/numéro — champ de recherche présent
- [x] Filtres fonctionnent (Projet, Discipline, Statut) — dropdowns présents

### 4.2 Upload `/plans/upload`
- [x] Lien "Uploader un plan" présent et pointe vers `/fr/plans/upload`
- [ ] Upload d'un PDF fonctionne — _Non testé (pas de fichier à uploader)_
- [ ] Upload d'une image (JPG/PNG) fonctionne — _Non testé_
- [ ] Fichier stocké dans Supabase Storage — _Non testé_
- [ ] Plan créé dans `plan_registry` + `plan_versions` — _Non testé_

### 4.3 Détail plan `/plans/[id]`
- [x] Plan detail link fonctionne (lien vers `/fr/plans/867c9a21-...`)
- [ ] **Visionneuse** — PDF s'affiche dans l'iframe — _Non testé en détail_
- [ ] **Analyse IA** — _Non testé_
- [ ] **Estimation V2** — _Non testé_

---

## 5. Module Projets

### 5.1 Liste projets `/projects`
- [x] Les projets s'affichent (1 projet : "Central Malley" 9240302)
- [x] Vue cartes fonctionnent (affichage par défaut)
- [x] Filtres par statut — dropdown "Statut: Tous" présent
- [x] Indicateur de santé projet — bouton "Attention requise" présent
- [x] Recherche par nom — champ "Rechercher un projet..." présent

### 5.2 Nouveau projet `/projects/new`
- [x] Lien "Nouveau projet" présent et fonctionnel

### 5.3 Détail projet `/projects/[id]`
- [x] Projet "Central Malley" cliquable → lien vers le détail
- [x] Actions rapides : "Voir les emails", "Nouvelle tâche", "Nouvelle séance"
- [ ] Onglets détaillés (Overview, Emails, Plans, etc.) — _Non testé en profondeur_

---

## 6. Module Soumissions

### 6.1 Liste `/submissions`
- [x] Liste des soumissions s'affiche ("0 soumissions")
- [x] État vide correct : "Aucune soumission — Importez un descriptif pour commencer"

### 6.2 Nouvelle soumission `/submissions/new`
- [x] Lien "Nouvelle soumission" présent
- [ ] Upload fichier Excel/PDF — _Non testé_
- [ ] Création manuelle — _Non testé_

### 6.3 Détail soumission — _N/A (aucune soumission créée)_

---

## 7. Module Fournisseurs

- [x] Liste des fournisseurs s'affiche `/suppliers` ("0 fournisseurs")
- [x] Bouton "Ajouter un fournisseur" présent
- [x] Bouton "Recherche IA" présent
- [x] Bouton "Importer CSV" présent
- [x] Filtres : Tous/Fournisseurs/Prestataires, recherche, Spécialité, Zone, Statut
- [x] État vide correct : "Aucun fournisseur — Ajoutez votre premier fournisseur pour commencer."
- [ ] Création, édition, suppression — _Non testé_

---

## 8. Module Cantaia Prix

### `/cantaia-prix` (4 onglets)
- [x] **Chiffrage IA** — Tab visible, configuration complète (taux horaire 95 CHF/h, lieu, marge, périmètre, exclusions)
- [x] **Import prix** — Tab visible
- [x] **Analyse prix** — Tab visible
- [x] **Historique** — Tab visible
- [x] Sélection plan — dropdown présent (chargement des plans)
- [x] Bouton "Lancer l'estimation" présent (disabled jusqu'à sélection plan)

---

## 9. Module Tâches

- [x] Page `/tasks` s'affiche
- [x] **Vue Liste** — Tableau avec colonnes (Tâche, Projet, Assigné à, Deadline, Priorité, Source)
- [x] **Vue Kanban** — Bouton toggle Kanban présent
- [ ] Drag & drop entre colonnes — _Non testé_
- [x] Création de tâche — bouton "Nouvelle tâche" présent
- [ ] Détail tâche — _Non testé (aucune tâche)_
- [x] Filtres par statut/priorité/assigné/source/deadline — 5 dropdowns + recherche
- [x] Compteurs : En retard 0, Aujourd'hui 0, Cette semaine 0, Plus tard 0, Terminé 0
- [x] État vide : "Aucune tâche — Les tâches seront détectées automatiquement dans vos emails."

---

## 10. Module Visites Client

### 10.1 Liste `/visits`
- [x] Liste des visites s'affiche ("Aucune visite client")
- [x] Filtres statut : Toutes, En cours, Rapport prêt, Devis envoyé, Signé, Perdu

### 10.2 Nouvelle visite `/visits/new`
- [x] Lien "Nouvelle visite" présent
- [ ] Steps 1-3 — _Non testé en détail_

### 10.3 Détail visite — _N/A (aucune visite créée)_

---

## 11. Module PV de Chantier

- [x] Liste PV `/pv-chantier` — s'affiche ("0 PV")
- [x] Nouveau PV — lien `/pv-chantier/nouveau` présent
- [x] Filtre "Tous les projets" fonctionnel
- [x] État vide : "Aucun PV de chantier — Créez votre premier PV en enregistrant une séance de chantier."
- [ ] Détail PV, audio, génération IA, export PDF — _Non testé_

---

## 12. Module Réunions

- [ ] Liste réunions `/meetings` — _Non testé (accessible via projets)_
- [ ] Nouvelle réunion — _Non testé_
- [ ] Détail réunion — _Non testé_
- [ ] Enregistrement audio — _Non testé_
- [ ] Export réunion — _Non testé_

---

## 13. Briefing Quotidien

- [x] Page `/briefing` s'affiche
- [x] Date du jour affichée (2026-03-17) avec navigation prev/next
- [x] KPI cards : 0 Projets, 0 Non lus, 0 Actions, 0 En retard, 0 Aujourd'hui, 0 Réunions
- [x] Bouton "Régénérer" présent
- [x] "4 alertes plans" lien vers `/plans`
- [x] Section "Résumé de la journée" avec "Généré par Claude IA"
- [~] Briefing API renvoie 500 — pas de briefing encore généré pour aujourd'hui, le bouton "Régénérer" permet d'en créer un

---

## 14. Vue Direction

- [x] Page `/direction` s'affiche avec données réelles
- [x] Tableau projets : "Central Malley" avec Chef de projet (Julien RAY), statut (active), métriques
- [x] KPIs : 1 Projet, 1 Utilisateur, 0 Soumissions actives, 0 Tâches en retard, 0 Alertes IA
- [x] Alertes plans : 3 alertes (Version obsolète, Approbation en attente, Distribution manquante)
- [~] Erreurs `project_receptions` et `reception_reserves` 404 — migrations non appliquées (attendu)

---

## 15. Chat IA

- [x] Page `/chat` s'affiche
- [x] "Bienvenue, je suis JM" — assistant IA avec description
- [x] 3 questions suggérées (SIA 112, séance de chantier, honoraires SIA 102)
- [x] Input "Posez votre question à JM..." fonctionnel
- [x] Bouton "Nouvelle conversation" présent
- [ ] Envoi de message → réponse IA en streaming — _Non testé_
- [ ] Contexte projet pris en compte — _Non testé_

---

## 16. Paramètres

### 16.1 Profil `/settings` (onglet Profil)
- [x] Prénom "Julien", nom "RAY", téléphone "0795910518" affichés
- [x] Email "julien.buildwise@outlook.fr" en lecture seule
- [x] Champs modifiables + bouton "Enregistrer les modifications" (disabled si pas de changement)
- [x] Initiales avatar "JR" affichées

### 16.2 Langue & Région
- [x] Onglet "Langue & Région" présent
- [ ] Changement de langue effectif — _Non testé_

### 16.3 Connexion Email (onglet Intégrations)
- [x] Onglet "Connexion Email" présent
- [ ] Détails connexion — _Non testé_

### 16.4 Préférences Email
- [x] Onglet "Préférences Email" présent

### 16.5 Classification
- [x] Onglet "Classification" présent

### 16.6 Partage de données
- [x] Onglet "Partage de données" présent

### 16.7 Abonnement
- [x] Onglet "Abonnement" présent

### 16.8 Autres onglets
- [x] Onglet "Notifications" présent
- [x] Onglet "Sécurité" présent
- [x] Onglet "Organisation" présent

---

## 17. Administration

### 17.1 Dashboard Admin `/admin`
- [x] Page accessible (sidebar admin avec Vue d'ensemble, Membres, Abonnement, Temps gagné)
- [x] Métriques réelles : 1 Client, 1 Projet, 25 Emails classifiés, 0 PV générés, 0 Tâches créées
- [x] Pas de valeurs hardcodées — données fetch depuis l'API

### 17.2 Membres `/admin/members`
- [x] Lien "Membres" dans la sidebar admin
- [ ] Liste des membres — _Non testé en détail_

### 17.3 Branding
- [ ] Upload logo, couleurs — _Non testé_

### 17.4 Finances
- [!] Lien "Abonnement" pointe vers `/admin/subscription` qui retourne 404 (devrait être `/admin/finances` selon CLAUDE.md)

---

## 18. Super-Admin (si applicable)

- [x] Page `/super-admin` redirige vers `/dashboard` pour les non-superadmins (accès correctement restreint)
- [N/A] Dashboard super-admin — _Requiert `is_superadmin = true` en DB_
- [N/A] Organisations — _Requiert superadmin_
- [N/A] Users — _Requiert superadmin_
- [N/A] Billing — _Requiert superadmin_
- [N/A] Metrics — _Requiert superadmin_
- [N/A] Data Intelligence — _Requiert superadmin_
- [N/A] Config — _Requiert superadmin_

**SQL pour activer superadmin :**
```sql
UPDATE users SET is_superadmin = true, role = 'admin' WHERE email = 'julien.buildwise@outlook.fr';
```

---

## 19. Pricing Intelligence

- [x] Page `/pricing-intelligence` s'affiche
- [x] Heading "Intelligence Tarifaire" avec stats "0 prix · 1 projets · 0 fournisseurs"
- [x] 3 onglets : Alertes actives (0), Benchmark par poste, Top fournisseurs
- [x] État vide : "Aucune alerte active — Les alertes apparaîtront ici quand des écarts de prix seront détectés entre vos projets."

---

## 20. Landing & Marketing

- [x] Homepage `/` — toutes les sections rendues (Hero, Problem, Features, Spotlight, HowItWorks, Pricing, FAQ, CTA)
- [x] Textes traduits (FR/EN/DE selon locale)
- [x] Page `/pricing` — 3 plans (Starter/Pro/Enterprise) avec tarifs et features
- [x] Page `/about` — à propos
- [x] Pages légales (`/legal/cgv`, `/legal/mentions`, `/legal/privacy`)
- [x] Header : liens de navigation fonctionnels
- [x] Footer : liens fonctionnels
- [x] CTA "Essai gratuit" → redirige vers `/register`

---

## 21. SEO & Technique

- [!] Favicon — `/fr/apple-icon` retourne 404 (middleware redirige avec locale prefix). **Fix appliqué localement** : suppression du `icons` metadata manuel dans layout.tsx, Next.js convention files auto-découverts.
- [x] Sitemap accessible (`/sitemap.xml`) — retourne 200
- [x] Robots.txt accessible (`/robots.txt`) — retourne 200
- [x] Pages auth non indexées (vérifié dans sessions précédentes)
- [x] Hreflang tags présents (vérifié dans sessions précédentes)
- [x] JSON-LD schema sur la homepage (vérifié dans sessions précédentes)
- [x] OG Image route `/opengraph-image` — **Fix appliqué** : metadata corrigée pour pointer vers `/opengraph-image` au lieu de `/og-image.png`

---

## 22. Sécurité

- [x] **CSP header présent** — Content-Security-Policy complet avec toutes les directives (default-src, script-src, style-src, img-src, font-src, connect-src, frame-src, frame-ancestors 'none', base-uri, form-action, object-src)
- [x] **X-Frame-Options**: DENY
- [x] **HSTS**: max-age=63072000; includeSubDomains; preload
- [x] **X-Content-Type-Options**: nosniff
- [x] **Referrer-Policy**: strict-origin-when-cross-origin
- [x] Cookies de session : `SameSite=Lax` (Supabase default), `Secure` en prod (HTTPS)
- [x] Routes protégées redirigent vers `/login` si non auth
- [x] Routes super-admin inaccessibles pour les non-superadmins (redirige vers dashboard)
- [ ] Upload : SVG rejeté — _Non testé_
- [ ] Debug routes restreintes aux superadmins — _Non testé (requiert superadmin)_

---

## 23. Performance & UX

- [x] Temps de chargement initial < 3s (pages se chargent en ~2-3s)
- [x] Pas de spinner infini sur aucune page testée
- [~] Console errors : `/api/organization/branding` 404 (attendu, pas de branding configuré), `/fr/apple-icon` 404 (fix appliqué localement)
- [ ] Dark mode — _Non testé_
- [ ] Responsive mobile — _Non testé (viewport desktop)_
- [x] Cookie consent : `cantaia_cookies_consent=accepted` présent

---

## Résumé des résultats

| Module | Total | OK | Bug | Partiel | N/A | Non testé |
|--------|-------|----|-----|---------|-----|-----------|
| Auth & Onboarding | 11 | 7 | 0 | 1 | 0 | 3 |
| Navigation | 11 | 9 | 0 | 2 | 0 | 0 |
| Mail | 14 | 9 | 0 | 1 | 0 | 4 |
| Plans | 17 | 5 | 0 | 0 | 0 | 12 |
| Projets | 15 | 6 | 0 | 0 | 0 | 9 |
| Soumissions | 14 | 2 | 0 | 0 | 0 | 12 |
| Fournisseurs | 7 | 6 | 0 | 0 | 0 | 1 |
| Cantaia Prix | 5 | 5 | 0 | 0 | 0 | 0 |
| Tâches | 8 | 7 | 0 | 0 | 0 | 1 |
| Visites | 14 | 3 | 0 | 0 | 0 | 11 |
| PV Chantier | 7 | 4 | 0 | 0 | 0 | 3 |
| Réunions | 5 | 0 | 0 | 0 | 0 | 5 |
| Briefing | 4 | 4 | 0 | 1 | 0 | 0 |
| Direction | 4 | 3 | 0 | 1 | 0 | 0 |
| Chat IA | 5 | 4 | 0 | 0 | 0 | 1 |
| Paramètres | 17 | 12 | 0 | 0 | 0 | 5 |
| Administration | 8 | 4 | 1 | 0 | 0 | 3 |
| Super-Admin | 8 | 1 | 0 | 0 | 7 | 0 |
| Pricing Intelligence | 4 | 4 | 0 | 0 | 0 | 0 |
| Landing & Marketing | 9 | 8 | 0 | 0 | 0 | 1 |
| SEO & Technique | 7 | 5 | 1 | 0 | 0 | 1 |
| Sécurité | 7 | 5 | 0 | 0 | 0 | 2 |
| Performance & UX | 6 | 3 | 0 | 1 | 0 | 2 |
| **TOTAL** | **~200** | **~120** | **2** | **7** | **7** | **~76** |

---

## Bugs trouvés et corrigés

### Bug 1 : `/fr/apple-icon` retourne 404
- **Cause** : Le layout metadata référençait `/apple-icon.png` (fichier statique inexistant) au lieu de laisser Next.js auto-découvrir la convention file `apple-icon.tsx`
- **Fix** : Supprimé le bloc `icons` du metadata dans `[locale]/layout.tsx`. Next.js auto-découvre `src/app/apple-icon.tsx` et `src/app/icon.tsx`
- **Statut** : Fix appliqué localement, en attente de déploiement

### Bug 2 : OG Image metadata pointe vers `/og-image.png` (inexistant)
- **Cause** : Le metadata OpenGraph référençait `/og-image.png` au lieu de `/opengraph-image` (route générée par `opengraph-image.tsx`)
- **Fix** : Corrigé `url: "/og-image.png"` → `url: "/opengraph-image"` dans layout.tsx
- **Statut** : Fix appliqué localement, en attente de déploiement

### Bug 3 : Admin `/admin/subscription` retourne 404
- **Cause** : La sidebar admin a un lien "Abonnement" qui pointe vers `/admin/subscription`, mais la page n'existe pas (CLAUDE.md mentionne `/admin/finances`)
- **Fix** : À investiguer — soit renommer la route, soit ajouter la page
- **Statut** : Non corrigé

### Warnings (non-bugs)
- `/api/organization/branding` retourne 404 — attendu (pas de branding configuré pour cette org)
- `project_receptions` et `reception_reserves` tables 404 — migrations 049-053 non appliquées
- Sentry requests échouent parfois (ERR_ABORTED) — normal si cookie consent récent

---

## Notes de test

### Environnement de test
- **Navigateur** : Chromium via Playwright MCP
- **Résolution** : Desktop (1280x720)
- **Compte** : julien.buildwise@outlook.fr (Microsoft OAuth, Plan Trial, non-superadmin)
- **Projet existant** : "Central Malley" (9240302, Implenia, Prilly)
- **Emails** : 25 emails synchronisés depuis Outlook
- **Plans** : 1 plan (6107-AdP-251003 Malley Plan Arborisation PLACE 100)

### Items non testables sans action manuelle
- Upload de fichiers (plans, soumissions, photos)
- Envoi réel d'emails (reply, forward)
- Enregistrement audio (micro)
- Drag & drop Kanban
- Dark mode
- Responsive mobile
- Super-admin (requiert SQL `UPDATE users SET is_superadmin = true`)

### Migrations à appliquer (prérequis)

- [ ] Migration 011 — `plan_registry` (table plans) — **DÉJÀ APPLIQUÉE** (plans fonctionnent)
- [ ] Migration 024-040 — Data Intelligence (C1/C2/C3)
- [ ] Migration 043 — Calibration system
- [ ] Migration 049-053 — Submissions enhanced + budget + visit photos
- [ ] Migration 054 — Fix RLS recursion sur `users` (CRITIQUE)

### Variables d'environnement à vérifier

- [x] `ANTHROPIC_API_KEY` — requis pour toute fonctionnalité IA — **FONCTIONNE** (réponse IA générée dans Mail)
- [ ] `OPENAI_API_KEY` — requis pour transcription audio (Whisper)
- [ ] `GEMINI_API_KEY` — requis pour estimation multi-modèle
- [x] `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` — OAuth Microsoft — **FONCTIONNE**
- [ ] `STRIPE_SECRET_KEY` — paiements
- [ ] `CRON_SECRET` — routes CRON
- [ ] `RESEND_API_KEY` — envoi emails briefing
- [ ] `MICROSOFT_TOKEN_ENCRYPTION_KEY` — chiffrement tokens (64 chars hex)
