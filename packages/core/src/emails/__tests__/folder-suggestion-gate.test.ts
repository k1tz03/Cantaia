/**
 * Tests du gate de suggestion de dossier (audit 08/2026) :
 * sous un score normalisé de 0.6, PAS de suggestion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  gateFolderSuggestion,
  FOLDER_SUGGESTION_MIN_CONFIDENCE,
  type FolderSuggestionCandidate,
} from "../folder-suggestion";

function senderRule(score: number, folderId = "f1"): FolderSuggestionCandidate {
  return {
    folder_id: folderId,
    folder_name: `Dossier ${folderId}`,
    score,
    tier_max: 100,
    decision_source: "sender_email",
    reason: "test",
  };
}

test("le seuil est bien 0.6", () => {
  assert.equal(FOLDER_SUGGESTION_MIN_CONFIDENCE, 0.6);
});

test("règle à 25% de fiabilité → AUCUNE suggestion (l'ancien bug du bouton)", () => {
  // score = 100 × 0.25 = 25 → normalisé 0.25 < 0.6
  assert.equal(gateFolderSuggestion([senderRule(25)]), null);
});

test("règle à 59% → toujours rien (juste sous le seuil)", () => {
  assert.equal(gateFolderSuggestion([senderRule(59)]), null);
});

test("règle sender_email pleinement fiable → suggestion (normalisation par tier)", () => {
  // Avec l'ancienne normalisation /200, ce cas donnait 0.5 et aurait été
  // bloqué par le seuil — la normalisation par tier le laisse passer.
  const s = gateFolderSuggestion([senderRule(100)]);
  assert.ok(s);
  assert.equal(s!.folder_id, "f1");
  assert.ok(s!.confidence >= 0.6);
});

test("match projet (200/200) → suggestion à confiance max", () => {
  const s = gateFolderSuggestion([
    {
      folder_id: "fp",
      folder_name: "Central Malley",
      score: 200,
      tier_max: 200,
      decision_source: "project_match",
      reason: "Projet",
    },
  ]);
  assert.ok(s);
  assert.equal(s!.decision_source, "project_match");
  assert.equal(s!.confidence, 0.99);
});

test("dédoublonnage par dossier : garde le meilleur score normalisé", () => {
  const s = gateFolderSuggestion([
    senderRule(30, "f1"), // 0.30
    {
      folder_id: "f1",
      folder_name: "Dossier f1",
      score: 49,
      tier_max: 70, // 0.70 — sender_domain
      decision_source: "sender_domain",
      reason: "domaine",
    },
  ]);
  assert.ok(s);
  assert.equal(s!.decision_source, "sender_domain");
  assert.ok(Math.abs(s!.confidence - 0.7) < 0.01);
});

test("liste vide → null", () => {
  assert.equal(gateFolderSuggestion([]), null);
});

test("boost au-delà du plafond du tier → confiance bornée à 0.99", () => {
  const s = gateFolderSuggestion([senderRule(150)]); // boost projet ×1.5
  assert.ok(s);
  assert.equal(s!.confidence, 0.99);
});
