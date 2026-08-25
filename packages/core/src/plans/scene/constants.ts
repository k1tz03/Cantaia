/**
 * Seuils partagés du module Scene3D.
 *
 * ── Pourquoi ce fichier existe ────────────────────────────────────────────
 * L'audit 2 a relevé QUATRE jeux de seuils de confiance incompatibles dans
 * le module (0.7 dans l'adapter, 0.8/0.6 au canvas, 0.85/0.70 dans le badge,
 * ratio 0.3 au gate). Résultat : un même élément s'affichait « ambre » sur le
 * canvas et « rouge » dans l'inspecteur. Toute valeur de seuil consommée par
 * plus d'un fichier vit désormais ICI et nulle part ailleurs.
 *
 * Consommateurs : validator.ts, passe5-topology.ts, adapter.ts, SceneCanvas,
 * ConfidenceBadge, LowConfidenceGate, Inspector.
 */

/**
 * Bornes de confiance 0..1.
 *
 * - `>= high` : la cotation était lisible, la géométrie est directement
 *   mesurée. Vert.
 * - `>= mid`  : estimation par échelle / convention. Ambre.
 * - `<  mid`  : hypothèse. Rouge — et compté dans le ratio faible-confiance
 *   qui déclenche le refus NF1 et le gate SIA.
 */
export const CONFIDENCE_THRESHOLDS = {
  high: 0.85,
  mid: 0.5,
} as const;

export type ConfidenceBand = "high" | "medium" | "low";

/** Classe une confiance dans une des trois bandes. Source unique de vérité. */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (!Number.isFinite(confidence)) return "low";
  if (confidence >= CONFIDENCE_THRESHOLDS.high) return "high";
  if (confidence >= CONFIDENCE_THRESHOLDS.mid) return "medium";
  return "low";
}

/**
 * Confiance plafond imposée à un élément qui a violé un contrôle géométrique
 * non bloquant (épaisseur hors bornes recalée, polygone auto-fermé, …).
 * L'élément reste affiché mais ne peut plus prétendre au vert.
 */
export const DEGRADED_CONFIDENCE = 0.4;

// ---------------------------------------------------------------------------
// Bornes géométriques (mètres) — contrôles déterministes du validator
// ---------------------------------------------------------------------------

export const GEOMETRY_BOUNDS = {
  /** Épaisseur de mur / dalle plausible dans le bâtiment suisse. */
  thickness_m: { min: 0.05, max: 1.0 },
  /** Hauteur d'un élément vertical (mur, poteau). */
  height_m: { min: 1.8, max: 6.0 },
  /** Longueur minimale d'un mur pour être considéré comme réel. */
  wallMinLength_m: 0.05,
  /** Aire minimale d'un polygone (dalle, toiture, escalier). */
  polygonMinArea_m2: 0.5,
  /** Écart maximal toléré pour auto-fermer un anneau (1 cm). */
  polygonClosureTolerance_m: 0.01,
} as const;

// ---------------------------------------------------------------------------
// Snap topologique
// ---------------------------------------------------------------------------

export const SNAP = {
  /** Fusion des extrémités de murs distantes de moins de 10 cm. */
  endpointMergeRadius_m: 0.1,
  /** Redressement d'un mur dont l'angle est à ±2° d'un angle dominant. */
  angleSnapToleranceDeg: 2,
} as const;

// ---------------------------------------------------------------------------
// Contrôles globaux bloquants (§3 du plan de fiabilisation)
// ---------------------------------------------------------------------------

export const GLOBAL_CHECKS = {
  /**
   * Σ aires de dalles vs `surface_brute_plancher` de la Passe 2.
   * Au-delà, la scène est refusée : soit l'échelle est fausse, soit des
   * niveaux entiers manquent — dans les deux cas la géométrie est inutilisable.
   */
  slabVsSbpMaxDeviation: 0.3,
  /**
   * Aire des dalles / aire de l'enveloppe des murs. Hors de cet intervalle,
   * dalles et murs ne décrivent pas le même bâtiment (avertissement fort).
   */
  slabVsEnvelopeRatio: { min: 0.6, max: 1.4 },
  /** Emprise au sol admissible, tous types de bâtiments confondus. */
  footprintArea_m2: { min: 9, max: 20_000 },
  /** Plus grande dimension horizontale admissible. */
  footprintSpan_m: { min: 3, max: 300 },
} as const;

// ---------------------------------------------------------------------------
// Vraisemblance dimensionnelle (calibration d'échelle §4b)
// ---------------------------------------------------------------------------

export const PLAUSIBILITY = {
  /** Largeur médiane des portes intérieures/extérieures. */
  doorWidth_m: { min: 0.7, max: 1.1 },
  /** Hauteur d'étage (sol fini à sol fini) dans le résidentiel/tertiaire. */
  storeyHeight_m: { min: 2.3, max: 3.2 },
  /**
   * Facteurs correctifs « propres » testés quand la vraisemblance échoue.
   * Une erreur d'échelle de lecture est presque toujours un facteur rond
   * (1:100 lu comme 1:200, cm lus comme m, …).
   */
  cleanFactors: [0.5, 2, 0.1, 10, 0.01, 100] as readonly number[],
  /**
   * Écart relatif au-delà duquel les cotes citées par le modèle imposent un
   * facteur correctif global (2 %, aligné sur la métrique |1-ratio| ≤ 2 %).
   */
  scaleCheckTolerance: 0.02,
} as const;

// ---------------------------------------------------------------------------
// Refus (NF1)
// ---------------------------------------------------------------------------

export const REFUSAL = {
  /** Confiance globale minimale pour persister une scène. */
  minSceneConfidence: CONFIDENCE_THRESHOLDS.mid,
  /** Part maximale d'éléments sous `CONFIDENCE_THRESHOLDS.mid`. */
  maxLowConfidenceRatio: 0.3,
} as const;

/**
 * Une extraction `processing` qui n'a pas bougé depuis ce délai est
 * considérée comme morte (fonction serverless tuée avant l'UPDATE final).
 * Lue par le watchdog de `GET /api/plans/[id]/scene`.
 */
export const EXTRACTION_STALE_AFTER_MS = 10 * 60 * 1000;
