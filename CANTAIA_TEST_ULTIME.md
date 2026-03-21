# CANTAIA — TEST ULTIME PRÉ-DÉMO (1000 employés)

> **CONTEXTE CRITIQUE** : Julien a un rendez-vous de présentation de Cantaia auprès d'un groupe de 1000 employés. TOUT doit fonctionner parfaitement. Zéro erreur, zéro donnée aberrante, zéro page cassée. Chaque fonctionnalité doit être testée, chaque flux validé, chaque edge case couvert.

---

## RÈGLES D'ENGAGEMENT

1. **AUCUNE TOLÉRANCE** : Si une fonctionnalité ne marche pas → tu la corriges immédiatement ou tu me passes la main
2. **PROACTIF** : Tu ne te contentes pas de tester — tu AMÉLIORES ce que tu trouves
3. **PERSISTANT** : Si tu es bloqué (auth, DB, permissions), tu ne renonces JAMAIS. Tu proposes des alternatives, des workarounds, des requêtes SQL manuelles
4. **INTELLIGENT** : Tu analyses chaque donnée affichée. "CHF 0.00" sur un budget ? C'est un bug. "il y a 19234 jours" ? C'est un bug. Une date en 2099 ? Bug.
5. **DOCUMENTÉ** : Chaque problème trouvé → screenshot + description + fichier + ligne + fix proposé
6. **CONTINU** : Tu testes pendant des HEURES. Tu ne t'arrêtes pas après 1 passe. Tu fais 3 passes minimum.

---

## PHASE 0 — SETUP DONNÉES DE DÉMO

### 0.1 — Organisation de démo
Créer une organisation réaliste pour la démo :

```sql
-- Organisation démo "Menétrey SA"
-- Vérifier qu'elle existe, sinon la créer
SELECT * FROM organizations WHERE name ILIKE '%menetrey%';

-- Si besoin, mettre à jour avec des données réalistes :
UPDATE organizations SET
  name = 'Menétrey SA',
  address = 'Route de Cossonay 35',
  city = 'Lausanne',
  country = 'Suisse',
  subscription_plan = 'pro',
  max_users = 25,
  max_projects = 50,
  branding_enabled = true,
  primary_color = '#1E3A5F'
WHERE id = '<ORG_ID>';
```

### 0.2 — Membres fictifs (5 profils)
```sql
-- Vérifier les membres existants
SELECT id, email, first_name, last_name, role FROM users WHERE organization_id = '<ORG_ID>';

-- Les profils nécessaires pour la démo :
-- 1. Julien RAY — project_manager (déjà existant)
-- 2. Sophie MARTIN — site_manager
-- 3. Pierre DUMONT — director
-- 4. Marie FAVRE — admin
-- 5. Lucas MÜLLER — foreman

-- Si des membres manquent, les inviter via /admin/members
-- Ou créer via SQL si nécessaire (attention: il faut aussi un auth.users)
```

### 0.3 — Projets de démo (3 projets réalistes)
Vérifier que ces projets existent avec des données cohérentes :

```sql
-- Projet 1 : Central Malley (actif, gros chantier)
-- Budget: 8.5M CHF, 15 lots, 45 tâches, 200+ emails
-- Status: active, start_date: 2025-09-01, end_date: 2026-12-31

-- Projet 2 : Résidence Les Alpes (en cours, moyen)
-- Budget: 3.2M CHF, 8 lots, 20 tâches, 80 emails
-- Status: active, start_date: 2026-01-15, end_date: 2026-10-30

-- Projet 3 : Villa Léman (clôture)
-- Budget: 1.8M CHF, 6 lots, 12 tâches, 50 emails
-- Status: closing, start_date: 2025-03-01, end_date: 2026-04-15

SELECT id, name, code, status, budget_total, start_date, end_date
FROM projects WHERE organization_id = '<ORG_ID>';
```

