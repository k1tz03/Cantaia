/**
 * Passe 5 — Topology Extraction (visualiseur 2.5D).
 *
 * Lit les passes 1-3 du pipeline d'estimation + le fichier du plan, et produit
 * une `BuildingScene` IR validée.
 *
 * ── Ce qui a changé après l'audit 2 ───────────────────────────────────────
 *   - `max_tokens` 12 000 → 24 000 : la sortie était tronquée dès ~55
 *     éléments, et le parser maison levait alors une exception. On réutilise
 *     désormais `parseAIJson` (parser tolérant 4 stratégies de @cantaia/core/ai)
 *     avec une réparation de troncature en amont.
 *   - La surface brute de plancher de la Passe 2 est TRANSMISE au prompt :
 *     il exigeait une cohérence à ±15 % avec une valeur qu'il ne recevait pas.
 *   - Le modèle doit citer 2-3 cotes AVEC les coordonnées de leurs extrémités.
 *     Elles sont re-mesurées en code (`validator.ts`) : c'est la seule
 *     calibration pixel→mètre possible sans DPI.
 *   - La sortie passe par `validateBuildingScene()` : contrôles géométriques,
 *     contrôles globaux, snap topologique, calcul de confiance EN CODE, et
 *     refus (NF1) quand la géométrie n'est pas fiable.
 *
 * ── Contrat inchangé ──────────────────────────────────────────────────────
 *   - **Ne jette jamais** : toute défaillance retourne `{ scene: null, error }`.
 *   - **Pipeline-local** : appelé uniquement quand la Passe 5 est activée
 *     explicitement (`enablePasse5` + kill-switch `DISABLE_PASSE5`).
 */

import { parseAIJson, callAnthropicWithRetry, MODEL_FOR_TASK } from "../../ai/ai-utils";

import type {
  Passe1Result,
  Passe2Result,
  Passe3Result,
  ModelProvider,
} from "../estimation/types";

import {
  SCENE_SCHEMA_VERSION,
  type BuildingScene,
  type BuildingElement,
  type BuildingLevel,
  type QualityCheck,
  type ScaleCalibration,
  type SceneProvenance,
  type ValidationIssue,
  type Vec2,
  type Annotation,
  type AnnotationKind,
  type ElementProvenance,
} from "./types";
import { validateBuildingScene, type SceneValidationResult, type ValidationContext } from "./validator";

// ─── Public API ───────────────────────────────────────────────────────────

export interface Passe5TopologyInput {
  passe1: Passe1Result;
  passe2: Passe2Result;
  passe3: Passe3Result;
  image_base64: string;
  media_type: string;
  /** Plan id — required to seed the returned scene. */
  plan_id: string;
  /** Upstream pass ids (used for scene.source_passes back-reference). */
  passe1_id: string;
  passe2_id: string;
  passe3_id: string;
  /** Optional model weights snapshot, forwarded into SceneProvenance. */
  model_weights?: Partial<Record<ModelProvider, number>>;
  /**
   * Nombre de pages du document source (1 pour une image). Quand > 1, le
   * prompt demande explicitement un niveau par page et l'avertissement
   * correspondant est persisté dans la scène.
   */
  page_count?: number;
}

export interface Passe5TopologyResult {
  /** `null` quand l'extraction a échoué OU a été refusée (NF1). */
  scene: BuildingScene | null;
  tokens_used: number;
  duration_ms: number;
  /** 0..1. Toujours 0 : un seul modèle en Phase 1 (pas de consensus réel). */
  model_divergence: number;
  /** Présent quand `scene === null`. */
  error: string | null;

  // ── Additif : métriques de fiabilité calculées EN CODE ───────────────────

