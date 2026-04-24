/**
 * Local type stubs for the 3D scene viewer wireframes.
 * CTO creates the canonical BuildingScene IR types in ADR-001.
 * These stubs let the UIX wireframes compile standalone; replace via import
 * from `@cantaia/core/scene3d/types` once ADR-001 lands.
 */

export type ConfidenceLevel = "high" | "medium" | "low";

export type ExtractionPass =
  | "identification"
  | "metering"
  | "verification"
  | "pricing"
  | "topology";

export type ModelName = "claude" | "gpt-4o" | "gemini";

export type ElementKind =
  | "wall"
  | "slab"
  | "opening"
  | "structure"
  | "annotation";

export interface SceneElement {
  id: string;
  kind: ElementKind;
  label: string;
  confidence: number; // 0..1
  source_passes: ExtractionPass[];
  model_consensus: {
    agreed: ModelName[];
    divergent: ModelName[];
    notes?: string;
  };
  level_id: string;
  bbox?: [number, number, number, number, number, number]; // x,y,z,w,h,d
  metadata?: Record<string, unknown>;
}

export interface SceneLevel {
  id: string;
  name: string;
  elevation_m: number;
  element_count: number;
}

export interface BuildingScene {
  project_id: string;
  generated_at: string;
  levels: SceneLevel[];
  elements: SceneElement[];
  overall_confidence: number; // 0..1
  low_confidence_ratio: number; // share of elements below 0.7
}

export type LayerKey =
  | "walls"
  | "slabs"
  | "openings"
  | "structure"
  | "annotations";

export interface LayerState {
  walls: boolean;
  slabs: boolean;
  openings: boolean;
  structure: boolean;
  annotations: boolean;
}

export interface ExtractionProgressState {
  currentPass: ExtractionPass;
  passIndex: number; // 0..4
  totalPasses: 5;
  etaSeconds: number | null;
  startedAt: string;
}

export type MeasureMode = "none" | "distance" | "surface";
export type ViewMode = "2.5d" | "plan" | "section";
