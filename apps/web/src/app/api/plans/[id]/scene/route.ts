import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EXTRACTION_STALE_AFTER_MS } from "@cantaia/core/plans/scene/constants";
import type {
  BuildingElement,
  BuildingScene,
  ElementCorrectionLogEntry,
} from "@cantaia/core/plans/scene/types";

/**
 * GET /api/plans/:id/scene
 *
 * Retourne la dernière BuildingScene IR d'un plan (ADR-001).
 *
 * Lit la VUE `plan_scenes_latest` (migration 076) qui privilégie déjà
 * `extraction_status = 'completed'` et retombe sur la ligne la plus récente
 * sinon. C'est donc une cible de polling sûre pour le flux 202-Accepted de
 * POST /api/scenes/extract.
 *
 * ── Trois comportements ajoutés après l'audit 2 ────────────────────────────
 *
 * 1. **Watchdog (B-h)** — une fonction serverless tuée avant son UPDATE final
 *    laissait la ligne en `processing` À VIE : le client pollait jusqu'au
 *    timeout, rechargeait, re-pollait, sans jamais pouvoir relancer. Toute
 *    ligne `processing` dont `updated_at` a plus de
 *    `EXTRACTION_STALE_AFTER_MS` bascule en `failed` avec un message
 *    actionnable. Pas de cron nécessaire : la lecture est le déclencheur.
 *
 * 2. **Ré-application des corrections (boucle HITL)** — `plan_scene_corrections`
 *    était un journal append-only JAMAIS relu : `human_corrected` ne passait
 *    jamais à `true`, aucune correction ne modifiait jamais la scène, aucune
 *    convergence n'était possible. On rejoue désormais, à la lecture, les
 *    corrections QUALIFIÉES (celles dont `corrected_value` porte une
 *    instruction exploitable : une dimension chiffrée ou une suppression).
 *    La scène persistée n'est pas réécrite — le journal reste la source de
 *    vérité, et une correction peut être annulée en en postant une nouvelle.
 *
 * 3. **État du disclaimer** — le gate SIA se ré-affichait à chaque
 *    rafraîchissement. On renvoie `disclaimer_accepted` pour l'utilisateur
 *    courant sur cette scène.
 *
 * Sécurité :
 *   - `createAdminClient()` contourne RLS : la portée org est donc appliquée
 *     EXPLICITEMENT via `.eq("organization_id", …)`. Retirer ce filtre = IDOR.
 *   - Un plan inexistant et un plan d'une autre organisation retournent tous
 *     deux 404 : on ne divulgue pas l'existence.
 *   - Gate Pro+ : SEULE l'EXTRACTION (POST /api/scenes/extract, action facturée)
 *     vérifie `canAccess(plan, "visualization3d")`. La CONSULTATION d'une scène
 *     déjà extraite (ce GET, ainsi que corrections/disclaimer) reste libre pour
 *     l'org propriétaire, y compris après un downgrade : c'est un choix produit
 *     assumé (ne pas retirer l'accès à des données déjà payées). Le coût est
 *     porté par l'extraction, pas par la relecture.
 */

/** Correction exploitable par la ré-application automatique. */
interface QualifiedCorrection {
  correction_id: string;
  element_id: string;
  correction_type: ElementCorrectionLogEntry["correction_type"];
  corrected_by: string;
  corrected_at: string;
  /** Dimension à écraser, quand la correction en porte une. */
  dimension?: "thickness" | "height";
  value?: number;
  /** true ⇒ l'élément doit disparaître de la scène. */
  remove?: boolean;
}

/**
 * Lit une ligne `plan_scene_corrections` et en extrait, si elle en porte une,
 * une instruction applicable.
 *
 * Deux formes reconnues dans `corrected_value` :
 *   `{ dimension: "thickness" | "height", value: <nombre en mètres> }`
 *   `{ remove: true }`
 *
 * Tout le reste (signalement en texte libre) reste un signalement : consigné,
 * affiché, mais sans effet géométrique — on ne devine pas ce que l'utilisateur
 * voulait dire.
 */
