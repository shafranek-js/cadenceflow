# Duplicate Measure independent acceptance — 2026-10-04

Accepted within [the requested feature contract](duplicate-measure-task.md). The shared Measure menu duplicates the clicked displayed bar to the end of the progression. Harmony and effective Melody are copied with exact Rational timing and fresh IDs; existing material remains unchanged. Partial bars receive explicit Rest padding, generated phrases are materialized only when required to preserve the copied music, and unsafe ownership or dormant-note activation refuses without mutation. Padding and copy form one Undo/Redo command. Transport and previews stop before dispatch.

Root reviewed the planner, authoritative AppStore handler and accessible shared menu. Root also reviewed the integration follow-up: NOTE-panel helpers now scroll the actual Studio container and retain visibility assertions against the header, scroll region, footer and viewport. No production UI workaround was introduced.

Independent evidence on the final shared checkout:

- `pnpm run build`: passed, 465 modules; `index-DsdteDIA.js` and `index-VlJtNUr4.css`. Existing chunk/plugin advisories only.
- `pnpm exec vitest run tests/unit/progression/measure-duplication.test.ts tests/unit/progression/measure-insertion.test.ts tests/unit/progression/measure-deletion.test.ts --maxWorkers=1`: 3 files, 21/21 passed.
- `pnpm exec playwright test tests/e2e/measure-duplicate.spec.ts tests/e2e/t215-measure-context-menu.spec.ts tests/e2e/piano-roll-system-note-panel.spec.ts tests/e2e/piano-roll-system-chord-panel.spec.ts tests/e2e/piano-roll-group-note-selection.spec.ts --project=chromium --workers=1 --retries=0`: 29/29 passed in 2.7 minutes. All three NOTE-panel tests passed, including the previously failing visibility assertion. Includes middle-bar append, keyboard/focus return, all six views, playback stop, portable reopen, history, refusal behavior and accepted note/chord/group editing.
- Scoped source/test ESLint and Prettier passed in the preceding root review; the changed NOTE test was checked again with both tools and passed. `git diff --check` passed.

Root actually viewed six normal screenshots covering menu and appended Measure at 640×360, 1280×720 and 1920×1080 in both themes from `artifacts/validation/duplicate-measure/review-2026-10-04/`. The narrow final Measure requires ordinary Studio scrolling to see all music; the menu remains above the reserved status-bar row. Geometry tests passed for all six size/theme combinations.

Boundary: this is scoped feature acceptance, not full-suite/release acceptance. The protected portable chord test still contains an obsolete window-scroll assertion, recorded in the handoff; it was not included or declared green in this final gate. Its inherited diff remains 62 additions/0 deletions. Shared dirty/untracked work preserved, index empty, master HEAD `f801562794b39ff3d039b56e0010829aff9a1b2b`. No stage, commit, push, deployment, cleanup, Actions change or ZIP.
