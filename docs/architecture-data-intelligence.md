# CANTAIA — Architecture Data Intelligence

> Modèle 3 couches : Privé → Agrégé → Patterns IA
> Application à 100% des modules — Version 1.0 — 3 mars 2026
> Document confidentiel — Architecture interne

---

## 1. Principe fondamental

Chaque donnée dans CANTAIA traverse un modèle à 3 couches qui garantit la confidentialité totale des données clients tout en permettant à l'IA de s'améliorer continuellement pour l'ensemble de la plateforme.

| Couche | Scope | Contenu | Règle d'or |
|--------|-------|---------|------------|
| **C1 — Privée** | Tenant isolé (organization_id) | Données brutes : prix, emails, PV, fournisseurs, plans | Jamais visible par un autre tenant |
| **C2 — Agrégée** | Plateforme (si >=3 contributeurs) | Statistiques anonymisées : médianes, percentiles, tendances | Impossible de remonter à la source |
| **C3 — Patterns IA** | Modèle global | Structures, corrélations, modèles linguistiques | Aucune donnée factuelle, uniquement des patterns |

> **Règle absolue** : les données brutes restent privées, les patterns et statistiques deviennent collectifs. Un benchmark n'est publié que si >=3 organisations différentes y contribuent.

### 1.1 Sécurité de l'agrégation

| Mécanisme | Description | Implémentation |
|-----------|-------------|----------------|
| Seuil minimum | Aucun benchmark en dessous de 3 contributeurs distincts | CHECK constraint sur min_contributors >= 3 |
| Granularité contrôlée | Agrégation par région, trimestre, code CFC — jamais par projet ou date | GROUP BY region, quarter, cfc_code |
| Bruit différentiel | Bruit statistique ±2-5% sur percentiles | Laplace noise (epsilon=0.1) sur p25/p75 |
| Hachage fournisseurs | Noms fournisseurs hachés dans C2 | SHA-256(company_name + salt) |
| Recalcul complet | Pas d'incrémental, recalcul batch à chaque cycle | Full recompute par clé |

---

## 8. Migrations SQL — Ordre d'exécution

```
Migration 024: aggregation_consent
Migration 025: email_classification_feedback + email_response_templates
Migration 026: submission_corrections
Migration 027: plan_analysis_corrections
Migration 028: pv_corrections + visit_report_corrections
Migration 029: chat_feedback + supplier_preferences
Migration 030: estimate_accuracy_log + task_status_log + org_pricing_config
Migration 031: daily_briefings
Migration 032: normalization_rules + aggregation_queue
Migration 033: market_benchmarks + regional_price_index + material_correlations
Migration 034: supplier_market_scores
Migration 035: project_benchmarks + pv_quality_benchmarks + task_benchmarks
Migration 036: visit_benchmarks + email_benchmarks + chat_analytics
Migration 037: ai_quality_metrics + prompt_optimization_log + pattern_library
Migration 038: triggers (notify_aggregation sur toutes les tables C1)
Migration 039: fonctions agrégation (aggregate_market_benchmarks, etc.)
Migration 040: RLS policies sur tables C2 (lecture sans org_id filter)
```
