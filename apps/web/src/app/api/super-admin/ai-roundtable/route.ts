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
    instruction: "Tu es l'architecte produit de Cantaia. Tu connais parfaitement le code, l'architecture et les contraintes techniques. Tu proposes des améliorations réalistes et faisables. Tu es pragmatique et orienté valeur utilisateur. Quand tu n'es pas d'accord avec les autres, tu expliques pourquoi techniquement.",
  },
  gpt: {
    name: "GPT-4o",
    role: "UX Designer & Stratège",
    color: "#10B981",
    instruction: "Tu es le UX designer et stratège de Cantaia. Tu te concentres sur l'expérience utilisateur, les parcours, la simplicité, et la stratégie marché. Tu penses en termes de persona (chef de projet pressé sur le terrain, assistante au bureau, direction qui veut des chiffres). Tu challenges les propositions trop techniques qui oublient l'utilisateur.",
  },
  gemini: {
    name: "Gemini",
    role: "Product Manager & Data Analyst",
    color: "#3B82F6",
    instruction: "Tu es le product manager et data analyst de Cantaia. Tu penses en termes de métriques, ROI, adoption, rétention. Tu priorises par impact business. Tu compares avec les concurrents (Procore, BauMaster, Dalux). Tu identifies les quick wins vs les projets long terme. Tu votes pour ou contre chaque idée avec un score impact/effort.",
  },
};

const DISCUSSION_TOPICS = [
  "Quelles sont les 3 fonctionnalités manquantes les plus critiques pour un chef de projet construction en Suisse ? Pourquoi ?",
  "Comment améliorer le taux de conversion du trial vers un plan payant ? Quels sont les friction points actuels ?",
  "Quelle est la killer feature qui différencierait Cantaia de Procore/BauMaster/Dalux et justifierait le prix ?",
  "Comment l'IA pourrait être encore mieux intégrée dans le workflow quotidien ? Quels automatismes manquent ?",
  "Quelles améliorations UX prioritaires pour les utilisateurs mobiles sur le terrain ?",
];

async function callClaude(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1500,
    system: systemPrompt,
    messages: messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  });

  return (response.content[0] as any).text || "";
}

async function callGPT(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1500,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
    ],
  });

  return response.choices[0]?.message?.content || "";
}

async function callGemini(systemPrompt: string, messages: { role: string; content: string }[]): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const fullPrompt = systemPrompt + "\n\n" + messages.map(m => `${m.role === "user" ? "Discussion" : "Toi"}: ${m.content}`).join("\n\n");

  const result = await model.generateContent(fullPrompt);
  return result.response.text() || "";
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

        const openingPrompt = `Voici le sujet de discussion de cette table ronde IA:\n\n"${selectedTopic}"\n\nContexte du projet:\n${PROJECT_CONTEXT}\n\nDonne ton analyse initiale en 200-300 mots. Sois concret et actionnable. Utilise des bullet points et des titres pour structurer.`;

        const aiOrder = [
          { key: "claude", fn: callClaude, ...AI_ROLES.claude },
          { key: "gpt", fn: callGPT, ...AI_ROLES.gpt },
          { key: "gemini", fn: callGemini, ...AI_ROLES.gemini },
        ];

        for (let round = 1; round <= actualRounds; round++) {
          const isLastRound = round === actualRounds;

          const roundInstruction = isLastRound
            ? "\n\nC'est le DERNIER tour. Donne tes recommandations finales: top 3 actions prioritaires avec score impact (1-10) et effort (1-10). Structure avec des titres et bullet points."
            : round === 1
              ? "\n\nStructure ta réponse avec des titres et bullet points."
              : `\n\nTour ${round}/${actualRounds}. Rebondis sur ce que les autres ont dit. Sois d'accord ou en désaccord. Approfondis les meilleures idées. Structure avec des titres et bullet points.`;

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

        // Synthesis
        send({ type: "thinking", speaker: "Synthese", role: "Rapport final", round: 0 });

        const fullDiscussion = conversation.map(c => `[${c.speaker} - ${c.role}] (Tour ${c.round}):\n${c.content}`).join("\n\n---\n\n");

        try {
          const synthesis = await callClaude(
            "Tu es un consultant senior. Génère une synthèse structurée de cette table ronde IA. Format:\n\n## Synthèse\nRésumé en 2-3 phrases.\n\n## Top 5 Recommandations\nPour chaque: titre, description, impact (1-10), effort (1-10), unanimité (oui/non).\n\n## Points de désaccord\nOù les IA ne sont pas d'accord et pourquoi.\n\n## Quick Wins\nActions réalisables en moins d'une semaine.\n\nSois concis et actionnable.",
            [{ role: "user", content: `Voici la discussion complète:\n\n${fullDiscussion}` }]
          );
          send({ type: "synthesis", content: synthesis });
        } catch (e: any) {
          send({ type: "synthesis", content: `[Erreur synthese: ${e.message}]` });
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
