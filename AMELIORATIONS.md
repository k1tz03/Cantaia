# Cantaia — Améliorations Validées pour Implémentation

> Validé par Julien RAY le 2026-03-18
> Spec complète : `docs/superpowers/specs/2026-03-18-cantaia-audit-optimisation-design.md`
> Approche : Quick Wins First (8 semaines, 3 phases)

---

## Phase 1 — Quick Wins (Semaine 1-2)

### [P1-CRITIQUE] SubmissionEditor DB Sync
- **Quoi** : Connecter l'éditeur de soumissions à l'API au lieu de sauvegarder uniquement en localStorage
- **Pourquoi** : Les modifications de lots/chapitres/postes sont perdues au logout
- **Comment** : `PATCH /api/submissions/[id]` à chaque auto-save (30s) + indicateur visuel sauvegarde
- **Fichiers** : `components/submissions/SubmissionEditor.tsx`, nouvelle route API
- **Effort** : M (2-3 jours)

### [P1-IMPORTANT] Kanban Drag & Drop
- **Quoi** : Permettre de déplacer les tâches entre colonnes du Kanban
- **Pourquoi** : Le Kanban est actuellement en lecture seule — basique manquant pour un outil de gestion
- **Comment** : Réutiliser dnd-kit (déjà installé pour SubmissionEditor), `onDragEnd` → `PATCH /api/tasks/[id]`
- **Fichiers** : `components/tasks/TaskKanbanView.tsx`
- **Effort** : M (2-3 jours)

### [P1-CLEANUP] Supprimer 32 pages placeholder
- **Quoi** : Supprimer les pages mortes, stubs et doublons
- **Supprimer** : `/meetings/*` (6 pages legacy), `/admin/alerts`, `/admin/logs`, `/admin/settings`, `/admin/users`, `/admin/organizations/*`, `/analytics`, `/api-costs`, `/clients`, `/debug`, `/logs`, `/admin/branding` (doublon), `/pricing-intelligence` (doublon)
- **Garder** : `/admin/time-savings`, `/admin/finances`, `/admin/members`, auth pages, legal pages
- **Effort** : S (1 jour)

### [P1-I18N] Mail page internationalisation
- **Quoi** : Passer toutes les strings FR hardcodées de `/mail/page.tsx` à `useTranslations("mail")`
- **Pourquoi** : La page mail est le point d'entrée principal, elle doit supporter EN/DE
- **Fichiers** : `mail/page.tsx`, `messages/fr.json`, `messages/en.json`, `messages/de.json` (~50 clés)
- **Effort** : S (1 jour)

---

## Phase 2 — Core UX (Semaine 3-4)

### [P2-MOBILE] Bottom Navigation Mobile + FAB
- **Quoi** : Barre de navigation fixe en bas sur mobile (< md) + bouton d'action rapide "+"
- **Pourquoi** : Actuellement 5+ taps pour accéder à une page secondaire via hamburger
- **Bottom nav** : Mail (badge), Tâches, Projets, Plus
- **FAB** : "Nouvelle tâche", "Prendre photo", "Note vocale" — contextuel au projet courant
- **Fichiers** : `components/app/Sidebar.tsx`
- **Effort** : M (2-3 jours)

### [P2-SOUMISSIONS] Prompt amélioré + Budget IA inline
- **Quoi** : Enrichir le prompt d'extraction Excel (9 → 60 lignes) + intégrer les prix dans l'onglet Postes
- **Pourquoi** : ~20% CFC codes faux, Budget IA dans onglet séparé = friction
- **Prompt** : normalisation unités, multi-langue FR/DE/IT, validation quantités, standardisation produits, 20+ material groups
- **UI** : colonnes PU/Total/Source inline dans Postes, bannière "Estimer les prix", badges source colorés
- **Fichiers** : `submissions/[id]/analyze/route.ts`, `submissions/[id]/page.tsx`
- **Effort** : M (3-4 jours)

