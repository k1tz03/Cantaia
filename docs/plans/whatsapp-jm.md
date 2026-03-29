# Plan — JM sur WhatsApp

> **Statut** : À implémenter (priorité après commercialisation)
> **Estimé** : 5 jours de développement
> **Coût mensuel estimé** : 13–23 CHF/mois
> **Date de rédaction** : 2026-03-29

---

## Vision

JM (l'assistant IA de Cantaia) devient accessible depuis WhatsApp. Un chef de projet peut, depuis sa voiture ou un chantier, dicter un message vocal ou taper un texte pour :

- Créer des tâches
- Envoyer des emails à des fournisseurs/partenaires
- Obtenir l'état d'un chantier
- Comparer des prix fournisseurs
- Consulter ses emails non traités
- Poser n'importe quelle question sur ses projets

JM répond avec un accès complet à toutes les données Cantaia de l'utilisateur (projets, tâches, emails, fournisseurs, soumissions, planning).

---

## Exemples concrets

```
Julien (vocal en voiture) :
"JM, crée une tâche urgente livraison béton sur le chantier Rue du Lac, pour vendredi"

JM :
"✅ Tâche créée :
📌 Livraison béton
📁 Chantier Rue du Lac, Lausanne
📅 Vendredi 3 avril
⚡ Priorité : Urgente"

---

Julien :
"JM, envoie un mail à Michel Almeida pour lui demander de livrer 10 caniveaux
pour le chantier Avenue des Alpes avant le 10 avril"

JM :
"📧 Brouillon :
À : michel.almeida@almeida-materiaux.ch
Objet : Livraison caniveaux — Chantier Avenue des Alpes
[contenu généré par IA]

Tu confirmes l'envoi ?"

Julien : "Oui"
JM : "✅ Email envoyé à Michel Almeida."

---

Julien :
"JM, c'est quoi l'état du chantier 925 ?"

JM :
"📊 Chantier 925 — Rue du Lac :
✅ 12 tâches terminées
⏳ 3 tâches en cours
🔴 1 tâche en retard : Inspection électricité (due hier)
📧 4 emails non traités
📅 Prochaine réunion : Mercredi 1er avril, 09h00"
```

---

## Architecture Technique

### Vue d'ensemble

```
WhatsApp (utilisateur)
        ↓ message texte / vocal
Meta WhatsApp Cloud API
        ↓ webhook POST avec signature HMAC-SHA256
/api/whatsapp/webhook (Next.js Route Handler)
        ↓
┌──────────────────────────────────────────┐
│          WhatsApp Message Router         │
│  • Vérification signature                │
│  • Identification user (phone → user_id) │
│  • Type détection (text / audio / image) │
└──────────┬───────────────────────────────┘
           │
           ├── Audio → Whisper (transcription) → texte
           │
           ↓
┌──────────────────────────────────────────┐
│              JM Agent (Claude)           │
│  • AI SDK tool calling                   │
│  • Contexte : projets, tâches, emails    │
│  • Historique : 20 derniers messages     │
│  • Confirmation avant actions critiques  │
└──────────┬───────────────────────────────┘
           │
           ├── Tools → APIs Cantaia existantes
           │
           ↓
Meta WhatsApp Cloud API → WhatsApp (réponse)
```

### Stack technique

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| API WhatsApp | Meta Cloud API (direct) | Pas d'intermédiaire, 1000 conv/mois gratuites |
| Agent IA | AI SDK `streamText` + tools | Déjà dans le projet |
| Mémoire conversation | Supabase (`whatsapp_conversations`) | Cohérent avec le reste du projet |
| Transcription audio | Whisper (déjà intégré ✅) | Réutilisé tel quel |
| Auth webhook | HMAC-SHA256 (Meta) | Sécurité messages entrants |
| User linking | Table `whatsapp_users` | Numéro ↔ user_id Cantaia |

---

## Phase 1 — Infrastructure (Jour 1)

### 1.1 Prérequis Meta (à faire par Julien)

1. Créer un compte **Meta Business** vérifié → business.facebook.com
2. Créer une **Meta Developer App** (type: Business)
3. Ajouter le produit **WhatsApp Business**
4. Obtenir un **numéro de téléphone dédié** (SIM virtuelle, ex: Comtelia/Fonicom, ~8 CHF/mois)
5. Enregistrer le numéro dans l'App WhatsApp
6. Récupérer :
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_ACCESS_TOKEN` (token permanent)
   - `WHATSAPP_WEBHOOK_SECRET` (pour vérifier les webhooks)

### 1.2 Migration base de données (migration 063)

```sql
-- Table de liaison numéro WhatsApp ↔ user Cantaia
CREATE TABLE whatsapp_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  phone_number text NOT NULL UNIQUE,  -- Format E.164 : +41791234567
  verified_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Historique des conversations (mémoire JM par user)
CREATE TABLE whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  message_type text DEFAULT 'text' CHECK (message_type IN ('text', 'audio', 'image')),
  whatsapp_message_id text,  -- ID Meta pour déduplication
  created_at timestamptz DEFAULT now()
);

