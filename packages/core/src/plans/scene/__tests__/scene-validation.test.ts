/**
 * scene-validation.test.ts — tests du validator, de la géométrie et du snap.
 *
 * Exécution : voir `run.ts`.
 *
 * Ces tests portent sur la couche que l'audit 2 décrit comme absente : la
 * mesure. Ils ne vérifient pas « le code fait ce que le code fait », ils
 * confrontent la sortie du validator à une vérité terrain écrite à la main
 * dans `fixtures.ts`.
 */

import {
  CONFIDENCE_THRESHOLDS,
  DEGRADED_CONFIDENCE,
  GLOBAL_CHECKS,
} from "../constants";
import {
  convexHullArea,
  normalizePolygon,
  parseScaleDenominator,
  polygonArea,
  snapWallEndpoints,
  straightenWalls,
} from "../geometry";
import { validateBuildingScene } from "../validator";
import type { BuildingLevel, QualityCheck, WallElement } from "../types";
import { repairTruncatedJson } from "../passe5-topology";
import { buildFusedMetrage } from "../../estimation/consensus-engine";
import type { PosteConsensus } from "../../estimation/types";
import {
  DEGRADED_GROUND_TRUTH,
  VILLA_GROUND_TRUTH,
  degradedScan,
  degradedScanContext,
  villaClean,
  villaCleanContext,
  villaScaleX2,
  villaScaleX2ContextNoChecks,
  villaScaleX2ContextWithChecks,
} from "./fixtures";
import { assert, assertClose, assertEqual, assertIncludes, suite, test } from "./harness";

function checkByCode(checks: QualityCheck[], code: string): QualityCheck | undefined {
  return checks.find((c) => c.code === code);
}

function totalSlabArea(levels: BuildingLevel[]): number {
  let sum = 0;
  for (const lvl of levels) {
    for (const el of lvl.elements) {
      if (el.type === "slab") sum += polygonArea(el.polygon);
    }
  }
  return sum;
}

// ═══════════════════════════════════════════════════════════════════════════
// Géométrie
// ═══════════════════════════════════════════════════════════════════════════

