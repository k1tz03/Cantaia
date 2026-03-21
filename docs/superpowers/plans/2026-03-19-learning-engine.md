# Learning Engine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Cantaia's existing data tables and estimation pipeline into a self-improving flywheel where every user interaction (price correction, plan analysis, email classification) makes the system more accurate.

**Architecture:** 15 tasks organized by learning loop: Prix (Tasks 2-4), Plans (Tasks 5-7), Classification/C2 (Tasks 8-10), Wow features (Tasks 11-12), Planning (Tasks 13-15). Task 1 creates the migration. Each task wires existing infrastructure — most code exists but isn't connected. The spec is at `docs/superpowers/specs/2026-03-19-learning-engine-design.md`.

**Tech Stack:** Next.js 15 (App Router), TypeScript, Supabase (PostgreSQL + RLS), Anthropic Claude API (Sonnet 4.5), Recharts, Tailwind + shadcn/ui, `@cantaia/core` packages

**Spec:** `docs/superpowers/specs/2026-03-19-learning-engine-design.md`

---

## File Structure Overview

### New Files

| File | Responsibility |
|------|---------------|
| `packages/database/migrations/057_learning_engine.sql` | New fields: `intelligence_score`, `inflation_rate` on organizations; `ai_risks`, `ai_duration_correction` on planning_tasks; `ai_summary`, `ai_recommendations` on project_plannings |
| `apps/web/src/components/submissions/MonteCarloChart.tsx` | Client-side Monte Carlo histogram (10K iterations, Recharts AreaChart) |
| `apps/web/src/components/app/IntelligenceScore.tsx` | 5-bar maturity score component (Prix, Plans, Planning, Emails, Fournisseurs) |
| `apps/web/src/components/app/IntelligenceDashboard.tsx` | Org + C2 counters, learning journal, maturity score |
| `apps/web/src/components/ui/IntelligentAlerts.tsx` | AI-generated alerts (budget/planning), severity badges |
| `apps/web/src/app/api/ai/generate-alerts/route.ts` | POST: Claude-generated proactive alerts |
| `apps/web/src/app/api/ai/executive-summary/route.ts` | POST: One-page executive summary (budget + planning + risks) |

### Modified Files

| File | What Changes |
|------|-------------|
| `packages/core/src/plans/estimation/price-resolver.ts` | V3 multi-criteria scoring within tiers + inflation adjustment |
| `packages/core/src/plans/estimation/auto-calibration.ts` | Fix 3 column name bugs, wire to "Attribuer" event |
| `packages/core/src/plans/estimation/consensus-engine.ts` | Read model weights from DB + adaptive per-discipline thresholds |
| `packages/core/src/plans/estimation/pipeline.ts` | Inject bureau profile in Passe 2 + trigger cross-plan after Passe 4 |
| `packages/core/src/plans/estimation/cross-plan-verification.ts` | Wire to pipeline route |
| `packages/core/src/plans/estimation/calibration-engine.ts` | Feed bureau profile after Passe 1 |
| `packages/core/src/emails/classification-learning.ts` | Auto-create rules after N reclassifications (sender 2×, keyword 3×) |
| `packages/core/src/ai/email-classifier.ts` | Enriched extraction: prices, deadlines, supplier match, delay signals |
| `packages/core/src/ai/prompts.ts` | Enriched classification prompt |
| `packages/core/src/briefing/briefing-generator.ts` | Inject C2 market trends |
| `packages/core/src/planning/planning-generator.ts` | Activate dependency rules + add IA validation pass |
| `packages/core/src/planning/duration-calculator.ts` | Read org corrections from planning_duration_corrections |
| `apps/web/src/components/submissions/detail/ComparisonTab.tsx` | Add "Attribuer" button per supplier |
| `apps/web/src/app/api/submissions/[id]/route.ts` | Trigger auto-calibration on award |
| `apps/web/src/app/api/submissions/[id]/estimate-budget/route.ts` | Return variance data + C2 market annotations |
| `apps/web/src/app/api/plans/corrections/route.ts` | Update model_error_profiles after quantity correction |
| `apps/web/src/app/api/plans/estimate-v2/route.ts` | Read bureau profile + trigger cross-plan |
| `apps/web/src/components/plans/PlanAlertsBanner.tsx` | Show cross-plan coherence results |
| `apps/web/src/components/plans/EstimationResultV2.tsx` | Model tooltips, consensus colors, bureau badge |
| `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx` | Price feedback bannière + Monte Carlo tab |
| `apps/web/src/app/[locale]/(app)/mail/page.tsx` | Trigger learning on reclassification |
| `apps/web/src/app/api/planning/generate/route.ts` | Claude validation pass post-generation |
| `apps/web/src/app/api/projects/[id]/route.ts` | Trigger planning calibration on status=completed |
| `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` | IntelligenceDashboard widget |
| `CLAUDE.md` | New routes, components, migration 057 |

---

## Task 1: Migration 057 — Learning Engine Fields

> **Add new database columns required by all subsequent tasks.**

**Files:**
- Create: `packages/database/migrations/057_learning_engine.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration 057: Learning Engine fields
-- Depends on: 055 (planning_tables), 056 (stripe_plan_columns)

-- Organizations: intelligence tracking
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS intelligence_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inflation_rate decimal(5,4) DEFAULT 0.028;

-- Planning tasks: AI enrichment
ALTER TABLE planning_tasks
  ADD COLUMN IF NOT EXISTS ai_risks jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_duration_correction integer;

-- Project plannings: AI summary
ALTER TABLE project_plannings
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_recommendations jsonb DEFAULT '[]'::jsonb;

-- Index for faster calibration lookups
CREATE INDEX IF NOT EXISTS idx_price_calibrations_org_cfc
  ON price_calibrations (org_id, cfc_code);

CREATE INDEX IF NOT EXISTS idx_quantity_corrections_org
  ON quantity_corrections (org_id);

CREATE INDEX IF NOT EXISTS idx_email_classification_rules_org
  ON email_classification_rules (organization_id, rule_type);
```

- [ ] **Step 2: Verify migration file is valid SQL**

Run: `cat packages/database/migrations/057_learning_engine.sql`
Expected: Valid SQL with no syntax errors.

- [ ] **Step 3: Commit**

```bash
git add packages/database/migrations/057_learning_engine.sql
git commit -m "feat(db): add migration 057 for learning engine fields"
```

---

## Task 2: Fix Auto-Calibration + "Attribuer" Button

> **Fix 3 column name bugs in auto-calibration.ts, create the "Attribuer" (Award) button in ComparisonTab, and wire the trigger when a supplier is awarded.**

**Files:**
- Modify: `packages/core/src/plans/estimation/auto-calibration.ts`
- Modify: `apps/web/src/components/submissions/detail/ComparisonTab.tsx`
- Modify: `apps/web/src/app/api/submissions/[id]/route.ts`

**Context:** The spec identifies 3 bugs in `auto-calibration.ts`:
1. `description_normalized` → should be `normalized_description` (on `offer_line_items`)
2. `cfc_code` → should be `cfc_subcode` (on `offer_line_items`)
3. `.eq('analysis_type', 'estimation_v2')` → column doesn't exist on `plan_analyses`

The "Attribuer" button doesn't exist yet. It should appear in ComparisonTab next to each supplier. When clicked:
1. Set `supplier_offers.status = 'awarded'` for the selected supplier
2. Set `supplier_offers.status = 'rejected'` for all other suppliers on this submission
3. Call auto-calibration to compare awarded prices vs budget estimate
4. Store results in `price_calibrations`

- [ ] **Step 1: Read current auto-calibration.ts**

Read `packages/core/src/plans/estimation/auto-calibration.ts` to identify exact column references.

- [ ] **Step 2: Fix the 3 column name bugs**

