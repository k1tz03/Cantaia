/**
 * validator.ts — validation DÉTERMINISTE d'une BuildingScene.
 *
 * ── Raison d'être ─────────────────────────────────────────────────────────
 * Avant ce fichier, la seule barrière entre la sortie du LLM et la base était
 * `isRecognizedElement()` : « l'objet a-t-il un champ `type` connu ». Une
 * villa de 4 m, une porte de 12 m, une ouverture accrochée à un mur
 * inexistant, une dalle en L rendue comme un rectangle plein : tout passait,
 * était persisté `completed`, et s'affichait avec une confiance de 0.85
 * auto-déclarée par le modèle.
 *
 * Ce module est la contre-expertise en code. Il ne fait AUCUN appel réseau et
 * n'a aucune source de vérité extérieure : uniquement de la géométrie, des
 * bornes physiques et les ancrages quantitatifs des passes 1-3.
 *
 * ── Ordre des opérations (il compte) ──────────────────────────────────────
 *   1. Structure   — Zod sur l'union discriminée + finitude des nombres.
 *   2. Calibration — cotes citées re-mesurées, puis vraisemblance
 *                    (portes / hauteur d'étage). Facteur appliqué à TOUT.
 *   3. Métrique    — bornes d'épaisseur/hauteur/aire, APRÈS mise à l'échelle
 *                    (sinon on juge des longueurs qu'on s'apprête à changer).
 *   4. Snap        — fusion de sommets + redressement, sur de la géométrie
 *                    déjà propre et à la bonne échelle.
 *   5. Contrôles globaux — dalles vs SBP, dalles vs enveloppe, emprise vs
 *                    échelle déclarée.
 *   6. Confiance + refus (NF1).
 *
 * ── Contrat ───────────────────────────────────────────────────────────────
 * Ne jette jamais. Retourne une scène nettoyée + la liste des défauts. Quand
 * `rejected === true`, l'appelant NE DOIT PAS persister la scène en
 * `completed` : c'est la traduction de NF1 des acceptance criteria.
 */

import { z } from "zod";

import {
  CONFIDENCE_THRESHOLDS,
  DEGRADED_CONFIDENCE,
  GEOMETRY_BOUNDS,
  GLOBAL_CHECKS,
  PLAUSIBILITY,
  REFUSAL,
} from "./constants";
import {
  boundsOfPoints,
  convexHullArea,
  distance2,
  elementPoints,
  expectedSpanForScale,
  normalizePolygon,
  parseScaleDenominator,
  polygonArea,
  scaleLevel,
  snapScene,
} from "./geometry";
import type {
  BuildingElement,
  BuildingLevel,
  BuildingScene,
  DimensionCheck,
  ElementProvenance,
  OpeningElement,
  QualityCheck,
  ScaleCalibration,
  SlabElement,
  ValidationIssue,
  Vec2,
  WallElement,
} from "./types";

// ---------------------------------------------------------------------------
// Entrées / sorties
// ---------------------------------------------------------------------------

export interface ValidationContext {
  /** Surface brute de plancher annoncée par la Passe 2 (m²). */
  surfaceBrutePlancher: number | null;
  /** Échelle déclarée ("1:100"). */
  declaredScale: string | null;
  /** La Passe 1 juge-t-elle l'échelle fiable ? */
  scaleReliable: boolean;
  imageQuality: "haute" | "moyenne" | "basse";
  /** Nombre de zones illisibles signalées par la Passe 1. */
  unreadableZones: number;
  /** Nombre de pages du document source (1 pour une image). */
  pageCount: number;
  /**
   * Cotes citées par le modèle (label + valeur + extrémités). Vérifiées
   * géométriquement ici — c'est la seule calibration pixel→mètre possible
   * sans DPI.
   */
  declaredDimensionChecks: Array<{
    label: string;
    value_m: number;
    from: Vec2;
    to: Vec2;
  }>;
}

export interface SceneValidationResult {
  /** Scène nettoyée : éléments rejetés retirés, confiances plafonnées. */
  scene: BuildingScene;
  issues: ValidationIssue[];
  quality_checks: QualityCheck[];
  scale_calibration: ScaleCalibration;
  /** Confiance globale calculée EN CODE (jamais celle auto-déclarée). */
  confidence: number;
  /** Part d'éléments sous `CONFIDENCE_THRESHOLDS.mid`. */
  low_confidence_ratio: number;
  /** true ⇒ ne PAS persister en `completed` (NF1). */
  rejected: boolean;
  /** Message actionnable destiné à l'utilisateur. `null` si accepté. */
  refusal_reason: string | null;
  stats: {
    elements_in: number;
    elements_kept: number;
    elements_rejected: number;
    elements_degraded: number;
    merged_endpoints: number;
    straightened_walls: number;
  };
}

// ---------------------------------------------------------------------------
// Schémas Zod — union discriminée des BuildingElement
// ---------------------------------------------------------------------------
// `.passthrough()` : on ne veut pas jeter les champs futurs (metadata, label,
// provenance enrichie). Zod sert au contrôle de forme, pas au filtrage.

