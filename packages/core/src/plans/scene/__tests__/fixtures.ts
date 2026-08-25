/**
 * fixtures.ts — jeu étalon de scènes synthétiques + vérité terrain.
 *
 * Trois scènes couvrant les trois issues possibles du validator :
 *
 *   1. `villaClean`     — villa 12 × 8 m sur deux niveaux, cotée, à l'échelle.
 *                         ACCEPTÉE, rien à corriger.
 *   2. `villaScaleX2`   — la MÊME villa, mais toute la géométrie doublée
 *                         (erreur d'échelle ×2, celle que l'audit décrit comme
 *                         « invisible » : la scène reste cohérente avec
 *                         elle-même). Doit être RECALÉE, puis acceptée.
 *   3. `degradedScan`   — scan médiocre : emprise absurde, mur dégénéré,
 *                         épaisseur hors bornes, ouverture orpheline,
 *                         identifiant dupliqué, polygone à 2 points.
 *                         Doit être REFUSÉE (NF1).
 *
 * La vérité terrain accompagne chaque scène : ce sont les valeurs qu'un métré
 * manuel donnerait. Elles ne sont pas dérivées du code testé — c'est tout
 * l'intérêt.
 */

import { SCENE_SCHEMA_VERSION } from "../types";
import type {
  BuildingElement,
  BuildingLevel,
  BuildingScene,
  ElementProvenance,
  Vec2,
} from "../types";
import type { ValidationContext } from "../validator";

// ---------------------------------------------------------------------------
// Constructeurs
// ---------------------------------------------------------------------------

function provenance(confidence: number): ElementProvenance {
  return {
    confidence,
    source_passes: ["passe1", "passe5"],
    model_consensus: { claude: confidence },
    human_corrected: false,
  };
}

function wall(
  id: string,
  start: Vec2,
  end: Vec2,
  opts: { thickness?: number; height?: number; confidence?: number } = {}
): BuildingElement {
  return {
    id,
    type: "wall",
    start,
    end,
    thickness_m: opts.thickness ?? 0.25,
    height_m: opts.height ?? 2.7,
    material: "beton",
    load_bearing: true,
    provenance: provenance(opts.confidence ?? 0.9),
  };
}

function slab(
  id: string,
  polygon: Vec2[],
  elevation: number,
  opts: { thickness?: number; confidence?: number } = {}
): BuildingElement {
  return {
    id,
    type: "slab",
    polygon,
    thickness_m: opts.thickness ?? 0.25,
    elevation_m: elevation,
    material: "beton_arme",
    provenance: provenance(opts.confidence ?? 0.9),
  };
}

function opening(
  id: string,
  host: string,
  kind: "door" | "window",
  width: number,
  height: number,
  opts: { position?: number; sill?: number; confidence?: number } = {}
): BuildingElement {
  return {
    id,
    type: "opening",
    opening_type: kind,
    host_element_id: host,
    position_along: opts.position ?? 0.5,
    width_m: width,
    height_m: height,
    sill_m: opts.sill ?? 0,
    provenance: provenance(opts.confidence ?? 0.85),
  };
}

function buildScene(levels: BuildingLevel[]): BuildingScene {
  return {
    schema_version: SCENE_SCHEMA_VERSION,
    plan_id: "fixture-plan",
    source_passes: { passe1_id: "p1", passe2_id: "p2", passe3_id: "p3" },
    units: { length: "m", angle: "deg" },
    crs: { origin: { x: 0, y: 0, z: 0 }, rotation_deg: 0 },
    bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } },
    levels,
    annotations: [],
    networks: [],
    provenance: {
      model_weights: { claude: 1 },
      tokens_used: 0,
      duration_ms: 0,
      model_divergence: 0,
    },
    extracted_at: "2026-08-24T08:00:00.000Z",
  };
}

/**
 * Villa rectangulaire paramétrée par un facteur d'échelle.
 * `scale = 1` → géométrie correcte ; `scale = 2` → l'erreur d'échelle ×2.
 */
