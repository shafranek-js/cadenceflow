# T215 Measure Context Menu and Delete Measure — implementation handoff

Date: 2026-10-02 (Europe/Prague)

**Status:** implementation and focused local validation are complete; independent acceptance remains pending. `T215` is still unchecked in `specs/001-cadenceflow-core-studio/tasks.md`. No schema change, staging, commit, push, deployment, or task acceptance was performed.

## Implementation and requirement mapping

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Bind commands to the displayed Measure in Harmonic, Piano, Guitar, Piano Roll, Staff, and Tablature | `src/ui/progression/ProgressionTrack.tsx`, `src/ui/melody/PianoRollView.tsx`, and `src/ui/staff/ScoreSystemView.tsx` provide actual measure-header triggers. Staff/TAB expose per-Measure entries under each System heading. | E2E: “measure menu is available from Harmonic, Piano, Guitar, Piano Roll, Staff, and Tablature views”; target-vs-selected-Step coverage in the first E2E test. |
| Accessible menu, right-click and keyboard invocation, Escape/outside close, focus return, viewport clamp | `src/ui/progression/MeasureContextMenu.tsx` renders a named portal menu with keyboard navigation, reason/status text and clamped positioning. Header triggers support pointer/context-menu and `ContextMenu`/`Shift+F10`. | E2E: first and responsive capture tests; direct visual review below. |
| Exact deletion interval, including a partial final Measure; exact Step splitting and stable IDs | `src/domain/progression/measureDeletion.ts` plans `[measure.startBeats, min(next bar, authored duration))` in Rational time, retains pre/post fragments, and allocates an ID only for a split suffix. | Unit tests: middle-bar multi-Step deletion, partial final bar, empty progression, exact boundaries. E2E: portable crossing-note fixture. |
| Preserve authored and generated effective Melody, raw tails, duplicate IDs per owner, and recipes | The planner snapshots the effective timeline and raw authored phrases, splits and reassigns segments by new onset, preserves durations beyond the progression end, and materializes only generated owners whose output changes. It refuses when v9 cannot retain an owner/instrument without data loss. | Unit tests: crossing notes, duplicate IDs across owners, raw tails/dormant notes, generated next-chord context, instrument conflict. E2E: exact portable export and v9 refusal. |
| Reanchor selection, sections, and progression loop; use one Undo/Redo action | The planner reanchors state to following/preceding survivors. `src/app/App.tsx` applies one `progression/restore` command and keeps the transport loop snapshot aligned for Undo/Redo. | Unit and E2E: one history entry, exact undo/redo, section/selection/loop state. |
| Loop only when the Measure equals an exact Step range; stop transport and preview before deletion | `src/domain/timing/measureLayout.ts` adds `resolveExactMeasureStepRange`; `src/app/App.tsx` gates loop actions and stops playback/audition controllers before dispatch. | Unit and E2E: cross-Step loop explanation, exact loop, active transport stop, pending T210 preview cancellation. |
| Refuse unsafe active-branch and mixed-instrument deletions without mutation | `planMeasureDeletion` returns a visible reason; `ProgressionTrack` disables Delete and exposes that reason. No Project/history dispatch occurs on refusal. | Unit and E2E: active-branch and instrument-collision tests assert portable data and history remain unchanged. |

The new feature contract is documented as FR-262 and SC-043 in `specs/001-cadenceflow-core-studio/spec.md`; the separate implementation plan is `specs/001-cadenceflow-core-studio/t215-measure-context-menu-plan.md`. T215 remains unchecked in `tasks.md`.

## Verification

The focused domain suite passed:

```powershell
pnpm exec vitest run tests/unit/progression/measure-deletion.test.ts --maxWorkers=1
```

Result: 1 file, 7 tests passed.

The T215 Chromium suite passed:

```powershell
$env:T215_SCREENSHOT_DIR = 'C:\Users\pavel\.codex\visualizations\2026\10\02\01a0fd4e-8080-70e0-8a2f-b623afcdc62b\t215-final'
pnpm exec playwright test tests/e2e/t215-measure-context-menu.spec.ts --project=chromium --workers=1 --retries=0
```

Result: 9 tests passed in 20.7 seconds. The suite covers actual Measure targeting, all six views, exact loop gating, portable authored/generated content, active-branch and instrument refusals, transport stop, cancellation of a pending T210 preview, and responsive captures.

Build succeeded:

```powershell
pnpm run build
```

`tsc -b` and Vite build passed. Vite reported the existing large-chunk warning (main JS 2,607.70 kB) and plugin timing notice.

Scoped ESLint exited 0 with no errors and 7 React Hook dependency warnings in shared `App.tsx`/`PianoRollView.tsx`: `App.tsx` lines 719, 982, 1920, and 4031; `PianoRollView.tsx` lines 944, 974, and 997. Prettier check passed for the touched T215 source, spec/task/plan, tests, and T215 baseline evidence files. `git diff --check` exited 0; Git printed only the existing LF-to-CRLF notices.

The scoped regression command was:

```powershell
pnpm exec playwright test tests/e2e/t210-web-midi-step-input.spec.ts tests/e2e/piano-roll-system-note-panel.spec.ts tests/e2e/piano-roll-system-chord-portable.spec.ts tests/e2e/piano-roll-system-chord-panel.spec.ts tests/e2e/us10-staff-view.spec.ts tests/e2e/us13-staff-direct-interaction.spec.ts tests/e2e/us9-export.spec.ts --project=chromium --workers=1 --retries=0
```

