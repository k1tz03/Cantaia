// ============================================================
// Learning event logging — la métrique d'efficacité de l'apprentissage
// ============================================================
//
// Le produit écrit beaucoup de signal d'apprentissage (règles, calibrations,
// corrections) mais n'en mesurait RIEN : suggestions jamais comptées, échecs
// d'écriture avalés par des `catch {}` nus. Ces helpers alimentent la table
// `learning_events` (migration 097) :
//   * logLearningEvent    → suggestion_shown / accepted / rejected / correction
//   * logLearningFailure  → write_failed (remplace les catch vides des chemins
//                           d'écriture d'apprentissage)
//
// CONTRAT : best-effort, ne throw JAMAIS — un échec de télémétrie ne doit
// jamais casser le chemin métier qui l'appelle. Le client passé est le client
// service role (les policies RLS de learning_events n'autorisent aucun INSERT
// utilisateur).

export type LearningEventType =
  | "suggestion_shown"
  | "suggestion_accepted"
  | "suggestion_rejected"
  | "correction"
  | "write_failed";

export interface LearningEventParams {
  organizationId: string;
  /** Module produit : 'mail', 'mail_folders', 'plans', 'pricing', 'planning'… */
  module: string;
  eventType: LearningEventType;
  /** Origine de la décision : 'learned_rule', 'project_match', 'ai', … */
  decisionSource?: string | null;
  /** true si l'événement matérialise une correction humaine d'une décision IA */
  wasCorrected?: boolean | null;
  /** Contexte libre — jamais de contenu d'email ni de données personnelles. */
  payload?: Record<string, unknown>;
}

/**
 * Insère un événement d'apprentissage. Best-effort : vérifie `{error}`
 * (supabase-js ne throw pas) et se contente d'un console.error en cas d'échec.
 */
export async function logLearningEvent(
  supabase: any,
  params: LearningEventParams
): Promise<void> {
  if (!params.organizationId) return;
  try {
    const { error } = await supabase.from("learning_events").insert({
      organization_id: params.organizationId,
      module: params.module,
      event_type: params.eventType,
      decision_source: params.decisionSource ?? null,
      was_corrected: params.wasCorrected ?? null,
      payload: params.payload ?? {},
    });
    if (error) {
      // Table peut ne pas exister tant que la 097 n'est pas appliquée.
      console.error(
        `[learning] logLearningEvent(${params.module}/${params.eventType}) insert failed:`,
        error.message
      );
    }
  } catch (err) {
    console.error(
      `[learning] logLearningEvent(${params.module}/${params.eventType}) threw:`,
      err instanceof Error ? err.message : err
    );
  }
}

export interface LearningFailureParams {
  organizationId: string;
  /** Module dont le chemin d'ÉCRITURE d'apprentissage a échoué. */
  module: string;
  /** L'erreur d'origine (Error, PostgrestError, string…). */
  error: unknown;
  /** Où / sur quoi : ex. { table: 'price_calibrations', cfc_code: '211.5' } */
  context?: Record<string, unknown>;
}

/**
 * Trace un échec d'écriture d'un chemin d'apprentissage.
 *
 * Remplace les `catch {}` nus : console.error préfixé [learning] TOUJOURS,
 * plus un insert `learning_events(event_type='write_failed')` best-effort.
 * Ne throw jamais.
 */
export async function logLearningFailure(
  supabase: any,
  params: LearningFailureParams
): Promise<void> {
  const message =
    params.error instanceof Error
      ? params.error.message
      : typeof params.error === "object" && params.error !== null && "message" in params.error
        ? String((params.error as { message: unknown }).message)
        : String(params.error);

  console.error(`[learning] write_failed module=${params.module}:`, message, params.context ?? "");

  await logLearningEvent(supabase, {
    organizationId: params.organizationId,
    module: params.module,
    eventType: "write_failed",
    payload: { error: message, ...(params.context ?? {}) },
  });
}
