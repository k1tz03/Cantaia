/**
 * Passe 5 — Topology Extraction (3D Viewer Phase 1 spike).
 *
 * Reads passes 1-3 of the estimation pipeline + the raw plan image and
 * produces a `BuildingScene` IR (v1.0.0).
 *
 * Spike scope (W1-W3):
 *   - **Claude Vision only** (Sonnet 4.5). Multi-model consensus + Gemini
 *     tiebreaker are Phase 2 (W4+).
 *   - **Never throws**: any failure returns `{ scene: null, ... }` with an
 *     error string so the outer pipeline can complete normally.
 *   - **Pipeline-local**: this file is only called when Passe 5 is explicitly
 *     enabled in `pipeline.ts`. See the `DISABLE_PASSE5=1` kill-switch.
 */

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
  type SceneProvenance,
} from "./types";

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
}

export interface Passe5TopologyResult {
  /** `null` when extraction failed (never throws). */
  scene: BuildingScene | null;
  tokens_used: number;
  duration_ms: number;
  /** 0..1. Always 0 in the spike (no cross-model consensus). */
  model_divergence: number;
  /** Present when `scene === null`. */
  error: string | null;
}

/**
 * Run Passe 5 Topology and return a BuildingScene IR.
 *
 * Non-throwing: callers rely on `result.scene === null` to fall back.
 */
export async function runPasse5Topology(
  params: Passe5TopologyInput
): Promise<Passe5TopologyResult> {
  const start = Date.now();

  try {
    const { scene, tokens_used } = await extractSceneWithClaude(params);
    const duration_ms = Date.now() - start;

    return {
      scene,
      tokens_used,
      duration_ms,
      // Spike = Claude only. Multi-model consensus in W4+.
      model_divergence: 0,
      error: null,
    };
  } catch (err) {
    const duration_ms = Date.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    // Fire-and-forget log; never fail the outer pipeline on Passe 5.
    console.error(`[passe5-topology] failed: ${error}`);
    return {
      scene: null,
      tokens_used: 0,
      duration_ms,
      model_divergence: 0,
      error,
    };
  }
}

// ─── Claude Vision call ───────────────────────────────────────────────────

interface ClaudeExtractionResult {
  scene: BuildingScene;
  tokens_used: number;
}

