# ADR-001 — 3D Viewer Phase 1 (2.5D Multi-Layer Visualization)

- **Status**: Accepted (CEO decision 2026-04-23, Path A)
- **Date**: 2026-04-23 (J+1 post-launch)
- **Deciders**: Julien Ray (CEO), CTO (author)
- **Related**: CEO-SYNTHESIS-3D-VISUALIZATION.md, PM-NOGO-REPORT-3D.md, UIX-3D-VIEWER.md, CFO-3D-ROI.md, RESEARCHER-3D-MARKET.md

---

## 1. Context

Post-launch (2026-04-22), Cantaia needs a differentiator vs CAD-centric Swiss competitors (Messerli, Allplan, Vectorworks). The 5-agent synthesis landed on **3D visualization from existing 2D PDF plans** — not a full BIM editor, not a take-off engine.

The PM pushed **NO-GO** on grounds of SIA liability risk and accuracy (<70% on early tests). The CEO overrode NO-GO but locked three non-negotiables from the pushback:

1. **Positioning**: "Outil de visualisation" only, never "référentiel métré".
2. **Scope Phase 1**: Viewer-only — no commercial quantity take-off from 3D geometry.
3. **Exports/screenshots**: Watermarked "Vue indicative, non contractuelle".

We already run a production 4-pass Vision-AI pipeline (Claude + GPT-4o + Gemini consensus) for plan identification → métré → verification → chiffrage. Phase 1 extends this with a **5th optional pass** (Topology) that produces a structured `BuildingScene` IR, renders client-side via React Three Fiber. Phase 2 (full 3D) and Phase 3 (networks/MEP) gated on Phase 1 metrics.

## 2. Decision

**Build Phase 1 as an additive, feature-gated extension.** Do not touch the 4-pass pipeline behavior. Introduce:

- A new `BuildingScene` JSON IR (schema-versioned, stored in `plan_scenes`).
- A 5th optional pipeline pass (`runPasse5Topology`) — fires only when `visualization3d` feature is enabled AND the user requests it.
- Client-side rendering (R3F + drei + glTF 2.0) — zero GPU on Vercel.
- Feature flag `visualization3d` in `packages/config/plan-features.ts` — **Pro+** (quota 20 extractions/user/month), **Enterprise** for unthrottled + Phase 2 preview.
- Quota enforcement via existing `checkUsageLimit()` + `api_usage_logs` (new action type `plan_3d_extract`).
- Watermark enforced server-side in the export route — not a client-side toggle.

## 3. Consequences

**Positive**
- Marketing differentiator without abandoning the 2D pipeline that works.
- Incremental — we can kill Phase 2 if Phase 1 metrics fail (see §7).
- Extraction is async, rendering is free (client GPU), so API cost scales with usage not concurrency.
- `BuildingScene` IR is a long-term asset: Phase 3 MEP, export to Allplan/Revit, and future BIM bridges all reuse it.

**Negative / Risks** (detailed in §5)
- **SIA liability**: mitigated by watermarks + UI disclaimers + T&Cs update + "no take-off" product stance. Legal review required before public Pro release.
- **API cost amplification**: Passe 5 adds ~1 Claude Vision call + 1 GPT-4o call per plan (consensus on topology). Modeled at ~CHF 0.40 / extraction — absorbed in Pro margin (CHF 89/user/month, 20 extractions cap).
- **Accuracy risk**: Early tests <70% on complex plans. Mitigated by (a) positioning as visualization not take-off, (b) correction UI (Phase 1.5), (c) gating Phase 2 on ≥80% user-rated "useful".
- **Bundle bloat**: R3F + drei + three ≈ 600KB gzipped. Mitigated by dynamic import — viewer page only.

## 4. Architecture

### 4.1 Flow diagram

