import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

// Condensed project context for the AIs
const PROJECT_CONTEXT = `
Cantaia est un SaaS de gestion de chantier augmenté par IA pour la construction en Suisse.
Stack: Next.js 15, React 19, TypeScript, Supabase (PostgreSQL), Tailwind CSS, shadcn/ui.
IA: Claude (principal), GPT-4o (Vision), Gemini 2.0 Flash (estimation).

MODULES ACTIFS:
1. Cantaia Mail — Sync Outlook/Gmail, classification IA 7 niveaux, vue décisions (urgent/thisWeek/info)
2. Cantaia Soumissions — Upload Excel/PDF, analyse IA, 180+ postes, budget IA (CRB + fournisseurs + IA), wizard demandes de prix 4 étapes
3. Cantaia Prix — Chiffrage IA, import prix bulk, analyse benchmark, historique
4. Cantaia Plans — Registre plans, analyse Vision multi-modèle, estimation 4 passes, calibration
5. Assistant IA (Chat) — Chat Claude avec upload fichiers (PDF/Excel/images), extraction texte + Vision
6. Portail Chef d'Équipe — Accès PIN, rapport journalier (heures personnel, machines, bons livraison, photos), 4 onglets mobile-first
7. Rapports Chantier (Centralisation) — Vue assistantes: heures par ouvrier/semaine, bons de livraison, export Excel/PDF
8. Support Tickets — Système tickets avec thread conversationnel, badges non-lu
9. Planning — Gantt interactif, génération IA, export PDF A3
10. Statistiques Direction — Clôture financière (montant facturé + coûts), dashboard rentabilité org
11. Briefing Quotidien — Résumé IA quotidien emails/tâches/deadlines
12. Dashboard — Vue personnelle + Vue Organisation (direction)

UTILISATEURS: Chefs de projet construction, conducteurs de travaux, assistantes, direction — en Suisse (FR/DE)
PRICING: Trial 14j gratuit, Starter 149 CHF/mois, Pro 349 CHF/mois, Enterprise 790 CHF/mois
CONCURRENTS: Procore, PlanGrid, Fieldwire, BauMaster, Dalux
BASE CLIENTS: PME construction suisses (5-50 employés)
`;

const AI_ROLES = {
  claude: {
    name: "Claude",
    role: "Architecte Produit",
    color: "#D97706",
    instruction: `Tu participes à une TABLE RONDE avec GPT-4o et Gemini. C'est une DISCUSSION, pas une analyse.

RÈGLES DE CONVERSATION:
- Tu t'adresses DIRECTEMENT aux autres ("GPT, je suis d'accord avec ton point sur...", "Gemini, tu oublies que...")
- Tu réagis à ce que les autres ont dit AVANT de proposer tes propres idées
- Tu peux être en DÉSACCORD — argumente pourquoi
- Tu poses des QUESTIONS aux autres ("GPT, comment tu implémenterais ça concrètement ?")
- Sois BREF (150 mots max par intervention) — c'est une discussion, pas un rapport
- Tu parles comme dans une vraie réunion, pas comme un document

TON RÔLE: Architecte Produit. Tu connais le code, l'architecture, les contraintes techniques. Tu dis quand c'est faisable ou pas, et combien de temps ça prend.`,
  },
  gpt: {
    name: "GPT-4o",
    role: "UX Designer & Stratège",
    color: "#10B981",
    instruction: `Tu participes à une TABLE RONDE avec Claude et Gemini. C'est une DISCUSSION, pas une analyse.

RÈGLES DE CONVERSATION:
- Tu t'adresses DIRECTEMENT aux autres ("Claude, techniquement c'est bien mais l'utilisateur s'en fiche...", "Gemini, ton ROI est théorique...")
- Tu réagis à ce que les autres ont dit AVANT de proposer tes propres idées
- Tu CHALLENGES les propositions trop techniques qui oublient l'utilisateur
- Tu poses des QUESTIONS ("Claude, ça prend combien de temps ?", "Gemini, tu as des chiffres ?")
- Sois BREF (150 mots max) — c'est une discussion, pas un rapport
- Tu parles comme dans une vraie réunion

TON RÔLE: UX Designer & Stratège. Tu penses utilisateur (chef de projet pressé sur le terrain, assistante au bureau, direction). Tu simplifies tout.`,
  },
  gemini: {
    name: "Gemini",
    role: "Product Manager & Data Analyst",
    color: "#3B82F6",
    instruction: `Tu participes à une TABLE RONDE avec Claude et GPT-4o. C'est une DISCUSSION, pas une analyse.

RÈGLES DE CONVERSATION:
- Tu t'adresses DIRECTEMENT aux autres ("Claude, j'aime ton idée mais le ROI est faible...", "GPT, l'UX c'est bien mais on doit prioriser...")
- Tu réagis à ce que les autres ont dit AVANT de proposer tes propres idées
- Tu PRIORISES — tu donnes un score impact/effort à chaque idée discutée
- Tu compares avec les CONCURRENTS quand c'est pertinent
- Sois BREF (150 mots max) — c'est une discussion, pas un rapport
- Tu parles comme dans une vraie réunion

TON RÔLE: Product Manager. Tu penses métriques, ROI, conversion, rétention. Tu votes pour/contre chaque idée.`,
  },
};

const DISCUSSION_TOPICS = [
  "Quelles sont les 3 fonctionnalités manquantes les plus critiques pour un chef de projet construction en Suisse ? Pourquoi ?",
  "Comment améliorer le taux de conversion du trial vers un plan payant ? Quels sont les friction points actuels ?",
  "Quelle est la killer feature qui différencierait Cantaia de Procore/BauMaster/Dalux et justifierait le prix ?",
  "Comment l'IA pourrait être encore mieux intégrée dans le workflow quotidien ? Quels automatismes manquent ?",
  "Quelles améliorations UX prioritaires pour les utilisateurs mobiles sur le terrain ?",
];

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, delayMs = 5000): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const status = e?.status || e?.statusCode || 0;
      if ((status === 429 || status === 529 || status === 503) && i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries exceeded");
}

