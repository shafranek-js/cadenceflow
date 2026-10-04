# Piano Roll System chord panel — approved separate batch

## Gate, scope and precedence

Batch 3 and the separate System NOTE panel are independently accepted. Implement this CHORD batch in the same developer thread, then await independent acceptance before starting the separately approved Staff/Guitar display fix. Keep the monitor active until that final Staff/Guitar acceptance. Preserve all unrelated tracked/untracked dirty work and the accepted Piano Roll behavior. No duplicate/parallel implementation, full suite, staging, commit, push, deploy, adjacent tasks or per-System voice leading.

Current status update (2026-10-04): NOTE and CHORD acceptance and the separately approved Staff/Guitar acceptance are complete. Their scoped acceptance does not close the full release gate; see [the current release handoff](release-gate-handoff-2026-10-04.md).

This combined plan includes the latest direct user amendments. Contextual panels fit without ANY panel/header scrolling, superseding earlier nowrap/internal-scroll requirements. Shared-boundary drag transfers duration between adjacent Steps, superseding earlier ripple drag. Split and Tie are authorized, superseding their earlier exclusion. Duration presets retain ripple behavior distinct from shared-boundary drag. Removing Harmony means Rest at unchanged duration, never deleting a Step or measure.

## Contextual controls and selection

Clicking a Piano Roll chord or Rest displays chord-specific controls in EXACTLY the same System-header location as the NOTE controls, replacing them. Note and chord/Rest selection are mutually exclusive; no selection means completely hidden controls. Clicking a continuation chooses the displayed System for the panel but edits the whole source Step. Empty-cell cursor remains transient and does not reveal a panel. Preserve deliberate note multiselection and existing System actions, title audition, menus and removal controls.

Keep the panel inline with the System label/count on wide displays, always light independently of global theme, compact and accessible. At 640/1280/1920 all controls must fit without panel or header scrolling, clipping or page overflow; compact responsive wrap/reflow is allowed. Use accepted local light tokens, readable labels, focus, selection and palette contrast. Preserve both grids, one shared pitch scale per System, timeline alignment, Sections, labels, Guides, note geometry, resize handles, persisted settings and ordinary transport. Use the existing right Inspector for additional existing chord properties; add no new properties/schema, copied Hookpad code/assets, or separate inspector workflow.

Expose seven active-key/scale chords using the accepted root-degree colors and labels, a Matrix replacement action, Rest/removal, and exact duration controls. Support major/minor and altered/borrowed/secondary chords consistently with existing chord construction and spelling. Matrix opens the existing chooser for replacement; cancellation changes nothing. Panel and menu actions do not audition.

## Replace and remove Harmony

Chord replacement preserves source Step ID, exact duration, authored Melody, instruments/track settings, Sections and branches. A generated Melody recipe is retained and recomputed through the common effective pipeline. Replacing with a standard variant discards incompatible chord-specific spelling properties rather than carrying invalid metadata forward. No-op replacement creates no history entry.

Remove/Rest converts only Harmony to the existing Rest representation, retaining SAME Step ID and duration. Measure count, all timeline bounds and subsequent music stay unchanged. Preserve Melody/polyphony, instruments, Sections and branches. Generated Melody is atomically materialized from the effective timeline before conversion to Rest in the same command, one Undo. Undo restores exact recipe, owners and identities; Redo restores Rest with preserved Melody. Rest-to-chord replacement preserves authored Melody. Never route this action through structural Step deletion.

## Panel duration presets — ripple

Whole, half, quarter, eighth, sixteenth and Triplet use exact Rational values; Triplet is exact 2/3, independent of grid Snap. Display custom exact current duration rather than silently quantizing it. Completed actions commit directly, no Apply stage. Show selected current state, reject invalid values clearly, no-op current value is zero Undo.

Changing a Step duration by a panel preset ripples following Steps and their Melody with their timeline positions. Stored note durations are unchanged. Re-anchor Melody ownership atomically if onset falls outside its owner, with exact-boundary onset assigned to the RIGHT Step. Retain stored tails beyond progression end and use common effective clipping without stored-duration mutation. Carefully verify runtime/portable codec validity and existing ownership rules; no schema change. Preserve Step identities, Sections, branches and instruments. One command/Undo for the entire operation.

## Shared actual boundary drag — duration transfer

An actual boundary between adjacent Steps uses ew-resize and transfers duration between that pair: 4+4 → 5+3. Pair total, composition length, every other boundary and measure count remain unchanged. The selected chord's left edge edits previous+selected; its right edge edits selected+next. Progression start/end are fixed. Measure or System fragment cuts are not actual Step boundaries and have no resize handles. Chord body retains ordinary selection/audition, not boundary behavior.

