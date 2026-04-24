// Barrel exports for the 3D scene viewer module.
// Route: app/[locale]/(app)/projects/[id]/3d/page.tsx

export { SceneViewer } from "./SceneViewer";
export { SceneCanvas } from "./SceneCanvas";
export { LeftPanel } from "./LeftPanel";
export { RightPanel } from "./RightPanel";
export { Inspector } from "./Inspector";
export { ExtractionProgress } from "./ExtractionProgress";
export { LowConfidenceGate } from "./LowConfidenceGate";
export { ConfidenceBadge } from "./ConfidenceBadge";
export { Toolbar } from "./Toolbar";
export { MeasureTool } from "./MeasureTool";
export { SectionCutTool } from "./SectionCutTool";
export { WatermarkOverlay } from "./WatermarkOverlay";

export type {
  BuildingScene,
  SceneElement,
  SceneLevel,
  ConfidenceLevel,
  ExtractionPass,
  ExtractionProgressState,
  ElementKind,
  LayerKey,
  LayerState,
  MeasureMode,
  ModelName,
  ViewMode,
} from "./types";
