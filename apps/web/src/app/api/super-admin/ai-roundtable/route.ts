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
    model: "gpt-4.1",
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
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

  const fullPrompt = systemPrompt + "\n\n" + messages.map(m => `${m.role === "user" ? "Discussion" : "Toi"}: ${m.content}`).join("\n\n");

  const result = await model.generateContent(fullPrompt);
  return result.response.text() || "";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("users").select("is_superadmin").eq("id", user.id).single();
    if (!profile?.is_superadmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { topic, rounds = 3 } = body;

    const selectedTopic = topic || DISCUSSION_TOPICS[Math.floor(Math.random() * DISCUSSION_TOPICS.length)];
    const actualRounds = Math.min(Math.max(rounds, 2), 5);

    const conversation: { speaker: string; role: string; content: string; color: string; round: number }[] = [];

    // Opening topic
    const openingPrompt = `Voici le sujet de discussion de cette table ronde IA:\n\n"${selectedTopic}"\n\nContexte du projet:\n${PROJECT_CONTEXT}\n\nDonne ton analyse initiale en 200-300 mots. Sois concret et actionnable.`;

    for (let round = 1; round <= actualRounds; round++) {
      const isLastRound = round === actualRounds;

      // Build conversation history for each AI
      const historyText = conversation.map(c => `[${c.speaker} - ${c.role}] (Tour ${c.round}):\n${c.content}`).join("\n\n---\n\n");

      const roundInstruction = isLastRound
        ? "\n\nC'est le DERNIER tour. Donne tes recommandations finales: top 3 actions prioritaires avec score impact (1-10) et effort (1-10). Sois synthétique."
        : round === 1
          ? ""
          : `\n\nTour ${round}/${actualRounds}. Rebondis sur ce que les autres ont dit. Sois d'accord ou en désaccord. Approfondis les meilleures idées. Ajoute de nouvelles perspectives.`;

      // Claude speaks
      const claudeSystem = `${AI_ROLES.claude.instruction}\n\nContexte projet:\n${PROJECT_CONTEXT}${roundInstruction}`;
      const claudeHistory = round === 1
        ? [{ role: "user", content: openingPrompt }]
        : [{ role: "user", content: `Discussion en cours:\n\n${historyText}\n\nC'est ton tour (Tour ${round}). Continue la discussion.${roundInstruction}` }];

      try {
        const claudeResponse = await callClaude(claudeSystem, claudeHistory);
        conversation.push({ speaker: "Claude", role: AI_ROLES.claude.role, content: claudeResponse, color: AI_ROLES.claude.color, round });
      } catch (e: any) {
        conversation.push({ speaker: "Claude", role: AI_ROLES.claude.role, content: `[Erreur: ${e.message}]`, color: AI_ROLES.claude.color, round });
      }

      // GPT speaks
      const updatedHistory1 = conversation.map(c => `[${c.speaker} - ${c.role}] (Tour ${c.round}):\n${c.content}`).join("\n\n---\n\n");
      const gptSystem = `${AI_ROLES.gpt.instruction}\n\nContexte projet:\n${PROJECT_CONTEXT}${roundInstruction}`;
      const gptMessages = round === 1
        ? [{ role: "user", content: `${openingPrompt}\n\nVoici ce que Claude (Architecte Produit) a dit:\n${conversation[conversation.length - 1].content}\n\nDonne ta perspective.` }]
        : [{ role: "user", content: `Discussion en cours:\n\n${updatedHistory1}\n\nC'est ton tour (Tour ${round}). Continue la discussion.${roundInstruction}` }];

      try {
        const gptResponse = await callGPT(gptSystem, gptMessages);
        conversation.push({ speaker: "GPT-4o", role: AI_ROLES.gpt.role, content: gptResponse, color: AI_ROLES.gpt.color, round });
      } catch (e: any) {
        conversation.push({ speaker: "GPT-4o", role: AI_ROLES.gpt.role, content: `[Erreur: ${e.message}]`, color: AI_ROLES.gpt.color, round });
      }

      // Gemini speaks
      const updatedHistory2 = conversation.map(c => `[${c.speaker} - ${c.role}] (Tour ${c.round}):\n${c.content}`).join("\n\n---\n\n");
      const geminiSystem = `${AI_ROLES.gemini.instruction}\n\nContexte projet:\n${PROJECT_CONTEXT}${roundInstruction}`;
      const geminiMessages = round === 1
        ? [{ role: "user", content: `${openingPrompt}\n\nDiscussion:\n${updatedHistory2}\n\nDonne ta perspective en tant que Product Manager.` }]
        : [{ role: "user", content: `Discussion en cours:\n\n${updatedHistory2}\n\nC'est ton tour (Tour ${round}). Continue la discussion.${roundInstruction}` }];

      try {
        const geminiResponse = await callGemini(geminiSystem, geminiMessages);
        conversation.push({ speaker: "Gemini", role: AI_ROLES.gemini.role, content: geminiResponse, color: AI_ROLES.gemini.color, round });
      } catch (e: any) {
        conversation.push({ speaker: "Gemini", role: AI_ROLES.gemini.role, content: `[Erreur: ${e.message}]`, color: AI_ROLES.gemini.color, round });
      }
    }

    // Generate final synthesis with Claude
    const fullDiscussion = conversation.map(c => `[${c.speaker} - ${c.role}] (Tour ${c.round}):\n${c.content}`).join("\n\n---\n\n");

    let synthesis = "";
    try {
      synthesis = await callClaude(
        "Tu es un consultant senior. Génère une synthèse structurée de cette table ronde IA. Format:\n\n## Synthèse\nRésumé en 2-3 phrases.\n\n## Top 5 Recommandations\nPour chaque: titre, description, impact (1-10), effort (1-10), unanimité (oui/non — les 3 IA sont d'accord).\n\n## Points de désaccord\nOù les IA ne sont pas d'accord et pourquoi.\n\n## Quick Wins (impact élevé, effort faible)\nActions réalisables en moins d'une semaine.\n\nSois concis et actionnable.",
        [{ role: "user", content: `Voici la discussion complète:\n\n${fullDiscussion}` }]
      );
    } catch {}

    return NextResponse.json({
      success: true,
      topic: selectedTopic,
      rounds: actualRounds,
      conversation,
      synthesis,
      topics: DISCUSSION_TOPICS,
    });

  } catch (error: any) {
    console.error("[AI Roundtable] Error:", error);
    return NextResponse.json({ error: error.message || "Internal error" }, { status: 500 });
  }
}