Use absolute Rational Snap for ordinary and every triplet grid. Both neighboring durations must remain at least one current Snap quantum. Supply an accessible keyboard alternative and cross-System autoscroll. Preserve stable grab offset and timeline coordinates under scroll/zoom. Preview is transient with no Project/autosave/history/materialization. Escape, lost capture, view change and stale Project cancellation restore the baseline without audition. Release commits exactly one atomic command/Undo; cursor resets correctly.

All Melody absolute onsets, pitches and durations remain unchanged during boundary transfer. Re-anchor owner by onset; exact boundary goes RIGHT. A crossing note remains ONE musical event. Materialize affected generated owners only on commit, preserving effective notes and identities with collision-safe reassignment. Undo restores exact original recipes, identities and owners; Redo repeats the transfer.

## Split

The chord context menu splits the whole source Step into EXACT HALF Rational durations, independently of Snap or click position. It is repeatable. Retain the first Step ID and allocate a unique second ID. Clone Harmony, spelling, voicing, performance and instruments. Total timeline, subsequent bounds and measure count remain unchanged.

Melody absolute onset/pitch/duration is unchanged; re-anchor by onset with exact-boundary events on the right and crossing notes represented once. Generated affected Melody materializes atomically; Undo restores its original recipe and IDs/owners. Split Harmony has a NEW attack at the split boundary, while Melody has NO new attack. Exactly one Undo/Redo for each split, with no menu audition.

## Tie

Shift selection allows two or more chord Steps, mutually exclusive with NOTE selection. Right-click within the selected group preserves that group. Tie is allowed ONLY for contiguous Steps with IDENTICAL Harmony, spelling, voicing, performance and instruments, with no gaps, Rest or internal Section boundary. Disable invalid Tie with an accessible concrete reason; do not silently normalize differences.

Merge into the first Step ID with exact summed Rational duration. Following timeline bounds and composition length remain unchanged. Preserve all absolute Melody, polyphony and instruments; collision-safe note identities must avoid losing same-local-ID notes from different owners. Undo restores every original Step/note identity and recipe. The merged Harmony is one event with NO internal reattack; Melody is not restarted. One atomic command/Undo; panel/menu actions never audition.

## Audition and keyboard

Chord body click/Enter/Space plays ONLY Harmony with existing engine, current voicing/instrument/mix and exact interval stop; exclude Melody notes and active Melody tails. Rest is silent. Keep the audio-clock-synchronized absolute audition playhead and cleanup on stop/finish/replacement, including cross-System intervals. Note audition remains isolated note; Measure/System audition remains both tracks; ordinary transport is preserved. Audition/selection never mutates Project, autosave or history.

Keep accessible control names, tooltips and Enter/Space behavior. Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and existing Ctrl+Y work from chord/grid/panel controls without refocus; native partial-text Inspector Undo remains safe. Escape returns intelligible focus and cancels transient edits. No duplicated events or incidental audio.

## Verification and independent gate

Use real portable imports and runtime-codec-decoded fresh exports, never DOM musical-data mutations. Verify exact Rational data, owners/IDs, instruments, Sections/branches, no-op/cancel and exactly one Undo/Redo for replacement, Rest, presets, boundary transfer, repeated Split and Tie. Include generated materialization/recipe restoration, Rest ownership, simultaneous overlap, local ID collisions, exact-right-boundary reassignment, crossing notes and stored tails with effective end clipping. Verify invalid Tie reasons, differing voicings/instruments/performance, Rest, noncontiguous groups and Section boundaries.

Real pointer hover/drag checks must cover actual boundaries vs body/fragment cuts, ew-resize, pair transfer both directions, fixed outer bounds, triplet Snap, short neighbors, cross-System autoscroll, keyboard alternative and all cancellation paths. Assert decoded data, not only rendered widths. Instrument actual engine events for Harmony-only audition, Split new Harmony attack/no Melody attack and Tie no internal reattack; verify exact audio-clock stop/playhead cleanup/no history.

Fresh build; focused Vitest maxWorkers=1; relevant Chromium workers=1 retries=0; scoped ESLint/Prettier and diff check. Actually view normal-scale 1280×720, 1920×1080, 640×360 viewport captures in both global themes/grids: contextual NOTE↔CHORD replacement, hidden empty selection, continuation ownership, all controls visible/hit-testable without any panel/header scroll, right Inspector, colors, music/chord scroll states and active playhead. At 640×360, retain separate viewport captures for the System controls with Harmony and for a scrolled actual-note/grid view in each theme and pitch grid; don't reduce grid height or CSS scale to manufacture visibility. Fullpage captures are supplementary only.

