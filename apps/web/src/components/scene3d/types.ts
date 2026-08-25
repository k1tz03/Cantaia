/**
 * Modèle de vue du visualiseur 3D — plat, prêt à rendre.
 *
 * Produit UNIQUEMENT par `adapter.ts` à partir de la BuildingScene IR
 * canonique (`@cantaia/core/plans/scene/types`). Les types de qualité
 * (contrôles globaux, défauts de validation, calibration) sont ré-exportés
 * depuis l'IR : ils traversent l'adapter sans transformation, il n'y a donc
 * aucune raison d'en entretenir une copie qui divergerait.
 */

import type {
  QualityCheck,
  ScaleCalibration,
  ValidationIssue,
} from "@cantaia/core/plans/scene/types";

export type { QualityCheck, ScaleCalibration, ValidationIssue };

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
  /** Part d'éléments sous `CONFIDENCE_THRESHOLDS.mid` (0.5). */
  low_confidence_ratio: number;
  /**
   * Emprise de la scène en espace Three.js :
   * `[minX, minY, minZ, maxX, maxY, maxZ]`. Sert à cadrer la caméra.
   * `undefined` sur une scène héritée sans bbox exploitable.
   */
  bbox?: [number, number, number, number, number, number];
  /** Contrôles globaux produits par le validator (dalles vs SBP, etc.). */
  quality_checks?: QualityCheck[];
  /** Défauts géométriques relevés élément par élément. */
  validation_issues?: ValidationIssue[];
  /** Calibration d'échelle : cotes vérifiées et facteur appliqué. */
  scale_calibration?: ScaleCalibration | null;
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

/**
 * Modes de mesure réellement implémentés.
 *
 * « surface » a été retiré : aucun calcul d'aire n'existait derrière le bouton
 * correspondant. Le remettre suppose de rajouter la valeur ici ET le calcul —
 * pas seulement le bouton.
 */
export type MeasureMode = "none" | "distance";
export type ViewMode = "2.5d" | "plan" | "section";