### 0.4 — Fournisseurs de démo (10 minimum)
```sql
SELECT id, company_name, overall_score, specialties, response_rate
FROM suppliers WHERE organization_id = '<ORG_ID>';

-- Fournisseurs nécessaires :
-- 1. Implenia SA — Gros œuvre (score 85)
-- 2. Losinger Marazzi — Structure béton (score 78)
-- 3. Bouygues Suisse — Électricité (score 92)
-- 4. Alpiq InTec — CVC/Chauffage (score 88)
-- 5. Geberit SA — Sanitaire (score 95)
-- 6. Schindler — Ascenseurs (score 90)
-- 7. Sika Suisse — Étanchéité (score 82)
-- 8. Rigips SA — Cloisons/Plâtrerie (score 75)
-- 9. Forbo Flooring — Revêtements sols (score 87)
-- 10. HG Commerciale — Menuiserie (score 80)
```

---

## PHASE 1 — TEST PAGES PUBLIQUES (sans auth)

### 1.1 — Landing page
- [ ] Naviguer vers `https://cantaia.vercel.app/fr`
- [ ] Vérifier : titre, sous-titre, CTA visibles
- [ ] Vérifier : aucun texte hardcodé en anglais sur la version FR
- [ ] Vérifier : les images/mockups chargent correctement (pas de placeholder cassé)
- [ ] Tester le bouton "Essai gratuit" → doit rediriger vers /register
- [ ] Tester navigation : Tarifs, À propos
- [ ] Vérifier le footer : liens légaux, copyright 2026
- [ ] **Changer la langue** en EN puis DE → vérifier que TOUT est traduit
- [ ] Performance : la page charge en < 3 secondes

### 1.2 — Page Tarifs
- [ ] Vérifier les 4 plans affichés (Trial, Starter, Pro, Enterprise)
- [ ] Vérifier les prix en CHF
- [ ] Boutons CTA fonctionnels
- [ ] Version EN/DE cohérente

### 1.3 — Pages légales
- [ ] CGV : contenu présent (pas placeholder)
- [ ] Mentions légales : adresse, raison sociale
- [ ] Politique de confidentialité : RGPD, cookies

### 1.4 — SEO technique
- [ ] Vérifier `<title>` sur chaque page (pas "undefined" ou vide)
- [ ] Vérifier Open Graph image (pas 404)
- [ ] Vérifier favicon visible dans l'onglet
- [ ] Vérifier canonical URL
- [ ] Robots.txt : routes app bloquées

---

## PHASE 2 — AUTHENTIFICATION & ONBOARDING

### 2.1 — Login
- [ ] Page login : formulaire email/password
- [ ] Bouton Microsoft OAuth visible et fonctionnel
- [ ] Bouton Google OAuth visible
- [ ] Lien "Mot de passe oublié" fonctionne
- [ ] Login avec les credentials de Julien → redirige vers /action-board
- [ ] Vérifier : pas de flash blanc, pas de redirect en boucle

### 2.2 — Session
- [ ] Après login, la sidebar affiche le bon nom d'utilisateur
- [ ] Le badge unread emails s'affiche (si emails non lus)
- [ ] Navigation entre pages : pas de re-login demandé
- [ ] Refresh page (F5) : session maintenue

---

## PHASE 3 — ACTION BOARD (page post-login)

### 3.1 — Contenu
- [ ] Le greeting affiche "Bonjour {Prénom}" avec la bonne date
- [ ] Les 4 KPI pills affichent des VRAIS chiffres (pas 0 partout)
- [ ] Le feed de décisions contient des items (emails, tâches, soumissions)
- [ ] Chaque item a un titre lisible, un badge projet, des boutons d'action
- [ ] Vérifier : pas d'item avec date "Invalid Date" ou titre "undefined"
- [ ] Le résumé IA (section collapsible) s'affiche ou le bouton "Générer" fonctionne

### 3.2 — Actions
- [ ] Cliquer "Voir" sur un email → navigue vers /mail avec l'email sélectionné
- [ ] Cliquer "Marquer fait" sur une tâche → la card disparaît avec animation
- [ ] Cliquer "Archiver" sur un email → la card disparaît
- [ ] Le compteur se met à jour après chaque action

### 3.3 — Performance
- [ ] La page charge en < 2 secondes
- [ ] Le feed n'est pas vide (sinon → problème de données)
- [ ] Pas d'erreur console (ouvrir DevTools → Console)