In `auto-calibration.ts`:
- Replace `description_normalized` with `normalized_description` everywhere
- Replace `cfc_code` with `cfc_subcode` on `offer_line_items` queries
- Remove or fix the `.eq('analysis_type', 'estimation_v2')` filter — instead query `plan_analyses` by `plan_id` and `status = 'completed'`, taking the most recent

- [ ] **Step 3: Read ComparisonTab.tsx**

Read `apps/web/src/components/submissions/detail/ComparisonTab.tsx` to understand its current structure and where to add the award button.

- [ ] **Step 4: Add "Attribuer" button to ComparisonTab**

Add a button per supplier column in the comparison view. When clicked:
- Confirm dialog: "Attribuer cette soumission à {supplierName} ?"
- PATCH `/api/submissions/[id]` with `{ action: "award", supplier_offer_id: "..." }`
- On success: reload data, show toast "Fournisseur attribué"
- Visual: green badge "Attribué" on awarded supplier, gray "Non retenu" on others

Use existing `ConfirmDialog.tsx` from `apps/web/src/components/ui/`.

- [ ] **Step 5: Read the submissions/[id] route.ts**

Read `apps/web/src/app/api/submissions/[id]/route.ts` to find the PATCH handler.

- [ ] **Step 6: Add award action to PATCH handler**

In the PATCH handler of `submissions/[id]/route.ts`, add handling for `action: "award"`:

```typescript
if (body.action === "award" && body.supplier_offer_id) {
  // 1. Set awarded supplier
  await (admin as any).from("supplier_offers")
    .update({ status: "awarded" })
    .eq("id", body.supplier_offer_id);

  // 2. Reject others
  await (admin as any).from("supplier_offers")
    .update({ status: "rejected" })
    .eq("submission_id", id)
    .neq("id", body.supplier_offer_id)
    .neq("status", "awarded");

  // 3. Update submission status
  await (admin as any).from("submissions")
    .update({ status: "awarded" })
    .eq("id", id);

  // 4. Fire-and-forget auto-calibration
  import { autoCalibrate } from "@cantaia/core/plans/estimation/auto-calibration";
  autoCalibrate({ supabase: admin, org_id: orgId, submission_id: id, offer_id: body.supplier_offer_id })
    .catch(err => console.error("[auto-calibration]", err));

  return NextResponse.json({ success: true });
}
```

Add IDOR check: verify the submission belongs to the user's org before proceeding.

- [ ] **Step 7: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`
Expected: 0 new errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/plans/estimation/auto-calibration.ts apps/web/src/components/submissions/detail/ComparisonTab.tsx apps/web/src/app/api/submissions/\[id\]/route.ts
git commit -m "feat(prix): fix auto-calibration bugs and add Attribuer button in ComparisonTab"
```

---

## Task 3: Price Resolver V3 — Multi-Criteria Scoring + Inflation

> **Replace binary match/no-match in the price resolver with a weighted scoring system. Add inflation adjustment to historical prices.**

**Files:**
- Modify: `packages/core/src/plans/estimation/price-resolver.ts`

**Context:** The current price-resolver uses keyword matching with basic fallbacks. V3 introduces a scoring formula applied **within each existing tier** (the 6-tier cascade stays unchanged):

```
score = 0
+ 40 pts  CFC code exact match
+ 25 pts  CFC prefix match (211.3 → 211)
+ 20 pts  keyword overlap ≥60% on descriptions
+ 10 pts  same unit
+ 5 pts   same region
+ bonus   temporal decay: <6 mois ×1.0, 6-12 mois ×0.8, >12 mois ×0.6

Minimum threshold: 35 pts
Result: top 30 by score, weighted percentiles
```

Inflation adjustment for historical prices:
```typescript
prix_ajusté = prix_ref × (1 + inflation_rate) ^ années_écoulées
// inflation_rate from organizations.inflation_rate (default 0.028 = 2.8% CH construction)
```

- [ ] **Step 1: Read current price-resolver.ts**

Read `packages/core/src/plans/estimation/price-resolver.ts` to understand current matching logic in each tier.

- [ ] **Step 2: Add scoring function**

Add a `scorePriceCandidate()` function at the top of the file:

```typescript
interface PriceCandidate {
  prix_unitaire: number;
  cfc_code?: string;
  description?: string;
  unite?: string;
  region?: string;
  date?: string; // ISO date
}

function scorePriceCandidate(
  candidate: PriceCandidate,
  query: { cfc_code?: string; description: string; unite?: string; region?: string },
  inflationRate: number = 0.028
): { score: number; adjusted_price: number } {
  let score = 0;

  // CFC matching
  if (candidate.cfc_code && query.cfc_code) {
    if (candidate.cfc_code === query.cfc_code) score += 40;
    else if (candidate.cfc_code.startsWith(query.cfc_code.split(".")[0])) score += 25;
  }

  // Keyword overlap
  const candidateKw = extractKeywords(candidate.description || "");
  const queryKw = extractKeywords(query.description);
  if (candidateKw.length > 0 && queryKw.length > 0) {
    const overlap = candidateKw.filter(k => queryKw.some(q => q.includes(k) || k.includes(q))).length;
    const ratio = overlap / Math.max(candidateKw.length, queryKw.length);
    if (ratio >= 0.6) score += 20;
    else if (ratio >= 0.3) score += 10;
  }

  // Unit match (normalize common variants: m2→m², m3→m³, ml→m, etc.)
  const normUnit = (u: string) => u.toLowerCase().replace(/m2/g, "m²").replace(/m3/g, "m³").replace(/pce/g, "pièce").trim();
  if (candidate.unite && query.unite && normUnit(candidate.unite) === normUnit(query.unite)) {
    score += 10;
  }

  // Region match
  if (candidate.region && query.region && candidate.region === query.region) {
    score += 5;
  }

  // Temporal decay + inflation
  let adjustedPrice = candidate.prix_unitaire;
  if (candidate.date) {
    const ageMonths = (Date.now() - new Date(candidate.date).getTime()) / (1000 * 60 * 60 * 24 * 30);
    const ageYears = ageMonths / 12;

    // Temporal decay on score
    if (ageMonths <= 6) { /* ×1.0 */ }
    else if (ageMonths <= 12) score = Math.round(score * 0.8);
    else score = Math.round(score * 0.6);

    // Inflation adjustment on price
    adjustedPrice = candidate.prix_unitaire * Math.pow(1 + inflationRate, ageYears);
  }

  return { score, adjusted_price: Math.round(adjustedPrice * 100) / 100 };
}
```

- [ ] **Step 3: Apply scoring in Tier 1 (historique interne)**

Modify the Tier 1 logic to:
1. Fetch all candidates (up to 100) from `offer_line_items` matching org
2. Score each with `scorePriceCandidate()`
3. Filter by threshold ≥35
4. Sort by score desc, take top 30
5. Calculate weighted percentiles (p25, median, p75) weighted by score

- [ ] **Step 4: Apply scoring in Tiers 2-5**

Apply the same scoring pattern to:
- Tier 2 (`mv_reference_prices`)
- Tier 3 (`ingested_offer_lines`)
- Tier 4 (`market_benchmarks`) — region matching bonus applies here
- Tier 5 (CRB static) — inflation adjustment most important here

For Tier 5 CRB: always apply inflation adjustment since reference prices are dated.

- [ ] **Step 5: Accept `inflation_rate` parameter**

Add `inflation_rate?: number` to the `resolvePrice()` function signature. The caller passes it from `organizations.inflation_rate`. Default to `0.028`.

