/**
 * @cantaia/core/plans/scene
 *
 * Barrel export for the BuildingScene IR, the deterministic validation layer
 * and the Passe 5 Topology extractor. See ADR-001 for the canonical spec.
 */

export * from "./types";
export * from "./constants";
export * from "./geometry";
export { validateBuildingScene } from "./validator";
export type { ValidationContext, SceneValidationResult } from "./validator";
export { countPdfPages, isPdfBuffer } from "./pdf-pages";
export { runPasse5Topology, repairTruncatedJson } from "./passe5-topology";
export type {
  Passe5TopologyInput,
  Passe5TopologyResult,
} from "./passe5-topology";