---

## PHASE 4 — MODULE MAIL

### 4.1 — Vue décisions
- [ ] 3 buckets visibles : Urgent, Cette semaine, Informations
- [ ] Les emails s'affichent avec sujet, expéditeur, date, badge projet
- [ ] Cliquer un email → le thread s'ouvre dans le panneau droit
- [ ] Le corps de l'email s'affiche correctement (HTML rendu, pas de balises brutes)
- [ ] Les images dans les emails s'affichent (pas de placeholder cassé)
- [ ] Pas de "undefined" ou "null" dans les champs

### 4.2 — Actions email
- [ ] Bouton "Répondre" → modal avec éditeur de réponse
- [ ] L'IA suggère une réponse (bouton "Suggestion IA")
- [ ] Bouton "Déléguer" → modal avec sélection de collègue
- [ ] Bouton "Transférer" → modal avec champ destinataire
- [ ] Bouton "Archiver" → l'email disparaît du feed

### 4.3 — Sync
- [ ] Bouton "Sync" visible
- [ ] Clic → toast "Synchronisation en cours" puis résultat

### 4.4 — Edge cases
- [ ] Email sans sujet → affiche "(Sans objet)" pas "undefined"
- [ ] Email avec pièce jointe → icône trombone visible
- [ ] Email très long → pas de débordement, scrollable
- [ ] Thread de 10+ messages → tous visibles, ordre chronologique

---

## PHASE 5 — PROJETS

### 5.1 — Liste des projets
- [ ] Tous les projets de l'org s'affichent
- [ ] Pastille santé (vert/orange/rouge) sur chaque carte
- [ ] Compteurs : tâches, emails, plans
- [ ] Filtre par statut fonctionne (Actif, Pause, Clôture)
- [ ] Recherche par nom fonctionne
- [ ] Clic sur un projet → page détail

### 5.2 — Détail projet (10 onglets)
- [ ] **Aperçu** : KPIs du projet, budget, dates, équipe
- [ ] **Emails** : liste des emails du projet, recherche, détail panel
- [ ] **Tâches** : tâches du projet (Kanban ou liste)
- [ ] **PV** : liste des PV du projet
- [ ] **Visites** : visites avec photos
- [ ] **Plans** : plans enregistrés depuis emails ou uploadés
- [ ] **Soumissions** : soumissions liées au projet
- [ ] **Prix** : données prix
- [ ] **Planning** : Gantt (si généré)
- [ ] **Clôture** : workflow de clôture (réception, réserves, garanties)

### 5.3 — Vérifications données
- [ ] Budget affiché en CHF suisse (apostrophe milliers : 8'500'000)
- [ ] Dates au format suisse (DD.MM.YYYY)
- [ ] Aucun compteur à "0" si des données existent
- [ ] "Aucun" affiché proprement quand il n'y a pas de données (pas d'erreur)

---

## PHASE 6 — SOUMISSIONS

### 6.1 — Liste
- [ ] Les soumissions existantes s'affichent
- [ ] Badge statut : brouillon/analysé/envoyé/comparaison/attribué
- [ ] Clic → page détail

### 6.2 — Analyse IA
- [ ] Si une soumission est "brouillon" : tester le bouton "Analyser"
- [ ] L'analyse démarre (spinner visible)
- [ ] Après analyse : les postes apparaissent groupés par lot/chapitre
- [ ] Vérifier : les codes CFC sont attribués (pas tous "null")
- [ ] Vérifier : les quantités sont réalistes (pas 0, pas 999999)
- [ ] Vérifier : les unités sont normalisées (m², ml, kg, pce)
- [ ] Vérifier : les groupes de matériaux sont en français

### 6.3 — Budget IA
- [ ] Bouton "Estimer les prix" visible dans l'onglet Postes
- [ ] Clic → estimation lance
- [ ] Colonnes PU Méd., Total, Source apparaissent
- [ ] Badges source : Fournisseur (vert), CRB (teal), IA (bleu)
- [ ] Totaux par groupe cohérents
- [ ] Total général en bas

