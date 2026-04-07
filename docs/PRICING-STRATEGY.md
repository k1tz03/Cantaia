# Cantaia — Strategie Tarifaire & Analyse Financiere

> Document de reference — Avril 2026

---

## 1. Pricing Definitif

```
 STARTER          PRO (Populaire)    ENTERPRISE
 49 CHF           89 CHF             119 CHF
 /user/mois       /user/mois         /user/mois

 1-5 users        5-30 users         15+ users
 5 projets        30 projets         Illimite
```

| | Starter 49 | Pro 89 | Enterprise 119 |
|---|---|---|---|
| Min. users | 1 | 5 | 15 |
| Max. users | 5 | 30 | Illimite |
| MRR plancher | 49 CHF | 445 CHF | 1785 CHF |
| Sweet spot (users) | 2 | 8 | 30 |
| MRR sweet spot | 98 CHF | 712 CHF | 3570 CHF |

---

## 2. Modules par Plan

| Module | Starter | Pro | Enterprise |
|--------|---------|-----|-----------|
| Cantaia Mail (sync + classif IA) | 1 boite | Multi-boites | Multi-boites |
| Chat IA | 200 msg/mois | 1000 msg/mois | Illimite |
| Briefing quotidien | Oui | Oui | Oui |
| Projets & Taches | 5 projets | 30 projets | Illimite |
| Fournisseurs | 50 max | Illimite | Illimite |
| **Soumissions** | Lecture seule | **Complet** | Complet |
| **Plans (upload + analyse)** | Upload only | **Complet** | Complet |
| **PV de chantier** | Non | **Complet** | Complet |
| **Planning IA (Gantt)** | Non | **Complet** | Complet |
| **Portail terrain (PIN)** | Non | **Complet** | Complet |
| **Visites client** | Non | **Complet** | Complet |
| **Rapports chantier** | Non | **Complet** | Complet |
| Direction & Financials | Non | Simplifie | **Complet** |
| Data Intelligence | Non | Non | **Complet** |
| Branding custom | Non | Non | **Complet** |
| API access | Non | Non | **Complet** |
| Multi-organisation | Non | Non | **Complet** |
| Support | Email (48h) | Prioritaire (24h) | Dedie (<4h) |
| Stockage | 5 GB | 50 GB | 500 GB |

---

## 3. Analyse Rentabilite par Plan

### Couts IA par utilisateur/mois

| Poste | Starter | Pro | Enterprise |
|-------|---------|-----|-----------|
| Classification emails (Claude Sonnet) | 3.00 | 4.00 | 4.50 |
| Chat IA (Claude Sonnet) | 1.50 | 3.00 | 4.00 |
| Briefing quotidien (Claude) | 0.80 | 0.80 | 0.80 |
| Soumissions analyse (Claude) | — | 2.00 | 2.50 |
| PV generation (Claude + Whisper) | — | 1.50 | 2.00 |
| Planning IA (Claude) | — | 0.50 | 0.80 |
| Reponses email IA (Claude) | 0.50 | 1.00 | 1.20 |
| Extraction taches (Claude) | 0.20 | 0.40 | 0.50 |
| Plans analyse (Claude Vision) | — | 0.80 | 1.20 |
| Direction/Alertes (Haiku) | — | — | 0.30 |
| **Total cout IA/user/mois** | **6.00** | **14.00** | **17.80** |

### Couts infra par utilisateur/mois

| Poste | Starter | Pro | Enterprise |
|-------|---------|-----|-----------|
| Supabase (DB + Auth + Storage) | 1.50 | 1.50 | 1.50 |
| Vercel (serverless + bandwidth) | 0.50 | 0.80 | 1.00 |
| Microsoft Graph API | 0.00 | 0.00 | 0.00 |
| Sentry + Resend | 0.20 | 0.20 | 0.20 |
| **Total infra/user/mois** | **2.20** | **2.50** | **2.70** |

### Couts humains par utilisateur/mois

| Poste | Starter | Pro | Enterprise |
|-------|---------|-----|-----------|
| Support (temps Julien) | 0.50 | 2.00 | 5.00 |
| Onboarding | 0.30 | 1.00 | 2.00 |
| **Total humain/user/mois** | **0.80** | **3.00** | **7.00** |

### Synthese rentabilite

| | Starter 49 | Pro 89 | Enterprise 119 |
|---|---|---|---|
| Revenu/user/mois | 49.00 CHF | 89.00 CHF | 119.00 CHF |
| **Cout total/user/mois** | **9.00 CHF** | **19.50 CHF** | **27.50 CHF** |
| **Marge brute/user/mois** | **40.00 CHF** | **69.50 CHF** | **91.50 CHF** |
| **Marge brute %** | **81.6%** | **78.1%** | **76.9%** |
| | | | |
| Users moyen/client | 2 | 8 | 30 |
| MRR moyen/client | 98 CHF | 712 CHF | 3570 CHF |
| Marge/client/mois | 80 CHF | 556 CHF | 2745 CHF |
| LTV 24 mois (par user) | 960 CHF | 1668 CHF | 2196 CHF |