Handoff must provide actual baseline/delta/architecture/provenance, requirement→code→meaningful test/evidence, changed files, exact checks and protected dirty state. Developer checks do not constitute independent acceptance or full release regression. After independent CHORD acceptance, update only this status and dispatch the separately approved Staff/Guitar plan.

## Separate idea outside implementation scope

The user asked to think about adding empty measures. Proposed separate command: add one current-meter exact-duration Rest with empty authored Melody, existing command infrastructure, one Undo. This is a concrete proposal for the user; implementation is not authorized in this batch.

Status update (2026-10-04): Measure insertion/close and Duplicate Measure were later separately authorized and independently accepted; see [Measure insertion acceptance](measure-insert-after-and-close-independent-acceptance.md) and [Duplicate Measure acceptance](duplicate-measure-independent-acceptance.md). The proposal above is retained as historical context, not current authorization.

## Status

- [x] Batch 3 and System NOTE independently accepted.
- [x] CHORD implementation and developer handoff.
- [x] Independent CHORD acceptance.
- [x] Separate Staff/Guitar batch dispatched only after CHORD acceptance.
- [x] Separate Staff/Guitar batch independently accepted 2026-10-02; see [its acceptance record](staff-guitar-display-fix-plan.md).
- [x] Measure insertion/close and Duplicate Measure have separate scoped acceptance records; see links above.
- [ ] Full release regression remains open; see [the current release handoff](release-gate-handoff-2026-10-04.md).

## Developer handoff — 2026-10-02

Independent acceptance — 2026-10-02: fresh build (453 modules), 13 focused unit tests and joint CHORD/portable/NOTE Chromium 20/20 passed with one worker and zero retries. Scoped Prettier and diff checks passed; ESLint reported zero errors and 12 Hooks warnings; staging remained empty. Independently viewed normal-scale 640×360, 1280×720 and 1920×1080 music/control captures, both pitch grids and global themes, continuation and active playhead. Exact portable data, Rest-to-Matrix variant, completed cross-System transfer, all triplet Snap values, keyboard history, cancellation and controlled audio-clock completion/replacement were verified. Step instrument overrides are preserved; reanchored Melody uses its destination owner's instrument, consistent with the accepted effective pipeline. This is scoped acceptance, not full release regression.

### Baseline and delta

The shared `C:\Projects\cadenceflow` checkout contains other dirty T200–T209, schema, audio, export, and documentation work. Those edits and untracked files were preserved; nothing was staged, committed, cleaned, or dispatched to another batch. The implementation follows this approved plan and the existing project types, exact-time model, command/history path, realizers, and audio engine. It introduces no copied Hookpad code/assets or schema changes.

The System NOTE/CHORD controls render as inline children of the existing `score-system-header`, in the same row as the System label and measure count. At narrow widths, controls compactly reflow inside the panel while the header remains in one row without horizontal scrolling. Selecting a Piano Roll chord uses transient UI state to expose its existing right Inspector properties; selection does not mutate persisted Project selection or trigger general progression audition. The dedicated chord audition is the sole chord-body audio path. Existing schema and portable format are unchanged.

### Requirement → implementation → evidence

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Keep controls beside the System title and measure count | `ScoreSystemView.tsx` renders NOTE/CHORD panels inside `.score-system-header`; responsive layout is in `progression.css`. Chord replacement reads the dedicated Matrix-session preview, so a temporary-branch focus chord is not mistaken for a user-selected replacement. | Chromium geometry checks cover 480, 640, 1280, and 1920 CSS pixels in both themes and pitch grids, including row alignment, hit targets, and no header/panel/page scrolling. Visually inspected actual 640×360 controls+Harmony and separate actual-note/grid captures for all four theme/grid combinations; 1280 captures show the right Inspector and selected NOTE/CHORD states; 1920 shows all four Measures and controls on System 1's single header row. |
| Keep NOTE and CHORD mutually exclusive and transient | `ProgressionTrack.tsx` reports transient note/chord selection; `App.tsx` derives panel and Inspector context without changing `progression.selectedStepId`. `focusManagement.ts` lets panel-local Escape cancel before app-level shortcuts. | Browser tests confirm portable export is byte-identical on selection, panel visibility is mutually exclusive, Escape cancels Matrix mode and restores chord focus, and empty-cell clicks hide contextual controls. Captures were reviewed at 640×360, 1280×720, and 1920×1080 in both themes/grids. |
| Preserve exact edits, identities, ownership, and history | `systemChordCommands.ts` implements replacement, Rest, ripple duration, shared-boundary transfer, Split, and Tie with Rational values; `AppStore` omits history/persistence work for identity no-ops. | Focused command tests and real portable-import Chromium coverage verify exact durations, Split/Tie, generated Melody materialization and Undo restoration, collisions, right-boundary ownership, triplet Snap, both-direction and cross-System transfer, cancellation, no-op behavior, and decoded export/import. |
| Route chord preview through the audio engine and preserve attacks | `audio/pianoRollAudition.ts` and existing `PlaybackController` providers. | Instrumented providers confirm chord audition schedules Harmony only and excludes crossing Melody. Split delivers a new Harmony attack without a Melody attack; Tie removes the internal Harmony reattack while preserving scheduled Melody performance. |
| Keep playhead timing tied to its own audition session | Piano Roll audition session IDs and the audio-clock completion callback in `App.tsx`/`PianoRollView.tsx`. | Chromium tests replace an active audition and verify only the current session clears at the exact audio-clock end. The reviewed 1280×720 cross-System capture shows the active playhead in the later System; a continuation capture shows the source Step panel in that System. |