### 6.4 — Envoi demandes de prix
- [ ] Sélectionner des fournisseurs
- [ ] Prévisualiser l'email
- [ ] Le tracking code est généré

### 6.5 — Comparaison
- [ ] Si des offres reçues : l'onglet Comparaison affiche un tableau
- [ ] Les prix sont en CHF
- [ ] Le meilleur prix est mis en évidence

---

## PHASE 7 — PLANNING GANTT

### 7.1 — Génération depuis soumission
- [ ] Onglet Planning du projet → bouton "Générer depuis soumission"
- [ ] Modal de configuration : date début, type projet, canton
- [ ] Clic "Générer" → le Gantt apparaît
- [ ] **VÉRIFIER** : 15-35 tâches (pas 167 !)
- [ ] **VÉRIFIER** : durée totale réaliste (4-12 mois, pas 63 ans !)
- [ ] 6 phases SIA avec couleurs distinctes
- [ ] 2 jalons : Début + Réception provisoire
- [ ] Les barres sont visibles et proportionnelles
- [ ] Labels lisibles sur les barres larges
- [ ] Zoom auto adapté à la durée

### 7.2 — Création from scratch
- [ ] Bouton "Créer un planning vide"
- [ ] Modal : titre + date début
- [ ] Planning vide avec 2 jalons
- [ ] Toolbar visible : + Phase, + Tâche, + Jalon, Sélection, Undo, Redo

### 7.3 — Édition
- [ ] Ajouter une phase → apparaît dans la liste
- [ ] Ajouter une tâche → apparaît dans la phase
- [ ] Drag une barre horizontalement → dates changent
- [ ] Resize une barre → durée change
- [ ] Double-clic nom → édition inline
- [ ] Double-clic durée → édition inline
- [ ] Clic-droit → menu contextuel avec toutes les options
- [ ] Undo (Ctrl+Z) → annule la dernière action
- [ ] Redo (Ctrl+Y) → rétablit

### 7.4 — Fonctionnalités avancées
- [ ] Multi-sélection (Ctrl+clic) → bandeau actions groupées
- [ ] Panneau latéral (clic ✏️) → tous les champs éditables
- [ ] Dépendances : drag entre barres → flèche créée
- [ ] Chemin critique : clic badge → highlight chaîne
- [ ] Baseline : figer → barres grises sous les barres actuelles
- [ ] WBS : numérotation 1.1, 1.2, 2.1... avec CFC entre parenthèses

### 7.5 — Export
- [ ] PDF A3 paysage avec branding Cantaia
- [ ] PNG
- [ ] Lien partageable → page publique sans login avec branding

---

## PHASE 8 — FOURNISSEURS

### 8.1 — Liste
- [ ] Tous les fournisseurs s'affichent
- [ ] Score global visible (0-100)
- [ ] Spécialités en badges
- [ ] Filtres : spécialité, zone, score
- [ ] Recherche par nom

### 8.2 — Détail fournisseur
- [ ] Clic → panneau détail
- [ ] Infos complètes : nom, contact, email, téléphone, adresse
- [ ] Score avec bouton "Recalculer"
- [ ] **Timeline historique** : offres, demandes, emails (chronologique)
- [ ] **Graphique tendance prix** (si 3+ offres)
- [ ] **Alertes** : certification expirée, pas de réponse

### 8.3 — CRUD
- [ ] Créer un fournisseur → formulaire complet
- [ ] Modifier un fournisseur → sauvegarde
- [ ] Supprimer → confirmation → supprimé
- [ ] Import CSV

---

## PHASE 9 — TÂCHES

### 9.1 — Vue Kanban
- [ ] 5 colonnes : À faire, En cours, En attente, Fait, Annulé
- [ ] Drag & drop entre colonnes → statut change
- [ ] Flash vert après drop réussi
- [ ] Compteur par colonne
- [ ] Badge projet sur chaque carte

### 9.2 — Vue Liste
- [ ] Toggle Kanban ↔ Liste
- [ ] Tri par priorité, date, projet
- [ ] Filtres : projet, statut, priorité, assigné