function qualifyCorrection(row: {
  id: string;
  element_id: string;
  correction_type: string;
  corrected_value: unknown;
  corrected_by: string;
  created_at: string;
}): QualifiedCorrection | null {
  const value = row.corrected_value;
  if (!value || typeof value !== "object") return null;

  const v = value as Record<string, unknown>;
  const base = {
    correction_id: row.id,
    element_id: row.element_id,
    correction_type: row.correction_type as ElementCorrectionLogEntry["correction_type"],
    corrected_by: row.corrected_by,
    corrected_at: row.created_at,
  };

  if (v.remove === true || row.correction_type === "delete") {
    return { ...base, remove: true };
  }

  if (
    (v.dimension === "thickness" || v.dimension === "height") &&
    typeof v.value === "number" &&
    Number.isFinite(v.value) &&
    v.value > 0
  ) {
    return { ...base, dimension: v.dimension, value: v.value };
  }

  return null;
}

/** Applique une dimension corrigée sur l'élément, selon son type. */
function applyDimension(
  element: BuildingElement,
  dimension: "thickness" | "height",
  value: number
): boolean {
  if (dimension === "thickness") {
    if (element.type === "wall" || element.type === "slab") {
      element.thickness_m = value;
      return true;
    }
    return false;
  }

  // dimension === "height"
  switch (element.type) {
    case "wall":
    case "column":
    case "opening":
      element.height_m = value;
      return true;
    case "stair":
      element.top_elevation_m = element.base_elevation_m + value;
      return true;
    default:
      return false;
  }
}

/**
 * Rejoue les corrections qualifiées sur une copie de la scène.
 * Retourne la scène modifiée + le nombre d'éléments effectivement touchés.
 */
