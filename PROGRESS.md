# CANTAIA — Progression

## ÉTAT ACTUEL — 2026-02-27 (Module Mail en cours)

### Résumé
- **Étapes 1-6 TERMINÉES** : monorepo, landing, auth, dashboard, UX pro, intégration Outlook+Claude
- **14 bugs corrigés** (5 + 9) : toutes les features mock sont maintenant connectées aux données réelles
- **Refonte UX/UI Dashboard** : 10 améliorations professionnelles (checkboxes, email structure, densité, lu/non-lu, dates, panneau compact, sidebar fine, hover)
- **Refonte UX/UI Projets** : 7 améliorations (vue cards/liste, health indicators, tri intelligent, quick actions, filtres compacts, état vide)
- **Refonte UX/UI Paramètres** : navigation par onglets, 6 sections (Profil, Intégrations, Affichage, Notifications, Organisation, Abonnement)
- **Bug fix global** : fond noir des inputs corrigé (color-scheme: light, bg-white explicite, dark: classes supprimées)
- **Tracking coûts API** : migration SQL + tracker + intégration dans 5 routes AI + dashboard admin + API stats
- **Étape 7 TERMINÉE** : Module PV de séance complet (12 sous-étapes)
- **White-labeling TERMINÉ** : personnalisation identité visuelle par organisation (6 sous-étapes)
- **Étape 8 TERMINÉE** : Système de tâches complet (13 sous-étapes)
- **Étape 9 TERMINÉE** : Briefing quotidien intelligent (11 sous-étapes)
- **Étape 10 TERMINÉE** : Dashboard Admin Superadmin (16 sous-étapes)
- **Étape 11 TERMINÉE** : Clôture de chantier & PV de réception (10 sous-étapes)
- **Étape 12 TERMINÉE** : Extracteur de Plans Intelligent (12 sous-étapes)
- **Étape 13 TERMINÉE** : Soumissions & Intelligence Tarifaire Cross-Chantiers (17 sous-étapes)
- **Étape 18 TERMINÉE** : Nettoyage données mock, Classification IA intelligente, Archivage local automatique (10 sous-étapes)
- **Étape 20 TERMINÉE** : Super-admin, création d'organisations, sous-domaines, branding admin-only, boutons de sauvegarde (8 sous-étapes)
- **Étape 21 TERMINÉE** : Visite Client Vocale — Enregistrement, rapport IA et création de tâche devis automatique (11 sous-étapes)
- **Étape 22 TERMINÉE** : Refonte complète Landing Page — Pro, moderne, accrocheur (6 sous-étapes)
- **Étape 23 TERMINÉE** : Multi-provider email (Microsoft, Google, IMAP) — 9 sous-étapes
- **5 bugs critiques corrigés** : user profile auto-create, middleware session refresh, email connection safety, projects connected to Supabase, auto-generated email keywords
- **Rename BUILDWISE → Cantaia** : terminé (2026-02-26), tous fichiers source, i18n, configs, packages
- **Pivot produits** : 3 produits séquentiels (Soumissions active, Mail greyed, PV greyed)
- **Bug fix PV→Tâches** : enum values corrigés (migration 006 appliquée), compteurs projets connectés aux vraies données
- **Module Mail EN COURS** : Gestion intelligente des emails de chantier (16 sous-étapes)
- **Build OK** : 53 pages, 41 API routes, 0 erreurs TypeScript
- **Dev server** : `pnpm dev` dans `apps/web` → localhost:3000

### Ce qui fonctionne avec données réelles
- Auth Supabase + Microsoft OAuth (login, register, forgot/reset password)
- Création de projets → INSERT Supabase (avec organisation + project_member)
- Sync Outlook → Microsoft Graph → stockage email_records dans Supabase
- Classification IA Claude (full body, projets avec city/client_name/keywords/senders)
- Propositions de réponse IA (prompt contextuel, toujours génère sauf noreply/auto)
- Reclassification manuelle → UPDATE Supabase + apprentissage sender
- Marquer traité/urgent → UPDATE classification dans Supabase
- Images inline dans les emails (CID → base64 server-side)
- Panneau latéral redimensionnable (drag, min 350px, max 70%, persisté localStorage)
- Résumé IA actionnable visible dans liste emails + panneau détail
- Diagnostics Supabase dans Paramètres

### Ce qui reste mock / placeholder
- Tâches : système complet (vue liste/kanban, modale création/édition, panneau détail, bulk actions, filtres, depuis emails/PV, dashboard, projet) — données mock, prêt pour Supabase
- Séances & PV : pages et API routes implémentées (mock save, prêt pour Supabase), Whisper + Claude mock mode
- Briefing IA quotidien : système complet (collector, AI generator, fallback, page, compact panel, historique, préférences) — données mock, prêt pour Supabase
- Sélection multiple + actions bulk : UI présente mais appels API non connectés
- Mode mono-projet (lots CFC) : données mock
- Vue Direction : données mock
- Desktop (Tauri) : placeholder
- Outlook add-in (Office.js) : placeholder
- Stripe : placeholder
- Auto-sync (toutes les 5 min) : placeholder

### Pour reprendre demain
1. Tester l'app sur localhost:3000 avec des vrais emails Outlook
2. Vérifier que la classification IA assigne correctement les projets
3. Vérifier que les réponses IA sont pertinentes
4. Prochaine étape logique : **Étape 7** (à définir — suggestions : tâches réelles, briefing IA réel, auto-sync, ou PV séances)

---

## Étape 1 : Monorepo setup — TERMINÉ (2026-02-16)
- pnpm workspaces + Turborepo
- Packages : @cantaia/ui, @cantaia/core, @cantaia/database, @cantaia/config
- Next.js 15 (App Router), Tailwind CSS 3, shadcn/ui

## Étape 2 : Landing page + Auth — TERMINÉ (2026-02-16)
- Landing page complète (hero, problème, solution, pricing, témoignages, FAQ, CTA)
- Auth : login, register, forgot/reset password, Microsoft OAuth
- Middleware next-intl + Supabase auth
- i18n FR/EN/DE

## Étape 3 : Modèle de données Projets + Dashboard — TERMINÉ (2026-02-16)
- Types DB dans @cantaia/database (Project, Task, Meeting, EmailRecord, etc.)
- Zod schemas dans @cantaia/core
- Pages : dashboard, projets (liste + détail + settings + création), tâches, séances, paramètres
- Mock data réaliste (5 projets, tâches, réunions)
- Sidebar navigation avec route groups (app) / (marketing)

## Étape 4 : Refonte UX/UI pro — TERMINÉ (2026-02-16)
- [x] 4.1 — Mock data : 18 emails réalistes, budgets PME (4.2M-14.2M CHF), helper pluralize()
- [x] 4.2 — Light mode pro : rounded-md max, bg-white/bg-slate-50, pas de dark:, shadow-sm minimal
- [x] 4.3 — Navigation simplifiée : Boîte de réception (Inbox), Séances & PV, suppression Briefing
- [x] 4.4 — Dashboard refonte inbox : barre résumé, liste emails 70%, panneau contextuel 30%
- [x] 4.5 — Page /projects style pro (couleurs atténuées, pluriel)
- [x] 4.6 — Archivage Outlook (dossier par projet, toggle settings global, stubs API archive+folders)
- [x] 4.7 — Traductions i18n FR/EN/DE complètes (toutes clés inbox, outlook, openTask)
- [x] 4.8 — Build test final OK (15 pages, 12 API routes, 0 erreurs)

## Étape 5 : Améliorations UX dashboard + nouvelles features — TERMINÉ (2026-02-16)
- [x] 5.1 — Panneau détail email : 5 sections (en-tête complet, résumé IA détaillé, tâches détectées avec bouton créer, proposition réponse IA éditable avec envoi/copier/régénérer, actions rapides)
- [x] 5.2 — Indicateur lu/non-lu : non-lu bold+bg teinté+point bleu, auto-mark-read on click, badge sidebar dynamique (8 non-lus / 10 lus)
- [x] 5.3 — Filtre par projet : dropdown "Par chantier" avec pastilles couleur, combinable avec filtres classification
- [x] 5.4 — Sélection multiple : checkboxes, select all, barre d'actions (archiver, reclasser, marquer lu, marquer traité)
- [x] 5.5 — Briefing IA : remplace "Vue d'ensemble" par mini-briefing du jour avec 4 alertes mock contextualles
- [x] 5.6 — Mode mono/multi-projets : 7 lots CFC mock pour Central Malley, switch dans Paramètres, i18n nav "Lots/Corps de métier"
- [x] 5.7 — Vue Direction : rôle 'director', page /direction avec tableau projets, 3 mock users, lien sidebar, i18n FR/EN/DE
- [x] 5.8 — Corrections mineures : suppression dark:text-white résiduel, i18n rôles direction (roleProjectManager/roleSiteManager), nettoyage imports inutilisés direction, budgets CHF vérifiés (4.2M-14.2M OK)

## Étape 5b : Corrections visuelles mineures — TERMINÉ (2026-02-16)
- [x] 5b.1 — Scrollbar light mode : CSS custom dans globals.css (webkit + Firefox), 6px, slate-300/slate-400, track transparent
- [x] 5b.2 — Purge complète dark mode : suppression de TOUTES les classes dark: dans 26 fichiers + bloc .dark{} dans globals.css (0 occurrences restantes)
- [x] 5b.3 — Config Microsoft Azure AD : variables MICROSOFT_CLIENT_ID, CLIENT_SECRET, TENANT_ID, REDIRECT_URI ajoutées dans .env.local
- [x] 5b.4 — Turbopack activé : `next dev --turbopack` dans package.json (compilation ~3-5x plus rapide en dev)
- [x] 5b.5 — Correction URL app : NEXT_PUBLIC_APP_URL corrigé de localhost:3002 à localhost:3000

### Notes techniques étape 5b :
- Build test OK : 15 pages, 13 API routes, 0 erreurs
- Scrollbar : webkit (Chrome/Edge) + scrollbar-width/scrollbar-color (Firefox)
- 26 fichiers nettoyés du dark mode (auth, landing, settings, admin, marketing, app)

## Étape 6 : Intégration réelle Microsoft Outlook + Classement IA Claude — TERMINÉ (2026-02-16)
- [x] 6.1 — Auth réelle Supabase : scopes OAuth étendus (Mail.ReadWrite, Mail.Send, offline_access), tokens Microsoft stockés dans users table via callback, getValidMicrosoftToken() avec refresh auto
- [x] 6.2 — Service sync emails Microsoft Graph : graph-client.ts (getEmails, moveEmail, createFolder, listFolders, sendReply, withRetry), email-sync.ts (syncUserEmails avec DI), gestion 401/429
- [x] 6.3 — Classement IA Claude : email-classifier.ts (classifyEmail via SDK Anthropic + Zod validation), task-extractor.ts (extractTasks), reply-generator.ts (generateReply, ton construction suisse)
- [x] 6.4 — Pipeline traitement : POST /api/outlook/sync (sync → classify → create tasks), webhook stub, logging app_logs
- [x] 6.5 — API routes : POST classify-email, extract-tasks, generate-reply, send-reply, move-email, GET folders (17 routes total)
- [x] 6.6 — Frontend connecté : hooks useEmails/useProjects/useTasks/useUserProfile, dashboard Supabase + mock fallback, bouton Synchroniser, EmailDetailPanel avec vrais appels API (generate-reply, send-reply, move-email)
- [x] 6.7 — Paramètres Outlook : bouton Connecter (OAuth Microsoft), statut connecté/déconnecté, date dernière sync, bouton Synchroniser, placeholder auto-sync
- [x] 6.8 — Gestion erreurs : logToDb() utility, i18n sync/reply keys FR/EN/DE, API routes avec gestion 401/429/503, fallback gracieux mock data si pas de connexion Outlook

### Notes techniques étape 6 :
- Build final OK : 19 pages, 17 API routes, 0 erreurs
- @anthropic-ai/sdk ^0.74.0 ajouté au workspace root
- Microsoft Graph : appels REST directs (pas de SDK lourd), erreurs 401/429 typées
- AI classifier : dynamic import() du SDK Anthropic pour éviter bundling côté client
- Supabase data hooks : useEmails/useProjects/useTasks/useUserProfile avec mock fallback
- Token manager : refresh Microsoft tokens automatique (5 min buffer), nettoyage tokens invalides
- Pipeline sync : syncUserEmails() avec dependency injection, découplé de Supabase

### Fichiers clés créés/modifiés à l'étape 6 :
- `apps/web/src/lib/microsoft/tokens.ts` — NOUVEAU : getValidMicrosoftToken() + refresh
- `apps/web/src/lib/hooks/use-supabase-data.ts` — NOUVEAU : hooks React pour données Supabase
- `apps/web/src/lib/logger.ts` — NOUVEAU : logToDb() pour app_logs
- `packages/core/src/outlook/graph-client.ts` — RÉÉCRIT : getEmails, moveEmail, createFolder, listFolders, sendReply, withRetry
- `packages/core/src/outlook/email-sync.ts` — NOUVEAU : syncUserEmails avec DI
- `packages/core/src/ai/email-classifier.ts` — NOUVEAU : classifyEmail via Claude API
- `packages/core/src/ai/task-extractor.ts` — NOUVEAU : extractTasks via Claude API
- `packages/core/src/ai/reply-generator.ts` — NOUVEAU : generateReply via Claude API
- `apps/web/src/app/api/outlook/sync/route.ts` — Pipeline complet (sync → classify → create tasks)
- `apps/web/src/app/api/outlook/webhook/route.ts` — NOUVEAU : stub webhook
- `apps/web/src/app/api/outlook/send-reply/route.ts` — NOUVEAU
- `apps/web/src/app/api/outlook/move-email/route.ts` — NOUVEAU
- `apps/web/src/app/api/outlook/folders/route.ts` — RÉÉCRIT (listFolders réel)
- `apps/web/src/app/api/ai/classify-email/route.ts` — RÉÉCRIT (Claude API)
- `apps/web/src/app/api/ai/extract-tasks/route.ts` — RÉÉCRIT (Claude API)
- `apps/web/src/app/api/ai/generate-reply/route.ts` — NOUVEAU
- `apps/web/src/app/api/auth/callback/route.ts` — Stockage tokens Microsoft
- `apps/web/src/app/[locale]/(auth)/actions.ts` — Scopes OAuth étendus
- `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` — Hooks Supabase, bouton Sync, mock fallback
- `apps/web/src/app/[locale]/(app)/settings/page.tsx` — Outlook connecté/déconnecté, sync manuelle
- `apps/web/src/components/app/EmailDetailPanel.tsx` — Vrais appels API (reply, send, archive)
- `apps/web/messages/fr.json` / `en.json` / `de.json` — Clés sync, reply, Outlook

## Correctifs & Améliorations UI (2026-02-16)

### Fix OAuth callback — préfixe i18n sur /api
- Middleware : `/api/*` exclu du intlMiddleware (évite redirect `/fr/api/auth/callback`)
- Callback route : redirects dynamiques avec locale variable au lieu de `/fr/` hardcodé
- Détection langue préférée utilisateur depuis le profil DB pour les redirects post-auth

### Panneau droit du dashboard rétractable
- [x] Bouton toggle chevron sur le bord gauche du panneau (rond, shadow, hover)
- [x] Animation slide avec `transition-all duration-300` (largeur 30% ↔ 0)
- [x] Quand fermé : boîte de réception occupe 100% de la largeur, bouton flèche (ChevronLeft) collé au bord droit
- [x] État ouvert/fermé persisté dans `localStorage` (clé `cantaia_side_panel_open`)
- [x] Mobile : panneau masqué par défaut, bouton ChevronLeft pour ouvrir en overlay plein écran avec backdrop
- [x] i18n : clés `openPanel` / `closePanel` en FR/EN/DE
- [x] Build OK : 19 pages, 18 API routes, 0 erreurs

### Amélioration 1 — Réponse IA intelligente pour emails transférés
- [x] Détection automatique des transferts (FW:/TR:/Fwd:/WG:) par sujet + body markers
- [x] Analyse du texte ajouté par l'expéditeur vs contenu transféré brut
- [x] Si transfert AVEC commentaire : réponse au commentaire, pas au contenu transféré
- [x] Si transfert SANS commentaire : analyse du contenu original, réponse contextuelle
- [x] Si purement informatif : affichage "Email informatif — aucune réponse nécessaire" + bouton "Rédiger quand même"
- [x] Si contexte insuffisant : champ vide avec placeholder au lieu d'une réponse générique
- [x] Prompt IA enrichi avec règles transfert + marqueurs __NO_REPLY_NEEDED__ / __INSUFFICIENT_CONTEXT__
- [x] ReplyResult étendu avec `no_reply_needed: boolean`
- [x] EmailDetailPanel : gestion des 3 états (reply, noReply + forceReply, insufficientContext)
- [x] i18n FR/EN/DE : noReplyNeeded, composeAnyway, insufficientContext

### Amélioration 2 — Visualisation des pièces jointes
- [x] 2a — Graph client : `getAttachments(accessToken, messageId)` + `getAttachment(accessToken, messageId, attachmentId)`
- [x] 2b — API routes : GET `/api/outlook/attachments?messageId=` (liste) + GET `/api/outlook/attachments/download?messageId=&attachmentId=` (téléchargement binaire)
- [x] 2c — Section "Pièces jointes" dans EmailDetailPanel entre résumé IA et tâches détectées
  - Fetch auto si `has_attachments` + `outlook_message_id`
  - Clic PDF/Image → nouvel onglet, Word/Excel/Autre → téléchargement
  - Bouton "Tout télécharger" si plusieurs pièces jointes
- [x] 2d — Icônes par type : PDF (rouge FileText), Word (bleu FileText), Excel (vert FileSpreadsheet), Image (violet ImageIcon), Autre (gris Paperclip)
- [x] i18n FR/EN/DE : attachments, loadingAttachments, downloadAll, noAttachmentsFound
- [x] Build OK : 21 pages, 20 API routes, 0 erreurs

## Correctifs critiques — 5 bugs (2026-02-16)

### Bug 1 — Badge sidebar dynamique
- [x] Création `email-context.tsx` (EmailProvider, useEmailContext) pour état partagé emails
- [x] Wrapper `AppEmailProvider.tsx` (client component) injecté dans le layout (app)
- [x] Sidebar utilise `useEmailContext().unreadCount` au lieu de mock `getDashboardStats()`
- [x] Badge se met à jour en temps réel quand un email est lu

### Bug 2 — Compteurs de filtres dynamiques + filtre "Non classés"
- [x] Dashboard utilise `useEmailContext()` au lieu de `useEmails()` local
- [x] Compteurs calculés dynamiquement depuis la liste d'emails
- [x] Filtre "Non classés" ajouté (emails sans project_id ou classification)
- [x] i18n `filterUnclassified` FR/EN/DE

### Bug 3 — Pipeline de classification IA
- [x] Sync route : suppression condition `syncResult.emailsSynced > 0` (classifie aussi les emails existants non traités)
- [x] Logs détaillés par email dans la console serveur
- [x] Prompt classification amélioré (poids sujet/contenu, gestion transferts FW:/TR:)
- [x] Route POST `/api/ai/reclassify-all` pour reclassification en masse
- [x] Bouton "Reclassifier tout" dans le dashboard (style orange, Sparkles icon)
- [x] i18n `reclassifyAll` FR/EN/DE

### Bug 4 — Propositions de réponse IA cohérentes
- [x] Prompt réécrit avec analyse contextuelle en 5 étapes (expéditeur, contexte, type RE/FW/nouveau, attentes, nécessité)
- [x] Fetch du body complet via Microsoft Graph dans `generate-reply/route.ts`
- [x] Détection transferts (FW:/TR:/Fwd:/WG:) avec distinction commentaire vs brut
- [x] Marqueurs `__NO_REPLY_NEEDED__` / `__INSUFFICIENT_CONTEXT__`
- [x] EmailDetailPanel : gestion des 3 états (réponse, noReply + forceReply, contexte insuffisant)

### Bug 5 — Affichage du contenu email dans le panneau
- [x] Route GET `/api/outlook/email-body?messageId=` (fetch body HTML/text depuis Graph)
- [x] DOMPurify installé pour sanitisation HTML sécurisée
- [x] Section "Contenu de l'email" entre en-tête et résumé IA
- [x] HTML rendu avec `dangerouslySetInnerHTML` + DOMPurify.sanitize (tags/attr whitelist)
- [x] Texte plain : `<pre>` avec `whitespace-pre-wrap`
- [x] Max-height 300px quand replié, gradient fade-out, bouton "Voir plus/Voir moins"
- [x] Fallback sur `body_preview` si pas d'outlook_message_id
- [x] Résumé IA désormais rétractable (fermé par défaut, toggle chevron)
- [x] i18n : `emailContent`, `loadingBody`, `showMore`, `showLess` FR/EN/DE

### Build final
- [x] Build OK : 21 pages, 21 API routes, 0 erreurs

### Fichiers clés créés/modifiés :
- `apps/web/src/lib/contexts/email-context.tsx` — NOUVEAU : état partagé emails (EmailProvider)
- `apps/web/src/components/providers/AppEmailProvider.tsx` — NOUVEAU : wrapper client
- `apps/web/src/app/[locale]/(app)/layout.tsx` — Ajout AppEmailProvider
- `apps/web/src/components/app/Sidebar.tsx` — useEmailContext().unreadCount
- `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` — useEmailContext(), filtre unclassified, bouton reclassifier
- `apps/web/src/components/app/EmailDetailPanel.tsx` — Email body (DOMPurify), résumé rétractable, 3 états reply
- `apps/web/src/app/api/ai/reclassify-all/route.ts` — NOUVEAU : reclassification en masse
- `apps/web/src/app/api/outlook/email-body/route.ts` — NOUVEAU : fetch email body
- `apps/web/src/app/api/ai/generate-reply/route.ts` — Fetch full body Graph, no_reply_needed
- `apps/web/src/app/api/outlook/sync/route.ts` — Classifie tous les non-traités
- `packages/core/src/ai/reply-generator.ts` — Prompt contextuel, detectForward(), body_full
- `packages/core/src/ai/prompts.ts` — Prompt classification amélioré
- `apps/web/messages/fr.json` / `en.json` / `de.json` — 6 nouvelles clés i18n

## Correctifs critiques — 9 bugs données réelles (2026-02-16)

