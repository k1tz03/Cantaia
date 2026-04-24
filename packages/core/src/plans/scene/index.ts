/**
 * @cantaia/core/plans/scene
 *
 * Barrel export for the BuildingScene IR (v1.0.0) and the Passe 5 Topology
 * extractor. See ADR-001 for the canonical spec.
 */

export * from "./types";
export { runPasse5Topology } from "./passe5-topology";
export type {
  Passe5TopologyInput,
  Passe5TopologyResult,
} from "./passe5-topology";
