/**
 * Tests checkRejectRules (audit 08/2026) : les règles reject
 * (project_id NULL, classification 'personal') sont enfin LUES et agissent
 * comme signal négatif fort.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { checkRejectRules } from "../classification-learning";

interface FakeRule {
  times_confirmed: number;
  times_overridden: number;
}

/**
 * Stub supabase : rend `rulesByType[rule_type]` quand la chaîne filtre sur ce
 * rule_type. Reproduit la chaîne .select().eq()...  .is().order().limit()
 * terminée par un await (thenable).
 */
function makeFakeSupabase(rulesByType: Record<string, FakeRule[]>) {
  function makeBuilder() {
    let ruleType: string | null = null;
    const builder: Record<string, unknown> = {};
    builder["select"] = () => builder;
    builder["eq"] = (col: string, value: unknown) => {
      if (col === "rule_type") ruleType = String(value);
      return builder;
    };
    builder["is"] = () => builder;
    builder["order"] = () => builder;
    builder["limit"] = () => builder;
    builder["then"] = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: ruleType ? (rulesByType[ruleType] ?? []) : [],
        error: null,
      }).then(resolve);
    return builder;
  }
  return { from: () => makeBuilder() } as never;
}

test("expéditeur rejeté 3× sans contre-ordre → signal négatif", async () => {
  const supabase = makeFakeSupabase({
    sender_email: [{ times_confirmed: 3, times_overridden: 0 }],
  });
  const match = await checkRejectRules(supabase, "org-1", "Spam@Fournisseur.ch");
  assert.ok(match);
  assert.equal(match!.ruleType, "sender_email");
  assert.equal(match!.timesConfirmed, 3);
  assert.equal(match!.confidence, 1);
});

test("un rejet ISOLÉ ne fait pas une règle (times_confirmed < 2)", async () => {
  const supabase = makeFakeSupabase({
    sender_email: [{ times_confirmed: 1, times_overridden: 0 }],
  });
  const match = await checkRejectRules(supabase, "org-1", "spam@fournisseur.ch");
  assert.equal(match, null);
});

test("règle contredite (fiabilité < 0.7) → ignorée", async () => {
  const supabase = makeFakeSupabase({
    sender_email: [{ times_confirmed: 3, times_overridden: 3 }], // fiabilité 0.5
  });
  const match = await checkRejectRules(supabase, "org-1", "mixte@fournisseur.ch");
  assert.equal(match, null);
});

test("fallback domaine : le rejet du domaine s'applique aussi", async () => {
  const supabase = makeFakeSupabase({
    sender_domain: [{ times_confirmed: 4, times_overridden: 1 }], // fiabilité 0.8
  });
  const match = await checkRejectRules(supabase, "org-1", "nimporte-qui@pub-batiment.ch");
  assert.ok(match);
  assert.equal(match!.ruleType, "sender_domain");
});

test("aucune règle → null", async () => {
  const supabase = makeFakeSupabase({});
  assert.equal(await checkRejectRules(supabase, "org-1", "clean@client.ch"), null);
});