  /** Confiance globale 0..1 calculée par le validator. `null` si pas de scène. */
  confidence_score: number | null;
  /** Part d'éléments sous le seuil de confiance minimal. */
  low_confidence_ratio: number | null;
  quality_checks: QualityCheck[];
  validation_issues: ValidationIssue[];
  scale_calibration: ScaleCalibration | null;
  /** true quand la scène a été REFUSÉE par les contrôles (NF1), pas plantée. */
  refused: boolean;
  validation_stats: SceneValidationResult["stats"] | null;
  /** Modèle Claude réellement utilisé (pour trackApiUsage côté route). */
  model: string;
}

/**
 * Exécute la Passe 5 Topologie et retourne une BuildingScene IR validée.
 *
 * Non-throwing : les appelants s'appuient sur `result.scene === null`.
 * Distinguer `refused === true` (géométrie produite mais jugée non fiable —
 * `error` porte alors un message actionnable) d'une panne technique.
 */
export async function runPasse5Topology(
  params: Passe5TopologyInput
): Promise<Passe5TopologyResult> {
  const start = Date.now();

  try {
    const { scene, tokens_used, validation, model } = await extractSceneWithClaude(params);
    const duration_ms = Date.now() - start;

    if (validation.rejected) {
      console.warn(
        `[passe5-topology] scène refusée (NF1): ${validation.refusal_reason?.split("\n")[0]}`
      );
      return {
        scene: null,
        tokens_used,
        duration_ms,
        model_divergence: 0,
        error: validation.refusal_reason,
        confidence_score: validation.confidence,
        low_confidence_ratio: validation.low_confidence_ratio,
        quality_checks: validation.quality_checks,
        validation_issues: validation.issues,
        scale_calibration: validation.scale_calibration,
        refused: true,
        validation_stats: validation.stats,
        model,
      };
    }

    return {
      scene,
      tokens_used,
      duration_ms,
      // Phase 1 = Claude seul. Consensus multi-modèle en W4+.
      model_divergence: 0,
      error: null,
      confidence_score: validation.confidence,
      low_confidence_ratio: validation.low_confidence_ratio,
      quality_checks: validation.quality_checks,
      validation_issues: validation.issues,
      scale_calibration: validation.scale_calibration,
      refused: false,
      validation_stats: validation.stats,
      model,
    };
  } catch (err) {
    const duration_ms = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[passe5-topology] failed: ${error}`);
    return {
      scene: null,
      tokens_used: 0,
      duration_ms,
      model_divergence: 0,
      error,
      confidence_score: null,
      low_confidence_ratio: null,
      quality_checks: [],
      validation_issues: [],
      scale_calibration: null,
      refused: false,
      validation_stats: null,
      model: MODEL_FOR_TASK.plan_analysis,
    };
  }
}

// ─── Claude Vision call ───────────────────────────────────────────────────

interface ClaudeExtractionResult {
  scene: BuildingScene;
  tokens_used: number;
  validation: SceneValidationResult;
  model: string;
}

/**
 * Plafond de sortie. À 12 000 la réponse était tronquée dès ~55 éléments —
 * une villa complète en compte 120-200. 24 000 couvre le budget Phase 1
 * (≤ 200 éléments) avec de la marge.
 */
const MAX_OUTPUT_TOKENS = 24_000;

async function extractSceneWithClaude(
  params: Passe5TopologyInput
): Promise<ClaudeExtractionResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // maxRetries: 0 — la stratégie de retry est portée par callAnthropicWithRetry
  // (sinon double retry du SDK sur un appel Vision ~24k tokens de sortie).
  const client = new Anthropic({ timeout: 180_000, maxRetries: 0 });
  const model = MODEL_FOR_TASK.plan_analysis;

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  const isPdf = params.media_type === "application/pdf";
  const fileContent = isPdf
    ? {
        type: "document" as const,
        source: {
          type: "base64" as const,
          media_type: "application/pdf" as const,
          data: params.image_base64,
        },
      }
    : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: params.media_type as
            | "image/png"
            | "image/jpeg"
            | "image/gif"
            | "image/webp",
          data: params.image_base64,
        },
      };

  const response = await callAnthropicWithRetry(() =>
    client.messages.create({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [
        {
          type: "text",
          text: systemPrompt,
          // Le SYSTEM est stable entre extractions → cache légitime.
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            fileContent,
            // Pas de cache_control ici : le bloc user (image + prompt métré)
            // est UNIQUE à chaque plan — le cacher est une surtaxe +25 % sans
            // aucun hit possible (convention CLAUDE.md §8).
            {
              type: "text",
              text: userPrompt,
            },
          ],
        },
      ],
    })
  );

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "";
  const tokens_used =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
  const truncated = response.stop_reason === "max_tokens";

  console.log(
    `[passe5-topology] Claude: ${tokens_used} tokens, ${raw.length} chars, stop=${response.stop_reason}`
  );

  const parsed = parseSceneResponse(raw, truncated);
  if (!parsed) {
    throw new Error(
      truncated
        ? "Réponse du modèle tronquée et irréparable (plan trop dense pour un seul passage)."
        : "Réponse du modèle illisible (JSON invalide)."
    );
  }

  const assembled = assembleScene(parsed.scene, params, tokens_used);
  const validation = validateBuildingScene(assembled, buildValidationContext(params, parsed.dimensionChecks));

  if (parsed.repaired) {
    validation.issues.unshift({
      element_id: null,
      level_id: null,
      severity: "warning",
      code: "response_truncated_repaired",
      message:
        "La réponse du modèle était tronquée : la fin a été réparée automatiquement. Des éléments du plan peuvent manquer.",
    });
    validation.scene.validation_issues = validation.issues;
  }

  return { scene: validation.scene, tokens_used, validation, model };
}

// ─── Prompts ──────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `Tu es un architecte logiciel BIM spécialisé en représentations 2.5D pour visualisation.

Tu analyses un plan de construction (plan d'étage, coupe, ou façade) et produis une représentation JSON structurée conforme au schéma BuildingScene de Cantaia.

RÈGLES FONDAMENTALES

1. **Unités** : toutes les distances en MÈTRES. Angles en DEGRÉS. Aucune exception.
2. **2.5D** : chaque élément est une empreinte (footprint) extrudée par hauteur. Pas de mailles 3D complexes.
3. **CRS** : origine arbitraire; x = droite (est), y = haut (nord), z = vertical. Rotation autour de Z si le plan n'est pas orienté nord.
4. **IDs** : identifiants stables, uniques dans TOUTE la scène : "wall_01", "slab_rdc_01", "opening_01". Un id en double invalide l'élément.
5. **Provenance obligatoire** : chaque élément DOIT inclure "provenance" avec confidence 0..1, source_passes, model_consensus, human_corrected=false.
6. **Confidence réaliste** : 0.9+ SEULEMENT si tu lis une cote chiffrée. 0.5-0.8 si tu estimes par échelle. <0.5 si tu supposes. Une confiance trop généreuse est pénalisée par nos contrôles.

CALIBRATION D'ÉCHELLE — OBLIGATOIRE

Tu DOIS renseigner "scale_checks" : 2 à 3 cotes chiffrées LUES SUR LE PLAN, avec les coordonnées, dans TON repère de scène, des deux extrémités que la cote mesure.
Ces cotes sont re-mesurées géométriquement de notre côté : si la distance entre "from" et "to" ne correspond pas à "value_m", nous recalons TOUTE ta géométrie.
Choisis des cotes longues et non ambiguës (façade, trame porteuse), pas des détails.
Si le plan ne porte AUCUNE cote chiffrée lisible, renvoie "scale_checks": [] — ne les invente jamais.

STRUCTURE ATTENDUE

{
  "schema_version": "${SCENE_SCHEMA_VERSION}",
  "plan_id": "<fourni par l'utilisateur>",
  "units": { "length": "m", "angle": "deg" },
  "crs": { "origin": { "x": 0, "y": 0, "z": 0 }, "rotation_deg": 0 },
  "scale_checks": [
    { "label": "12.80", "value_m": 12.8, "from": { "x": 0, "y": 0 }, "to": { "x": 12.8, "y": 0 } }
  ],
  "levels": [
    {
      "id": "level_rdc",
      "name": "RDC",
      "elevation_m": 0.0,
      "height_m": 2.7,
      "elements": [ /* WallElement | SlabElement | OpeningElement | ColumnElement | BeamElement | RoofElement | StairElement */ ]
    }
  ],
  "annotations": []
}

FORMES DES ÉLÉMENTS (strict)

- Wall       : { "id": "...", "type": "wall", "start": { "x":0, "y":0 }, "end": { "x":5, "y":0 }, "thickness_m": 0.2, "height_m": 2.7, "load_bearing": true, "material": "beton" | "brique" | "cloison_legere" | "unknown", "provenance": {...} }
- Slab       : { "id": "...", "type": "slab", "polygon": [{"x":0,"y":0},{"x":10,"y":0},{"x":10,"y":8},{"x":0,"y":8}], "thickness_m": 0.25, "elevation_m": 0, "material": "beton", "provenance": {...} }
- Opening    : { "id": "...", "type": "opening", "opening_type": "door" | "window", "host_element_id": "wall_01", "position_along": 0.5, "width_m": 0.9, "height_m": 2.1, "sill_m": 0, "provenance": {...} }
- Column     : { "id": "...", "type": "column", "position": { "x":3, "y":3 }, "width_m": 0.3, "depth_m": 0.3, "height_m": 2.7, "material": "beton", "provenance": {...} }
- Beam       : { "id": "...", "type": "beam", "start": {...}, "end": {...}, "elevation_m": 2.7, "width_m": 0.3, "depth_m": 0.5, "material": "beton", "provenance": {...} }
- Roof       : { "id": "...", "type": "roof", "polygon": [...], "base_elevation_m": 2.7, "roof_kind": "flat" | "pitched" | "shed", "pitch_deg": 0, "provenance": {...} }
- Stair      : { "id": "...", "type": "stair", "polygon": [...], "base_elevation_m": 0, "top_elevation_m": 2.7, "provenance": {...} }

CONTRAINTES GÉOMÉTRIQUES VÉRIFIÉES EN CODE (un manquement fait rejeter l'élément)
- Épaisseur d'un mur ou d'une dalle : entre 0.05 m et 1.00 m.
- Hauteur d'un mur ou d'un poteau : entre 1.80 m et 6.00 m.
- Polygone : au moins 3 points distincts, aire > 0.5 m². NE répète PAS le premier point à la fin.
- "position_along" strictement entre 0 et 1.
- "host_element_id" doit désigner un mur RÉELLEMENT présent dans la scène.
- Les polygones de dalle doivent suivre le contour RÉEL (une dalle en L a 6 points, pas 4).
- Les extrémités des murs qui se rejoignent doivent porter les MÊMES coordonnées.

ANCRAGE DES OUVERTURES : utilise TOUJOURS host_element_id + position_along (0..1 le long du mur).

CONTRAINTES SIA
- Si l'échelle n'est pas fiable (passe 1), baisse toutes les confidences d'environ 0.2.
- Si la qualité d'image est "basse", plafonne la confidence globale à 0.6.
- Si des zones sont illisibles (passe 1), NE PAS inventer d'éléments dans ces zones : mieux vaut une scène incomplète qu'une scène fausse.

SORTIE
- Retourne UNIQUEMENT du JSON valide, sans markdown, sans préambule, sans commentaires.
- Priorise la STRUCTURE PORTEUSE et les dalles. Si tu approches de la limite de sortie, arrête-toi sur un élément complet plutôt que de tronquer.`;
}

function buildUserPrompt(params: Passe5TopologyInput): string {
  const disc = params.passe1.classification.discipline;
  const type = params.passe1.classification.type_plan;
  const echelle =
    params.passe1.contexte_metrage.echelle_detectee ||
    params.passe1.cartouche.echelle ||
    "inconnue";
  const qualite = params.passe1.contexte_metrage.qualite_image;
  const echelleFiable = params.passe1.contexte_metrage.echelle_fiable ? "oui" : "NON";
  const zones = params.passe1.contexte_metrage.zones_illisibles;

  const totaux = params.passe2.totaux_par_cfc
    .slice(0, 12)
    .map(
      (t) => `  - ${t.cfc_code} ${t.cfc_libelle}: ${t.quantite_totale} ${t.unite}`
    )
    .join("\n");

  const alertes = params.passe3.alertes_coherence
    .filter((a) => a.severite !== "info")
    .slice(0, 5)
    .map((a) => `  - [${a.severite}] ${a.poste_concerne}: ${a.probleme}`)
    .join("\n");

  // B-c — l'ancrage surfacique était exigé par le prompt mais jamais transmis.
  const sr = params.passe2.surface_reference;
  const sbp = sr?.surface_brute_plancher;
  const surfaceBlock =
    typeof sbp === "number" && sbp > 0
      ? `SURFACE DE RÉFÉRENCE (Passe 2 — ANCRAGE OBLIGATOIRE)
  - Surface brute de plancher : ${sbp} m² (source : ${sr.source || "métré"})
  ${sr.surface_nette_plancher ? `- Surface nette de plancher : ${sr.surface_nette_plancher} m²` : ""}
  ${sr.surface_facade ? `- Surface de façade : ${sr.surface_facade} m²` : ""}
  ${sr.volume_bati ? `- Volume bâti : ${sr.volume_bati} m³` : ""}

  => La SOMME des aires de tes polygones de dalle (calculée par la formule du lacet, tous niveaux confondus) doit rester à moins de 15 % de ${sbp} m². Au-delà de 30 % d'écart, la scène est REFUSÉE automatiquement.`
      : `SURFACE DE RÉFÉRENCE
  Non disponible dans le métré. Déduis l'emprise des cotes du plan et signale une confiance réduite sur les dalles.`;

  const pageCount = params.page_count ?? 1;
  const pagesBlock =
    pageCount > 1
      ? `DOCUMENT MULTI-PAGES — ${pageCount} pages
  Ce document contient ${pageCount} pages. Traite CHAQUE page qui porte un plan d'étage comme un NIVEAU distinct (un objet dans "levels"), en te servant du cartouche de la page pour le nommer ("Sous-sol", "RDC", "1er", "Combles") et pour fixer son "elevation_m".
  Les pages qui portent une coupe, une façade ou un détail ne créent PAS de niveau : sers-t'en pour calibrer les hauteurs d'étage et les épaisseurs de dalle.
  Ne duplique JAMAIS le même niveau depuis deux pages.`
      : "";

  return `Plan à analyser (${disc} / ${type}), échelle ${echelle}, échelle jugée fiable : ${echelleFiable}, qualité image ${qualite}.

${surfaceBlock}

QUANTITÉS CONNUES (Passe 2 — ancrage quantitatif)
${totaux || "  (aucune quantité extraite)"}

ALERTES DE COHÉRENCE (Passe 3)
${alertes || "  (aucune alerte)"}

ZONES ILLISIBLES SIGNALÉES (ne rien y reconstruire)
${zones.length > 0 ? zones.map((z) => `  - ${z}`).join("\n") : "  (aucune)"}
${pagesBlock ? `\n${pagesBlock}\n` : ""}
PARAMÈTRES OBLIGATOIRES DANS LA SORTIE
- plan_id: "${params.plan_id}"
- scale_checks: 2 à 3 cotes chiffrées lues sur le plan, avec les coordonnées de leurs extrémités dans ton repère (tableau vide si le plan n'en porte aucune).

Produis maintenant le BuildingScene JSON complet.

Retourne UNIQUEMENT le JSON.`;
}

// ─── JSON parsing + scene assembly ────────────────────────────────────────

/** Cote citée par le modèle, avant vérification géométrique. */
interface RawScaleCheck {
  label: string;
  value_m: number;
  from: Vec2;
  to: Vec2;
}

interface ParsedSceneResponse {
  scene: Partial<BuildingScene>;
  dimensionChecks: RawScaleCheck[];
  /** true quand la réponse a dû être réparée (troncature). */
  repaired: boolean;
}

/**
 * Répare une réponse JSON tronquée en refermant les structures ouvertes.
 *
 * Une sortie coupée au milieu d'un élément est irrécupérable telle quelle ;
 * on remonte jusqu'au dernier objet complet du tableau courant, on tronque là,
 * puis on referme tous les niveaux ouverts. On perd les derniers éléments —
 * ce qui est signalé à l'utilisateur — mais on sauve la scène.
 *
 * Le parcours est conscient des chaînes et des échappements : un `}` à
 * l'intérieur d'un libellé ne doit pas être compté comme une fermeture.
 */
export function repairTruncatedJson(text: string): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  /** Index (exclusif) juste après la dernière valeur complète de haut niveau. */
  let lastSafeCut = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") {
      stack.push(ch);
      continue;
    }
    if (ch === "}" || ch === "]") {
      stack.pop();
      // Une valeur vient de se terminer : c'est un point de coupe propre.
      if (stack.length > 0) lastSafeCut = i + 1;
      continue;
    }
  }

  if (stack.length === 0) return text; // rien à réparer
  if (lastSafeCut <= 0) return null; // rien de complet à sauver

  let head = text.slice(0, lastSafeCut);

  // Recalcule la pile sur la portion conservée : la coupe a pu refermer des
  // niveaux au passage.
  const openers: string[] = [];
  inString = false;
  escaped = false;
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") openers.push(ch);
    else if (ch === "}" || ch === "]") openers.pop();
  }

  head = head.replace(/,\s*$/, "");
  for (let i = openers.length - 1; i >= 0; i--) {
    head += openers[i] === "{" ? "}" : "]";
  }
  return head;
}

