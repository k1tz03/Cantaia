import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

/**
 * GET /api/cron/aggregate-benchmarks
 * Vercel Cron invokes scheduled paths with GET — delegate to POST.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

/**
 * POST /api/cron/aggregate-benchmarks
 *
 * ── C2 GELÉ jusqu'à ≥15 orgs opt-in (audit 08/2026) ──────────────────────
 * Agréger des "benchmarks marché" sur une poignée d'orgs produit des valeurs
 * fantômes (médianes à 1-2 contributeurs) que le produit présentait comme un
 * signal de marché. Ce cron est NO-OP tant que la base opt-in n'atteint pas
 * un seuil défendable. La file `aggregation_queue` continue de se remplir
 * (triggers de la migration 038) et sera consommée à la réactivation.
 *
 * Réactivation : restaurer l'implémentation d'origine (git : exécution des 9
 * RPC aggregate_* + marquage sélectif de la file par QUEUE_CONSUMERS) et
 * remettre l'entrée dans apps/web/vercel.json.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  return NextResponse.json({
    success: true,
    frozen: true,
    message: "C2 gelé jusqu'à ≥15 organisations opt-in — agrégation désactivée.",
    processed: 0,
  });
}