Result: 64 tests total, 62 passed and 2 failed. T210, the protected portable chord regression, NOTE panel, Staff/TAB interactions, and exports passed. The two chord-panel assertions are documented below.

## Published-baseline comparison

There is no separate accepted-T210 source checkout. To compare safely, the Vite source-substitution helper supplied the exact published `f801562794b39ff3d039b56e0010829aff9a1b2b` versions of the eight modified application modules, including `measureLayout.ts` and `ScoreSystemView.tsx`; it did not change the current tracked chord-panel test or any checkout source. The separate helpers and result are in `artifacts/validation/t215-baseline/`.

Command:

```powershell
node artifacts/validation/t215-baseline/t215-baseline-diagnostics.mjs
pnpm exec playwright test tests/e2e/piano-roll-system-chord-panel.spec.ts --config artifacts/validation/t215-baseline/t215-baseline-playwright.config.mjs --project=chromium --workers=1 --retries=0 --grep 'Piano Roll chord controls stay on the System row|music-visible NOTE, CHORD and hidden-selection captures'
```

Both failures reproduced on the published baseline with the same assertions and values as the current run:

- `Piano Roll chord controls stay on the System row and edit through undoable actions`, line 279: expected `< 1`, received `25.1953125`.
- `music-visible NOTE, CHORD and hidden-selection captures fit normal viewport sizes`, line 176 (called at line 471): expected visible chord count `> 0`, received `0`.

These are published-baseline failures that predate T210 and T215; no assertions were weakened or edited. Exact evidence is in `artifacts/validation/t215-baseline/baseline-regression-evidence.md`.

## Visual review and durable captures

The 9-test run wrote 18 captures under:

`C:\Users\pavel\.codex\visualizations\2026\10\02\01a0fd4e-8080-70e0-8a2f-b623afcdc62b\t215-final\`

I opened and visually inspected all 18 images directly. Across 640×360, 1280×720, and 1920×1080, both themes, and open/closed menu states, the menu remained inside the viewport and the closed state returned to the measure trigger. At 640×360, Staff and Tablature each show a separate menu entry for the displayed Measure in the System heading. The active-branch explanation is fully readable in both themes while Delete is visibly disabled. The captures showed no menu clipping or horizontal page overflow.

| Capture set | Durable files |
| --- | --- |
| 640×360, light and dark, open/closed | [light open](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/light-640x360-open.png), [light closed](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/light-640x360-closed.png), [dark open](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/dark-640x360-open.png), [dark closed](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/dark-640x360-closed.png) |
| 1280×720, light and dark, open/closed | [light open](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/light-1280x720-open.png), [light closed](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/light-1280x720-closed.png), [dark open](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/dark-1280x720-open.png), [dark closed](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/dark-1280x720-closed.png) |
| 1920×1080, light and dark, open/closed | [light open](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/light-1920x1080-open.png), [light closed](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/light-1920x1080-closed.png), [dark open](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/dark-1920x1080-open.png), [dark closed](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/dark-1920x1080-closed.png) |
| Compact Staff and Tablature entries, both themes | [light Staff](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/light-640x360-staff-open.png), [dark Staff](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/dark-640x360-staff-open.png), [light Tablature](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/light-640x360-tablature-open.png), [dark Tablature](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/dark-640x360-tablature-open.png) |
| Active-branch refusal explanation, both themes | [light explanation](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/light-640x360-branch-disabled-open.png), [dark explanation](C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4e-8080-70e0-8a2f-b623afcdc62b/t215-final/dark-640x360-branch-disabled-open.png) |

## Current Git state and preservation

At handoff, HEAD is `f801562794b39ff3d039b56e0010829aff9a1b2b` on `master`, tracking `origin/master`; the index has no staged changes. T215 and the accepted T210 source remain uncommitted in the existing shared checkout.

Tracked modified paths:

- `specs/001-cadenceflow-core-studio/spec.md`
- `specs/001-cadenceflow-core-studio/tasks.md`
- `src/app/App.tsx`
- `src/audio/testHooks.ts`
- `src/domain/timing/measureLayout.ts`
- `src/styles/progression.css`
- `src/ui/melody/PianoRollView.tsx`
- `src/ui/progression/ProgressionTrack.tsx`
- `src/ui/staff/ScoreSystemView.tsx`
- `src/ui/studio/StudioWorkspace.tsx`
- `tests/e2e/piano-roll-system-chord-portable.spec.ts` — protected T210 regression remains a 62-line addition (`62 0`); it was not edited by T215.

Untracked T215 paths:

- `artifacts/validation/t215-baseline/`
- `specs/001-cadenceflow-core-studio/t215-measure-context-menu-plan.md`
- `src/domain/progression/measureDeletion.ts`
- `src/ui/progression/MeasureContextMenu.tsx`
- `tests/e2e/t215-measure-context-menu.spec.ts`
- `tests/unit/progression/measure-deletion.test.ts`
- this handoff file

Pre-existing T210 untracked material remains present and untouched: `artifacts/validation/t210-midi/`, its T210 plan/handoff/acceptance documents, `src/ui/melody/PianoRollMidiStepInput.tsx`, `src/ui/melody/midiStepInput.ts`, `tests/e2e/t210-web-midi-step-input.spec.ts`, and `tests/unit/melody/midi-step-input.test.ts`. No `T212`, `T213`, or `T214` implementation was started. Keep T215 unchecked pending independent acceptance.
