# Plan Commercial Cantaia — Stratégie de Prix & Go-to-Market

> **Statut** : Référence pour la phase de commercialisation (semaine du 2026-03-29)
> **Données** : Issues de recherches marché + benchmarks SaaS 2025-2026

---

## 1. Résumé Exécutif

Cantaia est **le seul outil de gestion de chantier AI-native positionné sur le marché suisse romand**. Les concurrents sont soit trop chers (Procore, minimum $4,500/an), soit trop basiques (Fieldwire, pas d'IA intégrée), soit anciens et non-cloud (SORBA).

**La principale décision commerciale :** les prix actuels (149/349/790 CHF/mois) sont **défendables mais sous-optimisés**. L'analyse ROI montre une valeur de CHF 33,000/an économisée par chef de projet — ce qui justifie une grille plus haute.

**Recommandation** : ajuster légèrement vers le haut, pousser l'abonnement annuel, et créer un plan intermédiaire pour mieux capturer le segment mid-market.

---

## 2. Analyse de la Valeur Créée

### Ce que coûte un chef de projet en Suisse

| Profil | Salaire brut/an | Coût chargé/heure |
|--------|----------------|-------------------|
| Junior (1–3 ans) | CHF 83,000 | CHF 62/h |
| Confirmé (5–8 ans) | CHF 120,000–126,000 | CHF 90/h |
| Senior (8+ ans) | CHF 149,000 | CHF 112/h |
| Zurich (moyenne) | CHF 238,000 | CHF 180/h |

*Source : SalaryExpert.com Switzerland, 2025*

### Ce que Cantaia économise (estimation conservative)

| Tâche automatisée | Temps économisé/jour | Coût évité/an (@ CHF 100/h) |
|------------------|--------------------|--------------------------|
| Tri + classification emails | 45 min | CHF 16,250 |
| Rédaction PV de chantier | 30 min | CHF 10,833 |
| Briefing quotidien | 15 min | CHF 5,417 |
| Soumissions & comparaison prix | 20 min | CHF 7,222 |
| Recherche prix fournisseurs | 10 min | CHF 3,611 |
| **Total économisé/an/PM** | **~2h/jour** | **~CHF 43,000/an** |

*Estimation conservatrice : 1.5–2h/jour économisées par chef de projet*

### ROI pour le client

| Plan | Coût annuel | Valeur créée/PM/an | ROI |
|------|------------|---------------------|-----|
| Starter (149 CHF/mois) | CHF 1,788/an | CHF 33,000–43,000 | **18x–24x** |
| Pro (349 CHF/mois) | CHF 4,188/an | CHF 33,000–43,000 | **8x–10x** |
| Enterprise (790 CHF/mois) | CHF 9,480/an | CHF 33,000–43,000 × N | **>3x** |

> **Conclusion :** Cantaia est massivement sous-tarifé par rapport à la valeur créée.
> Un produit qui génère 8–24x ROI peut se vendre plus cher sans perdre de clients.

---

## 3. Structure de Coûts (ce que coûte un client)

### Coûts fixes mensuels (indépendants du nombre de clients)

| Service | Plan | Coût/mois (CHF) |
|---------|------|----------------|
| Vercel Pro | $20–40/mois | CHF 18–36 |
| Supabase Pro | $25/mois | CHF 23 |
| Sentry | $26/mois | CHF 24 |
| Resend | $20/mois | CHF 18 |
| Domaines + DNS | — | CHF 5 |
| **Total fixe** | | **~CHF 88–106/mois** |

### Coûts variables par organisation

| Usage | Modèle | Coût estimé/org/mois |
|-------|--------|---------------------|
| Claude Sonnet (emails, PV, briefings) | $3/$15 par M tokens | CHF 2–8 |
| Claude Haiku (classification, alertes) | $1/$5 par M tokens | CHF 0.50–2 |
| Whisper (transcription audio) | $0.006/min | CHF 1–4 |
| Supabase storage (plans, audio, PJ) | $0.021/GB/mois | CHF 0.50–3 |
| **Total variable/org** | | **CHF 4–17/mois** |

### Marge brute par plan

| Plan | Prix | COGS variable | Marge brute |
|------|------|---------------|-------------|
| Starter (149 CHF) | CHF 149 | CHF 8–15 | **89–94%** |
| Pro (349 CHF) | CHF 349 | CHF 12–25 | **93–96%** |
| Enterprise (790 CHF) | CHF 790 | CHF 20–40 | **95–97%** |

*Les coûts fixes (~CHF 100/mois) sont amortis dès 1-2 clients.*

> **Conclusion :** Les marges brutes sont excellentes (90%+). C'est typique du SaaS à
> l'échelle. La vraie contrainte n'est pas le coût — c'est l'acquisition client.

---

## 4. Analyse Concurrentielle

### Benchmark Prix

| Concurrent | Modèle | Prix/mois | Cible | AI native ? | Suisse/FR ? |
|------------|--------|-----------|-------|-------------|------------|
| **Procore** | ACV annuel | $375–$1,500+ | Entreprises (50M+ CA) | ❌ | ❌ |
| **Fieldwire** | Per user | CHF 36–82/user | Terrain, superviseurs | Partielle | ❌ |
| **Graneet** | CA entreprise | €200–800 | PME BTP | ❌ | Partielle (FR) |
| **Buildertrend** | Flat rate | $199–$899 | Résidentiel US | ❌ | ❌ |
| **SORBA** | Licence | ~CHF 200–500 | PME suisses | ❌ | ✅ (vieillissant) |
| **Archdesk** | Per user | $49–$99/user | PME EU | ❌ | ❌ |
| **Cantaia** | Flat rate org | CHF 149–790 | Chefs de projet CH | ✅✅ | ✅✅ |

### Positionnement de Cantaia

```
Prix
 ↑
 │  Procore ●                    (cher, enterprise, US, pas d'IA Swiss)
 │
 │                   ● Archdesk  (mid, par siège, EU, pas d'IA)
 │         ● Fieldwire            (mid, terrain, partiel)
 │
 │   ● SORBA                     (legacy, suisse, installé)
 │      ● Graneet                (ERP FR, PME BTP)
 │
 │                 ★ CANTAIA     (AI-native, suisse, flat rate, complet)
 │
 └────────────────────────────── Valeur IA / Automatisation →
     Aucun         Partielle      Full AI-native
```

**Le positionnement de Cantaia est unique :** aucun concurrent ne combine
(1) AI-native full-stack, (2) marché suisse/francophone, (3) tarif SMB, (4) flat rate org.

### Forces compétitives uniques de Cantaia

1. **11 modules intégrés** (mail, soumissions, PV, prix, plans, planning, portail, etc.) — vs. outils mono-fonction
2. **IA omniprésente** : classification emails, génération PV, estimation plans, briefings
3. **Sync Microsoft Outlook en temps réel** — critique pour le marché suisse
4. **Flat rate par organisation** (pas par siège) — très apprécié par les PME de 5–20 personnes
5. **Desktop app native** (Tauri) — offline, notifications OS, dialog natif
6. **Données en Suisse/UE** — argument fort pour la conformité RGPD

---

## 5. Pricing Recommandé

### Grille actuelle vs grille recommandée

| Plan | Actuel | Recommandé mensuel | Recommandé annuel | Δ |
|------|--------|-------------------|------------------|---|
| **Trial** | 14j gratuit | **21j gratuit** | — | +7 jours |
| **Solo** | ❌ N'existe pas | **CHF 89/mois** | CHF 79/mois | Nouveau |
| **Starter** | CHF 149 | **CHF 149/mois** | CHF 124/mois | Inchangé |
| **Pro** | CHF 349 | **CHF 399/mois** | CHF 332/mois | +14% |
| **Business** | ❌ N'existe pas | **CHF 649/mois** | CHF 540/mois | Nouveau |
| **Enterprise** | CHF 790 | **CHF 990/mois** | CHF 825/mois | +25% |

### Détail des plans recommandés

#### 🆓 Trial — 21 jours gratuits
- Accès complet Pro pendant 21 jours
- Sans carte de crédit
- *Pourquoi 21 jours ?* 14 jours ne suffisent pas pour qu'un chef de projet charge ses projets, invite son équipe et voie la valeur. 21 jours = 3 semaines pleines de chantier.

---

#### 🟡 Solo — CHF 89/mois (NOUVEAU)
**Cible : consultants indépendants, petites entreprises 1-2 PMs**

| Paramètre | Valeur |
|-----------|--------|
| Utilisateurs | 1 |
| Projets actifs | 5 |
| Appels IA/mois | 200 |
| Stockage | 5 GB |
| Sync email | ✅ |
| PV & Visites | ✅ |
| Soumissions | ❌ |
| Plans & Estimation | ❌ |
| Support | Email (72h) |

*Pourquoi créer ce plan ?* Le prix de 149 CHF est un frein pour les consultants indépendants et les petites structures. Solo à 89 CHF capte ce segment et crée un pipeline naturel vers Starter.

---

#### 🔵 Starter — CHF 149/mois (CHF 124/mois annuel)
**Cible : bureaux d'architecture, PME 2–3 PMs**

| Paramètre | Valeur |
|-----------|--------|
| Utilisateurs | 5 |
| Projets actifs | 15 |
| Appels IA/mois | 500 |
| Stockage | 15 GB |
| Tous les modules | ✅ sauf Budget/Direction |
| Estimation plans | ✅ |
| Portail chef d'équipe | ✅ |
| Rapports chantier | ✅ |
| Support | Email (48h) |

---

#### ⭐ Pro — CHF 399/mois (CHF 332/mois annuel) `RECOMMANDÉ`
**Cible : entreprises générales, 3–15 PMs**

| Paramètre | Valeur |
|-----------|--------|
| Utilisateurs | 20 |
| Projets actifs | 60 |
| Appels IA/mois | 2,000 |
| Stockage | 60 GB |
| Tous les modules | ✅ |
| Data Intelligence C2 | ✅ |
| Direction & Financials | ✅ |
| Desktop app native | ✅ |
| JM WhatsApp | ✅ (futur) |
| Support | Prioritaire (24h) |

*Pourquoi augmenter à 399 ?* L'analyse ROI montre 8–10x de retour — à 399 CHF c'est toujours 7x. La résistance client sera minimale face à une démo qui montre les économies concrètes.

---

#### 🟠 Business — CHF 649/mois (CHF 540/mois annuel) `NOUVEAU`
**Cible : entreprises 15–30 PMs, multi-chantiers**

| Paramètre | Valeur |
|-----------|--------|
| Utilisateurs | 35 |
| Projets actifs | 150 |
| Appels IA/mois | 5,000 |
| Stockage | 150 GB |
| Tous les modules Pro | ✅ |
| AI Roundtable | ✅ |
| Intelligence Score avancé | ✅ |
| Benchmarks C2 | ✅ |
| API Access (future) | ✅ |
| Support | Prioritaire (12h) |
| Onboarding dédié | 1 session |

*Pourquoi créer Business ?* Le gap entre Pro (399) et Enterprise (990) est trop large. Business à 649 crée un "escalier" naturel et capture les entreprises en croissance.

---

#### 🔴 Enterprise — CHF 990/mois (CHF 825/mois annuel)
**Cible : grands groupes, multi-entités**

| Paramètre | Valeur |
|-----------|--------|
| Utilisateurs | Illimité |
| Projets actifs | Illimité |
| Appels IA/mois | Illimité |
| Stockage | 500 GB |
| Tous les modules | ✅ |
| Custom branding | ✅ |
| SSO / SAML | ✅ (futur) |
| SLA 99.9% | ✅ |
| Subdomaine dédié (x.cantaia.io) | ✅ |
| Account manager | Dédié |
| Onboarding | Formation équipe |
| Contrat sur mesure | ✅ |

---

### Politique de prix annuel

| Avantage | Détail |
|----------|--------|
| Économie annuel | **2 mois offerts** (payer 10, utiliser 12) = 16% de réduction |
| Paiement | Virement bancaire (CHF) ou carte |
| Engagement | 12 mois ferme, pas de remboursement partiel |
| Communication | "Payez CHF 3,984 au lieu de CHF 4,788" (Pro annuel) |

---

## 6. Projections Financières

### Scénario de croissance (12 mois)

| Mois | Orgs | MRR (CHF) | ARR (CHF) | Notes |
|------|------|-----------|-----------|-------|
| M1 | 3 | 897 | 10,764 | Beta fermée, clients test |
| M2 | 8 | 2,192 | 26,304 | Lancement commercial |
| M3 | 15 | 4,335 | 52,020 | SEO + bouche à oreille |
| M4 | 22 | 6,478 | 77,736 | |
| M6 | 35 | 10,465 | 125,580 | |
| M9 | 55 | 16,495 | 197,940 | Recrutement SDR |
| M12 | 80 | 25,920 | 311,040 | |

*Mix supposé: 30% Starter, 50% Pro, 15% Business, 5% Enterprise*

### Objectif 12 mois : CHF 25,000 MRR (CHF 311K ARR)

| Métrique | Cible | Notes |
|----------|-------|-------|
| **MRR à M12** | CHF 25,000 | |
| **ARR à M12** | CHF 311,000 | |
| **Clients à M12** | 80 orgs | |
| **Churn mensuel cible** | < 3% | Vertical SaaS est sticky |
| **NRR cible** | 110%+ | Expansion via plan upgrades |
| **CAC cible** | CHF 700–1,500 | Referral + content marketing |
| **LTV/CAC cible** | 5:1+ | Pro plan : LTV ~CHF 7,000 |
| **Gross margin cible** | 90%+ | Atteint dès M1 |

### Scénario optimiste : CHF 50,000 MRR en 18 mois (possible si :)
- 1 client clé (grande entreprise générale) qui fait 3–5 parrainages
- Présence à 1 salon construction suisse (Swissbau, Foire de Bâle)
- Article presse spécialisée (Batimag, Baupublizistik)

---

## 7. Arguments de Vente (Objections Clients)

### "C'est trop cher"

> "Un chef de projet en Suisse coûte CHF 100/heure. Cantaia lui économise 1.5 heures par jour.
> Ça fait CHF 33,000 économisés par an. Vous payez CHF 4,188/an pour le plan Pro.
> Le ROI est de **8x en 12 mois**. Aucun investissement en immobilier ou en matériaux ne vous donne 8x."

### "On a déjà Procore / un autre outil"

> "Procore fait un excellent travail sur les gros projets $100M+. Vous payez au minimum
> $4,500/an sans IA intégrée. Cantaia intègre la classification automatique de vos emails,
> la génération de PV, le briefing quotidien et la comparaison fournisseurs. Et on est en CHF,
> sans minimum de 50 licences."

### "On n'a pas le temps de le configurer"

> "Onboarding en 20 minutes : vous connectez Outlook, vous créez 3 projets, vous importez
> vos fournisseurs. Le lendemain matin, votre premier briefing IA est prêt. On reste
> disponibles par chat pendant les 3 premières semaines."

### "On est une petite structure"

> "C'est exactement pour vous. Les grandes entreprises ont des équipes entières pour
> faire ce que Cantaia fait. Vous n'avez pas 5 assistantes — Cantaia est vos 5 assistantes."

---

## 8. Go-to-Market — Canaux d'Acquisition

### Phase 1 — Lancement (mois 1–3) : Clients de confiance

| Canal | Action | Coût | Clients visés |
|-------|--------|------|---------------|
| Réseau personnel | Appels directs à 20 contacts du secteur | 0 | 3–5 |
| LinkedIn organique | Posts hebdomadaires avec cas d'usage réels | 0 | 2–3 |
| Démos 1:1 | Offrir 1h de démo + setup gratuit | Temps | 5 |
| **Objectif M3** | | | **10–15 orgs** |

### Phase 2 — Croissance organique (mois 3–9) : SEO + Referral

| Canal | Action | Coût | Impact |
|-------|--------|------|--------|
| SEO blog FR | Articles "gestion chantier suisse", "PV chantier template", "classification email BTP" | CHF 500/mois | Long terme |
| Programme referral | 1 mois gratuit pour le parrain ET le filleul | Coût opportunité | ×2.5 croissance |
| Groupes LinkedIn BTP Suisse | Présence active, pas de pub | 0 | Notoriété |
| Partenariats (architectes, ingénieurs) | Partage de commission 15% sur M1–M12 | Variable | 10–20 refs |
| **Objectif M9** | | | **40–60 orgs** |

### Phase 3 — Scale (mois 9–18) : Salons + Presse

| Canal | Action | Coût | Impact |
|-------|--------|------|--------|
| Swissbau 2027 (Basel, jan.) | Stand ou présentation | CHF 5,000–15,000 | 30–50 leads |
| Batimag / La Tribune | Article de fond ou sponsored content | CHF 2,000–5,000 | Notoriété |
| SDR / Commercial | 1 commercial junior (CHF 60,000/an) | CHF 5,000/mois | ×3 croissance |
| Google Ads "logiciel chantier suisse" | Budget limité (test) | CHF 500/mois | Leads qualifiés |

### Canaux à ÉVITER (trop chers pour le stade actuel)

- Product Hunt (audience hors cible)
- Facebook/Instagram Ads (B2C, mauvais ROI)
- Grands salons internationaux avant CHF 50K MRR
- Cold email en masse (réputation + RGPD)

---

## 9. Métriques à Suivre

| Métrique | Fréquence | Cible |
|----------|-----------|-------|
| MRR | Hebdo | +15% MoM (mois 1–6) |
| Churn | Mensuel | < 3% |
| NRR | Mensuel | > 110% |
| Trial → Paid conversion | Hebdo | > 25% |
| CAC par canal | Mensuel | < CHF 1,500 |
| LTV/CAC | Trimestriel | > 5:1 |
| NPS | Trimestriel | > 50 |
| Temps d'activation | Mensuel | < 3 jours (premier PV ou mail classé) |

---

## 10. Résumé des Décisions

### ✅ À appliquer immédiatement

1. **Étendre le trial à 21 jours** (au lieu de 14)
2. **Créer le plan Solo à CHF 89/mois** pour les indépendants
3. **Augmenter Pro à CHF 399/mois** (actuellement 349)
4. **Créer le plan Business à CHF 649/mois** (gap actuel entre Pro et Enterprise)
5. **Augmenter Enterprise à CHF 990/mois** (actuellement 790)
6. **Pousser l'annuel** : "Économisez CHF 800/an" pour Pro annuel vs mensuel
7. **Retirer l'`aggregateRating 4.8/5`** du JSON-LD (données fausses)

### 📋 À préparer pour la phase commerciale

1. **Calculateur ROI** : page `/roi` avec slider "nombre de PMs" → économies calculées
2. **Page Pricing** : démasquer la PricingSection avec les nouveaux tarifs
3. **Démo vidéo** : 2–3 min montrant email → classification → PV en 3 clics
4. **Contrat standard** : CGV adaptées BTP suisse, facturation CHF
5. **Onboarding checklist** : les 5 étapes pour valeur en 20 minutes

---

*Plan rédigé le 2026-03-29 à partir de : recherches marché concurrentiel, benchmarks SaaS 2025-2026, données coûts infrastructure réels Cantaia*

*Sources principales : Anthropic API Pricing, Vercel Docs, Supabase Pricing, SalaryExpert CH, Cognitive Market Research (EU Construction Software $2.74B 2025), SaaS Capital NRR Benchmarks, First Page Sage CAC Report 2026*
