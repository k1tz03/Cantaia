/**
 * BuildingScene IR — v1.0.0
 *
 * Canonical intermediate representation for the Cantaia 3D viewer (ADR-001).
 * Produced by `runPasse5Topology` on top of passes 1-3 of the estimation
 * pipeline, consumed by the client-side R3F renderer, persisted in the
 * `plan_scenes` table (migration 076).
 *
 * Design principles:
 *  - **2.5D in Phase 1**: every element is a footprint extruded by `height_m`.
 *    No sloped walls, no full 3D meshes. Phase 2 unlocks full 3D.
 *  - **Per-element provenance**: every BuildingElement carries a
 *    `provenance` block so we can surface confidence to the user and gate
 *    corrections. Phase 1.5 correction UI rides on this.
 *  - **Semver-versioned**: `schema_version` is a literal string on the scene.
 *    Breaking changes bump the major and ship a migration for existing
 *    scenes (`parent_scene_id` lineage in `plan_scenes`).
 *  - **Networks reserved**: `networks: Network[]` exists at v1.0.0 but is
 *    always `[]` in Phase 1. Phase 3 MEP populates it without a schema bump.
 *
 * IMPORTANT: do not change the exported shapes without bumping
 * `SCENE_SCHEMA_VERSION` AND shipping a migration that rewrites all rows in
 * `plan_scenes` (or tags them with a lower `schema_version` for lazy upgrade).
 */

/** Current IR schema version. Bump major on breaking changes. */
export const SCENE_SCHEMA_VERSION = "1.0.0" as const;
export type SceneSchemaVersion = typeof SCENE_SCHEMA_VERSION;

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

/** 2D coordinate in scene CRS (metres). */
export interface Vec2 {
  x: number;
  y: number;
}

/** 3D coordinate in scene CRS (metres). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned bounding box in scene CRS (metres). */
export interface BoundingBox {
  min: Vec3;
  max: Vec3;
}

/**
 * Scene coordinate reference system.
 * Phase 1: simple origin + rotation around Z. No projection.
 */
export interface SceneCRS {
  /** World origin of the scene, in metres. Defaults to `{x:0,y:0,z:0}`. */
  origin: Vec3;
  /** Rotation around Z axis in degrees, applied at render time. */
  rotation_deg: number;
}