### Bug 9 — Diagnostic Supabase
- [x] Route GET `/api/debug/supabase-test` : vérifie connexion admin, user auth, user row, organisation, projets, emails, RLS, token Microsoft, clé Anthropic
- [x] Section "Diagnostics" dans la page Paramètres avec bouton + affichage résultats colorisés (vert/rouge)

### Bug 1 — Création de projets ne sauvegarde pas dans Supabase
- [x] Route POST `/api/projects/create` : auth + organisation_id + INSERT projet + INSERT project_member (owner)
- [x] Page `projects/new` : appel API réel avec loading state, erreur affichée, redirect après succès

### Bug 2 — Classification IA ne fonctionne pas (projets vides, body_preview insuffisant)
- [x] Prompt classification réécrit : body_content (full body), résumé actionnable "[Qui] [fait quoi] → [action]"
- [x] `EmailForClassification` étendu avec `body_full?`, `ProjectForClassification` avec `city?`/`client_name?`
- [x] Projects query inclut `city, client_name` pour meilleur matching
- [x] Sync route : fetch full body via Microsoft Graph avant classification, stripHtml(), logs détaillés
- [x] Reclassify-all route : même pattern (full body + city/client_name)
- [x] Default summary changé en "—" au lieu de texte vague

### Bug 3 — Propositions de réponse IA toujours NO_REPLY_NEEDED
- [x] Prompt reply réécrit : TOUJOURS générer une réponse sauf emails automatiques/noreply/CC
- [x] Exemples contextuels (documents, info, demande, offre, signalement)
- [x] Logging détaillé dans `generateReply()` et `generate-reply/route.ts`

### Bug 4 — Reclassification manuelle ne fait rien
- [x] Route POST `/api/emails/update` : update project_id, classification, + apprentissage (sender → project email_senders)
- [x] `handleReclassify(projectId)` dans EmailDetailPanel → appel API + refetch emails
- [x] Prop `onEmailUpdated` propagée depuis dashboard → EmailDetailPanel

### Bug 5 — Marquer traité / urgent ne font rien
- [x] `handleMarkProcessed()` → POST `/api/emails/update` avec `classification: "archived"`
- [x] `handleMarkUrgent()` → POST `/api/emails/update` avec `classification: "urgent"`
- [x] Loading states + spinners sur les boutons

### Bug 6 — Images inline cassées (cid: non résolus)
- [x] `getInlineAttachments()` dans graph-client.ts : fetch attachments avec `isInline + contentBytes`
- [x] Route email-body : détecte `cid:` dans le HTML, fetch inline attachments, remplace par `data:image/*;base64,...`
- [x] DOMPurify : `ALLOWED_URI_REGEXP` étendu pour accepter `data:` URIs

### Bug 7 — Panneau latéral redimensionnable
- [x] Drag handle sur le bord gauche du panneau (cursor col-resize, hover bg-brand/10)
- [x] Drag events (mousedown/mousemove/mouseup) avec calcul % en temps réel
- [x] Min 350px, max 70%, default 45%
- [x] Largeur persistée dans localStorage (`cantaia_panel_width`)

### Bug 8 — Résumé IA actionnable toujours visible
- [x] Résumé IA désormais non rétractable — toujours affiché dans le panneau détail (style bleu clair)
- [x] Résumé filtré : masqué si valeur "—"
- [x] Résumé affiché dans la liste d'emails avec icône Sparkles (texte bleu, 1 ligne tronquée)

### Build final
- [x] Build OK : 26 pages, 23 API routes, 0 erreurs

### Fichiers clés créés/modifiés :
- `apps/web/src/app/api/debug/supabase-test/route.ts` — NOUVEAU : diagnostic Supabase
- `apps/web/src/app/api/projects/create/route.ts` — NOUVEAU : création projet + member
- `apps/web/src/app/api/emails/update/route.ts` — NOUVEAU : update email (reclassify/mark)
- `apps/web/src/app/api/outlook/sync/route.ts` — Full body fetch + stripHtml + logs
- `apps/web/src/app/api/ai/reclassify-all/route.ts` — Full body fetch + city/client_name
- `apps/web/src/app/api/ai/generate-reply/route.ts` — Logging détaillé
- `apps/web/src/app/api/outlook/email-body/route.ts` — Inline images CID → base64
- `packages/core/src/ai/prompts.ts` — Prompt classification réécrit (body_content, résumé actionnable)
- `packages/core/src/ai/email-classifier.ts` — body_full, city, client_name, logs
- `packages/core/src/ai/reply-generator.ts` — Prompt reply réécrit, logging
- `packages/core/src/outlook/graph-client.ts` — getInlineAttachments()
- `apps/web/src/components/app/EmailDetailPanel.tsx` — Handlers reclassify/mark/urgent, summary visible, data: URIs
- `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` — Resizable panel, summary in list, onEmailUpdated
- `apps/web/src/app/[locale]/(app)/settings/page.tsx` — Section diagnostics
- `apps/web/src/app/[locale]/(app)/projects/new/page.tsx` — Appel API réel

## Refonte UX/UI Dashboard — 10 améliorations professionnelles (2026-02-17) — TERMINÉ

### Amélioration 1 — Checkboxes professionnelles
- [x] Remplacement des input checkbox natifs par des divs stylisés custom
- [x] Non sélectionné : bordure gray-300, fond blanc, rounded-sm
- [x] Hover : bordure blue-400
- [x] Sélectionné : fond blue-600, coche blanche (icône Check Lucide, strokeWidth 3)
- [x] Taille : 16x16px (h-4 w-4)
- [x] Même style pour la checkbox "sélectionner tout" en haut de liste

### Amélioration 2 — Structure email simplifiée
- [x] Nouvelle structure par ligne : [checkbox] [contenu 3 lignes]
- [x] Ligne 1 : point non-lu + expéditeur + date (alignée à droite)
- [x] Ligne 2 : objet (gras si non lu) + icône PJ + tag projet
- [x] Ligne 3 : résumé IA en gris discret
- [x] Suppression icône classification séparée (cercle orange/bleu)
- [x] Remplacement par bordure gauche colorée (border-l-[3px]) :
  - Urgent → border-l-red-500
  - Action requise → border-l-amber-500
  - En attente → border-l-blue-400
  - Info → border-l-transparent
- [x] Point non-lu : seul indicateur à gauche (h-1.5 w-1.5 bg-blue-600)

### Amélioration 3 — Liste densifiée
- [x] Padding réduit : py-2.5 (au lieu de py-3), gap-2.5
- [x] Line-height serré sur résumé IA (leading-tight)
- [x] Séparateurs fins entre emails (divide-y divide-gray-100)
- [x] Objectif 8-10 emails visibles atteint

### Amélioration 4 — Hiérarchie lu/non-lu renforcée
- [x] Non lu : bg-blue-50/50, expéditeur font-semibold text-gray-900, objet font-semibold text-gray-800
- [x] Lu : bg-white, expéditeur font-normal text-gray-600, objet font-normal text-gray-700
- [x] Différence visible en un coup d'œil (style Gmail/Outlook)

### Amélioration 5 — Bouton "Reclassifier tout" discret
- [x] Style : border border-gray-300, text-gray-500, text-[11px], petit
- [x] Bouton "Synchroniser" = primaire bleu plein (bg-brand text-white)
- [x] Ordre : [Synchroniser (bleu)] [Reclassifier tout (outline gris petit)]

### Amélioration 6 — Format de date professionnel (style Outlook suisse)
- [x] Aujourd'hui : affiche l'heure "14:30"
- [x] Hier : "Hier"
- [x] Cette semaine : jour "Lundi", "Mardi", etc.
- [x] Plus ancien (même année) : "12.02" (format JJ.MM)
- [x] Plus d'un an : "12.02.2025" (format JJ.MM.AAAA)

### Amélioration 7 — Panneau droit compact et réordonné
- [x] Ordre inversé : BRIEFING IA en premier (le plus utile le matin), puis TÂCHES EN RETARD, puis SÉANCES
- [x] Tâches en retard : si aucune → "✓ Aucune tâche en retard" (une ligne verte, pas de zone vide)
- [x] Séances : max 2, format compact une ligne ("Séance #9 · Cèdres · 18.02")
- [x] Paddings réduits (p-4 au lieu de p-5, py-2 au lieu de p-3)
- [x] Même structure sur le panneau mobile

### Amélioration 8 — Sidebar plus fine
- [x] Largeur réduite : 200px (au lieu de 260px)
- [x] Plan Trial : compact sur une ligne (Sparkles + "Plan Trial" + "12j restants" aligné à droite)
- [x] Utilisateur : avatar 28px (h-7 w-7), nom en text-xs, email masqué