-- Index pour récupérer les 20 derniers messages rapidement
CREATE INDEX idx_whatsapp_conversations_user_date
  ON whatsapp_conversations (user_id, created_at DESC);

-- RLS
ALTER TABLE whatsapp_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_whatsapp"
  ON whatsapp_users FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "users_own_conversations"
  ON whatsapp_conversations FOR ALL
  USING (user_id = auth.uid());
```

### 1.3 Variables d'environnement à ajouter

```
WHATSAPP_PHONE_NUMBER_ID=   # ID du numéro dans Meta
WHATSAPP_ACCESS_TOKEN=      # Token Bearer permanent Meta
WHATSAPP_WEBHOOK_SECRET=    # Secret pour vérifier la signature HMAC-SHA256
```

### 1.4 Routes API à créer

```
/api/whatsapp/webhook        GET  — Vérification challenge Meta (à configurer 1 fois)
/api/whatsapp/webhook        POST — Réception messages entrants
/api/whatsapp/send           POST — Envoi message sortant (utilisé en interne)
```

---

## Phase 2 — JM Agent avec Tool Calling (Jours 2–3)

### 2.1 Architecture de l'agent

JM utilise **AI SDK `streamText`** avec tool calling. Pour les opérations complexes multi-étapes (ex: créer une tâche + envoyer un email + notifier), le **Workflow DevKit `DurableAgent`** peut être utilisé pour la durabilité (mais facultatif en v1).

```typescript
// packages/core/src/whatsapp/jm-agent.ts

