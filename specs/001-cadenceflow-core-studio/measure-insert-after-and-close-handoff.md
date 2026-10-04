# Measure insert-after and close-button implementation handoff

Date: 2026-10-03 (Europe/Prague). Implementation and scoped verification are complete; independent acceptance is pending.

## Boundary policy

The existing `ProgressionMeasure.endBeats` is the full barline even when the displayed final Measure has an implicit trailing gap. Insertion targets that full barline, uses the Measure's exact `capacityBeats` Rational from the current meter, and inserts a blank RestStep of that exact length. For a partial final Measure, the previous implicit tail is first materialized as a RestStep from the authored end to the barline; the inserted blank Measure starts at the barline. This keeps later Measures aligned to the meter.

If a Step crosses the target barline, its left piece keeps the original ID and its right piece receives a unique `~measure-N-right` ID. Later Steps keep their IDs and move by the inserted duration. Authored and effective generated notes that cross the boundary retain their pre-boundary segment and receive a new post-boundary segment after the blank Measure. Concert pitch, stored source pitch, instrument ownership, and source recipes are carried to the resulting owners. Generated Melody remains generated only when its new realization exactly matches the preserved events; otherwise it is materialized as authored Melody with its recipe retained.

Sections and selection remain anchored to surviving original Step IDs. A split Step keeps its ID on the left, so a section beginning there remains on the original musical onset. Loop starts on a split Step stay on the left piece; loop ends map to the right piece so the loop still covers the complete original Step. Runtime loop state uses separate start/end maps. An active temporary branch is refused because its anchors name the unsplit Steps. The candidate effective Melody timeline is compared exactly with the transformed pre-operation timeline. The planner refuses atomically when an event has no representable owner, when an owner would need multiple instruments, or when materializing a partial final tail would reveal a previously silent authored event.

## Implementation

- `src/domain/progression/measureDeletion.ts` now exports `planMeasureInsertion` beside the accepted deletion planner. Both plans are immutable and return an actionable refusal reason without mutating Project data.
- `src/app/App.tsx` applies a successful insertion as one `progression/restore` command, stops transport and cancels previews using the existing mutation path, and reanchors runtime loops for split Steps.
- `MeasureContextMenu` exposes **Insert Measure After N** with an accessible refusal reason. When insert and delete share the same refusal cause, the menu exposes one status paragraph referenced by both disabled actions.
- Harmonic/Piano/Guitar headers, Piano Roll headers, and Staff/TAB per-Measure controls include an accessible × button. Successful activation deletes through the accepted planner; a refusal opens the shared menu to show the reason. Button clicks do not select underlying music, keyboard activation is native, and focus returns to the next or previous Measure.
- Removed the unused `realizeChord` import from `ScoreSystemView.tsx` as requested. No Project schema change was made.

## Verification

Focused units:

```powershell
pnpm exec vitest run tests/unit/progression/measure-insertion.test.ts tests/unit/progression/measure-deletion.test.ts --maxWorkers=1
```

Result: **2 files, 15 tests passed**. Coverage includes exact 4/4 and 7/8 lengths, crossing Step and authored/generated notes, transposition/source pitch, sections and loop anchors, partial-final insertion, refusal when an implicit tail reveals dormant Melody, active-branch refusal, and portable Undo/Redo snapshots.

Focused Chromium regression command:

```powershell
pnpm exec playwright test tests/e2e/t210-web-midi-step-input.spec.ts tests/e2e/t212-range-transposition.spec.ts tests/e2e/t215-measure-context-menu.spec.ts tests/e2e/piano-roll-system-chord-portable.spec.ts --project=chromium --workers=1 --retries=0
```

The first run passed **56/59** and exposed three strict-selector failures because the expanded menu displayed duplicate statuses for shared active-branch and mixed-instrument refusals. Those refusal statuses were consolidated. The rerun of T215 plus the new insertion spec passed **13/13**:

```powershell
pnpm exec playwright test tests/e2e/t215-measure-context-menu.spec.ts tests/e2e/measure-insert-and-close.spec.ts --project=chromium --workers=1 --retries=0
```

Across the scoped runs, all **63 unique Chromium scenarios passed**: protected chord-portable 27, T210 18, T212 5, T215 9, and insertion/close 4. This was not a full E2E suite.

Fresh `pnpm run build` passed. Vite reported its existing large-chunk and plugin-timing warnings. Scoped ESLint passed with zero errors and seven existing React Hook warnings in App/Piano Roll. Scoped Prettier and `git diff --check` passed; Git printed its usual LF-to-CRLF working-copy notices.

The new suite saved eight captures in `artifacts/validation/measure-insert-close/`: menu-open and closed headers at 640×360 and 1280×720 in both themes. I opened and inspected all eight captures. The menu remains within each viewport, the insertion action is legible, and the × remains visible in compact and desktop Measure headers.

## Checkout and acceptance boundary

Workspace: `C:/Projects/cadenceflow`; branch `master`; HEAD `f801562794b39ff3d039b56e0010829aff9a1b2b`. The index is empty. The existing T210/T212/T215/stable-width work and other dirty files remain in the shared checkout. The protected `tests/e2e/piano-roll-system-chord-portable.spec.ts` still has its inherited **62 insertions / 0 deletions** and was not edited by this batch. No staging, commit, push, deployment, cleanup, full-suite run, Actions change, or task-status update occurred.

The T210 acceptance records evidence against this same dirty checkout at the same HEAD; it does not provide a separate clean accepted-source worktree. This handoff makes no independent acceptance claim. Real MIDI hardware/audio, other browser engines, and the full release suite remain outside this scoped verification.