```
                        ┌─────────────────────────────────────┐
                        │  PDF Plan (upload or email)         │
                        └──────────────┬──────────────────────┘
                                       │
                                       ▼
                ┌────────────────────────────────────────────────┐
                │  Existing 4-Pass Pipeline (UNCHANGED)          │
                │  Passe1 → Passe2 → Passe3 → Passe4             │
                │  (Claude+GPT4o+Gemini consensus for métré)     │
                └──────────────┬─────────────────────────────────┘
                               │
                               │  passes 1-4 results
                               ▼
                     ┌─────────────────────┐
                     │  Feature flag gate  │
                     │  visualization3d    │──── NO ──▶ stop (classic flow)
                     └──────────┬──────────┘
                                │ YES + user requested
                                ▼
                ┌────────────────────────────────────────────────┐
                │  Passe 5 — Topology (NEW, optional)            │
                │  Input: passe1 + passe2 + passe3 + image       │
                │  Output: BuildingScene IR (JSON)               │
                │  Consensus: Claude Vision + GPT-4o (Gemini     │
                │  as fallback if divergence > threshold)        │
                └──────────────┬─────────────────────────────────┘
                               │
                               ▼
             ┌──────────────────────────────────┐
             │  plan_scenes table               │
             │  (scene_data JSONB, versioned)   │
             └──────────────┬───────────────────┘
                            │
         ┌──────────────────┼──────────────────────────────┐
         ▼                  ▼                              ▼
 GET /api/plans/[id]   POST /corrections          GET /export-gltf
   /scene              (human in loop)            (watermarked)
         │
         ▼
   ┌──────────────────────────────────────────────────┐
   │  Next.js page /plans/[id]/3d                     │
   │  Dynamic import → R3F + drei                     │
   │  Renders BuildingScene client-side               │
   │  Watermark overlay on any screenshot/export      │
   └──────────────────────────────────────────────────┘
```

### 4.2 BuildingScene IR schema (summary)

Full types in `packages/core/src/plans/scene/types.ts`:

```typescript
export interface BuildingScene {
  schema_version: "1.0.0";          // semver, bump on breaking changes
  plan_id: string;
  source_passes: { passe1_id: string; passe2_id: string; passe3_id: string };
  units: { length: "m"; angle: "deg" };
  bbox: { min: Vec3; max: Vec3 };
  levels: BuildingLevel[];
  annotations: Annotation[];
  networks: Network[];              // Phase 3 — empty [] in Phase 1
  provenance: SceneProvenance;      // global-level provenance
  extracted_at: string;             // ISO
}

export interface BuildingLevel {
  id: string;
  name: string;                     // "RDC", "1er", "Sous-sol"
  elevation_m: number;
  height_m: number;
  elements: BuildingElement[];
}

export type BuildingElement =
  | WallElement
  | SlabElement
  | OpeningElement     // doors + windows (discriminated by opening_type)
  | ColumnElement
  | BeamElement
  | RoofElement
  | StairElement;

// Shared provenance on every element
export interface ElementProvenance {
  confidence: number;               // 0..1, from consensus
  source_passes: string[];          // ["passe1", "passe2", "passe5"]
  model_consensus: {
    claude?: number;                // per-model confidence
    gpt4o?: number;
    gemini?: number;
  };
  human_corrected: boolean;
  corrected_by?: string;            // user_id
  corrected_at?: string;
}

export interface WallElement {
  id: string;
  type: "wall";
  start: Vec2;                       // 2.5D: footprint only in Phase 1
  end: Vec2;
  thickness_m: number;
  height_m: number;
  material?: "beton" | "brique" | "cloison_legere" | "unknown";
  provenance: ElementProvenance;
}
// ... (SlabElement, OpeningElement, etc. follow same pattern)

export interface Annotation {
  id: string;
  kind: "dimension" | "label" | "note";
  anchor: Vec2 | Vec3;
  text: string;
  level_id?: string;
  provenance: ElementProvenance;
}

export interface Network {
  id: string;
  kind: "electrical" | "hvac" | "plumbing" | "sprinkler";
  // Phase 3 — structure reserved but not populated in Phase 1
  segments: unknown[];
}
```

**Design notes**:
- 2.5D in Phase 1 = footprints extruded by `height_m`. No sloped walls, no slanted roofs beyond pitched extrusion. Phase 2 unlocks full 3D.
- Every element carries per-element `provenance` — this is the foundation for Phase 1.5 corrections and Phase 2's human-in-the-loop training data.
- `schema_version` is semver. Breaking changes → bump major, write migration for existing scenes.
- Networks[] is intentionally present but empty in Phase 1 to avoid a migration later.