### Seuil de rentabilite

Couts fixes mensuels : ~150 CHF (Supabase Pro 25 + Vercel Pro 20 + Sentry 26 + Resend 20 + Domaines 10 + Divers 50)

| Plan | Marge brute/client/mois | Clients pour breakeven |
|------|------------------------|----------------------|
| Starter | 80 CHF | 2 clients |
| Pro (8 users) | 556 CHF | 1 client |
| Enterprise (30 users) | 2745 CHF | 1 client |

---

## 4. Projections 3 Ans

### Nombre de clients

| | Y1 (2026-27) | Y2 (2027-28) | Y3 (2028-29) |
|---|---|---|---|
| Starter | 15-25 | 40-70 | 80-130 |
| Pro | 3-8 | 15-30 | 40-80 |
| Enterprise | 0-2 | 3-8 | 10-25 |
| **Total** | 18-35 | 58-108 | 130-235 |

### MRR et ARR projetes

| | Y1 fin | Y2 fin | Y3 fin |
|---|---|---|---|
| MRR Starter (x99 avg) | 1.5-2.5K | 4-7K | 8-13K |
| MRR Pro (x712 avg) | 2.1-5.7K | 10.7-21.4K | 28.5-57K |
| MRR Enterprise (x3570 avg) | 0-7.1K | 10.7-28.6K | 35.7-89.3K |
| **MRR total** | **3.6-15.3K** | **25.4-57K** | **72.2-159.3K** |
| **ARR** | **43-184K** | **305-684K** | **866K-1.91M** |

### Scenario base (median)

| | Y1 | Y2 | Y3 |
|---|---|---|---|
| Clients total | 25 | 80 | 180 |
| **MRR** | 8K | 38K | 110K |
| **ARR** | 96K | 456K | 1.32M |

---

## 5. Comparaison Marche

| Outil | Prix/user/mois | IA ? | Modules |
|-------|---------------|------|---------|
| ChatGPT Pro | 30 CHF | Oui (generaliste) | Chat uniquement |
| Microsoft 365 Copilot | 30 CHF | Oui (generaliste) | Office |
| Procore | 100-200+ CHF | Non | Gestion chantier |
| PlanRadar | 60-90 CHF | Non | Suivi defauts |
| BIM 360 | 50-100 CHF | Non | Gestion plans |
| **Cantaia Starter** | **49 CHF** | **Oui (metier)** | Mail IA + Chat + Briefing |
| **Cantaia Pro** | **89 CHF** | **Oui (metier)** | 11 modules complets |
| **Cantaia Enterprise** | **119 CHF** | **Oui (metier)** | 11 modules + Direction + Intel |

### ROI client

Un PM construction suisse coute ~140 CHF/h a son employeur.
Cantaia fait gagner ~15h/semaine = **8400 CHF/mois d'economies**.
A 89 CHF/user/mois = **ROI x94**.

---

## 6. Metriques Cles a Suivre

| Metrique | Cible Y1 | Pourquoi |
|----------|----------|----------|
| Trial -> Paid conversion | >15% | En dessous de 10%, PMF pas valide |
| Starter -> Pro upgrade rate | >20% sur 6 mois | Moteur de croissance |
| Net Revenue Retention | >110% | Expansion sièges existants |
| Churn mensuel | <5% | Standard B2B SaaS |
| CAC Starter | <200 CHF | 2 mois de revenu |
| CAC Pro | <500 CHF | ~1 mois de revenu |
| CAC Enterprise | <3000 CHF | ~1 mois de revenu |

---

## 7. Architecture IA et Couts

### Modeles utilises (production)

| Modele | Usage | Cout approximatif |
|--------|-------|-------------------|
| Claude Sonnet 4.5 | Classification emails, chat, briefing, PV, soumissions, planning, reponses | ~$3/MTok input, ~$15/MTok output |
| Claude Haiku | Alertes IA, budget estimation (desactive UI) | ~$0.25/MTok input, ~$1.25/MTok output |
| Claude Vision | Analyse plans, notes manuscrites | ~$3/MTok input |
| OpenAI Whisper | Transcription audio (PV, visites) | $0.006/min |

### Multi-modele (desactive cote utilisateur)

| Modele | Usage | Statut |
|--------|-------|--------|
| GPT-4o Vision | Estimation plans (passe 2 consensus) | Desactive UI |
| Gemini 2.0 Flash | Estimation plans (passe 2 consensus) | Desactive UI |
| Claude + GPT + Gemini | Table Ronde IA | Super-admin uniquement |

### Optimisations en place

- Prompt caching Anthropic (`cache_control: ephemeral`) sur tous les prompts systeme
- Import dynamique SDK (`import("@anthropic-ai/sdk")`) pour eviter bundling client
- `callAnthropicWithRetry()` avec gestion 429/503/529
- Haiku pour les taches legeres (alertes, budget)
- Monitoring couts via `api_usage_logs` (provider, model, tokens, cost)