/**
 * Parse la réponse du modèle. Réutilise `parseAIJson` (parser tolérant partagé,
 * 4 stratégies) et n'active la réparation de troncature qu'en dernier recours.
 */
function parseSceneResponse(raw: string, truncated: boolean): ParsedSceneResponse | null {
  const direct = parseAIJson<Record<string, unknown>>(raw);
  if (direct && typeof direct === "object") {
    return {
      scene: direct as Partial<BuildingScene>,
      dimensionChecks: extractScaleChecks(direct),
      repaired: false,
    };
  }

  // Réponse tronquée (ou simplement mal refermée) : on répare puis on repasse
  // par le parser tolérant.
  const repairedText = repairTruncatedJson(stripFences(raw));
  if (!repairedText) return null;

  const repaired = parseAIJson<Record<string, unknown>>(repairedText);
  if (!repaired || typeof repaired !== "object") return null;

  console.warn(
    `[passe5-topology] réponse ${truncated ? "tronquée" : "malformée"} réparée (${raw.length} → ${repairedText.length} chars)`
  );

  return {
    scene: repaired as Partial<BuildingScene>,
    dimensionChecks: extractScaleChecks(repaired),
    repaired: true,
  };
}

function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*\n?([\s\S]*)$/);
  const body = fence ? fence[1] : trimmed;
  const start = body.indexOf("{");
  return start > 0 ? body.slice(start) : body;
}

