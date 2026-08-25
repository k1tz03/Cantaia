/**
 * adapter.ts — BuildingScene IR (v1.0.0) → UI view model.
 *
 * Two-model design (ADR-001):
 *   - IR (`@cantaia/core/plans/scene/types`): canonical, nested, 7 element
 *     types, discriminated union, persisted in `plan_scenes.scene_data`.
 *   - UI view model (`./types`): flat elements[], 5 kinds, pre-computed
 *     confidence stats, bbox ready for R3F render.
 *
 * The adapter collapses `column | beam | roof | stair` → `"structure"` for the
 * layer toggle UX (one checkbox covers all vertical load-bearing pieces).
 * The original IR element is preserved on `metadata.ir` so panels that need
 * type-specific details (e.g. an opening's host wall) can reach back.
 *
 * COORDINATE SYSTEM NOTE
 *   IR uses CAD/BIM convention: `Vec2 { x, y }` is the horizontal plane,
 *   elevation lives on the level / element as a separate scalar (metres).
 *   Three.js uses Y-up: the horizontal plane is XZ.
 *
 *   Mapping applied by this adapter:
 *     IR.x           → Three.x
 *     IR.y (Vec2.y)  → Three.z
 *     elevation_m    → Three.y
 *
 *   All bbox values emitted on SceneElement are ALREADY in Three.js space.
 *   Canvas code can treat them as world coords and render directly.
 */

import type {
  Annotation,
  BeamElement,
  BuildingElement,
  BuildingLevel,
  BuildingScene as IrScene,
  ColumnElement,
  ElementProvenance,
  ModelProvider,
  OpeningElement,
  RoofElement,
  SlabElement,
  StairElement,
  Vec2,
  WallElement,
} from "@cantaia/core/plans/scene/types";
import { CONFIDENCE_THRESHOLDS } from "@cantaia/core/plans/scene/constants";
import type {
  BuildingScene as UiScene,
  ElementKind,
  ExtractionPass,
  ModelName,
  SceneElement,
  SceneLevel,
} from "./types";

// ---------------------------------------------------------------------------
// Pass name normalisation
// ---------------------------------------------------------------------------
// IR provenance.source_passes is loose `string[]` — by convention Passe 5
// writes "passe1".."passe5" but we also accept the UI-style literals.

const PASS_NAME_MAP: Record<string, ExtractionPass> = {
  passe1: "identification",
  passe2: "metering",
  passe3: "verification",
  passe4: "pricing",
  passe5: "topology",
  identification: "identification",
  metering: "metering",
  verification: "verification",
  pricing: "pricing",
  topology: "topology",
};

