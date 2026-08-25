import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCron } from "@/lib/cron-auth";

/**
 * POST /api/cron/calibrate
 * CRON Vercel — hebdomadaire, lundi 05h00 (voir apps/web/vercel.json)
 * Rafraîchit les vues matérialisées et met à jour les profils d'erreur modèle
 */
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/calibrate
 * Vercel Cron invokes scheduled paths with GET — delegate to POST.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  try {
    // Convention crons : isAuthorizedCron (fail-closed si CRON_SECRET absent).
    if (!isAuthorizedCron(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const startTime = Date.now();
    const logs: string[] = [];

    // 1. Rafraîchir les vues matérialisées.
    // supabase-js ne THROW PAS : l'erreur revient dans `{error}`. Sans la lire,
    // le log annonçait « Views refreshed successfully » même quand le REFRESH
    // échouait (vue absente, lock concurrent) — les coefficients servis
    // restaient périmés en silence.
    {
      const { error: refreshError } = await (adminClient as any).rpc("refresh_calibration_views");
      if (refreshError) {
        logs.push(`View refresh error: ${refreshError.message}`);
      } else {
        logs.push("Views refreshed successfully");
      }
    }

    // 2. Vérifier les nouvelles corrections (fenêtre = 7 jours, aligné sur le cron hebdo)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { count: newCorrections, error: corrError } = await (adminClient as any)
      .from("quantity_corrections")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneWeekAgo);
    if (corrError) logs.push(`Corrections count error: ${corrError.message}`);

    const { count: newCalibrations, error: calibError } = await (adminClient as any)
      .from("price_calibrations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneWeekAgo);
    if (calibError) logs.push(`Calibrations count error: ${calibError.message}`);

    logs.push(`New corrections: ${newCorrections ?? 0}, New calibrations: ${newCalibrations ?? 0}`);

    // AUDIT 08/2026 — ce cron était le SECOND writer de `model_error_profiles`
    // (erreur signée agrégée cross-org) et entrait en conflit avec le writer
    // incrémental de /api/plans/corrections (|erreur| absolue). Writer UNIQUE
    // désormais : `updateModelErrorProfilesForOrg` (@cantaia/core/learning),
    // déclenché de façon synchrone à chaque correction, org-scopé (migration
    // 102). Ce cron ne touche plus aux profils — il ne fait que rafraîchir les
    // vues matérialisées de calibration.

    const duration = Date.now() - startTime;
    logs.push(`Duration: ${duration}ms`);

    // Log console uniquement — api_usage_logs trace les appels IA facturés
    // (schéma 004 : action_type/api_provider/model/tokens), pas les runs de cron.
    console.log(
      `[cron/calibrate] Done in ${duration}ms — corrections: ${newCorrections ?? 0}, calibrations: ${newCalibrations ?? 0}`,
      logs
    );

    return NextResponse.json({ success: true, logs, duration_ms: duration });
  } catch (err) {
    console.error("[cron/calibrate] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// (Writer cross-org supprimé — voir le commentaire AUDIT 08/2026 dans POST.)
