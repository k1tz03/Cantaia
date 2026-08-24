import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
    // Vérifier le secret CRON (fail-closed: deny if env var missing)
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const startTime = Date.now();
    const logs: string[] = [];

    // 1. Rafraîchir les vues matérialisées
    try {
      await (adminClient as any).rpc("refresh_calibration_views");
      logs.push("Views refreshed successfully");
    } catch (err) {
      logs.push(`View refresh error: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    // 2. Vérifier les nouvelles corrections (fenêtre = 7 jours, aligné sur le cron hebdo)
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { count: newCorrections } = await (adminClient as any)
      .from("quantity_corrections")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneWeekAgo);

    const { count: newCalibrations } = await (adminClient as any)
      .from("price_calibrations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneWeekAgo);

    logs.push(`New corrections: ${newCorrections ?? 0}, New calibrations: ${newCalibrations ?? 0}`);

    // 3. Recalculer les model_error_profiles si nouvelles corrections
    if (newCorrections && newCorrections > 0) {
      await updateModelErrorProfiles(adminClient, logs);
    }

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

async function updateModelErrorProfiles(adminClient: any, logs: string[]) {
  try {
    // Récupérer les combinaisons provider × discipline × cfc avec ≥5 corrections de ≥5 orgs
    const { data: aggregates } = await adminClient.rpc("get_model_error_aggregates");

    // Fallback : requête directe si la fonction RPC n'existe pas
    if (!aggregates) {
      const { data } = await (adminClient as any)
        .from("quantity_corrections")
        .select("modele_plus_eloigne, discipline, cfc_code, ecart_pct, org_id");

      if (!data || data.length === 0) return;

      // Agréger manuellement
      const groups = new Map<string, { ecarts: number[]; orgs: Set<string> }>();
      for (const row of data) {
        if (!row.modele_plus_eloigne) continue;
        const prefix = row.cfc_code?.split('.')[0] || '';
        const key = `${row.modele_plus_eloigne}::${row.discipline}::${prefix}`;
        const group = groups.get(key) ?? { ecarts: [], orgs: new Set() };
        group.ecarts.push(Number(row.ecart_pct));
        group.orgs.add(row.org_id);
        groups.set(key, group);
      }

      let updated = 0;
      for (const [key, group] of groups) {
        if (group.ecarts.length < 5 || group.orgs.size < 5) continue;

        const [provider, discipline, cfcPrefix] = key.split('::');
        const avg = group.ecarts.reduce((a, b) => a + b, 0) / group.ecarts.length;
        const sorted = [...group.ecarts].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)];
        const stddev = Math.sqrt(group.ecarts.reduce((s, v) => s + (v - avg) ** 2, 0) / group.ecarts.length);

        const tendance = Math.abs(avg) > 5 ? (avg > 0 ? 'surestime' : 'sous_estime') : 'neutre';
        const coefficient = 1 - (avg / 100);
        const fiabilite = Math.max(0, Math.min(1, 1 - stddev / 50));

        await (adminClient as any)
          .from("model_error_profiles")
          .upsert({
            provider,
            discipline,
            type_element_cfc: cfcPrefix,
            nb_corrections: group.ecarts.length,
            contributor_count: group.orgs.size,
            ecart_moyen_pct: Math.round(avg * 100) / 100,
            ecart_median_pct: Math.round(med * 100) / 100,
            ecart_stddev_pct: Math.round(stddev * 100) / 100,
            tendance,
            coefficient_correction: Math.round(coefficient * 1000) / 1000,
            fiabilite: Math.round(fiabilite * 100) / 100,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'provider,discipline,type_element_cfc' });

        updated++;
      }

      logs.push(`Model error profiles updated: ${updated}`);
    }
  } catch (err) {
    logs.push(`Model error profile update error: ${err instanceof Error ? err.message : 'unknown'}`);
  }
}