function normalizePasses(raw: string[] | undefined): ExtractionPass[] {
  if (!raw) return [];
  const out: ExtractionPass[] = [];
  for (const s of raw) {
    const mapped = PASS_NAME_MAP[s];
    if (mapped && !out.includes(mapped)) out.push(mapped);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Model consensus derivation
// ---------------------------------------------------------------------------
// IR gives us `{ claude?: number, gpt4o?: number, gemini?: number }` (0..1
// per-model confidence). UI wants `{ agreed[], divergent[] }`.
//
// ATTENTION à la lecture de ce champ : en Phase 1 un SEUL modèle tourne
// (Claude). Il n'y a donc AUCUN consensus — juste l'auto-évaluation d'un
// modèle sur son propre travail. L'inspecteur l'intitule d'ailleurs
// « Auto-évaluation du modèle », pas « Consensus modèles » : afficher un
// consensus à un seul participant était trompeur.
//
// Le seuil vient de `CONFIDENCE_THRESHOLDS.high` — comme le canvas, le badge
// et le gate. Un seul jeu de seuils dans tout le module (cf. constants.ts).
//
// IR uses "gpt4o", UI uses "gpt-4o" (a stub naming drift that hopefully gets
// harmonised in v1.1). We rename at the boundary.

const MODEL_AGREEMENT_THRESHOLD = CONFIDENCE_THRESHOLDS.high;

const IR_TO_UI_MODEL: Record<ModelProvider, ModelName> = {
  claude: "claude",
  gpt4o: "gpt-4o",
  gemini: "gemini",
};

function deriveConsensus(prov: ElementProvenance): SceneElement["model_consensus"] {
  const agreed: ModelName[] = [];
  const divergent: ModelName[] = [];
  for (const [provider, conf] of Object.entries(prov.model_consensus) as Array<
    [ModelProvider, number]
  >) {
    const uiName = IR_TO_UI_MODEL[provider];
    if (!uiName) continue;
    if (conf >= MODEL_AGREEMENT_THRESHOLD) agreed.push(uiName);
    else divergent.push(uiName);
  }
  return { agreed, divergent };
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function polygonBounds(poly: Vec2[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  // Guard against empty polygons — return a zero box at origin.
  if (!isFinite(minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  return { minX, maxX, minY, maxY };
}

/**
 * A rendered box in Three.js space: centre + size + Y-rotation.
 * `bbox` on the UI SceneElement = [cx, cy, cz, w, h, d].
 * `rotation_y` (on metadata) = radians, Y axis.
 */
interface RenderBox {
  cx: number;
  cy: number;
  cz: number;
  w: number;
  h: number;
  d: number;
  rotation_y: number;
}

function wallBox(el: WallElement, levelElevation: number): RenderBox {
  const dx = el.end.x - el.start.x;
  const dy = el.end.y - el.start.y;
  const length = Math.hypot(dx, dy);
  const rotation_y = Math.atan2(dy, dx); // rotation around Three.Y axis
  const midX = (el.start.x + el.end.x) / 2;
  const midPlanY = (el.start.y + el.end.y) / 2;
  const midElev = levelElevation + el.height_m / 2;
  return {
    cx: midX,
    cy: midElev,
    cz: midPlanY,
    w: Math.max(length, 0.01),
    h: Math.max(el.height_m, 0.01),
    d: Math.max(el.thickness_m, 0.01),
    rotation_y,
  };
}

function slabBox(el: SlabElement): RenderBox {
  const b = polygonBounds(el.polygon);
  return {
    cx: (b.minX + b.maxX) / 2,
    cy: el.elevation_m + el.thickness_m / 2,
    cz: (b.minY + b.maxY) / 2,
    w: Math.max(b.maxX - b.minX, 0.01),
    h: Math.max(el.thickness_m, 0.01),
    d: Math.max(b.maxY - b.minY, 0.01),
    rotation_y: 0,
  };
}

function columnBox(el: ColumnElement, levelElevation: number): RenderBox {
  const w = el.width_m ?? (el.radius_m ? el.radius_m * 2 : 0.3);
  const d = el.depth_m ?? (el.radius_m ? el.radius_m * 2 : 0.3);
  return {
    cx: el.position.x,
    cy: levelElevation + el.height_m / 2,
    cz: el.position.y,
    w: Math.max(w, 0.01),
    h: Math.max(el.height_m, 0.01),
    d: Math.max(d, 0.01),
    rotation_y: 0,
  };
}

function beamBox(el: BeamElement): RenderBox {
  const dx = el.end.x - el.start.x;
  const dy = el.end.y - el.start.y;
  const length = Math.hypot(dx, dy);
  const rotation_y = Math.atan2(dy, dx);
  return {
    cx: (el.start.x + el.end.x) / 2,
    cy: el.elevation_m,
    cz: (el.start.y + el.end.y) / 2,
    w: Math.max(length, 0.01),
    h: Math.max(el.depth_m, 0.01),
    d: Math.max(el.width_m, 0.01),
    rotation_y,
  };
}

function roofBox(el: RoofElement): RenderBox {
  const b = polygonBounds(el.polygon);
  const h =
    el.ridge_elevation_m !== undefined
      ? el.ridge_elevation_m - el.base_elevation_m
      : 0.2; // flat roof default thickness
  return {
    cx: (b.minX + b.maxX) / 2,
    cy: el.base_elevation_m + h / 2,
    cz: (b.minY + b.maxY) / 2,
    w: Math.max(b.maxX - b.minX, 0.01),
    h: Math.max(h, 0.01),
    d: Math.max(b.maxY - b.minY, 0.01),
    rotation_y: 0,
  };
}

function stairBox(el: StairElement): RenderBox {
  const b = polygonBounds(el.polygon);
  const h = el.top_elevation_m - el.base_elevation_m;
  return {
    cx: (b.minX + b.maxX) / 2,
    cy: el.base_elevation_m + h / 2,
    cz: (b.minY + b.maxY) / 2,
    w: Math.max(b.maxX - b.minX, 0.01),
    h: Math.max(h, 0.01),
    d: Math.max(b.maxY - b.minY, 0.01),
    rotation_y: 0,
  };
}

/**
 * Openings need the host wall to resolve their world position. If the host
 * cannot be found (e.g. corrupt data), we fall back to a tiny marker at the
 * origin so the UI still shows the element in the list — it just renders
 * at (0,0,0) in the canvas. Correction UX surfaces the issue.
 */
function openingBox(
  el: OpeningElement,
  hostWall: WallElement | undefined,
  levelElevation: number,
): RenderBox {
  if (!hostWall) {
    return {
      cx: 0,
      cy: levelElevation + el.height_m / 2,
      cz: 0,
      w: Math.max(el.width_m, 0.01),
      h: Math.max(el.height_m, 0.01),
      d: 0.05,
      rotation_y: 0,
    };
  }
  const dx = hostWall.end.x - hostWall.start.x;
  const dy = hostWall.end.y - hostWall.start.y;
  const posX = hostWall.start.x + dx * el.position_along;
  const posY = hostWall.start.y + dy * el.position_along;
  const rotation_y = Math.atan2(dy, dx);
  const sill = el.sill_m ?? 0;
  return {
    cx: posX,
    cy: levelElevation + sill + el.height_m / 2,
    cz: posY,
    w: Math.max(el.width_m, 0.01),
    h: Math.max(el.height_m, 0.01),
    d: Math.max(hostWall.thickness_m + 0.02, 0.05), // +2cm so it pokes through the wall
    rotation_y,
  };
}

// ---------------------------------------------------------------------------
// Element kind mapping
// ---------------------------------------------------------------------------

function elementKind(ir: BuildingElement): ElementKind {
  switch (ir.type) {
    case "wall":
      return "wall";
    case "slab":
      return "slab";
    case "opening":
      return "opening";
    case "column":
    case "beam":
    case "roof":
    case "stair":
      return "structure";
  }
}

/**
 * Empreinte extrudable d'un élément polygonal, en espace Three.
 *
 * `points` sont les coordonnées du contour dans le plan XZ du monde
 * (IR.x → x, IR.y → z), `base` l'altitude Y de la face inférieure et
 * `thickness` la hauteur d'extrusion. `null` pour les éléments non
 * polygonaux — le canvas retombe alors sur la boîte de la bbox, ce qui est
 * exact pour un mur, un poteau ou une poutre.
 */
export interface ExtrusionFootprint {
  points: Array<{ x: number; z: number }>;
  base: number;
  thickness: number;
  /** Aire réelle du lacet, en m². Affichée dans l'inspecteur. */
  area_m2: number;
}

function shoelaceArea(points: Array<{ x: number; z: number }>): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

function extrusionFootprint(ir: BuildingElement): ExtrusionFootprint | null {
  let polygon: Vec2[] | null = null;
  let base = 0;
  let thickness = 0.2;

  switch (ir.type) {
    case "slab":
      polygon = ir.polygon;
      base = ir.elevation_m;
      thickness = Math.max(ir.thickness_m, 0.01);
      break;
    case "roof":
      polygon = ir.polygon;
      base = ir.base_elevation_m;
      thickness = Math.max(
        ir.ridge_elevation_m !== undefined
          ? ir.ridge_elevation_m - ir.base_elevation_m
          : 0.2,
        0.05,
      );
      break;
    case "stair":
      polygon = ir.polygon;
      base = ir.base_elevation_m;
      thickness = Math.max(ir.top_elevation_m - ir.base_elevation_m, 0.05);
      break;
    default:
      return null;
  }

  if (!Array.isArray(polygon) || polygon.length < 3) return null;

  const points = polygon
    .filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y))
    .map((p) => ({ x: p.x, z: p.y }));

  if (points.length < 3) return null;

  return { points, base, thickness, area_m2: shoelaceArea(points) };
}

function defaultLabel(ir: BuildingElement): string {
  if (ir.label) return ir.label;
  switch (ir.type) {
    case "wall":
      return ir.load_bearing ? "Mur porteur" : "Mur";
    case "slab":
      return "Dalle";
    case "opening":
      return ir.opening_type === "door" ? "Porte" : "Fenêtre";
    case "column":
      return "Poteau";
    case "beam":
      return "Poutre";
    case "roof":
      return "Toiture";
    case "stair":
      return "Escalier";
  }
}

// ---------------------------------------------------------------------------
// Main adapter
// ---------------------------------------------------------------------------

/**
 * Convert a BuildingScene IR (as returned by GET /api/plans/[id]/scene) to
 * the flat, render-ready view model consumed by SceneCanvas / SceneViewer.
 *
 * Pure function. No I/O. Stable order (preserves IR iteration order).
 */
export function buildingSceneToViewModel(ir: IrScene): UiScene {
  // Pre-index walls across all levels so openings can resolve their host
  // regardless of whether the opening sits on the same level as the wall.
  const wallIndex = new Map<string, WallElement>();
  for (const lvl of ir.levels) {
    for (const el of lvl.elements) {
      if (el.type === "wall") wallIndex.set(el.id, el);
    }
  }

  const uiLevels: SceneLevel[] = [];
  const uiElements: SceneElement[] = [];

  for (const lvl of ir.levels) {
    let elementCount = 0;

    for (const ir_el of lvl.elements) {
      const kind = elementKind(ir_el);
      const box = computeBox(ir_el, lvl, wallIndex);

      const ui_el: SceneElement = {
        id: ir_el.id,
        kind,
        label: defaultLabel(ir_el),
        confidence: ir_el.provenance.confidence,
        source_passes: normalizePasses(ir_el.provenance.source_passes),
        model_consensus: deriveConsensus(ir_el.provenance),
        level_id: lvl.id,
        bbox: box ? [box.cx, box.cy, box.cz, box.w, box.h, box.d] : undefined,
        metadata: {
          rotation_y: box?.rotation_y ?? 0,
          ir_type: ir_el.type,
          ir: ir_el,
          human_corrected: ir_el.provenance.human_corrected,
          // Empreinte RÉELLE, prête à extruder. Sans elle, le canvas rendait
          // les dalles et toitures à la bbox de leur polygone : une dalle en L
          // devenait un rectangle plein, et la surface perçue était
          // surestimée par construction.
          footprint: extrusionFootprint(ir_el),
        },
      };

      uiElements.push(ui_el);
      elementCount++;
    }

    uiLevels.push({
      id: lvl.id,
      name: lvl.name,
      elevation_m: lvl.elevation_m,
      element_count: elementCount,
    });
  }

  // Annotations: IR stores them at the scene level with optional level_id.
  // Promote them to SceneElements of kind "annotation" so the layer toggle
  // and selection work uniformly.
  for (const ann of ir.annotations) {
    const level_id = ann.level_id ?? uiLevels[0]?.id ?? "__orphan__";
    const ui_el: SceneElement = {
      id: ann.id,
      kind: "annotation",
      label: ann.text,
      confidence: ann.provenance.confidence,
      source_passes: normalizePasses(ann.provenance.source_passes),
      model_consensus: deriveConsensus(ann.provenance),
      level_id,
      bbox: annotationBox(ann),
      metadata: {
        rotation_y: 0,
        ir_type: "annotation",
        ir: ann,
        human_corrected: ann.provenance.human_corrected,
      },
    };
    uiElements.push(ui_el);
    // Keep per-level counts coherent.
    const target = uiLevels.find((l) => l.id === level_id);
    if (target) target.element_count++;
  }

  // Aggregate confidence stats.
  //
  // `low_confidence_ratio` se compte sous `CONFIDENCE_THRESHOLDS.mid` (0.5) et
  // NON sous le seuil « haut » : c'est ce ratio qui déclenche le gate SIA et
  // qui sert de critère de refus côté serveur. Les deux doivent compter la
  // même chose, sinon le gate s'ouvre sur des scènes que le serveur accepte
  // (et inversement).
  const total = uiElements.length;
  const sumConf = uiElements.reduce((s, e) => s + e.confidence, 0);
  const overall_confidence = total > 0 ? sumConf / total : 0;
  const lowCount = uiElements.filter((e) => e.confidence < CONFIDENCE_THRESHOLDS.mid).length;
  const low_confidence_ratio = total > 0 ? lowCount / total : 0;

  return {
    // NOTE: the view model names this `project_id`, but at this level of the
    // pipeline we actually pass the plan_id — the viewer is plan-scoped.
    // We'll reconcile the naming in a follow-up (add a proper plan_id field
    // to the view model). Keeping the spike simple for now.
    project_id: ir.plan_id,
    generated_at: ir.extracted_at,
    levels: uiLevels,
    elements: uiElements,
    overall_confidence,
    low_confidence_ratio,
    // B-f — la bbox de l'IR était purement et simplement JETÉE par l'adapter.
    // La caméra démarrait donc à une position fixe [10, 9, 10] : sur une villa
    // de 12 m, elle démarrait À L'INTÉRIEUR du bâtiment. Elle est désormais
    // convertie en espace Three (IR.y → Three.z, élévation → Three.y) et sert
    // à cadrer la caméra sur la diagonale de la scène.
    bbox: irBboxToThree(ir),
    quality_checks: ir.quality_checks ?? [],
    validation_issues: ir.validation_issues ?? [],
    scale_calibration: ir.scale_calibration ?? null,
  };
}

/**
 * bbox IR → bbox Three.js, en conservant la convention de l'adapter
 * (IR.x → Three.x, IR.y → Three.z, élévation → Three.y).
 *
 * Repli sur les éléments quand l'IR ne porte pas de bbox exploitable
 * (scènes 1.0.0 extraites avant la validation déterministe).
 */
function irBboxToThree(ir: IrScene): UiScene["bbox"] {
  const b = ir.bbox;
  const valid =
    b &&
    Number.isFinite(b.min?.x) &&
    Number.isFinite(b.max?.x) &&
    b.max.x - b.min.x > 0.01;

  if (!valid) return undefined;

  return [b.min.x, b.min.z, b.min.y, b.max.x, b.max.z, b.max.y];
}

// Dispatcher — kept as a separate function so TypeScript narrows the IR union
// cleanly per branch and so new element types are caught by exhaustiveness.
function computeBox(
  ir_el: BuildingElement,
  lvl: BuildingLevel,
  wallIndex: Map<string, WallElement>,
): RenderBox | null {
  switch (ir_el.type) {
    case "wall":
      return wallBox(ir_el, lvl.elevation_m);
    case "slab":
      return slabBox(ir_el);
    case "opening":
      return openingBox(ir_el, wallIndex.get(ir_el.host_element_id), lvl.elevation_m);
    case "column":
      return columnBox(ir_el, lvl.elevation_m);
    case "beam":
      return beamBox(ir_el);
    case "roof":
      return roofBox(ir_el);
    case "stair":
      return stairBox(ir_el);
  }
}

function annotationBox(ann: Annotation): SceneElement["bbox"] {
  // Annotations are zero-volume markers — we emit a tiny bbox so the
  // renderer can still show a billboard at the anchor. Anchor can be Vec2
  // or Vec3; if Vec2 we pin at y=0 in Three.js space.
  const a = ann.anchor;
  const x = a.x;
  const y = "z" in a ? a.z : 0;
  const z = a.y;
  return [x, y, z, 0.05, 0.05, 0.05];
}