### 4.3 Passe 5 Topology signature

```typescript
// packages/core/src/plans/estimation/pipeline.ts
export async function runPasse5Topology(
  passe1: Passe1Result,
  passe2: Passe2Result,
  passe3: Passe3Result,
  image_base64: string,
  media_type: string,
  options?: {
    model_weights?: Record<ModelProvider, number>;
    org_id: string;                // for api_usage_logs
    plan_id: string;
  }
): Promise<{
  scene: BuildingScene;
  tokens_used: number;
  duration_ms: number;
  model_divergence: number;        // 0..1
}>;
```

Prompt strategy (details in `prompts.ts`):
- Passe 5 system prompt seeded with `passe1` (plan type, discipline, échelle) + `passe2` quantities to ground dimensions.
- Claude Vision + GPT-4o Vision called in parallel.
- If model divergence > 0.3 on wall count or footprint area, fall back to Gemini as tiebreaker. Otherwise skip Gemini for cost.
- Output constrained to JSON matching `BuildingScene` v1.0.0 via JSON schema in prompt.
- Failures are non-fatal — Passe 5 returns `scene: null` and pipeline completes normally.

### 4.4 Data model

Migration `076_plan_scenes.sql` (note: 073, 074, 075 already used):

```sql
CREATE TABLE plan_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plan_registry(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  parent_scene_id UUID REFERENCES plan_scenes(id) ON DELETE SET NULL,
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  scene_data JSONB NOT NULL,
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','processing','completed','failed')),
  confidence_score NUMERIC(4,3),              -- 0..1, global
  model_divergence NUMERIC(4,3),
  error_message TEXT,
  extracted_by UUID REFERENCES users(id),
  extracted_at TIMESTAMPTZ,
  tokens_used INTEGER,
  cost_chf NUMERIC(10,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plan_scenes_plan ON plan_scenes(plan_id);
CREATE INDEX idx_plan_scenes_org ON plan_scenes(organization_id);
CREATE INDEX idx_plan_scenes_status ON plan_scenes(extraction_status);
CREATE INDEX idx_plan_scenes_data_gin ON plan_scenes USING GIN (scene_data jsonb_path_ops);

CREATE TABLE plan_scene_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES plan_scenes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  element_id TEXT NOT NULL,                   -- BuildingElement.id within scene_data
  correction_type TEXT NOT NULL
    CHECK (correction_type IN ('geometry','material','opening_type','level_assignment','delete','add')),
  original_value JSONB,
  corrected_value JSONB NOT NULL,
  corrected_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_scene_corrections_scene ON plan_scene_corrections(scene_id);

-- RLS
ALTER TABLE plan_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_scene_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_scenes_org_rw ON plan_scenes
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY plan_scene_corrections_org_rw ON plan_scene_corrections
  FOR ALL USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );
```

### 4.5 API routes

| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/plans/[id]/scene` | GET | org RLS | Fetch latest completed scene for a plan. 404 if none. |
| `/api/scenes/extract` | POST | org + `canAccess("visualization3d")` + `checkUsageLimit("plan_3d_extract")` | Kick off Passe 5. Returns `{scene_id, status: "processing"}`. Uses Next 15 `after()` for async. |
| `/api/scenes/[id]` | GET | org RLS | Poll status + return scene when ready. |
| `/api/scenes/[id]/corrections` | POST | org RLS | Persist a user correction; invalidates `human_corrected` on the target element. |
| `/api/scenes/[id]/export-gltf` | GET | org RLS + `canAccess("export")` | Server-side glTF generation with **baked watermark**. |

All routes follow existing patterns: `createClient()` for user-scoped, `createAdminClient()` for privileged operations, RLS enforced.

### 4.6 Client rendering

- New page `apps/web/src/app/[locale]/(app)/plans/[id]/3d/page.tsx` — **server component** shell.
- Viewer component `components/plans/scene3d/SceneViewer.tsx` — **client component** with `dynamic(() => import("./SceneCanvas"), { ssr: false })`.
- `SceneCanvas.tsx` is the R3F canvas itself — never bundled in SSR, never in any other page.
- Watermark overlay is a `<Html>` drei element, rasterized into every screenshot via `html2canvas`.
- i18n: FR/EN/DE via `useTranslations("plans.scene3d")`.

## 5. Risk register

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| R1 | **SIA liability** — user uses 3D for contractual decisions, sues Cantaia for inaccuracy | CRITICAL | MEDIUM | Watermarks server-baked on all exports; UI disclaimers; T&Cs update before Pro GA; product positioning enforced at marketing level (no "metré", "take-off" keywords). Legal sign-off milestone in M6. |
| R2 | **API cost amplification** — Passe 5 runs on every plan | HIGH | HIGH | Gated: feature flag + per-user quota 20/month + explicit user-triggered only (no auto-run on sync). CFO model: CHF 0.40 avg × 20 = CHF 8/user/month, ~10% of Pro ARPU. |
| R3 | **Accuracy <70%** — user trust collapse | HIGH | HIGH | Position as visualization not ground-truth. Phase 1.5 correction UI. Go/no-go gate at 80% user-rated "useful" before Phase 2 spend. |
| R4 | **Extraction latency** — p95 > 90s frustrates users | MEDIUM | MEDIUM | Async via `after()`; toast "Extraction lancée" + polling UI + email on complete (reuse briefing email infra). |
| R5 | **Bundle bloat** — R3F on every page | MEDIUM | LOW | Dynamic import scoped to 3D page only. Monitored via `@next/bundle-analyzer` in CI. |
| R6 | **Pipeline regression** — Passe 5 breaks 4-pass behavior | HIGH | LOW | Passe 5 is opt-in, wrapped in its own try/catch, never mutates passe1-4 outputs. Integration tests assert 4-pass output bitwise identical with Passe 5 off. |
| R7 | **Correction race conditions** — multiple users edit same scene | LOW | LOW | `plan_scene_corrections` is append-only; UI renders latest per-element. Acceptable for Phase 1. |
| R8 | **Swiss data residency** — glTF uploaded to CDN outside CH | LOW | LOW | glTF served from same Supabase project (eu-central-1). No third-party CDN. |
| R9 | **Model drift** (Claude/GPT-4o/Gemini update degrades output) | MEDIUM | MEDIUM | Pin model versions in `ai-clients.ts`. Weekly canary extraction on 5 reference plans; alert if confidence drops >10%. |

## 6. Dependencies

### 6.1 New npm packages (apps/web)
- `three` (pinned to `^0.162.0` — matches drei stable)
- `@react-three/fiber` `^8.16.0`
- `@react-three/drei` `^9.105.0`
- `html2canvas` `^1.4.1` (screenshot + watermark bake)

### 6.2 New npm packages (packages/core)
- None. Reuses existing `@anthropic-ai/sdk`, `openai`, `@google/generative-ai`.

### 6.3 `next.config.ts` updates
- Add `three`, `@react-three/fiber`, `@react-three/drei` to `transpilePackages` — R3F ESM-only, needs transpile in Next.
- No `serverExternalPackages` changes.

### 6.4 Bundle impact
- R3F + drei + three ≈ **~600 KB gzipped** on the 3D page only.
- Global bundle: unchanged (verified via dynamic import).
- Budget: 3D page initial JS ≤ 1.2 MB gzipped. Enforced in CI via `next build` size check.

### 6.5 `packages/config/plan-features.ts` changes

Add to `FeatureName`:
```typescript
export type FeatureName =
  | "budgetAI" | "planning" | "dataIntel" | "branding" | "export"
  | "visualization3d";            // NEW