/** Lit `scale_checks` de façon défensive : le modèle omet ou déforme souvent. */
function extractScaleChecks(parsed: Record<string, unknown>): RawScaleCheck[] {
  const raw = parsed.scale_checks;
  if (!Array.isArray(raw)) return [];

  const out: RawScaleCheck[] = [];
  for (const item of raw.slice(0, 8)) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const value = Number(c.value_m);
    const from = c.from as Vec2 | undefined;
    const to = c.to as Vec2 | undefined;
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      !from ||
      !to ||
      !Number.isFinite(Number(from.x)) ||
      !Number.isFinite(Number(from.y)) ||
      !Number.isFinite(Number(to.x)) ||
      !Number.isFinite(Number(to.y))
    ) {
      continue;
    }
    out.push({
      label: typeof c.label === "string" ? c.label : String(value),
      value_m: value,
      from: { x: Number(from.x), y: Number(from.y) },
      to: { x: Number(to.x), y: Number(to.y) },
    });
  }
  return out;
}

function buildValidationContext(
  params: Passe5TopologyInput,
  dimensionChecks: RawScaleCheck[]
): ValidationContext {
  return {
    surfaceBrutePlancher: params.passe2.surface_reference?.surface_brute_plancher ?? null,
    declaredScale:
      params.passe1.contexte_metrage.echelle_detectee || params.passe1.cartouche.echelle || null,
    scaleReliable: params.passe1.contexte_metrage.echelle_fiable === true,
    imageQuality: params.passe1.contexte_metrage.qualite_image,
    unreadableZones: params.passe1.contexte_metrage.zones_illisibles?.length ?? 0,
    pageCount: Math.max(1, params.page_count ?? 1),
    declaredDimensionChecks: dimensionChecks.map((c) => ({
      label: c.label,
      value_m: c.value_m,
      from: c.from,
      to: c.to,
    })),
  };
}