/** Unit declaration — locked to metres/degrees in v1.0.0. */
export interface SceneUnits {
  length: "m";
  angle: "deg";
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export type ModelProvider = "claude" | "gpt4o" | "gemini";

/** Per-element provenance — attached to every BuildingElement + Annotation. */
export interface ElementProvenance {
  /** Global confidence 0..1 (derived from consensus + any human corrections). */
  confidence: number;
  /** Names of passes that contributed, e.g. ["passe1","passe2","passe5"]. */
  source_passes: string[];
  /** Per-model confidence. Missing key = model did not contribute. */
  model_consensus: Partial<Record<ModelProvider, number>>;
  /** True once a user has validated or edited this element. */
  human_corrected: boolean;
  /** user_id of the corrector (nullable until corrected). */
  corrected_by?: string;
  /** ISO-8601 timestamp of the correction (nullable until corrected). */
  corrected_at?: string;
  /**
   * Ordered log of corrections applied to this element.
   * Populated from `plan_scene_corrections` on read.
   * Empty array when no corrections have been applied.
   */
  correction_log?: ElementCorrectionLogEntry[];
}

/**
 * Compact audit record mirroring a row from `plan_scene_corrections`.
 * Present on the IR at read-time for display; not required at extraction time.
 */
export interface ElementCorrectionLogEntry {
  correction_id: string;
  correction_type:
    | "geometry"
    | "material"
    | "opening_type"
    | "level_assignment"
    | "delete"
    | "add";
  corrected_by: string;
  corrected_at: string;
}

/** Scene-level provenance — one per BuildingScene. */
export interface SceneProvenance {
  /** Model weights used at extraction (snapshot, for reproducibility). */
  model_weights: Partial<Record<ModelProvider, number>>;
  /** Total tokens consumed by Passe 5 for this scene. */
  tokens_used: number;
  /** Wall-clock duration of Passe 5 in milliseconds. */
  duration_ms: number;
  /**
   * Aggregate divergence across models on the key metrics (wall count,
   * footprint area). 0 = perfect agreement, 1 = fully divergent.
   */
  model_divergence: number;
  /** Optional flag: true if a Gemini tiebreaker call was made. */
  tiebreaker_invoked?: boolean;
  /** Free-text notes from the extractor (e.g. "low image quality"). */
  notes?: string;
}

// ---------------------------------------------------------------------------
// Element discriminated union
// ---------------------------------------------------------------------------

export type MaterialHint =
  | "beton"
  | "beton_arme"
  | "brique"
  | "cloison_legere"
  | "bois"
  | "acier"
  | "verre"
  | "unknown";

/** Base shared by every BuildingElement. */
interface BuildingElementBase {
  id: string;
  /** Optional free-text label surfaced to the user (e.g. "Mur porteur"). */
  label?: string;
  provenance: ElementProvenance;
  /** Optional arbitrary metadata for future extensions. */
  metadata?: Record<string, unknown>;
}

/** Linear wall, 2.5D footprint extruded by `height_m`. */
export interface WallElement extends BuildingElementBase {
  type: "wall";
  start: Vec2;
  end: Vec2;
  thickness_m: number;
  height_m: number;
  material?: MaterialHint;
  /** True if the wall is part of the load-bearing structure. */
  load_bearing?: boolean;
}

/** Horizontal slab (floor/ceiling), polygon footprint at a given elevation. */
export interface SlabElement extends BuildingElementBase {
  type: "slab";
  /** Closed polygon in XY (open rings are auto-closed). Min 3 points. */
  polygon: Vec2[];
  thickness_m: number;
  /** Absolute Z of the top face, metres. */
  elevation_m: number;
  material?: MaterialHint;
}

export type OpeningKind = "door" | "window";

/**
 * Door or window. Positioned relative to its host wall via `host_element_id`
 * and a parametric `position_along` (0 = wall start, 1 = wall end).
 */
export interface OpeningElement extends BuildingElementBase {
  type: "opening";
  opening_type: OpeningKind;
  /** id of the WallElement this opening is cut into. */
  host_element_id: string;
  /** 0..1 parameter along the host wall. */
  position_along: number;
  width_m: number;
  height_m: number;
  /** Sill height above the wall base (metres). 0 for doors. */
  sill_m?: number;
}

/** Vertical column. Rectangular or circular, extruded by `height_m`. */
export interface ColumnElement extends BuildingElementBase {
  type: "column";
  /** Centre point in XY. */
  position: Vec2;
  /** Square/rectangular columns: width × depth. Circular: set `radius_m`. */
  width_m?: number;
  depth_m?: number;
  radius_m?: number;
  height_m: number;
  material?: MaterialHint;
}

/** Horizontal beam between two points. */
export interface BeamElement extends BuildingElementBase {
  type: "beam";
  start: Vec2;
  end: Vec2;
  /** Absolute Z of the beam centreline (metres). */
  elevation_m: number;
  width_m: number;
  depth_m: number;
  material?: MaterialHint;
}

export type RoofKind = "flat" | "pitched" | "shed";

/** Roof — polygon footprint + pitch. Simple pitch extrusion in Phase 1. */
export interface RoofElement extends BuildingElementBase {
  type: "roof";
  polygon: Vec2[];
  /** Elevation of the roof base (eaves), metres. */
  base_elevation_m: number;
  roof_kind: RoofKind;
  /** Degrees; 0 for flat. */
  pitch_deg: number;
  /** Absolute height at the ridge (metres). Ignored for flat. */
  ridge_elevation_m?: number;
  material?: MaterialHint;
}

/** Stair — bounding footprint + start/end elevation. No treads in Phase 1. */
export interface StairElement extends BuildingElementBase {
  type: "stair";
  /** Footprint polygon (rectangle is fine). */
  polygon: Vec2[];
  base_elevation_m: number;
  top_elevation_m: number;
  /** Direction vector; optional, used for rendering. */
  direction?: Vec2;
}

export type BuildingElement =
  | WallElement
  | SlabElement
  | OpeningElement
  | ColumnElement
  | BeamElement
  | RoofElement
  | StairElement;

/** Discriminator helper — kept as a union of the `type` literals. */
export type BuildingElementType = BuildingElement["type"];

// ---------------------------------------------------------------------------
// Annotations & Networks
// ---------------------------------------------------------------------------

export type AnnotationKind = "dimension" | "label" | "note";

export interface Annotation {
  id: string;
  kind: AnnotationKind;
  anchor: Vec2 | Vec3;
  text: string;
  /** When set, the annotation is pinned to a specific level. */
  level_id?: string;
  /** When set, the annotation is pinned to a specific element. */
  element_id?: string;
  provenance: ElementProvenance;
}

export type NetworkKind = "electrical" | "hvac" | "plumbing" | "sprinkler";

/**
 * Phase 3 (MEP) reservation. Present in v1.0.0 to avoid a migration later.
 * `segments` is deliberately `unknown[]` — Phase 3 will refine the schema
 * and bump the minor version (`1.1.0`) to add structure without breakage.
 */
export interface Network {
  id: string;
  kind: NetworkKind;
  /** Always empty in Phase 1. */
  segments: unknown[];
}

// ---------------------------------------------------------------------------
// Level + top-level scene
// ---------------------------------------------------------------------------

export interface BuildingLevel {
  id: string;
  /** Human-readable label: "RDC", "1er", "Sous-sol", "Combles". */
  name: string;
  /** Absolute elevation of the level floor, metres. */
  elevation_m: number;
  /** Floor-to-floor height, metres. */
  height_m: number;
  elements: BuildingElement[];
}

/** References to the upstream pipeline passes that fed Passe 5. */
export interface SourcePassReferences {
  passe1_id: string;
  passe2_id: string;
  passe3_id: string;
}

/**
 * Top-level BuildingScene IR. Persisted JSON-encoded in
 * `plan_scenes.scene_data`.
 */
export interface BuildingScene {
  schema_version: SceneSchemaVersion;
  plan_id: string;
  source_passes: SourcePassReferences;
  units: SceneUnits;
  crs: SceneCRS;
  bbox: BoundingBox;
  levels: BuildingLevel[];
  annotations: Annotation[];
  /** Always `[]` in Phase 1. Reserved for Phase 3 MEP. */
  networks: Network[];
  provenance: SceneProvenance;
  /** ISO-8601 timestamp of extraction. */
  extracted_at: string;
}

// ---------------------------------------------------------------------------
// Minimal type guards (run-time element discrimination for UI code)
// ---------------------------------------------------------------------------

export function isWall(el: BuildingElement): el is WallElement {
  return el.type === "wall";
}
export function isSlab(el: BuildingElement): el is SlabElement {
  return el.type === "slab";
}
export function isOpening(el: BuildingElement): el is OpeningElement {
  return el.type === "opening";
}
export function isColumn(el: BuildingElement): el is ColumnElement {
  return el.type === "column";
}
export function isBeam(el: BuildingElement): el is BeamElement {
  return el.type === "beam";
}
export function isRoof(el: BuildingElement): el is RoofElement {
  return el.type === "roof";
}
export function isStair(el: BuildingElement): el is StairElement {
  return el.type === "stair";
}