function replayCorrections(
  scene: BuildingScene,
  corrections: QualifiedCorrection[]
): { scene: BuildingScene; applied: number; removed: number } {
  if (corrections.length === 0) return { scene, applied: 0, removed: 0 };

  // Structured clone : la scène vient de PostgREST, la muter en place n'aurait
  // aucun effet de bord ici, mais on garde l'intention explicite.
  const next: BuildingScene = JSON.parse(JSON.stringify(scene));
  const byElement = new Map<string, QualifiedCorrection>();
  // Les corrections arrivent triées du plus ancien au plus récent : la
  // dernière écrite gagne, ce qui permet à l'utilisateur de se corriger.
  for (const c of corrections) byElement.set(c.element_id, c);

  let applied = 0;
  let removed = 0;

  for (const level of next.levels ?? []) {
    const kept: BuildingElement[] = [];

    for (const element of level.elements ?? []) {
      const correction = byElement.get(element.id);
      if (!correction) {
        kept.push(element);
        continue;
      }

      if (correction.remove) {
        removed++;
        continue;
      }

      const ok =
        correction.dimension !== undefined && correction.value !== undefined
          ? applyDimension(element, correction.dimension, correction.value)
          : false;

      if (ok) {
        applied++;
        element.provenance = {
          ...element.provenance,
          // Une valeur saisie par un humain sur le plan vaut mieux que
          // n'importe quelle estimation : la confiance monte à 1.
          confidence: 1,
          human_corrected: true,
          corrected_by: correction.corrected_by,
          corrected_at: correction.corrected_at,
          correction_log: [
            ...(element.provenance.correction_log ?? []),
            {
              correction_id: correction.correction_id,
              correction_type: correction.correction_type,
              corrected_by: correction.corrected_by,
              corrected_at: correction.corrected_at,
            },
          ],
        };
      }

      kept.push(element);
    }

    level.elements = kept;
  }

  // Les ouvertures dont le mur hôte vient d'être supprimé n'ont plus d'ancrage.
  if (removed > 0) {
    const wallIds = new Set<string>();
    for (const level of next.levels ?? []) {
      for (const el of level.elements ?? []) if (el.type === "wall") wallIds.add(el.id);
    }
    for (const level of next.levels ?? []) {
      level.elements = (level.elements ?? []).filter(
        (el) => el.type !== "opening" || wallIds.has(el.host_element_id)
      );
    }
  }

  return { scene: next, applied, removed };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: planId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: userOrg } = await adminClient
    .from("users")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!userOrg?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }

  const { data: scene, error } = await (adminClient as any)
    .from("plan_scenes_latest")
    .select(
      `id, plan_id, organization_id, parent_scene_id, schema_version,
       scene_data, extraction_status, error_message, confidence_score,
       model_divergence, extracted_by, extracted_at, tokens_used,
       cost_chf, created_at, updated_at`
    )
    .eq("plan_id", planId)
    .eq("organization_id", userOrg.organization_id)
    .maybeSingle();

  if (error) {
    console.error("[plans/:id/scene] VIEW query error:", error);
    return NextResponse.json({ error: "Failed to fetch scene" }, { status: 500 });
  }

  if (!scene) {
    return NextResponse.json({ error: "No scene found" }, { status: 404 });
  }

  let extractionStatus: string = scene.extraction_status;
  let errorMessage: string | null = scene.error_message ?? null;

  // ── 1. Watchdog : extraction zombie ──────────────────────────────────────
  if (extractionStatus === "processing" || extractionStatus === "pending") {
    const lastTouch = Date.parse(scene.updated_at ?? scene.created_at ?? "");
    const stale =
      Number.isFinite(lastTouch) && Date.now() - lastTouch > EXTRACTION_STALE_AFTER_MS;

    if (stale) {
      extractionStatus = "failed";
      errorMessage =
        "L'extraction 3D a été interrompue (dépassement du temps d'exécution serveur). Relancez-la : le plan et l'estimation sont intacts.";

      const { error: watchdogErr } = await (adminClient as any)
        .from("plan_scenes")
        .update({ extraction_status: "failed", error_message: errorMessage })
        .eq("id", scene.id)
        .eq("organization_id", userOrg.organization_id)
        // Course : une autre requête a pu terminer entre-temps. On ne
        // dégrade que ce qui est encore réellement bloqué.
        .in("extraction_status", ["processing", "pending"]);

      if (watchdogErr) {
        console.error("[plans/:id/scene] watchdog update error:", watchdogErr);
      } else {
        console.warn(
          `[plans/:id/scene] scène ${scene.id} marquée failed par le watchdog (bloquée depuis ${Math.round(
            (Date.now() - lastTouch) / 60000
          )} min)`
        );
      }
    }
  }

  // ── 2. Ré-application des corrections + 3. état du disclaimer ────────────
  let sceneData = scene.scene_data;
  let correctionsApplied = 0;
  let correctionsRemoved = 0;

  if (extractionStatus === "completed" && sceneData && Array.isArray(sceneData.levels)) {
    const { data: corrections, error: correctionsErr } = await (adminClient as any)
      .from("plan_scene_corrections")
      .select("id, element_id, correction_type, corrected_value, corrected_by, created_at")
      .eq("scene_id", scene.id)
      .eq("organization_id", userOrg.organization_id)
      .order("created_at", { ascending: true });

    if (correctionsErr) {
      // Non fatal : mieux vaut la scène brute que pas de scène du tout.
      console.error("[plans/:id/scene] corrections lookup error:", correctionsErr);
    } else if (Array.isArray(corrections) && corrections.length > 0) {
      const qualified = corrections
        .map(qualifyCorrection)
        .filter((c: QualifiedCorrection | null): c is QualifiedCorrection => c !== null);

      const replayed = replayCorrections(sceneData as BuildingScene, qualified);
      sceneData = replayed.scene;
      correctionsApplied = replayed.applied;
      correctionsRemoved = replayed.removed;
    }
  }

  const { data: acceptance, error: acceptanceErr } = await (adminClient as any)
    .from("ai_disclaimer_acceptance")
    .select("id")
    .eq("user_id", user.id)
    .eq("scene_id", scene.id)
    .limit(1)
    .maybeSingle();

  if (acceptanceErr) {
    console.error("[plans/:id/scene] disclaimer lookup error:", acceptanceErr);
  }

  return NextResponse.json({
    scene: {
      id: scene.id,
      plan_id: scene.plan_id,
      parent_scene_id: scene.parent_scene_id,
      schema_version: scene.schema_version,
      scene_data: sceneData,
      extraction_status: extractionStatus,
      error_message: errorMessage,
      confidence_score: scene.confidence_score,
      model_divergence: scene.model_divergence,
      extracted_by: scene.extracted_by,
      extracted_at: scene.extracted_at,
      tokens_used: scene.tokens_used,
      cost_chf: scene.cost_chf,
      created_at: scene.created_at,
      updated_at: scene.updated_at,
      /** Corrections utilisateur rejouées sur la scène retournée. */
      corrections_applied: correctionsApplied,
      corrections_removed: correctionsRemoved,
      /** Le gate SIA a-t-il déjà été accepté par CET utilisateur sur CETTE scène ? */
      disclaimer_accepted: !!acceptance,
    },
  });
}