- [ ] **Step 6: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/plans/estimation/price-resolver.ts
git commit -m "feat(prix): price resolver V3 with multi-criteria scoring and inflation adjustment"
```

---

## Task 4: Price Feedback UI

> **Add a stats banner at the top of the Budget IA tab showing price database health, accuracy, and source distribution.**

**Files:**
- Modify: `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx`
- Modify: `apps/web/src/app/api/submissions/[id]/estimate-budget/route.ts`

**Context:** The budget estimation page currently shows items with price sources but no aggregate stats. Add a banner showing:
- Count of prices in the org's database
- Average accuracy (from `price_calibrations` — avg of `abs(1 - calibration_coefficient)`)
- Source distribution pie (% historique interne / marché / CRB / IA)
- Precision trend (last 6 months sparkline from `price_calibrations`)

- [ ] **Step 1: Read the estimate-budget route**

Read `apps/web/src/app/api/submissions/[id]/estimate-budget/route.ts` to understand current response shape.

- [ ] **Step 2: Add feedback stats to the estimate-budget response**

After computing the budget, add a `feedback` object to the response:

```typescript
// Query price stats
const { count: priceCount } = await (admin as any)
  .from("offer_line_items")
  .select("id", { count: "exact", head: true })
  .eq("organization_id", orgId);

const { data: calibrations } = await (admin as any)
  .from("price_calibrations")
  .select("coefficient, created_at")
  .eq("org_id", orgId)
  .order("created_at", { ascending: false })
  .limit(100);

const avgAccuracy = calibrations?.length
  ? 1 - calibrations.reduce((sum: number, c: any) => sum + Math.abs(1 - c.coefficient), 0) / calibrations.length
  : null;

// Source distribution from current budget items
const sourceDistribution = {
  historique_interne: items.filter(i => i.source === "historique_interne").length,
  marche: items.filter(i => i.source === "benchmark_cantaia").length,
  crb: items.filter(i => i.source === "referentiel_crb").length,
  ia: items.filter(i => i.source === "prix_non_disponible").length,
};

// Monthly trend (last 6 months)
const monthlyTrend = []; // Group calibrations by month, calc avg accuracy each