// `.finite()` rejette NaN et ±Infinity en restant un ZodNumber : on peut donc
// enchaîner `.positive()` dessus (ce que `.refine()` interdirait).
const finite = z.number().finite();
const vec2Schema = z.object({ x: finite, y: finite }).passthrough();
const polygonSchema = z.array(z.unknown()).min(3);

const baseFields = {
  id: z.string().trim().min(1).max(128),
  label: z.string().max(256).optional(),
};

const wallSchema = z
  .object({
    ...baseFields,
    type: z.literal("wall"),
    start: vec2Schema,
    end: vec2Schema,
    thickness_m: finite.positive(),
    height_m: finite.positive(),
  })
  .passthrough();

const slabSchema = z
  .object({
    ...baseFields,
    type: z.literal("slab"),
    polygon: polygonSchema,
    thickness_m: finite.positive(),
    elevation_m: finite,
  })
  .passthrough();

const openingSchema = z
  .object({
    ...baseFields,
    type: z.literal("opening"),
    opening_type: z.enum(["door", "window"]),
    host_element_id: z.string().trim().min(1).max(128),
    position_along: finite,
    width_m: finite.positive(),
    height_m: finite.positive(),
    sill_m: finite.optional(),
  })
  .passthrough();

const columnSchema = z
  .object({
    ...baseFields,
    type: z.literal("column"),
    position: vec2Schema,
    width_m: finite.positive().optional(),
    depth_m: finite.positive().optional(),
    radius_m: finite.positive().optional(),
    height_m: finite.positive(),
  })
  .passthrough();

const beamSchema = z
  .object({
    ...baseFields,
    type: z.literal("beam"),
    start: vec2Schema,
    end: vec2Schema,
    elevation_m: finite,
    width_m: finite.positive(),
    depth_m: finite.positive(),
  })
  .passthrough();

const roofSchema = z
  .object({
    ...baseFields,
    type: z.literal("roof"),
    polygon: polygonSchema,
    base_elevation_m: finite,
    roof_kind: z.enum(["flat", "pitched", "shed"]),
    pitch_deg: finite,
    ridge_elevation_m: finite.optional(),
  })
  .passthrough();

const stairSchema = z
  .object({
    ...baseFields,
    type: z.literal("stair"),
    polygon: polygonSchema,
    base_elevation_m: finite,
    top_elevation_m: finite,
  })
  .passthrough();

const elementSchema = z.discriminatedUnion("type", [
  wallSchema,
  slabSchema,
  openingSchema,
  columnSchema,
  beamSchema,
  roofSchema,
  stairSchema,
]);

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function issue(
  severity: ValidationIssue["severity"],
  code: string,
  message: string,
  element_id: string | null,
  level_id?: string | null
): ValidationIssue {
  return { element_id, level_id: level_id ?? null, severity, code, message };
}

/** Provenance robuste : le modèle omet régulièrement des champs. */
function normalizeProvenance(raw: unknown): ElementProvenance {
  const p = (raw ?? {}) as Partial<ElementProvenance>;
  const confidence =
    typeof p.confidence === "number" && Number.isFinite(p.confidence)
      ? Math.min(1, Math.max(0, p.confidence))
      : DEGRADED_CONFIDENCE;
  return {
    confidence,
    source_passes: Array.isArray(p.source_passes) ? p.source_passes.filter((s) => typeof s === "string") : ["passe5"],
    model_consensus:
      p.model_consensus && typeof p.model_consensus === "object" ? p.model_consensus : { claude: confidence },
    human_corrected: p.human_corrected === true,
    ...(p.corrected_by ? { corrected_by: p.corrected_by } : {}),
    ...(p.corrected_at ? { corrected_at: p.corrected_at } : {}),
    ...(Array.isArray(p.correction_log) ? { correction_log: p.correction_log } : {}),
  };
}

/** Plafonne la confiance d'un élément dégradé. */
function degrade(el: BuildingElement): void {
  if (el.provenance.confidence > DEGRADED_CONFIDENCE) {
    el.provenance.confidence = DEGRADED_CONFIDENCE;
  }
}

function median(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0 ? (clean[mid - 1] + clean[mid]) / 2 : clean[mid];
}

