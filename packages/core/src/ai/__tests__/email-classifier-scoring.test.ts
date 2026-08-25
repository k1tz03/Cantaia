/**
 * Tests du scorer local de classification email (audit 08/2026) :
 *  - extractFirstSegment coupe désormais le tiret ASCII " - "
 *  - scores BORNÉS (un CC de 12 personnes ne rapporte plus +96)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyEmailByKeywords,
  extractFirstSegment,
  type ProjectForClassification,
} from "../email-classifier";

function project(overrides: Partial<ProjectForClassification>): ProjectForClassification {
  return {
    id: "p1",
    name: "Les Cèdres",
    code: null,
    email_keywords: [],
    email_senders: [],
    ...overrides,
  };
}

// ── extractFirstSegment ─────────────────────────────────────────────────────

test("tiret ASCII entouré d'espaces coupe le premier segment", () => {
  assert.equal(extractFirstSegment("CENTRAL MALLEY - Planche de détail"), "central malley");
});

test("tiret cadratin et deux-points fonctionnent toujours", () => {
  assert.equal(extractFirstSegment("TR: CENTRAL MALLEY – Planche de détail"), "central malley");
  assert.equal(extractFirstSegment("RE: RTS : Menetrey-BasSmets – Rapport"), "rts");
});

test("un nom composé avec tiret collé n'est PAS coupé", () => {
  assert.equal(extractFirstSegment("Menetrey-BasSmets – Rapport"), "menetrey-bassmets");
});

// ── Bornage des scores ──────────────────────────────────────────────────────

test("un CC de 12 destinataires ne fabrique plus un match (ancien +96)", () => {
  // Email clairement adressé à un AUTRE projet ("Tour Horizon"), mais avec 12
  // destinataires dont l'adresse contient "cedres".
  // AVANT le bornage : RULE 9 rapportait 12×8 = +96, la pénalité de premier
  // segment (-15) était noyée → faux positif classé sur "Les Cèdres".
  // APRÈS : RULE 9 = +8 UNE fois, la pénalité l'emporte → null.
  const recipients = Array.from({ length: 12 }, (_, i) => `cedres${i}@edifea.ch`);
  const result = classifyEmailByKeywords(
    {
      subject: "TOUR HORIZON - commande de fournitures",
      sender_email: "vendeur@inconnu.ch",
      recipients,
    },
    [project({ name: "Les Cèdres" })]
  );
  assert.equal(result, null);
});

test("contrôle positif : un vrai sujet projet matche toujours", () => {
  const result = classifyEmailByKeywords(
    {
      subject: "Les Cèdres – PV de chantier no 12",
      sender_email: "architecte@bureau.ch",
    },
    [project({ name: "Les Cèdres" })]
  );
  assert.ok(result);
  assert.equal(result!.projectId, "p1");
  assert.ok(result!.confidence >= 0.6);
});

test("les mots-clés seuls (plafonnés à +8) ne suffisent plus sans match nom/ref", () => {
  const result = classifyEmailByKeywords(
    {
      subject: "beton arme coffrage armature dalle chape",
      sender_email: "spam@inconnu.ch",
    },
    [
      project({
        name: "Tour Horizon",
        email_keywords: ["beton", "coffrage", "armature", "dalle", "chape"],
      }),
    ]
  );
  // 5 mots-clés sujet plafonnés à 8 points, pas de hasNameOrRefMatch → null
  assert.equal(result, null);
});

test("le tiret ASCII déclenche désormais la pénalité de premier segment", () => {
  // Sujet clairement adressé à un AUTRE projet, séparé par " - ".
  // AVANT le fix : " - " ne coupait pas → premier segment = sujet entier
  // (>30 chars) → ni bonus ni pénalité → score 4 (mot "cedres") + 7
  // (expéditeur connu) = 11 ≥ 8 → FAUX POSITIF classé sur "Les Cèdres".
  // APRÈS : premier segment = "tour horizon" ≠ ce projet → -15 → null.
  const withHyphen = classifyEmailByKeywords(
    {
      subject: "TOUR HORIZON - transmission plans cedres toiture provisoire",
      sender_email: "architecte@bureau.ch",
    },
    [project({ name: "Les Cèdres", email_senders: ["architecte@bureau.ch"] })]
  );
  assert.equal(withHyphen, null);
});
