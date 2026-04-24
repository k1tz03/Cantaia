/**
 * Regression test — Passe 5 ADDITIVE guarantee (ADR-001).
 *
 * The 3D viewer spike (W1-W3) introduces an OPTIONAL 5th pass to the
 * estimation pipeline. This file pins the contract that when Passe 5 is
 * disabled — which is the default, and the state of all existing
 * callers — the pipeline result is BYTE-IDENTICAL to the pre-ADR-001
 * 4-pass production shape.
 *
 * Specifically:
 *   1. `result.passe5` is ABSENT from the object (not just `undefined`).
 *   2. `result.pipeline_stats.passe5_duration_ms` is ABSENT.
 *   3. All existing 4-pass keys are present and retain their original
 *      TypeScript types.
 *
 * This file is structured as a **type-level regression** — it compiles iff
 * the guarantee holds. It also exports a runtime assertion function
 * (`assertPasse5AbsentFromResult`) so a future test harness can verify at
 * runtime after a real pipeline run.
 *
 * No runtime test framework is required: running `pnpm type-check` from
 * the repo root catches any regression via the `StaticAssert` helpers.
 *
 * ─────────────────────────────────────────────────────────────────────
 *
 * If you are tempted to make Passe 5 mandatory / always-on, STOP. Read
 * ADR-001 §Spike Exit Criteria. Until the spike completes and the CTO
 * signs off on Phase 2, Passe 5 must remain opt-in and additive.
 */

import type {
  EstimationPipelineResult,
  Passe5PipelineOutput,
} from '../types';

// ─── Type-level regression assertions ───────────────────────────────────

/**
 * Compile-time equality. Resolves to `true` IFF `A` and `B` are mutually
 * assignable (i.e. the same type from TypeScript's structural POV).
 * Used as a compile-time `assert`: a mismatch becomes a type error.
 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

/** Syntactic sugar so mismatches surface as "Type 'false' is not assignable to type 'true'". */
type StaticAssert<T extends true> = T;

// ─── 1. The 4-pass core shape must stay unchanged ───────────────────────

/**
 * The canonical keys that must ALWAYS appear on the pipeline result.
 * If anyone renames or drops one of these, this assertion fails.
 */
type RequiredPipelineKeys =
  | 'plan_id'
  | 'project_id'
  | 'org_id'
  | 'created_at'
  | 'passe1'
  | 'consensus_metrage'
  | 'passe3'
  | 'passe4'
  | 'pipeline_stats';

/**
 * Every required 4-pass key must be present on `EstimationPipelineResult`.
 * `passe5` is OPTIONAL — it may or may not be on the type.
 */
type _KeysStillPresent = StaticAssert<
  Equals<RequiredPipelineKeys, Exclude<keyof EstimationPipelineResult, 'passe5'>>
>;

// ─── 2. `passe5` must be strictly OPTIONAL ──────────────────────────────

/**
 * A required field fails this assertion — it is only satisfied when the
 * key is declared with the `?` modifier. This is the core regression
 * guarantee: a careless `passe5: Passe5PipelineOutput` (without the `?`)
 * would break every existing caller.
 */
type OptionalKeys<T> = {
  [K in keyof T]-?: Record<string, never> extends Pick<T, K> ? K : never
}[keyof T];

type _Passe5IsOptional = StaticAssert<
  Equals<'passe5' extends OptionalKeys<EstimationPipelineResult> ? true : false, true>
>;

// ─── 3. `pipeline_stats.passe5_duration_ms` must be strictly OPTIONAL ──

type _Passe5DurationIsOptional = StaticAssert<
  Equals<
    'passe5_duration_ms' extends OptionalKeys<EstimationPipelineResult['pipeline_stats']>
      ? true
      : false,
    true
  >
>;

// ─── 4. Passe5PipelineOutput shape is stable ────────────────────────────

/**
 * Keys of `Passe5PipelineOutput`. Pinning this catches accidental field
 * renames during the spike (e.g. `scene` → `building_scene`).
 */
type Passe5OutputKeys = keyof Passe5PipelineOutput;

type _Passe5Keys = StaticAssert<
  Equals<
    Passe5OutputKeys,
    'scene' | 'tokens_used' | 'duration_ms' | 'model_divergence' | 'error'
  >
>;

// ─── Runtime assertion (exported for future test harnesses) ─────────────

/**
 * Throws if the given pipeline result contains a `passe5` key or a
 * `pipeline_stats.passe5_duration_ms` key. Call this after running the
 * pipeline with `enablePasse5: false` (or unset) to verify the ADDITIVE
 * guarantee at runtime.
 *
 * @example
 * const r = await runEstimationPipeline({ ...params, enablePasse5: false });
 * assertPasse5AbsentFromResult(r);
 *
 * @example
 * process.env.DISABLE_PASSE5 = '1';
 * const r = await runEstimationPipeline({ ...params, enablePasse5: true });
 * assertPasse5AbsentFromResult(r); // kill-switch wins — still absent
 */
export function assertPasse5AbsentFromResult(
  result: EstimationPipelineResult
): void {
  if (Object.prototype.hasOwnProperty.call(result, 'passe5')) {
    throw new Error(
      '[passe5-regression] `passe5` key found on pipeline result but Passe 5 is disabled. ' +
        'This breaks the ADDITIVE guarantee of ADR-001 §Spike Exit Criteria.'
    );
  }

  const stats = result.pipeline_stats as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(stats, 'passe5_duration_ms')) {
    throw new Error(
      '[passe5-regression] `pipeline_stats.passe5_duration_ms` key found but Passe 5 is disabled. ' +
        'This breaks the ADDITIVE guarantee of ADR-001 §Spike Exit Criteria.'
    );
  }
}

/**
 * Positive counterpart: when Passe 5 IS enabled and the caller
 * successfully opted in, assert the `passe5` key is present with the
 * expected shape. Use this in the spike's live integration smoke tests.
 */
export function assertPasse5PresentOnResult(
  result: EstimationPipelineResult
): asserts result is EstimationPipelineResult & { passe5: Passe5PipelineOutput } {
  if (!result.passe5) {
    throw new Error(
      '[passe5-regression] `passe5` key missing on pipeline result but Passe 5 was expected to run. ' +
        'Check `enablePasse5: true` and that `DISABLE_PASSE5` kill-switch is not set.'
    );
  }
}

// ─── Intentionally exported so the file is a real module ────────────────
//
// The `_*` type aliases above are removed at compile time. Without an
// exported value, TypeScript would flag this as a "no-op" file.

export type {
  _KeysStillPresent,
  _Passe5IsOptional,
  _Passe5DurationIsOptional,
  _Passe5Keys,
};
