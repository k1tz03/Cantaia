import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/benchmarks/market?cfc_code=xxx&region=xxx&quarter=xxx
 *
 * ── C2 GELÉ jusqu'à ≥15 orgs opt-in (audit 08/2026) ──────────────────────
 * Avec une poignée d'orgs contributrices, les "benchmarks marché" étaient des
 * valeurs fantômes : des médianes calculées sur 1-2 contributeurs, présentées
 * comme un signal de marché. Tant que la base opt-in n'atteint pas un seuil
 * statistiquement défendable, cette route répond un état `insufficient_data`
 * propre plutôt que des chiffres trompeurs.
 *
 * Réactivation : restaurer l'implémentation d'origine (git : lecture de
 * `market_benchmarks` + `regional_price_index` derrière le consentement
 * `aggregation_consent(module='prix')`) et redéployer les crons d'agrégation.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({
    status: "insufficient_data",
    reason:
      "C2 gelé jusqu'à ≥15 organisations opt-in — pas assez de contributeurs pour des benchmarks fiables.",
    benchmarks: [],
    regional_index: null,
  });
}