### [P2-FOURNISSEURS] Scoring automatique + historique enrichi
- **Quoi** : Calculer le score fournisseur depuis les données réelles (délai, prix, taux réponse)
- **Pourquoi** : Score actuel basé sur notes manuelles, pas fiable
- **Formule** : délai 30% + prix 25% + taux_réponse 20% + qualité 15% + fiabilité 10%
- **Historique** : timeline chronologique (offres, demandes, emails), graphique tendance prix, alerte certifications
- **Fichiers** : `packages/core/src/suppliers/supplier-service.ts`, `suppliers/page.tsx`
- **Effort** : M (3-4 jours)

---

## Phase 3 — Big Features (Semaine 5-8)

### [P3-ACTIONBOARD] Action Board — cockpit de décision post-login
- **Quoi** : Nouveau `/action-board` qui fusionne briefing + mail + tâches en un écran unique
- **Pourquoi** : 6+ clics / 2 changements de page pour traiter un email urgent le matin
- **Layout** : Header KPIs (sticky) → Feed de décisions (scrollable, trié par priorité) → Résumé IA (collapsible)
- **Sources** : emails urgent/action, tâches overdue, deadlines soumissions < 7j, alertes plans, garanties
- **Actions inline** : Répondre/Déléguer/Archiver (email), Fait/Relancer/Reporter (tâche), Voir/Relancer (soumission)
- **Mobile** : swipe gauche = archiver, swipe droite = snooze
- **API** : `GET /api/action-board` agrège 5 sources en parallèle
- **Redirect** : post-login passe de `/mail` à `/action-board`
- **Effort** : XL (2-3 semaines)

### [P3-CFC300] Enrichissement référentiel CFC (55 → 300+ prix)
- **Quoi** : Passer de 55 à 300+ prix CFC de référence avec variantes matériaux
- **Pourquoi** : ~60% des postes tombent en fallback IA par manque de prix de référence
- **Données** : CFC 1 (10), CFC 2 (45), CFC 22 (20), CFC 23 (25), CFC 24 (20), CFC 25 (15), CFC 27 (25), CFC 3x (20), CFC 4x (15)
- **Tech** : migration vers table Supabase `cfc_reference_prices` (au lieu de fichier statique)
- **Bonus** : calibration par phase SIA (esquisse ±30%, exécution ±5%), variantes matériaux (C20/C30/C40)
- **Effort** : L (1 semaine données + 2-3 jours code)

### [P3-DIRECTION] Vue Direction multi-projet dense
- **Quoi** : Réécrire `/direction` avec des cards projet denses (budget, tâches, soumissions, PV, alertes)
- **Pourquoi** : Vue actuelle tabulaire, pas assez visuelle pour comité de pilotage
- **Layout** : grille responsive (1-4 colonnes), card par projet avec santé vert/orange/rouge
- **Chaque card** : barre budget, compteurs tâches, deadline soumission, dernier PV, alertes
- **Export** : bouton "Rapport Direction" → PDF (jspdf)
- **Effort** : M (2-3 jours)

---

## Améliorations identifiées mais hors périmètre

| Amélioration | Raison du report |
|-------------|-----------------|
| Rate limiting API (0/139 routes) | Architecture séparée (Redis/Upstash) |
| Tests automatisés E2E | Effort XL, projet séparé |
| Dark mode complet | Variables Tailwind non appliquées, effort L |
| Webhook temps réel emails | WebSocket/Pusher, architecture séparée |
| NPK norms dans prompts IA | Expertise métier supplémentaire requise |
| Recherche full-text cross-modules | Elasticsearch/Algolia, architecture séparée |
| Pondération modèles consensus (2:1.5:0.5) | Quick fix possible mais nécessite benchmarking |
| Classification email fine-grained (7 catégories) | Nécessite retravail du pipeline complet |
| Comparaison versions de plans (diff visuel) | Feature complexe, pas de lib existante |
| Export analyse plan en Word/PDF structuré | Utile mais pas critique |