/**
 * Merge the model output with trusted local fields. We never let the LLM
 * decide `schema_version`, `plan_id`, `source_passes`, `provenance`, or
 * `extracted_at` — those are authoritative on our side.
 */
function assembleScene(
  parsed: Partial<BuildingScene>,
  params: Passe5TopologyInput,
  tokens_used: number
): BuildingScene {
  const levels: BuildingLevel[] = Array.isArray(parsed.levels)
    ? parsed.levels.map(sanitizeLevel)
    : [];

  const annotations = Array.isArray(parsed.annotations)
    ? sanitizeAnnotations(parsed.annotations)
    : [];

  // La bbox du modèle n'est jamais de confiance : le validator la recalcule
  // de toute façon après rejets, mise à l'échelle et snap.
  const bbox = computeBboxFromLevels(levels);

  const crs =
    parsed.crs ?? {
      origin: { x: 0, y: 0, z: 0 },
      rotation_deg: 0,
    };

  const provenance: SceneProvenance = {
    model_weights: params.model_weights ?? { claude: 1.0 },
    tokens_used,
    duration_ms: 0, // will be overwritten by the caller
    model_divergence: 0,
    notes: buildSceneNotes(params),
  };

  return {
    schema_version: SCENE_SCHEMA_VERSION,
    plan_id: params.plan_id,
    source_passes: {
      passe1_id: params.passe1_id,
      passe2_id: params.passe2_id,
      passe3_id: params.passe3_id,
    },
    units: { length: "m", angle: "deg" },
    crs,
    bbox,
    levels,
    annotations,
    networks: [], // reserved for Phase 3
    provenance,
    extracted_at: new Date().toISOString(),
  };
}