function makeVilla(scale: number): BuildingScene {
  const s = (v: number) => v * scale;
  const p = (x: number, y: number): Vec2 => ({ x: s(x), y: s(y) });

  const rectangle = (): Vec2[] => [p(0, 0), p(12, 0), p(12, 8), p(0, 8)];

  const perimeter = (prefix: string): BuildingElement[] => [
    wall(`${prefix}_w1`, p(0, 0), p(12, 0), { thickness: s(0.25), height: s(2.7) }),
    wall(`${prefix}_w2`, p(12, 0), p(12, 8), { thickness: s(0.25), height: s(2.7) }),
    wall(`${prefix}_w3`, p(12, 8), p(0, 8), { thickness: s(0.25), height: s(2.7) }),
    wall(`${prefix}_w4`, p(0, 8), p(0, 0), { thickness: s(0.25), height: s(2.7) }),
  ];

  return buildScene([
    {
      id: "level_rdc",
      name: "RDC",
      elevation_m: 0,
      height_m: s(2.7),
      elements: [
        slab("slab_rdc", rectangle(), 0),
        ...perimeter("rdc"),
        opening("op_door_rdc", "rdc_w1", "door", s(0.9), s(2.1), { position: 0.3 }),
        opening("op_win_rdc", "rdc_w2", "window", s(1.2), s(1.4), { sill: s(0.9) }),
      ],
    },
    {
      id: "level_r1",
      name: "1er",
      elevation_m: s(2.7),
      height_m: s(2.7),
      elements: [
        slab("slab_r1", rectangle(), s(2.7)),
        ...perimeter("r1"),
        opening("op_door_r1", "r1_w3", "door", s(0.9), s(2.1), { position: 0.6 }),
      ],
    },
  ]);
}

// ---------------------------------------------------------------------------
// Vérité terrain
// ---------------------------------------------------------------------------

export interface GroundTruth {
  /** Somme des aires de dalles, tous niveaux (m²). */
  total_slab_area_m2: number;
  /** Plus grande dimension horizontale (m). */
  footprint_span_m: number;
  /** Largeur médiane des portes (m). */
  median_door_width_m: number;
  /** Hauteur d'étage médiane (m). */
  median_storey_height_m: number;
  /** Nombre d'éléments qui doivent survivre à la validation. */
  expected_elements_kept: number;
  /** La scène doit-elle être refusée ? */
  expected_rejected: boolean;
}

export const VILLA_GROUND_TRUTH: GroundTruth = {
  // 12 × 8 = 96 m² par niveau, deux niveaux.
  total_slab_area_m2: 192,
  footprint_span_m: 12,
  median_door_width_m: 0.9,
  median_storey_height_m: 2.7,
  // RDC : 1 dalle + 4 murs + 2 ouvertures = 7. 1er : 1 dalle + 4 murs + 1
  // ouverture = 6.
  expected_elements_kept: 13,
  expected_rejected: false,
};

// ---------------------------------------------------------------------------
// Fixture 1 — villa propre
// ---------------------------------------------------------------------------

export function villaClean(): BuildingScene {
  return makeVilla(1);
}

/** Contexte nominal : plan coté, échelle fiable, image haute qualité. */
export function villaCleanContext(): ValidationContext {
  return {
    surfaceBrutePlancher: VILLA_GROUND_TRUTH.total_slab_area_m2,
    declaredScale: "1:100",
    scaleReliable: true,
    imageQuality: "haute",
    unreadableZones: 0,
    pageCount: 1,
    declaredDimensionChecks: [
      { label: "12.00", value_m: 12, from: { x: 0, y: 0 }, to: { x: 12, y: 0 } },
      { label: "8.00", value_m: 8, from: { x: 0, y: 0 }, to: { x: 0, y: 8 } },
    ],
  };
}

// ---------------------------------------------------------------------------
// Fixture 2 — erreur d'échelle ×2
// ---------------------------------------------------------------------------

export function villaScaleX2(): BuildingScene {
  return makeVilla(2);
}