### 9.3 — CRUD tâches
- [ ] Créer une tâche → modal avec tous les champs
- [ ] Modifier → clic sur la tâche → détail panel
- [ ] Supprimer → confirmation
- [ ] Changer priorité → visuel mis à jour (rouge=urgent, orange=haute)

---

## PHASE 10 — PLANS & ESTIMATION

### 10.1 — Registre de plans
- [ ] Liste des plans avec statut d'analyse
- [ ] Filtre par projet, discipline
- [ ] Clic → détail plan

### 10.2 — Analyse plan
- [ ] Upload un plan (PDF/image)
- [ ] Lancer l'analyse (Claude Vision)
- [ ] Résultats : cartouche, discipline, quantités
- [ ] Niveau de confiance affiché

### 10.3 — Estimation 4 passes
- [ ] Lancer l'estimation depuis le plan
- [ ] Pipeline multi-modèle (Claude + GPT-4o + Gemini)
- [ ] Résultat : tableau CFC avec fourchettes (min/médiane/max)
- [ ] Sources identifiées (CRB, IA, historique)
- [ ] **VÉRIFIER** : les prix sont réalistes pour la Suisse (pas en euros, pas en dollars)
- [ ] **VÉRIFIER** : les quantités sont cohérentes avec le plan

---

## PHASE 11 — CANTAIA PRIX

### 11.1 — 4 onglets
- [ ] **Chiffrage IA** : sélection plan → estimation
- [ ] **Import prix** : drag & drop fichiers (.msg/.eml/.pdf)
- [ ] **Analyse prix** : benchmarks, comparaisons
- [ ] **Historique** : estimations passées

---

## PHASE 12 — PV DE CHANTIER

### 12.1 — Liste PV
- [ ] PV existants avec statut
- [ ] Créer nouveau PV → formulaire avec participants
- [ ] Enregistrement audio → transcription Whisper

### 12.2 — Édition PV
- [ ] Sections éditables
- [ ] Actions avec assignation
- [ ] Export PDF

---

## PHASE 13 — VISITES CLIENT

### 13.1 — Liste visites
- [ ] Visites avec statut, badge photos
- [ ] Créer nouvelle visite

### 13.2 — Photos & Notes
- [ ] Capture photo (mobile)
- [ ] Upload photos
- [ ] Analyse notes manuscrites (Claude Vision)
- [ ] Transcription audio

### 13.3 — Rapport
- [ ] Génération rapport IA
- [ ] Export DOCX avec photos

---

## PHASE 14 — BRIEFING QUOTIDIEN

- [ ] Page /briefing accessible
- [ ] Contenu du jour affiché (ou bouton "Générer")
- [ ] Le briefing mentionne : emails urgents, tâches en retard, prochaines réunions
- [ ] Navigation entre dates (jour précédent/suivant)

---

## PHASE 15 — CHAT IA

- [ ] Page /chat accessible
- [ ] Créer une conversation
- [ ] Envoyer un message → réponse Claude en streaming
- [ ] Le contexte projet est disponible (si conversation liée à un projet)
- [ ] Historique des conversations

---

## PHASE 16 — VUE DIRECTION

- [ ] Page /direction accessible
- [ ] Grille de cards projets
- [ ] Santé auto-calculée (vert/orange/rouge)
- [ ] Barre budget avec pourcentage
- [ ] Alertes par projet
- [ ] Filtre par statut
- [ ] KPIs en haut : total projets, budget total, tâches en retard

---

## PHASE 17 — SETTINGS

### 17.1 — Profil
- [ ] Nom, prénom, email, téléphone
- [ ] Langue préférée
- [ ] Sauvegarde fonctionne

### 17.2 — Intégrations
- [ ] Statut connexion Microsoft (connecté/déconnecté)
- [ ] Bouton "Connecter" si pas connecté

### 17.3 — Abonnement
- [ ] Plan actuel affiché
- [ ] Bouton upgrade vers Stripe

---

## PHASE 18 — ADMIN

### 18.1 — Dashboard admin
- [ ] KPIs : membres, projets, emails, PV, tâches
- [ ] Valeurs réelles (pas hardcodées)

