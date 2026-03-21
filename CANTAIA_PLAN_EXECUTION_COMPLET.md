# CANTAIA — Plan d'Exécution Lancement

> Ce document contient les instructions Claude Code pour chaque phase.
> Exécute UNE SEULE PHASE à la fois.
> Ne passe à la phase suivante que quand la précédente est terminée et testée.
> Chaque phase est indépendante — tu peux les donner à Claude Code séparément.

---

# ═══════════════════════════════════════════════════════════
# PHASE 1 — INFRASTRUCTURE FIABLE (Semaine 1)
# ═══════════════════════════════════════════════════════════

## Prompt Claude Code — Phase 1

```
Lis cette instruction en entier avant de commencer.
Tu vas fiabiliser l'infrastructure de CANTAIA en 4 étapes.
Ne code aucune feature. Tu sécurises ce qui existe.

═══════════════════════════════════════
ÉTAPE 1.1 — SENTRY (Monitoring d'erreurs)
═══════════════════════════════════════

1. Installe le SDK Sentry pour Next.js :
   npm install @sentry/nextjs

2. Initialise Sentry :
   npx @sentry/wizard@latest -i nextjs

3. Configure les fichiers créés par le wizard :
   - sentry.client.config.ts
   - sentry.server.config.ts
   - sentry.edge.config.ts

4. Dans chaque fichier de config Sentry, configure :
   - dsn : process.env.SENTRY_DSN
   - environment : process.env.NODE_ENV
   - tracesSampleRate : 0.1 en production (10% des transactions)
   - replaysSessionSampleRate : 0 (pas de replay pour économiser)
   - replaysOnErrorSampleRate : 1.0 (replay uniquement sur erreur)

5. Crée le fichier app/global-error.tsx :
   - C'est l'error boundary global de Next.js
   - Il doit capturer l'erreur avec Sentry.captureException()
   - Afficher un écran d'erreur propre avec le message :
     "Une erreur est survenue. Notre équipe a été notifiée."
   - Un bouton "Retour au dashboard" qui redirige vers /dashboard

6. Crée le fichier app/not-found.tsx :
   - Page 404 avec le design CANTAIA (Navy, Gold, Parchment)
   - Message : "Page introuvable"
   - Bouton "Retour au dashboard"

7. Ajoute un wrapper Sentry sur TOUTES les routes API existantes.
   Cherche tous les fichiers route.ts dans app/api/ :

   Pour chaque route API, le pattern est :
   - Wrap le handler dans un try/catch
   - Dans le catch : Sentry.captureException(error)
   - Retourner une réponse JSON d'erreur propre au lieu de crasher
   - Logger le contexte : org_id, user_id, route, timestamp

   Ne modifie PAS la logique métier des routes.
   Ajoute UNIQUEMENT le try/catch + Sentry.

   Exemple de pattern à appliquer :

   ```typescript
   import * as Sentry from '@sentry/nextjs';

   export async function POST(req: Request) {
     try {
       // ... code existant inchangé ...
     } catch (error) {
       Sentry.captureException(error, {
         extra: {
           route: '/api/xxx',
           timestamp: new Date().toISOString(),
         },
       });
       return Response.json(
         { error: 'Une erreur interne est survenue' },
         { status: 500 }
       );
     }
   }
   ```

8. Ajoute SENTRY_DSN dans .env.local (comme placeholder) :
   SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

9. Vérifie que le build compile sans erreur après les modifications.

═══════════════════════════════════════
ÉTAPE 1.2 — RÉGIONS VERCEL
═══════════════════════════════════════

1. Ouvre le fichier vercel.json (crée-le s'il n'existe pas).

2. Configure les régions pour que TOUT tourne en Europe :

   {
     "regions": ["fra1"],
     "functions": {
       "app/api/**/*.ts": {
         "maxDuration": 60
       }
     }
   }

   fra1 = Francfort, Allemagne. C'est le datacenter le plus proche
   de la Suisse sur Vercel.

3. Pour les routes API qui font des appels IA lourds
   (classification email, génération PV, analyse plans, chat),
   augmente le maxDuration :

   {
     "functions": {
       "app/api/email/classify/**": { "maxDuration": 120 },
       "app/api/meetings/generate-pv/**": { "maxDuration": 300 },
       "app/api/plans/**": { "maxDuration": 300 },
       "app/api/chat/**": { "maxDuration": 120 }
     }
   }

   Adapte les chemins aux vrais chemins des routes dans le projet.

4. Vérifie dans next.config.js qu'il n'y a pas de configuration
   de région qui override vercel.json.

═══════════════════════════════════════
ÉTAPE 1.3 — WEBHOOKS EMAIL (Microsoft Graph)
═══════════════════════════════════════

C'est le chantier le plus important de la Phase 1.
Tu remplaces le polling CRON par des notifications push.

1. Trouve le système actuel de sync email :
   - Cherche les fichiers CRON / sync / poll / fetch dans app/api/email/
   - Identifie comment les emails sont récupérés actuellement
   - Note le fichier et la logique pour ne rien casser

2. Crée la route webhook Microsoft Graph :
   Fichier : app/api/webhooks/microsoft-graph/route.ts

   Cette route doit gérer 2 cas :

   CAS A — Validation du webhook (GET ou POST avec validationToken) :
   Microsoft envoie un validationToken à l'inscription.
   La route doit retourner le token en text/plain avec status 200.

   CAS B — Notification de nouvel email (POST avec value[]) :
   Microsoft envoie un payload avec les notifications.
   Pour chaque notification :
   - Extraire le subscriptionId et le resource
   - Vérifier que le clientState correspond à notre secret
   - Déclencher la classification de l'email
     (réutiliser la logique existante de sync/classify)

   Pattern :

   ```typescript
   export async function POST(req: Request) {
     const url = new URL(req.url);
     const validationToken = url.searchParams.get('validationToken');

     // Cas A : Validation
     if (validationToken) {
       return new Response(validationToken, {
         status: 200,
         headers: { 'Content-Type': 'text/plain' },
       });
     }

     // Cas B : Notification
     const body = await req.json();
     const notifications = body.value || [];

     for (const notification of notifications) {
       // Vérifier le clientState
       if (notification.clientState !== process.env.GRAPH_WEBHOOK_SECRET) {
         continue;
       }

       // Traiter la notification en arrière-plan
       // Ne PAS await ici pour répondre vite à Microsoft (< 3 secondes)
       processEmailNotification(notification).catch((err) => {
         Sentry.captureException(err);
       });
     }

     return Response.json({ status: 'ok' }, { status: 202 });
   }
   ```

3. Crée la fonction d'inscription au webhook :
   Fichier : lib/email/graph-subscription.ts

   ```typescript
   // Crée un abonnement Microsoft Graph pour les nouveaux emails
   // Documentation : https://learn.microsoft.com/en-us/graph/webhooks

   async function createMailSubscription(userId: string, accessToken: string) {
     const subscription = {
       changeType: 'created',
       notificationUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/microsoft-graph`,
       resource: 'me/mailFolders/inbox/messages',
       expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 jours max
       clientState: process.env.GRAPH_WEBHOOK_SECRET,
     };

     const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
       method: 'POST',
       headers: {
         'Authorization': `Bearer ${accessToken}`,
         'Content-Type': 'application/json',
       },
       body: JSON.stringify(subscription),
     });

     return response.json();
   }

   // Renouvelle un abonnement avant expiration
   async function renewSubscription(subscriptionId: string, accessToken: string) {
     // PATCH /subscriptions/{id} avec nouvelle expirationDateTime
   }
   ```

4. Crée un CRON de renouvellement des abonnements :
   Fichier : app/api/cron/renew-subscriptions/route.ts

   Les abonnements Graph expirent après 3 jours max.
   Ce CRON tourne toutes les 12h et renouvelle les abonnements
   qui expirent dans les 24 prochaines heures.

   C'est le SEUL CRON email qui reste. Le CRON de polling est supprimé
   ou gardé uniquement comme fallback de sécurité (fréquence réduite
   à 1x par heure au lieu de toutes les 5 minutes).

5. Modifie le flux d'onboarding / connexion OAuth :
   Quand un utilisateur connecte son compte Microsoft,
   APRÈS avoir obtenu le token OAuth, appelle createMailSubscription()
   pour activer les notifications push.
   Stocke le subscriptionId dans la table users ou email_accounts.

6. Ajoute les variables d'environnement :
   GRAPH_WEBHOOK_SECRET=cantaia_webhook_secret_[random_string]

7. NE SUPPRIME PAS le CRON de polling existant.
   Réduis sa fréquence à 1x par heure et garde-le comme filet de sécurité
   au cas où un webhook est manqué (ça arrive).

═══════════════════════════════════════
ÉTAPE 1.4 — RATE LIMITING ET COST CAPPING
═══════════════════════════════════════

1. Crée une table Supabase pour le tracking d'usage IA :
   Fichier : supabase/migrations/xxx_ai_usage_tracking.sql

   ```sql
   CREATE TABLE IF NOT EXISTS ai_usage (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     org_id UUID NOT NULL REFERENCES organizations(id),
     user_id UUID NOT NULL,
     module TEXT NOT NULL, -- 'mail', 'pv', 'plans', 'chat', 'tasks'
     model TEXT NOT NULL, -- 'claude-sonnet-4-5', 'whisper', etc.
     input_tokens INTEGER DEFAULT 0,
     output_tokens INTEGER DEFAULT 0,
     cost_usd NUMERIC(10,6) DEFAULT 0,
     latency_ms INTEGER DEFAULT 0,
     success BOOLEAN DEFAULT true,
     error_message TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE INDEX idx_ai_usage_org_date ON ai_usage(org_id, created_at);

   -- Vue pour le coût journalier par org
   CREATE OR REPLACE VIEW v_daily_ai_cost AS
   SELECT
     org_id,
     DATE(created_at) AS day,
     SUM(cost_usd) AS total_cost_usd,
     SUM(input_tokens + output_tokens) AS total_tokens,
     COUNT(*) AS total_calls
   FROM ai_usage
   GROUP BY org_id, DATE(created_at);

   ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "ai_usage_org_isolation" ON ai_usage
     USING (org_id = (SELECT org_id FROM users WHERE id = auth.uid()));
   ```

2. Crée un middleware de tracking/limiting :
   Fichier : lib/ai/usage-tracker.ts

   ```typescript
   // Fonction wrapper pour tous les appels IA
   // Utilise-la autour de chaque appel Claude/Whisper

   async function trackAICall<T>(params: {
     org_id: string;
     user_id: string;
     module: string;
     model: string;
     fn: () => Promise<{ result: T; input_tokens: number; output_tokens: number }>;
   }): Promise<T> {

     // 1. Vérifier le quota AVANT l'appel
     const todayCost = await getTodayCost(params.org_id);
     const dailyLimit = 5.00; // $5/jour/org — ajustable
     if (todayCost >= dailyLimit) {
       throw new Error('Quota IA journalier atteint. Réessayez demain.');
     }

     // 2. Exécuter l'appel avec timing
     const start = Date.now();
     try {
       const { result, input_tokens, output_tokens } = await params.fn();
       const latency_ms = Date.now() - start;

       // 3. Logger l'usage
       await logUsage({
         ...params,
         input_tokens,
         output_tokens,
         cost_usd: calculateCost(params.model, input_tokens, output_tokens),
         latency_ms,
         success: true,
       });

       return result;
     } catch (error) {
       // Logger l'échec aussi
       await logUsage({
         ...params,
         input_tokens: 0,
         output_tokens: 0,
         cost_usd: 0,
         latency_ms: Date.now() - start,
         success: false,
         error_message: error.message,
       });
       throw error;
     }
   }
   ```

3. Intègre le tracker dans les appels IA existants.
   Cherche tous les endroits où Claude est appelé (grep "anthropic" ou "claude").
   Wrap chaque appel avec trackAICall().
   Ne change PAS la logique métier, ajoute UNIQUEMENT le wrapper.

4. Vérifie que le build compile sans erreur.

═══════════════════════════════════════
VÉRIFICATION FINALE PHASE 1
═══════════════════════════════════════

Quand les 4 étapes sont terminées, vérifie :
- [ ] Le build Next.js compile sans erreur
- [ ] Sentry est configuré (les fichiers config existent)
- [ ] global-error.tsx et not-found.tsx existent
- [ ] Toutes les routes API ont un try/catch avec Sentry
- [ ] vercel.json a regions: ["fra1"]
- [ ] La route webhook Microsoft Graph existe et gère validation + notification
- [ ] Le CRON de polling est réduit à 1x/heure (pas supprimé)
- [ ] La table ai_usage existe avec RLS
- [ ] Le tracker est wrappé autour d'au moins 3 appels IA principaux
- [ ] Aucune feature n'a été ajoutée ou modifiée

Crée un fichier PHASE1_CHECKLIST.md à la racine avec les résultats.
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 2 — IA FIABLE (Semaine 2)
# ═══════════════════════════════════════════════════════════

## Prompt Claude Code — Phase 2

```
Lis cette instruction en entier avant de commencer.
Tu vas fiabiliser TOUTE la couche IA de CANTAIA.
Ne code aucune feature. Tu améliores ce qui existe.

═══════════════════════════════════════
ÉTAPE 2.1 — AUDIT EXHAUSTIF DES PROMPTS
═══════════════════════════════════════

1. Trouve TOUS les fichiers qui contiennent des prompts IA :

   grep -rn "system\|role.*system\|systemPrompt\|You are\|Tu es\|content:" \
     lib/ app/api/ --include="*.ts" --include="*.tsx"

2. Pour CHAQUE prompt trouvé, crée une entrée dans un fichier d'audit :
   Fichier : AUDIT_PROMPTS.md

   Pour chaque prompt, analyse et note :

   | Critère | Oui/Non | Commentaire |
   |---------|---------|-------------|
   | Rôle précis (pas juste "assistant") | | |
   | Format de sortie JSON strict avec schema | | |
   | Langue de sortie spécifiée | | |
   | Règles strictes (pas de consignes vagues) | | |
   | Gestion des cas limites (données manquantes, erreurs) | | |
   | Exemples few-shot pour les cas ambigus | | |
   | max_tokens calibré (pas trop haut, pas trop bas) | | |
   | Température configurée (0 pour JSON, 0.3-0.7 pour texte) | | |

   Classe chaque prompt :
   🟢 BON — ne pas toucher
   🟡 À AMÉLIORER — corrections mineures
   🔴 À REFAIRE — prompt vague ou dangereux

3. Pour chaque prompt classé 🟡 ou 🔴, applique ces corrections :

   a) RÔLE : Remplace tout "Tu es un assistant" par un rôle métier précis.
      Exemples :
      - Mail : "Tu es un assistant de gestion de chantier en Suisse.
        Tu tries et classifies les emails de projets de construction."
      - PV : "Tu es un secrétaire de séance expérimenté dans la construction
        suisse, spécialisé dans la rédaction de procès-verbaux selon les
        normes SIA."
      - Chat : "Tu es JM, un expert en gestion de chantier en Suisse
        avec 20 ans d'expérience. Tu connais les normes SIA 102, 108,
        112, 118 et le Code des obligations suisse."

   b) FORMAT : Tout prompt qui attend du JSON DOIT spécifier le schema.
      Ajoute : "Réponds UNIQUEMENT en JSON valide. Aucun texte avant
      ou après le JSON. Voici le schema exact attendu : { ... }"

   c) LANGUE : Ajoute "Réponds en français" (ou "dans la langue de
      l'email original" pour la classification) à chaque prompt qui
      ne spécifie pas la langue.

   d) CAS LIMITES : Ajoute à chaque prompt une section :
      "SI l'information est manquante ou illisible, retourne null
      pour ce champ. Ne devine JAMAIS une valeur."
      "SI tu n'es pas sûr de la classification, retourne
      confidence: 'low' au lieu de deviner."

   e) TEMPÉRATURE : Configure :
      - temperature: 0 pour les tâches de classification et extraction JSON
      - temperature: 0.3 pour la génération de PV et réponses email
      - temperature: 0.7 pour le chat JM uniquement

   f) MAX_TOKENS : Calibre selon la tâche :
      - Classification email : 500 max (c'est un JSON court)
      - Extraction tâches : 1000 max
      - Génération PV : 4000-8000 selon la durée de la réunion
      - Chat JM : 2000 max par réponse
      - Analyse plan : 8000 max

4. NE MODIFIE PAS la logique métier autour des prompts.
   Change UNIQUEMENT le contenu des prompts et les paramètres d'appel.

═══════════════════════════════════════
ÉTAPE 2.2 — PROMPT CACHING ANTHROPIC
═══════════════════════════════════════

Le prompt caching permet de ne pas retransmettre les prompts système
longs à chaque appel. Ça divise le coût par 2-3 et la latence par 2.

1. Identifie les prompts système les plus longs et les plus fréquents :
   - Le prompt système du Chat JM (contexte SIA, normes, etc.)
   - Le prompt système de classification email
   - Le prompt système de génération PV
   - Le prompt système d'extraction de tâches

2. Pour chaque prompt système long, active le caching.

   Le pattern Anthropic pour le caching :

   ```typescript
   const response = await anthropic.messages.create({
     model: 'claude-sonnet-4-5-20250514',
     max_tokens: 2000,
     system: [
       {
         type: 'text',
         text: 'Le long prompt système ici...',
         cache_control: { type: 'ephemeral' }
         // Le cache dure 5 minutes par défaut
       }
     ],
     messages: [
       { role: 'user', content: userMessage }
     ],
   });
   ```

   Le champ important est `cache_control: { type: 'ephemeral' }`
   sur le bloc système. Ça indique à Anthropic de cacher ce préfixe.

3. Applique ce pattern sur les 4 prompts identifiés.

4. Vérifie dans les logs (ou via ai_usage) que le caching fonctionne :
   - Les appels suivants devraient avoir des `input_tokens` réduits
   - Le header de réponse inclut `cache-read-input-tokens` si le cache est utilisé

═══════════════════════════════════════
ÉTAPE 2.3 — FALLBACKS ET RÉSILIENCE
═══════════════════════════════════════

Chaque appel IA doit avoir un comportement dégradé propre
quand ça échoue. L'utilisateur ne doit JAMAIS voir une erreur brute
ou perdre une donnée.

1. Cherche tous les appels à l'API Anthropic dans le code :
   grep -rn "anthropic\|messages.create\|claude" lib/ app/api/ --include="*.ts"

2. Pour CHAQUE appel, vérifie et ajoute si absent :

   a) TRY/CATCH avec comportement dégradé :

   ```typescript
   try {
     const result = await anthropic.messages.create({ ... });
     // Traitement normal
   } catch (error) {
     Sentry.captureException(error);

     if (error.status === 429) {
       // Rate limit — retry après délai
       await sleep(2000);
       // Retry une fois
       try {
         const result = await anthropic.messages.create({ ... });
       } catch (retryError) {
         // Fallback
         return fallbackBehavior();
       }
     }

     // Pour tous les autres cas : fallback gracieux
     return fallbackBehavior();
   }
   ```

   b) FALLBACK spécifique par module :

   - Classification email échoue →
     L'email est classifié comme "À trier manuellement"
     avec un badge "Classification en attente" visible dans l'UI
     NE PAS perdre l'email, NE PAS le cacher

   - Génération PV échoue →
     Sauvegarder la transcription brute (si Whisper a réussi)
     Afficher : "La transcription est disponible.
     La génération du PV a échoué, veuillez réessayer."
     Bouton "Régénérer le PV"

   - Transcription Whisper échoue →
     Sauvegarder l'audio dans Supabase Storage
     Afficher : "L'audio a été enregistré.
     La transcription sera disponible sous peu."
     Mettre en file d'attente pour retry automatique

   - Chat JM échoue →
     Afficher : "JM est temporairement indisponible.
     Veuillez réessayer dans quelques instants."
     NE PAS afficher de message d'erreur technique

   - Extraction tâches échoue →
     Ne pas créer de tâches fantômes
     Logger l'erreur silencieusement
     L'email reste classifié normalement, sans tâches extraites

   c) VALIDATION JSON : Après chaque appel qui attend du JSON :

   ```typescript
   function safeParseJSON<T>(text: string): T | null {
     try {
       // Nettoyer les fences markdown si présentes
       const cleaned = text
         .replace(/```json\n?/g, '')
         .replace(/```\n?/g, '')
         .trim();
       return JSON.parse(cleaned) as T;
     } catch {
       return null;
     }
   }

   // Utilisation :
   const parsed = safeParseJSON<ClassificationResult>(response.content[0].text);
   if (!parsed) {
     Sentry.captureMessage('Réponse IA non-JSON', { extra: { raw: response.content[0].text } });
     return fallbackBehavior();
   }
   ```

3. Vérifie que CHAQUE route API qui appelle l'IA retourne TOUJOURS
   une réponse HTTP valide, même en cas d'erreur IA.
   Jamais de 500 non géré.

═══════════════════════════════════════
ÉTAPE 2.4 — NETTOYAGE DES ENTRÉES IA
═══════════════════════════════════════

Avant d'envoyer du contenu à Claude, nettoie-le pour économiser
des tokens et améliorer la qualité.

1. Crée le fichier : lib/ai/input-cleaner.ts

   ```typescript
   /**
    * Nettoie le corps d'un email avant de l'envoyer à l'IA.
    * Objectif : réduire les tokens inutiles de 30-60%.
    */
   export function cleanEmailBody(html: string): string {
     // 1. Convertir HTML en texte brut
     let text = stripHtml(html);

     // 2. Supprimer les disclaimers légaux
     // (Ils commencent souvent par "Ce message" ou "This email"
     //  ou "Confidentialité" en fin de mail)
     const disclaimerPatterns = [
       /Ce (message|courriel|e-mail) (est |et ses )?(confidentiel|destiné).*/gis,
       /This (message|email) (is )?(confidential|intended).*/gis,
       /Disclaimer.*/gis,
       /Vertraulichkeit.*/gis,
       /Diese (Nachricht|E-Mail).*(vertraulich|bestimmt).*/gis,
     ];
     for (const pattern of disclaimerPatterns) {
       text = text.replace(pattern, '');
     }

     // 3. Supprimer les signatures email
     // (Commencent après -- ou après "Cordialement" / "Best regards")
     const signatureMarkers = [
       /\n--\s*\n.*/gs,
       /\n(Cordialement|Meilleures salutations|Best regards|Freundliche Grüsse|Mit freundlichen Grüssen).*/gis,
     ];
     for (const pattern of signatureMarkers) {
       text = text.replace(pattern, '');
     }

     // 4. Supprimer les reply chains (historique email)
     // Garder uniquement le premier message
     const replyMarkers = [
       /\n(De |From |Von ):.*\n(Envoyé |Sent |Gesendet ).*/gs,
       /\n-{3,}.*Message (original|transféré).*/gis,
       /\nOn .* wrote:$/gm,
     ];
     for (const pattern of replyMarkers) {
       const match = text.match(pattern);
       if (match && match.index) {
         text = text.substring(0, match.index);
       }
     }

     // 5. Compresser les espaces multiples
     text = text.replace(/\n{3,}/g, '\n\n').trim();

     return text;
   }

   /**
    * Tronque un texte à un nombre max de tokens approximatif.
    * 1 token ≈ 4 caractères en français.
    */
   export function truncateToTokens(text: string, maxTokens: number): string {
     const maxChars = maxTokens * 4;
     if (text.length <= maxChars) return text;
     return text.substring(0, maxChars) + '\n\n[... contenu tronqué]';
   }
   ```

2. Intègre cleanEmailBody() dans le pipeline de classification email,
   AVANT l'appel à Claude. Cherche l'endroit où le corps de l'email
   est envoyé au prompt L2 et nettoie-le.

3. Intègre truncateToTokens() comme garde-fou avant CHAQUE appel IA :
   - Classification email : max 2000 tokens de contenu
   - Extraction tâches : max 3000 tokens
   - Chat JM contexte : max 4000 tokens
   - Génération PV transcription : max 15000 tokens

═══════════════════════════════════════
ÉTAPE 2.5 — TESTS MANUELS
═══════════════════════════════════════

Crée un fichier de scénarios de test :
Fichier : TESTS_MANUELS.md

Contenu :

# Tests manuels CANTAIA — Checklist

## Classification Email
- [ ] Email en français avec nom de projet dans l'objet → classifié correctement
- [ ] Email en allemand → classifié correctement
- [ ] Email en anglais → classifié correctement
- [ ] Newsletter/spam → filtré par L0, pas envoyé à Claude
- [ ] Email personnel (sans rapport chantier) → marqué comme non-projet
- [ ] Email avec PJ (plan PDF) → PJ détectée et plan enregistré
- [ ] Email avec PJ (offre Excel) → PJ détectée et offre enregistrée
- [ ] Email très long (> 5000 mots) → tronqué et classifié correctement
- [ ] Email vide (objet seul, pas de corps) → classifié sans erreur
- [ ] 10 emails du même projet → tous classifiés sous le même projet

## Génération PV
- [ ] Audio de 5 minutes → PV complet avec décisions et actions
- [ ] Audio de 30 minutes → PV complet (pas tronqué)
- [ ] Audio avec bruit de fond → transcription acceptable
- [ ] Audio en français → PV en français
- [ ] Audio avec mélange FR/DE → PV cohérent
- [ ] Audio inaudible → message d'erreur propre (pas de crash)
- [ ] Fichier corrompu → message d'erreur propre

## Chat JM
- [ ] Question sur norme SIA 118 → réponse correcte avec référence
- [ ] Question hors sujet (météo, recette) → réponse polie de redirection
- [ ] Question en allemand → réponse en allemand
- [ ] 10 questions rapides → pas de rate limit visible
- [ ] Question très longue (1000 mots) → réponse correcte

## Tâches
- [ ] Email contenant une demande d'action → tâche créée
- [ ] Email informatif (pas d'action) → pas de tâche créée
- [ ] PV avec 5 actions → 5 tâches créées avec les bons assignés

═══════════════════════════════════════
VÉRIFICATION FINALE PHASE 2
═══════════════════════════════════════

- [ ] AUDIT_PROMPTS.md créé avec tous les prompts analysés
- [ ] Tous les prompts 🔴 ont été refaits
- [ ] Tous les prompts 🟡 ont été améliorés
- [ ] Prompt caching activé sur les 4 prompts système principaux
- [ ] Tous les appels IA ont un try/catch avec fallback
- [ ] safeParseJSON utilisé partout où du JSON est attendu
- [ ] cleanEmailBody intégré dans le pipeline email
- [ ] truncateToTokens en garde-fou sur tous les appels
- [ ] TESTS_MANUELS.md créé
- [ ] Le build compile sans erreur

Crée PHASE2_CHECKLIST.md à la racine avec les résultats.
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 3 — ONBOARDING MAGIQUE (Semaine 3)
# ═══════════════════════════════════════════════════════════

## Prompt Claude Code — Phase 3

```
Lis cette instruction en entier avant de commencer.
Tu vas créer le flux d'onboarding de CANTAIA.
C'est la feature LA PLUS IMPORTANTE du produit.
Les 3 premières minutes de l'utilisateur déterminent
s'il devient client ou s'il disparaît pour toujours.

═══════════════════════════════════════
CONTEXTE TECHNIQUE
═══════════════════════════════════════

L'authentification Microsoft OAuth existe déjà dans le projet.
Cherche les fichiers existants liés à :
- OAuth Microsoft (next-auth, supabase auth, ou custom)
- Création de compte / premier login
- Page post-login

Tu vas MODIFIER le flux post-login, pas recréer l'auth.

═══════════════════════════════════════
LE FLUX À IMPLÉMENTER
═══════════════════════════════════════

Crée le fichier : app/onboarding/page.tsx
Crée le fichier : app/onboarding/components/OnboardingWizard.tsx

Le wizard a 3 étapes. L'utilisateur ne voit qu'un seul écran à la fois.
Pas de sidebar, pas de header complexe. Écran plein, focus total.

Design : fond Parchment (#F5F2EB), texte Navy (#0A1F30),
accents Gold (#C4A661). Sobre, professionnel, suisse.

ÉTAPE 1 — "Bienvenue" (5 secondes)

Écran minimaliste :
- Logo CANTAIA centré
- "Bienvenue sur CANTAIA"
- "Configurons votre espace en 2 minutes"
- Bouton Gold : "C'est parti" →

ÉTAPE 2 — "Votre premier projet" (30 secondes)

- "Comment s'appelle votre chantier principal ?"
- Un seul champ texte, grand, centré, autofocus
- Placeholder : "Ex: Résidence Les Cèdres, Rénovation Gare de Lausanne..."
- Sous le champ : "Vous pourrez ajouter d'autres projets plus tard"
- Bouton : "Créer le projet" →

Au clic :
1. Créer le projet dans Supabase (nom + org_id)
2. Extraire les mots-clés du nom pour le mapping L1
   (ex: "Résidence Les Cèdres" → mots-clés: ["cèdres", "résidence"])
3. Stocker les mots-clés dans email_settings ou equivalent

ÉTAPE 3 — "La magie" (120 secondes — l'utilisateur REGARDE)

C'est l'écran le plus important de tout le produit.

Layout :
- En haut : "CANTAIA analyse vos emails..." avec une animation subtile
- Au centre : un feed en temps réel qui montre les emails détectés
- En bas : un compteur "X emails classifiés"

Le flux technique :
1. Appeler Microsoft Graph pour récupérer les 100 derniers emails inbox
   GET /me/messages?$top=100&$orderby=receivedDateTime desc
   &$select=subject,from,receivedDateTime,bodyPreview

2. Pour chaque email, faire une classification L1 rapide
   (mots-clés du nom du projet). PAS de L2 (trop lent pour le live).

3. Afficher en temps réel (streaming / polling court) :
   - Chaque email apparaît dans le feed avec une animation slide-in
   - Les emails qui matchent le projet → highlight Gold avec badge projet
   - Les emails qui ne matchent pas → grisés
   - Compteur qui incrémente en temps réel

4. Après le scan des 100 emails :
   Écran récapitulatif :
   "CANTAIA a trouvé [X] emails liés à [nom du projet]
   sur vos [100] derniers emails."

   Si X > 0 :
   - "Voulez-vous ajouter un autre projet ?"
   - Bouton "Ajouter un projet" (retour étape 2)
   - Bouton "Accéder à mon dashboard →" (fin onboarding)

   Si X = 0 :
   - "Aucun email trouvé pour ce nom de projet.
     Vérifiez l'orthographe ou essayez un autre nom."
   - Bouton "Modifier le nom" (retour étape 2)
   - Bouton "Continuer quand même →"

IMPORTANT : l'étape 3 doit être RAPIDE.
- Utilise uniquement L1 (mots-clés), PAS Claude pour la classification live
- L'objectif est l'effet visuel, pas la précision parfaite
- La classification L2 (Claude) se fera en arrière-plan APRÈS l'onboarding
- Affiche les emails au fur et à mesure (streaming), pas tout d'un coup

═══════════════════════════════════════
APRÈS L'ONBOARDING
═══════════════════════════════════════

1. Marque l'utilisateur comme "onboarded" dans la BDD
   (ajoute un champ `onboarded_at` dans la table users si absent)

2. Redirige vers /dashboard

3. En arrière-plan (après redirect) :
   - Lance la classification L2 (Claude) sur les emails matchés
     pour affiner la classification
   - Crée l'abonnement webhook Microsoft Graph (Phase 1, étape 1.3)
   - Démarre l'extraction de tâches sur les emails classifiés

4. Le middleware doit vérifier : si l'utilisateur est authentifié
   mais PAS onboarded, rediriger vers /onboarding au lieu de /dashboard.

═══════════════════════════════════════
COMPOSANTS UI
═══════════════════════════════════════

Utilise shadcn/ui + Tailwind. Composants nécessaires :
- Input (pour le nom du projet)
- Button (primary Gold, secondary outline)
- Card (pour chaque email dans le feed)
- Badge (pour le tag projet)
- Progress ou Spinner (pour le scan)

Animations (Framer Motion si déjà dans le projet, sinon CSS transitions) :
- Slide-in des emails dans le feed (de bas en haut, 200ms chacun)
- Fade-in du compteur
- Pulse sur le bouton final

Responsive :
- Le wizard doit être parfait sur mobile (c'est là que beaucoup
  de chefs de projet vont essayer pour la première fois)
- Pas de scroll horizontal
- Boutons assez grands pour des doigts (min 48px)

═══════════════════════════════════════
VÉRIFICATION FINALE PHASE 3
═══════════════════════════════════════

- [ ] /onboarding accessible après premier login
- [ ] Étape 1 : écran bienvenue minimal
- [ ] Étape 2 : création projet avec un seul champ
- [ ] Étape 3 : scan live des emails avec feed en temps réel
- [ ] Compteur d'emails classifiés qui s'incrémente
- [ ] Récapitulatif avec option d'ajouter un projet
- [ ] Redirection vers /dashboard après onboarding
- [ ] Middleware redirige non-onboarded vers /onboarding
- [ ] Classification L2 lancée en arrière-plan post-onboarding
- [ ] Webhook Graph créé en arrière-plan post-onboarding
- [ ] Parfait sur mobile (tester avec les DevTools Chrome)
- [ ] Le build compile sans erreur

Crée PHASE3_CHECKLIST.md à la racine avec les résultats.
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 4 — PRODUIT PRÊT POUR BETA (Semaine 4)
# ═══════════════════════════════════════════════════════════

## Prompt Claude Code — Phase 4

```
Lis cette instruction en entier avant de commencer.
Tu vas finaliser le produit pour les premiers beta-testeurs.
Pas de nouvelles features. Du polish et des garde-fous.

═══════════════════════════════════════
ÉTAPE 4.1 — BADGES BETA SUR MODULES SECONDAIRES
═══════════════════════════════════════

1. Identifie les modules qui NE SONT PAS dans le lancement :
   - Soumissions
   - Fournisseurs
   - Prix / Cantaia Prix
   - Plans (estimation avancée — le registre de plans reste accessible)
   - Visites client
   - Chat JM (optionnel — si c'est stable, on le garde)

2. Pour chaque module secondaire :

   a) Dans le composant de navigation (Sidebar/Menu) :
   - Garde l'entrée dans le menu MAIS ajoute un badge "Bientôt"
   - Le lien pointe vers une page interstitielle, pas vers le module

   b) Crée une page interstitielle générique :
   Fichier : app/coming-soon/page.tsx

   Design sobre :
   - Icône du module (si disponible) ou icône générique
   - Titre : "[Nom du module]"
   - "Ce module est en cours de développement et sera
     disponible prochainement."
   - "Vous serez notifié dès qu'il sera accessible."
   - Champ email optionnel : "Prévenez-moi" (stocke dans Supabase)
   - Bouton "Retour au dashboard"

   Passe le nom du module en query param :
   /coming-soon?module=soumissions

3. Alternative si le module est déjà accessible et fonctionnel :
   Au lieu de bloquer l'accès, ajoute un bandeau en haut de la page :
   "⚡ Ce module est en version beta. Certaines fonctionnalités
   peuvent être incomplètes. Vos retours sont précieux."
   Avec un lien "Donner mon avis" (mailto: ou lien feedback).

═══════════════════════════════════════
ÉTAPE 4.2 — EMPTY STATES
═══════════════════════════════════════

Vérifie CHAQUE page principale et assure-toi qu'un nouvel utilisateur
(sans données) voit un état vide accueillant, pas une page blanche.

Pages à vérifier :
- /dashboard → Si 0 projets : "Créez votre premier projet pour commencer"
- /mail → Si 0 emails : "Connectez votre messagerie pour commencer"
- /projects → Si 0 projets : "Aucun projet. Créez votre premier chantier."
- /projects/[id]/emails → Si 0 emails classifiés : "Aucun email classifié
  pour ce projet. Les emails arrivent automatiquement."
- /projects/[id]/tasks → Si 0 tâches : "Aucune tâche pour le moment.
  Les tâches sont créées automatiquement depuis vos emails et PV."
- /meetings → Si 0 réunions : "Enregistrez votre première séance de chantier."

Pour chaque empty state :
- Icône illustrative (pas un emoji, un SVG ou une icône Lucide)
- Message explicatif en 1 ligne
- UN bouton d'action principal (la prochaine étape logique)
- Pas de lien vers la documentation (ils ne la liront pas)

═══════════════════════════════════════
ÉTAPE 4.3 — LOADING STATES
═══════════════════════════════════════

Vérifie que CHAQUE page qui charge des données affiche un état
de chargement au lieu d'un écran blanc.

Pattern : utilise des skeleton loaders (rectangles gris animés)
qui imitent la forme du contenu à venir.

Si shadcn/ui a un composant Skeleton, utilise-le.
Sinon, crée un composant minimal :

```tsx
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-gray-200 rounded ${className}`}
    />
  );
}
```

Pages prioritaires :
- /dashboard (skeletons pour les cartes de stats)
- /mail (skeletons pour la liste d'emails)
- /projects/[id] (skeleton pour les détails projet)

═══════════════════════════════════════
ÉTAPE 4.4 — VALIDATION DES FORMULAIRES
═══════════════════════════════════════

Vérifie les formulaires principaux :
- Création de projet
- Création de tâche
- Paramètres du compte / profil

Chaque formulaire doit avoir :
- Validation inline (pas juste au submit)
- Message d'erreur sous le champ concerné (pas un toast éloigné)
- Bouton submit désactivé tant que le formulaire est invalide
- Indicateur de chargement sur le bouton pendant le submit

═══════════════════════════════════════
ÉTAPE 4.5 — CONFIRMATION ACTIONS DESTRUCTIVES
═══════════════════════════════════════

Cherche tous les boutons de suppression dans le code :
grep -rn "delete\|supprimer\|remove\|archiver" app/ components/ --include="*.tsx"

Chaque action destructive doit avoir un dialog de confirmation :
"Êtes-vous sûr de vouloir supprimer [élément] ?
Cette action est irréversible."
Avec deux boutons : "Annuler" (primary) et "Supprimer" (rouge, secondary).

═══════════════════════════════════════
ÉTAPE 4.6 — HUMAN IN THE LOOP
═══════════════════════════════════════

C'est critique. Partout où l'IA prend une décision, l'utilisateur
doit pouvoir corriger facilement.

1. Classification email :
   - Chaque email classifié doit avoir un bouton discret
     "Mauvais projet ? Reclasser" ou un dropdown pour changer le projet
   - La reclassification doit être en 1 clic (dropdown → sélectionner projet)

2. Tâches extraites :
   - Chaque tâche créée par l'IA doit avoir un badge "Suggérée par IA"
   - L'utilisateur peut modifier le titre, l'assigné, la date
   - L'utilisateur peut supprimer la tâche si c'est un faux positif

3. PV de réunion :
   - Le PV généré s'ouvre en mode ÉDITION, pas en lecture seule
   - L'utilisateur doit cliquer "Valider et envoyer" pour le finaliser
   - Avant validation : badge "Brouillon — à valider"

4. Briefing :
   - Les informations du briefing doivent avoir un lien vers la source
     (email original, PV original, tâche originale)
   - L'utilisateur peut vérifier chaque point

═══════════════════════════════════════
VÉRIFICATION FINALE PHASE 4
═══════════════════════════════════════

- [ ] Modules secondaires ont un badge "Bientôt" ou "Beta"
- [ ] Page coming-soon fonctionnelle
- [ ] Empty states sur toutes les pages principales (6 minimum)
- [ ] Loading states (skeletons) sur dashboard, mail, projet
- [ ] Formulaires avec validation inline
- [ ] Confirmations sur toutes les actions destructives
- [ ] Reclassification email en 1 clic
- [ ] Tâches IA avec badge "Suggérée par IA" + éditable
- [ ] PV en mode brouillon par défaut, validation explicite
- [ ] Le build compile sans erreur
- [ ] Test mobile : les pages principales sont lisibles et utilisables

Crée PHASE4_CHECKLIST.md à la racine avec les résultats.
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 5 à 8 — NE SONT PAS DES TÂCHES CLAUDE CODE
# ═══════════════════════════════════════════════════════════

Les phases 5 à 8 sont des phases humaines, pas des phases de code.
Voici ce que TU fais (pas Claude Code) :

## Phase 5 (Semaine 5) — Trouver 3 beta-testeurs

Envoie ce message à 5-8 chefs de projet de ton réseau :

"Salut [Prénom],

Je développe un outil pour trier automatiquement les emails
de chantier par projet. Ça prend 2 minutes à connecter avec Outlook
et tu vois tes emails classifiés en temps réel.

Est-ce que tu aurais 15 min cette semaine pour une démo rapide
en visio ? C'est gratuit et sans engagement — je cherche juste
des retours de professionnels comme toi.

[Ton prénom]"

## Phases 6-8 (Semaines 6-8) — Support beta

Crée un Google Sheet avec ces colonnes :
- Nom beta-testeur
- Date
- Connexions cette semaine
- Emails classifiés
- PV générés
- Corrections / reclassifications
- Bug signalé
- Feature demandée
- Commentaire verbatim

Remplis-le chaque semaine. C'est ton tableau de bord produit.

---

# ═══════════════════════════════════════════════════════════
# PHASE 9-10 — STRIPE ET CONVERSION (Mois 3)
# ═══════════════════════════════════════════════════════════

## Prompt Claude Code — Phase 9

```
Lis cette instruction en entier avant de commencer.
Tu vas intégrer Stripe pour la facturation.
UN SEUL plan, UN SEUL prix. Pas de complexité.

═══════════════════════════════════════
ÉTAPE 9.1 — INTÉGRATION STRIPE
═══════════════════════════════════════

1. Installe Stripe :
   npm install stripe @stripe/stripe-js

2. Crée la configuration Stripe :
   Fichier : lib/stripe/config.ts

   ```typescript
   import Stripe from 'stripe';

   export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
     apiVersion: '2024-12-18.acacia', // ou la dernière version stable
   });

   export const PLANS = {
     founder: {
       name: 'Fondateur',
       price_monthly_chf: 99, // Prix fondateur bloqué 12 mois
       stripe_price_id: process.env.STRIPE_FOUNDER_PRICE_ID!,
     },
   } as const;
   ```

3. Crée les routes API Stripe :

   a) Fichier : app/api/stripe/create-checkout/route.ts
   - Crée une Stripe Checkout Session
   - Mode : subscription
   - Prix : le price_id fondateur
   - Success URL : /dashboard?subscription=success
   - Cancel URL : /pricing?subscription=cancelled
   - Passe le org_id dans les metadata

   b) Fichier : app/api/stripe/webhook/route.ts
   - Vérifie la signature Stripe (STRIPE_WEBHOOK_SECRET)
   - Gère les événements :
     * checkout.session.completed → active l'abonnement dans Supabase
     * customer.subscription.deleted → désactive l'abonnement
     * invoice.payment_failed → marque le compte en impayé
   - Met à jour la table organizations :
     Ajoute les champs si absents :
     stripe_customer_id, stripe_subscription_id,
     subscription_status ('trialing' | 'active' | 'past_due' | 'cancelled'),
     trial_ends_at, subscription_ends_at

4. Crée la page pricing minimale :
   Fichier : app/pricing/page.tsx

   UNE SEULE carte de prix :
   - "CANTAIA Fondateur"
   - "99 CHF / mois"
   - "Prix bloqué 12 mois pour les premiers utilisateurs"
   - Liste de features : Mail IA, PV automatique, Tâches intelligentes,
     Briefing quotidien, Support prioritaire
   - Bouton "Démarrer l'essai gratuit — 14 jours"
     → Redirige vers Stripe Checkout
   - Sous le bouton : "Sans engagement. Annulable à tout moment."

5. Ajoute la gestion du trial dans le middleware :
   - Si subscription_status === 'trialing' ET trial_ends_at > now → accès OK
   - Si subscription_status === 'active' → accès OK
   - Si subscription_status === 'past_due' → bandeau "Paiement en retard"
     + accès OK pendant 7 jours
   - Si subscription_status === null ET trial expiré → redirect /pricing
   - Si pas de subscription du tout (nouveau compte) →
     créer automatiquement un trial de 14 jours

6. Variables d'environnement à ajouter :
   STRIPE_SECRET_KEY=sk_...
   STRIPE_PUBLISHABLE_KEY=pk_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_FOUNDER_PRICE_ID=price_...

═══════════════════════════════════════
ÉTAPE 9.2 — BANDEAU TRIAL
═══════════════════════════════════════

Ajoute un bandeau en haut de l'app (dans le layout principal)
qui s'affiche uniquement pendant le trial :

"Essai gratuit — [X] jours restants. Passez au plan Fondateur →"

Le lien redirige vers /pricing.
Le bandeau disparaît une fois l'abonnement actif.

Couleur : fond Gold léger, texte Navy. Discret mais visible.

═══════════════════════════════════════
VÉRIFICATION FINALE PHASE 9
═══════════════════════════════════════

- [ ] Stripe SDK installé et configuré
- [ ] Route create-checkout fonctionne
- [ ] Route webhook gère les 3 événements principaux
- [ ] Page /pricing avec une seule carte
- [ ] Trial de 14 jours créé automatiquement
- [ ] Middleware gère les états subscription correctement
- [ ] Bandeau trial affiché avec jours restants
- [ ] Redirection vers /pricing quand trial expiré
- [ ] Le build compile sans erreur

Crée PHASE9_CHECKLIST.md à la racine avec les résultats.
```

---

# ═══════════════════════════════════════════════════════════
# PHASE 11-12 — CAMPAGNE LINKEDIN (Mois 4)
# ═══════════════════════════════════════════════════════════

Pas de Claude Code ici. Référence le document stratégie marketing
1000€ qu'on a produit précédemment. Exécute le plan :

Semaine 11 :
- Vidéo démo Loom (2 min, screencast emails classifiés en live)
- Mise à jour profil LinkedIn
- Setup Apollo.io ou Lemlist (100€)
- Liste 100 prospects (chefs de projet CH romande + CH alémanique)

Semaine 12 :
- Lance LinkedIn Ads (500€, 25€/jour, ciblage construction Suisse)
- Envoie séquence outreach (3 messages sur 8 jours)
- Posts organiques LinkedIn 3x/semaine
- Mesure : clics, trials, conversions

---

# ═══════════════════════════════════════════════════════════
# PHASE 13-16 — EXPANSION MODULES (Mois 4-5)
# ═══════════════════════════════════════════════════════════

## Prompt Claude Code — Phase 13

```
Lis cette instruction en entier avant de commencer.

Contexte : CANTAIA a maintenant des clients payants actifs.
Les données d'usage réelles montrent quels modules les clients
demandent. Tu vas ouvrir les modules secondaires un par un
selon la priorité indiquée.

IMPORTANT : ne fais ces changements que pour les modules
que je t'indique. Les autres restent en "Bientôt".

═══════════════════════════════════════
OUVERTURE D'UN MODULE BETA
═══════════════════════════════════════

Pour chaque module que je te demande d'ouvrir :

1. Retire le badge "Bientôt" du menu
2. Ajoute un badge "Beta" à la place (bleu, discret)
3. Active le lien vers le vrai module (pas la page coming-soon)
4. Ajoute le bandeau beta en haut de la page du module :
   "⚡ Module en version beta — Vos retours sont précieux.
   [Donner mon avis]"
5. Vérifie que les empty states existent
6. Vérifie que les fallbacks IA existent
7. Vérifie que le tracking ai_usage est en place

ORDRE DE PRIORITÉ (basé sur les demandes clients probables) :

Priorité 1 : Plans (registre + versioning, SANS estimation)
Priorité 2 : Chat JM (si stable et bien prompté)
Priorité 3 : Soumissions (extraction basique)
Priorité 4 : Fournisseurs (base + scoring interne)
Priorité 5 : Visites client

Pour chaque module ouvert, crée une entrée dans MODULES_STATUS.md :

| Module | Statut | Date ouverture | Nb utilisateurs actifs | Feedback |
|--------|--------|---------------|----------------------|----------|
| Mail | Production | Jour 1 | | |
| PV | Production | Jour 1 | | |
| Tâches | Production | Jour 1 | | |
| Plans | Beta | [date] | | |
| ... | | | | |

═══════════════════════════════════════
FEATURE REQUESTS — À IMPLÉMENTER UNIQUEMENT SI DEMANDÉ
═══════════════════════════════════════

Si les beta-testeurs demandent une feature spécifique,
je te donnerai l'instruction ciblée. Ne code RIEN en avance.

Features candidates (roadmap, pas à implémenter maintenant) :
- Inbox Zero (mode réponse rapide email)
- Rapport hebdomadaire automatique
- Setup projet intelligent (upload docs → projet pré-rempli)
- Journal photo chantier
- Gestion des réserves
- Prédiction de retard
- Dashboard financier
- Assistant vocal
- Analyse contrats
- Carte interactive

Chacune de ces features sera spécifiée dans une instruction
séparée si et quand un client la demande.
```

---

# ═══════════════════════════════════════════════════════════
# RÉSUMÉ — COMMENT UTILISER CE DOCUMENT
# ═══════════════════════════════════════════════════════════

1. Copie ce fichier à la racine de ton projet CANTAIA

2. Pour chaque phase, copie le prompt entre les ``` dans Claude Code

3. Exécute UNE phase à la fois. Vérifie la checklist avant de passer
   à la suivante.

4. Les phases 5-8 et 11-12 sont des phases HUMAINES.
   Pas de Claude Code. C'est toi qui contactes les prospects,
   qui fais le support, qui mesure les métriques.

5. La Phase 13+ est conditionnelle aux retours clients.
   N'ouvre un module que quand un client le demande.

Ordre d'exécution :
Phase 1 → Phase 2 → Phase 3 → Phase 4 → [HUMAIN 5-8] → Phase 9 → [HUMAIN 11-12] → Phase 13+

Temps estimé Claude Code :
- Phase 1 : 3-5h
- Phase 2 : 3-5h
- Phase 3 : 4-6h
- Phase 4 : 3-4h
- Phase 9 : 2-3h
- Phase 13 : 1-2h par module

Total code : ~20-25h de Claude Code sur 4-5 semaines
Total humain : ~40-60h sur 8-12 semaines (prospection, support, feedback)