export function runGeometryTests(): void {
  suite("géométrie");

  test("l'aire du lacet d'un rectangle 12 × 8 vaut 96 m²", () => {
    const area = polygonArea([
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 8 },
      { x: 0, y: 8 },
    ]);
    assertClose(area, 96, 0.001, "aire du rectangle");
  });

  test("une dalle en L n'a PAS l'aire de sa bbox", () => {
    // L inscrit dans un rectangle 10 × 8, amputé du bloc x∈[4,10] × y∈[4,8] :
    // 80 − 24 = 56 m². Sa bbox vaut 80 m². C'est très exactement la
    // surestimation de 43 % que produisait le rendu à la bbox du polygone.
    const lShape = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 8 },
      { x: 0, y: 8 },
    ];
    const bboxArea = 10 * 8;
    assertClose(polygonArea(lShape), 56, 0.001, "aire du L");
    assert(
      polygonArea(lShape) < bboxArea,
      "l'aire du L doit être inférieure à celle de sa bbox"
    );
  });

  test("un anneau fermé explicitement est normalisé en anneau ouvert", () => {
    const norm = normalizePolygon([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
      { x: 0.002, y: 0.002 }, // répétition du premier point, à 3 mm
    ]);
    assertEqual(norm.polygon.length, 4, "points conservés");
    assertEqual(norm.autoClosed, true, "auto-fermeture détectée");
    assertClose(polygonArea(norm.polygon), 12, 0.001, "aire après normalisation");
  });

  test("les points non finis sont écartés", () => {
    const norm = normalizePolygon([
      { x: 0, y: 0 },
      { x: Number.NaN, y: 2 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
    ]);
    assertEqual(norm.polygon.length, 3, "points valides conservés");
    assert(norm.droppedPoints >= 1, "au moins un point écarté");
  });

  test("l'enveloppe convexe d'un nuage rectangulaire retrouve son aire", () => {
    const area = convexHullArea([
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 8 },
      { x: 0, y: 8 },
      { x: 6, y: 4 }, // point intérieur : ne doit rien changer
    ]);
    assertClose(area, 96, 0.001, "aire de l'enveloppe");
  });

  test("l'échelle textuelle est lue dans ses variantes courantes", () => {
    assertEqual(parseScaleDenominator("1:100"), 100, "1:100");
    assertEqual(parseScaleDenominator("Echelle 1/50"), 50, "1/50");
    assertEqual(parseScaleDenominator("indéterminée"), null, "illisible");
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Snap topologique
// ═══════════════════════════════════════════════════════════════════════════

export function runSnapTests(): void {
  suite("snap topologique");

  test("deux extrémités distantes de 3 cm sont fusionnées", () => {
    const level: BuildingLevel = {
      id: "L",
      name: "L",
      elevation_m: 0,
      height_m: 2.7,
      elements: [
        {
          id: "a",
          type: "wall",
          start: { x: 0, y: 0 },
          end: { x: 5, y: 0 },
          thickness_m: 0.2,
          height_m: 2.7,
          provenance: { confidence: 0.9, source_passes: [], model_consensus: {}, human_corrected: false },
        },
        {
          id: "b",
          // 3 cm d'écart avec la fin du mur « a » : le défaut le plus visible
          // à l'écran, deux murs qui ne se touchent pas.
          type: "wall",
          start: { x: 5.03, y: 0.01 },
          end: { x: 5.03, y: 4 },
          thickness_m: 0.2,
          height_m: 2.7,
          provenance: { confidence: 0.9, source_passes: [], model_consensus: {}, human_corrected: false },
        },
      ],
    };

    const moved = snapWallEndpoints(level);
    assert(moved > 0, "au moins une extrémité déplacée");

    const a = level.elements[0] as WallElement;
    const b = level.elements[1] as WallElement;
    assertClose(a.end.x, b.start.x, 1e-9, "jonction en x");
    assertClose(a.end.y, b.start.y, 1e-9, "jonction en y");
  });

  test("des extrémités distantes de 40 cm ne sont PAS fusionnées", () => {
    const level: BuildingLevel = {
      id: "L",
      name: "L",
      elevation_m: 0,
      height_m: 2.7,
      elements: [
        {
          id: "a",
          type: "wall",
          start: { x: 0, y: 0 },
          end: { x: 5, y: 0 },
          thickness_m: 0.2,
          height_m: 2.7,
          provenance: { confidence: 0.9, source_passes: [], model_consensus: {}, human_corrected: false },
        },
        {
          id: "b",
          type: "wall",
          start: { x: 5.4, y: 0 },
          end: { x: 5.4, y: 4 },
          thickness_m: 0.2,
          height_m: 2.7,
          provenance: { confidence: 0.9, source_passes: [], model_consensus: {}, human_corrected: false },
        },
      ],
    };

    snapWallEndpoints(level);
    const b = level.elements[1] as WallElement;
    assertClose(b.start.x, 5.4, 1e-9, "le sommet éloigné reste en place");
  });

  test("un mur à 1° de l'horizontale est redressé, un mur à 12° ne l'est pas", () => {
    const almostFlat = Math.tan((1 * Math.PI) / 180) * 5;
    const clearlyOblique = Math.tan((12 * Math.PI) / 180) * 5;

    const level: BuildingLevel = {
      id: "L",
      name: "L",
      elevation_m: 0,
      height_m: 2.7,
      elements: [
        {
          id: "flat",
          type: "wall",
          start: { x: 0, y: 0 },
          end: { x: 5, y: almostFlat },
          thickness_m: 0.2,
          height_m: 2.7,
          provenance: { confidence: 0.9, source_passes: [], model_consensus: {}, human_corrected: false },
        },
        {
          id: "oblique",
          type: "wall",
          start: { x: 0, y: 10 },
          end: { x: 5, y: 10 + clearlyOblique },
          thickness_m: 0.2,
          height_m: 2.7,
          provenance: { confidence: 0.9, source_passes: [], model_consensus: {}, human_corrected: false },
        },
      ],
    };

    const count = straightenWalls(level);
    assertEqual(count, 1, "un seul mur redressé");

    const flat = level.elements[0] as WallElement;
    const oblique = level.elements[1] as WallElement;
    assertClose(flat.end.y, 0, 1e-6, "le mur presque horizontal est aligné");
    assertClose(
      oblique.end.y - 10,
      clearlyOblique,
      1e-9,
      "le mur franchement oblique est laissé tel quel"
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Validator — scène propre
// ═══════════════════════════════════════════════════════════════════════════

export function runCleanSceneTests(): void {
  suite("validator / villa propre");

  const result = validateBuildingScene(villaClean(), villaCleanContext());

  test("la scène est acceptée", () => {
    assertEqual(result.rejected, VILLA_GROUND_TRUTH.expected_rejected, "verdict");
    assertEqual(result.refusal_reason, null, "aucun motif de refus");
  });

  test("tous les éléments survivent", () => {
    assertEqual(
      result.stats.elements_kept,
      VILLA_GROUND_TRUTH.expected_elements_kept,
      "éléments conservés"
    );
    assertEqual(result.stats.elements_rejected, 0, "aucun rejet");
  });

  test("la somme des dalles correspond à la vérité terrain", () => {
    assertClose(
      totalSlabArea(result.scene.levels),
      VILLA_GROUND_TRUTH.total_slab_area_m2,
      0.01,
      "Σ aires de dalles"
    );
  });

  test("le contrôle Σ dalles vs SBP passe", () => {
    const check = checkByCode(result.quality_checks, "slab_area_vs_sbp");
    assert(!!check, "contrôle présent");
    assertEqual(check!.status, "pass", "statut du contrôle");
  });

  test("le contrôle dalles vs enveloppe passe", () => {
    const check = checkByCode(result.quality_checks, "slab_area_vs_envelope");
    assert(!!check, "contrôle présent");
    assertEqual(check!.status, "pass", "statut du contrôle");
    assertClose(check!.measured ?? 0, 1, 0.05, "ratio dalles / enveloppe");
  });

  test("l'emprise est cohérente avec l'échelle 1:100", () => {
    const check = checkByCode(result.quality_checks, "footprint_vs_scale");
    assert(!!check, "contrôle présent");
    assertEqual(check!.status, "pass", "statut du contrôle");
    assertClose(check!.measured ?? 0, VILLA_GROUND_TRUTH.footprint_span_m, 0.01, "portée");
  });

  test("les cotes citées confirment l'échelle sans correction", () => {
    assertEqual(result.scale_calibration.method, "dimension_checks", "méthode");
    assertClose(result.scale_calibration.applied_factor, 1, 1e-6, "facteur appliqué");
    assertClose(
      result.scale_calibration.median_door_width_m ?? 0,
      VILLA_GROUND_TRUTH.median_door_width_m,
      0.01,
      "porte médiane"
    );
  });

  test("la confiance reste haute et aucun élément n'est sous le seuil", () => {
    assert(
      result.confidence >= CONFIDENCE_THRESHOLDS.high,
      `confiance ${result.confidence} attendue ≥ ${CONFIDENCE_THRESHOLDS.high}`
    );
    assertEqual(result.low_confidence_ratio, 0, "ratio faible confiance");
  });

  test("la bbox est recalculée à partir de la géométrie retenue", () => {
    assertClose(result.scene.bbox.max.x, 12, 0.01, "bbox max x");
    assertClose(result.scene.bbox.max.y, 8, 0.01, "bbox max y");
    assertClose(result.scene.bbox.max.z, 5.4, 0.01, "bbox max z (deux niveaux)");
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Validator — calibration d'échelle
// ═══════════════════════════════════════════════════════════════════════════

export function runScaleCalibrationTests(): void {
  suite("validator / calibration d'échelle");

  test("une erreur ×2 est détectée par les cotes citées et corrigée", () => {
    const result = validateBuildingScene(villaScaleX2(), villaScaleX2ContextWithChecks());

    assertClose(result.scale_calibration.applied_factor, 0.5, 1e-6, "facteur appliqué");
    assertEqual(result.scale_calibration.method, "dimension_checks", "méthode");
    assertClose(
      totalSlabArea(result.scene.levels),
      VILLA_GROUND_TRUTH.total_slab_area_m2,
      0.01,
      "Σ aires après recalage"
    );
    assertEqual(result.rejected, false, "scène acceptée après recalage");
  });

  test("sans cote, la vraisemblance rattrape l'erreur ×2", () => {
    const result = validateBuildingScene(villaScaleX2(), villaScaleX2ContextNoChecks());

    assertClose(result.scale_calibration.applied_factor, 0.5, 1e-6, "facteur appliqué");
    assertEqual(result.scale_calibration.method, "plausibility", "méthode");
    assertClose(
      result.scale_calibration.median_door_width_m ?? 0,
      VILLA_GROUND_TRUTH.median_door_width_m,
      0.01,
      "porte médiane après correction"
    );
    assertClose(
      result.scale_calibration.median_storey_height_m ?? 0,
      VILLA_GROUND_TRUTH.median_storey_height_m,
      0.01,
      "hauteur d'étage après correction"
    );
  });

  test("l'absence de cote est signalée explicitement", () => {
    const result = validateBuildingScene(villaScaleX2(), villaScaleX2ContextNoChecks());
    const codes = result.issues.map((i) => i.code);
    assertIncludes(codes, "scale_checks_missing", "défaut signalé");
  });

  test("une scène non calibrée est moins confiante qu'une scène calibrée", () => {
    // Même géométrie, même contexte, seule change la présence de cotes
    // vérifiables : la confiance DOIT en tenir compte.
    const withChecks = validateBuildingScene(villaClean(), villaCleanContext());
    const withoutChecks = validateBuildingScene(villaClean(), {
      ...villaCleanContext(),
      declaredDimensionChecks: [],
    });

    assert(
      withoutChecks.confidence < withChecks.confidence,
      `sans cote ${withoutChecks.confidence} devrait être < avec cotes ${withChecks.confidence}`
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Validator — scan dégradé (NF1)
// ═══════════════════════════════════════════════════════════════════════════

export function runDegradedSceneTests(): void {
  suite("validator / scan dégradé");

  const result = validateBuildingScene(degradedScan(), degradedScanContext());

  test("la scène est REFUSÉE avec un motif actionnable", () => {
    assertEqual(result.rejected, DEGRADED_GROUND_TRUTH.expected_rejected, "verdict");
    assert(!!result.refusal_reason, "motif de refus présent");
    assert(
      (result.refusal_reason ?? "").includes("Que faire"),
      "le motif doit dire quoi faire, pas seulement ce qui ne va pas"
    );
  });

  test("l'emprise absurde déclenche un contrôle rouge", () => {
    const check = checkByCode(result.quality_checks, "footprint_vs_scale");
    assert(!!check, "contrôle présent");
    assertEqual(check!.status, "fail", "statut du contrôle");
  });

  test("le mur dégénéré, l'id dupliqué, l'ouverture orpheline et le polygone à 2 points sont rejetés", () => {
    const codes = result.issues.filter((i) => i.severity === "error").map((i) => i.code);
    assertIncludes(codes, "wall_degenerate", "mur dégénéré");
    assertIncludes(codes, "duplicate_element_id", "identifiant dupliqué");
    assertIncludes(codes, "opening_host_unresolved", "ouverture orpheline");
    assertIncludes(codes, "element_shape_invalid", "polygone à 2 points");
  });

  test("seuls les éléments viables survivent", () => {
    assertEqual(
      result.stats.elements_kept,
      DEGRADED_GROUND_TRUTH.expected_elements_kept,
      "éléments conservés"
    );
    assert(result.stats.elements_rejected >= 4, "au moins quatre rejets");
  });

  test("l'épaisseur hors bornes plafonne la confiance de l'élément", () => {
    const thick = result.scene.levels[0].elements.find((e) => e.id === "w_thick");
    assert(!!thick, "l'élément est conservé");
    assert(
      thick!.provenance.confidence <= DEGRADED_CONFIDENCE,
      `confiance ${thick!.provenance.confidence} attendue ≤ ${DEGRADED_CONFIDENCE}`
    );
    assertIncludes(
      result.issues.map((i) => i.code),
      "thickness_out_of_bounds",
      "défaut d'épaisseur signalé"
    );
  });

  test("la position hors [0,1] est ramenée dans l'intervalle", () => {
    const opening = result.scene.levels[0].elements.find((e) => e.id === "op_overshoot");
    assert(!!opening, "l'ouverture est conservée");
    assert(opening!.type === "opening", "c'est bien une ouverture");
    if (opening!.type === "opening") {
      assertClose(opening!.position_along, 1, 1e-9, "position ramenée à 1");
    }
    assertIncludes(
      result.issues.map((i) => i.code),
      "position_along_clamped",
      "recalage signalé"
    );
  });

  test("le contexte dégradé de la Passe 1 est consigné", () => {
    const codes = result.issues.map((i) => i.code);
    assertIncludes(codes, "scale_not_reliable", "échelle non fiable");
    assertIncludes(codes, "low_image_quality", "qualité d'image basse");
    assertIncludes(codes, "unreadable_zones", "zones illisibles");
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Confiance — courbe simple
// ═══════════════════════════════════════════════════════════════════════════

export function runConfidenceCurveTests(): void {
  suite("confiance");

  test("la confiance décroît avec la dégradation du contexte d'extraction", () => {
    const base = villaCleanContext();

    const good = validateBuildingScene(villaClean(), base).confidence;
    const medium = validateBuildingScene(villaClean(), {
      ...base,
      imageQuality: "moyenne",
    }).confidence;
    const poor = validateBuildingScene(villaClean(), {
      ...base,
      imageQuality: "basse",
      scaleReliable: false,
    }).confidence;

    assert(good > medium, `haute (${good}) doit dépasser moyenne (${medium})`);
    assert(medium > poor, `moyenne (${medium}) doit dépasser basse (${poor})`);
  });

  test("la confiance reste bornée dans [0,1]", () => {
    for (const ctx of [villaCleanContext(), degradedScanContext()]) {
      const scene = ctx.scaleReliable ? villaClean() : degradedScan();
      const { confidence } = validateBuildingScene(scene, ctx);
      assert(confidence >= 0 && confidence <= 1, `confiance ${confidence} hors bornes`);
    }
  });

  test("une scène refusée l'est sur un motif nommé, jamais par accident", () => {
    const result = validateBuildingScene(degradedScan(), degradedScanContext());
    assert(
      GLOBAL_CHECKS.footprintSpan_m.min > DEGRADED_GROUND_TRUTH.footprint_span_m,
      "la vérité terrain doit bien être sous le seuil d'emprise"
    );
    assert((result.refusal_reason ?? "").length > 40, "le motif est détaillé");
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Réparation de troncature (B-d)
// ═══════════════════════════════════════════════════════════════════════════

export function runTruncationTests(): void {
  suite("réparation de troncature");

  test("un JSON coupé au milieu d'un élément est réparé sur le dernier objet complet", () => {
    const truncated =
      '{"levels":[{"id":"L","elements":[{"id":"w1","type":"wall"},{"id":"w2","type":"wa';
    const repaired = repairTruncatedJson(truncated);
    assert(repaired !== null, "réparation possible");

    const parsed = JSON.parse(repaired!) as { levels: Array<{ elements: unknown[] }> };
    assertEqual(parsed.levels[0].elements.length, 1, "seul l'élément complet est conservé");
  });

  test("une accolade à l'intérieur d'une chaîne n'est pas comptée comme fermeture", () => {
    const truncated = '{"levels":[{"id":"L","name":"Niveau } piégeux","elements":[]},{"id":"L2"';
    const repaired = repairTruncatedJson(truncated);
    assert(repaired !== null, "réparation possible");

    const parsed = JSON.parse(repaired!) as { levels: Array<{ id: string; name?: string }> };
    assertEqual(parsed.levels.length, 1, "un seul niveau complet");
    assertEqual(parsed.levels[0].name, "Niveau } piégeux", "la chaîne est intacte");
  });

  test("un JSON complet est renvoyé inchangé", () => {
    const complete = '{"levels":[]}';
    assertEqual(repairTruncatedJson(complete), complete, "aucune modification");
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Consensus — accumulation des totaux CFC (bug B-b)
// ═══════════════════════════════════════════════════════════════════════════

export function runConsensusTests(): void {
  suite("consensus / totaux par CFC");

  function poste(cfc: string, quantite: number, unite: string): PosteConsensus {
    return {
      cfc_code: cfc,
      description: `poste ${cfc}`,
      unite,
      quantite_consensuelle: quantite,
      valeurs_par_modele: [],
      ecart_relatif: 0,
      confiance_consensus: "high",
      methode_consensus: "concordance_forte",
      note: null,
    } as unknown as PosteConsensus;
  }

  test("les quantités d'un même CFC et d'une même unité s'ADDITIONNENT", () => {
    // Le bug : la clé de lecture était `prefix`, la clé d'écriture
    // `prefix::unite`. `get()` ne trouvait jamais rien, donc chaque poste
    // écrasait le précédent. Ici, 30 + 45 + 25 = 100, pas 25.
    const fused = buildFusedMetrage(
      [poste("211.1", 30, "m2"), poste("211.4", 45, "m2"), poste("211.7", 25, "m2")],
      []
    );

    const total = fused.totaux_par_cfc.find((t) => t.cfc_code === "211" && t.unite === "m2");
    assert(!!total, "le total 211/m2 existe");
    assertClose(total!.quantite_totale, 100, 0.001, "quantité cumulée");
    assertEqual(total!.nb_zones, 3, "nombre de postes agrégés");
  });

  test("deux unités différentes sur un même CFC restent séparées", () => {
    const fused = buildFusedMetrage(
      [poste("211.1", 30, "m2"), poste("211.4", 12, "m3")],
      []
    );

    assertEqual(fused.totaux_par_cfc.length, 2, "deux totaux distincts");
    const m2 = fused.totaux_par_cfc.find((t) => t.unite === "m2");
    const m3 = fused.totaux_par_cfc.find((t) => t.unite === "m3");
    assertClose(m2!.quantite_totale, 30, 0.001, "total m2");
    assertClose(m3!.quantite_totale, 12, 0.001, "total m3");
  });

  test("des CFC de préfixes différents ne se mélangent pas", () => {
    const fused = buildFusedMetrage(
      [poste("211.1", 30, "m2"), poste("221.1", 40, "m2")],
      []
    );
    assertEqual(fused.totaux_par_cfc.length, 2, "deux préfixes distincts");
  });
}
