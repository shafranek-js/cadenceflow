# Duplicate Measure implementation handoff

**Status:** implementation and scoped verification complete; independently accepted on 2026-10-04 in [duplicate-measure-independent-acceptance.md](duplicate-measure-independent-acceptance.md). This is scoped feature acceptance, not full-release acceptance.

This implements the contract in [duplicate-measure-task.md](duplicate-measure-task.md). The shared Measure menu now offers **Duplicate Measure N to End** in Harmonic, Piano, Guitar, Tablature, Staff and Piano Roll. It copies the clicked displayed Measure to the next barline, keeps existing section and loop anchors on their original Steps, selects the first copied Step, and commits padding plus copied content with one `progression/restore` history action. The handler stops transport and pending previews before dispatch.

The pure Rational planner clips effective Melody to the source bar, copies Rest Melody, assigns fresh Step and note IDs, and preserves exact source/concert pitches, spelling, durations, instruments and Step data. It pads an existing partial tail with an explicit Rest and copies a partial source bar's trailing gap as a Rest. It refuses active branches, dormant-note activation, unrepresentable owners and mixed Step-level instrument requirements before mutation. Generated Melody remains generated when its appended context produces the same phrase; otherwise only the copy is materialized as authored with its recipe retained.

The context menu supports pointer and keyboard invocation with focus restoration. Duplicate-specific refusal text has its own accessible status and styling; matching Insert/Delete refusal text remains shared. The menu is clamped above the persistent status bar.

## Verification

- `pnpm run build` passed after the final implementation change (465 modules). Vite reported the existing large JavaScript chunk and plugin timing warnings.
- Focused Vitest for Duplicate, Insert and Delete Measure passed: **21/21** with `--maxWorkers=1`.
- Duplicate Measure Chromium coverage passed: **5/5** with `--workers=1 --retries=0`.
- T215 plus Duplicate Measure Chromium coverage passed after the refusal-message fix: **14/14**.
- The preceding scoped Chromium run contained **91** cases: 88 passed and 3 failed. The T215 mixed-instrument status ambiguity is fixed. The NOTE-panel test helper had stale `window.scrollBy` calls after T214 moved scrolling into `.studio-grid`; both are now routed through that scroll container, with full visibility assertions retained against the app header, Studio clip, status bar and viewport. After a fresh build, the final affected integration gate passed **29/29**: Duplicate Measure 5, T215 9, NOTE panel 3, chord panel 3 and group selection 9.
- The protected chord portable spec was left untouched and was not included in that final 29-case gate. Its preceding scoped run failed `tests/e2e/piano-roll-system-chord-portable.spec.ts:1998`: boundary-drag autoscroll expected `window.scrollY` to increase, but it remained 0. Keep this as a known scroll-container assertion debt; do not claim that protected spec is green.
- Scoped ESLint found no errors and four React Hooks warnings in `src/app/App.tsx`; Prettier passed for the scoped source, tests and task doc. `git diff --check` passed; Git printed line-ending conversion notices for inherited dirty files.
- Chromium generated 12 local captures across light/dark themes and 640×360, 1280×720 and 1920×1080. All six metric entries report the appended Measure visible and the status bar pinned; the menu stays within the viewport and above the status bar. The PNGs and `viewport-metrics.json` remain local under `artifacts/validation/duplicate-measure/review-2026-10-04/` and are excluded from this commit.

## Changed for this scope

- Planner and exact timeline validation in `src/domain/progression/measureDeletion.ts`.
- Menu wiring and single-action handler in `src/ui/progression/MeasureContextMenu.tsx`, `src/ui/progression/ProgressionTrack.tsx` and `src/app/App.tsx`.
- Menu status styling in `src/styles/progression.css`.
- Model and Chromium coverage in `tests/unit/progression/measure-duplication.test.ts` and `tests/e2e/measure-duplicate.spec.ts`.
- The Piano Roll NOTE-panel E2E helper now scrolls and verifies against the nested Studio scroll region in `tests/e2e/piano-roll-system-note-panel.spec.ts`; no production UI change was needed.

At acceptance, the checkout was dirty on branch `master` at `f801562`; the index was empty. No task checklist or acceptance record was changed during implementation. The protected `piano-roll-system-chord-portable.spec.ts` was not edited. No ZIP was assembled. Full-release acceptance remains outside this scoped record.