### 18.2 — Membres
- [ ] Liste des membres de l'org
- [ ] Inviter un nouveau membre
- [ ] Changer le rôle

### 18.3 — Branding
- [ ] Logo uploadable
- [ ] Couleur primaire modifiable

---

## PHASE 19 — MOBILE

- [ ] Redimensionner le navigateur en 375×812 (iPhone)
- [ ] Bottom nav bar visible (Mail, Tâches, Projets, Plus)
- [ ] FAB (+) visible en bas à droite
- [ ] Clic FAB → 3 actions (Nouvelle tâche, Photo, Note vocale)
- [ ] Navigation entre toutes les pages via "Plus"
- [ ] Gantt : mode compact (pas de task list sur mobile)
- [ ] Emails : lisibles sur petit écran
- [ ] Pas de débordement horizontal

---

## PHASE 20 — VÉRIFICATIONS TRANSVERSALES

### 20.1 — i18n
- [ ] Switcher en EN → TOUT est traduit (pas de clé brute "planning.taskList.name")
- [ ] Switcher en DE → TOUT est traduit
- [ ] Revenir en FR → cohérent

### 20.2 — Performance
- [ ] Aucune page > 3 secondes de chargement
- [ ] Pas de spinner infini
- [ ] Console : zéro erreur rouge (warnings acceptés)

### 20.3 — Données
- [ ] AUCUNE donnée "undefined", "null", "NaN", "Invalid Date"
- [ ] AUCUN montant négatif ou à zéro quand il devrait y avoir une valeur
- [ ] AUCUNE date dans le passé pour des deadlines futures
- [ ] Format CHF suisse partout (apostrophe milliers)
- [ ] Format dates suisse partout (DD.MM.YYYY)

### 20.4 — Sécurité
- [ ] Pas d'accès aux données d'autres organisations
- [ ] Pas de token visible dans l'URL
- [ ] Cookie consent banner fonctionnel

---

## PHASE 21 — SCÉNARIO DE DÉMO COMPLET

Simuler le parcours exact de la démo (30 minutes) :

1. **[2 min]** Login → Action Board → montrer les KPIs et le feed de décisions
2. **[3 min]** Mail → montrer un email classifié, répondre avec suggestion IA
3. **[3 min]** Projets → ouvrir Central Malley → montrer les onglets
4. **[5 min]** Soumissions → ouvrir une soumission analysée → montrer les postes + Budget IA
5. **[5 min]** Planning → générer un Gantt depuis la soumission → montrer les phases SIA
6. **[3 min]** Fournisseurs → montrer le scoring auto, la timeline, le graphique prix
7. **[3 min]** Plans → montrer une analyse de plan avec estimation 4 passes
8. **[2 min]** Tâches → montrer le Kanban, drag une tâche
9. **[2 min]** Direction → montrer la grille multi-projets avec santé auto
10. **[2 min]** Mobile → montrer la bottom nav, le FAB, la réactivité

**À chaque étape** : vérifier que tout charge vite, que les données sont cohérentes, que l'UI est impeccable.

---

## LIVRABLE

À la fin de ce test, produire :

1. **`CANTAIA_TEST_RESULTS.md`** — résultats détaillés de chaque phase
2. **Screenshots** de chaque page testée
3. **Liste des bugs** trouvés et corrigés
4. **Liste des améliorations** appliquées
5. **Requêtes SQL** pour les données de démo
6. **Score global** : X/100 avec justification

---

## SI TU ES BLOQUÉ

1. **Auth bloqué** → me demander de me connecter et de te fournir les cookies
2. **DB bloqué** → me fournir la requête SQL exacte et je l'exécute sur Supabase
3. **Page 404** → vérifier la route dans middleware.ts, corriger et push
4. **Erreur API** → lire les logs Vercel (me demander), ou reproduire en local
5. **Donnée manquante** → créer via API ou SQL, ne JAMAIS laisser un vide

**TU NE RENONCES JAMAIS. TU TROUVES TOUJOURS UNE SOLUTION.**
