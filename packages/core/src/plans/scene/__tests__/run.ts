/**
 * run.ts — point d'entrée de la suite de tests Scene3D.
 *
 * ── Comment l'exécuter ────────────────────────────────────────────────────
 *
 * Le dépôt n'a pas de lanceur de tests. On compile puis on exécute, depuis la
 * racine du monorepo (commande vérifiée, code de sortie 0 quand tout passe) :
 *
 *   node_modules/.bin/tsc -p packages/core/tsconfig.json \
 *     --outDir .test-build --module commonjs --moduleResolution node10 \
 *     --incremental false --declaration false --declarationMap false \
 *     --noEmit false
 *   node .test-build/plans/scene/__tests__/run.js
 *
 * Les surcharges ne sont pas décoratives : le tsconfig du paquet vise
 * `bundler`/ESM (Next), incompatible avec un `require` direct sous Node, et
 * `--incremental false` évite que tsc considère un `outDir` fraîchement
 * supprimé comme déjà à jour et n'émette rien.
 *
 * Sortie : une ligne par test, un récapitulatif, et un code de sortie non nul
 * au moindre échec (utilisable tel quel en CI).
 *
 * ── Ce que couvre la suite ────────────────────────────────────────────────
 *
 *   - Géométrie : lacet (dont le cas de la dalle en L, celui qui faisait
 *     surestimer les surfaces), normalisation de polygone, enveloppe convexe,
 *     lecture d'échelle.
 *   - Snap topologique : fusion des sommets < 10 cm, redressement à ±2°.
 *   - Validator sur trois scènes étalon : villa propre (acceptée), villa à
 *     l'échelle ×2 (recalée par les cotes PUIS par la vraisemblance), scan
 *     dégradé (refusé — NF1).
 *   - Courbe de confiance : monotonie face à la dégradation du contexte.
 *   - Réparation de troncature du JSON du modèle.
 *   - Accumulation des totaux par CFC du moteur de consensus (bug partagé
 *     avec la production : l'ancrage quantitatif des Passes 4 et 5).
 */

import { report } from "./harness";
import {
  runCleanSceneTests,
  runConfidenceCurveTests,
  runConsensusTests,
  runDegradedSceneTests,
  runGeometryTests,
  runScaleCalibrationTests,
  runSnapTests,
  runTruncationTests,
} from "./scene-validation.test";

export function runAllSceneTests(): number {
  console.log("Scene3D — suite de validation déterministe\n");

  runGeometryTests();
  runSnapTests();
  runCleanSceneTests();
  runScaleCalibrationTests();
  runDegradedSceneTests();
  runConfidenceCurveTests();
  runTruncationTests();
  runConsensusTests();

  return report();
}

// Exécution directe (`node run.js`). L'export reste utilisable par un futur
// lanceur de tests sans dupliquer l'orchestration.
if (typeof require !== "undefined" && require.main === module) {
  const failures = runAllSceneTests();
  process.exit(failures > 0 ? 1 : 0);
}