### Changed feature files

- App and commands: `src/app/App.tsx`, `src/app/appStore.ts`, `src/app/commands/systemChordCommands.ts`.
- System and Piano Roll UI: `src/ui/progression/ProgressionTrack.tsx`, `src/ui/staff/ScoreSystemView.tsx`, `src/ui/melody/PianoRollView.tsx`, `src/ui/melody/PianoRollSystemChordPanel.tsx`, `src/ui/melody/PianoRollSystemNotePanel.tsx`, `src/ui/melody/pianoRollGeometry.ts`, `src/ui/melody/pianoRollPitchRange.ts`, `src/ui/melody/pianoRollPreferences.ts`, `src/ui/melody/pianoRollProjection.ts`, `src/ui/melody/pianoRollSession.ts`, `src/styles/progression.css`.
- Audition and keyboard focus: `src/audio/pianoRollAudition.ts`, `src/ui/studio/focusManagement.ts`.
- Tests and fixture: `tests/fixtures/piano-roll-system-chord.fixture.ts`, `tests/unit/melody/piano-roll-system-chord-commands.test.ts`, `tests/unit/audio/piano-roll-audition.test.ts`, `tests/e2e/piano-roll-system-chord-panel.spec.ts`, `tests/e2e/piano-roll-system-chord-portable.spec.ts`, `tests/e2e/piano-roll-system-note-panel.spec.ts`.

### Checks run

- `pnpm build` — passed after the Matrix-preview fix; Vite reports the existing large-chunk advisory.
- `pnpm exec vitest run tests/unit/melody/piano-roll-system-chord-commands.test.ts tests/unit/audio/piano-roll-audition.test.ts --maxWorkers=1` — 2 files, 13 tests passed.
- `node --import=tsx/esm node_modules/@playwright/test/cli.js test tests/e2e/piano-roll-system-chord-panel.spec.ts tests/e2e/piano-roll-system-chord-portable.spec.ts tests/e2e/piano-roll-system-note-panel.spec.ts --project=chromium --workers=1 --retries=0` — 20 passed in 2.3 minutes. Chromium only; no full suite or Firefox run.
- Scoped ESLint over the affected CHORD/NOTE source and test files — 0 errors, 12 React Hooks dependency warnings (3 in `App.tsx`, 6 in `ScoreSystemView.tsx`, 3 in `PianoRollView.tsx`).
- Scoped Prettier — the two E2E files were formatted, then the full affected-file check passed. `git diff --check` — exit 0; Git emitted line-ending conversion notices only.
- Visual review — inspected normal-scale screenshot output: 640×360 CHORD controls+Harmony and separately scrolled actual-note/grid screenshots for both themes and both pitch grids; representative 1280×720 and 1920×1080 CHORD/NOTE/hidden states; actual System continuation and active-playhead captures. At 1920×1080 the screenshot shows four measures on System 1 with its CHORD controls on the same header row. The 640×360 note captures preserve the real grid row height and use ordinary scrolling, with no CSS zoom.

### Handoff boundary

The following boundary statement records the 2026-10-02 developer handoff state and is superseded by the independent acceptance documented above.

This is a developer handoff, not independent CHORD acceptance. The full repository suite and Firefox were not run. The independent CHORD acceptance box remains unchecked; the separately approved Staff/Guitar batch remains undispatched until that acceptance. Other dirty files were preserved, and no staging, commit, push, deploy, or adjacent batch work was performed.
