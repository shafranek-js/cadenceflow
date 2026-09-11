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

## Runtime validation

- [x] Install the approved dependency set and create the lockfile with `pnpm install`.
- [x] Run `pnpm test` (Vitest).
- [x] Run `pnpm verify:fixtures`.
- [x] Run `pnpm build` (TypeScript 7 + Vite 8.1).
- [x] Run `pnpm exec playwright test tests/e2e/us1-build-progression.spec.ts`.
- [x] Visually verify Harmonic / Piano / Staff Card Views with the real React/VexFlow packages.

## Environment note

Validated on 2026-09-11 with Node.js 24.14.0 and pnpm 10.12.4. The dependency install was already up to date; Vitest passed 85 files / 686 tests, fixture verification passed 21 files, the production build passed, the focused US1 Chromium test passed 1/1, and Harmonic / Piano / Staff Card Views were visually inspected in the running application.