/**
 * Normalise les annotations produites par le modèle.
 *
 * L'adapter client lit `ann.provenance.confidence` et
 * `Object.entries(prov.model_consensus)` : une annotation sans `provenance` ou
 * sans `model_consensus`, ou avec un `anchor` non fini, faisait planter
 * l'adapter (« scène illisible ») alors que la géométrie était bonne. On rejette
 * les ancres invalides et on garantit une provenance par défaut.
 */
function sanitizeAnnotations(raw: unknown[]): Annotation[] {
  const out: Annotation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Partial<Annotation> & { anchor?: unknown };
    const anchor = a.anchor as { x?: unknown; y?: unknown; z?: unknown } | undefined;
    if (
      !anchor ||
      !Number.isFinite(Number(anchor.x)) ||
      !Number.isFinite(Number(anchor.y))
    ) {
      continue; // ancre inexploitable → on écarte l'annotation
    }

    const kind: AnnotationKind =
      a.kind === "dimension" || a.kind === "label" || a.kind === "note" ? a.kind : "note";

    const p = (a.provenance ?? {}) as Partial<ElementProvenance>;
    const provenance: ElementProvenance = {
      confidence:
        typeof p.confidence === "number" && Number.isFinite(p.confidence)
          ? p.confidence
          : 0.5,
      source_passes: Array.isArray(p.source_passes) ? p.source_passes : ["passe5"],
      model_consensus:
        p.model_consensus && typeof p.model_consensus === "object"
          ? p.model_consensus
          : { claude: 0.5 },
      human_corrected: p.human_corrected === true,
    };

    const anchorOut =
      Number.isFinite(Number((anchor as { z?: unknown }).z))
        ? { x: Number(anchor.x), y: Number(anchor.y), z: Number((anchor as { z: number }).z) }
        : { x: Number(anchor.x), y: Number(anchor.y) };

    out.push({
      id: typeof a.id === "string" && a.id ? a.id : `annotation_${out.length + 1}`,
      kind,
      anchor: anchorOut,
      text: typeof a.text === "string" ? a.text : "",
      level_id: typeof a.level_id === "string" ? a.level_id : undefined,
      element_id: typeof a.element_id === "string" ? a.element_id : undefined,
      provenance,
    });
  }
  return out;
}