/**
 * Contexte AVEC cotes : les deux cotes lues sur le plan valent 12 m et 8 m,
 * mais leurs extrémités sont distantes de 24 m et 16 m dans la géométrie
 * extraite. Le ratio 0.5 est donc mesurable en code.
 */
export function villaScaleX2ContextWithChecks(): ValidationContext {
  return {
    surfaceBrutePlancher: VILLA_GROUND_TRUTH.total_slab_area_m2,
    declaredScale: "1:100",
    scaleReliable: true,
    imageQuality: "haute",
    unreadableZones: 0,
    pageCount: 1,
    declaredDimensionChecks: [
      { label: "12.00", value_m: 12, from: { x: 0, y: 0 }, to: { x: 24, y: 0 } },
      { label: "8.00", value_m: 8, from: { x: 0, y: 0 }, to: { x: 0, y: 16 } },
    ],
  };
}

/**
 * Même scène, mais SANS aucune cote citée : la seule prise possible est la
 * vraisemblance (portes de 1.80 m, étages de 5.40 m — impossibles).
 */
export function villaScaleX2ContextNoChecks(): ValidationContext {
  return { ...villaScaleX2ContextWithChecks(), declaredDimensionChecks: [] };
}

// ---------------------------------------------------------------------------
// Fixture 3 — scan dégradé
// ---------------------------------------------------------------------------

/**
 * Ce que le pipeline produit sur un scan de mauvaise qualité : une géométrie
 * qui « a l'air » d'un bâtiment mais n'en est pas un. Avant les contrôles,
 * cette scène était persistée `completed` avec une confiance de 0.85.
 */
export function degradedScan(): BuildingScene {
  const elements: BuildingElement[] = [
    // Emprise de 2 × 1.5 m : aucun bâtiment ne fait cette taille.
    slab("slab_tiny", [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1.5 },
      { x: 0, y: 1.5 },
    ], 0, { confidence: 0.6 }),

    wall("w_ok", { x: 0, y: 0 }, { x: 2, y: 0 }, { confidence: 0.55 }),

    // Épaisseur de 5 m : conservé, mais confiance plafonnée.
    wall("w_thick", { x: 2, y: 0 }, { x: 2, y: 1.5 }, { thickness: 5, confidence: 0.8 }),

    // Longueur de 1 cm : rejeté.
    wall("w_degenerate", { x: 0, y: 0 }, { x: 0.01, y: 0 }, { confidence: 0.4 }),

    // Identifiant déjà pris : rejeté.
    wall("w_ok", { x: 0, y: 1.5 }, { x: 2, y: 1.5 }, { confidence: 0.5 }),

    // Mur hôte inexistant : rejeté.
    opening("op_orphan", "wall_qui_nexiste_pas", "door", 0.9, 2.1, { confidence: 0.5 }),

    // Position hors [0,1] : conservé, ramené à 1, confiance plafonnée.
    opening("op_overshoot", "w_ok", "door", 0.9, 2.1, { position: 1.8, confidence: 0.7 }),

    // Polygone à 2 points : rejeté par le schéma.
    {
      id: "slab_broken",
      type: "slab",
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
      thickness_m: 0.2,
      elevation_m: 0,
      provenance: provenance(0.5),
    } as BuildingElement,
  ];

  return buildScene([
    { id: "level_rdc", name: "RDC", elevation_m: 0, height_m: 2.7, elements },
  ]);
}

export function degradedScanContext(): ValidationContext {
  return {
    surfaceBrutePlancher: 180,
    declaredScale: "1:50",
    scaleReliable: false,
    imageQuality: "basse",
    unreadableZones: 3,
    pageCount: 1,
    declaredDimensionChecks: [],
  };
}

export const DEGRADED_GROUND_TRUTH: GroundTruth = {
  total_slab_area_m2: 3,
  footprint_span_m: 2,
  median_door_width_m: 0.9,
  median_storey_height_m: 2.7,
  // slab_tiny + w_ok + w_thick + op_overshoot survivent aux contrôles
  // élément par élément ; la scène entière est refusée par les contrôles
  // globaux.
  expected_elements_kept: 4,
  expected_rejected: true,
};