```

Add to `PlanLimits`:
```typescript
visualization3d: false | "preview" | "full";
max3dExtractionsPerMonth: number;
```

Per-plan values:
- trial: `false`, 0
- starter: `false`, 0
- pro: `"preview"` (Phase 1 only, no Phase 2 when launched), 20
- enterprise: `"full"` (Phase 1 + Phase 2 when launched), Infinity

## 7. Go/no-go criteria for Phase 2

Phase 2 (full 3D, not 2.5D) is **conditional** on Phase 1 metrics measured at **week 10 post-release** (so, ~week 22 from kickoff):

| Metric | Threshold | Source |
|--------|-----------|--------|
| % Pro+ orgs activating 3D viewer at least once | ≥ 40% | `api_usage_logs` action=`plan_3d_extract` |
| Average confidence_score on completed scenes | ≥ 0.72 | `plan_scenes.confidence_score` |
| User-rated "useful" on in-app survey | ≥ 80% | new feedback widget in SceneViewer |
| Avg API cost per extraction | ≤ CHF 0.50 | `api_usage_logs.cost_chf` |
| Correction rate (corrections per scene) | ≤ 5 | `plan_scene_corrections` count |
| Extraction p95 latency | ≤ 90s | `api_usage_logs.duration_ms` |

Any 2 red → **no Phase 2 spend**, pivot to Phase 1.5 (corrections UI polish) only.

## 8. Phased implementation — 12 weeks

Dev A = backend-heavy (pipeline, API, DB). Dev B = frontend-heavy (R3F, UX, i18n).

| Week | Dev A (backend) | Dev B (frontend) | Milestone |
|------|-----------------|------------------|-----------|
| 1 | `BuildingScene` types + schema validation (`zod`). Migration 076 drafted. | R3F spike: render a hardcoded BuildingScene in a throwaway page. | Schema frozen v1.0.0 |
| 2 | Passe 5 prompts + `ai-clients` wiring. Unit tests on IR shape. | `SceneViewer` + `SceneCanvas` skeleton. Camera/lighting/grid. | Fixture scene renders |
| 3 | `runPasse5Topology` implemented. Pipeline integration (opt-in flag). | Wall/slab/opening primitives as R3F components. | E2E: fixture → render |
| 4 | Migration 076 applied on staging. `plan_scenes` RLS verified. | Level toggling, section cuts, basic nav. | Staging DB live |
| 5 | `POST /api/scenes/extract` + `after()` async. `api_usage_logs` wired. | Extraction-status UX: loading, error, retry. | First real extract |
| 6 | `GET /api/scenes/[id]` + polling. Cost tracking. | Watermark overlay. Screenshot bake via html2canvas. | Watermark validated |
| 7 | `POST /corrections` endpoint. Element-level patch logic. | Correction UI: click element → edit panel → save. | Human-in-loop works |
| 8 | glTF export (server-side, watermarked texture baked). | `export-gltf` button, download flow. | Export validated |
| 9 | Feature flag + `canAccess` + `checkUsageLimit` integration. | Plan features UI (lock states, upgrade CTA). | Gating live |
| 10 | QA pass: reference plans, tolerance tests (§9). | Polish: animations, keyboard nav, accessibility. | QA green |
| 11 | Legal review pass. T&Cs updated. Monitoring dashboards. | In-app feedback widget for user-rated "useful". | Legal sign-off |
| 12 | Soft-launch to 5 Enterprise pilot orgs. Monitor metrics. | Doc page + onboarding tour for 3D. | Pilot live |

Critical path: W1-W3 (schema + Passe 5) blocks everything else. Dev A cannot slip W3.

## 9. QA strategy

### 9.1 Reference plan set
- 10 reference plans selected: 4 residential, 3 commercial, 2 industrial, 1 renovation.
- Each plan has a hand-verified BuildingScene "ground truth" (levels, elements counts, major dimensions).
- CI job runs Passe 5 on the 10 plans nightly on a fixed pin, compares to ground truth, alerts on drift >10%.

### 9.2 Tolerance thresholds per CFC discipline

| Discipline | Wall count | Opening count | Footprint area | Height |
|------------|------------|---------------|----------------|--------|
| Structural (212-214) | ±5% | ±10% | ±3% | ±2% |
| Enveloppe (213-214) | ±10% | ±5% | ±5% | ±5% |
| Finitions (271-285) | ±15% | ±15% | ±8% | ±8% |

Elements outside tolerance auto-flagged `confidence < 0.5`.

### 9.3 Regression tests
- Jest suite assertions: 4-pass pipeline output is **byte-identical** with and without Passe 5 enabled.
- Snapshot tests on 3 reference scenes for rendering stability.

## 10. Monitoring

New metrics in Sentry + `api_usage_logs`:

- `plan_3d_extract.duration_ms` — histogram, p50/p95/p99.
- `plan_3d_extract.confidence_score` — distribution.
- `plan_3d_extract.cost_chf` — sum per org per month.
- `plan_3d_extract.model_divergence` — histogram.
- `plan_3d_corrections_per_scene` — mean.
- `plan_3d_bundle_size_kb` — CI build metric.
- Sentry breadcrumbs on every Passe 5 call with `plan_id`, `scene_id`, `org_id`.

Super-admin dashboard gets a new section "3D Viewer" under `/super-admin/ai-costs` with per-org breakdown.

## 11. Rollback plan

- Passe 5 is behind a feature flag in `plan-features.ts` AND a kill-switch env var `DISABLE_PASSE5=1` on Vercel. Either flip disables new extractions instantly; existing scenes remain viewable.
- Migration 076 is additive only — no changes to existing tables. Rollback = drop the two new tables.
- Client routes `/plans/[id]/3d` are behind `canAccess("visualization3d")`; setting that to false per plan hides the feature without a deploy.

## 12. Out of scope for Phase 1

- Sloped roofs beyond simple pitch extrusion.
- Curved walls.
- Furniture, fixtures, equipment (FF&E).
- MEP networks (Phase 3).
- Commercial metré recalculation from 3D geometry (**explicitly forbidden per CEO lock**).
- Real-time collaboration on a scene.
- Mobile/tablet rendering (Phase 2).
- AR/VR (out of roadmap).

---

## Alternatives rejected

- **Full BIM editor (Path B)**: 9-18 months, competes directly with Allplan, out of scope for a SaaS with <10 engineers.
- **IFC import only (Path C)**: assumes architects share IFC — they don't in CH market (<5% penetration per Researcher report).
- **Third-party viewer (Path D, e.g. Forge/APS)**: Autodesk lock-in, data residency issues, margin-negative at our price point.

---

## Files touched (summary)

Full implementation details; every file listed here is created or modified.

### packages/core
- `src/plans/scene/types.ts` — NEW — `BuildingScene` + all element types.
- `src/plans/scene/validator.ts` — NEW — zod schemas.
- `src/plans/scene/index.ts` — NEW — barrel export.
- `src/plans/estimation/pipeline.ts` — MODIFIED — optional Passe 5 hook.
- `src/plans/estimation/passe5-topology.ts` — NEW — `runPasse5Topology`.
- `src/plans/estimation/prompts.ts` — MODIFIED — add Passe 5 system + user prompts.
- `src/plans/estimation/ai-clients.ts` — MODIFIED — ensure JSON mode for Passe 5.

### packages/database
- `migrations/076_plan_scenes.sql` — NEW.

### packages/config
- `plan-features.ts` — MODIFIED — add `visualization3d`, `max3dExtractionsPerMonth`.

### apps/web
- `src/app/api/plans/[id]/scene/route.ts` — NEW.
- `src/app/api/scenes/extract/route.ts` — NEW.
- `src/app/api/scenes/[id]/route.ts` — NEW.
- `src/app/api/scenes/[id]/corrections/route.ts` — NEW.
- `src/app/api/scenes/[id]/export-gltf/route.ts` — NEW.
- `src/app/[locale]/(app)/plans/[id]/3d/page.tsx` — NEW.
- `src/components/plans/scene3d/SceneViewer.tsx` — NEW (client).
- `src/components/plans/scene3d/SceneCanvas.tsx` — NEW (R3F, dynamic-only).
- `src/components/plans/scene3d/WallMesh.tsx`, `SlabMesh.tsx`, `OpeningMesh.tsx`, `StairMesh.tsx` — NEW.
- `src/components/plans/scene3d/WatermarkOverlay.tsx` — NEW.
- `src/components/plans/scene3d/CorrectionPanel.tsx` — NEW.
- `src/components/plans/PlanEstimationTab.tsx` — MODIFIED — add "Voir en 3D" button gated on feature.
- `messages/fr.json`, `en.json`, `de.json` — MODIFIED — `plans.scene3d.*` keys.
- `next.config.ts` — MODIFIED — `transpilePackages` += three, R3F, drei.

### docs
- `docs/adr/001-3d-viewer-phase-1.md` — THIS FILE.