function sanitizeLevel(level: unknown): BuildingLevel {
  const l = (level ?? {}) as Partial<BuildingLevel>;
  const elements = Array.isArray(l.elements)
    ? (l.elements.filter(isRecognizedElement) as BuildingElement[])
    : [];
  return {
    id: l.id ?? `level_${Math.random().toString(36).slice(2, 8)}`,
    name: l.name ?? "Niveau",
    elevation_m: typeof l.elevation_m === "number" ? l.elevation_m : 0,
    height_m: typeof l.height_m === "number" ? l.height_m : 2.7,
    elements,
  };
}

function isRecognizedElement(e: unknown): e is BuildingElement {
  if (!e || typeof e !== "object") return false;
  const t = (e as { type?: unknown }).type;
  return (
    t === "wall" ||
    t === "slab" ||
    t === "opening" ||
    t === "column" ||
    t === "beam" ||
    t === "roof" ||
    t === "stair"
  );
}

function computeBboxFromLevels(levels: BuildingLevel[]) {
  if (levels.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  }
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const lvl of levels) {
    const top = lvl.elevation_m + lvl.height_m;
    if (lvl.elevation_m < minZ) minZ = lvl.elevation_m;
    if (top > maxZ) maxZ = top;
    for (const el of lvl.elements) {
      for (const p of extractPoints(el)) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
  }
  const safe = (v: number, fallback: number) =>
    Number.isFinite(v) ? v : fallback;
  return {
    min: { x: safe(minX, 0), y: safe(minY, 0), z: safe(minZ, 0) },
    max: { x: safe(maxX, 1), y: safe(maxY, 1), z: safe(maxZ, 1) },
  };
}

function extractPoints(el: BuildingElement): Array<{ x: number; y: number }> {
  switch (el.type) {
    case "wall":
    case "beam":
      return [el.start, el.end];
    case "slab":
    case "roof":
    case "stair":
      return el.polygon;
    case "column":
      return [el.position];
    case "opening":
      return []; // parametric along host wall
    default:
      return [];
  }
}

function buildSceneNotes(params: Passe5TopologyInput): string | undefined {
  const notes: string[] = [];
  if (!params.passe1.contexte_metrage.echelle_fiable) {
    notes.push("echelle non fiable");
  }
  if (params.passe1.contexte_metrage.qualite_image === "basse") {
    notes.push("qualite image basse");
  }
  if (params.passe1.contexte_metrage.zones_illisibles.length > 0) {
    notes.push(
      `zones illisibles: ${params.passe1.contexte_metrage.zones_illisibles.length}`
    );
  }
  if ((params.page_count ?? 1) > 1) {
    notes.push(`document ${params.page_count} pages`);
  }
  return notes.length > 0 ? notes.join(" | ") : undefined;
}