async function callClaude(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  return withRetry(async () => {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1500,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    });
    return (response.content[0] as any).text || "";
  });
}

async function callGPT(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  return withRetry(async () => {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 1500,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
      ],
    });
    return response.choices[0]?.message?.content || "";
  });
}

async function callGemini(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

  const fullPrompt = systemPrompt + "\n\n" + messages.map(m => `${m.role === "user" ? "Discussion" : "Toi"}: ${m.content}`).join("\n\n");

  return withRetry(async () => {
    const result = await model.generateContent(fullPrompt);
    return result.response.text() || "";
  });
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("is_superadmin").eq("id", user.id).single();
    if (!profile?.is_superadmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { topic, rounds = 3 } = body;

    const selectedTopic = topic || DISCUSSION_TOPICS[Math.floor(Math.random() * DISCUSSION_TOPICS.length)];
    const actualRounds = Math.min(Math.max(rounds, 1), 20);

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(data: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }

        send({ type: "start", topic: selectedTopic, rounds: actualRounds });

        const conversation: { speaker: string; role: string; content: string; color: string; round: number }[] = [];

        const openingPrompt = `SUJET DE DISCUSSION: "${selectedTopic}"\n\nContexte:\n${PROJECT_CONTEXT}\n\nC'est le début de la table ronde. Lance la discussion avec ton point de vue en 100-150 mots. Sois direct et concret.`;

        const aiOrder = [
          { key: "claude", fn: callClaude, ...AI_ROLES.claude },
          { key: "gpt", fn: callGPT, ...AI_ROLES.gpt },
          { key: "gemini", fn: callGemini, ...AI_ROLES.gemini },
        ];

        for (let round = 1; round <= actualRounds; round++) {
          const isLastRound = round === actualRounds;

          const roundInstruction = isLastRound
            ? "\n\nDERNIER TOUR. Donne ton verdict final en 2-3 phrases. Quelle est LA priorité n°1 selon toi ?"
            : round === 1
              ? ""
              : `\n\nTour ${round}/${actualRounds}. RÉPONDS aux autres — cite-les par leur nom. Sois d'accord, en désaccord, ou nuance. 100-150 mots max.`;

          for (const ai of aiOrder) {
            // Send "thinking" event before calling the AI
            send({ type: "thinking", speaker: ai.name, role: ai.role, round });

            // Build conversation history
            const historyText = conversation.map(c => `[${c.speaker} - ${c.role}] (Tour ${c.round}):\n${c.content}`).join("\n\n---\n\n");

            const systemPrompt = `${ai.instruction}\n\nContexte projet:\n${PROJECT_CONTEXT}${roundInstruction}`;
            const messages = round === 1 && conversation.length === 0
              ? [{ role: "user", content: openingPrompt }]
              : round === 1
                ? [{ role: "user", content: `${openingPrompt}\n\nDiscussion jusqu'ici:\n${historyText}\n\nDonne ta perspective.` }]
                : [{ role: "user", content: `Discussion en cours:\n\n${historyText}\n\nC'est ton tour (Tour ${round}). Continue la discussion.${roundInstruction}` }];

            try {
              const response = await ai.fn(systemPrompt, messages);
              const msg = { speaker: ai.name, role: ai.role, content: response, color: ai.color, round };
              conversation.push(msg);
              send({ type: "message", ...msg });
            } catch (e: any) {
              const errorMsg = { speaker: ai.name, role: ai.role, content: `[Erreur: ${e.message}]`, color: ai.color, round };
              conversation.push(errorMsg);
              send({ type: "message", ...errorMsg });
            }
          }
        }

        // Rapport final par Claude
        send({ type: "thinking", speaker: "Claude", role: "Rédaction du rapport", round: 0 });

        const fullDiscussion = conversation.map(c => `[${c.speaker} - ${c.role}] (Tour ${c.round}):\n${c.content}`).join("\n\n---\n\n");

        try {
          const synthesis = await callClaude(
            `Tu viens de participer à une table ronde avec GPT-4o et Gemini sur Cantaia. Maintenant, rédige un RAPPORT D'ACTION concret pour Julien (le fondateur).

Format OBLIGATOIRE:

# Rapport Table Ronde IA — [sujet]

## Résumé en 3 lignes
Ce sur quoi les 3 IA sont tombées d'accord.

## Plan d'action — Top 5 priorités
Pour chaque action:
| # | Action | Impact (1-10) | Effort (1-10) | Consensus | Délai estimé |
Avec une description de 2 lignes max.

## Ce qu'il NE FAUT PAS faire
Idées rejetées ou jugées trop coûteuses par au moins 2 IA.

## Désaccords non résolus
Points où les IA ne sont pas d'accord — à trancher par Julien.

## Quick wins (< 1 semaine)
3 actions faisables immédiatement.

## Prochaine table ronde suggérée
Quel sujet approfondir en priorité.

Sois concret, actionnable, et honnête sur ce qui n'a pas fait consensus.`,
            [{ role: "user", content: `Discussion complète:\n\n${fullDiscussion}` }]
          );
          send({ type: "synthesis", content: synthesis });
        } catch (e: any) {
          send({ type: "synthesis", content: `[Erreur rapport: ${e.message}]` });
        }

        send({ type: "done" });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("[AI Roundtable] Error:", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
