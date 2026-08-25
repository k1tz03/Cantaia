/**
 * Tests du writer unique model_error_profiles (audit 08/2026) :
 * médiane SIGNÉE, unités en POURCENTS, nb_corrections = taille d'échantillon.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  computeProviderErrorProfile,
  updateModelErrorProfilesForOrg,
} from "../model-error-profiles";

test("médiane signée en POURCENTS (surestimation)", () => {
  const p = computeProviderErrorProfile([
    { value: 120, corrected: 100 }, // +20 %
    { value: 110, corrected: 100 }, // +10 %
    { value: 130, corrected: 100 }, // +30 %
  ]);
  assert.ok(p);
  assert.equal(p!.nb_corrections, 3);
  // médiane = 20 (POURCENTS, pas 0.20 en fraction — le bug d'unité historique)
  assert.equal(p!.ecart_median_pct, 20);
  assert.equal(p!.ecart_moyen_pct, 20);
  assert.equal(p!.tendance, "surestime");
  // coefficient = 1 / 1.2
  assert.ok(Math.abs(p!.coefficient_correction - 0.833) < 0.001);
});

test("médiane signée NÉGATIVE (sous-estimation) — le signe est conservé", () => {
  const p = computeProviderErrorProfile([
    { value: 80, corrected: 100 }, // -20 %
    { value: 90, corrected: 100 }, // -10 %
    { value: 70, corrected: 100 }, // -30 %
  ]);
  assert.ok(p);
  assert.equal(p!.ecart_median_pct, -20);
  assert.equal(p!.tendance, "sous_estime");
  // coefficient = 1 / 0.8 = 1.25
  assert.ok(Math.abs(p!.coefficient_correction - 1.25) < 0.001);
});

test("échantillon mixte : la médiane résiste aux outliers", () => {
  const p = computeProviderErrorProfile([
    { value: 102, corrected: 100 }, // +2 %
    { value: 98, corrected: 100 },  // -2 %
    { value: 500, corrected: 100 }, // +400 % (outlier)
  ]);
  assert.ok(p);
  assert.equal(p!.ecart_median_pct, 2); // la médiane ignore l'outlier
  assert.equal(p!.tendance, "neutre");
});

test("corrected=0 ou valeurs non finies → échantillons écartés", () => {
  assert.equal(computeProviderErrorProfile([{ value: 10, corrected: 0 }]), null);
  const p = computeProviderErrorProfile([
    { value: 10, corrected: 0 },
    { value: NaN, corrected: 100 },
    { value: 110, corrected: 100 },
  ]);
  assert.ok(p);
  assert.equal(p!.nb_corrections, 1);
  assert.equal(p!.ecart_median_pct, 10);
});

// ── Writer complet avec un stub supabase ────────────────────────────────────

interface CapturedWrite {
  table: string;
  payload: Record<string, unknown>;
}

function makeFakeSupabase(qcRows: unknown[]) {
  const writes: CapturedWrite[] = [];

  function makeBuilder(table: string) {
    const builder: Record<string, unknown> = {};
    const chain = ["select", "eq", "is", "like", "gte", "order", "limit"];
    for (const m of chain) {
      builder[m] = () => builder;
    }
    builder["maybeSingle"] = async () => ({ data: null, error: null });
    // thenable : `await query` sur la chaîne quantity_corrections
    builder["then"] = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(
        table === "quantity_corrections"
          ? { data: qcRows, error: null }
          : { data: [], error: null }
      ).then(resolve);
    builder["insert"] = (payload: Record<string, unknown>) => {
      writes.push({ table, payload });
      return Promise.resolve({ error: null });
    };
    builder["update"] = (payload: Record<string, unknown>) => {
      const upd: Record<string, unknown> = {
        eq: () => Promise.resolve({ error: null }),
      };
      writes.push({ table: `${table}:update`, payload });
      return upd;
    };
    return builder;
  }

  return {
    client: { from: (table: string) => makeBuilder(table) },
    writes,
  };
}

test("updateModelErrorProfilesForOrg écrit un profil org-scopé, médiane en %", async () => {
  const { client, writes } = makeFakeSupabase([
    { valeurs_par_modele: { claude: 120, gpt4o: 90 }, quantite_corrigee: 100 },
    { valeurs_par_modele: { claude: 110, gpt4o: 95 }, quantite_corrigee: 100 },
    { valeurs_par_modele: { claude: 130, gpt4o: 85 }, quantite_corrigee: 100 },
  ]);

  await updateModelErrorProfilesForOrg(client, {
    orgId: "org-1",
    discipline: "beton",
    cfcPrefix: "211",
  });

  const profileWrites = writes.filter((w) => w.table === "model_error_profiles");
  assert.equal(profileWrites.length, 2); // claude + gpt4o (pas gemini : aucune valeur)

  const claude = profileWrites.find((w) => w.payload["provider"] === "claude");
  assert.ok(claude);
  assert.equal(claude!.payload["org_id"], "org-1");
  assert.equal(claude!.payload["type_element_cfc"], "211");
  assert.equal(claude!.payload["nb_corrections"], 3);
  // médiane SIGNÉE en POURCENTS : +20, jamais 0.20
  assert.equal(claude!.payload["ecart_median_pct"], 20);
  assert.equal(claude!.payload["tendance"], "surestime");

  const gpt4o = profileWrites.find((w) => w.payload["provider"] === "gpt4o");
  assert.ok(gpt4o);
  assert.equal(gpt4o!.payload["ecart_median_pct"], -10);
  assert.equal(gpt4o!.payload["tendance"], "sous_estime");
});
