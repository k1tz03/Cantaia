/**
 * mock-scene.ts — hand-crafted BuildingScene IR for local spike testing.
 *
 * This is the kind of scene we expect Passe 5 to emit for a 6m × 4m house
 * with two levels. It exists so the viewer route can render a deterministic
 * scene without hitting Supabase / the extraction pipeline — useful while
 * the backend is being wired and for Storybook / visual regression later.
 *
 * Shape: identical to what `GET /api/plans/[id]/scene` returns in
 * `response.scene.scene_data`. Feed it through `buildingSceneToViewModel()`
 * before handing it to `SceneViewer`.
 *
 * Confidence design:
 *   - Most elements score 0.7–0.9 (healthy extraction).
 *   - One wall at 0.65 and the central column at 0.45 exercise the
 *     medium/low confidence tints (amber/red) in the canvas.
 *   - Overall low-confidence ratio ≈ 0.22, below the 0.3 gate so the
 *     SIA disclaimer modal is NOT forced on mount.
 */

import type { BuildingScene } from "@cantaia/core/plans/scene/types";
import { SCENE_SCHEMA_VERSION } from "@cantaia/core/plans/scene/types";

const EXTRACTED_AT = "2026-04-22T07:30:00.000Z";

export const MOCK_BUILDING_SCENE: BuildingScene = {
  schema_version: SCENE_SCHEMA_VERSION,
  plan_id: "mock-plan-0001",
  source_passes: {
    passe1_id: "mock-passe1-0001",
    passe2_id: "mock-passe2-0001",
    passe3_id: "mock-passe3-0001",
  },
  units: { length: "m", angle: "deg" },
  crs: { origin: { x: 0, y: 0, z: 0 }, rotation_deg: 0 },
  bbox: {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 6, y: 4, z: 5.6 },
  },
  levels: [
    {
      id: "lvl-rdc",
      name: "RDC",
      elevation_m: 0,
      height_m: 2.7,
      elements: [
        // --- 4 walls forming the 6×4 perimeter (counter-clockwise) ---
        {
          id: "wall-south",
          type: "wall",
          label: "Mur sud (façade)",
          start: { x: 0, y: 0 },
          end: { x: 6, y: 0 },
          thickness_m: 0.2,
          height_m: 2.7,
          material: "beton_arme",
          load_bearing: true,
          provenance: {
            confidence: 0.82,
            source_passes: ["passe2", "passe5"],
            model_consensus: { claude: 0.85, gpt4o: 0.8, gemini: 0.81 },
            human_corrected: false,
          },
        },
        {
          id: "wall-east",
          type: "wall",
          label: "Mur est",
          start: { x: 6, y: 0 },
          end: { x: 6, y: 4 },
          thickness_m: 0.2,
          height_m: 2.7,
          material: "beton_arme",
          load_bearing: true,
          provenance: {
            confidence: 0.78,
            source_passes: ["passe2", "passe5"],
            model_consensus: { claude: 0.8, gpt4o: 0.78, gemini: 0.76 },
            human_corrected: false,
          },
        },
        {
          id: "wall-north",
          type: "wall",
          label: "Mur nord",
          start: { x: 6, y: 4 },
          end: { x: 0, y: 4 },
          thickness_m: 0.2,
          height_m: 2.7,
          material: "beton_arme",
          load_bearing: true,
          provenance: {
            confidence: 0.85,
            source_passes: ["passe2", "passe5"],
            model_consensus: { claude: 0.87, gpt4o: 0.84, gemini: 0.83 },
            human_corrected: false,
          },
        },
        {
          id: "wall-west",
          type: "wall",
          label: "Mur ouest",
          start: { x: 0, y: 4 },
          end: { x: 0, y: 0 },
          thickness_m: 0.2,
          height_m: 2.7,
          material: "brique",
          load_bearing: true,
          // Borderline confidence — exercises the amber tint.
          provenance: {
            confidence: 0.65,
            source_passes: ["passe2", "passe5"],
            model_consensus: { claude: 0.7, gpt4o: 0.6, gemini: 0.58 },
            human_corrected: false,
          },
        },
        // --- Floor slab ---
        {
          id: "slab-floor-rdc",
          type: "slab",
          label: "Dalle RDC",
          polygon: [
            { x: 0, y: 0 },
            { x: 6, y: 0 },
            { x: 6, y: 4 },
            { x: 0, y: 4 },
          ],
          thickness_m: 0.2,
          elevation_m: 0,
          material: "beton_arme",
          provenance: {
            confidence: 0.88,
            source_passes: ["passe2", "passe5"],
            model_consensus: { claude: 0.9, gpt4o: 0.87, gemini: 0.88 },
            human_corrected: false,
          },
        },
        // --- Door on south wall, centred ---
        {
          id: "door-entry",
          type: "opening",
          label: "Porte d'entrée",
          opening_type: "door",
          host_element_id: "wall-south",
          position_along: 0.5,
          width_m: 0.9,
          height_m: 2.1,
          sill_m: 0,
          provenance: {
            confidence: 0.72,
            source_passes: ["passe2", "passe5"],
            model_consensus: { claude: 0.75, gpt4o: 0.7, gemini: 0.7 },
            human_corrected: false,
          },
        },
        // --- Central column (low confidence — exercises the red tint) ---
        {
          id: "column-center",
          type: "column",
          label: "Poteau central",
          position: { x: 3, y: 2 },
          width_m: 0.3,
          depth_m: 0.3,
          height_m: 2.7,
          material: "beton_arme",
          provenance: {
            confidence: 0.45,
            source_passes: ["passe2", "passe5"],
            model_consensus: { claude: 0.55, gpt4o: 0.4, gemini: 0.4 },
            human_corrected: false,
          },
        },
      ],
    },
    {
      id: "lvl-1er",
      name: "1er étage",
      elevation_m: 2.7,
      height_m: 2.7,
      elements: [
        // --- Ceiling slab / 1st floor ---
        {
          id: "slab-floor-1er",
          type: "slab",
          label: "Dalle 1er étage",
          polygon: [
            { x: 0, y: 0 },
            { x: 6, y: 0 },
            { x: 6, y: 4 },
            { x: 0, y: 4 },
          ],
          thickness_m: 0.2,
          elevation_m: 2.7,
          material: "beton_arme",
          provenance: {
            confidence: 0.8,
            source_passes: ["passe2", "passe5"],
            model_consensus: { claude: 0.82, gpt4o: 0.8, gemini: 0.78 },
            human_corrected: false,
          },
        },
        // --- Flat roof (Phase 1 keeps roofs simple) ---
        {
          id: "roof-flat",
          type: "roof",
          label: "Toiture plate",
          polygon: [
            { x: 0, y: 0 },
            { x: 6, y: 0 },
            { x: 6, y: 4 },
            { x: 0, y: 4 },
          ],
          base_elevation_m: 5.4,
          roof_kind: "flat",
          pitch_deg: 0,
          material: "beton_arme",
          provenance: {
            confidence: 0.7,
            source_passes: ["passe2", "passe5"],
            model_consensus: { claude: 0.72, gpt4o: 0.7, gemini: 0.68 },
            human_corrected: false,
          },
        },
      ],
    },
  ],
  annotations: [],
  networks: [],
  provenance: {
    model_weights: { claude: 1.1, gpt4o: 1.0, gemini: 0.9 },
    tokens_used: 14_200,
    duration_ms: 18_450,
    model_divergence: 0.12,
    notes: "Mock fixture for local spike — see mock-scene.ts",
  },
  extracted_at: EXTRACTED_AT,
};
