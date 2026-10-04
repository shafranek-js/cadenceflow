# Piano Roll selection-control placement — independent acceptance

Accepted by root on 2026-10-04. This accepts the latest local-control/common-heading placement and its Inspector focus correction, separately from the historical group-editing acceptance. It is not a publication or full-release acceptance.

## Requirements verified

- Select Measure targets its displayed Measure; Select System targets its displayed System. Their controls remain in their own headers.
- Exactly one PR-only Select All sits in the common My Progression heading after transport/tempo/support and before Print / Save as PDF. Wide normal layout shares that row; crowded/narrow layouts wrap the action group without squeezing transport.
- Independent selection actions preserve contextual Ctrl/Cmd+A scope, Project/history, MIDI cursor and audio. The blank common heading remains the Progression scope target.
- Header-focused Delete, Cut, Copy, Paste, Duplicate and Undo retain global owner-scoped routing. Native inputs/dialogs and other views retain their existing shortcuts.
- Hover/focus help uses a viewport-bounded document portal. Pointer transfer into Close, dismissal, Escape and focus return preserve selection. No permanent help strip remains.
- Inspector delayed autofocus preserves an already active Inspector field. The regression fills duration numerator 10, waits through two animation frames, retains focus/value, and commits exact duration 5/1.

Root inspected App.tsx, ProgressionTrack.tsx, PianoRollView.tsx, ScoreSystemView.tsx, PianoRollSelectionAction.tsx, pianoRollSelectionHelp.ts and the scoped CSS/test changes. The complete implementation mapping and changed-file scope are in [developer handoff](piano-roll-group-note-selection-handoff.md); its last supplemental sections supersede interim failure descriptions.

## Independent checks

All Chromium commands used `--project=chromium --workers=1 --retries=0`; focused units used `--maxWorkers=1`. External configurations preserve the repository configuration and keep reviewer output outside the checkout.

- `pnpm run build` passed: 464 modules, `index-Cy23wHSj.js`, `index-B6j2qUnM.css`. Root rebuilt after the production correction; the resulting bundle matches the independently tested bundle. Subsequent changes were tests/documentation only.
- `pnpm exec vitest run tests/unit/melody/piano-roll-group-selection.test.ts tests/unit/melody/midi-step-input.test.ts --maxWorkers=1`: 2 files, 25/25 tests.
- Initial independent 56-case Chromium batch: 55 passed, one Inspector duration failure. Included group selection, T210, T212, T215, Measure insertion, stable widths, existing views, editor and note panel. The isolated failing case passed, but that did not erase the original failure.
- After the autofocus correction, complete group-selection and batch3-editor files independently passed 15/15 in 1.6 minutes, including the strengthened duration regression. The original mixed batch was not rerun; affected-file coverage was rerun after the narrow source correction.
- Protected `piano-roll-system-chord-portable.spec.ts` independently passed 27/27 in 2.3 minutes. The developer also reran 27/27 on the final matching production bundle.
- Complete revised `piano-roll-system-chord-panel.spec.ts` independently passed 3/3 in 34.1 seconds, including viewport/theme/grid checks, keyboard preview/cancel/commit/Undo and continuation ownership.
- Scoped ESLint: no errors; seven inherited Hook warnings in the earlier complete source scope, three in the post-fix PianoRollView scope; final chord-panel test has no warnings/errors. Scoped Prettier and `git diff --check` passed. No whole-file formatting of inherited dirty production files was performed.

Reviewer configurations and evidence are under `C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4f-d564-7612-8b29-bc59c92804cc/group-independent/`: `playwright-placement-independent.config.mjs`, `playwright-placement-editor-fix.config.mjs`, `playwright-placement-chord-portable.config.mjs`, `playwright-placement-final-panel.config.mjs`, their named result folders, `test-results/`, and `placement-review-pending.md`. Tests were invoked through `C:/Projects/cadenceflow/node_modules/@playwright/test/cli.js` from that external directory; no release-wide suite was run.

## Exact regression classification

The old chord-panel failures were not accepted merely as identical baseline failures. Root compared eight exact published UI files from f801562 with current domain/codec: published compact center delta 25.1953125px versus current 27.0078125px; published 640px layout shared a row, whereas current local controls caused compact wrapping. At 1280px current same-row delta is 0.0078125px; the old test measured its header at y=738 in a 720px viewport without repositioning after resize. This diagnostic is a mixed-source UI comparison, not a complete immutable baseline checkout.

The retained tests now require under-1px centering on wide rows, nonoverlapping compact rows, visible and hit-testable controls, no ancestor clipping, horizontal fit, and correctly positioned headers. At 640×360 the actual chord/note is verified in a separate scroll position, with source identity, full bounds and hit target; panel visibility is rechecked after returning. The raw 519px/479px note-panel width difference has `overflow: visible`, with no clipped/unreachable controls; actual clipping and hit checks replace an incorrect inference that raw child overflow was a scroll container.

The keyboard fixture previously asked I4/V4 to expand across a Measure boundary where no next candidate exists. It now prepares I2/V2 within one Measure before baseline export, retaining meaningful ArrowRight preview, Escape, Enter and Undo checks. Product boundary rules were not broadened. Temporary diagnostic probes were removed. Diagnostic test copies with relaxed centering were used only to print geometry and are not counted as passing acceptance checks.

## Visual evidence and preserved state

Root actually viewed all 12 own normal-scale selection captures: 640×360, 1280×720, 1920×1080, both themes and Degrees/Chromatic. It also viewed the common heading at narrow widths and the 1920px no-branch/no-inspector state. Six fresh panel/music screenshots from the final independent chord-panel run were viewed, including compact separate scroll states and wide layouts. No new overlap or inaccessible controls were found.

HEAD remains f801562794b39ff3d039b56e0010829aff9a1b2b; index is empty. All tracked/untracked work is preserved. Protected chord-portable diff remains 62 additions/0 deletions. No stage, commit, push, deployment, cleanup, Actions change or ZIP occurred. This report is new; historical accepted group/MIDI reports remain unchanged. Physical MIDI and actual audio output, other browser engines and a full release suite remain unverified.

The next sequential task at the time of this acceptance was T213; T214 was to follow its acceptance.

### Subsequent acceptance status — 2026-10-04

T213 and T214 were both independently accepted on 2026-10-04; see their respective acceptance records.
The remaining release gates are maintained in the [current release handoff](release-gate-handoff-2026-10-04.md).