const JM_SYSTEM_PROMPT = `
Tu es JM, l'assistant IA de Cantaia pour la gestion de chantier.
Tu réponds en français, de manière concise et avec des emojis.
Tu as accès aux données complètes du projet de l'utilisateur.

Règles :
- Toujours confirmer avant d'envoyer un email ou de modifier des données
- Répondre en max 3-4 lignes pour les infos simples
- Utiliser des emojis pour la lisibilité (✅ ❌ 📁 📧 ⚡ 📅)
- Si une action échoue, expliquer brièvement pourquoi
`;
```

### 2.2 Tools disponibles pour JM

```typescript
const JM_TOOLS = {

  // ─── Projets ────────────────────────────────────────────────────
  search_projects: {
    description: "Cherche des projets par nom, code ou adresse",
    inputSchema: z.object({ query: z.string() }),
  },
  get_project_status: {
    description: "Résumé d'un projet : tâches, emails, réunions, planning",
    inputSchema: z.object({ project_id: z.string() }),
  },

  // ─── Tâches ─────────────────────────────────────────────────────
  create_task: {
    description: "Crée une nouvelle tâche sur un projet",
    inputSchema: z.object({
      project_id: z.string(),
      title: z.string(),
      description: z.string().optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
      due_date: z.string().optional(),     // Format: YYYY-MM-DD
      assigned_to: z.string().optional(),  // user_id
    }),
  },
  list_tasks: {
    description: "Liste les tâches d'un projet avec filtres optionnels",
    inputSchema: z.object({
      project_id: z.string(),
      status: z.enum(["todo", "in_progress", "waiting", "done"]).optional(),
      overdue_only: z.boolean().optional(),
    }),
  },

  // ─── Emails ─────────────────────────────────────────────────────
  send_email: {
    description: "Envoie un email depuis le compte de l'utilisateur. TOUJOURS confirmer avant.",
    inputSchema: z.object({
      to_email: z.string(),
      to_name: z.string().optional(),
      subject: z.string(),
      body_html: z.string(),
      project_id: z.string().optional(),
    }),
  },
  get_unread_emails: {
    description: "Liste les emails non traités (action_required/urgent)",
    inputSchema: z.object({
      project_id: z.string().optional(),
      limit: z.number().default(5),
    }),
  },

  // ─── Fournisseurs & Prix ─────────────────────────────────────────
  search_suppliers: {
    description: "Cherche des fournisseurs par spécialité ou nom",
    inputSchema: z.object({
      query: z.string(),
      cfc_code: z.string().optional(),
    }),
  },
  get_price_comparison: {
    description: "Compare les prix d'un item entre fournisseurs",
    inputSchema: z.object({
      description: z.string(),
      unit: z.string().optional(),
    }),
  },

  // ─── Briefing ────────────────────────────────────────────────────
  get_today_briefing: {
    description: "Retourne le briefing du jour (tâches urgentes, emails, réunions)",
    inputSchema: z.object({}),
  },
};
```

### 2.3 Mémoire de conversation

```typescript
// Récupérer les 20 derniers messages pour le contexte
async function getConversationHistory(userId: string): Promise<CoreMessage[]> {
  const { data } = await supabase
    .from("whatsapp_conversations")
    .select("role, content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []).reverse().map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));
}
```

### 2.4 Gestion des confirmations

Pour les actions destructives (envoi email, création en masse), JM demande une confirmation avant d'agir.

```
Julien : "Envoie un mail à tous les fournisseurs béton"
JM     : "⚠️ Je vais envoyer un email à 4 fournisseurs :
          - Almeida Matériaux
          - Béton Vaudois SA
          - Granulats Suisses
          - CEMEX Suisse
          Tu confirmes ?"
Julien : "Oui"
JM     : "✅ 4 emails envoyés."
```

Implémentation : état `pending_confirmation` stocké dans la conversation.

---

## Phase 3 — Transcription Vocale (Jour 3)

WhatsApp envoie l'audio comme une URL temporaire (validité 5 minutes).

```typescript
async function handleAudioMessage(audioId: string, userId: string): Promise<string> {
  // 1. Télécharger l'URL du fichier audio depuis Meta
  const mediaResponse = await fetch(
    `https://graph.facebook.com/v19.0/${audioId}`,
    { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } }
  );
  const { url } = await mediaResponse.json();

  // 2. Télécharger le fichier audio
  const audioResponse = await fetch(url, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` }
  });
  const audioBuffer = await audioResponse.arrayBuffer();

  // 3. Whisper (déjà intégré dans le projet ✅)
  const transcription = await transcribeAudioChunked(
    Buffer.from(audioBuffer),
    "audio/ogg"  // Format WhatsApp
  );

  return transcription;
}
```

---

## Phase 4 — Liaison Compte & Settings (Jour 4)

### 4.1 Flow de connexion (OTP WhatsApp)

```
Utilisateur dans Settings → "Connecter WhatsApp"
  ↓
Saisit son numéro (+41...)
  ↓
Cantaia envoie un message WhatsApp avec un code à 6 chiffres
(via Meta Template Message — templates requis pour messages outbound initiaux)
  ↓
Utilisateur entre le code dans Settings
  ↓
Numéro validé → enregistré dans whatsapp_users
```

### 4.2 Template Message Meta (à créer dans Meta Business Manager)

```
Nom du template : cantaia_verification
Catégorie : Authentication
Corps : "Votre code de vérification Cantaia est : {{1}}"
```

### 4.3 Composant Settings

Nouvel onglet dans `/settings` → **"JM WhatsApp"** :
- Affiche le statut (connecté / non connecté)
- Formulaire de connexion (numéro → vérification OTP)
- Option "Déconnecter"
- Aide : "Envoyez 'aide' à JM sur WhatsApp pour voir les commandes disponibles"

---

## Phase 5 — Sécurité & Limites (Jour 5)

### 5.1 Sécurité webhook

```typescript
// Vérification signature HMAC-SHA256
function verifyWebhookSignature(payload: string, signature: string): boolean {
  const expected = createHmac("sha256", WHATSAPP_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  return timingSafeEqual(
    Buffer.from(`sha256=${expected}`),
    Buffer.from(signature)
  );
}
```

### 5.2 Rate limiting

- Max 30 messages WhatsApp → JM par heure par utilisateur
- Réutilise `@upstash/ratelimit` (déjà recommandé pour les routes IA)
- Au-delà : "⏳ Tu m'as beaucoup sollicité ! Attends quelques minutes."

### 5.3 Numéros non liés

Si un message arrive d'un numéro non enregistré dans `whatsapp_users` :
```
"👋 Bonjour ! Je suis JM, l'assistant Cantaia.
Pour m'utiliser, connecte ton numéro dans Cantaia :
Settings → JM WhatsApp → Connecter"
```

### 5.4 Audit log

Toutes les actions de JM loggées dans `api_usage_logs` :
```typescript
await trackApiUsage({
  userId,
  actionType: "whatsapp_jm",
  provider: "anthropic",
  model: "claude-sonnet-4-6",
  tokens: usage.totalTokens,
  estimatedCostChf: /* calculé */,
});
```

---

## Structure des fichiers à créer

```
packages/core/src/whatsapp/
  ├── jm-agent.ts          — Agent Claude avec tools
  ├── tools/
  │   ├── project-tools.ts  — search_projects, get_project_status
  │   ├── task-tools.ts     — create_task, list_tasks
  │   ├── email-tools.ts    — send_email, get_unread_emails
  │   └── price-tools.ts    — search_suppliers, get_price_comparison
  ├── conversation.ts       — Historique Supabase (lecture/écriture)
  ├── audio-handler.ts      — Download Meta audio → Whisper
  └── whatsapp-client.ts    — Envoi messages via Meta API

apps/web/src/app/api/whatsapp/
  ├── webhook/
  │   └── route.ts          — GET (challenge) + POST (messages entrants)
  └── send/
      └── route.ts          — Envoi message sortant (interne)

apps/web/src/components/settings/
  └── WhatsappTab.tsx       — UI connexion + statut dans Settings

packages/database/migrations/
  └── 063_whatsapp.sql      — whatsapp_users + whatsapp_conversations
```

---

## Coûts Mensuels

| Poste | Détail | Coût estimé |
|-------|--------|------------|
| **WhatsApp Business API** | 1 000 conv. gratuites/mois (Meta) | **0 CHF** |
| Au-delà des 1 000 conv. | ~0.045 CHF/conversation (Suisse) | Variable |
| **Numéro dédié JM** | SIM virtuelle (ex: Fonicom) | **~8 CHF/mois** |
| **Claude API** | ~50 messages/jour × 5 users | **~5–10 CHF/mois** |
| **Whisper** | Audio ~3 min/jour × 5 users | **~1 CHF/mois** |
| **Vercel Functions** | Inclus plan actuel | **0 CHF** |
| **Total estimé** | | **~14–19 CHF/mois** |

---

## Phases de déploiement

| Phase | Durée | Livrable |
|-------|-------|----------|
| **1 — Infrastructure** | Jour 1 | Migration DB, webhook endpoint, variables env |
| **2 — Agent JM** | Jours 2–3 | Tool calling, mémoire, confirmation, tous les tools |
| **3 — Voix** | Jour 3 | Transcription audio WhatsApp → Whisper → JM |
| **4 — Settings** | Jour 4 | UI liaison compte, OTP, template Meta |
| **5 — Sécurité** | Jour 5 | Rate limiting, audit log, numéros inconnus, tests |

---

## Prérequis Julien (avant de commencer)

1. **Créer un compte Meta Business vérifié**
   → https://business.facebook.com

2. **Créer une Meta Developer App**
   → https://developers.facebook.com → "Créer une app" → type "Business"
   → Ajouter le produit "WhatsApp"

3. **Acheter un numéro dédié pour JM**
   → SIM virtuelle suisse ou numéro VoIP
   → Fonicom.ch ou Comtelia.ch (~8 CHF/mois)
   → Ce numéro DOIT être un numéro propre (jamais utilisé sur WhatsApp personnel)

4. **Créer le Template Message d'authentification**
   → Meta Business Manager → "Modèles de message" → "Authentification"
   → Nom : `cantaia_verification`

5. **Récupérer les secrets** :
   - `WHATSAPP_PHONE_NUMBER_ID` (dans Meta Developer Console)
   - `WHATSAPP_ACCESS_TOKEN` (token permanent, à générer dans Meta)
   - `WHATSAPP_WEBHOOK_SECRET` (à définir librement, min 32 chars)

---

## Extensions futures (v2)

- **Image WhatsApp → Plan Analysis** : photo d'un plan ou d'un bon de livraison → Claude Vision → analyse directement dans WhatsApp
- **Notifications push sortantes** : JM prévient proactivement ("Réunion dans 1h", "Email urgent de Michel Almeida")
- **WhatsApp Groups** : JM dans un groupe de chantier → répond aux questions de l'équipe
- **Telegram en parallèle** : même agent, zéro coût supplémentaire (via Chat SDK)
- **Workflow DevKit** pour les tâches complexes durables (ex: suivi d'appel d'offres multi-étapes avec pauses humaines)

---

*Plan rédigé le 2026-03-29 — à implémenter après la phase de commercialisation*
