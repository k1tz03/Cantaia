/**
 * Ambient type augmentation for @react-three/fiber 8 × React 19.
 *
 * ── Why this file exists ─────────────────────────────────────────────
 *
 * Dev B imported <Canvas> via `next/dynamic(..., { ssr: false })` to keep
 * three.js out of the SSR bundle. Two problems follow from that choice:
 *
 *   1. `dynamic()` is a RUNTIME loader — the TypeScript compiler never
 *      statically traverses @react-three/fiber's declaration tree, so the
 *      `declare global { namespace JSX { interface IntrinsicElements
 *      extends ThreeElements {} } }` block that R3F ships at the bottom
 *      of `three-types.d.ts` is never processed.
 *
 *   2. Even if we DID force that declaration to load, it would not help
 *      under React 19. `@types/react` v19 moved the canonical JSX
 *      namespace INTO the `react` module (see line 4133 of its index.d.ts:
 *          namespace JSX { interface IntrinsicElements { ... } }
 *      inside `declare module "react"`). The classic JSX runtime and the
 *      automatic JSX runtime (`react/jsx-runtime`) both resolve
 *      `JSX.IntrinsicElements` through that module path —
 *      `declare global { namespace JSX }` is no longer the source of truth.
 *
 * ── The fix ──────────────────────────────────────────────────────────
 *
 * Augment BOTH entry points so JSX resolution finds R3F's primitives
 * regardless of how tsc is configured:
 *
 *   - `declare module "react"` — the React 19 canonical location.
 *     Because `react/jsx-runtime.d.ts` has
 *         interface IntrinsicElements extends React.JSX.IntrinsicElements {}
 *     (structural extends), adding members here also propagates to the
 *     auto-runtime's JSX namespace. No separate augmentation needed for
 *     `react/jsx-runtime` or `react/jsx-dev-runtime`.
 *
 *   - `declare global { namespace JSX }` — legacy belt-and-braces.
 *     Some tooling (eslint-plugin-react, older IDE integrations) still
 *     checks the global namespace. Cheap to keep.
 *
 * ── When this becomes stale ──────────────────────────────────────────
 *
 * If we upgrade to R3F v9 (planned), its types ship a different shape
 * (`extend()` + per-element registration). The follow-up will be to
 * replace `ThreeElements` with the v9 equivalent — the two augmentation
 * sites should stay the same.
 *
 * Picked up automatically by tsc via tsconfig `include: ["**\/*.ts"]` —
 * `.d.ts` files match that glob.
 */

import type { ThreeElements } from "@react-three/fiber";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

// `export {}` makes this a module rather than a script, which is required
// for the module augmentation syntax above to be valid.
export {};