### Amélioration 9 — Barre de stats améliorée
- [x] Séparateurs visuels (·) entre chaque élément
- [x] "X emails" en texte normal
- [x] "X actions" en text-amber-600 font-medium (attire l'attention)
- [x] "X urgents" en text-red-600 font-medium (alerte)

### Amélioration 10 — Hover et interactions
- [x] Hover email : bg-gray-50 avec transition-colors duration-150
- [x] Email sélectionné : bg-blue-50 + border-l-blue-600
- [x] Transition douce sur panneau (transition-all duration-200)
- [x] Emails non sélectionnés : hover:bg-gray-50

### Build final
- [x] Build OK : 26 pages, 23 API routes, 0 erreurs TypeScript

### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` — Refonte complète email rows, checkboxes custom, stats bar, panneau droit réordonné, hover states
- `apps/web/src/components/app/Sidebar.tsx` — Largeur 200px, plan trial compact, avatar 28px
- `apps/web/src/lib/mock-data.ts` — getRelativeTime() réécrit (format Outlook suisse : 14:30, Hier, Lundi, 12.02)

## Refonte UX/UI Projets — 7 améliorations professionnelles (2026-02-17) — TERMINÉ

### Amélioration 1 — Deux modes d'affichage : Cards et Liste
- [x] Toggle LayoutGrid / List en haut à droite (à côté de "+ Nouveau projet")
- [x] Vue Cards : grille responsive (1-4 colonnes selon écran)
- [x] Vue Liste : tableau compact avec 10 colonnes (couleur, projet, code, client, ville, statut, emails, tâches, en retard, prochaine séance)
- [x] Colonnes triables (clic en-tête → tri asc/desc avec icône flèche)
- [x] Choix persisté dans localStorage (`cantaia_projects_view`)

### Amélioration 2 — Refonte des cards projet
- [x] Nouvelle structure compacte : pastille couleur + nom + code, client · ville + badge statut, stats (emails, tâches, en retard), prochaine séance
- [x] Suppression barre colorée en haut → pastille 8px à gauche du nom
- [x] Suppression dates début/fin et budget (données Phase 2)
- [x] AJOUT nombre d'emails pour ce projet
- [x] AJOUT nombre de tâches en retard (rouge si > 0)
- [x] AJOUT prochaine séance avec date formatée (JJ.MM HHhMM)
- [x] Cards ~30% plus petites (p-4 au lieu de p-5, textes compacts)
- [x] Hover : shadow-md + bg-gray-50 avec transition duration-150
- [x] Grid 2xl:grid-cols-4 pour voir 6-8 cards sans scroller

### Amélioration 3 — Indicateurs de santé du projet
- [x] Pastille de santé en haut à droite de chaque card + dans colonne tableau
- [x] Vert (bg-green-500) : 0 tâches en retard, pas d'emails urgents non traités
- [x] Orange (bg-amber-500) : 1-2 tâches en retard OU 5+ emails non traités
- [x] Rouge (bg-red-500) : 3+ tâches en retard OU emails urgents non traités
- [x] Scan visuel immédiat pour identifier les projets problématiques

### Amélioration 4 — Filtres compacts
- [x] Dropdown "Statut: Tous ▼" remplace les 6 boutons de filtre
- [x] Filtre rapide santé : bouton pill "Attention requise" avec compteur
- [x] Active : highlight amber quand filtré, brand quand statut actif
- [x] Dropdowns se ferment mutuellement

### Amélioration 5 — Tri intelligent
- [x] Tri par défaut : Urgence (tâches en retard × 10 + emails)
- [x] Dropdown "Trier par: Urgence ▼" avec 4 options : Urgence, Nom A-Z, Date de création, Dernière activité
- [x] En vue liste : tri par colonne remplace le tri global (clic en-tête)
- [x] Projets problématiques toujours visibles en premier

### Amélioration 6 — Quick actions au hover
- [x] Overlay bas de card au hover (opacity 0 → 1, pointer-events)
- [x] 3 boutons : "Voir les emails" (→ dashboard), "Nouvelle tâche" (→ projet), "Nouvelle séance" (→ projet)
- [x] preventDefault + stopPropagation pour ne pas déclencher le lien card

### Amélioration 7 — État vide amélioré
- [x] Grande icône FolderKanban centrée dans un cercle bg-gray-100
- [x] Titre : "Créez votre premier chantier"
- [x] Description : "CANTAIA classera automatiquement vos emails par chantier"
- [x] Bouton CTA bleu : "+ Créer mon premier projet"
- [x] i18n FR/EN/DE : emptyTitle, emptyDescription, emptyButton

### Build final
- [x] Build OK : 26 pages, 23 API routes, 0 erreurs TypeScript

### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/projects/page.tsx` — Refonte complète : 2 vues (cards/liste), health indicators, tri intelligent, quick actions, filtres compacts, état vide
- `apps/web/src/lib/mock-data.ts` — Ajout getOverdueTaskCountByProject(), getNextMeetingForProject()
- `apps/web/messages/fr.json` / `en.json` / `de.json` — 25 nouvelles clés i18n (vue, tri, colonnes, état vide, actions)

## Feature : Tracking des coûts API par utilisateur — TERMINÉ (2026-02-17)

### Étape 1 — Table api_usage_logs + migration SQL
- [x] Migration `004_api_usage_logs.sql` : table avec user_id, org_id, action_type, api_provider, model, tokens, audio_seconds, estimated_cost_chf, metadata
- [x] Index sur (user_id, created_at), (organization_id, created_at), (action_type, created_at)
- [x] RLS : admin/superadmin SELECT, service role INSERT
- [x] Types TypeScript : `ApiUsageLog`, `ApiUsageLogInsert`, `ApiActionType`, `ApiProvider` dans `packages/database/types.ts`
- [x] Table ajoutée au `Database` schema

### Étape 2 — Utility trackApiUsage()
- [x] `packages/core/src/tracking/api-cost-tracker.ts` : calcul de coût CHF (Anthropic tokens + OpenAI Whisper minutes, USD→CHF 0.89)
- [x] Pricing : Sonnet 3.5 ($0.003/1k input, $0.015/1k output), Whisper ($0.006/min)
- [x] Fire-and-forget : try/catch complet, jamais de throw, console.error silencieux
- [x] `ApiUsageCallback` type exporté pour les AI services
- [x] Export via `@cantaia/core/tracking`

### Étape 3 — Intégration dans les services AI
- [x] `classifyEmail()` : param optionnel `onUsage?: ApiUsageCallback`, appelé après response.usage
- [x] `generateReply()` : même pattern
- [x] `extractTasks()` : même pattern
- [x] 5 routes API intégrées :
  - `/api/ai/classify-email` → actionType `email_classify`
  - `/api/ai/generate-reply` → actionType `email_reply`
  - `/api/ai/extract-tasks` → actionType `task_extract`
  - `/api/outlook/sync` → actionType `email_classify` (boucle sur emails)
  - `/api/ai/reclassify-all` → actionType `reclassify` (boucle sur emails)

### Étape 4 — API route GET /api/admin/usage-stats
- [x] Vérification rôle admin/superadmin
- [x] Param `period` : 7d, 30d (défaut), 90d
- [x] Réponse JSON : overview (total_cost_chf, total_calls, tokens, avg_cost, projected_monthly), per_user, per_action, daily_trend, alerts
- [x] Alertes automatiques : coût mensuel projeté > 20 CHF (warning) / > 50 CHF (danger), user > 50% des coûts

### Étape 5 — Page admin dashboard /api-costs
- [x] 4 cartes overview : coût total, appels API, tokens entrée, tokens sortie
- [x] Graphique évolution des coûts (AreaChart recharts, gradient bleu)
- [x] Camembert coûts par action (PieChart recharts, 7 couleurs)
- [x] Tableau coûts par utilisateur (nom, email, appels, tokens, coût, % du total avec barre de progression)
- [x] Tableau détail par type d'action (appels, coût total, coût moyen)
- [x] Sélecteur de période (7j / 30j / 90j) + bouton actualiser
- [x] Alertes en haut de page (warning amber, danger red)
- [x] Labels d'actions en français (Classification, Réponse IA, etc.)

### Étape 6 — Mock data SQL
- [x] Script `packages/database/seeds/api-usage-mock.sql` : 3 users × 30 jours × 3-10 appels/jour
- [x] 5 types d'actions aléatoires, tokens réalistes (200-2000 in, 100-1000 out)
- [x] Coûts calculés avec le même modèle de pricing

### Build final
- [x] Build OK : 27 pages, 24 API routes, 0 erreurs TypeScript

### Fichiers créés :
- `packages/database/migrations/004_api_usage_logs.sql` — Migration table
- `packages/core/src/tracking/api-cost-tracker.ts` — Utility trackApiUsage + pricing
- `packages/core/src/tracking/index.ts` — Export module
- `apps/web/src/app/api/admin/usage-stats/route.ts` — API admin stats
- `apps/web/src/app/[locale]/(admin)/api-costs/page.tsx` — Dashboard admin avec recharts
- `packages/database/seeds/api-usage-mock.sql` — Données mock 30 jours

### Fichiers modifiés :
- `packages/database/types.ts` — ApiActionType, ApiProvider, ApiUsageLog, ApiUsageLogInsert, Database schema
- `packages/core/package.json` — Export `./tracking`
- `packages/core/src/ai/email-classifier.ts` — Param onUsage + import ApiUsageCallback
- `packages/core/src/ai/reply-generator.ts` — Param onUsage + import ApiUsageCallback
- `packages/core/src/ai/task-extractor.ts` — Param onUsage + import ApiUsageCallback
- `apps/web/src/app/api/ai/classify-email/route.ts` — trackApiUsage intégré
- `apps/web/src/app/api/ai/generate-reply/route.ts` — trackApiUsage intégré
- `apps/web/src/app/api/ai/extract-tasks/route.ts` — trackApiUsage intégré
- `apps/web/src/app/api/outlook/sync/route.ts` — trackApiUsage intégré
- `apps/web/src/app/api/ai/reclassify-all/route.ts` — trackApiUsage intégré

## Refonte UX/UI Paramètres — 6 améliorations + bug fix global (2026-02-17) — TERMINÉ

### Bug fix global — Fond noir des inputs
- [x] Ajout `color-scheme: light` dans globals.css (body + input/select/textarea)
- [x] Ajout `background-color: white` en CSS global pour tous les éléments de formulaire
- [x] Ajout explicite de `bg-white` sur les 3 inputs du ProfileForm (first_name, last_name, phone)
- [x] Suppression de TOUTES les classes `dark:` dans StatusBadge.tsx (9 variantes nettoyées)
- [x] Suppression des classes `dark:` dans LanguageSwitcher.tsx
- [x] Remplacement des couleurs `border-slate-300` → `border-gray-300` + `focus:border-blue-500` + `focus:ring-blue-500` pour cohérence

### Amélioration 1 — Navigation latérale par onglets
- [x] Sidebar gauche fixe (200px, bg-gray-50) avec 6 onglets
- [x] Onglets : Profil, Intégrations, Affichage, Notifications, Organisation, Abonnement
- [x] Onglet actif : bg-white, text-blue-600, border-l-2 border-blue-600, shadow-sm
- [x] Navigation par query params (?tab=profile, ?tab=integrations, etc.)
- [x] Chaque onglet directement accessible par URL
- [x] Contenu principal max-w-3xl centré

### Amélioration 2 — Section Profil améliorée
- [x] Avatar avec initiales (cercle bg-brand, texte blanc, 64x64)
- [x] Bouton "Changer la photo" (placeholder)
- [x] Layout 2 colonnes : Prénom | Nom, Téléphone | Email
- [x] Email en lecture seule (bg-gray-50, cursor-not-allowed) avec note explicative
- [x] Dirty state tracking : bouton "Enregistrer" disabled tant qu'aucune modification
- [x] Bouton change de couleur : gris si pas de modif → bleu si modifié
- [x] Toast de confirmation vert après sauvegarde réussie (auto-dismiss 4s)

### Amélioration 3 — Section Intégrations améliorée
- [x] Card Microsoft Outlook avec icône dans un fond bleu
- [x] État connecté : statut vert ✅, email affiché, dernière sync relative
- [x] Boutons "Synchroniser maintenant" (brand) + "Déconnecter" (outline)
- [x] Toggle archivage automatique ON/OFF
- [x] Dropdown fréquence de sync (5/15/30 min / Manuel)
- [x] État non connecté : liste des bénéfices, bouton CTA "Connecter Microsoft Outlook"
- [x] Section "Prochainement" : Google Gmail + Microsoft Teams (placeholders)

### Amélioration 4 — Section Organisation
- [x] Champ nom de l'entreprise modifiable
- [x] Tableau des membres : avatar initiales, nom, email, rôle (badge)
- [x] 3 membres mock (Julien RAY Admin, Marc Blanc Membre, Sophie Renaud Membre)
- [x] Bouton "Inviter un membre" → modale "Bientôt disponible — plan Pro"
- [x] Description des rôles : Admin, Chef de projet, Conducteur de travaux, Lecture seule

### Amélioration 5 — Section Abonnement
- [x] Plan actuel : "Trial gratuit" avec jours restants
- [x] Barre de progression visuelle (gradient bleu)
- [x] 3 cards pricing : Starter (79 CHF), Pro (149 CHF, badge "Populaire"), Enterprise (Sur devis)
- [x] Features listées avec checkmarks pour chaque plan
- [x] Boutons "Choisir" → modale placeholder "Bientôt disponible"
- [x] Lien support : support@cantaia.ch

### Amélioration 6 — Sections Affichage et Notifications
- [x] Affichage : mode multi/mono-projet (radio buttons visuels, existant déplacé)
- [x] Affichage : section "Thème et densité" placeholder
- [x] Affichage : diagnostics Supabase déplacés ici
- [x] Notifications : 4 toggles grisés (email, push, desktop, rapport hebdo)
- [x] Notifications : message "sera activé prochainement"

### Build final
- [x] Build OK : 27 pages, 24 API routes, 0 erreurs TypeScript

### Fichiers créés :
- `apps/web/src/components/settings/IntegrationsTab.tsx` — NOUVEAU : section Outlook + coming soon
- `apps/web/src/components/settings/OrganisationTab.tsx` — NOUVEAU : entreprise + membres mock
- `apps/web/src/components/settings/SubscriptionTab.tsx` — NOUVEAU : trial + plans pricing

### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/settings/page.tsx` — Refonte complète : navigation par onglets, 6 sections
- `apps/web/src/components/settings/ProfileForm.tsx` — Avatar, email readonly, dirty state, toast, 2 colonnes
- `apps/web/src/app/globals.css` — color-scheme: light, bg-white global inputs
- `packages/ui/src/components/shared/StatusBadge.tsx` — Suppression dark: classes
- `packages/ui/src/components/shared/LanguageSwitcher.tsx` — Suppression dark: classes
- `apps/web/messages/fr.json` — ~70 nouvelles clés settings (tabs, intégrations, organisation, abonnement, notifications)
- `apps/web/messages/en.json` — Mêmes clés en anglais
- `apps/web/messages/de.json` — Mêmes clés en allemand

---

## Étape 7 : Module PV de séance — EN COURS (2026-02-17)

### 7.1 — Page Séances & PV (liste avec statuts et filtres) — TERMINÉ
- [x] Types DB enrichis : Meeting (+planned_duration_minutes, agenda, audio_file_size_bytes, audio_retention_until, audio_retained, transcript_text), MeetingParticipant (+email)
- [x] Zod schemas mis à jour (email participant, planned_duration + agenda dans createMeeting)
- [x] 5 mock meetings réalistes : meet-012 (sent, PV complet 6 sections), meet-011 (finalized), meet-008 (review/draft), meet-003 (transcribing), meet-013 (scheduled)
- [x] Page /meetings : tableau 7 colonnes (#, Titre, Projet, Date, Participants, Statut, Actions)
- [x] STATUS_CONFIG : 7 statuts avec icônes, couleurs, badges (scheduled→recording→transcribing→generating_pv→review→finalized→sent)
- [x] Filtre par projet (dropdown avec pastilles couleur)
- [x] Actions contextuelles par statut (PDF, Éditer PV, Enregistrer, Spinner)
- [x] État vide avec CTA
- [x] i18n FR/EN/DE : ~70 clés meetings (statuts, colonnes, formulaire, enregistrement, PV, envoi)
- [x] Build OK : 27 pages, 24 API routes, 0 erreurs

#### Fichiers modifiés :
- `packages/database/types.ts` — Champs Meeting + MeetingParticipant enrichis
- `packages/core/src/models/meeting.ts` — Zod schemas mis à jour
- `apps/web/src/lib/mock-data.ts` — 5 mock meetings avec PV content
- `apps/web/src/app/[locale]/(app)/meetings/page.tsx` — Rewritten: table, filters, status badges
- `apps/web/messages/fr.json` / `en.json` / `de.json` — ~70 nouvelles clés meetings

### 7.2 — Création d'une nouvelle séance (/meetings/new) — TERMINÉ
- [x] Page /meetings/new avec formulaire complet
- [x] Dropdown projet obligatoire avec auto-remplissage à la sélection
- [x] Titre auto-incrémenté (Séance de chantier #N basé sur le dernier numéro du projet)
- [x] Date + heure + lieu (pré-rempli depuis la dernière séance du projet)
- [x] Durée prévue (dropdown 30-180 min)
- [x] Participants pré-remplis depuis la dernière séance (toggle présent/absent, suppression, ajout)
- [x] Formulaire ajout participant (nom*, entreprise*, rôle, email) dans zone bleue
- [x] Ordre du jour dynamique (ajout/suppression/édition de points, numérotés)
- [x] Deux boutons d'action : "Créer la séance" (brand) et "Créer et démarrer l'enregistrement" (outline brand + Mic)
- [x] Validation : projet + titre + date + heure requis
- [x] Mock save (console.log + redirect /meetings), prêt pour API
- [x] Build OK : 28 pages, 24 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/app/[locale]/(app)/meetings/new/page.tsx` — NOUVEAU : formulaire création séance

### 7.3 — Enregistrement audio (/meetings/[id]/record) — TERMINÉ
- [x] Page /meetings/[id]/record avec MediaRecorder API (WebM/Opus)
- [x] 4 états : idle (prêt), recording (en cours), paused, stopped
- [x] Indicateur de niveau audio en temps réel (AnalyserNode, barre de progression)
- [x] Cercle pulsant qui grossit avec le volume (scale transform)
- [x] Timer formaté HH:MM:SS
- [x] Contrôles : Pause/Reprendre + Stop (bouton rond rouge)
- [x] Taille du fichier affichée en temps réel
- [x] Après arrêt : lecteur audio HTML5, bouton "Lancer la transcription" + "Recommencer"
- [x] Tips zone bleue (3 conseils d'enregistrement)
- [x] Lien "Uploader un enregistrement" externe (placeholder pour 7.10)
- [x] Détection navigateur non supporté (fallback message)
- [x] Chunks de 10 secondes (ondataavailable)
- [x] Mock transcription (console.log + redirect), prêt pour API
- [x] Build OK : 29 pages, 24 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/app/[locale]/(app)/meetings/[id]/record/page.tsx` — NOUVEAU : enregistrement audio

### 7.4 — Upload + Whisper transcription — TERMINÉ
- [x] Route POST `/api/transcription/process` implémentée
- [x] Accepte FormData (audio file + meeting_id)
- [x] Mode mock (`USE_MOCK_TRANSCRIPTION=true`) avec transcription réaliste de séance de chantier
- [x] Mode réel : appel OpenAI Whisper API (whisper-1, langue fr, verbose_json)
- [x] Logging usage API (console.log, prêt pour Supabase tracking)
- [x] Build OK

### 7.5 — Génération PV avec Claude — TERMINÉ
- [x] Route POST `/api/ai/generate-pv` implémentée
- [x] Utilise `buildPVGeneratePrompt()` de `@cantaia/core/ai`
- [x] Mode mock (`USE_MOCK_PV=true`) avec PV structuré de base
- [x] Mode réel : appel Claude Sonnet 4.5 (max 8000 tokens)
- [x] Parse JSON du PV structuré (header, sections, actions, next_steps, summary)
- [x] Logging usage API (input/output tokens)
- [x] Build OK : 29 pages, 24 API routes, 0 erreurs

#### Fichiers modifiés :
- `apps/web/src/app/api/transcription/process/route.ts` — RÉÉCRIT : Whisper + mock
- `apps/web/src/app/api/ai/generate-pv/route.ts` — RÉÉCRIT : Claude PV generation + mock

### 7.6 — Éditeur de PV (/meetings/[id]/edit) — TERMINÉ
- [x] Page /meetings/[id]/edit avec éditeur complet de PV structuré
- [x] Pré-rempli depuis pv_content du meeting (sections, actions, décisions)
- [x] Header info : projet, n° séance, date, prochaine séance (éditable)
- [x] Sections numérotées avec : titre, discussion (textarea), décisions (liste), actions (formulaire)
- [x] Actions éditables : description, responsable, entreprise, délai, priorité (normal/urgent)
- [x] Ajout/suppression de sections, décisions, actions, prochaines étapes
- [x] Résumé global éditable
- [x] Auto-save toutes les 30 secondes (indicateur vert "Sauvegardé")
- [x] Panneau latéral transcription (toggle, 384px, texte original)
- [x] Bouton "Finaliser le PV" → redirect meetings
- [x] Build OK : 30 pages, 24 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/app/[locale]/(app)/meetings/[id]/edit/page.tsx` — NOUVEAU : éditeur de PV

### 7.7 — Export Word/PDF — TERMINÉ
- [x] Route POST `/api/meetings/export` : génère document Word (.docx) à partir du pv_content
- [x] Document structuré : titre centré, infos projet, participants (table colorée), sections numérotées
- [x] Décisions (✓ vert), actions (→ avec responsable, entreprise, délai, priorité urgente en rouge)
- [x] Prochaines étapes, résumé, footer CANTAIA
- [x] Table participants avec en-tête bleu brand (#1E3A5F), bordures fines
- [x] Package `docx` (Word generation) + `file-saver` ajoutés
- [x] Build OK : 30 pages, 25 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/app/api/meetings/export/route.ts` — NOUVEAU : export Word

### 7.8 — Finalisation + envoi du PV — TERMINÉ
- [x] Page /meetings/[id] : vue détail complète d'une séance
- [x] 3 colonnes : détails (date, lieu, durée, audio), participants (liste avec statut), agenda + envoi
- [x] Actions contextuelles par statut :
  - Scheduled → bouton "Enregistrer" (rouge, lien /record)
  - Review → "Modifier le PV" (lien /edit) + "Finaliser" (vert, confirmation dialog)
  - Finalized → "Envoyer le PV" (brand)
  - Avec PV → "Exporter" (Word download via /api/meetings/export)
- [x] Résumé du PV en bas (nombre de sections + actions)
- [x] Mock finalize (console.log), mock send (console.log), prêt pour Supabase + Graph

### 7.9 — Rétention audio — TERMINÉ
- [x] Warning amber dans la fiche meeting si audio_retention_until ≤ 7 jours
- [x] Icône AlertTriangle + message d'alerte
- [x] Boutons "Télécharger l'audio" + "Conserver (Premium)"
- [x] Note "Disponible avec le plan Pro"

### 7.10 — Upload audio externe — TERMINÉ
- [x] Lien "Uploader un enregistrement" dans la page /record (idle state)
- [x] Formats acceptés affichés : MP3, WAV, M4A, WebM, OGG (max 500 MB)
- [x] Placeholder UI (bouton + texte), prêt pour API upload

### 7.11 — Données mock — TERMINÉ (fait dans 7.1)
- [x] 5 meetings réalistes (sent, finalized, review, transcribing, scheduled)
- [x] PV complet pour meet-012 (6 sections, 8 participants, 5 actions)
- [x] PV partiel pour meet-008 (2 sections, coordination CVC)

### 7.12 — i18n FR/EN/DE — TERMINÉ (fait dans 7.1)
- [x] ~70 clés meetings dans les 3 langues
- [x] Statuts, formulaire, enregistrement, transcription, PV editor, envoi, rétention audio

### Build final Step 7
- [x] Build OK : 31 pages, 25 API routes, 0 erreurs TypeScript

### Fichiers créés/modifiés Step 7 :
- `apps/web/src/app/[locale]/(app)/meetings/page.tsx` — RÉÉCRIT : liste meetings avec table et filtres
- `apps/web/src/app/[locale]/(app)/meetings/new/page.tsx` — NOUVEAU : création séance
- `apps/web/src/app/[locale]/(app)/meetings/[id]/page.tsx` — NOUVEAU : détail séance
- `apps/web/src/app/[locale]/(app)/meetings/[id]/record/page.tsx` — NOUVEAU : enregistrement audio
- `apps/web/src/app/[locale]/(app)/meetings/[id]/edit/page.tsx` — NOUVEAU : éditeur de PV
- `apps/web/src/app/api/transcription/process/route.ts` — RÉÉCRIT : Whisper + mock
- `apps/web/src/app/api/ai/generate-pv/route.ts` — RÉÉCRIT : Claude PV generation + mock
- `apps/web/src/app/api/meetings/export/route.ts` — NOUVEAU : export Word (docx)
- `packages/database/types.ts` — Meeting + MeetingParticipant enrichis
- `packages/core/src/models/meeting.ts` — Zod schemas mis à jour
- `apps/web/src/lib/mock-data.ts` — 5 mock meetings avec PV content
- `apps/web/messages/fr.json` / `en.json` / `de.json` — ~70 clés meetings

---

## White-labeling — Personnalisation identité visuelle par organisation (2026-02-17)

### WL.1 — Migration SQL + types TypeScript — TERMINÉ
- [x] Migration `005_organization_branding.sql` : 9 colonnes ajoutées (logo_url, logo_dark_url, primary_color, secondary_color, sidebar_color, accent_color, custom_name, favicon_url, branding_enabled)
- [x] Commentaires SQL sur chaque colonne (description + valeurs par défaut)
- [x] Interface `Organization` dans `packages/database/types.ts` mise à jour avec les 9 champs branding
- [x] Défauts : primary=#1E3A5F, secondary=#3B82F6, sidebar=#F8FAFC, accent=#F59E0B

#### Fichiers créés/modifiés :
- `packages/database/migrations/005_organization_branding.sql` — NOUVEAU
- `packages/database/types.ts` — Organization enrichi avec branding

### WL.2 — Upload logo + API branding — TERMINÉ
- [x] Route POST `/api/organization/upload-logo` : upload FormData → Supabase Storage → update organization
- [x] Validation : types autorisés (PNG, JPEG, SVG, ICO), taille max 2 MB
- [x] Support variante light/dark (logo.ext vs logo-dark.ext)
- [x] Vérification plan (Pro/Enterprise requis)
- [x] Route GET/POST `/api/organization/branding` : lecture + mise à jour des couleurs et options
- [x] Validation hex #RRGGBB sur les couleurs
- [x] Update partiel (seuls les champs fournis sont modifiés)

#### Fichiers créés :
- `apps/web/src/app/api/organization/upload-logo/route.ts` — NOUVEAU
- `apps/web/src/app/api/organization/branding/route.ts` — NOUVEAU (GET + POST)

### WL.3 — Sélecteur de couleurs dans OrganisationTab — TERMINÉ
- [x] Section branding avec toggle enable/disable
- [x] Zone upload logo (light + dark variant) avec drag-to-click, preview inline
- [x] 4 color pickers : primary, secondary, sidebar, accent (input[type=color] + champ hex)
- [x] Bouton reset vers couleurs par défaut
- [x] Aperçu live : mini sidebar + contenu simulé avec les couleurs choisies
- [x] Verrouillage plan (Trial/Starter → message + icône Lock)
- [x] Composant `ColorPicker` réutilisable (label, hex input, description)
- [x] i18n FR/EN/DE : 24 nouvelles clés branding
- [x] Appel API POST `/api/organization/branding` à la sauvegarde
- [x] Appel API POST `/api/organization/upload-logo` à l'upload

#### Fichiers modifiés :
- `apps/web/src/components/settings/OrganisationTab.tsx` — RÉÉCRIT avec section branding
- `apps/web/messages/fr.json` / `en.json` / `de.json` — 24 clés branding ajoutées

### WL.4 — useBranding hook + BrandingProvider + CSS vars + Sidebar — TERMINÉ
- [x] `BrandingProvider` : fetch GET /api/organization/branding au mount, expose `branding` + `refresh()`
- [x] `useBranding()` hook pour accéder au contexte branding
- [x] CSS custom properties : `--brand-primary`, `--brand-secondary`, `--brand-sidebar`, `--brand-accent` appliquées sur `document.documentElement`
- [x] Cleanup : suppression des CSS vars quand branding désactivé
- [x] BrandingProvider ajouté dans le layout (entre AuthProvider et AppEmailProvider)
- [x] Sidebar mise à jour : couleur fond dynamique (`sidebarColor`), logo conditionnel (image ou initiale), couleur active dynamique (`primaryColor`), badges dynamiques, user avatar dynamique
- [x] Mobile nav : couleur active dynamique
- [x] Fallback gracieux : si branding désactivé, utilise les classes Tailwind `bg-brand` / `text-brand` par défaut

#### Fichiers créés/modifiés :
- `apps/web/src/components/providers/BrandingProvider.tsx` — NOUVEAU
- `apps/web/src/components/app/Sidebar.tsx` — RÉÉCRIT avec useBranding()
- `apps/web/src/app/[locale]/(app)/layout.tsx` — BrandingProvider ajouté

### WL.5 — Mock branding data — TERMINÉ
- [x] 3 organisations mock : HRS (Pro, primary=#1B365D, accent=#D4A843, enabled), Implenia (Enterprise, primary=#00843D, enabled), BG (Starter, disabled)
- [x] Données réalistes (adresses suisses, plans cohérents, couleurs distinctes)
- [x] Organisation `Organization` importée depuis `@cantaia/database`
- [x] Export `mockOrganizations` dans mock-data.ts

#### Fichiers modifiés :
- `apps/web/src/lib/mock-data.ts` — mockOrganizations ajouté (3 organisations)

### WL.6 — Admin branding overview — TERMINÉ
- [x] Page `/admin/branding` : tableau overview de toutes les organisations
- [x] 6 colonnes : Organisation (avatar+nom+ville), Plan (badge couleur+icône), Branding (actif/inactif), Couleurs (4 dots), Logo, Aperçu mini sidebar
- [x] Recherche par nom ou ville
- [x] Plan badges : Enterprise=purple, Pro=blue, Starter=gray, Trial=amber
- [x] Mini aperçu sidebar dans la dernière colonne
- [x] Légende en bas de page

#### Fichiers créés :
- `apps/web/src/app/[locale]/(admin)/branding/page.tsx` — NOUVEAU

---

## Étape 8 : Système de tâches complet — TERMINÉ (2026-02-17)

### 8.1 — Page tâches vue globale (liste + kanban) — TERMINÉ
- [x] Page /tasks refondée avec 2 modes d'affichage (liste/kanban, persisté localStorage)
- [x] Mode Liste : tableau 7 colonnes (checkbox, tâche, projet, assigné, deadline, priorité, source), triable
- [x] Mode Kanban : 4 colonnes (À faire, En cours, En attente, Terminé) avec cards compactes
- [x] Filtres : projet, statut (active/toutes/spécifique), priorité, source + recherche textuelle
- [x] Compteurs dynamiques : En retard, Aujourd'hui, Cette semaine, Plus tard, Terminées
- [x] Sélection multiple avec checkboxes + barre d'actions en masse
- [x] Tâches en retard surlignées en rouge + ⚠️, tâches terminées barrées/grisées
- [x] Types Task enrichis : +assigned_user_id, +completed_by, +reminder, +lot_id, +lot_name, +cfc_code, +comments, +history, +attachments
- [x] TaskStatus : open→todo, completed→done ; TaskSource : meeting_pv→meeting, ai_suggestion→reserve
- [x] 17 mock tasks réalistes (8 Cèdres, 5 Malley, 4 Campus RTS) avec commentaires et historique
- [x] Zod schemas mis à jour (taskStatusSchema, taskSourceSchema, taskReminderSchema)
- [x] StatusBadge enrichi avec todo/done variants
- [x] i18n FR/EN/DE : ~60 nouvelles clés tasks
- [x] Build OK : 26 pages, 27 API routes, 0 erreurs

#### Fichiers créés/modifiés :
- `apps/web/src/app/[locale]/(app)/tasks/page.tsx` — RÉÉCRIT : vue liste + kanban
- `packages/database/types.ts` — Task enrichi, TaskStatus/TaskSource mis à jour, TaskComment/TaskHistoryEntry/TaskAttachment
- `packages/core/src/models/task.ts` — Zod schemas mis à jour
- `packages/ui/src/components/shared/StatusBadge.tsx` — todo/done ajoutés
- `apps/web/src/lib/mock-data.ts` — 17 mock tasks réalistes
- `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx` — Refs old status fixées
- `apps/web/messages/fr.json` / `en.json` / `de.json` — ~60 clés tasks

### 8.2+8.3 — Création/édition de tâche + Panneau détail — TERMINÉ
- [x] TaskCreateModal : modale création/édition avec champs titre*, projet*, description, assigné, entreprise, priorité (radio), deadline*, statut, rappel, lot/CFC
- [x] Mode édition : pré-remplissage complet depuis `editTask` prop
- [x] Mode pré-remplissage : `prefill` prop pour création depuis email/PV (titre, projet, description, source, source_reference)
- [x] Source info read-only affichée quand pré-remplie
- [x] TaskDetailPanel : panneau latéral droit avec 4 onglets (Détail, Commentaires, Historique, Pièces jointes)
- [x] Onglet Détail : statut, priorité, description, projet, deadline, assigné, lot/CFC, source, rappel, dates créé/modifié
- [x] Onglet Commentaires : liste chronologique + ajout commentaire (Ctrl+Enter ou bouton Envoyer)
- [x] Onglet Historique : timeline verticale avec actions (créé, modifié, terminé, commenté) + champs modifiés
- [x] Onglet Pièces jointes : liste fichiers avec nom, taille, bouton télécharger
- [x] Actions depuis le panneau : marquer terminée (CheckCircle), éditer (ouvre modale), supprimer
- [x] Intégration page /tasks : click sur une tâche ouvre le panneau, bouton "Nouvelle tâche" ouvre la modale
- [x] Highlight tâche sélectionnée (bg-blue-50 en liste, ring en kanban)
- [x] i18n FR/EN/DE : +8 clés (tabDetail, tabComments, tabHistory, tabAttachments, noComments, noHistory, noAttachments, cancel)
- [x] Build OK : 26 pages, 27 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/components/tasks/TaskCreateModal.tsx` — Modale création/édition
- `apps/web/src/components/tasks/TaskDetailPanel.tsx` — Panneau détail avec 4 onglets

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/tasks/page.tsx` — Intégration modale + panneau, click-to-open, état sélection
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +8 clés tasks (tabs, empty states)

### 8.4 — Migration SQL colonnes enrichies — TERMINÉ
- [x] Migration `006_tasks_enriched.sql` créée
- [x] Rename enums : task_status (open→todo, completed→done), task_source (meeting_pv→meeting, ai_suggestion→reserve)
- [x] Nouveau type : task_reminder ENUM ('none', '1_day', '3_days', '1_week')
- [x] Nouvelles colonnes : assigned_user_id, completed_by, reminder, lot_id, lot_name, cfc_code, comments (JSONB), history (JSONB), attachments (JSONB)
- [x] Default status changé de 'open' à 'todo'
- [x] Index sur assigned_user_id, cfc_code, reminder (partiel)
- [x] Build OK

#### Fichier créé :
- `packages/database/migrations/006_tasks_enriched.sql`

### 8.5 — Actions en masse — TERMINÉ
- [x] Barre d'actions en masse fonctionnelle (apparaît quand checkboxes cochées)
- [x] Changer statut en masse : select → applique à toutes les tâches sélectionnées
- [x] Changer priorité en masse : select → applique à toutes les tâches sélectionnées
- [x] Assigner en masse : bouton + prompt nom → assigne à toutes
- [x] Supprimer en masse : bouton rouge + confirmation → supprime les sélectionnées
- [x] Confirmation dialog pour suppression (confirm() natif)
- [x] Clear selection après chaque action en masse
- [x] i18n FR/EN/DE : +4 clés (bulkAssign, bulkDelete, bulkAssignPrompt, bulkDeleteConfirm)
- [x] Build OK

#### Fichier modifié :
- `apps/web/src/app/[locale]/(app)/tasks/page.tsx` — Bulk actions fonctionnelles
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +4 clés bulk

### 8.6 — Filtres et recherche avancés — TERMINÉ
- [x] Filtre deadline ajouté : Toutes / En retard / Aujourd'hui / Cette semaine / Plus tard
- [x] Filtres existants déjà fonctionnels : projet, statut, priorité, source, recherche textuelle
- [x] i18n FR/EN/DE : +1 clé (allDeadlines)
- [x] Build OK

### 8.7 — Tâches depuis les emails — TERMINÉ
- [x] Callback `onCreateTask` ajouté à EmailDetailPanel (prop optionnelle)
- [x] Export `TaskPrefill` interface depuis EmailDetailPanel
- [x] Bouton "Créer tâche" sur les tâches extraites IA → ouvre TaskCreateModal avec prefill (titre, projet, description, source email, deadline, assigné)
- [x] Bouton "Créer une tâche manuelle" (section Actions rapides) → ouvre TaskCreateModal avec prefill depuis l'email
- [x] TaskCreateModal intégré dans la page Dashboard avec état taskModalOpen + taskPrefill
- [x] Les 2 instances EmailDetailPanel (desktop + mobile) passent le callback
- [x] Build OK

#### Fichiers modifiés :
- `apps/web/src/components/app/EmailDetailPanel.tsx` — onCreateTask callback, TaskPrefill export
- `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` — TaskCreateModal intégré, handleCreateTaskFromEmail

### 8.8 — Tâches depuis les PV — TERMINÉ
- [x] Section "Actions du PV" ajoutée sur la page détail de séance
- [x] Liste toutes les actions de chaque section du PV avec responsable, entreprise, deadline, priorité
- [x] Bouton "Créer tâche" par action → ouvre TaskCreateModal avec prefill (titre, projet, description, source meeting, reference PV, deadline, assigné, entreprise)
- [x] État "Tâche créée" (CheckCircle vert) après création
- [x] Description PV incluse : "PV Séance #X — Point Y.Z: Titre"
- [x] i18n FR/EN/DE : +4 clés meetings (pvActions, pvActionsDescription, taskCreated, createTask)
- [x] Build OK

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/meetings/[id]/page.tsx` — Section PV Actions + TaskCreateModal
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +4 clés meetings

### 8.9 — Notifications et rappels — TERMINÉ
- [x] Badge rouge tâches en retard dans la sidebar (navigation)
- [x] NavItem.badgeVariant "danger" → badge rouge (bg-red-100/text-red-700 expanded, bg-red-500 collapsed)
- [x] Badge affiché sur desktop (expanded + collapsed) et mobile
- [x] Compteur overdue dynamique à partir de mockTasks
- [x] Build OK

#### Fichier modifié :
- `apps/web/src/components/app/Sidebar.tsx` — Badge danger variant, overdue task count

### 8.10 — Intégration dashboard — TERMINÉ
- [x] Panneau droit : tâches en retard affichées depuis mockTasks (auparavant tableau vide)
- [x] Panneau droit : tâches en retard avec bordure rouge (border-red-100, bg-red-50/50)
- [x] Section "Tâches du jour" ajoutée (desktop + mobile) avec compteur, affichage projet + assigné
- [x] Apparaît uniquement quand il y a des tâches aujourd'hui (masqué si vide)
- [x] i18n FR/EN/DE : +1 clé dashboard (todayTasks)
- [x] Build OK

#### Fichier modifié :
- `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` — mockTasks import, overdueTasks + todayTasks réels, sections ajoutées
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +1 clé todayTasks

### 8.11 — Vue projet onglet Tâches — TERMINÉ
- [x] Placeholder remplacé par liste de tâches réelles filtrées par projet
- [x] Chaque tâche : priorité (PriorityIndicator), titre, assigné, deadline, lot/CFC, StatusBadge
- [x] Tâches en retard surlignées (border-red-200, bg-red-50/30)
- [x] Click sur une tâche → TaskDetailPanel (panneau latéral)
- [x] Bouton "Nouvelle tâche" → TaskCreateModal pré-rempli avec project_id
- [x] Edit/Delete depuis le panneau détail → modale d'édition
- [x] État vide si aucune tâche ("Aucune tâche pour l'instant")
- [x] i18n FR/EN/DE : +1 clé projects (newTask)
- [x] Build OK

#### Fichier modifié :
- `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx` — Onglet tâches réel + modale + panneau
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +1 clé projects.newTask

### 8.12 — Données mock réalistes — TERMINÉ (fait dans 8.1)
- [x] 17 mock tasks réalistes avec commentaires, historique et pièces jointes (créé dans 8.1)
- [x] Répartition : 8 Résidence Les Cèdres, 5 Central Malley, 4 Campus RTS
- [x] Sources variées : email, meeting, manual, reserve
- [x] Priorités : 2 urgent, 3 high, 7 medium, 5 low
- [x] Statuts : 6 todo, 4 in_progress, 3 waiting, 3 done, 1 cancelled

### 8.13 — Traductions i18n FR/EN/DE — TERMINÉ (fait progressivement)
- [x] ~80+ clés tasks ajoutées au total (cumulées sur 8.1–8.11)
- [x] Clés couvrent : vues, filtres, colonnes, statuts, priorités, sources, actions masse, onglets détail, création/édition, PV actions, dashboard
- [x] Toutes les clés traduites en FR, EN, DE

---

---

## Étape 9 : Briefing quotidien intelligent — EN COURS (2026-02-17)

### 9.1 — Migration SQL briefings + préférences utilisateur — TERMINÉ
- [x] Migration `007_briefings.sql` créée
- [x] Table `daily_briefings` : id, user_id, briefing_date (UNIQUE user+date), content (JSONB), is_sent, sent_at, created_at
- [x] Index sur (user_id, briefing_date DESC) et (briefing_date)
- [x] RLS : users SELECT own, service role ALL
- [x] ALTER TABLE users : +briefing_enabled (bool, default true), +briefing_time (TIME, default 07:00), +briefing_email (bool, default false), +briefing_projects (UUID[], default {})
- [x] Types TypeScript mis à jour : User +4 champs briefing, BriefingContent enrichi (+mode ai/fallback, +stats)
- [x] Build OK

#### Fichiers créés/modifiés :
- `packages/database/migrations/007_briefings.sql` — NOUVEAU
- `packages/database/types.ts` — User +briefing prefs, BriefingContent +mode +stats

### 9.2 — Data Collector (briefing-collector.ts) — TERMINÉ
- [x] `collectBriefingData()` : agrège projets, emails, tâches, réunions
- [x] Interface `BriefingDataInput` : données brutes (projets, emails, tasks, meetings, user_name, locale)
- [x] Interface `BriefingRawData` : données agrégées pour l'IA (stats, projects triés par urgence, meetings_today, overdue_tasks, urgent_emails)
- [x] Interface `ProjectBriefingData` : stats par projet (emails unread/urgent, tasks overdue/today, next meeting, recent subjects)
- [x] Tri par urgence : projets avec tâches en retard + emails urgents en premier
- [x] Dependency injection : données passées en paramètre (pas d'accès direct Supabase)
- [x] Export via `@cantaia/core/briefing`
- [x] Build OK

#### Fichiers créés/modifiés :
- `packages/core/src/briefing/briefing-collector.ts` — NOUVEAU
- `packages/core/src/briefing/index.ts` — NOUVEAU
- `packages/core/package.json` — Export `./briefing` ajouté

### 9.3 — AI Generator (briefing-generator.ts + API route) — TERMINÉ
- [x] `generateBriefingAI()` : génère un briefing structuré via Claude Sonnet (prompt contextuel construction suisse)
- [x] `generateBriefingFallback()` : génère un briefing factuel sans IA (stats brutes, emojis santé, alertes)
- [x] Prompt IA : greeting personnalisé, priority_alerts (0-5), projets avec emoji santé (🟢🟡🔴), action_items, meetings, global_summary
- [x] Fallback multilingue FR/EN/DE (greetings, alertes, résumés)
- [x] Route POST `/api/briefing/generate` : auth, fetch projets+emails+tasks+meetings depuis Supabase, collecte → génération IA ou fallback, upsert daily_briefings
- [x] Tracking usage API (trackApiUsage)
- [x] Build OK : 26 pages, 28 API routes, 0 erreurs

#### Fichiers créés/modifiés :
- `packages/core/src/briefing/briefing-generator.ts` — NOUVEAU
- `packages/core/src/briefing/index.ts` — Export generator ajouté
- `apps/web/src/app/api/briefing/generate/route.ts` — NOUVEAU

### 9.4 — Briefing page (compact panel + full page) — TERMINÉ
- [x] Composant `BriefingPanel` (compact) : alertes prioritaires, résumés projets (emoji santé), réunions du jour, lien "Voir tout"
- [x] Dashboard : remplace les 4 alertes mock hardcodées par `<BriefingPanel compact />`(desktop + mobile)
- [x] Page `/briefing` complète : greeting, navigation par date (chevrons + date picker), 6 stat cards (projets, non lus, actions, en retard, aujourd'hui, réunions)
- [x] Alertes prioritaires (fond amber), projets avec emoji + résumé + action items, réunions du jour (fond bleu), résumé global
- [x] Bouton "Régénérer" (seulement pour aujourd'hui), indicateur mode (IA/fallback)
- [x] Mock briefing réaliste (3 projets, 3 alertes, 1 réunion, stats)
- [x] i18n FR/EN/DE : ~40 clés namespace `briefing`
- [x] Build OK : 27 pages, 29 API routes, 0 erreurs

#### Fichiers créés/modifiés :
- `apps/web/src/components/briefing/BriefingPanel.tsx` — NOUVEAU
- `apps/web/src/app/[locale]/(app)/briefing/page.tsx` — NOUVEAU
- `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` — BriefingPanel intégré (desktop + mobile)
- `apps/web/messages/fr.json` / `en.json` / `de.json` — ~40 clés briefing

### 9.5 — Auto-génération (GET /api/briefing/today, cache 6h) — TERMINÉ
- [x] Route GET `/api/briefing/today` : récupère le briefing du jour (ou date passée via `?date=`)
- [x] Cache 6h : is_fresh/needs_regeneration basé sur created_at
- [x] BriefingPanel : essaie GET /today → si 404, POST /generate → fallback mock
- [x] Page /briefing : fetch par date (historique), auto-génération si today + 404
- [x] Build OK

#### Fichiers créés/modifiés :
- `apps/web/src/app/api/briefing/today/route.ts` — NOUVEAU
- `apps/web/src/components/briefing/BriefingPanel.tsx` — Connexion API réelle
- `apps/web/src/app/[locale]/(app)/briefing/page.tsx` — Connexion API réelle

### 9.6 — Fallback sans IA — TERMINÉ
- [x] `generateBriefingFallback()` déjà implémenté dans 9.3
- [x] Génère un briefing factuel : stats brutes, emojis santé (🟢🟡🔴), alertes par type
- [x] Multilingue FR/EN/DE (greetings, alertes, résumés projets)
- [x] API route `/api/briefing/generate` : utilise fallback si pas de clé Anthropic ou si erreur IA
- [x] `generateBriefingAI()` : catch → fallback automatique en cas d'erreur
- [x] Indicateur mode (`ai` / `fallback`) visible sur la page briefing
- [x] Build OK (pas de nouveau fichier)

### 9.7 — Préférences briefing dans paramètres — TERMINÉ
- [x] Section "Briefing quotidien IA" ajoutée dans l'onglet Notifications des paramètres
- [x] Toggle activer/désactiver le briefing
- [x] Sélecteur d'heure (input time, défaut 07:00)
- [x] Toggle envoi par email
- [x] Bouton "Enregistrer les préférences" (mock save, prêt pour API)
- [x] Préférences conditionnelles (heure et email masqués si briefing désactivé)
- [x] i18n FR/EN/DE : 9 clés settings (briefingPrefsTitle, briefingPrefsDesc, etc.)
- [x] Build OK

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/settings/page.tsx` — NotificationsTab enrichi avec briefing prefs
- `apps/web/messages/fr.json` / `en.json` / `de.json` — 9 clés briefing prefs

### 9.8 — Historique briefing (date picker, navigation) — TERMINÉ
- [x] Navigation par date déjà implémentée dans la page /briefing (9.4)
- [x] Date picker `<input type="date">` avec max=today
- [x] Boutons ChevronLeft/ChevronRight pour naviguer jour par jour
- [x] Bouton "Aujourd'hui" quand on consulte une date passée
- [x] API GET `/api/briefing/today?date=` supporte les dates passées
- [x] Bouton "Régénérer" masqué quand on consulte l'historique (uniquement pour today)
- [x] Build OK (pas de nouveau fichier)

### 9.9 — Lien sidebar + navigation — TERMINÉ
- [x] Lien "Briefing" ajouté dans la sidebar (icône Sparkles, entre Inbox et Projets)
- [x] i18n nav FR/EN/DE : clé `briefing`
- [x] Build OK

#### Fichiers modifiés :
- `apps/web/src/components/app/Sidebar.tsx` — NavItem briefing ajouté
- `apps/web/messages/fr.json` / `en.json` / `de.json` — Clé nav.briefing

### 9.10 — Données mock — TERMINÉ
- [x] `mockDailyBriefing` dans mock-data.ts : briefing complet (3 projets, 3 alertes, 1 réunion, stats)
- [x] `getMockBriefing()` dans BriefingPanel + BriefingPage : briefing i18n via clés traduction
- [x] Build OK

#### Fichiers modifiés :
- `apps/web/src/lib/mock-data.ts` — mockDailyBriefing ajouté

### 9.11 — i18n FR/EN/DE — TERMINÉ
- [x] ~50 clés namespace `briefing` : page, panel, stats, alerts, mock data
- [x] ~10 clés namespace `settings` : préférences briefing
- [x] 1 clé namespace `nav` : lien sidebar
- [x] Toutes les clés vérifiées dans fr.json, en.json, de.json
- [x] Build OK

---

## Étape 10 : Dashboard Admin (Superadmin CANTAIA) — TERMINÉ (2026-02-17)

### 10.1 — Migration SQL + Protection Admin — TERMINÉ
- [x] Migration `009_admin_system.sql` : `is_superadmin` sur users, tables `admin_activity_logs`, `admin_daily_metrics`, `admin_config`
- [x] `admin_activity_logs` : user_id, organization_id, action, metadata, ip_address, user_agent — indexes date/user/action/org
- [x] `admin_daily_metrics` : métriques quotidiennes pré-calculées (users, orgs, usage, coûts, revenue) — UNIQUE(metric_date)
- [x] `admin_config` : key-value store pour config admin (tarifs API, plans, seuils alertes) — valeurs par défaut insérées
- [x] RLS : service role only sur les 3 nouvelles tables
- [x] Types TypeScript : `AdminActionType`, `AdminActivityLog`, `AdminDailyMetrics`, `AdminConfig` + Insert types + Database schema
- [x] User interface : +`is_superadmin` boolean
- [x] Helper `requireSuperadmin()` dans `apps/web/src/lib/admin/require-superadmin.ts`
- [x] Middleware : ajout `/admin`, `/briefing`, `/direction`, `/api-costs` aux paths protégés
- [x] Build OK

#### Fichiers créés/modifiés :
- `packages/database/migrations/009_admin_system.sql` — NOUVEAU
- `packages/database/types.ts` — +AdminActionType, AdminActivityLog, AdminDailyMetrics, AdminConfig, is_superadmin
- `apps/web/src/lib/admin/require-superadmin.ts` — NOUVEAU
- `apps/web/src/middleware.ts` — Paths protégés étendus

### 10.2+10.3 — Page admin vue d'ensemble + Graphique d'évolution — TERMINÉ
- [x] Layout admin `(admin)/layout.tsx` : sidebar dédiée avec 7 liens, collapsible, icône Shield rouge, lien retour app
- [x] Page `/admin` avec 8 cards métriques : Clients, MRR, Coûts API, Marge, Emails classifiés, PV générés, Tâches créées, Briefings générés
- [x] Cards colorées avec icônes, valeurs et variations mensuelles (vert/rouge)
- [x] Mock data admin : `mock-admin-data.ts` avec 6 orgs, 24 users, alertes, logs, métriques 30j, stats calculées
- [x] Graphique d'évolution (recharts LineChart) : multi-séries toggleables (Coûts API, Users actifs, Emails, PV)
- [x] Sélecteur de période : 7j / 30j / 90j / 1 an
- [x] Toggles séries : boutons pill avec indicateur couleur, activables/désactivables
- [x] i18n FR/EN/DE : ~120 clés namespace `admin` (navigation, métriques, orgs, users, finances, logs, config, actions)
- [x] Build OK : 28 pages, 29 API routes, 0 erreurs

#### Fichiers créés/modifiés :
- `apps/web/src/app/[locale]/(admin)/layout.tsx` — NOUVEAU : layout admin avec sidebar
- `apps/web/src/app/[locale]/(admin)/admin/page.tsx` — NOUVEAU : page vue d'ensemble
- `apps/web/src/lib/admin/mock-admin-data.ts` — NOUVEAU : données mock admin complètes
- `apps/web/messages/fr.json` / `en.json` / `de.json` — ~120 clés admin

### 10.4 — Tableau des organisations — TERMINÉ
- [x] Page `/admin/organizations` : tableau complet avec 8 colonnes triables (nom, plan, users, projets, MRR, coût API, marge, activité)
- [x] Recherche textuelle par nom ou ville
- [x] Tri par colonne (clic en-tête → asc/desc)
- [x] Marge colorée : 🟢 > 80%, 🟡 50-80%, 🔴 < 50%
- [x] Badge plan coloré (Trial gris, Starter bleu, Pro violet, Enterprise amber)
- [x] Activité relative (Auj., Hier, il y a Xj)
- [x] Export CSV (génère et télécharge un fichier .csv)
- [x] Clic nom → lien vers `/admin/organizations/[id]`
- [x] Build OK

#### Fichiers créés :
- `apps/web/src/app/[locale]/(admin)/admin/organizations/page.tsx` — NOUVEAU

### 10.5 — Page détail organisation — TERMINÉ
- [x] Page `/admin/organizations/[id]` : détail complet d'une organisation
- [x] Section Informations : plan, date inscription, trial restant, branding activé/désactivé
- [x] Boutons actions : changer plan, prolonger trial, suspendre
- [x] Tableau utilisateurs : nom, email, rôle (badge), dernière connexion
- [x] Liste projets : pastille couleur, nom, code, statut
- [x] Coûts API détaillés : total/revenu/marge + barres de répartition par action (6 catégories)
- [x] Coûts par utilisateur : emails classés, coût, coût/jour
- [x] Journal d'activité : 15 dernières actions avec horodatage, utilisateur, action, métadonnées
- [x] Build OK : 30 pages

#### Fichiers créés :
- `apps/web/src/app/[locale]/(admin)/admin/organizations/[id]/page.tsx` — NOUVEAU

---

### 10.6 — Tracking d'activité (activity-logger) — TERMINÉ
- [x] Module `logActivity` + `logActivityAsync` (fire-and-forget, jamais bloquant)
- [x] Intégration dans `/api/outlook/sync` (action: `sync_emails`)
- [x] Intégration dans `/api/briefing/generate` (action: `generate_briefing`)
- [x] Intégration dans `/api/projects/create` (action: `create_project`)
- [x] Export via `@cantaia/core/tracking`
- [x] Build OK

#### Fichiers créés :
- `packages/core/src/tracking/activity-logger.ts` — NOUVEAU

#### Fichiers modifiés :
- `packages/core/src/tracking/index.ts` — ajout exports activity-logger
- `apps/web/src/app/api/outlook/sync/route.ts` — import + appel logActivityAsync
- `apps/web/src/app/api/briefing/generate/route.ts` — import + appel logActivityAsync
- `apps/web/src/app/api/projects/create/route.ts` — import + appel logActivityAsync

### 10.7 — Métriques quotidiennes pré-calculées — TERMINÉ
- [x] Route POST `/api/admin/compute-daily-metrics` : agrège les données du jour (ou date passée)
- [x] Route GET `/api/admin/compute-daily-metrics` : récupère les métriques stockées (param: days)
- [x] Compteurs : users actifs, orgs actives, emails classifiés, PV générés, tâches créées, briefings
- [x] Coûts API : total, Anthropic, OpenAI séparés depuis `api_usage_logs`
- [x] Revenu : estimation MRR / 30 par jour depuis plans actifs
- [x] Auth : superadmin ou cron secret (CRON_SECRET env var)
- [x] Upsert dans `admin_daily_metrics` (onConflict: metric_date)
- [x] Build OK

#### Fichiers créés :
- `apps/web/src/app/api/admin/compute-daily-metrics/route.ts` — NOUVEAU

### 10.8 — Alertes et santé — TERMINÉ
- [x] Page `/admin/alerts` : alertes prioritaires avec filtrage par sévérité
- [x] Cartes résumé : total, critique, warning, info
- [x] Alertes auto : trial en expiration, marges basses, utilisateurs inactifs, santé API
- [x] Actions par alerte : boutons contextuels (email, prolonger, voir détail)
- [x] Dismiss individuel par alerte
- [x] Build OK

#### Fichiers créés :
- `apps/web/src/app/[locale]/(admin)/admin/alerts/page.tsx` — NOUVEAU

### 10.9 — Gestion des plans — TERMINÉ
- [x] Section "Répartition des plans" dans la vue d'ensemble admin
- [x] Barres de progression par plan (trial, starter, pro, enterprise) avec couleurs
- [x] MRR par plan + total MRR
- [x] Section "Conversions trial → payant" : taux, temps moyen, plan le plus choisi
- [x] Barre de progression conversion
- [x] Build OK

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(admin)/admin/page.tsx` — ajout PlanManagementSection

### 10.10 — Logs système — TERMINÉ
- [x] Page `/admin/logs` : tableau d'activité avec 200 entrées mock
- [x] Filtres : par action (15 types), par organisation, taille de page (25/50/100)
- [x] Pagination avec navigation
- [x] Badges couleur par type d'action
- [x] Sidebar agrégation : top 10 actions les plus fréquentes (72h)
- [x] Métadonnées affichées (count, recipients, format)
- [x] Build OK

#### Fichiers créés :
- `apps/web/src/app/[locale]/(admin)/admin/logs/page.tsx` — NOUVEAU

### 10.11 — Navigation admin (sidebar, protection) — TERMINÉ
- [x] Lien "Admin" conditionnel dans la sidebar principale (visible si `is_superadmin` dans user_metadata)
- [x] Icône Shield rouge, style distinct des autres liens
- [x] Layout admin avec sidebar dédiée (7 pages + retour app)
- [x] Middleware protège `/admin` (routes protégées existantes)
- [x] Build OK

#### Fichiers modifiés :
- `apps/web/src/components/app/Sidebar.tsx` — ajout lien Admin conditionnel avec Shield icon

### 10.12 — Page utilisateurs — TERMINÉ
- [x] Page `/admin/users` : tableau complet des 24 utilisateurs
- [x] Segments : tous, actifs aujourd'hui, actifs cette semaine, inactifs >7j, inactifs >30j
- [x] Tri : nom, dernière connexion, emails classifiés, coût/mois
- [x] Filtre par organisation (dropdown)
- [x] Recherche texte (nom, email, organisation)
- [x] Badges rôle (admin/member), avatars initiales
- [x] Opacité réduite pour utilisateurs inactifs
- [x] Build OK

#### Fichiers créés :
- `apps/web/src/app/[locale]/(admin)/admin/users/page.tsx` — NOUVEAU

### 10.13 — Page revenus & coûts — TERMINÉ
- [x] Page `/admin/finances` : analyse financière CANTAIA
- [x] 4 cards résumé : MRR, ARR, coûts API, marge nette
- [x] Graphique "Revenus vs Coûts" (LineChart) avec sélecteur 30j/90j
- [x] Coûts par module : 6 catégories avec barres de progression colorées
- [x] Détail par plan : BarChart revenus vs coûts + tableau avec marge
- [x] Projection : MRR et ARR projetés à 3 mois (+15% hypothèse)
- [x] Build OK

#### Fichiers créés :
- `apps/web/src/app/[locale]/(admin)/admin/finances/page.tsx` — NOUVEAU

### 10.14 — Données mock réalistes — TERMINÉ
- [x] Module `mock-admin-data.ts` complet : 6 orgs, 24 users, alertes, logs, métriques
- [x] Organisations réalistes (HRS, Implenia, BG, Edifea, Fehlmann, Porr) avec plans variés
- [x] Métriques quotidiennes simulées avec croissance et facteur weekend
- [x] Alertes dynamiques (trial expiry, marges basses, inactifs, santé API)
- [x] Activités aléatoires réalistes (15 types d'actions)
- [x] Toutes les pages admin fonctionnent avec ces données mock

### 10.15 — Configuration admin — TERMINÉ
- [x] Page `/admin/settings` : configuration globale de la plateforme
- [x] Section "Tarifs API" : input/output Anthropic, Whisper, taux USD→CHF
- [x] Section "Plans et tarifs" : prix et max users par plan (trial/starter/pro/enterprise)
- [x] Section "Seuils d'alerte" : marge basse, inactivité, trial expiry, erreurs API, coûts
- [x] Boutons Save (avec feedback vert) et Reset
- [x] Build OK

#### Fichiers créés :
- `apps/web/src/app/[locale]/(admin)/admin/settings/page.tsx` — NOUVEAU

### 10.16 — Traductions i18n — TERMINÉ
- [x] 120+ clés admin traduites en FR, EN, DE
- [x] Toutes les pages admin utilisent `useTranslations("admin")`
- [x] Labels d'actions (15 types), métriques, filtres, colonnes, sections
- [x] Build OK

### Fichiers clés modifiés à l'étape 5 :
- `apps/web/src/lib/mock-data.ts` — EmailWithReadStatus, is_read, lots CFC, MockUser, extractedTasks, aiReplies, detailedSummaries, DisplayMode
- `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` — EmailDetailPanel, lu/non-lu, filtre projet, sélection multiple, briefing IA
- `apps/web/src/components/app/EmailDetailPanel.tsx` — NOUVEAU : panneau détail email 5 sections
- `apps/web/src/components/app/Sidebar.tsx` — Badge dynamique unread, lien Direction, getNavItems()
- `apps/web/src/app/[locale]/(app)/settings/page.tsx` — Toggle mode mono/multi-projets
- `apps/web/src/app/[locale]/(app)/direction/page.tsx` — NOUVEAU : vue Direction avec tableau projets
- `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx` — Suppression dark:text-white
- `packages/database/types.ts` — Ajout rôle 'director' dans UserRole
- `apps/web/messages/fr.json` / `en.json` / `de.json` — Clés pour toutes les nouvelles features

### Fichiers clés modifiés à l'étape 4 :
- `apps/web/src/lib/mock-data.ts` — 18 emails, budgets PME, pluralize(), getEmailsByProject()
- `apps/web/src/components/app/Sidebar.tsx` — Inbox icon, bg-slate-50, rounded-md, nav simplifiée
- `apps/web/src/app/[locale]/(app)/layout.tsx` — bg-white, pas de dark:
- `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` — Inbox complet (filtres, recherche, panneau latéral)
- `apps/web/src/app/[locale]/(app)/projects/page.tsx` — Style pro, pluralize
- `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx` — rounded-md, couleurs atténuées
- `apps/web/src/app/[locale]/(app)/projects/[id]/settings/page.tsx` — champ outlook_folder
- `apps/web/src/app/[locale]/(app)/settings/page.tsx` — Section Outlook (toggle + connect)
- `apps/web/src/app/api/outlook/archive/route.ts` — Stub POST (501)
- `apps/web/src/app/api/outlook/folders/route.ts` — Stub GET (501)
- `apps/web/messages/fr.json` / `en.json` / `de.json` — Toutes clés à jour

### Notes techniques :
- Unused import `Link` supprimé de dashboard/page.tsx (erreur build corrigée)
- Le dashboard utilise `classificationConfig` pour mapper icons/couleurs par type d'email
- Les stubs API Outlook retournent 501 avec structure JSON (prêts pour Microsoft Graph)
- `Simplify<>` wrapper nécessaire pour les types DB (interfaces vs Record<string, unknown>)
- SSR client Supabase : type assertion `(supabase as any)` pour mutations (bug @supabase/ssr v0.5.2)

---

## Étape 11 : Clôture de chantier & PV de réception — EN COURS (2026-02-18)

### 11.1 — Migration SQL : Tables de clôture et réserves — TERMINÉ
- [x] Migration `010_project_closure.sql` : 3 tables (project_receptions, reception_reserves, closure_documents)
- [x] `project_receptions` : type (provisional/final/partial), participants JSONB, lots_reception JSONB, garanties 2y/5y, clause juridique SIA 118
- [x] `reception_reserves` : description, localisation, lot, gravité (minor/major/blocking), statut (open→verified), photos correction
- [x] `closure_documents` : type (pv_reception, guarantee_certificate, final_invoice, as_built_plans, etc.)
- [x] Index sur project_id, reception_id, status
- [x] RLS : organization_id based policies
- [x] Types TypeScript : ProjectReception, ReceptionReserve, ClosureDocument + Insert types + Database schema
- [x] Enums : ReceptionType, ReceptionStatus, ReserveSeverity, ReserveStatus, ClosureDocumentType
- [x] ProjectStatus enrichi : +on_hold, +closing
- [x] StatusBadge : +on_hold (orange), +closing (purple)
- [x] Build OK : 35 pages, 31 API routes, 0 erreurs

#### Fichiers créés :
- `packages/database/migrations/010_project_closure.sql` — NOUVEAU

#### Fichiers modifiés :
- `packages/database/types.ts` — +6 enums, +3 interfaces, +3 Insert types, +3 Database schema entries, ProjectStatus +on_hold +closing
- `packages/ui/src/components/shared/StatusBadge.tsx` — +on_hold, +closing variants

### 11.2 — Workflow de clôture de chantier — TERMINÉ
- [x] Bouton "Terminer le chantier" dans page projet détail (onglet Clôture)
- [x] Onglet Clôture visible si statut active/on_hold/closing/completed
- [x] Boutons contextuels : "Terminer" (active/on_hold), "Continuer" (closing), "Voir" (completed)
- [x] Page /projects/[id]/closure : workflow 6 étapes avec barre de progression
- [x] Étape 1 : vérification tâches (auto-query mockTasks)
- [x] Étape 2 : vérification emails (auto-query mockEmails)
- [x] Étape 3 : dernier PV finalisé (auto-query mockMeetings)
- [x] Étape 4 : PV de réception généré (lien vers /closure/reception)
- [x] Étape 5 : PV signé uploadé — BLOQUANT (lien vers /closure/upload-signed)
- [x] Étape 6 : documents de clôture (optionnel, lien vers /closure/documents)
- [x] Bouton "Terminer le chantier" grisé tant que étapes 1-5 incomplètes
- [x] Mock data : 3 réceptions, 8 réserves, 4 documents de clôture
- [x] Helpers : getReceptionByProject, getReservesByProject, getClosureDocumentsByProject, getOpenReservesCount, getVerifiedReservesCount
- [x] i18n FR/EN/DE : namespace `closure` (~100 clés), clés projets tab_closure/startClosure/continueClosure/viewClosure
- [x] Build OK : 36 pages, 31 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/app/[locale]/(app)/projects/[id]/closure/page.tsx` — NOUVEAU : workflow 6 étapes

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx` — Onglet Clôture + bouton contextuel
- `apps/web/src/lib/mock-data.ts` — mockReceptions, mockReserves, mockClosureDocuments + helpers
- `apps/web/messages/fr.json` / `en.json` / `de.json` — ~100 clés closure + projets

### 11.3 — Génération PV de réception — TERMINÉ
- [x] Page /projects/[id]/closure/reception : formulaire complet de préparation
- [x] Type de réception : provisoire / partielle / définitive (radio buttons)
- [x] Date + lieu (pré-rempli depuis adresse projet)
- [x] Participants pré-remplis depuis la dernière séance (toggle présent, ajout/suppression)
- [x] Lots pré-remplis depuis mockLots : CFC code, entreprise, montant contractuel
- [x] Montant final éditable + pourcentage d'écart calculé auto
- [x] Statut par lot : Accepté / Avec réserves / Refusé
- [x] Si "Avec réserves" → formulaire réserves inline (description, localisation, gravité, deadline)
- [x] Route POST `/api/projects/closure/generate-pv` : génère document Word (docx)
- [x] Document structuré : titre, type réception, infos projet, participants (table), lots (table avec totaux), réserves, clause SIA 118, dates garantie 2y/5y, signatures
- [x] Tables colorées (header bleu #1E3A5F), statuts colorés, gravité colorée
- [x] Download automatique du .docx après génération
- [x] Build OK : 37 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/app/[locale]/(app)/projects/[id]/closure/reception/page.tsx` — NOUVEAU : formulaire réception
- `apps/web/src/app/api/projects/closure/generate-pv/route.ts` — NOUVEAU : génération Word PV réception

### 11.4 — Upload et vérification du PV signé — TERMINÉ
- [x] Page /projects/[id]/closure/upload-signed : interface d'upload complète
- [x] Zone drag & drop (border dashed, highlight on drag)
- [x] Bouton "Parcourir les fichiers" + sélection fichier
- [x] Validation : formats PDF/JPG/PNG, taille max 20MB, taille min 10KB (pas vide)
- [x] Preview image si fichier image (max-height 256px)
- [x] Bouton "Prendre une photo" (ouvre caméra mobile via `input capture="environment"`)
- [x] Affichage nom + taille du fichier sélectionné + bouton supprimer
- [x] Bouton "Uploader" avec loading spinner
- [x] État succès avec CheckCircle vert + redirect vers /closure
- [x] Mock upload (console.log), prêt pour API Supabase Storage
- [x] Build OK : 38 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/app/[locale]/(app)/projects/[id]/closure/upload-signed/page.tsx` — NOUVEAU

### 11.5 — Suivi des réserves post-réception — TERMINÉ
- [x] Page /projects/[id]/reserves : tableau de suivi avec barre de progression
- [x] Tableau 6 colonnes : Réf (R-001), Description, Lot/CFC, Gravité, Deadline, Statut
- [x] Gravité avec badges colorés : mineur (🟡 amber), majeur (🔴 orange), bloquant (🔴 rouge)
- [x] Statuts : ouverte, en cours, corrigée, levée (vérifiée), litige — avec icônes et couleurs
- [x] Réserves en retard surlignées en rouge + ⚠️
- [x] Panneau détail latéral au clic : description, localisation, lot, entreprise, deadline, notes correction, dates
- [x] Actions depuis le panneau : "Marquer comme corrigée" (+ textarea notes), "Marquer comme vérifiée", "Signaler un litige"
- [x] Quand toutes vérifiées : message vert + bouton "Générer le PV de levée des réserves"
- [x] Mock actions (console.log), prêt pour API
- [x] Build OK : 39 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/app/[locale]/(app)/projects/[id]/reserves/page.tsx` — NOUVEAU

### 11.6 — Alertes de garantie — TERMINÉ
- [x] Composant `GuaranteeAlerts` réutilisable (compact + full mode)
- [x] Fonction `computeGuaranteeAlerts()` : calcul automatique des alertes
- [x] Garantie 2 ans : alertes à 3 mois (warning), 1 mois (danger), jour J (danger), expirée (danger)
- [x] Garantie 5 ans : même logique
- [x] Réserves en retard : deadline dépassée (danger)
- [x] Réserves non traitées > 30 jours : alerte relance entreprise (warning)
- [x] Tri par sévérité (danger en premier)
- [x] Mode compact (3 alertes max, truncate) pour panneau droit/briefing
- [x] Mode full avec dates de fin, jours restants/dépassés
- [x] Filtrage par projectId (optionnel)
- [x] Build OK : 39 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/components/closure/GuaranteeAlerts.tsx` — NOUVEAU

### 11.7 — Vue Direction enrichie : Clôture et garanties — TERMINÉ
- [x] Section "Clôture et garanties" dans la page /direction
- [x] Badge compteur d'alertes (danger rouge / warning ambre) à côté du titre
- [x] Tableau "Projets en cours de clôture" : projet, conducteur, PV signé (✓/✗), réserves ouvertes, barre de progression
- [x] Tableau "Garanties actives" : projet, date réception, fin 2 ans, fin 5 ans, niveau d'alerte (Urgent/Attention/OK)
- [x] Alertes calculées via `computeGuaranteeAlerts()` depuis réceptions signées
- [x] Statuts on_hold/closing ajoutés dans la carte des couleurs de la table projets
- [x] i18n FR/EN/DE : 20 nouvelles clés dans namespace `direction` (closureSection, closureProjects, activeGuarantees, etc.)
- [x] Build OK : 39 pages, 32 API routes, 0 erreurs

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/direction/page.tsx` — Section clôture & garanties complète
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +20 clés direction

### 11.8 — Navigation et intégration — TERMINÉ
- [x] Badge réserves ouvertes sur l'onglet Clôture (pastille rouge avec count)
- [x] Onglet Clôture enrichi : info réception (type, date, statut réserves) + lien vers /reserves + GuaranteeAlerts
- [x] Briefing quotidien : section "Alertes de garantie" en mode compact intégrée
- [x] Workflow de clôture : bannière réserves ouvertes avec lien "Voir les réserves"
- [x] i18n FR/EN/DE : +5 clés (receptionPVTitle, viewReserves, reservesBanner)
- [x] Build OK : 39 pages, 32 API routes, 0 erreurs

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx` — Badge closure tab + info réception + GuaranteeAlerts
- `apps/web/src/app/[locale]/(app)/projects/[id]/closure/page.tsx` — Bannière réserves + lien
- `apps/web/src/app/[locale]/(app)/briefing/page.tsx` — GuaranteeAlerts compact
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +5 clés closure

### 11.9 — Données mock réalistes — TERMINÉ
- [x] 3 nouveaux projets ajoutés à mockProjects :
  - `proj-morges` — Parking Morges (status: completed, avec PV signé + réserves partiellement levées)
  - `proj-ems` — EMS Lausanne Beaumont (status: completed, PV signé, garantie 2 ans approchant)
  - `proj-cedres` — Résidence Les Cèdres Phase 2 (status: closing, PV non encore signé, 5 réserves ouvertes)
- [x] mockUsers mis à jour : user-001 gère proj-morges + proj-cedres, user-002 gère proj-ems
- [x] Les receptions, réserves et documents de clôture existants sont maintenant liés à des projets réels
- [x] Direction page : projets en clôture et garanties maintenant correctement peuplés
- [x] Build OK : 39 pages, 32 API routes, 0 erreurs

#### Fichiers modifiés :
- `apps/web/src/lib/mock-data.ts` — +3 projets (proj-morges, proj-ems, proj-cedres) + mockUsers project_ids

### 11.10 — Traductions i18n FR/EN/DE — TERMINÉ
- [x] Vérification complète : 119 clés closure + 37 clés direction identiques dans FR/EN/DE
- [x] Corrections : 5 chaînes hardcodées françaises remplacées par des clés i18n
  - Reserves page : "Corrigée le", "Vérifiée le", placeholder textarea
  - Upload-signed page : "Supprimer"
  - GuaranteeAlerts : "+N alertes"
- [x] Nouvelles clés ajoutées : correctionPlaceholder, correctedAt, verifiedAt, removeFile, moreAlerts (×3 langues)
- [x] Build OK : 39 pages, 32 API routes, 0 erreurs

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/projects/[id]/reserves/page.tsx` — 3 chaînes → i18n
- `apps/web/src/app/[locale]/(app)/projects/[id]/closure/upload-signed/page.tsx` — 1 chaîne → i18n
- `apps/web/src/components/closure/GuaranteeAlerts.tsx` — 1 chaîne → i18n
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +5 clés closure

---

## ÉTAPE 11 TERMINÉE — Clôture de chantier & PV de réception

### Résumé
- **10 sous-étapes complétées** (11.1 → 11.10)
- **Nouvelles pages** : 4 (closure workflow, reception form, upload-signed, reserves)
- **Nouvelles API** : 1 (generate-pv Word document)
- **Nouveau composant** : GuaranteeAlerts (compact + full mode)
- **Nouveaux types** : 6 enums, 3 interfaces, 3 Insert types
- **Mock data** : 3 réceptions, 8 réserves, 4 documents de clôture, 3 projets de clôture
- **i18n** : ~130 clés closure + ~20 clés direction × 3 langues
- **Build** : 39 pages, 32 API routes, 0 erreurs TypeScript

---

## Étape 12 : Extracteur de Plans Intelligent — TERMINÉ (2026-02-18)

### 12.1 — Migration SQL : Tables de gestion des plans — TERMINÉ
- [x] Migration `011_plan_registry.sql` : 3 tables (plan_registry, plan_versions, plan_version_alerts)
- [x] `plan_registry` : plan_number, plan_title, plan_type, discipline, lot, zone, scale, format, auteur, statut
- [x] `plan_versions` : version_code, version_number, fichier, source, analyse IA, validation, distribution JSONB
- [x] `plan_version_alerts` : alert_type (outdated_reference, missing_distribution, approval_pending, version_conflict)
- [x] 6 index, RLS policies, 8 nouveaux enums TypeScript
- [x] 3 interfaces : PlanRegistry, PlanVersion, PlanVersionAlert + helper PlanDistributionRecipient
- [x] 3 Insert types + 3 Database schema entries
- [x] ApiActionType enrichi : +plan_detect, +plan_version_check
- [x] Build OK : 39 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `packages/database/migrations/011_plan_registry.sql` — NOUVEAU

#### Fichiers modifiés :
- `packages/database/types.ts` — +8 enums, +4 interfaces, +3 Insert types, +3 DB schema, +8 enum entries

### 12.2 — Détection automatique des plans dans les emails — TERMINÉ
- [x] Service `plan-detector.ts` : détection de plans dans les pièces jointes d'emails
- [x] Pré-filtre rapide : extensions (PDF/DWG/DXF/PNG/JPG), taille > 500KB, patterns nom de fichier
- [x] 12 patterns de noms de fichier typiques de plans de construction (211-B2-04, ARC-301, V-A, RevB, etc.)
- [x] Mots-clés email : "plan", "mise à jour", "révision", "BAE", "BPE", etc.
- [x] Exclusions : facture, offre, soumission, courrier, PV
- [x] Prompt Claude complet pour analyse IA (indices plan vs non-plan)
- [x] Mock detection basée sur analyse du nom de fichier (prêt pour Claude API)
- [x] Devinette de discipline (structure, architecture, CVC, électricité, sanitaire, façades)
- [x] Stub version-checker.ts (implémenté en 12.5)
- [x] Build OK : 39 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `packages/core/src/plans/plan-detector.ts` — Service de détection de plans
- `packages/core/src/plans/version-checker.ts` — Stub vérificateur de versions
- `packages/core/src/plans/index.ts` — Exports du module plans

### 12.3 — Registre de plans — Page principale — TERMINÉ
- [x] Entrée "Plans" ajoutée dans la Sidebar (icône Map, entre Tâches et Séances)
- [x] Clé nav "plans" ajoutée en FR/EN/DE
- [x] Page `/plans` avec vue liste (tableau triable) et vue grille (cards)
- [x] 4 compteurs stats : plans, versions, alertes obsolètes, en attente approbation
- [x] Recherche textuelle (numéro, titre, auteur)
- [x] 3 filtres dropdown : projet, discipline, statut
- [x] Tri par colonnes cliquables (numéro, titre, discipline, version, date, statut) avec icônes asc/desc
- [x] Vue grille : cards avec numéro, titre, projet, discipline, zone, échelle, version, date
- [x] Mode d'affichage persisté dans localStorage (`cantaia_plans_view`)
- [x] 8 plans mock inline (remplacés en 12.10)
- [x] Badges colorés par discipline (architecture=bleu, structure=orange, CVC=cyan, etc.)
- [x] Badges statut avec icônes (actif=vert, remplacé=gris, approbation=ambre, rejeté=rouge)
- [x] État vide avec illustration
- [x] Namespace i18n "plans" : 56 clés (FR/EN/DE)
- [x] Build OK : 40 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/app/[locale]/(app)/plans/page.tsx` — Page registre de plans (liste + grille)

#### Fichiers modifiés :
- `apps/web/src/components/app/Sidebar.tsx` — Ajout nav "Plans" (Map icon)
- `apps/web/messages/fr.json` — +1 clé nav, +56 clés namespace "plans"
- `apps/web/messages/en.json` — +1 clé nav, +56 clés namespace "plans"
- `apps/web/messages/de.json` — +1 clé nav, +56 clés namespace "plans"

### 12.4 — Page détail d'un plan — Historique des versions — TERMINÉ
- [x] Page `/plans/[id]` avec header complet (numéro, titre, statut, projet, discipline, lot, zone, échelle, format, auteur)
- [x] Version courante mise en avant (bandeau bleu, bouton télécharger)
- [x] Actions header : nouvelle version, distribuer
- [x] 2 onglets : Versions, Informations
- [x] Onglet Versions : timeline inversée (plus récente en haut)
  - Badge version (A, B, C…) avec couleur (courante=brand, autres=gris)
  - Source : auto-détecté (IA avec confiance %), upload manuel, email
  - Modifications IA détectées (bandeau ambre)
  - Statut validation (icône + badge) : en attente, approuvé, rejeté, pour info
  - Distribution : nombre de destinataires, liste détaillée sur version courante
- [x] Onglet Info : grille de métadonnées (numéro, titre, projet, discipline, lot, zone, échelle, format, auteur, date)
  - Notes et tags
- [x] 2 plans mock détaillés (plan-001 avec 3 versions, plan-002 avec 2 versions)
- [x] +22 clés i18n ajoutées au namespace "plans" (FR/EN/DE)
- [x] Page "plan introuvable" si ID invalide
- [x] Build OK : 41 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/app/[locale]/(app)/plans/[id]/page.tsx` — Page détail plan + historique versions

#### Fichiers modifiés :
- `apps/web/messages/fr.json` — +22 clés plans (detail page)
- `apps/web/messages/en.json` — +22 clés plans (detail page)
- `apps/web/messages/de.json` — +22 clés plans (detail page)

### 12.5 — Détection de références à des versions obsolètes — TERMINÉ
- [x] Implémentation complète de `version-checker.ts` : détection regex de références à des plans
- [x] 5 patterns regex : plan + indice, plan + version, code + rev/version, "selon/cf/voir plan" sans version, idem pour codes courts
- [x] Fonction `extractPlanReferences()` : extraction plan_number + version + contexte depuis texte
- [x] Fonction `checkPlanReferences()` enrichie : compare version référencée vs version courante
  - Version obsolète → severity "critical"
  - Référence sans version → severity "warning"
  - Version courante → severity "warning" (tracking)
- [x] Composant `PlanReferenceAlert` : affichage des alertes (mode normal et compact)
  - Mode normal : bandeau rouge par alerte critique (icône, détail, contexte, risque)
  - Mode compact : une ligne résumé (nombre d'alertes)
  - Alertes info-level (bleu) pour références sans version
- [x] Export `./plans` ajouté dans `@cantaia/core/package.json`
- [x] +4 clés i18n (FR/EN/DE) : outdatedPlanRef, outdatedVersionAlert, planRefDetail, planRefsFound
- [x] Build OK : 41 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/components/plans/PlanReferenceAlert.tsx` — Composant alerte références obsolètes

#### Fichiers modifiés :
- `packages/core/src/plans/version-checker.ts` — Implémentation complète (regex + mock checker)
- `packages/core/src/plans/index.ts` — Exports enrichis (extractPlanReferences, ExistingPlan)
- `packages/core/package.json` — Export `./plans` ajouté
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +4 clés plans (alerts)

### 12.6 — Upload manuel de plans — TERMINÉ
- [x] Page `/plans/upload` : formulaire complet d'upload manuel
- [x] Zone drag & drop : fichier plan (PDF, DWG, DXF, PNG, JPG)
- [x] Analyse IA simulée : extraction automatique du numéro de plan et version depuis le nom de fichier
- [x] Badge "Analyse IA..." avec animation pendant l'analyse
- [x] Formulaire : projet*, numéro*, titre*, type, discipline, version, lot, zone, échelle, format, auteur (entreprise + nom), notes
- [x] Validation : bouton désactivé tant que champs requis non remplis
- [x] État upload simulé (redirect vers /plans après succès)
- [x] +14 clés i18n (FR/EN/DE)
- [x] Build OK : 42 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/app/[locale]/(app)/plans/upload/page.tsx` — Page upload manuel

#### Fichiers modifiés :
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +14 clés plans (upload)

### 12.7 — Distribution de plans — TERMINÉ
- [x] Composant `PlanDistributeModal` : modale de distribution via Outlook
- [x] Liste de destinataires pré-remplie depuis la distribution précédente
- [x] Checkboxes : sélection/désélection individuelle des destinataires
- [x] Ajout de nouveaux destinataires (nom, entreprise, email) avec Enter ou bouton +
- [x] Suppression de destinataires
- [x] Message personnalisé (textarea) avec placeholder contextuel
- [x] Indication du fichier joint
- [x] État d'envoi simulé (spinner + "Envoi en cours...")
- [x] Confirmation succès (CheckCircle vert, auto-fermeture)
- [x] +15 clés i18n (FR/EN/DE)
- [x] Build OK : 42 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/components/plans/PlanDistributeModal.tsx` — Modale distribution

#### Fichiers modifiés :
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +15 clés plans (distribution)

### 12.8 — Alertes et notifications plans — TERMINÉ
- [x] Composant `PlanAlertsBanner` : affichage des alertes plan
- [x] 4 types d'alertes : version obsolète (critique), distribution manquante, approbation en attente, conflit de version
- [x] 3 niveaux de sévérité : critical (rouge), warning (ambre), info (bleu)
- [x] Mode normal : liste d'alertes avec icône, type, message, projet, lien vers plan
- [x] Mode compact : badge résumé avec compteur (pour briefing/dashboard)
- [x] Tri par sévérité (critiques en premier)
- [x] Limitation maxAlerts avec lien "voir plus"
- [x] 4 alertes mock réalistes (référence obsolète, approbation, distribution manquante, conflit)
- [x] +6 clés i18n (FR/EN/DE)
- [x] Build OK : 42 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `apps/web/src/components/plans/PlanAlertsBanner.tsx` — Composant alertes plans

#### Fichiers modifiés :
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +6 clés plans (alerts)

### 12.9 — Vue projet onglet Plans — TERMINÉ
- [x] Onglet "Plans" ajouté dans la page projet détail (entre PV de séance et Clôture)
- [x] Icône Map, label traduit en FR/EN/DE
- [x] Contenu : header avec titre + description + lien "Voir tous les plans"
- [x] Placeholder visuel avec icône Map + texte "Les plans de ce projet apparaîtront ici"
- [x] +5 clés i18n ajoutées au namespace "projects" (FR/EN/DE) : tab_plans, plansTitle, plansDescription, viewAllPlans, plansProjectPlaceholder
- [x] Build OK : 42 pages, 32 API routes, 0 erreurs

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx` — Onglet Plans ajouté
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +5 clés projects (plans tab)

### 12.10 — Données mock réalistes plans — TERMINÉ
- [x] 12 plans mock réalistes répartis sur 4 projets (Cèdres: 5, Malley: 3, Morges: 3, EMS: 1)
- [x] Disciplines variées : structure (3), architecture (4), CVC (1), électricité (2), sanitaire (1), façades (1)
- [x] Statuts variés : active (8), for_approval (1), approved (1), superseded (1), rejected (1)
- [x] Interface `MockPlan` exportée + données `mockPlans` exportées
- [x] Helpers : `getPlansByProject()`, `getPlanById()`, `getPlanCount()`
- [x] Import type PlanDiscipline/PlanStatus depuis @cantaia/database
- [x] Build OK : 42 pages, 32 API routes, 0 erreurs

#### Fichiers modifiés :
- `apps/web/src/lib/mock-data.ts` — +MockPlan interface, +12 mock plans, +3 helpers

### 12.11 — Intégration emails, PV, tâches, briefing, clôture — TERMINÉ
- [x] Briefing page : ajout `PlanAlertsBanner` compact après les garanties
- [x] Direction page : ajout `PlanAlertsBanner` (max 3 alertes) en bas de page
- [x] Plans page : remplacement des 8 plans inline par les 12 plans centralisés de `mock-data.ts`
- [x] Build OK : 42 pages, 32 API routes, 0 erreurs

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/briefing/page.tsx` — Import + PlanAlertsBanner compact
- `apps/web/src/app/[locale]/(app)/direction/page.tsx` — Import + PlanAlertsBanner section
- `apps/web/src/app/[locale]/(app)/plans/page.tsx` — Utilise mockPlans centralisés

### 12.12 — Traductions i18n FR/EN/DE plans — TERMINÉ
- [x] Vérification complète : 114 clés dans le namespace "plans" — identiques FR/EN/DE
- [x] Vérification : 5 clés tab_plans dans le namespace "projects" — identiques FR/EN/DE
- [x] Aucune chaîne française codée en dur dans les composants plans
- [x] Couverture traduction : 100%
- [x] Build OK : 42 pages, 32 API routes, 0 erreurs

---

## Étape 13 : Soumissions & Intelligence Tarifaire Cross-Chantiers — EN COURS (2026-02-21)

### X.1 — Migration SQL : Tables Soumissions, Fournisseurs, Offres, Prix — TERMINÉ
- [x] Migration `012_submissions_pricing.sql` : 11 tables créées
  - `suppliers` : annuaire central fournisseurs (scoring, spécialités, certifications, stats)
  - `submissions` : descriptifs/appels d'offres par projet (workflow Kanban 8 statuts)
  - `submission_lots` : lots CFC d'une soumission
  - `submission_chapters` : chapitres (sous-division d'un lot)
  - `submission_items` : postes unitaires à chiffrer (normalisation cross-chantiers)
  - `price_requests` : demandes de prix envoyées (tracking, relances, portail fournisseur)
  - `supplier_offers` : offres reçues (multi-round négociation)
  - `offer_line_items` : prix unitaires par poste (cœur intelligence tarifaire)
  - `pricing_alerts` : alertes cross-chantiers (7 types, 3 sévérités)
  - `negotiations` : historique négociation par round
  - `email_templates` : templates d'emails multilingues (7 types)
- [x] 30+ index (GIN sur specialties, composite sur cfc_subcode)
- [x] RLS policies pour les 11 tables (pattern organization_id = auth.uid())
- [x] 12 nouveaux enums TypeScript : SupplierStatus, SubmissionStatus, SubmissionSourceType, SubmissionLotStatus, PriceRequestStatus, SupplierOfferStatus, OfferLineItemStatus, PricingAlertType, PricingAlertSeverity, PricingAlertStatus, EmailTemplateType
- [x] 11 nouvelles interfaces TypeScript : Supplier, Submission, SubmissionLot, SubmissionChapter, SubmissionItem, PriceRequest, SupplierOffer, OfferLineItem, PricingAlert, Negotiation, EmailTemplate
- [x] 11 Insert types + 11 Database schema entries
- [x] ApiActionType enrichi : +submission_parse, +offer_parse, +supplier_match, +negotiation_email
- [x] Build OK : 42 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `packages/database/migrations/012_submissions_pricing.sql` — NOUVEAU : 11 tables + index + RLS

#### Fichiers modifiés :
- `packages/database/types.ts` — +12 enums, +11 interfaces, +11 Insert types, +11 DB schema, +4 ApiActionType

### X.2 — Annuaire Fournisseurs (CRUD, scoring auto, page /suppliers) — TERMINÉ
- [x] Service `packages/core/src/suppliers/supplier-service.ts` : calcul scoring, filtrage, spécialités (18 corps de métier), zones géo suisses
- [x] Export `@cantaia/core/suppliers` dans package.json
- [x] 5 fournisseurs mock réalistes : Holcim (82, preferred), Implenia (78, active), Losinger (87, preferred), ETAVIS (75, active), Sika (85, active)
- [x] 2 soumissions mock : Cèdres GO (awarded), PULSE CVC (comparing)
- [x] 6 lots mock, 8 postes mock, 6 demandes de prix mock, 3 alertes pricing mock
- [x] Helpers : getSupplierById, getSubmissionsByProject, getSubmissionById, getLotsBySubmission, etc.
- [x] Page `/suppliers` : liste tableau (6 colonnes), filtres (spécialité, zone, statut, recherche), panneau détail latéral
- [x] Panneau détail : score/100, étoiles, contact, spécialités, CFC, certifications, stats, notes
- [x] Sidebar : 3 nouvelles entrées (Soumissions/FileSpreadsheet, Fournisseurs/Building2, Intelligence Prix/TrendingUp)
- [x] i18n FR/EN/DE : +3 nav keys, ~60 clés suppliers, ~120 clés submissions, ~25 clés pricing
- [x] Build OK : 43 pages, 32 API routes, 0 erreurs

#### Fichiers créés :
- `packages/core/src/suppliers/supplier-service.ts` — Service fournisseurs (scoring, filtres, spécialités)
- `packages/core/src/suppliers/index.ts` — Exports module
- `apps/web/src/app/[locale]/(app)/suppliers/page.tsx` — Page annuaire fournisseurs

#### Fichiers modifiés :
- `packages/core/package.json` — Export `./suppliers` ajouté
- `apps/web/src/lib/mock-data.ts` — +5 suppliers, +2 submissions, +6 lots, +8 items, +6 price_requests, +3 pricing_alerts, +8 helpers
- `apps/web/src/components/app/Sidebar.tsx` — 3 entrées navigation (submissions, suppliers, pricingIntelligence)
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +3 nav, ~205 clés (suppliers + submissions + pricing)

### X.3 — Import & Parsing IA des Soumissions — TERMINÉ
- [x] Service `packages/core/src/submissions/submission-parser.ts` : prompt Claude (buildSubmissionParsePrompt), mock parser, confidence stats
- [x] Service `packages/core/src/submissions/supplier-matcher.ts` : mapping CFC→spécialité, algorithme matching (spécialité 40pts, score 25pts, response 15pts, preferred 10pts, geo 10pts)
- [x] Export `@cantaia/core/submissions` dans package.json
- [x] Types : ParsedSubmission, ParsedLot, ParsedChapter, ParsedItem, ParsedProjectInfo
- [x] Page `/submissions/new` : formulaire 3 étapes (upload → parsing → validation)
  - Upload fichier drag & drop (PDF, XLSX, DOCX, CSV, TXT)
  - Zone copier-coller texte pour devis
  - Simulation parsing IA (2s delay, mock data réaliste)
  - Vue validation : confiance IA (high/medium/low), lots expandables, postes détaillés

### X.4 — Dashboard Soumissions — Vue Kanban + Liste — TERMINÉ
- [x] Page `/submissions` : vue Kanban 8 colonnes (draft → archived) + vue liste tableau
- [x] Kanban cards : dot couleur projet, titre, lots, réponses fournisseurs, montant, deadline
- [x] Vue liste : 7 colonnes (titre, projet, référence, lots, statut, deadline, total)
- [x] Persistance vue localStorage (`cantaia_submissions_view`)
- [x] Filtres : recherche texte + projet
- [x] Page `/submissions/[id]` : vue détail avec 7 onglets
  - Items : lots expandables, tableau postes (code, description, unité, qté, prix estimé, prix unitaire, total)
  - Tracking : tableau demandes de prix (fournisseur, envoyé, ouvert, répondu, relances, statut)
  - Intelligence : alertes pricing avec sévérité (critical/warning/info), impacts financiers, actions
  - Suppliers/Comparison/Negotiation/Documents : placeholders avec icônes
- [x] Build OK : 47 pages, 32 API routes, 0 erreurs TypeScript

#### Fichiers créés :
- `packages/core/src/submissions/submission-parser.ts` — Parser + prompt IA + mock
- `packages/core/src/submissions/supplier-matcher.ts` — Matching fournisseurs ↔ lots
- `packages/core/src/submissions/index.ts` — Exports module
- `apps/web/src/app/[locale]/(app)/submissions/page.tsx` — Dashboard Kanban + Liste
- `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx` — Détail soumission 7 onglets
- `apps/web/src/app/[locale]/(app)/submissions/new/page.tsx` — Import/parsing soumission

#### Fichiers modifiés :
- `packages/core/package.json` — Export `./submissions` ajouté

### X.5 — Matching IA fournisseur ↔ postes (recommandations par lot) — TERMINÉ
- [x] Onglet "Fournisseurs" dans détail soumission : recommandations IA par lot
- [x] Score de pertinence 0-100% avec barre visuelle (vert ≥80, ambre ≥60, gris sinon)
- [x] Tags raisons : Spécialité, Code CFC, Score élevé, Réponse fiable, Préféré, Local
- [x] Checkbox de sélection par fournisseur/lot + "Sélectionner tous les recommandés"
- [x] Bouton "Envoyer demandes de prix" avec compteur de sélection
- [x] Infos fournisseur : score/100, taux de réponse, zone géo, étoile préféré, déjà contacté
- [x] i18n FR/EN/DE : +7 clés (reasonSpecialty/Cfc/HighScore/Reliable/Preferred/Local, noRecommendations)
- [x] Build OK : 47 pages, 32 API routes, 0 erreurs TypeScript

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx` — Onglet suppliers complet (matching IA)
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +7 clés submissions

### X.6 — Génération & envoi demandes de prix (templates multilingues, modal envoi) — TERMINÉ
- [x] Service `price-request-generator.ts` : templates FR/EN/DE pour demandes de prix
- [x] Templates relances (3 rounds) : polie J+3, urgente J+5, dernière J+7
- [x] API route `/api/submissions/send-price-request` : génération + envoi mock
- [x] Modal envoi dans détail soumission : sélection deadline, langue, prévisualisation email
- [x] Résumé destinataires avec badges fournisseurs sélectionnés
- [x] Animation envoi (idle → sending → sent) avec reset automatique
- [x] Build OK : 47 pages, 33 API routes, 0 erreurs TypeScript

#### Fichiers créés :
- `packages/core/src/submissions/price-request-generator.ts` — Templates emails multilingues (prix + 3 relances)
- `apps/web/src/app/api/submissions/send-price-request/route.ts` — API route envoi demandes de prix

#### Fichiers modifiés :
- `packages/core/src/submissions/index.ts` — Export price-request-generator
- `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx` — Modal envoi demandes de prix

### X.7 — Relances automatiques (suivi enrichi, timeline, J+3/J+5/J+7) — TERMINÉ
- [x] Onglet "Suivi" enrichi : cards par demande de prix (remplace tableau basique)
- [x] Border-left coloré par statut (vert répondu, bleu ouvert, ambre envoyé, rouge en retard)
- [x] Timeline : date envoi, date ouverture, date réponse, jours écoulés (J+N)
- [x] Schedule relances visuelles : J+3 (polie), J+5 (urgente), J+7 (dernière)
- [x] Badges fait/en attente/prochain pour chaque palier de relance
- [x] Badge "En retard" (overdue) quand deadline dépassée
- [x] Bouton "Désactiver la relance" par fournisseur
- [x] Barre résumé : compteur répondus + en attente
- [x] Templates relances intégrés dans price-request-generator.ts (3 rounds FR/EN/DE)
- [x] Build OK : 47 pages, 33 API routes, 0 erreurs TypeScript

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx` — Onglet tracking enrichi

### X.8+X.9 — Réception offres + Tableau comparatif multi-fournisseurs — TERMINÉ
- [x] 3 offres fournisseurs mock (Holcim awarded, Implenia rejected, Losinger rejected)
- [x] 9 lignes d'offre mock (3 postes × 3 fournisseurs) avec prix unitaires réalistes
- [x] Onglet "Comparatif" : tableau interactif par lot
  - Colonnes : description + unité + quantité + 1 colonne par fournisseur + écart max
  - Cellule la moins chère en vert bold, la plus chère en rouge
  - Écart max coloré (vert ≤5%, ambre 5-15%, rouge >15%)
  - Footer avec total par fournisseur (moins cher en vert bold)
  - Badge "(Adjugé)" sur le fournisseur retenu
  - Tableau scrollable horizontalement, colonne description sticky
- [x] Helpers : getOffersBySubmission, getOfferLineItems, getOfferLineItemsByItem
- [x] Build OK : 47 pages, 33 API routes, 0 erreurs TypeScript

#### Fichiers créés :
- (Aucun nouveau fichier)

#### Fichiers modifiés :
- `apps/web/src/lib/mock-data.ts` — +3 offers, +9 offer line items, +3 helpers
- `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx` — Onglet comparatif complet

### X.10 — Négociation assistée IA (onglet négociation, KPIs, cards offres) — TERMINÉ
- [x] Onglet "Négociation" dans détail soumission
- [x] KPIs en haut : nombre offres, adjudications, économies (%)
- [x] Cards par offre fournisseur : montant, réduction, dates, conditions, round de négo
- [x] Bordure verte pour adjugé, rouge pour rejeté, bleu pour en cours
- [x] Boutons actions : "Générer email" + "Lancer négociation" pour offres non adjugées
- [x] Infos détaillées : date réception, validité, conditions de paiement, texte conditions

### X.11+X.12 — Intelligence Tarifaire Cross-Chantiers + Page dédiée — TERMINÉ
- [x] Page `/pricing-intelligence` : 3 onglets (Alertes, Benchmark, Top Fournisseurs)
- [x] Onglet Alertes : affichage alertes actives avec sévérité, messages, % écart, impact financier, actions
- [x] Onglet Benchmark : tableau 10 postes avec min/médian/max, tendance 6 mois, nb points de données
  - Recherche par poste ou code CFC
  - Tendance colorée (rouge hausse, vert baisse)
  - Données benchmark mock réalistes (béton, acier, isolation, électricité, CVC)
- [x] Onglet Top Fournisseurs : classement 5 fournisseurs avec score, compétitivité, réponse, projets
- [x] Sidebar : lien `/pricing-intelligence` avec icône TrendingUp
- [x] Build OK : 48 pages, 33 API routes, 0 erreurs TypeScript

#### Fichiers créés :
- `apps/web/src/app/[locale]/(app)/pricing-intelligence/page.tsx` — Page intelligence tarifaire

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx` — Onglet négociation complet

### X.14 — Vue projet onglet Soumissions — TERMINÉ
- [x] Onglet "Soumissions" dans la vue détail projet (entre Meetings et Plans)
- [x] Liste des soumissions liées au projet avec lien vers détail
- [x] Infos affichées : titre, référence, nombre de lots, montant estimé, deadline, statut
- [x] Badge statut coloré (draft/published/received/comparing/awarded/cancelled)
- [x] État vide avec placeholder si aucune soumission
- [x] Bouton "Nouvelle" → lien vers `/submissions/new`
- [x] i18n FR/EN/DE : clé `tab_submissions` dans namespace "projects"
- [x] Build OK : 48 pages, 34 API routes, 0 erreurs TypeScript

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/projects/[id]/page.tsx` — Onglet soumissions complet
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +1 clé `tab_submissions`

### X.15 — Intégration avec Dashboard, Briefing, Direction — TERMINÉ
- [x] Dashboard : section "Soumissions actives" dans le panneau latéral (quand aucun email sélectionné)
  - Affiche les soumissions en cours avec deadline, projet associé, badge en retard
  - Maximum 3 soumissions, triées par urgence
- [x] Briefing : section "Soumissions & Prix" après les alertes plans
  - Soumissions avec deadline dans les 7 prochains jours (lien vers détail)
  - Alertes pricing actives (lien vers /pricing-intelligence)
  - Badge "Délai dépassé" (rouge) ou "Délai proche" (ambre)
- [x] Direction : card récapitulative "Soumissions actives" + colonne dans le tableau projets
  - Card indigo avec nombre de soumissions en cours
  - Grille passée de 4 à 5 colonnes
  - Colonne "Soumissions" par projet avec `getSubmissionCount()`
- [x] i18n FR/EN/DE : +8 clés (dashboard: activeSubmissions, briefing: submissionsAlerts/submissionOverdue/submissionDueSoon, direction: activeSubmissions/colSubmissions)
- [x] Build OK : 48 pages, 34 API routes, 0 erreurs TypeScript

#### Fichiers modifiés :
- `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` — Section soumissions dans panneau latéral
- `apps/web/src/app/[locale]/(app)/briefing/page.tsx` — Alertes soumissions + pricing
- `apps/web/src/app/[locale]/(app)/direction/page.tsx` — Card + colonne soumissions
- `apps/web/messages/fr.json` / `en.json` / `de.json` — +8 clés i18n

### X.16 — Données mock réalistes — TERMINÉ
- [x] 5 fournisseurs mock (Holcim, Implenia, Losinger Marazzi, ETAVIS, Sika) avec scores, spécialités, CFC, zones géo
- [x] 2 soumissions mock : Cèdres gros-œuvre (awarded, 2.4M CHF), PULSE CVC (comparing, 890k CHF)
- [x] 6 lots CFC réalistes (211×3, 244, 242, 245)
- [x] 8+ postes unitaires avec quantités et prix réalistes (béton, acier, coffrage, isolation, etc.)
- [x] 6 demandes de prix (envoyées/répondues/en retard)
- [x] 3 alertes pricing actives (acier +12%, isolation +5.4%, dépassement budget)
- [x] 3 offres fournisseurs (1 adjugée, 2 rejetées) avec 9 line items
- [x] 10 postes benchmark intelligence tarifaire (min/median/max, tendance 6 mois)
- [x] Toutes les fonctions helpers : getSubmissionsByProject, getLotsBySubmission, getOffersBySubmission, etc.

### X.17 — Traductions i18n FR/EN/DE — TERMINÉ
- [x] 141 clés namespace "submissions" — FR/EN/DE complets et synchronisés
- [x] 57 clés namespace "suppliers" — FR/EN/DE complets
- [x] 24 clés namespace "pricing" — FR/EN/DE complets
- [x] Clés cross-modules : dashboard (activeSubmissions), briefing (submissionsAlerts, submissionOverdue, submissionDueSoon), direction (activeSubmissions, colSubmissions), projects (tab_submissions)
- [x] Aucune clé manquante entre les 3 langues (vérifié automatiquement)

### Build final Étape 13
- [x] **Build OK : 48 pages, 34 API routes, 0 erreurs TypeScript**
- [x] 17 sous-étapes complétées (X.1 → X.17)
- [x] Module complet : Soumissions + Fournisseurs + Intelligence Tarifaire + Intégrations cross-modules

---

## Étape 18 : Nettoyage données mock, Classification IA intelligente & Archivage local — EN COURS (2026-02-21)

### 18.1 — Suppression de toutes les données mock (empty states propres sur chaque page) — TERMINÉ
- [x] `mock-data.ts` nettoyé : suppression de toutes les données mock (2800→115 lignes), conservé types + utilitaires (formatCurrency, formatDate, getRelativeTime, pluralize)
- [x] `mock-admin-data.ts` supprimé (admin dashboard mock)
- [x] `seed.sql` et `api-usage-mock.sql` supprimés
- [x] 42 fichiers consommateurs mis à jour : tous les imports mock remplacés par tableaux vides typés
- [x] Hooks et contextes nettoyés : `use-supabase-data.ts`, `email-context.tsx` (démarrent avec `[]` au lieu de mock)
- [x] Sidebar : badge tâches à 0 (sera connecté à Supabase)
- [x] Composant `EmptyState` réutilisable créé (`apps/web/src/components/ui/EmptyState.tsx`)
- [x] Inline mocks supprimés : MOCK_PLAN_DETAILS, BENCHMARK_DATA, TOP_SUPPLIERS, getMockBriefing
- [x] Templates emails système CONSERVÉS (dans price-request-generator.ts)
- [x] Codes CFC CONSERVÉS (nomenclature standard suisse)
- [x] Build OK : 48 pages, 34 API routes, 0 erreurs TypeScript

### 18.2 — Classification IA intelligente des emails — Analyse automatique — TERMINÉ
- [x] Migration SQL `013_email_classification_enhanced.sql` : 4 nouvelles colonnes (classification_status, email_category, suggested_project_data, ai_reasoning) + index
- [x] Types DB enrichis : `EmailClassificationStatus` (7 valeurs), `EmailCategory` (5 valeurs), `SuggestedProjectData` interface
- [x] Prompt Claude enrichi avec 3 cas : existing_project, new_project, no_project
- [x] Schema Zod étendu : `match_type`, `suggested_project`, `email_category`, `reasoning`
- [x] Classifier refactoré : retourne `ClassifyEmailResult` enrichi avec confidence 0-1
- [x] Sync route enrichie : gère les 3 cas (auto_classified si >0.85, suggested si 0.50-0.85, new_project_suggested, classified_no_project)
- [x] Classify-email route mise à jour (même logique 3 cas)
- [x] Tracker API usage conservé (action_type: 'email_classify')
- [x] Build OK : 48 pages, 34 API routes, 0 erreurs TypeScript

### 18.3 — Interface de classification — Panneau de suggestions — TERMINÉ
- [x] Composant `ClassificationSuggestions` : panneau collapsible "À traiter" en haut du dashboard
  - Affiche les emails suggested / new_project_suggested / classified_no_project
  - 3 types de lignes : projet existant, nouveau projet, newsletter/spam
  - Boutons : Confirmer, Changer le projet (dropdown searchable), Ignorer
  - Dropdown de sélection de projet avec recherche
- [x] Composant `CreateProjectFromEmailModal` : modale pré-remplie avec données extraites par l'IA
  - Formulaire : nom, code, client, ville (pré-remplis depuis suggested_project_data)
  - Affichage read-only des contacts extraits
- [x] API route `POST /api/emails/confirm-classification` : confirmer / changer projet / rejeter
  - Ajoute automatiquement le sender aux email_senders du projet
- [x] API route `POST /api/emails/create-project-from-email` : crée projet + project_member + classe l'email
- [x] Intégré dans le dashboard (entre summary bar et filtres)
- [x] Build OK : 48 pages, 36 API routes, 0 erreurs TypeScript

### 18.4 — Apprentissage continu de la classification — TERMINÉ
- [x] Migration SQL `014_classification_learning.sql` : table `email_classification_rules` (rule_type, rule_value, project_id, times_confirmed/overridden, confidence_boost, is_active) + RLS
- [x] Type `EmailClassificationRule` + `ClassificationRuleType` dans database/types.ts
- [x] Service `classification-learning.ts` dans `@cantaia/core/emails` :
  - `learnFromClassificationAction()` : crée/met à jour des règles (sender_email, sender_domain, subject_keyword)
  - `checkLocalRules()` : vérifie les règles avant d'appeler Claude (sender email → min 2 confirmations, domain → min 3)
  - Désactivation auto des règles overridden (times_overridden > times_confirmed)
  - Extraction keywords du sujet (stopwords FR/EN filtrés)
- [x] Intégré dans `/api/emails/confirm-classification` : apprentissage sur chaque confirm/correct/reject
- [x] Intégré dans `/api/outlook/sync` : check local rules AVANT appel Claude (continue si match → économie API)
- [x] Export `@cantaia/core/emails` dans package.json
- [x] Build OK : 48 pages, 36 API routes, 0 erreurs TypeScript

### 18.5 — Paramètres de classification — TERMINÉ
- [x] Composant `ClassificationSettingsTab` avec 4 sections :
  - Classification automatique : seuil confiance (dropdown 50-95%), suggestions nouveau projet, auto-classify newsletters
  - Catégories ignorées : Newsletter/Marketing, Spam, Administratif interne (checkboxes)
  - Domaines ignorés : liste pills + ajout inline (défaut: hilti-promo.com, sika-promotions.ch)
  - Domaines mappés : domain → projet avec ajout inline
- [x] Persistance localStorage (`cantaia_classification_settings`)
- [x] Intégré dans settings page comme onglet "Classification" (icône Mail)
- [x] i18n FR/EN/DE : 22 clés par langue
- [x] Build OK : 48 pages, 36 API routes, 0 erreurs TypeScript

### 18.6 — Archivage local automatique des emails — TERMINÉ
- [x] Migration SQL `015_email_archiving.sql` : 5 colonnes sur projects (archive_path, archive_enabled, archive_structure, archive_filename_format, archive_attachments_mode) + table `email_archives` (12 colonnes) + RLS
- [x] Types DB : `ArchiveStructure`, `ArchiveFilenameFormat`, `ArchiveAttachmentsMode`, `EmailArchive` interface
- [x] Service `email-archiver.ts` dans `@cantaia/core/emails` :
  - `getDefaultFolderTree()` : arborescence par défaut (13 dossiers)
  - `determineArchivePath()` : classification heuristique (PV→02_PV, plans→03_Plans, offres→04_Soumissions, etc.)
  - `buildArchiveFolderPrompt()` : prompt Claude pour classification IA des dossiers
  - Support 4 structures : by_category, by_date, by_sender, flat
  - Support 3 formats de nom : date_sender_subject, date_subject, original
  - Détection thématique des PJ (plans, photos, factures → dossier thématique)
  - Helpers : extractCompanyName, sanitizeFilename (accents suisses FR/DE)
- [x] Build OK : 48 pages, 36 API routes, 0 erreurs TypeScript

### 18.7 — Configuration archivage par projet — TERMINÉ
- [x] ArchiveSettingsTab component : toggle activer, dossier racine, structure (4 options), format nom fichier (3 options), pièces jointes (3 modes)
- [x] RadioOption sub-component réutilisable avec badge "recommandé"
- [x] API route POST /api/projects/archive-settings → update project archive columns
- [x] Intégration dans page projet : onglet "Archivage" entre Plans et Clôture
- [x] Bouton "Créer l'arborescence" avec preview alert
- [x] Bouton "Télécharger en ZIP" (placeholder)
- [x] i18n : clé tab_archiving FR/EN/DE
- [x] Build OK : 48 pages, 37 API routes

### 18.8 — Archivage automatique en continu — TERMINÉ
- [x] API route POST /api/emails/archive : archive batch d'emails d'un projet → records email_archives
- [x] API route GET /api/emails/archive-download : manifest JSON (emails + paths + statut archivage)
- [x] Auto-archivage dans sync route : après classification, si project.archive_enabled, crée automatiquement le record email_archives avec path calculé
- [x] Détection Tauri vs Web : @cantaia/core/platform → isTauriDesktop(), getArchiveMode()
- [x] ArchiveSettingsTab amélioré : bouton "Archiver les emails existants" avec loader, stats temps réel (archived/total), refresh
- [x] DB schema types : email_archives + email_classification_rules ajoutés au Database type
- [x] Gestion erreurs : try/catch par email dans sync (un échec n'arrête pas les autres), log warnings
- [x] Build OK : 48 pages, 39 API routes

### 18.9 — Intégration dashboard, briefing, sidebar, notifications, projets — TERMINÉ
- [x] Dashboard : indicateur "X à traiter" dans la barre de résumé (pendingClassification count)
- [x] Dashboard : sync message enrichi avec archivés + nouveaux projets suggérés
- [x] Sidebar : badge inbox = unreadCount + pendingClassificationCount
- [x] Email context : ajout pendingClassificationCount (suggested + new_project_suggested)
- [x] Page projet overview : +2 stats boxes (Emails + Archivés, prêts pour données réelles)
- [x] Build OK : 48 pages, 39 API routes

### 18.10 — Traductions i18n FR/EN/DE — TERMINÉ
- [x] Namespace "classification" : 36 clés (FR/EN/DE) — suggestions, modal création projet, catégories, actions
- [x] Namespace "archiving" : 47 clés (FR/EN/DE) — structure dossiers, format noms, pièces jointes, actions, stats
- [x] ClassificationSuggestions.tsx : 18+ strings internationalisées (CATEGORY_KEYS, getCategoryLabel, SuggestionRow, ProjectDropdown)
- [x] CreateProjectFromEmailModal.tsx : 14 strings internationalisées (titre, champs, placeholders, erreurs)
- [x] ArchiveSettingsTab.tsx : 40+ strings internationalisées (options, labels, boutons, alerts, stats)
- [x] ClassificationSettingsTab.tsx : déjà internationalisé (22 clés settings namespace)
- [x] Build OK : 48 pages, 39 API routes, 0 erreurs TypeScript

## Étape 20 : Super-admin, création d'organisations, sous-domaines, branding admin-only — EN COURS (2026-02-22)

Principe : les organisations sont créées par le super-admin depuis `/super-admin`. Deux niveaux d'admin :
1. **Super-admin** (propriétaire plateforme) → `/super-admin` → crée et gère TOUTES les organisations
2. **Admin d'organisation** (le client) → `/admin` sur son sous-domaine → gère SON organisation

### 20.1 — Migration SQL — Super-admin et organisations — TERMINÉ
- [x] Migration `016_superadmin_organizations.sql` : colonnes organizations (subdomain, custom_domain, status, plan, phone, website, display_name, branding JSONB, settings JSONB, notes, created_by)
- [x] Table `organization_invites` (email, first_name, last_name, role, job_title, token, message, invited_by, status, expires_at, accepted_at)
- [x] Index (subdomain, status, plan, invites org/token/email/status) + RLS policies (4 policies sur invites)
- [x] Contrainte subdomain format (regex: `^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$`)
- [x] Types DB : `OrganizationStatus`, `OrganizationPlan`, `InviteStatus`, `InviteRole`, `OrganizationBranding`, `OrganizationInvite` + insert types + Database schema
- [x] Utilise `is_superadmin` existant (pas de nouvelle colonne users)
- [x] Build OK : 48 pages, 29 API routes, 0 erreurs TypeScript

### 20.2 — Page super-admin cockpit (/super-admin) — TERMINÉ
- [x] Route group `(super-admin)` avec layout dédié : sidebar sombre (bg-gray-900), accent amber, badge "Super Admin"
- [x] 6 items navigation : Dashboard, Organisations, Utilisateurs, Facturation, Métriques, Config
- [x] Middleware : `/super-admin` ajouté aux routes protégées + vérification `is_superadmin` dans layout (redirect `/dashboard` si non-superadmin)
- [x] Dashboard plateforme : 8 cartes métriques (orgs, users, projets, emails, IA calls, MRR, stockage, orgs actives)
- [x] Activité récente depuis `admin_activity_logs` (10 dernières entrées)
- [x] i18n FR/EN/DE : namespace "superAdmin" (~120 clés par langue)
- [x] Build OK : 50 pages, 29 API routes, 0 erreurs TypeScript

### 20.3 — Création d'organisations depuis super-admin — TERMINÉ
- [x] Page `/super-admin/organizations` : liste enrichie (status badge, subdomain, plan, member/project counts, actions suspend/edit/stats)
- [x] Page `/super-admin/organizations/create` : wizard 4 étapes (Info → Subdomain/Plan → Branding → Premier admin)
  - Step 1: nom, display name, adresse, ville, code postal, pays, téléphone, site web, notes internes
  - Step 2: subdomain check (API), plan radio (trial/starter/pro/enterprise), limites users/projects
  - Step 3: couleurs (4 color pickers), login message, thème, logo/favicon upload placeholders, mini-preview live
  - Step 4: invitation premier admin (prénom, nom, email, fonction, message)
- [x] Page `/super-admin/organizations/[id]` : détail avec 4 onglets (Overview, Membres, Stats, Facturation)
  - Overview: quick stats, info org, notes internes
  - Membres: liste, invite modal, pending invites (renvoyer/annuler)
  - Suspendre/réactiver + supprimer (double confirmation par nom)
- [x] API route `GET/POST /api/super-admin` : 9 actions (list-organizations, check-subdomain, get-organization, create-organization, update-organization, suspend/unsuspend-organization, delete-organization, send-invite, cancel-invite)
- [x] Vérification super-admin dans chaque API call
- [x] Mots réservés subdomain (26 mots)
- [x] Build OK : 54 pages, 30 API routes, 0 erreurs TypeScript

### 20.4 — Sous-domaines — Résolution et routing — TERMINÉ
- [x] Middleware enrichi : `resolveSubdomain()` extrait subdomain depuis host (production) ou `?org=` / `x-organization-subdomain` (dev)
- [x] Subdomain passé en header `x-organization-subdomain` sur toutes les réponses (API + pages)
- [x] `OrganizationProvider` component : contexte React avec org résolue, branding CSS vars appliquées
- [x] `useOrganization()` hook : `{ organization, subdomain, loading, isBranded }`
- [x] Mots réservés interdits : 17 mots bloqués (www, app, api, admin, etc.)
- [x] API route `GET/POST /api/invites` : vérification token invite + acceptation (crée membership, marque accepted)
- [x] Fallback dev local : `?org=subdomain` query param dans URL
- [x] Redirect login conserve le param `org` en dev
- [x] Build OK : 54 pages, 32 API routes, 0 erreurs TypeScript

### 20.5 — Branding dans admin d'organisation — TERMINÉ
- [x] Layout admin refactoré : nav org-level (Vue d'ensemble, Membres, Personnalisation, Emails, Abonnement, Paramètres) avec accent bleu
- [x] Page `/admin/branding` réécrite : 4 sections avec boutons [Enregistrer] indépendants (Identité, Logos, Couleurs, Page de connexion)
- [x] Hook `useSectionForm` : dirty state, saving, showSaved animation, reset
- [x] Section Couleurs : 4 color pickers + thème radio + mini-preview sidebar live + bouton réinitialiser
- [x] Section Logos : placeholders upload (logo principal + favicon)
- [x] Section Login : upload bg image placeholder + message d'accueil
- [x] OrganisationTab dans /settings simplifié : redirige vers /admin/branding et /admin/members
- [x] i18n admin namespace enrichi : +5 clés (members, customization, emailSettings, subscription, generalSettings) FR/EN/DE
- [x] Build OK : 54 pages, 32 API routes, 0 erreurs TypeScript

### 20.6 — Gestion des membres dans admin d'organisation — TERMINÉ
- [x] /admin/members page: liste membres avec rôles (Admin/Direction/Membre), badges, initiales
- [x] Modale invitation (prénom, nom, email, rôle, message personnalisé)
- [x] Invitations en attente (renvoyer, annuler) avec dates expiration
- [x] Respect limite max_users par organisation
- [x] Redirect /branding → /admin/branding (ancien chemin)
- [x] Build OK — 49 pages, 40 API routes, 0 erreurs

### 20.7 — Page settings membre avec boutons [Enregistrer] — TERMINÉ
- [x] Hook `useFormSection` générique dans `lib/hooks/use-form-section.ts` (dirty state, saving, showSaved, error, reset, setInitial)
- [x] Composant `SaveButton` réutilisable dans `components/settings/SaveButton.tsx`
- [x] 8 onglets : Profil, Langue & Région, Notifications, Connexion Outlook, Classification, Sécurité, Organisation, Abonnement
- [x] Profil : prénom, nom, téléphone, email (read-only), avatar — [Enregistrer] par section
- [x] Langue & Région : langue préférée, format date, fuseau horaire — [Enregistrer] par section
- [x] Notifications : briefing IA (activer, heure, email) + notifications générales — 2 [Enregistrer] indépendants
- [x] Sécurité : reset mot de passe, sessions actives, zone dangereuse, diagnostics
- [x] Bouton grisé par défaut → actif quand dirty → spinner → toast "Enregistré"
- [x] i18n FR/EN/DE complet (nouveaux onglets, sécurité, langue & région)
- [x] Build OK — 49 pages, 40 API routes, 0 erreurs

### 20.8 — Traductions i18n FR/EN/DE — TERMINÉ
- [x] Namespace "superAdmin" : 124 clés FR/EN/DE (cockpit, organisations, création, workflow, branding, invitations)
- [x] Namespace "settings" : onglets restructurés (Profil, Langue, Notifications, Outlook, Classification, Sécurité, Organisation, Abonnement)
- [x] Nouvelles clés sécurité : mot de passe, sessions, zone dangereuse
- [x] Nouvelles clés langue & région : format date, fuseau horaire
- [x] Audit complet : 0 clé manquante dans FR/EN/DE
- [x] Build final OK — 49 pages, 40 API routes, 0 erreurs

---

## Étape 21 : Visite Client Vocale — Enregistrement, rapport IA et création de tâche devis automatique (2026-02-22)

### 21.1 — Migration SQL (table client_visits) — TERMINÉ
- [x] Migration 017_client_visits.sql (table complète avec audio, transcription, rapport JSONB, tâches, statut)
- [x] 5 indexes (org, project, status, date, client_name) + RLS policy
- [x] Types TypeScript : VisitStatus, TranscriptionStatus, ReportStatus, VisitSentiment, VisitClientRequest, VisitMeasurement, VisitBudget, VisitTimeline, VisitReport, ClientVisit, ClientVisitInsert
- [x] Database schema : client_visits table + 4 enums
- [x] Build OK

### 21.2 — Enregistrement vocal (composant AudioRecorder) — TERMINÉ
- [x] AudioRecorder.tsx : MediaRecorder API (WebM/Opus) avec états idle→recording→paused→stopped
- [x] Visualisation waveform temps réel (Canvas + Web Audio API AnalyserNode)
- [x] Timer HH:MM:SS, indicateur niveau micro (volume RMS), tips d'enregistrement
- [x] Pause/Reprise sans perte, Terminer → réécoute avant validation
- [x] Wake Lock API (écran allumé pendant l'enregistrement)
- [x] Permission micro avec gestion refus + retry
- [x] i18n FR/EN/DE : namespace "visits" (~110 clés)
- [x] Build OK

### 21.3 — Transcription (Whisper API) — TERMINÉ
- [x] transcription-service.ts : Whisper API + mock mode, segments horodatés, TranscriptionResult type
- [x] API route /api/visits/transcribe : auth, update visit status, track API usage ($0.006/min)
- [x] Export @cantaia/core/visits dans package.json
- [x] Build OK — 41 API routes

### 21.4 — Génération rapport IA (Claude) — TERMINÉ
- [x] visit-report-generator.ts : prompt Claude structuré (demandes CFC, mesures, contraintes, budget, planning, sentiment, probabilité)
- [x] getMockVisitReport() : rapport de démo réaliste (rénovation cuisine)
- [x] API route /api/visits/generate-report : Claude claude-sonnet-4-20250514 + mock mode + tracking coûts
- [x] Extraction automatique infos client (email, téléphone, adresse)
- [x] Build OK — 42 API routes

### 21.5 — Création automatique de tâches — TERMINÉ
- [x] Tâche "Établir devis" automatique (5 jours ouvrés, priorité basée sur urgence)
- [x] Tâches next_steps (saute le devis déjà créé, deadline 7 jours)
- [x] Proposition création projet si prospect (closing_probability > 0.5)
- [x] Lien quote_task_id sur client_visits
- [x] Build OK

### 21.6 — Page visites clients (/visits) — TERMINÉ
- [x] Page /visits : liste avec status badges, budget, probabilité, nombre de demandes
- [x] 6 filtres (Toutes, En cours, Rapport prêt, Devis envoyé, Signé, Perdu)
- [x] Barre stats (visites, devis envoyés, signés, CA, taux conversion)
- [x] Sidebar : entrée "Visites clients" (icône UserCheck)
- [x] Build OK — 51 pages

### 21.7 — Flux nouvelle visite — TERMINÉ
- [x] Écran 1 : infos client/prospect, adresse, projet lié, notes pré-visite
- [x] Écran 2 : AudioRecorder avec waveform + création record Supabase
- [x] Écran 3 : post-enregistrement (transcrire+rapport ou sauvegarder sans)
- [x] Upload audio Supabase Storage + appels API transcribe + generate-report
- [x] Build OK

### 21.8 — Page détail visite / rapport — TERMINÉ
- [x] 4 onglets (Rapport, Transcription, Tâches, Documents)
- [x] Rapport structuré : résumé, demandes client (par priorité haute/moyenne/basse), mesures, contraintes, budget, planning, prochaines étapes, concurrents, analyse IA (probabilité closing)
- [x] Transcription : affichage paragraphes
- [x] Tâches : chargement Supabase (source_type = "client_visit"), deadline, priorité, statut
- [x] Documents : fichier audio + PDF rapport
- [x] Actions statut (Devis envoyé, Gagné, Perdu) + re-génération rapport
- [x] Build OK

### 21.9 — Export rapport Word (branding organisation) — TERMINÉ
- [x] API route /api/visits/export-report : génération .docx avec docx library
- [x] Document professionnel : titre, infos client, résumé, demandes par priorité (CFC), mesures (table), contraintes, budget, planning, prochaines étapes, concurrents, analyse IA
- [x] Branding organisation dynamique (primary_color, nom org dans footer)
- [x] Upload automatique Supabase Storage + update report_pdf_url
- [x] Bouton export fonctionnel sur page détail (download blob)
- [x] Documents tab : téléchargement audio + rapport depuis Storage
- [x] i18n : 3 nouvelles clés (download, reportDocument, noDocuments) FR/EN/DE
- [x] Build OK — 43 API routes

### 21.10 — Intégrations (briefing, projets, sidebar) — TERMINÉ
- [x] Briefing : section "Visites récentes" (visites en cours / rapport prêt, chargées depuis Supabase)
- [x] Projet détail : onglet "Visites" ajouté (placeholder avec lien vers /visits)
- [x] Sidebar : entrée "Visites" déjà présente (icône UserCheck, lien /visits)
- [x] i18n : 6 nouvelles clés (tab_visits, visitsPlaceholder, viewAllVisits, recentVisits) FR/EN/DE
- [x] Build OK

### 21.11 — Traductions i18n FR/EN/DE — TERMINÉ
- [x] Audit : 110 clés "visits" identiques dans les 3 langues (FR/EN/DE)
- [x] 3 clés "projects" (tab_visits, visitsPlaceholder, viewAllVisits) dans les 3 langues
- [x] 1 clé "nav" (visits) dans les 3 langues
- [x] Aucune clé manquante

## Étape 22 : Refonte complète Landing Page — Pro, moderne, accrocheur (2026-02-22)

### 22.1 — Fix bugs (i18n pricing, erreurs Next.js) — TERMINÉ
- [x] Vérifié : toutes les clés i18n pricing existent dans FR/EN/DE (namespace "pricing" + "landing.pricing")
- [x] Build : 0 erreurs, 0 warnings
- [x] Témoignages : supprimé les vrais noms d'entreprises (Batigroup, Implenia, Losinger Marazzi) → remplacé par initiales et types génériques
- [x] Build OK

### 22.2+22.3 — Nouvelle structure landing + Design premium — TERMINÉ
- [x] Police Plus Jakarta Sans (Google Fonts) dans layout.tsx
- [x] 10 sections rewritten: Hero, Problème, Features (13 modules), Spotlight Intelligence Tarifaire, Comment ça marche, Preuves sociales, Tarifs, FAQ (12 questions), CTA final avec formulaire démo
- [x] Header scroll-aware (transparent → solid), Footer dark 4 colonnes, liens légaux
- [x] Animations: Framer Motion whileInView, compteurs animés (IntersectionObserver), hover effects, staggered grid
- [x] Design premium: backgrounds sombres (#0F172A, #0A0F1A), gradients amber/gold, badges "Exclusif"
- [x] Mobile-first responsive (grid adaptatif, menu hamburger animé)
- [x] i18n: ~200+ clés par langue dans namespace "landing" (FR/EN/DE)
- [x] Nettoyage: supprimé SolutionSection.tsx et TestimonialsSection.tsx (obsolètes)
- [x] Build OK : 0 erreurs

### 22.4 — Mockup dashboard dans le hero — TERMINÉ
- [x] Mini sidebar (logo B, icônes navigation : projets, emails, tâches, PV, visites, stats)
- [x] Stats animées (3 KPI cards : projets, tâches, PV)
- [x] Activity feed avec indicateur "Live" pulsant et timestamps
- [x] Bar chart animé (staggered Framer Motion, 12 barres)
- [x] i18n : 9 clés mockup ajoutées dans FR/EN/DE (mockStat1-3, mockActivity, mockFeed1-4, mockChart)
- [x] Build OK : 0 erreurs

### 22.5 — Pages légales stubs — TERMINÉ
- [x] `/legal/cgv` : 6 sections (Objet, Abonnements, Paiement, Résiliation, Responsabilité, Juridiction)
- [x] `/legal/privacy` : 6 sections (Données collectées, Utilisation, Hébergement CH, Sous-traitants, Droits, Contact)
- [x] `/legal/mentions` : 4 sections (Éditeur, Hébergement, Propriété intellectuelle, Crédits)
- [x] i18n : namespace "legal" complet FR/EN/DE (~48 clés × 3 langues)
- [x] Intégrées dans le layout marketing (Header + Footer)
- [x] Build OK : 52 pages, 0 erreurs

### 22.6 — i18n complet FR/EN/DE — TERMINÉ
- [x] Audit complet : 200 clés "landing" + 38 clés "legal" présentes dans FR/EN/DE
- [x] Zéro clé manquante dans aucune langue
- [x] Tous les appels t() des 11 composants landing + 3 pages légales résolvent vers des clés existantes
- [x] 3 clés orphelines identifiées (problem.stat, finalCta.contactEmail/Phone) — inoffensives
- [x] Build OK : 52 pages, 43 API routes, 0 erreurs
- **Étape 23 TERMINÉE** : Multi-provider — authentification et synchronisation emails (9 sous-étapes)

## Étape 23 : Multi-provider — authentification et synchronisation emails — TERMINÉ

### 23.1 — Migration SQL email_connections + auth_provider — TERMINÉ
- [x] Migration `018_email_connections.sql` : table `email_connections` (provider, OAuth tokens, IMAP/SMTP credentials, état, sync config)
- [x] Colonnes `auth_provider` et `auth_provider_id` ajoutées à `users`
- [x] Index sur user_id, organization_id, provider, status
- [x] RLS policy `user_email_connections`
- [x] Types TypeScript : `EmailConnection`, `EmailConnectionInsert` dans `@cantaia/database`
- [x] Table `email_connections` ajoutée au `Database` interface
- [x] `UserInsert` mis à jour avec les nouveaux champs optionnels
- [x] Build OK

### 23.2 — Authentification multi-provider — TERMINÉ
- [x] `signInWithGoogleAction()` dans actions.ts (OAuth Google avec scopes Gmail)
- [x] Composant `GoogleButton.tsx` (logo Google SVG, loading state, gestion erreur)
- [x] Login page restructurée : OAuth buttons (Microsoft + Google) en haut, séparateur "ou", formulaire email/password en bas
- [x] Register page restructurée : même layout que login
- [x] Auth callback mis à jour : détecte le provider (azure→microsoft, google, email), stocke `auth_provider` + `auth_provider_id` sur users
- [x] Auth callback crée une `email_connection` automatiquement lors du premier OAuth (Microsoft ou Google)
- [x] Backward compat : les tokens Microsoft sont toujours écrits dans les colonnes legacy `microsoft_access_token`
- [x] i18n : `loginWithGoogle` + mise à jour `loginWithMicrosoft` → "Continuer avec" (FR/EN/DE)
- [x] Build OK

### 23.3 — Provider Gmail (Gmail API) — TERMINÉ
- [x] `GmailProvider` dans `packages/core/src/emails/providers/gmail-provider.ts`
- [x] fetchEmails : GET /messages + GET /messages/{id} (full format), parsing headers/body/attachments
- [x] sendEmail : POST /messages/send avec message RFC 2822 encodé base64url
- [x] replyToEmail : envoi avec threadId pour le threading
- [x] moveEmail : POST /messages/{id}/modify (addLabelIds, removeLabelIds)
- [x] createProjectFolder : POST /labels (format `CANTAIA/{projectName}`)
- [x] markAsRead : POST /messages/{id}/modify (removeLabelIds: UNREAD)
- [x] refreshToken : POST oauth2.googleapis.com/token (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
- [x] getEmailBody, getAttachments
- [x] Build OK

### 23.4 — Provider IMAP/SMTP (générique) — TERMINÉ
- [x] `ImapProvider` dans `packages/core/src/emails/providers/imap-provider.ts`
- [x] fetchEmails via ImapFlow (connexion IMAP, fetch source, simpleParser)
- [x] sendEmail via Nodemailer (SMTP transport)
- [x] moveEmail : IMAP MOVE avec uid
- [x] createProjectFolder : IMAP CREATE (`CANTAIA/{projectName}`)
- [x] markAsRead : IMAP STORE +FLAGS (\\Seen)
- [x] testConnection : test IMAP connexion + SMTP verify
- [x] `KNOWN_PROVIDERS` pré-remplis : Infomaniak, Hostpoint, OVH, Bluewin (host, port, sécurité)
- [x] Chiffrement AES-256-CBC (`encryptPassword`, `decryptPassword`) avec `EMAIL_ENCRYPTION_KEY`
- [x] Dépendances installées : imapflow, nodemailer, mailparser, @types/nodemailer, @types/mailparser
- [x] Build OK

### 23.6 — Abstraction provider (Strategy pattern) — TERMINÉ
- [x] Interface `EmailProvider` dans `email-provider.interface.ts` (fetchEmails, sendEmail, replyToEmail, moveEmail, createProjectFolder, markAsRead, testConnection, refreshToken, getEmailBody, getAttachments)
- [x] Types communs : `RawEmail`, `EmailDraft`, `EmailAttachment`, `EmailConnection`
- [x] `MicrosoftProvider` wrappant graph-client.ts existant
- [x] Factory `getEmailProvider(provider)` → retourne le bon provider
- [x] Helper `isTokenExpired(expiresAt)` avec buffer 5 min
- [x] Exports depuis `@cantaia/core/emails` (providers, factory, helpers, encryption)
- [x] Build OK

### 23.5 — UI Paramètres connexion email — TERMINÉ
- [x] `IntegrationsTab.tsx` réécrit : sélection multi-provider (Microsoft 365, Gmail, IMAP/SMTP)
- [x] Vue IMAP-select : choix du fournisseur connu (Infomaniak, Hostpoint, OVH, Bluewin) ou config manuelle
- [x] Vue IMAP-config : formulaire IMAP/SMTP complet (serveur, port, sécurité SSL/TLS/none, email, password)
- [x] Bouton "Tester la connexion" avec feedback visuel (success/error)
- [x] Bouton "Enregistrer" activé seulement après test réussi
- [x] État connecté : affiche le provider, l'email, le statut, la dernière sync, le nombre d'emails
- [x] API `GET /api/emails/get-connection` : récupère la connexion active de l'utilisateur
- [x] API `POST /api/emails/test-connection` : teste la connexion IMAP avant sauvegarde
- [x] API `POST /api/emails/save-connection` : sauvegarde la connexion IMAP (chiffrement AES-256)
- [x] API `DELETE /api/emails/save-connection` : déconnecte et nettoie les tokens legacy
- [x] i18n FR/EN/DE : 17 clés ajoutées (emailConnectTitle, emailConnectDesc, emailOtherImap, etc.)
- [x] Build OK

### 23.7 — Sync scheduler multi-provider — TERMINÉ
- [x] Route `/api/outlook/sync` refactorisée : détecte `email_connections` ou fallback legacy Microsoft
- [x] `syncViaProvider()` : sync via `getEmailProvider()` (Microsoft, Google, IMAP) avec `provider.fetchEmails()`
- [x] Refresh automatique des tokens OAuth (Microsoft, Google) via `provider.refreshToken()` + mise à jour DB
- [x] `syncLegacyMicrosoft()` : backward compat pour les utilisateurs sans `email_connections`
- [x] `buildBodyFetcher()` : récupère le body complet via `provider.getEmailBody()` ou legacy Graph API
- [x] Mise à jour `last_sync_at` et `total_emails_synced` sur `email_connections` après chaque sync
- [x] Logs enrichis avec le nom du provider (`email_sync` source, provider dans les détails)
- [x] La route retourne aussi le `provider` utilisé dans la réponse JSON
- [x] Build OK

### 23.8 — Landing page multi-provider messaging — TERMINÉ
- [x] Hero subtitle mis à jour : "Compatible Outlook, Gmail et IMAP" (FR/EN/DE)
- [x] HowItWorks step 2 : "Vous connectez votre messagerie" + "Outlook, Gmail ou IMAP — un clic suffit"
- [x] HowItWorks step 2 : logos providers (Microsoft, Google, IMAP) en dessous du texte
- [x] FAQ q2 : "Quels fournisseurs emails sont supportés ?" + réponse listant tous les providers
- [x] FAQ a4 : mentionner "(Outlook, Gmail ou IMAP)" dans la réponse
- [x] Settings tab label : "Connexion Outlook" → "Connexion Email" (FR/EN/DE)
- [x] Build OK

### 23.9 — i18n FR/EN/DE pour multi-provider — TERMINÉ
- [x] Toutes les clés i18n vérifiées et complètes dans les 3 langues
- [x] Auth : `loginWithGoogle`, `loginWithMicrosoft` (mis à jour avec "Continuer avec")
- [x] Settings : 17 nouvelles clés (emailConnectTitle, emailConnectDesc, emailOtherImap, emailConnecting, emailPrivacyNote, emailSelectImapProvider, emailManualConfig, emailPreFilled, emailImapServer, emailSmtpServer, emailAddress, emailPassword, emailTestConnection, emailSaveConnection, emailConnectionSuccess, emailsSynced, back)
- [x] Landing hero/howItWorks/FAQ : mis à jour pour mentionner "Outlook, Gmail et IMAP" au lieu de "Outlook" seul
- [x] Build OK

## Correction de 6 bugs critiques — TERMINÉ (2026-02-22)

### Bug 3 — User profile not found à la création de projet — CORRIGÉ
- **Cause** : le user existe dans `auth.users` (Supabase Auth) mais pas dans `public.users`
- **Fix** : `/api/projects/create` — ajout d'un fallback auto-create (organisation + user profile) si le user n'existe pas dans la table `users`
- **Fix** : `/api/auth/callback` — extraction metadata améliorée (`first_name`, `last_name`, fallback sur `email`)
- [x] Build OK

### Bug 1 — Redirection login depuis création projet — CORRIGÉ
- **Cause** : le middleware ne rafraîchissait les cookies session Supabase que pour les routes protégées, pas pour toutes les requêtes. Si le token expirait entre deux navigations, la route suivante échouait.
- **Fix** : `middleware.ts` — `getUser()` appelé sur CHAQUE requête (pas seulement les routes protégées), garantissant un rafraîchissement continu des cookies de session
- [x] Build OK

### Bug 4 — Connexion Outlook perdue après redirection — CORRIGÉ
- **Cause** : dans le callback auth, l'ancien `email_connection` était supprimé AVANT l'insertion du nouveau. Si l'insertion échouait, la connexion était perdue.
- **Fix** : `/api/auth/callback` — l'insertion est maintenant effectuée en premier, puis les anciennes connexions sont supprimées seulement si l'insertion réussit. Ajout de la gestion d'erreurs sur l'insertion.
- [x] Build OK

### Bug 6 — Création de projet ne sauvegarde pas — CORRIGÉ
- **Cause** : la page `/projects` utilisait un tableau vide hardcodé (`const projects: Array<...> = []`), ne récupérant jamais les données depuis Supabase
- **Fix** : `projects/page.tsx` — utilisation de `useProjects(organizationId)` et `useUserProfile(userId)` pour charger les projets réels depuis Supabase. Ajout d'un état loading avec spinner.
- [x] Build OK

### Bug 5 — Calendrier ne met pas à jour le mois — N/A
- Aucun composant calendrier scrollable avec header mois n'existe dans le codebase. Les seuls inputs date sont des `<input type="date">` natifs HTML.

### Bug 2 — Mots-clés emails auto-générés — CORRIGÉ
- **Fix** : `projects/new/page.tsx` — ajout d'un `useEffect` qui génère automatiquement des mots-clés à partir du nom du projet, code, et nom du client
- Keywords auto-générés affichés en amber (différenciés des manuels en brand color)
- Stop words exclus (le, la, de, du, etc.)
- Keywords manuels préservés lors du re-calcul automatique via `useRef`
- Indication visuelle "Mots-clés générés automatiquement" avec icône Sparkles
- i18n : clé `emailKeywordsAuto` ajoutée en FR/EN/DE
- [x] Build OK

---

## Module Mail — Gestion intelligente des emails de chantier — EN COURS (2026-02-27)

**Philosophie** : Classer ≠ traiter. L'IA fait le tri (projet, catégorie) mais l'email reste visible et "à traiter" tant que l'utilisateur n'a pas agi. L'inbox Cantaia est une to-do list intelligente groupée par projet et catégorie.

- [x] MAIL.1 — Migration SQL + Types + Rename
  - Migration `019_mail_module.sql` : rename email_records→emails, add 25+ new columns (triage_status, process_action, category_id, provider fields, body_text/html, search_vector, etc.)
  - New tables: email_categories, outlook_folders, email_preferences
  - Altered: email_classification_rules (added category_id)
  - email_connections already covers email_accounts spec (no changes needed)
  - French full-text search trigger (tsvector with weighted fields)
  - RLS policies on all new tables
  - TypeScript types updated: Email interface (EmailRecord kept as alias), EmailCategoryRecord, OutlookFolder, EmailPreferences, TriageStatus, ProcessAction enums
  - Renamed `.from("email_records")` → `.from("emails")` in 18 source files (44 occurrences)
  - Build OK
- [ ] MAIL.2 — Connexion email (OAuth Microsoft Graph + IMAP fallback, page settings)
- [ ] MAIL.3 — Synchronisation (delta query Graph, IMAP fetch, cron 5 min)
- [ ] MAIL.4 — Pipeline classification IA (3 niveaux : règles → spam → Claude, toujours "unprocessed")
- [ ] MAIL.5 — Page emails repensée (to-do list par projet + catégories entreprise, onglets)
- [ ] MAIL.6 — Actions de traitement (Lu RAS, Répondre, Tâche, Transférer, Snooze, Import, Ignorer)
- [ ] MAIL.7 — Panneau prévisualisation (contenu, PJ, analyse IA, actions contextuelles)
- [ ] MAIL.8 — Envoi/réponse (Graph sendMail + SMTP fallback, éditeur rich text)
- [ ] MAIL.9 — Archivage auto (Supabase Storage, .eml + PJ, structure par projet)
- [ ] MAIL.10 — Recherche full-text (tsvector français, filtres avancés, highlighting)
- [ ] MAIL.11 — Gestion dossiers Outlook (création auto CANTAIA/*, déplacement, sync bidirectionnelle)
- [ ] MAIL.12 — Apprentissage continu (règles locales, renforcement, objectif 80% sans IA)
- [ ] MAIL.13 — Raccourcis clavier (j/k, E, R, T, F, S, O, P, X, Ctrl+E batch)
- [ ] MAIL.14 — Intégrations (sidebar badge, dashboard widget, liste projets compteur, toasts)
- [ ] MAIL.15 — Vue emails par projet (fils de conversation, groupement thread)
- [ ] MAIL.16 — Traductions i18n FR/EN/DE
