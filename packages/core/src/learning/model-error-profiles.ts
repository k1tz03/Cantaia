// ============================================================
// model_error_profiles — writer UNIQUE (refonte audit 08/2026)
// ============================================================
//
// AVANT : deux écrivains contradictoires —
//   * /api/plans/corrections écrivait la |erreur| ABSOLUE, incrémentale,
//     dans `ecart_moyen_pct`/`ecart_median_pct` ;
//   * /api/cron/calibrate réécrivait les mêmes lignes avec l'erreur SIGNÉE
//     agrégée cross-org.
// Le même champ portait donc deux sémantiques selon le dernier passé, et le
// lecteur des poids du consensus mélangeait en plus fraction (0.15) et
// pourcents → un provider sans données pesait ~2,4× un provider mesuré.
//
// APRÈS (ce module, seul point d'écriture) :
//   * profil RECALCULÉ depuis les `quantity_corrections` de l'ORG à chaque
//     correction (pas d'accumulation incrémentale qui dérive) ;
//   * erreur SIGNÉE, en POURCENTS, médiane comme métrique centrale ;
//   * `nb_corrections` = taille réelle de l'échantillon ;
//   * lignes org-scopées (migration 102) — les lecteurs filtrent org_id.
//
// Le lecteur (poids des providers dans le consensus estimation) doit donner
// des poids ÉGAUX tant que nb_corrections < 5 — voir MIN_SAMPLES_FOR_WEIGHTING.

import { logLearningFailure } from "./log";

/** Providers acceptés par la contrainte CHECK de la migration 043. */
export const MODEL_ERROR_PROVIDERS = ["claude", "gpt4o", "gemini"] as const;
export type ModelErrorProvider = (typeof MODEL_ERROR_PROVIDERS)[number];

/**
 * En dessous de ce nombre de corrections, un profil n'est PAS statistiquement
 * significatif : les lecteurs doivent traiter le provider comme non mesuré
 * (poids neutre égal aux autres).
 */
export const MIN_SAMPLES_FOR_WEIGHTING = 5;

export interface ModelErrorSample {
  /** Quantité proposée par le modèle. */
  value: number;
  /** Quantité corrigée par l'humain (vérité terrain). */
  corrected: number;
}