return NextResponse.json({
  ...existingResponse,
  feedback: {
    price_count: priceCount || 0,
    avg_accuracy: avgAccuracy,
    source_distribution: sourceDistribution,
    monthly_trend: monthlyTrend,
    calibrations_count: calibrations?.length || 0,
  }
});
```

- [ ] **Step 3: Read the submissions/[id] page**

Read `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx` to find where the Budget IA tab renders.

- [ ] **Step 4: Add PriceFeedbackBanner component inline**

At the top of the Budget IA tab content, add a banner that reads the `feedback` data:

```tsx
{budget?.feedback && (
  <div className="mb-4 rounded-lg border bg-card p-4">
    <div className="flex items-center gap-2 mb-3">
      <TrendingUp className="h-4 w-4 text-blue-500" />
      <span className="text-sm font-medium">Intelligence prix</span>
    </div>
    <div className="grid grid-cols-4 gap-4 text-sm">
      <div>
        <div className="text-2xl font-bold">{budget.feedback.price_count}</div>
        <div className="text-muted-foreground">prix en base</div>
      </div>
      <div>
        <div className="text-2xl font-bold">
          {budget.feedback.avg_accuracy ? `${Math.round(budget.feedback.avg_accuracy * 100)}%` : "—"}
        </div>
        <div className="text-muted-foreground">précision moyenne</div>
      </div>
      <div>
        {/* Source distribution as mini horizontal bar */}
      </div>
      <div>
        {/* Sparkline trend from monthly_trend using Recharts */}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 5: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/submissions/\[id\]/estimate-budget/route.ts apps/web/src/app/\[locale\]/\(app\)/submissions/\[id\]/page.tsx
git commit -m "feat(prix): add price feedback banner with accuracy stats and source distribution"
```

---

## Task 5: Consensus Engine — Model Weights + Adaptive Thresholds

> **Make the consensus engine read model error profiles from DB to weight models dynamically, and replace fixed divergence thresholds with per-discipline values.**

**Files:**
- Modify: `packages/core/src/plans/estimation/consensus-engine.ts`
- Modify: `apps/web/src/app/api/plans/corrections/route.ts`

**Context:**

**Model weights:** The consensus engine already accepts `modelWeights?: Record<ModelProvider, number>`. The corrections route (`/api/plans/corrections`) saves quantity corrections but doesn't update `model_error_profiles`. After each correction:
1. Identify which model was closest/farthest
2. Update `model_error_profiles` with new error stats
3. On next estimation, read profiles and compute weights: `weight = 1 / (1 + avg_error_pct / 10)`, normalized so sum = 3.0

**Adaptive thresholds:** Replace the fixed 10%/15% divergence thresholds with per-discipline values:

| Discipline | Concordance forte | Concordance partielle |
|------------|-------------------|----------------------|
| Béton, acier (structurel) | ≤5% | ≤10% |
| Surfaces (sols, peinture) | ≤8% | ≤15% |
| Électricité, CVC (comptage) | ≤12% | ≤20% |
| Finitions, aménagement | ≤15% | ≤25% |

- [ ] **Step 1: Read consensus-engine.ts**

Read `packages/core/src/plans/estimation/consensus-engine.ts` to understand current threshold logic and `buildConsensus()` signature.

- [ ] **Step 2: Add discipline threshold map**

Add a `DISCIPLINE_THRESHOLDS` map at the top of the file:

```typescript
const DISCIPLINE_THRESHOLDS: Record<string, { forte: number; partielle: number }> = {
  "beton": { forte: 0.05, partielle: 0.10 },
  "acier": { forte: 0.05, partielle: 0.10 },
  "structure": { forte: 0.05, partielle: 0.10 },
  "surfaces": { forte: 0.08, partielle: 0.15 },
  "sols": { forte: 0.08, partielle: 0.15 },
  "peinture": { forte: 0.08, partielle: 0.15 },
  "electricite": { forte: 0.12, partielle: 0.20 },
  "cvc": { forte: 0.12, partielle: 0.20 },
  "chauffage": { forte: 0.12, partielle: 0.20 },
  "ventilation": { forte: 0.12, partielle: 0.20 },
  "finitions": { forte: 0.15, partielle: 0.25 },
  "amenagement": { forte: 0.15, partielle: 0.25 },
};
const DEFAULT_THRESHOLDS = { forte: 0.10, partielle: 0.15 };

function getThresholds(cfcCode?: string, description?: string) {
  // Match discipline from CFC code prefix or description keywords
  // Return appropriate thresholds or defaults
}
```

- [ ] **Step 3: Use discipline thresholds in consensus logic**

In the `buildConsensus()` function, replace the hardcoded `0.10` and `0.15` thresholds with calls to `getThresholds(poste.cfc_code, poste.description)`.

- [ ] **Step 4: Read corrections route**

Read `apps/web/src/app/api/plans/corrections/route.ts`.

- [ ] **Step 5: Update corrections route to feed model_error_profiles**

After saving the correction to `quantity_corrections`, add logic to update model error profiles:

```typescript
// Identify which model was closest to the corrected value
// The correction has: valeur_estimee, valeur_corrigee, valeurs_par_modele (JSONB)
if (body.valeurs_par_modele) {
  const models = body.valeurs_par_modele; // { claude: 120, gpt4o: 115, gemini: 130 }
  const corrected = body.valeur_corrigee;

  for (const [model, value] of Object.entries(models)) {
    const errorPct = Math.abs((value as number) - corrected) / corrected;
    // Upsert into model_error_profiles
    // Use running average: new_avg = (old_avg * count + errorPct) / (count + 1)
  }
}
```

- [ ] **Step 6: Read estimate-v2 route to wire model weights**

Read `apps/web/src/app/api/plans/estimate-v2/route.ts` to find where `buildConsensus()` is called.

- [ ] **Step 7: Compute model weights from profiles**

In the estimate-v2 route, before calling the pipeline:

```typescript
// Read model error profiles — C2 table keyed by (provider, discipline, type_element_cfc)
// Note: model_error_profiles is NOT org-scoped (it's cross-org C2 data)
const { data: profiles } = await (admin as any)
  .from("model_error_profiles")
  .select("provider, discipline, ecart_moyen_pct, nombre_corrections");

const modelWeights: Record<string, number> = {};
if (profiles?.length) {
  // Group by provider, average the error percentages
  const byProvider: Record<string, number[]> = {};
  for (const p of profiles) {
    if (!byProvider[p.provider]) byProvider[p.provider] = [];
    byProvider[p.provider].push(p.ecart_moyen_pct || 0.15);
  }
  for (const [provider, errors] of Object.entries(byProvider)) {
    const avgError = errors.reduce((a, b) => a + b, 0) / errors.length;
    modelWeights[provider] = 1 / (1 + avgError / 10);
  }
  // Normalize so sum ≈ 3.0
  const sum = Object.values(modelWeights).reduce((a, b) => a + b, 0);
  if (sum > 0) {
    const factor = 3.0 / sum;
    for (const k of Object.keys(modelWeights)) {
      modelWeights[k] *= factor;
    }
  }
}
```

Pass `modelWeights` to the pipeline call.

- [ ] **Step 8: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/plans/estimation/consensus-engine.ts apps/web/src/app/api/plans/corrections/route.ts apps/web/src/app/api/plans/estimate-v2/route.ts
git commit -m "feat(plans): dynamic model weights and adaptive discipline thresholds in consensus engine"
```

---

## Task 6: Bureau Profiles Injection

> **After each plan analysis (Passe 1), extract the architect bureau name and feed `bureau_profiles`. Inject bureau context into the Passe 2 prompt for organizations with ≥3 analyzed plans from the same bureau.**

**Files:**
- Modify: `packages/core/src/plans/estimation/pipeline.ts`
- Modify: `packages/core/src/plans/estimation/calibration-engine.ts`
- Modify: `apps/web/src/app/api/plans/estimate-v2/route.ts`

**Context:** The `bureau_profiles` table exists (migration 043). `calibration-engine.ts` already has a `getBureauProfile()` function that queries it and returns prompt enrichment text. The pipeline already accepts `bureauEnrichment` param. What's missing:
1. After Passe 1 identifies the bureau, update/create the bureau profile
2. Before Passe 2, read the bureau profile and inject it

- [ ] **Step 1: Read calibration-engine.ts**

Read `packages/core/src/plans/estimation/calibration-engine.ts` to understand `getBureauProfile()`.

- [ ] **Step 2: Add `updateBureauProfile()` function**

In `calibration-engine.ts`, add:

```typescript
export async function updateBureauProfile(
  supabase: any,
  orgId: string,
  bureauName: string,
  qualityScore: number // from Passe 1
): Promise<void> {
  const normalized = bureauName.trim().toLowerCase();

  const { data: existing } = await supabase
    .from("bureau_profiles")
    .select("*")
    .eq("organization_id", orgId)
    .eq("bureau_name", normalized)
    .maybeSingle();

  if (existing) {
    // Running average
    const newCount = (existing.plans_analyzed || 0) + 1;
    const newAvgQuality = ((existing.avg_quality_score || 0) * existing.plans_analyzed + qualityScore) / newCount;

    await supabase.from("bureau_profiles").update({
      plans_analyzed: newCount,
      avg_quality_score: Math.round(newAvgQuality * 100) / 100,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await supabase.from("bureau_profiles").insert({
      organization_id: orgId,
      bureau_name: normalized,
      plans_analyzed: 1,
      avg_quality_score: qualityScore,
    });
  }
}
```

- [ ] **Step 3: Read pipeline.ts and estimate-v2/route.ts**

Read both files to understand how Passe 1 results are used and where to inject bureau profile.

- [ ] **Step 4: Wire bureau profile in estimate-v2 route**

After Passe 1 completes and returns `auteur_bureau`:

```typescript
// After Passe 1
const bureauName = passe1Result.title_block?.architect || passe1Result.title_block?.bureau;

if (bureauName) {
  // Update profile
  await updateBureauProfile(admin, orgId, bureauName, passe1Result.quality_score || 0.5);

  // Get enrichment text if ≥3 plans
  const { enrichment } = await getBureauProfile(admin, orgId, bureauName);
  if (enrichment) {
    // Pass to pipeline for Passe 2
    pipelineOptions.bureauEnrichment = enrichment;
  }
}
```

- [ ] **Step 5: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/plans/estimation/calibration-engine.ts packages/core/src/plans/estimation/pipeline.ts apps/web/src/app/api/plans/estimate-v2/route.ts
git commit -m "feat(plans): inject bureau profiles into estimation pipeline after Passe 1"
```

---

## Task 7: Cross-Plan Verification + Plans Feedback UI

> **Wire cross-plan verification to trigger automatically after Passe 4 when a project has ≥2 analyzed plans. Display coherence results in PlanAlertsBanner. Enhance EstimationResultV2 with model tooltips and consensus colors.**

**Files:**
- Modify: `apps/web/src/app/api/plans/estimate-v2/route.ts`
- Modify: `apps/web/src/components/plans/PlanAlertsBanner.tsx`
- Modify: `apps/web/src/components/plans/EstimationResultV2.tsx`

**Context:** `cross-plan-verification.ts` is fully functional with 7 discipline pairs. It needs to be called from the estimate-v2 route after the pipeline completes. Results should be displayed on the plan detail page.

- [ ] **Step 1: Read cross-plan-verification.ts**

Read `packages/core/src/plans/estimation/cross-plan-verification.ts` to understand its API.

- [ ] **Step 2: Wire cross-plan in estimate-v2 route**

After the pipeline completes, add:

```typescript
import { runCrossPlanVerification } from "@cantaia/core/plans/estimation/cross-plan-verification";

// After pipeline saves results
// Check if project has ≥2 plans with analyses
const { data: projectPlans } = await (admin as any)
  .from("plan_registry")
  .select("id")
  .eq("project_id", projectId);

if (projectPlans && projectPlans.length >= 2) {
  const crossPlanResult = await runCrossPlanVerification(admin, projectId)
    .catch(err => { console.warn("[cross-plan]", err); return null; });

  if (crossPlanResult) {
    // Save to response and/or plan_analyses
    result.cross_plan = crossPlanResult;
  }
}
```

- [ ] **Step 3: Read PlanAlertsBanner.tsx**

Read `apps/web/src/components/plans/PlanAlertsBanner.tsx` to understand its current props.

- [ ] **Step 4: Add cross-plan alerts display**

Add a section to PlanAlertsBanner that shows coherence results:

```tsx
{crossPlan && (
  <div className="rounded-lg border p-3 space-y-2">
    <div className="flex items-center gap-2 text-sm font-medium">
      <Layers className="h-4 w-4" />
      Vérification inter-plans ({crossPlan.verifications.length} comparaisons)
    </div>
    {crossPlan.alertes.map((a, i) => (
      <div key={i} className={cn(
        "text-xs px-2 py-1 rounded",
        a.severity === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
      )}>
        {a.message}
      </div>
    ))}
    {crossPlan.score_coherence_projet >= 90 && (
      <div className="text-xs text-green-600">
        ✓ Cohérence inter-plans : {crossPlan.score_coherence_projet}%
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Read EstimationResultV2.tsx**

Read `apps/web/src/components/plans/EstimationResultV2.tsx`.

- [ ] **Step 6: Enhance EstimationResultV2 with feedback**

Add to each estimation row:
- **Consensus level badge**: colored (green=concordance_forte, yellow=partielle, red=divergence)
- **Model tooltip**: on hover, show the 3 model values + median for each poste
- **Bureau badge**: if bureau profile was used, show "Bureau connu (N plans)"

- [ ] **Step 7: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/api/plans/estimate-v2/route.ts apps/web/src/components/plans/PlanAlertsBanner.tsx apps/web/src/components/plans/EstimationResultV2.tsx
git commit -m "feat(plans): wire cross-plan verification and enhance estimation feedback UI"
```

---

## Task 8: Classification Auto-Rules + Enriched Email Extraction

> **Enhance the classification learning loop to auto-create rules after repeated reclassifications. Enrich the L3 Claude classifier to extract price signals, deadlines, and supplier matches alongside classification.**

**Files:**
- Modify: `packages/core/src/emails/classification-learning.ts`
- Modify: `packages/core/src/ai/email-classifier.ts`
- Modify: `packages/core/src/ai/prompts.ts`
- Modify: `apps/web/src/app/[locale]/(app)/mail/page.tsx`

**Context:**

**Auto-rules (Section 8.1):** When a user reclassifies an email:
- 2 reclassifications from same sender → auto sender rule in `email_classification_rules`
- 3 reclassifications with same keyword in subject → auto keyword rule
- Temporal weighting: rule confirmed 5× this month > rule from 6 months ago

The `learnFromClassificationAction()` function already creates rules for confirmed/corrected actions. Enhance it to:
1. Check if sender has been reclassified ≥2 times → promote to permanent rule
2. Check if subject keywords appear ≥3 times in corrections → create keyword rule

**Enriched extraction (Section 8.2):** Add `signals` to the L3 classification output:
```json
{
  "classification": "action_required",
  "confidence": 0.92,
  "signals": {
    "prices_detected": [{"description": "...", "prix": 4.50, "unite": "ml"}],
    "deadlines_detected": [{"text": "livraison semaine 22", "date": "2026-05-25"}],
    "supplier_match": "Müller Elektro AG",
    "delay_detected": false,
    "order_confirmation": false
  }
}
```

- [ ] **Step 1: Read classification-learning.ts**

Read `packages/core/src/emails/classification-learning.ts`.

- [ ] **Step 2: Enhance rule promotion logic**

In `learnFromClassificationAction()`, after processing the correction:

```typescript
// Check for auto-rule promotion
// Note: email_classification_feedback has: email_id, original_project_id, corrected_project_id,
//   original_classification, corrected_classification, created_by
// To count sender corrections, join with email_records via email_id
const { data: senderCorrections } = await supabase
  .from("email_classification_feedback")
  .select("id, email_records!inner(sender_email)")
  .eq("email_records.sender_email", senderEmail);

const senderCount = senderCorrections?.length || 0;

if (senderCount >= 2) {
  // Auto-create sender rule if it doesn't exist
  await upsertRule(supabase, {
    organization_id: orgId,
    rule_type: "sender_email",
    rule_value: senderEmail,
    project_id: correctProjectId,
    classification: newClassification,
    confidence_boost: 0.15,
  });
}

// Check for keyword auto-rules (3 corrections with same keyword in subject)
const subjectKeywords = extractKeywords(subject);
for (const keyword of subjectKeywords) {
  const { data: kwCorrections } = await supabase
    .from("email_classification_feedback")
    .select("id, email_records!inner(subject)")
    .ilike("email_records.subject", `%${keyword}%`);

  const kwCount = kwCorrections?.length || 0;

  if (kwCount >= 3) {
    await upsertRule(supabase, {
      organization_id: orgId,
      rule_type: "subject_keyword",
      rule_value: keyword,
      project_id: correctProjectId,
      classification: newClassification,
      confidence_boost: 0.10,
    });
  }
}
```

- [ ] **Step 3: Read email-classifier.ts and prompts.ts**

Read both files to understand the L3 prompt and response parsing.

- [ ] **Step 4: Enrich the L3 classification prompt**

In `prompts.ts`, update the email classification prompt to add a `signals` field to the expected output:

```
In addition to classification, extract any signals you detect:
- prices_detected: any prices mentioned with description and unit
- deadlines_detected: any deadlines or delivery dates mentioned
- supplier_match: name of supplier if identifiable
- delay_detected: true if the email mentions a delay or postponement
- order_confirmation: true if this is an order confirmation
```

- [ ] **Step 5: Parse enriched signals in email-classifier.ts**

Update the JSON parsing in `classifyEmail()` to extract the `signals` field from Claude's response. Store signals in the `email_records` table (in `suggested_project_data` JSONB field which already exists).

- [ ] **Step 6: Read mail/page.tsx for reclassification trigger**

Read `apps/web/src/app/[locale]/(app)/mail/page.tsx` to find where reclassification happens.

- [ ] **Step 7: Wire reclassification to learning**

When a user reclassifies an email in the mail page, call the learning API:

```typescript
// After successful reclassification
await fetch("/api/email/learn", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email_id: email.id,
    action: "correct",
    new_project_id: selectedProjectId,
    new_classification: selectedClassification,
  }),
}).catch(() => {});
```

Check if this call already exists. If it does, ensure it passes the right parameters for the enhanced learning logic.

- [ ] **Step 8: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 9: Commit**

```bash
git add packages/core/src/emails/classification-learning.ts packages/core/src/ai/email-classifier.ts packages/core/src/ai/prompts.ts apps/web/src/app/\[locale\]/\(app\)/mail/page.tsx
git commit -m "feat(emails): auto-create classification rules and extract enriched signals from L3"
```

---

## Task 9: C2 Data Injection (Budget + Briefing + Suppliers)

> **Inject cross-org market data (C2) into the user experience: market price annotations in budget estimates, market trends in daily briefing, and market scores on supplier pages.**

**Files:**
- Modify: `apps/web/src/app/api/submissions/[id]/estimate-budget/route.ts`
- Modify: `packages/core/src/briefing/briefing-generator.ts`

**Context:** C2 tables exist (`market_benchmarks`, `supplier_market_scores`, `regional_price_index`) and are populated by the CRON aggregation. They're behind opt-in (`aggregation_consent`). This task injects their data into user-facing features.

**Budget:** Next to each price line, show "Marché romand : 280-350 CHF/m³ (12 entreprises)" if opt-in active.

**Briefing:** Add "Tendances marché" section: "Prix béton Suisse romande +4.2% ce trimestre".

- [ ] **Step 1: Read estimate-budget route**

Already read in Task 4. Focus on where to add C2 annotations.

- [ ] **Step 2: Add C2 market annotations to budget items**

After computing prices, for organizations with opt-in:

```typescript
// Check opt-in — aggregation_consent has per-row structure: (organization_id, module, opted_in)
const { data: priceConsent } = await (admin as any)
  .from("aggregation_consent")
  .select("opted_in")
  .eq("organization_id", orgId)
  .eq("module", "prix")
  .maybeSingle();

const hasPriceOptIn = priceConsent?.opted_in === true;

if (hasPriceOptIn) {
  // For each budget item, fetch market benchmark if available
  for (const item of itemsWithPrices) {
    if (item.cfc_code) {
      const { data: benchmark } = await (admin as any)
        .from("market_benchmarks")
        .select("median_price, p25_price, p75_price, contributors_count, region, quarter")
        .eq("cfc_code", item.cfc_code)
        .order("quarter", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (benchmark) {
        item.market_benchmark = {
          p25: benchmark.p25_price,
          median: benchmark.median_price,
          p75: benchmark.p75_price,
          contributors: benchmark.contributors_count,
          region: benchmark.region,
          quarter: benchmark.quarter,
        };
      }
    }
  }
}
```

- [ ] **Step 3: Read briefing-generator.ts**

Read `packages/core/src/briefing/briefing-generator.ts` to find where to add C2 trends.

- [ ] **Step 4: Inject C2 trends into briefing prompt**

In `generateBriefingAI()`, after collecting project data:

```typescript
// Fetch regional trends if opt-in
// Check consent: aggregation_consent has per-row (organization_id, module, opted_in)
const { data: priceConsent } = await supabase
  .from("aggregation_consent")
  .select("opted_in")
  .eq("organization_id", orgId)
  .eq("module", "prix")
  .maybeSingle();

let marketTrends = "";
if (priceConsent?.opted_in) {
  const { data: trends } = await supabase
    .from("regional_price_index")
    .select("region, basket_index, trend_pct, period")
    .order("period", { ascending: false })
    .limit(5);

  if (trends?.length) {
    marketTrends = "\n\nTendances marché récentes:\n" +
      trends.map(t => `- ${t.region}: ${t.trend_pct > 0 ? "+" : ""}${t.trend_pct}% (${t.period})`).join("\n");
  }
}
```

Add `marketTrends` to the prompt context.

- [ ] **Step 5: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/submissions/\[id\]/estimate-budget/route.ts packages/core/src/briefing/briefing-generator.ts
git commit -m "feat(c2): inject market benchmarks in budget estimates and briefing"
```

---

## Task 10: Intelligence Score + Dashboard

> **Create a maturity score component (5 dimensions: Prix, Plans, Planning, Emails, Fournisseurs) and an intelligence dashboard showing org + market counters.**

**Files:**
- Create: `apps/web/src/components/app/IntelligenceScore.tsx`
- Create: `apps/web/src/components/app/IntelligenceDashboard.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/dashboard/page.tsx`

**Context (Section 9.5):** Score computed from real table counts:

| Dimension | Source tables | Max points |
|-----------|-------------|------------|
| Prix | `offer_line_items` + `price_calibrations` count | 20 |
| Plans | `plan_analyses` count | 20 |
| Planning | `planning_duration_corrections` count | 20 |
| Emails | `email_classification_feedback` count | 20 |
| Fournisseurs | `suppliers` + `supplier_offers` count | 20 |

Score formula per dimension: `min(20, count / threshold * 20)` where threshold varies (e.g., 50 prices for max, 10 plans for max, 5 planning corrections for max, 100 emails for max, 20 suppliers for max).

- [ ] **Step 1: Create IntelligenceScore component**

```tsx
// apps/web/src/components/app/IntelligenceScore.tsx
"use client";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress"; // shadcn

interface ScoreDimension {
  label: string;
  score: number; // 0-20
  count: number;
  threshold: number;
  icon: string;
}

export function IntelligenceScore() {
  const [dimensions, setDimensions] = useState<ScoreDimension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/usage-stats") // Reuse existing or create new
      .then(r => r.json())
      .then(data => {
        setDimensions([
          { label: "Prix", score: Math.min(20, (data.prices || 0) / 50 * 20), count: data.prices || 0, threshold: 50, icon: "💰" },
          { label: "Plans", score: Math.min(20, (data.plans || 0) / 10 * 20), count: data.plans || 0, threshold: 10, icon: "📐" },
          { label: "Planning", score: Math.min(20, (data.planningCorrections || 0) / 5 * 20), count: data.planningCorrections || 0, threshold: 5, icon: "📅" },
          { label: "Emails", score: Math.min(20, (data.emailFeedback || 0) / 100 * 20), count: data.emailFeedback || 0, threshold: 100, icon: "📧" },
          { label: "Fournisseurs", score: Math.min(20, (data.suppliers || 0) / 20 * 20), count: data.suppliers || 0, threshold: 20, icon: "🏢" },
        ]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalScore = Math.round(dimensions.reduce((s, d) => s + d.score, 0));

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-sm">Score Intelligence IA</h3>
        <span className="text-2xl font-bold">{totalScore}/100</span>
      </div>
      <div className="space-y-3">
        {dimensions.map(d => (
          <div key={d.label} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{d.label}</span>
              <span className="text-muted-foreground">{d.count}/{d.threshold}</span>
            </div>
            <Progress value={d.score / 20 * 100} className="h-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create IntelligenceDashboard component**

A dashboard widget combining:
- IntelligenceScore (left)
- Org counters: total prices, plans analyzed, projects calibrated, emails classified (right top)
- C2 counters if opted in: collective prices, evaluated suppliers, market trends (right bottom)
- Learning journal: last 5 improvements (from `quantity_corrections`, `price_calibrations`, `email_classification_feedback` recent entries)

- [ ] **Step 3: Read dashboard/page.tsx**

Read `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` to find where to insert the widget.

- [ ] **Step 4: Add IntelligenceDashboard to the dashboard page**

Insert below existing KPI cards, before the project list.

- [ ] **Step 5: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/app/IntelligenceScore.tsx apps/web/src/components/app/IntelligenceDashboard.tsx apps/web/src/app/\[locale\]/\(app\)/dashboard/page.tsx
git commit -m "feat: add intelligence score and learning dashboard on main dashboard"
```

---

## Task 11: Monte Carlo Simulation

> **Add a client-side Monte Carlo simulation (10K iterations) to the Budget IA tab, showing a probability distribution histogram and P50/P80/P95 confidence intervals.**

**Files:**
- Create: `apps/web/src/components/submissions/MonteCarloChart.tsx`
- Modify: `apps/web/src/app/api/submissions/[id]/estimate-budget/route.ts`
- Modify: `apps/web/src/app/[locale]/(app)/submissions/[id]/page.tsx`

**Context (Section 9.1):** For each budget item, simulate:
```
quantité ~ Normal(médiane_consensus, écart_type_consensus)
prix     ~ Normal(médiane_prix, écart_type_prix)
total    = Σ(quantité_i × prix_i)
```

Std dev by source:
- Tier 1 (historique ≥5 prix) → observed std dev
- Tier 5 (CRB) → (max - min) / 4
- Tier 6 (IA) → median × 0.20

The route must return variance data per item: `{ std_dev_prix, std_dev_quantite, source_tier }`.

- [ ] **Step 1: Add variance data to estimate-budget response**

In the budget route, for each item compute and return:
```typescript
item.variance = {
  std_dev_prix: computeStdDev(item.source, item.p25, item.p75, item.prix_median),
  std_dev_quantite: item.quantite * 0.10, // 10% default qty uncertainty
  source_tier: item.source,
};
```

Where `computeStdDev`:
- Tier historique_interne with ≥5 prices: use actual std dev from candidates
- Tier referentiel_crb: `(p75 - p25) / 1.35` (IQR to std dev)
- Tier prix_non_disponible (IA): `median * 0.20`

- [ ] **Step 2: Create MonteCarloChart component**

```tsx
// Pure client-side, no API calls needed
// 1. Box-Muller transform for normal random
// 2. 10K iterations: for each iteration, sample qty and prix for each item, sum totals
// 3. Build histogram (50 bins) from results
// 4. Calculate P50, P80, P95 from sorted results
// 5. Identify top 3 uncertainty contributors
// 6. Render: Recharts AreaChart + annotations + uncertainty table
```

Key implementation details:
- Pure JavaScript, runs in <100ms for up to 200 items
- For >200 items, suggest Web Worker (but likely unnecessary for construction budgets)
- Box-Muller transform: `sqrt(-2*ln(u1)) * cos(2*PI*u2)` for normal distribution
- Histogram: divide min-max range into 50 bins, count frequency

- [ ] **Step 3: Integrate MonteCarloChart in submissions page**

Add a "Simulation Monte Carlo" section below the budget items table in the Budget IA tab. Only show when budget data includes variance info.

- [ ] **Step 4: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/submissions/MonteCarloChart.tsx apps/web/src/app/api/submissions/\[id\]/estimate-budget/route.ts apps/web/src/app/\[locale\]/\(app\)/submissions/\[id\]/page.tsx
git commit -m "feat(prix): Monte Carlo budget simulation with P50/P80/P95 confidence intervals"
```

---

## Task 12: Intelligent Alerts + Executive Summary

> **Create an AI-powered alerts route that generates proactive budget/planning warnings. Add an executive summary generator that produces a one-page PDF-exportable report.**

**Files:**
- Create: `apps/web/src/app/api/ai/generate-alerts/route.ts`
- Create: `apps/web/src/app/api/ai/executive-summary/route.ts`
- Create: `apps/web/src/components/ui/IntelligentAlerts.tsx`

**Context (Section 9.3-9.4):**

**Alerts:** After each estimation/planning, Claude analyzes the full context and produces structured alerts:
- Budget: abnormal prices, market trends, recommended suppliers
- Planning: critical path risks, weather/seasonal risks, fast-tracking opportunities

**Executive Summary:** One-page document with:
- Budget (estimate, P80, confidence, market positioning)
- Planning (duration, delivery date, critical path)
- Top 3 risks + top 3 opportunities
- Intelligence score (data volume used)

- [ ] **Step 1: Create generate-alerts route**

```typescript
// POST /api/ai/generate-alerts
// Body: { project_id, estimation_data?, planning_data? }
// Returns: { alerts: [{ severity, category, title, description, action }] }
```

Use Claude Haiku (cheaper, sufficient for structured alerts). Prompt with the estimation/planning data and ask for JSON array of alerts with severity (red/yellow/green), category (budget/planning/supplier), and actionable recommendation.

Add auth + org check + `checkUsageLimit()`.

- [ ] **Step 2: Create IntelligentAlerts component**

```tsx
// Renders alert cards sorted by severity
// Red = must-address, Yellow = attention, Green = opportunity
// Each card: icon, title, description, action button (optional)
```

- [ ] **Step 3: Create executive-summary route**

```typescript
// POST /api/ai/executive-summary
// Body: { project_id, include_budget?: boolean, include_planning?: boolean }
// Returns: { summary: { budget, planning, risks[], opportunities[], intelligence_score, generated_at } }
```

Use Claude Sonnet for quality. Collect all project data (estimation, planning, submissions status) and generate a comprehensive summary.

Add auth + org check + `checkUsageLimit()`.

- [ ] **Step 4: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/ai/generate-alerts/route.ts apps/web/src/app/api/ai/executive-summary/route.ts apps/web/src/components/ui/IntelligentAlerts.tsx
git commit -m "feat(ai): intelligent alerts and executive summary generation"
```

---

## Task 13: Planning — Dependency Rules Activation

> **Activate the 18+ intra-phase dependency rules from `dependency-rules.ts` in the planning generator. After generating tasks, scan CFC pairs and create dependencies. Recalculate CPM.**

**Files:**
- Modify: `packages/core/src/planning/planning-generator.ts`

**Context (Section 7.2):** `dependency-rules.ts` defines 18+ rules with 4 dependency types (FS, SS, FF, SF) and lag values. These rules map CFC code pairs to dependencies. The generator currently creates only sequential phase dependencies (phase N → phase N+1, FS lag 0). This task adds intra-phase dependencies based on CFC matches.

The expected impact: planning duration goes from ~118 days (optimistic, parallel everything) to ~145-160 days (realistic, with drying times, sequencing, etc.).

- [ ] **Step 1: Read planning-generator.ts**

Read `packages/core/src/planning/planning-generator.ts` to find where dependencies are created (after task generation, before CPM).

- [ ] **Step 2: Read dependency-rules.ts**

Read `packages/core/src/planning/dependency-rules.ts` to understand the lookup API (`findDependenciesFrom`, `findDependenciesTo`).

- [ ] **Step 3: Add intra-phase dependency injection**

After generating tasks and before CPM calculation, add:

```typescript
import { findDependenciesFrom } from "./dependency-rules";

// For each task pair within the same phase or across phases
for (const task of allTasks) {
  const cfcCode = task.cfc_code;
  if (!cfcCode) continue;

  const rules = findDependenciesFrom(cfcCode);
  for (const rule of rules) {
    // Find tasks with matching successor CFC
    const successors = allTasks.filter(t =>
      t.cfc_code && (t.cfc_code === rule.successor_cfc || t.cfc_code.startsWith(rule.successor_cfc))
    );

    for (const successor of successors) {
      if (successor.id === task.id) continue; // Skip self

      dependencies.push({
        predecessor_id: task.id,
        successor_id: successor.id,
        dependency_type: rule.type, // FS, SS, FF, SF
        lag_days: rule.lag_days,
        source: "rule",
      });
    }
  }
}

// Recalculate CPM with new dependencies
const cpmResult = calculateCriticalPath(allTasks, dependencies);
```

- [ ] **Step 4: Handle duplicate/conflicting dependencies**

Before adding a rule-based dependency, check if a phase-level dependency already exists between the same tasks. Rule-based dependencies should be additive (they can coexist with phase dependencies, CPM takes the most constraining).

- [ ] **Step 5: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/planning/planning-generator.ts
git commit -m "feat(planning): activate 18+ CFC dependency rules in planning generator"
```

---

## Task 14: Planning — Claude IA Validation Pass

> **After algorithmic planning generation (with dependencies), add a Claude validation pass that reviews the full planning and suggests duration corrections, missing dependencies, risks, and optimizations.**

**Files:**
- Modify: `apps/web/src/app/api/planning/generate/route.ts`
- Modify: `packages/core/src/planning/planning-generator.ts`

**Context (Section 7.1):** After the generator produces a complete planning (phases, tasks, durations, dependencies, CPM), send it to Claude Sonnet for validation.

**Input to Claude:** Full planning + project context (budget, surface, trades) + org historical data (avg duration overrun ratios from `planning_duration_corrections`)

**Output (structured JSON):**
1. `duration_corrections[]` — tasks with unrealistic duration + corrected duration + justification
2. `missing_dependencies[]` — SS/FF/SF links that should exist
3. `risks[]` — 3-5 risks with probability and impact in days
4. `recommendations[]` — optimizations (overlaps, fast-tracking, anticipations)
5. `summary` — natural language paragraph

Corrections are applied automatically, then CPM is recalculated.

- [ ] **Step 1: Read the planning generate route**

Read `apps/web/src/app/api/planning/generate/route.ts`.

- [ ] **Step 2: Add Claude validation after generation**

After the generator returns the planning, call Claude:

```typescript
const validationPrompt = `Tu es un expert en planification de chantier suisse.
Voici un planning généré automatiquement pour un projet de construction.

${JSON.stringify({
  phases: planning.phases.map(p => ({ name: p.name, tasks: p.tasks.length })),
  tasks: planning.tasks.map(t => ({ id: t.id, name: t.name, duration: t.duration_days, cfc: t.cfc_code })),
  dependencies: planning.dependencies.length,
  total_duration: planning.calculated_end_date,
  critical_path: planning.critical_path,
})}

Contexte projet: budget ${budget} CHF, ${surface} m², ${trades} corps de métier.
${orgCorrections ? `Historique org: ratio moyen de dépassement ${avgOverrun}×` : "Pas d'historique org."}

Analyse et retourne un JSON avec:
- duration_corrections: [{task_id, current_duration, corrected_duration, reason}]
- missing_dependencies: [{from_task, to_task, type, lag_days, reason}]
- risks: [{title, probability, impact_days, mitigation}]
- recommendations: [{title, description, impact}]
- summary: string (paragraphe en français)`;
```

Parse the response and apply corrections.

- [ ] **Step 3: Apply corrections and recalculate CPM**

```typescript
// Apply duration corrections
for (const correction of validation.duration_corrections) {
  const task = tasks.find(t => t.id === correction.task_id);
  if (task) {
    task.ai_duration_correction = correction.corrected_duration - task.duration_days;
    task.duration_days = correction.corrected_duration;
    task.ai_risks = correction.reason;
  }
}

// Add missing dependencies
for (const dep of validation.missing_dependencies) {
  dependencies.push({
    predecessor_id: dep.from_task,
    successor_id: dep.to_task,
    dependency_type: dep.type,
    lag_days: dep.lag_days,
    source: "ai",
  });
}

// Recalculate CPM
const finalCpm = calculateCriticalPath(tasks, dependencies);

// Store AI summary and recommendations
planning.ai_summary = validation.summary;
planning.ai_recommendations = validation.recommendations;
planning.ai_risks = validation.risks;
```

- [ ] **Step 4: Add `checkUsageLimit()` to the route**

Since this calls Claude, add usage limit enforcement.

- [ ] **Step 5: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/planning/generate/route.ts packages/core/src/planning/planning-generator.ts
git commit -m "feat(planning): add Claude IA validation pass with duration corrections and risk analysis"
```

---

## Task 15: Planning — Calibration from Completed Projects

> **When a project reaches status `completed`, compare planned vs actual durations and store correction ratios in `planning_duration_corrections`. Future plannings use these org-specific ratios instead of generic CRB.**

**Files:**
- Modify: `apps/web/src/app/api/projects/[id]/route.ts`
- Modify: `packages/core/src/planning/duration-calculator.ts`

**Context (Section 7.3):** The `planning_duration_corrections` table exists (migration 055) but is never populated. When a project is completed:
1. Compare `planning_tasks.duration_days` (planned) vs actual duration (from project dates or manual input)
2. Calculate correction ratio per CFC code: `ratio = actual_duration / planned_duration`
3. Store in `planning_duration_corrections` (org-scoped)
4. `duration-calculator.ts` already reads org corrections in its first priority tier

The `duration-calculator.ts` already checks for org corrections before falling back to CRB ratios. We just need to populate the table.

- [ ] **Step 1: Read the projects/[id] route PATCH handler**

Read `apps/web/src/app/api/projects/[id]/route.ts` to find where `status` is updated.

- [ ] **Step 2: Add calibration trigger on status=completed**

When the project status changes to `completed`:

```typescript
if (body.status === "completed") {
  // Fire-and-forget: extract duration corrections
  extractPlanningCorrections(admin, id, profile.organization_id)
    .catch(err => console.error("[planning-calibration]", err));
}

async function extractPlanningCorrections(admin: any, projectId: string, orgId: string) {
  // 1. Get the project's planning
  const { data: planning } = await admin
    .from("project_plannings")
    .select("id")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!planning) return;

  // 2. Get planning tasks with their planned durations
  const { data: tasks } = await admin
    .from("planning_tasks")
    .select("id, cfc_code, duration_days, phase_id")
    .eq("planning_id", planning.id)
    .not("is_milestone", "eq", true);
  if (!tasks?.length) return;

  // 3. Get project actual dates
  const { data: project } = await admin
    .from("projects")
    .select("start_date, end_date")
    .eq("id", projectId)
    .single();
  if (!project?.start_date || !project?.end_date) return;

  const actualDays = Math.ceil(
    (new Date(project.end_date).getTime() - new Date(project.start_date).getTime()) / (1000 * 60 * 60 * 24)
  );
  const plannedDays = tasks.reduce((s, t) => s + (t.duration_days || 0), 0);
  const globalRatio = actualDays / Math.max(plannedDays, 1);

  // 4. Store per-CFC corrections (using global ratio as approximation)
  const cfcGroups = new Map<string, number[]>();
  for (const t of tasks) {
    if (!t.cfc_code) continue;
    const prefix = t.cfc_code.split(".")[0];
    if (!cfcGroups.has(prefix)) cfcGroups.set(prefix, []);
    cfcGroups.get(prefix)!.push(t.duration_days || 0);
  }

  for (const [cfc, durations] of cfcGroups) {
    // IMPORTANT: Read the actual planning_duration_corrections schema from migration 055
    // before writing. The table may have different column names (e.g. org_id, original_ratio).
    // Use INSERT with conflict handling matching the actual UNIQUE constraints.
    // If no unique constraint exists, check for existing row first then insert or update.
    const { data: existing } = await admin.from("planning_duration_corrections")
      .select("id")
      .eq("organization_id", orgId)
      .eq("cfc_code", cfc)
      .maybeSingle();

    const correctionData = {
      organization_id: orgId,
      cfc_code: cfc,
      original_ratio: 1.0,
      corrected_ratio: Math.round(globalRatio * 100) / 100,
    };

    if (existing) {
      await admin.from("planning_duration_corrections").update(correctionData).eq("id", existing.id);
    } else {
      await admin.from("planning_duration_corrections").insert(correctionData);
    }
  }
}
```

- [ ] **Step 3: Read duration-calculator.ts**

Read `packages/core/src/planning/duration-calculator.ts` to verify it already reads org corrections.

- [ ] **Step 4: Verify org corrections are read correctly**

The duration calculator should already prioritize org corrections over CRB. Verify the query matches the `planning_duration_corrections` table schema. If needed, fix column names.

- [ ] **Step 5: Verify type-check passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/projects/\[id\]/route.ts packages/core/src/planning/duration-calculator.ts
git commit -m "feat(planning): calibrate durations from completed projects into org corrections"
```

---

## Task 16: Update CLAUDE.md & Final Cleanup

> **Update project documentation with all new routes, components, and migration.**

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update CLAUDE.md**

Update the following sections:
- **Section 2** (Architecture): migrations count → 057
- **Section 6** (Routes): Add `/api/ai/generate-alerts`, `/api/ai/executive-summary`
- **Section 7** (Pages): Note intelligence dashboard on main dashboard
- **Section 8** (Components): Add `admin/` → IntelligenceScore, IntelligenceDashboard; `submissions/` → MonteCarloChart; `ui/` → IntelligentAlerts
- **Section 13** (État actuel): Update component count, mention Learning Engine, route count

Add new section **"22. Learning Engine (2026-03-19)"** documenting:
- 4 learning loops (Prix, Plans, Planning, Emails)
- C2 flywheel injection points
- Intelligence score dimensions
- Price Resolver V3 scoring formula
- Key files modified

- [ ] **Step 2: Verify the full build passes**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`
Expected: 0 new errors.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with Learning Engine routes, components, and migration 057"
```

---

## Summary: Commit Sequence

| # | Task | Commit Message |
|---|------|---------------|
| 1 | Migration 057 | `feat(db): add migration 057 for learning engine fields` |
| 2 | Auto-calibration + Attribuer | `feat(prix): fix auto-calibration bugs and add Attribuer button in ComparisonTab` |
| 3 | Price Resolver V3 | `feat(prix): price resolver V3 with multi-criteria scoring and inflation adjustment` |
| 4 | Price feedback UI | `feat(prix): add price feedback banner with accuracy stats and source distribution` |
| 5 | Consensus weights + thresholds | `feat(plans): dynamic model weights and adaptive discipline thresholds in consensus engine` |
| 6 | Bureau profiles | `feat(plans): inject bureau profiles into estimation pipeline after Passe 1` |
| 7 | Cross-plan + plans feedback | `feat(plans): wire cross-plan verification and enhance estimation feedback UI` |
| 8 | Classification + enriched signals | `feat(emails): auto-create classification rules and extract enriched signals from L3` |
| 9 | C2 injection | `feat(c2): inject market benchmarks in budget estimates and briefing` |
| 10 | Intelligence Score + Dashboard | `feat: add intelligence score and learning dashboard on main dashboard` |
| 11 | Monte Carlo | `feat(prix): Monte Carlo budget simulation with P50/P80/P95 confidence intervals` |
| 12 | Alerts + Exec summary | `feat(ai): intelligent alerts and executive summary generation` |
| 13 | Planning dependencies | `feat(planning): activate 18+ CFC dependency rules in planning generator` |
| 14 | Planning IA validation | `feat(planning): add Claude IA validation pass with duration corrections and risk analysis` |
| 15 | Planning calibration | `feat(planning): calibrate durations from completed projects into org corrections` |
| 16 | CLAUDE.md | `docs: update CLAUDE.md with Learning Engine routes, components, and migration 057` |
