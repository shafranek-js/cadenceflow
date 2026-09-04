# Milestone 1 — Playable Harmonic MVP Readiness

**Date**: 2026-09-04

## Source completion

- [x] T001–T009 Setup artifacts created.
- [x] T010–T022 Foundation domain/contracts/history/fixtures created.
- [x] T023–T038 US1 source + test artifacts created.
- [x] `tsc -p tsconfig.foundation.json` passes with the locally available TypeScript compiler.
- [x] Pure-domain runtime smoke passes for exact rational timing, `V7/V` realization, `ii -> V` recommendation, and Manhattan routing.
- [x] React/TSX source passes a local syntax/type smoke using temporary external-library declaration stubs.
- [x] VexFlow Staff adapter follows the VexFlow 5 low-level SVG rendering API shape.

## Runtime validation still required on a dependency-enabled machine

- [ ] Install the approved dependency set and create the lockfile with `pnpm install`.
- [ ] Run `pnpm test` (Vitest).
- [ ] Run `pnpm verify:fixtures`.
- [ ] Run `pnpm build` (TypeScript 7 + Vite 8.1).
- [ ] Run `pnpm exec playwright test tests/e2e/us1-build-progression.spec.ts`.
- [ ] Visually verify Harmonic / Piano / Staff Card Views with the real React/VexFlow packages.

## Environment note

The current execution container has Node.js and a global TypeScript 5.8 compiler, but no installed `pnpm` or project dependencies and no usable package-registry access. Therefore external-library build/test results are intentionally not reported as PASS.