function round(v: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

// ---------------------------------------------------------------------------
// 1. Passe structurelle
// ---------------------------------------------------------------------------

interface StructuralOutcome {
  levels: BuildingLevel[];
  issues: ValidationIssue[];
  rejected: number;
  degraded: number;
}

function validateStructure(rawLevels: BuildingLevel[]): StructuralOutcome {
  const issues: ValidationIssue[] = [];
  let rejected = 0;
  let degraded = 0;

  // Index global des murs : une ouverture peut légitimement citer un mur
  // porté par un autre niveau (mezzanine, trémie).
  const wallIds = new Set<string>();
  for (const lvl of rawLevels) {
    for (const el of lvl.elements ?? []) {
      if ((el as { type?: string })?.type === "wall" && typeof (el as { id?: string }).id === "string") {
        wallIds.add((el as { id: string }).id);
      }
    }
  }

  const seenIds = new Set<string>();
  const levels: BuildingLevel[] = [];

  for (const rawLevel of rawLevels) {
    const levelId = typeof rawLevel.id === "string" && rawLevel.id ? rawLevel.id : `level_${levels.length}`;
    const elevation = Number.isFinite(rawLevel.elevation_m) ? rawLevel.elevation_m : 0;
    const height = Number.isFinite(rawLevel.height_m) && rawLevel.height_m > 0 ? rawLevel.height_m : 2.7;

    const kept: BuildingElement[] = [];

    for (const raw of rawLevel.elements ?? []) {
      const parsed = elementSchema.safeParse(raw);
      if (!parsed.success) {
        rejected++;
        const id = (raw as { id?: unknown })?.id;
        issues.push(
          issue(
            "error",
            "element_shape_invalid",
            `Élément rejeté : forme invalide (${parsed.error.issues[0]?.path.join(".") || "?"} — ${
              parsed.error.issues[0]?.message ?? "inconnu"
            }).`,
            typeof id === "string" ? id : null,
            levelId
          )
        );
        continue;
      }

      const el = parsed.data as unknown as BuildingElement;

      // Identifiants uniques : deux éléments de même id cassent la sélection,
      // la correction et le rendu (React key dupliquée).
      if (seenIds.has(el.id)) {
        rejected++;
        issues.push(
          issue("error", "duplicate_element_id", `Élément rejeté : identifiant « ${el.id} » déjà utilisé.`, el.id, levelId)
        );
        continue;
      }
      seenIds.add(el.id);

      el.provenance = normalizeProvenance((raw as { provenance?: unknown })?.provenance);

      // ── Contrôles spécifiques au type ──────────────────────────────────
      if (el.type === "wall") {
        const length = distance2(el.start, el.end);
        if (length < GEOMETRY_BOUNDS.wallMinLength_m) {
          rejected++;
          issues.push(
            issue(
              "error",
              "wall_degenerate",
              `Mur rejeté : longueur ${round(length)} m sous le minimum de ${GEOMETRY_BOUNDS.wallMinLength_m} m.`,
              el.id,
              levelId
            )
          );
          continue;
        }
      }

      if (el.type === "slab" || el.type === "roof" || el.type === "stair") {
        const norm = normalizePolygon((el as SlabElement).polygon);
        if (norm.polygon.length < 3) {
          rejected++;
          issues.push(
            issue(
              "error",
              "polygon_too_few_points",
              `Élément rejeté : polygone à ${norm.polygon.length} point(s) exploitable(s) (3 minimum).`,
              el.id,
              levelId
            )
          );
          continue;
        }
        (el as SlabElement).polygon = norm.polygon;
        if (norm.autoClosed || norm.droppedPoints > 0) {
          degraded++;
          degrade(el);
          issues.push(
            issue(
              "warning",
              "polygon_repaired",
              norm.autoClosed
                ? "Polygone auto-fermé (dernier point confondu avec le premier). Confiance plafonnée."
                : `Polygone nettoyé : ${norm.droppedPoints} point(s) invalide(s) ou dupliqué(s) retiré(s). Confiance plafonnée.`,
              el.id,
              levelId
            )
          );
        }
      }

      if (el.type === "opening") {
        const op = el as OpeningElement;
        if (!wallIds.has(op.host_element_id)) {
          rejected++;
          issues.push(
            issue(
              "error",
              "opening_host_unresolved",
              `Ouverture rejetée : le mur hôte « ${op.host_element_id} » n'existe pas dans la scène.`,
              op.id,
              levelId
            )
          );
          continue;
        }
        if (op.position_along < 0 || op.position_along > 1) {
          const clamped = Math.min(1, Math.max(0, op.position_along));
          issues.push(
            issue(
              "warning",
              "position_along_clamped",
              `Position le long du mur hors [0,1] (${round(op.position_along)}) — ramenée à ${round(clamped)}. Confiance plafonnée.`,
              op.id,
              levelId
            )
          );
          op.position_along = clamped;
          degraded++;
          degrade(el);
        }
      }

      kept.push(el);
    }

    levels.push({
      id: levelId,
      name: typeof rawLevel.name === "string" && rawLevel.name ? rawLevel.name : "Niveau",
      elevation_m: elevation,
      height_m: height,
      elements: kept,
    });
  }

  return { levels, issues, rejected, degraded };
}

// ---------------------------------------------------------------------------
// 2. Calibration d'échelle
// ---------------------------------------------------------------------------

function collectDoorWidths(levels: BuildingLevel[]): number[] {
  const out: number[] = [];
  for (const lvl of levels) {
    for (const el of lvl.elements) {
      if (el.type === "opening" && el.opening_type === "door") out.push(el.width_m);
    }
  }
  return out;
}

function collectStoreyHeights(levels: BuildingLevel[]): number[] {
  return levels.map((l) => l.height_m).filter((h) => Number.isFinite(h) && h > 0);
}

/** Vraisemblance : portes et hauteurs d'étage tombent-elles dans les clous ? */
function plausibilityScore(levels: BuildingLevel[]): { doors: number | null; storeys: number | null; ok: boolean } {
  const doors = median(collectDoorWidths(levels));
  const storeys = median(collectStoreyHeights(levels));

  const doorsOk =
    doors === null || (doors >= PLAUSIBILITY.doorWidth_m.min && doors <= PLAUSIBILITY.doorWidth_m.max);
  const storeysOk =
    storeys === null ||
    (storeys >= PLAUSIBILITY.storeyHeight_m.min && storeys <= PLAUSIBILITY.storeyHeight_m.max);

  // Aucun indice disponible ⇒ on ne peut ni confirmer ni infirmer.
  const ok = doorsOk && storeysOk;
  return { doors, storeys, ok };
}

interface CalibrationOutcome {
  calibration: ScaleCalibration;
  issues: ValidationIssue[];
  /** true quand aucun facteur ne rend la scène vraisemblable. */
  implausible: boolean;
}

function calibrateScale(levels: BuildingLevel[], ctx: ValidationContext): CalibrationOutcome {
  const issues: ValidationIssue[] = [];

  // ── (a) Cotes citées, re-mesurées en code ────────────────────────────────
  const checks: DimensionCheck[] = [];
  for (const d of ctx.declaredDimensionChecks) {
    if (!Number.isFinite(d.value_m) || d.value_m <= 0) continue;
    if (!d.from || !d.to || !Number.isFinite(d.from.x) || !Number.isFinite(d.to.x)) continue;
    const measured = distance2(d.from, d.to);
    if (measured <= 1e-6) continue;
    checks.push({
      label: String(d.label ?? "").slice(0, 64),
      declared_m: d.value_m,
      from: { x: d.from.x, y: d.from.y },
      to: { x: d.to.x, y: d.to.y },
      measured_m: round(measured),
      ratio: round(d.value_m / measured, 4),
    });
  }

  let factor = 1;
  let method: ScaleCalibration["method"] = "none";
  const notes: string[] = [];

  if (checks.length >= 2) {
    const ratios = checks.map((c) => c.ratio);
    const medianRatio = median(ratios) ?? 1;
    // Dispersion : si les cotes ne s'accordent pas entre elles, aucune
    // conclusion n'est possible — le modèle a lu n'importe quoi.
    const spread = Math.max(...ratios) / Math.min(...ratios);
    if (spread > 1.25) {
      issues.push(
        issue(
          "warning",
          "scale_checks_inconsistent",
          `Les ${checks.length} cotes citées ne s'accordent pas entre elles (dispersion ×${round(spread, 2)}) : aucune correction d'échelle appliquée.`,
          null
        )
      );
      notes.push("cotes contradictoires");
    } else if (Math.abs(1 - medianRatio) > PLAUSIBILITY.scaleCheckTolerance) {
      factor = medianRatio;
      method = "dimension_checks";
      notes.push(
        `facteur ${round(factor, 4)} déduit de ${checks.length} cotes (écart systématique ${round(
          (medianRatio - 1) * 100,
          1
        )} %)`
      );
      issues.push(
        issue(
          "warning",
          "scale_corrected",
          `Échelle recalée d'un facteur ${round(factor, 4)} : les cotes lues sur le plan et la géométrie extraite divergeaient de ${round(
            Math.abs(medianRatio - 1) * 100,
            1
          )} %.`,
          null
        )
      );
    } else {
      method = "dimension_checks";
      notes.push(`échelle confirmée par ${checks.length} cotes (écart ${round((medianRatio - 1) * 100, 1)} %)`);
    }
  } else {
    issues.push(
      issue(
        "warning",
        "scale_checks_missing",
        `Calibration impossible : ${checks.length} cote(s) exploitable(s) citée(s) par le modèle (2 minimum). L'échelle reste auto-déclarée.`,
        null
      )
    );
    notes.push("aucune cote vérifiable");
  }

  if (factor !== 1) {
    for (const lvl of levels) scaleLevel(lvl, factor);
  }

  // ── (b) Vraisemblance ────────────────────────────────────────────────────
  let plaus = plausibilityScore(levels);
  let implausible = false;

  if (!plaus.ok) {
    // Un facteur « propre » sauve-t-il la scène ? (1:100 lu comme 1:200,
    // centimètres lus comme mètres, …)
    let repaired = false;
    for (const candidate of PLAUSIBILITY.cleanFactors) {
      const probeDoors = plaus.doors === null ? null : plaus.doors * candidate;
      const probeStoreys = plaus.storeys === null ? null : plaus.storeys * candidate;
      const doorsOk =
        probeDoors === null ||
        (probeDoors >= PLAUSIBILITY.doorWidth_m.min && probeDoors <= PLAUSIBILITY.doorWidth_m.max);
      const storeysOk =
        probeStoreys === null ||
        (probeStoreys >= PLAUSIBILITY.storeyHeight_m.min && probeStoreys <= PLAUSIBILITY.storeyHeight_m.max);
      if (doorsOk && storeysOk && (probeDoors !== null || probeStoreys !== null)) {
        for (const lvl of levels) scaleLevel(lvl, candidate);
        factor = round(factor * candidate, 6);
        method = "plausibility";
        notes.push(`facteur net ×${candidate} appliqué pour rétablir la vraisemblance dimensionnelle`);
        issues.push(
          issue(
            "warning",
            "scale_repaired_by_plausibility",
            `Échelle corrigée d'un facteur net ×${candidate} : les portes/hauteurs d'étage extraites étaient physiquement impossibles.`,
            null
          )
        );
        plaus = plausibilityScore(levels);
        repaired = true;
        break;
      }
    }

    if (!repaired) {
      implausible = true;
      issues.push(
        issue(
          "error",
          "scale_implausible",
          `Dimensions invraisemblables : porte médiane ${
            plaus.doors === null ? "n/d" : `${round(plaus.doors, 2)} m`
          }, hauteur d'étage médiane ${
            plaus.storeys === null ? "n/d" : `${round(plaus.storeys, 2)} m`
          }. Aucun facteur d'échelle simple ne rend la scène cohérente.`,
          null
        )
      );
      notes.push("vraisemblance non rétablie");
    }
  }

  return {
    calibration: {
      checks,
      method,
      applied_factor: round(factor, 6),
      median_door_width_m: plaus.doors === null ? null : round(plaus.doors, 3),
      median_storey_height_m: plaus.storeys === null ? null : round(plaus.storeys, 3),
      notes: notes.join(" ; ") || "aucune calibration",
    },
    issues,
    implausible,
  };
}

// ---------------------------------------------------------------------------
// 3. Passe métrique (bornes physiques) — après mise à l'échelle
// ---------------------------------------------------------------------------

function validateMetrics(levels: BuildingLevel[]): { issues: ValidationIssue[]; rejected: number; degraded: number } {
  const issues: ValidationIssue[] = [];
  let rejected = 0;
  let degraded = 0;

  const { thickness_m, height_m, polygonMinArea_m2, wallMinLength_m } = GEOMETRY_BOUNDS;

  for (const lvl of levels) {
    const kept: BuildingElement[] = [];

    for (const el of lvl.elements) {
      let drop = false;

      const checkThickness = (value: number, what: string) => {
        if (value < thickness_m.min || value > thickness_m.max) {
          degraded++;
          degrade(el);
          issues.push(
            issue(
              "warning",
              "thickness_out_of_bounds",
              `${what} de ${round(value)} m hors des bornes [${thickness_m.min}, ${thickness_m.max}] m. Élément conservé, confiance plafonnée.`,
              el.id,
              lvl.id
            )
          );
        }
      };

      const checkHeight = (value: number, what: string) => {
        if (value < height_m.min || value > height_m.max) {
          degraded++;
          degrade(el);
          issues.push(
            issue(
              "warning",
              "height_out_of_bounds",
              `${what} de ${round(value)} m hors des bornes [${height_m.min}, ${height_m.max}] m. Élément conservé, confiance plafonnée.`,
              el.id,
              lvl.id
            )
          );
        }
      };

      switch (el.type) {
        case "wall": {
          const length = distance2(el.start, el.end);
          if (length < wallMinLength_m) {
            drop = true;
            issues.push(
              issue("error", "wall_degenerate", `Mur rejeté : longueur ${round(length)} m après mise à l'échelle.`, el.id, lvl.id)
            );
            break;
          }
          checkThickness(el.thickness_m, "Épaisseur de mur");
          checkHeight(el.height_m, "Hauteur de mur");
          break;
        }
        case "slab": {
          const area = polygonArea(el.polygon);
          if (area < polygonMinArea_m2) {
            drop = true;
            issues.push(
              issue(
                "error",
                "polygon_area_too_small",
                `Dalle rejetée : aire du lacet ${round(area, 2)} m² sous le minimum de ${polygonMinArea_m2} m².`,
                el.id,
                lvl.id
              )
            );
            break;
          }
          checkThickness(el.thickness_m, "Épaisseur de dalle");
          break;
        }
        case "roof":
        case "stair": {
          const area = polygonArea(el.polygon);
          if (area < polygonMinArea_m2) {
            drop = true;
            issues.push(
              issue(
                "error",
                "polygon_area_too_small",
                `${el.type === "roof" ? "Toiture" : "Escalier"} rejeté(e) : aire du lacet ${round(area, 2)} m² sous le minimum de ${polygonMinArea_m2} m².`,
                el.id,
                lvl.id
              )
            );
          }
          break;
        }
        case "column": {
          checkHeight(el.height_m, "Hauteur de poteau");
          const w = el.width_m ?? (el.radius_m ? el.radius_m * 2 : null);
          if (w !== null) checkThickness(w, "Section de poteau");
          break;
        }
        case "opening": {
          // Une porte de 12 m ou une fenêtre de 3 cm : conservée mais rouge.
          if (el.width_m < 0.3 || el.width_m > 6) {
            degraded++;
            degrade(el);
            issues.push(
              issue(
                "warning",
                "opening_width_implausible",
                `Largeur d'ouverture de ${round(el.width_m, 2)} m implausible. Élément conservé, confiance plafonnée.`,
                el.id,
                lvl.id
              )
            );
          }
          break;
        }
        case "beam":
          checkThickness(el.width_m, "Largeur de poutre");
          break;
      }

      if (drop) {
        rejected++;
        continue;
      }
      kept.push(el);
    }

    lvl.elements = kept;
  }

  // Une ouverture peut avoir perdu son mur hôte au cours de cette passe.
  const wallIds = new Set<string>();
  for (const lvl of levels) {
    for (const el of lvl.elements) if (el.type === "wall") wallIds.add(el.id);
  }
  for (const lvl of levels) {
    const kept = lvl.elements.filter((el) => {
      if (el.type !== "opening") return true;
      if (wallIds.has(el.host_element_id)) return true;
      rejected++;
      issues.push(
        issue(
          "error",
          "opening_host_unresolved",
          `Ouverture rejetée : son mur hôte « ${el.host_element_id} » a lui-même été écarté.`,
          el.id,
          lvl.id
        )
      );
      return false;
    });
    lvl.elements = kept;
  }

  return { issues, rejected, degraded };
}

// ---------------------------------------------------------------------------
// 4. Contrôles globaux
// ---------------------------------------------------------------------------

function totalSlabArea(levels: BuildingLevel[]): number {
  let sum = 0;
  for (const lvl of levels) {
    for (const el of lvl.elements) {
      if (el.type === "slab") sum += polygonArea((el as SlabElement).polygon);
    }
  }
  return sum;
}

function wallEnvelopeArea(levels: BuildingLevel[]): number {
  // Enveloppe convexe des extrémités de murs, cumulée niveau par niveau :
  // deux ailes distinctes ne doivent pas gonfler artificiellement l'aire via
  // une enveloppe unique. On prend le MAX des niveaux, pas la somme : la SBP
  // se compare étage par étage.
  let best = 0;
  for (const lvl of levels) {
    const pts: Vec2[] = [];
    for (const el of lvl.elements) {
      if (el.type === "wall") pts.push((el as WallElement).start, (el as WallElement).end);
    }
    if (pts.length >= 3) best = Math.max(best, convexHullArea(pts));
  }
  return best;
}

function runGlobalChecks(
  levels: BuildingLevel[],
  ctx: ValidationContext
): { checks: QualityCheck[]; issues: ValidationIssue[]; blocking: string[] } {
  const checks: QualityCheck[] = [];
  const issues: ValidationIssue[] = [];
  const blocking: string[] = [];

  const slabArea = totalSlabArea(levels);

  // ── (1) Σ dalles vs surface brute de plancher (Passe 2) ─────────────────
  if (ctx.surfaceBrutePlancher && ctx.surfaceBrutePlancher > 0 && slabArea > 0) {
    const deviation = Math.abs(slabArea - ctx.surfaceBrutePlancher) / ctx.surfaceBrutePlancher;
    const fail = deviation > GLOBAL_CHECKS.slabVsSbpMaxDeviation;
    checks.push({
      code: "slab_area_vs_sbp",
      status: fail ? "fail" : deviation > GLOBAL_CHECKS.slabVsSbpMaxDeviation / 2 ? "warn" : "pass",
      measured: round(slabArea, 2),
      expected: round(ctx.surfaceBrutePlancher, 2),
      message: `Somme des dalles ${round(slabArea, 1)} m² vs surface brute de plancher annoncée ${round(
        ctx.surfaceBrutePlancher,
        1
      )} m² (écart ${round(deviation * 100, 1)} %).`,
    });
    if (fail) {
      const msg = `La somme des dalles extraites (${round(slabArea, 1)} m²) s'écarte de ${round(
        deviation * 100,
        0
      )} % de la surface brute de plancher du métré (${round(ctx.surfaceBrutePlancher, 1)} m²).`;
      blocking.push(msg);
      issues.push(issue("error", "slab_area_vs_sbp", msg, null));
    }
  } else {
    checks.push({
      code: "slab_area_vs_sbp",
      status: "skipped",
      measured: slabArea > 0 ? round(slabArea, 2) : null,
      expected: null,
      message:
        ctx.surfaceBrutePlancher && ctx.surfaceBrutePlancher > 0
          ? "Aucune dalle extraite : comparaison à la surface brute de plancher impossible."
          : "Surface brute de plancher absente du métré : contrôle non réalisable.",
    });
  }

  // ── (2) Dalles vs enveloppe des murs ─────────────────────────────────────
  const envelope = wallEnvelopeArea(levels);
  if (envelope > 0 && slabArea > 0) {
    // On compare l'aire de dalle du niveau le plus chargé à l'enveloppe :
    // la SBP cumule les étages, l'enveloppe non.
    const perLevelSlab = Math.max(
      ...levels.map((lvl) =>
        lvl.elements.reduce((s, el) => (el.type === "slab" ? s + polygonArea((el as SlabElement).polygon) : s), 0)
      ),
      0
    );
    const ratio = perLevelSlab / envelope;
    const outside = ratio < GLOBAL_CHECKS.slabVsEnvelopeRatio.min || ratio > GLOBAL_CHECKS.slabVsEnvelopeRatio.max;
    checks.push({
      code: "slab_area_vs_envelope",
      status: outside ? "warn" : "pass",
      measured: round(ratio, 3),
      expected: 1,
      message: `Aire de dalle du niveau le plus chargé / enveloppe des murs = ${round(ratio, 2)} (attendu entre ${
        GLOBAL_CHECKS.slabVsEnvelopeRatio.min
      } et ${GLOBAL_CHECKS.slabVsEnvelopeRatio.max}).`,
    });
    if (outside) {
      issues.push(
        issue(
          "warning",
          "slab_area_vs_envelope",
          `Dalles et murs ne décrivent pas la même emprise (ratio ${round(ratio, 2)}). Des dalles ou des murs manquent probablement.`,
          null
        )
      );
    }
  } else {
    checks.push({
      code: "slab_area_vs_envelope",
      status: "skipped",
      measured: null,
      expected: null,
      message: "Pas assez de murs ou de dalles pour comparer les emprises.",
    });
  }

  // ── (3) Emprise vs échelle annoncée ──────────────────────────────────────
  const allPoints: Vec2[] = [];
  for (const lvl of levels) for (const el of lvl.elements) allPoints.push(...elementPoints(el));
  const b = boundsOfPoints(allPoints);

  if (!b) {
    checks.push({
      code: "footprint_vs_scale",
      status: "fail",
      measured: null,
      expected: null,
      message: "Aucune géométrie planimétrique exploitable dans la scène.",
    });
    blocking.push("Aucune géométrie planimétrique exploitable n'a pu être extraite du plan.");
    issues.push(issue("error", "footprint_empty", "Aucune géométrie planimétrique exploitable.", null));
  } else {
    const width = b.maxX - b.minX;
    const depth = b.maxY - b.minY;
    const span = Math.max(width, depth);
    const area = width * depth;

    const absurd =
      span < GLOBAL_CHECKS.footprintSpan_m.min ||
      span > GLOBAL_CHECKS.footprintSpan_m.max ||
      area < GLOBAL_CHECKS.footprintArea_m2.min ||
      area > GLOBAL_CHECKS.footprintArea_m2.max;

    const denom = parseScaleDenominator(ctx.declaredScale);
    const expected = expectedSpanForScale(denom);
    const offScale = expected !== null && (span < expected.min || span > expected.max);

    checks.push({
      code: "footprint_vs_scale",
      status: absurd ? "fail" : offScale ? "warn" : "pass",
      measured: round(span, 2),
      expected: expected ? round((expected.min + expected.max) / 2, 1) : null,
      message: absurd
        ? `Emprise de ${round(width, 1)} × ${round(depth, 1)} m : hors de tout format bâti plausible.`
        : offScale
          ? `Emprise de ${round(span, 1)} m incompatible avec l'échelle annoncée ${ctx.declaredScale} (attendu ${round(
              expected!.min,
              0
            )}–${round(expected!.max, 0)} m).`
          : `Emprise ${round(width, 1)} × ${round(depth, 1)} m, cohérente avec l'échelle ${ctx.declaredScale ?? "non déclarée"}.`,
    });

    if (absurd) {
      const msg = `L'emprise reconstruite (${round(width, 1)} × ${round(
        depth,
        1
      )} m) ne correspond à aucun bâtiment plausible : l'échelle du plan a probablement été mal lue.`;
      blocking.push(msg);
      issues.push(issue("error", "footprint_absurd", msg, null));
    } else if (offScale) {
      issues.push(
        issue(
          "warning",
          "footprint_vs_scale",
          `L'emprise (${round(span, 1)} m) est inhabituelle pour une échelle ${ctx.declaredScale}.`,
          null
        )
      );
    }
  }

  return { checks, issues, blocking };
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Valide, corrige et note une BuildingScene. Ne jette jamais.
 *
 * La scène retournée est SÛRE À RENDRE : tout ce qui reste a passé les
 * contrôles de forme, de bornes physiques et de résolution d'hôte. Ce qui a
 * été écarté ou dégradé est listé dans `issues`.
 *
 * `rejected === true` ⇒ NE PAS persister en `completed` (NF1). `refusal_reason`
 * porte alors un message directement affichable à l'utilisateur.
 */
export function validateBuildingScene(
  scene: BuildingScene,
  ctx: ValidationContext
): SceneValidationResult {
  const elementsIn = (scene.levels ?? []).reduce((s, l) => s + (l.elements?.length ?? 0), 0);

  // 1. Structure
  const structural = validateStructure(scene.levels ?? []);
  const levels = structural.levels;
  const issues: ValidationIssue[] = [...structural.issues];
  let rejectedCount = structural.rejected;
  let degradedCount = structural.degraded;

  // 2. Calibration d'échelle (peut muter toute la géométrie)
  const calib = calibrateScale(levels, ctx);
  issues.push(...calib.issues);

  // 3. Bornes métriques, à la bonne échelle
  const metrics = validateMetrics(levels);
  issues.push(...metrics.issues);
  rejectedCount += metrics.rejected;
  degradedCount += metrics.degraded;

  // 4. Snap topologique (post-validation : on ne fusionne que du propre)
  const snap = snapScene(levels);
  if (snap.mergedEndpoints > 0 || snap.straightenedWalls > 0) {
    issues.push(
      issue(
        "info",
        "topology_snapped",
        `Topologie recalée : ${snap.mergedEndpoints} extrémité(s) de murs fusionnée(s), ${snap.straightenedWalls} mur(s) redressé(s).`,
        null
      )
    );
  }

  // 5. Contrôles globaux
  const global = runGlobalChecks(levels, ctx);
  issues.push(...global.issues);

  // Contexte d'extraction dégradé : ce sont des faits de la Passe 1, pas des
  // défauts géométriques, mais ils doivent apparaître dans le même journal.
  if (!ctx.scaleReliable) {
    issues.push(
      issue("warning", "scale_not_reliable", "La Passe 1 juge l'échelle du plan non fiable : toutes les cotes en héritent.", null)
    );
  }
  if (ctx.imageQuality === "basse") {
    issues.push(issue("warning", "low_image_quality", "Qualité d'image basse : la lecture des cotations est peu fiable.", null));
  }
  if (ctx.unreadableZones > 0) {
    issues.push(
      issue(
        "warning",
        "unreadable_zones",
        `${ctx.unreadableZones} zone(s) illisible(s) signalée(s) par la Passe 1 : aucun élément n'y a été reconstruit.`,
        null
      )
    );
  }
  if (ctx.pageCount > 1) {
    issues.push(
      issue(
        "warning",
        "multi_page_document",
        `Document de ${ctx.pageCount} pages : l'assemblage multi-niveaux est réalisé au mieux à partir d'un seul passage de lecture. Vérifiez que chaque niveau du plan est bien représenté.`,
        null
      )
    );
  }

  // 6. Confiance globale + refus
  const allElements = levels.flatMap((l) => l.elements);
  const kept = allElements.length;
  const confidences = allElements.map((e) => e.provenance.confidence);
  const meanConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

  // Malus de contexte : une confiance auto-déclarée sur un plan illisible ou
  // sans calibration ne vaut pas une confiance sur un plan coté et vérifié.
  let confidence = meanConfidence;
  if (!ctx.scaleReliable) confidence *= 0.8;
  if (ctx.imageQuality === "basse") confidence *= 0.75;
  else if (ctx.imageQuality === "moyenne") confidence *= 0.92;
  if (calib.calibration.method === "none") confidence *= 0.85;
  if (global.checks.some((c) => c.status === "warn")) confidence *= 0.9;
  confidence = Math.max(0, Math.min(1, confidence));

  const lowCount = confidences.filter((c) => c < CONFIDENCE_THRESHOLDS.mid).length;
  const lowRatio = kept > 0 ? lowCount / kept : 1;

  const refusals: string[] = [...global.blocking];
  if (calib.implausible) {
    refusals.push(
      "Les dimensions extraites (portes, hauteurs d'étage) sont physiquement impossibles : l'échelle du plan n'a pas pu être établie."
    );
  }
  if (kept === 0) {
    refusals.push("Aucun élément exploitable n'a survécu aux contrôles géométriques.");
  }
  if (kept > 0 && confidence < REFUSAL.minSceneConfidence) {
    refusals.push(
      `Confiance globale de ${Math.round(confidence * 100)} % (minimum requis : ${Math.round(
        REFUSAL.minSceneConfidence * 100
      )} %).`
    );
  }
  if (kept > 0 && lowRatio > REFUSAL.maxLowConfidenceRatio) {
    refusals.push(
      `${Math.round(lowRatio * 100)} % des éléments sont sous le seuil de confiance minimal (maximum toléré : ${Math.round(
        REFUSAL.maxLowConfidenceRatio * 100
      )} %).`
    );
  }

  const rejected = refusals.length > 0;
  const refusal_reason = rejected
    ? `Extraction 3D refusée — la géométrie reconstruite n'est pas fiable.\n• ${refusals.join(
        "\n• "
      )}\nQue faire : vérifiez que le plan est un plan d'étage coté, à échelle lisible, et relancez l'estimation 4 passes avant de réessayer.`
    : null;

  const cleaned: BuildingScene = {
    ...scene,
    levels,
    bbox: recomputeBbox(levels, scene),
    quality_checks: global.checks,
    validation_issues: issues,
    scale_calibration: calib.calibration,
  };

  return {
    scene: cleaned,
    issues,
    quality_checks: global.checks,
    scale_calibration: calib.calibration,
    confidence: round(confidence, 3),
    low_confidence_ratio: round(lowRatio, 3),
    rejected,
    refusal_reason,
    stats: {
      elements_in: elementsIn,
      elements_kept: kept,
      elements_rejected: rejectedCount,
      elements_degraded: degradedCount,
      merged_endpoints: snap.mergedEndpoints,
      straightened_walls: snap.straightenedWalls,
    },
  };
}

/**
 * La bbox du modèle est jetée : après rejets, mise à l'échelle et snap, elle
 * ne décrit plus la scène. On la recalcule à partir de la géométrie retenue —
 * c'est cette bbox qui cadre la caméra (bug B-f).
 */
function recomputeBbox(levels: BuildingLevel[], fallback: BuildingScene): BuildingScene["bbox"] {
  const pts: Vec2[] = [];
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const lvl of levels) {
    pts.push(...lvl.elements.flatMap(elementPoints));
    minZ = Math.min(minZ, lvl.elevation_m);
    maxZ = Math.max(maxZ, lvl.elevation_m + lvl.height_m);
  }

  const b = boundsOfPoints(pts);
  if (!b || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return fallback.bbox ?? { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } };
  }

  return {
    min: { x: round(b.minX, 3), y: round(b.minY, 3), z: round(minZ, 3) },
    max: { x: round(b.maxX, 3), y: round(b.maxY, 3), z: round(maxZ, 3) },
  };
}
