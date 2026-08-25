/**
 * Tests spam-detector — vocabulaire suisse légitime (audit 08/2026).
 *
 * Exécution : compilés en CommonJS puis `node --test` (voir le rapport de
 * l'agent K). Pas de framework requis — node:test est intégré à Node ≥ 20.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { detectSpamNewsletter } from "../spam-detector";

// Expéditeur neutre : ne matche aucun pattern d'expéditeur spam/newsletter.
const CHANTIER_SENDER = "bauleitung@hrs-baumeister.ch";

test("'Mitteilung der Bauleitung' n'est PAS une newsletter", () => {
  const res = detectSpamNewsletter({
    from_email: CHANTIER_SENDER,
    subject: "Mitteilung der Bauleitung — Baustelle Musterstrasse 12",
  });
  assert.equal(res.detected, false);
});

test("'Benachrichtigung' (notification légitime) n'est PAS une newsletter", () => {
  const res = detectSpamNewsletter({
    from_email: CHANTIER_SENDER,
    subject: "Benachrichtigung: neue Planlieferung EG",
  });
  assert.equal(res.detected, false);
});

test("'Rundschreiben' (circulaire professionnelle) n'est PAS une newsletter", () => {
  const res = detectSpamNewsletter({
    from_email: CHANTIER_SENDER,
    subject: "Rundschreiben SIA 118 — Änderungen 2026",
  });
  assert.equal(res.detected, false);
});

test("'solde de facture' (singulier comptable) n'est PAS une newsletter", () => {
  const res = detectSpamNewsletter({
    from_email: "comptabilite@entreprise-durand.ch",
    subject: "Solde de facture — chantier Les Cèdres",
  });
  assert.equal(res.detected, false);
});

test("'soldes de factures' (pluriel comptable) n'est PAS une newsletter", () => {
  const res = detectSpamNewsletter({
    from_email: "comptabilite@entreprise-durand.ch",
    subject: "Soldes de factures ouvertes au 31.08",
  });
  assert.equal(res.detected, false);
});

test("'Soldes d'été -50%' (promo) EST une newsletter", () => {
  const res = detectSpamNewsletter({
    from_email: CHANTIER_SENDER,
    subject: "Soldes d'été jusqu'à -50% sur tout l'outillage",
  });
  assert.equal(res.detected, true);
  assert.equal(res.type, "newsletter");
});

test("les signaux newsletter restants fonctionnent toujours", () => {
  const res = detectSpamNewsletter({
    from_email: "newsletter@shop-outillage.com",
    subject: "Nos offres de la semaine",
  });
  assert.equal(res.detected, true);
  assert.equal(res.type, "newsletter");

  const res2 = detectSpamNewsletter({
    from_email: CHANTIER_SENDER,
    subject: "Newsletter hebdomadaire du secteur",
  });
  assert.equal(res2.detected, true);
});

test("lien de désinscription dans le corps → newsletter", () => {
  const res = detectSpamNewsletter({
    from_email: CHANTIER_SENDER,
    subject: "Info produit",
    body_preview: "... cliquez ici pour vous désinscrire: unsubscribe ...",
  });
  assert.equal(res.detected, true);
  assert.equal(res.type, "newsletter");
});
