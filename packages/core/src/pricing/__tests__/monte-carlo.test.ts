/**
 * Tests Monte Carlo corrélé (audit 08/2026) :
 *  - la corrélation inter-postes ÉLARGIT la queue (P95 corrélé > P95 indépendant)
 *  - seed déterministe = résultats reproductibles
 *  - contrat de sortie identique à celui consommé par MonteCarloChart.tsx
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { runCorrelatedMonteCarlo, type MonteCarloItem } from "../monte-carlo";

function makeItems(n: number): MonteCarloItem[] {
  const items: MonteCarloItem[] = [];
  for (let i = 0; i < n; i++) {
    items.push({
      description: `Poste ${i + 1}`,
      prix_median: 100 + i * 10,
      prix_min: 80 + i * 10,
      prix_max: 140 + i * 10,
      quantity: 50,
      source: "referentiel_crb",
    });
  }
  return items;
}

test("P95 corrélé (ρ=0.4) > P95 indépendant (ρ=0) — même seed", () => {
  const items = makeItems(10);
  const iterations = 6000;

  const independent = runCorrelatedMonteCarlo(items, { iterations, correlation: 0, seed: 42 });
  const correlated = runCorrelatedMonteCarlo(items, { iterations, correlation: 0.4, seed: 42 });

  // Sous indépendance les écarts se compensent ; le facteur commun élargit la
  // distribution → P95 et l'écart-type augmentent nettement.
  assert.ok(
    correlated.p95 > independent.p95,
    `P95 corrélé (${Math.round(correlated.p95)}) devrait dépasser P95 indépendant (${Math.round(independent.p95)})`
  );
  assert.ok(correlated.stdDev > independent.stdDev * 1.3);

  // La corrélation élargit la dispersion mais ne déplace pas le centre :
  // les moyennes restent proches (±2 %).
  const meanRatio = correlated.mean / independent.mean;
  assert.ok(meanRatio > 0.98 && meanRatio < 1.02);

  // P80 aussi (le chiffre "prudent" vendu à l'utilisateur)
  assert.ok(correlated.p80 > independent.p80);
});

test("seed déterministe → résultats strictement reproductibles", () => {
  const items = makeItems(6);
  const a = runCorrelatedMonteCarlo(items, { iterations: 2000, seed: 7 });
  const b = runCorrelatedMonteCarlo(items, { iterations: 2000, seed: 7 });

  assert.equal(a.p50, b.p50);
  assert.equal(a.p95, b.p95);
  assert.equal(a.mean, b.mean);
  assert.equal(a.stdDev, b.stdDev);

  const c = runCorrelatedMonteCarlo(items, { iterations: 2000, seed: 8 });
  assert.notEqual(a.p50, c.p50); // un autre seed donne un autre tirage
});

test("contrat de sortie : mêmes clés/formes que MonteCarloChart.tsx", () => {
  const r = runCorrelatedMonteCarlo(makeItems(4), { iterations: 1000, seed: 1 });

  assert.equal(r.histogram.length, 50);
  for (const bin of r.histogram.slice(0, 3)) {
    assert.equal(typeof bin.bin, "number");
    assert.equal(typeof bin.count, "number");
    assert.equal(typeof bin.label, "string");
  }
  assert.ok(r.p10 <= r.p50 && r.p50 <= r.p80 && r.p80 <= r.p95);
  assert.ok(r.topContributors.length <= 3);
  for (const c of r.topContributors) {
    assert.equal(typeof c.description, "string");
    assert.equal(typeof c.source, "string");
    assert.equal(typeof c.varianceContribution, "number");
    assert.equal(typeof c.percentOfTotal, "number");
  }
});

test("aucun poste valide → résultat vide sans crash", () => {
  const r = runCorrelatedMonteCarlo([
    { description: "x", prix_median: 0, prix_min: 0, prix_max: 0, quantity: null, source: "non_estime" },
  ]);
  assert.equal(r.histogram.length, 0);
  assert.equal(r.p95, 0);
});
