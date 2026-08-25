import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

/** Vercel Cron invokes scheduled paths with GET — delegate to POST. */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/cron/extract-patterns
 *
 * ── C2 GELÉ jusqu'à ≥15 orgs opt-in (audit 08/2026) ──────────────────────
 * Ce cron extrayait des "patterns" C3 depuis les agrégats C2 — qui sont
 * eux-mêmes gelés (voir /api/cron/aggregate-benchmarks) car calculés sur une
 * poignée d'orgs. Extraire des patterns de valeurs fantômes ne fait que les
 * blanchir. NO-OP tant que la base opt-in n'atteint pas le seuil.
 *
 * Réactivation : restaurer l'implémentation d'origine (git : calcul des
 * ai_quality_metrics + extraction pattern_library pour les 9 modules) et
 * remettre l'entrée dans apps/web/vercel.json.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    frozen: true,
    message: "C2 gelé jusqu'à ≥15 organisations opt-in — extraction de patterns désactivée.",
    results: [],
  });
}
