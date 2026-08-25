/**
 * confidence-visuals.ts — traduction confiance → couleur/opacité.
 *
 * Un seul endroit dans tout le module où une confiance devient une couleur.
 * Avant, le canvas coupait à 0.8/0.6 et le badge à 0.85/0.70 : le même mur
 * s'affichait ambre dans la scène et rouge dans l'inspecteur. Les bornes
 * viennent désormais de `CONFIDENCE_THRESHOLDS` (@cantaia/core).
 */

import { CONFIDENCE_THRESHOLDS, confidenceBand } from "@cantaia/core/plans/scene/constants";
import type { ConfidenceLevel, ElementKind } from "./types";

/** Palette du thème sombre, alignée sur les badges de l'inspecteur. */
export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  high: "#22C55E",
  medium: "#F97316",
  low: "#EF4444",
};

/** Couleur de rendu d'un élément selon sa confiance. */
export function confidenceTint(confidence: number): string {
  return CONFIDENCE_COLORS[confidenceBand(confidence)];
}

/** Bande de confiance — ré-export pour que l'UI n'importe qu'un module. */
export { confidenceBand, CONFIDENCE_THRESHOLDS };

/**
 * Opacité selon le type : on regarde À TRAVERS les dalles (sinon on ne voit
 * que le plafond), les ouvertures restent fantomatiques tant que le
 * découpage booléen des murs n'est pas fait (Phase 2).
 */
export function kindOpacity(kind: ElementKind, selected: boolean): number {
  if (selected) return 1;
  switch (kind) {
    case "slab":
      return 0.35;
    case "opening":
      return 0.5;
    case "annotation":
      return 0.8;
    case "wall":
    case "structure":
      return 0.88;
  }
}