async function extractSceneWithClaude(
  params: Passe5TopologyInput
): Promise<ClaudeExtractionResult> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ timeout: 120_000 });

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

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 12_000,
    system: [
      {
        type: "text",
        text: systemPrompt,
        // Cache the system prompt — it's stable across extractions.
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          fileContent,
          {
            type: "text",
            text: userPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "";
  const tokens_used =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

  console.log(
    `[passe5-topology] Claude: ${tokens_used} tokens, ${raw.length} chars`
  );

  const parsed = parseJSONResponse<Partial<BuildingScene>>(raw);
  const scene = assembleScene(parsed, params, tokens_used);
  return { scene, tokens_used };
}

// ─── Prompts ──────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `Tu es un architecte logiciel BIM spécialisé en représentations 2.5D pour visualisation.

Tu analyses un plan de construction (plan d'étage, coupe, ou façade) et produis une représentation JSON structurée conforme au schéma BuildingScene v1.0.0 de Cantaia.

RÈGLES FONDAMENTALES

1. **Unités** : toutes les distances en MÈTRES. Angles en DEGRÉS. Aucune exception.
2. **2.5D** : chaque élément est une empreinte (footprint) extrudée par hauteur. Pas de mailles 3D complexes.
3. **CRS** : origine arbitraire; x = droite (est), y = haut (nord), z = vertical. Rotation autour de Z si le plan n'est pas orienté nord.
4. **IDs** : utilise des identifiants stables et prévisibles : "wall_01", "wall_02", "slab_rdc_01", "opening_01", etc.
5. **Provenance obligatoire** : chaque élément DOIT inclure un bloc "provenance" avec confidence 0..1, source_passes, model_consensus (au moins Claude), et human_corrected=false.
6. **Confidence réaliste** : 0.9+ seulement si la cotation est lisible. 0.5-0.8 si tu estimes par échelle. <0.5 si tu as dû supposer.

STRUCTURE ATTENDUE

{
  "schema_version": "1.0.0",
  "plan_id": "<fourni par l'utilisateur>",
  "source_passes": { "passe1_id": "...", "passe2_id": "...", "passe3_id": "..." },
  "units": { "length": "m", "angle": "deg" },
  "crs": { "origin": { "x": 0, "y": 0, "z": 0 }, "rotation_deg": 0 },
  "bbox": { "min": { "x":0, "y":0, "z":0 }, "max": { "x":10, "y":8, "z":3 } },
  "levels": [
    {
      "id": "level_rdc",
      "name": "RDC",
      "elevation_m": 0.0,
      "height_m": 2.7,
      "elements": [ /* WallElement | SlabElement | OpeningElement | ColumnElement | BeamElement | RoofElement | StairElement */ ]
    }
  ],
  "annotations": [],
  "networks": [],
  "provenance": {
    "model_weights": { "claude": 1.0 },
    "tokens_used": 0,
    "duration_ms": 0,
    "model_divergence": 0
  },
  "extracted_at": "<ISO timestamp>"
}

FORMES DES ÉLÉMENTS (strict)

- Wall       : { "id": "...", "type": "wall", "start": { "x":0, "y":0 }, "end": { "x":5, "y":0 }, "thickness_m": 0.2, "height_m": 2.7, "material": "beton" | "brique" | "cloison_legere" | "unknown", "provenance": {...} }
- Slab       : { "id": "...", "type": "slab", "polygon": [{"x":0,"y":0},{"x":10,"y":0},{"x":10,"y":8},{"x":0,"y":8}], "thickness_m": 0.25, "elevation_m": 0, "material": "beton", "provenance": {...} }
- Opening    : { "id": "...", "type": "opening", "opening_type": "door" | "window", "host_element_id": "wall_01", "position_along": 0.5, "width_m": 0.9, "height_m": 2.1, "sill_m": 0, "provenance": {...} }
- Column     : { "id": "...", "type": "column", "position": { "x":3, "y":3 }, "width_m": 0.3, "depth_m": 0.3, "height_m": 2.7, "material": "beton", "provenance": {...} }
- Beam       : { "id": "...", "type": "beam", "start": {...}, "end": {...}, "elevation_m": 2.7, "width_m": 0.3, "depth_m": 0.5, "material": "beton", "provenance": {...} }
- Roof       : { "id": "...", "type": "roof", "polygon": [...], "base_elevation_m": 2.7, "roof_kind": "flat" | "pitched" | "shed", "pitch_deg": 0, "provenance": {...} }
- Stair      : { "id": "...", "type": "stair", "polygon": [...], "base_elevation_m": 0, "top_elevation_m": 2.7, "provenance": {...} }

ANCRAGE DES OUVERTURES : utilise TOUJOURS host_element_id + position_along (0..1 le long du mur).

CONTRAINTES SIA
- Si l'échelle n'est pas fiable (passe 1), baisse toutes les confidences d'environ 0.2.
- Si la qualité d'image est "basse", plafonne la confidence globale à 0.6.
- Si des zones sont illisibles (passe 1), NE PAS inventer d'éléments dans ces zones.

SORTIE
- Retourne UNIQUEMENT du JSON valide, sans markdown, sans préambule, sans commentaires.
- Le JSON doit être parsable avec JSON.parse sans transformation.`;
}

function buildUserPrompt(params: Passe5TopologyInput): string {
  const disc = params.passe1.classification.discipline;
  const type = params.passe1.classification.type_plan;
  const echelle =
    params.passe1.contexte_metrage.echelle_detectee ||
    params.passe1.cartouche.echelle ||
    "inconnue";
  const qualite = params.passe1.contexte_metrage.qualite_image;
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

  return `Plan à analyser (${disc} / ${type}), échelle ${echelle}, qualité image ${qualite}.

QUANTITÉS CONNUES (Passe 2 — sert d'ancrage quantitatif)
${totaux || "  (aucune quantité extraite)"}

ALERTES DE COHÉRENCE (Passe 3)
${alertes || "  (aucune alerte)"}

PARAMÈTRES OBLIGATOIRES DANS LA SORTIE
- plan_id: "${params.plan_id}"
- source_passes.passe1_id: "${params.passe1_id}"
- source_passes.passe2_id: "${params.passe2_id}"
- source_passes.passe3_id: "${params.passe3_id}"

Produis maintenant le BuildingScene JSON complet, en cohérence avec les quantités Passe 2 (la somme des surfaces de tes slabs ne doit pas s'écarter de plus de 15% des surfaces brutes du plancher annoncées).

Retourne UNIQUEMENT le JSON.`;
}

// ─── JSON parsing + scene assembly ────────────────────────────────────────

/** Robust JSON parser: strips ```json fences and trims preambles. */
function parseJSONResponse<T>(text: string): T {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fence) {
    cleaned = fence[1].trim();
  }
  // Fallback: find first { and last } to cope with preambles
  if (!cleaned.startsWith("{")) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end > start) {
      cleaned = cleaned.slice(start, end + 1);
    }
  }
  return JSON.parse(cleaned) as T;
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
    ? parsed.annotations
    : [];

  const bbox = parsed.bbox ?? computeBboxFromLevels(levels);

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
  return notes.length > 0 ? notes.join(" | ") : undefined;
}