export interface ProviderErrorProfile {
  nb_corrections: number;
  /** Erreur signée médiane, en POURCENTS (+20 = le modèle surestime de 20 %). */
  ecart_median_pct: number;
  /** Erreur signée moyenne, en POURCENTS. */
  ecart_moyen_pct: number;
  /** Écart-type des erreurs signées, en POURCENTS. */
  ecart_stddev_pct: number;
  tendance: "surestime" | "sous_estime" | "neutre";
  /** Multiplicateur correctif : quantité_corrigée ≈ quantité_modèle × coefficient. */
  coefficient_correction: number;
  /** 0–1, décroît avec la dispersion. */
  fiabilite: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/**
 * Calcule le profil d'erreur d'un provider depuis un échantillon de
 * corrections. Pur (testable sans DB). Retourne null si aucun échantillon
 * exploitable (corrected ≈ 0 ou valeurs non finies écartées).
 */
export function computeProviderErrorProfile(
  samples: ModelErrorSample[]
): ProviderErrorProfile | null {
  const errorsPct: number[] = [];
  for (const s of samples) {
    if (!Number.isFinite(s.value) || !Number.isFinite(s.corrected)) continue;
    if (Math.abs(s.corrected) < 1e-9) continue; // pas de vérité terrain exploitable
    // Erreur SIGNÉE en % : positive = le modèle a surestimé.
    errorsPct.push(((s.value - s.corrected) / Math.abs(s.corrected)) * 100);
  }
  if (errorsPct.length === 0) return null;

  const med = median(errorsPct);
  const avg = errorsPct.reduce((a, b) => a + b, 0) / errorsPct.length;
  const stddev = Math.sqrt(
    errorsPct.reduce((s, v) => s + (v - avg) ** 2, 0) / errorsPct.length
  );

  // médiane +20 % → le modèle surestime → corriger par ×1/1.2.
  // Clamp : une médiane < -80 % donnerait un coefficient délirant.
  const rawCoefficient = 1 / (1 + Math.max(med, -80) / 100);
  const coefficient = Math.min(4, Math.max(0.25, rawCoefficient));

  return {
    nb_corrections: errorsPct.length,
    ecart_median_pct: round3(med),
    ecart_moyen_pct: round3(avg),
    ecart_stddev_pct: round3(stddev),
    tendance: med > 5 ? "surestime" : med < -5 ? "sous_estime" : "neutre",
    coefficient_correction: round3(coefficient),
    fiabilite: round3(Math.max(0, Math.min(1, 1 - stddev / 50))),
  };
}

/**
 * Recalcule et persiste les profils d'erreur (org, discipline, préfixe CFC)
 * pour les trois providers, depuis les `quantity_corrections` de l'org.
 *
 * Appelé après chaque insertion de correction (route /api/plans/corrections).
 * Best-effort : ne throw jamais, les échecs partent dans learning_events.
 */
export async function updateModelErrorProfilesForOrg(
  supabase: any,
  params: { orgId: string; discipline: string; cfcPrefix: string }
): Promise<void> {
  const { orgId, discipline, cfcPrefix } = params;

  try {
    const { data: rows, error: readError } = await supabase
      .from("quantity_corrections")
      .select("valeurs_par_modele, quantite_corrigee")
      .eq("org_id", orgId)
      .eq("discipline", discipline)
      .like("cfc_code", `${cfcPrefix}%`)
      .order("created_at", { ascending: false })
      .limit(200);

    if (readError) {
      await logLearningFailure(supabase, {
        organizationId: orgId,
        module: "plans",
        error: readError,
        context: { table: "quantity_corrections", op: "read", discipline, cfcPrefix },
      });
      return;
    }
    if (!rows || rows.length === 0) return;

    for (const provider of MODEL_ERROR_PROVIDERS) {
      const samples: ModelErrorSample[] = [];
      for (const row of rows) {
        const values = row?.valeurs_par_modele as Record<string, unknown> | null;
        const value = Number(values?.[provider]);
        const corrected = Number(row?.quantite_corrigee);
        if (Number.isFinite(value) && Number.isFinite(corrected)) {
          samples.push({ value, corrected });
        }
      }

      const profile = computeProviderErrorProfile(samples);
      if (!profile) continue;

      // Select→update/insert manuel : l'index unique de la 102 est partiel
      // (WHERE org_id IS NOT NULL), un upsert onConflict PostgREST ne peut
      // pas l'inférer.
      const { data: existing, error: selError } = await supabase
        .from("model_error_profiles")
        .select("id")
        .eq("org_id", orgId)
        .eq("provider", provider)
        .eq("discipline", discipline)
        .eq("type_element_cfc", cfcPrefix)
        .maybeSingle();

      if (selError) {
        await logLearningFailure(supabase, {
          organizationId: orgId,
          module: "plans",
          error: selError,
          context: { table: "model_error_profiles", op: "select", provider, discipline, cfcPrefix },
        });
        continue;
      }

      const payload = {
        nb_corrections: profile.nb_corrections,
        contributor_count: 1, // profil org-scopé : une seule org contributrice
        ecart_moyen_pct: profile.ecart_moyen_pct,
        ecart_median_pct: profile.ecart_median_pct,
        ecart_stddev_pct: profile.ecart_stddev_pct,
        tendance: profile.tendance,
        coefficient_correction: profile.coefficient_correction,
        fiabilite: profile.fiabilite,
        updated_at: new Date().toISOString(),
      };

      if (existing?.id) {
        const { error: updError } = await supabase
          .from("model_error_profiles")
          .update(payload)
          .eq("id", existing.id);
        if (updError) {
          await logLearningFailure(supabase, {
            organizationId: orgId,
            module: "plans",
            error: updError,
            context: { table: "model_error_profiles", op: "update", provider, discipline, cfcPrefix },
          });
        }
      } else {
        const { error: insError } = await supabase.from("model_error_profiles").insert({
          org_id: orgId,
          provider,
          discipline,
          type_element_cfc: cfcPrefix,
          ...payload,
        });
        if (insError) {
          await logLearningFailure(supabase, {
            organizationId: orgId,
            module: "plans",
            error: insError,
            context: { table: "model_error_profiles", op: "insert", provider, discipline, cfcPrefix },
          });
        }
      }
    }
  } catch (err) {
    await logLearningFailure(supabase, {
      organizationId: orgId,
      module: "plans",
      error: err,
      context: { table: "model_error_profiles", op: "recompute", discipline, cfcPrefix },
    });
  }
}
