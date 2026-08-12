import { NextResponse } from "next/server";
import { requireHubAccess } from "@/lib/hub/access";

// Analyse IA des finances personnelles (Claude) :
// analyse de l'allocation, du rythme d'épargne, et propositions de placement
// à titre informatif — TOUJOURS avec disclaimer (pas un conseil financier).
// POST : génère et stocke une nouvelle analyse. GET : retourne la dernière.

export const maxDuration = 120;

const SYSTEM_PROMPT = `Tu es un assistant d'éducation financière pour un particulier vivant en Suisse.
On te fournit ses comptes personnels (types, soldes) et l'évolution mensuelle de son patrimoine.

Ta mission :
1. Analyser l'allocation actuelle (liquidités vs épargne vs investissements vs prévoyance)
2. Commenter le rythme d'épargne (évolution mensuelle du total)
3. Identifier les points d'attention (ex: trop de cash dormant, pas de 3e pilier, concentration)
4. Proposer 3 à 5 pistes de placement GÉNÉRIQUES adaptées au contexte suisse
   (ex: pilier 3a, fonds indiciels/ETF diversifiés, compte épargne à taux préférentiel,
   remboursement de dettes, fonds d'urgence 3-6 mois de dépenses), avec horizon et niveau de risque.

Règles STRICTES :
- Tu fais de l'ÉDUCATION financière générale, PAS du conseil en placement personnalisé.
- Ne recommande JAMAIS un produit, une banque ou un titre spécifique.
- Ne promets JAMAIS de rendement.
- Chaque proposition mentionne son niveau de risque et son horizon.
- Réponds UNIQUEMENT en JSON valide, en français, avec cette structure exacte :
{
  "resume": "2-3 phrases de synthèse",
  "allocation_analyse": "analyse de la répartition actuelle",
  "epargne_analyse": "analyse du rythme d'épargne",
  "points_attention": ["point 1", "point 2"],
  "propositions": [
    { "titre": "...", "description": "...", "horizon": "court|moyen|long terme", "risque": "faible|modéré|élevé" }
  ],
  "disclaimer": "Ces informations sont fournies à titre éducatif uniquement et ne constituent pas un conseil financier personnalisé. Consultez un conseiller financier agréé avant toute décision de placement."
}`;

export async function GET() {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const { data: analysis } = await (admin as any)
      .from("personal_finance_analyses")
      .select("id, content, generated_at")
      .eq("user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ success: true, analysis: analysis || null });
  } catch (error) {
    console.error("[Hub Finance] Analysis get error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const access = await requireHubAccess();
    if (!access.ok) return access.response;
    const { admin, userId } = access;

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 503 });
    }

    // Données financières (comptes + série mensuelle)
    const [{ data: accounts }, { data: snapshots }] = await Promise.all([
      (admin as any)
        .from("personal_finance_accounts")
        .select("id, name, account_type, institution, currency")
        .eq("user_id", userId)
        .eq("is_active", true),
      (admin as any)
        .from("personal_finance_snapshots")
        .select("account_id, snapshot_date, balance")
        .eq("user_id", userId)
        .order("snapshot_date", { ascending: true }),
    ]);

    if (!accounts || accounts.length === 0) {
      return NextResponse.json(
        { error: "Ajoutez au moins un compte avec un solde avant de lancer l'analyse" },
        { status: 400 }
      );
    }

    // Résumé compact pour le prompt (pas de données nominatives inutiles)
    const latestByAccount: Record<string, { date: string; balance: number }> = {};
    for (const s of snapshots || []) {
      const prev = latestByAccount[s.account_id];
      if (!prev || s.snapshot_date > prev.date) {
        latestByAccount[s.account_id] = { date: s.snapshot_date, balance: Number(s.balance) };
      }
    }
    const accountsSummary = accounts.map((a: any) => ({
      type: a.account_type,
      solde: latestByAccount[a.id]?.balance ?? null,
      devise: a.currency,
    }));

    const monthlyTotals: Record<string, number> = {};
    for (const s of snapshots || []) {
      const month = String(s.snapshot_date).slice(0, 7);
      monthlyTotals[month] = 0; // rempli ci-dessous par carry-forward
    }
    for (const month of Object.keys(monthlyTotals)) {
      let total = 0;
      for (const a of accounts) {
        const upTo = (snapshots || [])
          .filter((s: any) => s.account_id === a.id && String(s.snapshot_date).slice(0, 7) <= month)
          .sort((x: any, y: any) => (x.snapshot_date < y.snapshot_date ? 1 : -1))[0];
        if (upTo) total += Number(upTo.balance);
      }
      monthlyTotals[month] = Math.round(total);
    }

    const userPrompt = `Comptes (types et soldes actuels, montants en CHF sauf indication) :
${JSON.stringify(accountsSummary, null, 2)}

Évolution mensuelle du patrimoine total :
${JSON.stringify(monthlyTotals, null, 2)}

Génère l'analyse JSON.`;

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: anthropicApiKey, timeout: 100000 });

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userPrompt },
        { role: "assistant", content: "{" },
      ],
    });

    const raw =
      "{" + (response.content[0]?.type === "text" ? response.content[0].text : "");
    let content: any;
    try {
      content = JSON.parse(raw);
    } catch {
      // Répare les troncatures simples
      const cleaned = raw.replace(/,\s*([\]}])/g, "$1");
      try {
        content = JSON.parse(cleaned);
      } catch {
        return NextResponse.json({ error: "Réponse IA invalide, réessayez" }, { status: 500 });
      }
    }

    const { data: saved, error: saveError } = await (admin as any)
      .from("personal_finance_analyses")
      .insert({ user_id: userId, content })
      .select("id, content, generated_at")
      .single();

    if (saveError) {
      console.warn("[Hub Finance] Analysis save failed:", saveError);
      // On retourne quand même l'analyse générée
      return NextResponse.json({
        success: true,
        analysis: { content, generated_at: new Date().toISOString() },
      });
    }

    return NextResponse.json({ success: true, analysis: saved });
  } catch (error) {
    console.error("[Hub Finance] Analysis error:", error);
    return NextResponse.json({ error: "Échec de l'analyse IA" }, { status: 500 });
  }
}
