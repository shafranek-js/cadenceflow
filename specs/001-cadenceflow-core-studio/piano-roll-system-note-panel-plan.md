# Piano Roll — System note panel

## Authorization and sequence

Approved implementation plan from the user's root conversation, consolidated after independent Batch 3 acceptance on 2026-10-01. Implement as a separate improvement in the existing GPT-6 Luna developer thread `01a0f62c-15f6-73f1-b722-51eacb4f31d5`, host local. Batch 3 is the accepted baseline. The System chord panel, including chord-boundary dragging, remains a separate later batch and must wait for independent acceptance of this note panel.

Protect every existing tracked/untracked dirty file. No duplicate implementation, new developer thread, full suite, stage, commit, push, deploy, adjacent T210/T212/T213, or per-System voice-leading work. The implementation is authorized; do not ask the user to authorize it again. Completion requires independent acceptance; developer green checks alone do not mark this plan accepted.

## Placement and appearance

Add the note panel only in the displayed System that owns the active selected note, in the same header row as the System title and measure count, before the existing System actions. On wide viewports controls stay in one row with no extra enclosing panel border. Hide it when there is no selected note; an empty-cell cursor remains transient and must not reveal this panel. It is always light regardless of the global theme. On narrow viewports allow compact wrapping/reflow without an internal scroller or page overflow. Do not introduce large empty header space, duplicate Measure controls, or another permanent Inspector.

Keep existing System title audition, context menu, collapse/delete and other System actions accessible. Preserve the shared one-per-System pitch scale/keyboard, row geometry, continuous timeline, Sections, label modes, Guides, saturated chord bands, existing note labels and handles, ordinary transport and audition playheads. All local controls/popovers use the accepted light tokens and readable focus/selection states. Use the reference's visual idea only; copy no Hookpad code/assets.

## Editing context

Use one shared Piano Roll editing context with an active displayed System, optional empty-cell cursor, active owner-scoped note identity, and the selected owner-scoped note set. Distinguish `(stepId, noteId/eventKey)` even when local IDs collide. Render only the active selected-note System's panel; passive Systems have no panel and cannot edit a different selection accidentally.

A normal click on an empty grid cell records its exact absolute Rational time and pitch as a visible editing cursor, without creating a note, auditioning, writing Project/autosave/history, or materializing generated Melody. This is an explicit amendment to the previous immediate empty-cell click behavior. Preserve explicit keyboard/gesture creation paths and existing double-click, Enter, drag/resize, marquee, intentional multi-selection and note audition interactions with consistent cursor/focus routing.

Selecting an existing note supplies its exact pitch/time/owner to the panel. Selection, cursor navigation, palette mode and prospective duration changes remain transient UI actions, independent of musical commands. Context switching must clear incompatible empty-cell/note/chord contexts; the later chord-panel batch supplies mutually exclusive chord/Rest context. No chord editing is included here.

## Pitch palette

Provide Degrees and Chromatic palette modes independent of the grid's Degrees/Chromatic mode. Persist the palette mode as a validated browser/device UI preference through the existing preferences mechanism; never put it in Project/schema/export/history. Degrees exposes 1–7 of the active key/scale, with the corresponding note names and accepted degree colors. Chromatic exposes all 12 semitones with consistent accidental/enharmonic labeling and the accepted color helper. Derive active scale from the actual current key/module, including major/minor, rather than assuming C major. Octave calculations must be explicit and correct across octave boundaries.

An earlier plan allowed palette-only note creation from the empty-cell cursor. The latest user amendment supersedes that interaction: because the panel is hidden with no selected note, palette-only empty-cell creation is unreachable and is excluded from this batch. Keep the cursor transient; preserve explicit double-click and keyboard creation paths.

For one selected note, choosing a pitch replaces only pitch in that note's octave; preserve exact onset, duration, identity and owner. For multiple selected notes, use the active note as the anchor: compute the semitone delta between its current pitch and the chosen palette pitch in the active note's octave, then transpose the entire selected group by that same delta. Preserve intervals, IDs, owners, exact onsets/durations and track settings. Do not force every selected note to one pitch.

## Transposition controls

Raise/Lower moves to the next strictly higher/lower note of the active scale. For an altered pitch, find the nearest strictly higher/lower scale pitch; do not round to the current pitch or use a hardcoded diatonic offset. Octave up/down adds/subtracts 12 semitones. Half-step up/down adds/subtracts one semitone. For a selected group, derive the delta from the active note and apply it uniformly to preserve intervals.

With only an empty-cell cursor, no System note-panel action is available; do not reveal the panel or create/select a note to expose it. With selected notes, each successful action is one atomic musical command. Extending beyond the current visible range updates the derived Auto range consistently across Systems, without persisting a musical range or causing pointer pitch drift. MIDI bounds are 0..127.

## Duration and deletion

Expose whole, half, quarter, eighth and sixteenth values plus Triplet. Use exact Rational durations, independently of the grid's Snap setting. Triplet modifies the selected base duration by exact 2/3; no floating-point rounding. Show exact custom duration when existing selection does not match a preset, rather than silently quantizing it.

The prospective duration/Triplet preference may be retained for the explicit creation paths, but the hidden panel has no cursor-only controls. With selected notes, a duration action applies the same exact chosen duration to all selected notes, preserving their pitches, onsets and owner identities. Delete removes selected Melody notes through the existing atomic command path. Do not add a Harmony Rest button or convert a chord to Rest. Empty selection cannot delete Harmony.

## Atomic commands and validation

Reuse the accepted atomic Melody transaction and effective timeline. First actual edit of generated Melody materializes its effective notes and applies the edit in one transaction/one Undo. A generated destination materializes in that same transaction while preserving its existing notes. Selection, empty cursor, prospective values, preview/cancel and no-op commands never materialize. Retain the generation recipe for explicit Return to generation; Undo restores the exact generated source, recipe, IDs and owners, and Redo restores the edited result.

Each successful selected-note palette pitch action, pitch/group transposition, selected-duration change and Delete is exactly one Undo entry; no-op is zero. Palette-only creation from an empty cursor is excluded because the panel is hidden in that state. Reject the whole action if any affected note would be outside MIDI bounds or have an invalid onset/end beyond progression boundaries; do not partially edit a group. Display a clear local explanation. Preserve exact owner assignment at boundaries, polyphony, collision-safe new IDs, destination instrument, other notes, Harmony, Sections, branches and schema validity. Duration, pitch and time calculations stay Rational. No panel action starts audition; note/chord/Measure/System audition and normal playback remain on their existing explicit targets.

## Keyboard and focus

All controls have accessible names, tooltips where needed and normal keyboard operation, including Enter/Space. Preserve grid navigation/create/edit/delete, note details E, Escape/focus return, and Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and existing Ctrl+Y routing. Do not intercept native partial-text Undo in Inspector inputs. Escape cancels transient editing context/preview appropriately; active gestures remain safe. Panel actions preserve an intelligible active note/cell focus. Responsive reflow keeps focusable controls visible without an internal scroller. No keyboard operation causes incidental audition or a second history entry.

## Verification and handoff

Use real portable Project fixtures and actual UI interactions; do not mutate DOM musical data as test setup or substitute rendered labels for stored-data assertions. Cover empty cursor without creation/Undo, no palette-only empty-cursor creation, explicit double-click/keyboard create paths, single pitch replacement, multiselect interval-preserving transpose, strict scale stepping from altered pitches, octave/half-step bounds, every Rational preset/Triplet independently of Snap, duration for all selected notes, Delete, no-op and whole-action rejection, exact boundary ownership, Rest owners, polyphony and generated source/destination materialization.

Verify fresh portable exported data and one-command Undo/Redo for pitch/onset/duration/IDs/owners/recipe, plus cancellation/no audition/no Project changes for transient UI state. Verify both independent palette/grid combinations, key and scale changes, accessibility/focus, accepted drag/resize/keyboard/audition behavior, Auto range extension and common effective clipping.

Run only focused Vitest with `--maxWorkers=1`, fresh build, relevant Chromium with `--workers=1 --retries=0`, scoped ESLint/Prettier and `git diff --check`. Actually view normal-CSS-scale viewport captures at 1280×720, 1920×1080 and 640×360 in both global themes and both grids, with no selection, cursor-only, selected and multi-selected states, both palette modes and keyboard focus. Check same-row alignment at desktop widths and compact responsive reflow at 640px; verify each control is visible and hit-testable without an internal scroller or page horizontal overflow. Compare vertical snap/bar/beat/subdivision lines at 70%, 120% and 180% zoom with Guides on/off, both themes and grids; the lines must remain visually distinct and aligned without changing note/snap geometry. Music and visible panel controls must sit below the sticky app header; full-page captures are supplementary only.

Handoff includes actual baseline/delta, architecture/provenance, changed files, requirement→implementation→meaningful-test/evidence checklist, exact verification results, visual evidence, protected dirty material and limitations. Do not claim complete release regression. After independent NOTE acceptance, update this plan and only then begin the separately approved CHORD batch. Keep the automation active through separate CHORD implementation/acceptance and the final Staff/Guitar batch/independent acceptance.

## Status

- [x] Prerequisite Batch 3 independently accepted 2026-10-01.
- [x] System note panel implementation and scoped developer handoff complete 2026-10-02. The prior independent review withheld acceptance because Rest-owner and simultaneous polyphony data were not asserted through portable exports; this follow-up adds those assertions and fresh evidence.
- [x] System note panel independently accepted 2026-10-02 after fresh build, 6 focused unit files/37 tests, NOTE Chromium 3/3 and preserved direct-edit/keyboard-create Chromium 2/2; scoped formatting/diff checks passed, ESLint 0 errors/9 existing Hook warnings. Independent review checked runtime-decoded portable owner-collision/Rest/polyphony/history assertions and actual normal-scale 640/1280/1920 viewport captures in both grids/global themes. Full release regression was not run.
- [x] Later System CHORD panel separately authorized and independently accepted 2026-10-02; see [its plan and acceptance record](piano-roll-system-chord-panel-plan.md).
- [x] The separately approved Staff/Guitar display-fix plan was independently accepted 2026-10-02; see [the Staff/Guitar plan](staff-guitar-display-fix-plan.md).
- [ ] Full release regression remains open; see [the current release handoff](release-gate-handoff-2026-10-04.md).

### Developer handoff evidence (2026-10-02)

The dated handoff below records the implementation state at that time. Its pending acceptance statements are superseded by the accepted statuses above; the original verification evidence is retained.

#### Baseline and implementation

Before this batch, the Piano Roll System header showed its System label and measure count without an inline note-editing panel. The panel now shares that header row at desktop widths, with no extra panel frame; compact widths reflow the controls without an inner scroller or header scroll. Owner-scoped note selection is passed through `PianoRollView.tsx`, `ProgressionTrack.tsx` and `ScoreSystemView.tsx` to `PianoRollSystemNotePanel.tsx`. A normal note click selects reliably. The panel only edits pitch and duration, preserves owner/onset, uses the existing commands for one-step Undo/Redo, and does not change grid geometry or snap calculations. `src/styles/progression.css` also strengthens the vertical snap, subdivision, beat and bar lines.

The follow-up review concern about the displayed duration reflecting a prospective creation preference is fixed: the duration and Triplet controls now derive from the selected notes' exact Rational durations. Preset, triplet, custom and mixed selections are represented explicitly; a custom or mixed duration cannot accidentally apply a stale prospective Triplet preference. Abbreviated transpose controls have explanatory tooltips.

#### Requirement → implementation → evidence

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Keep the panel aligned with the System title/count; reflow at narrow widths | Inline header layout in `src/styles/progression.css` | System-panel E2E checks desktop row alignment, compact reflow, visible controls and overflow; captured 1280×720, 1920×1080 and 640×360 layouts |
| Keep an empty-cell cursor transient | The panel is only mounted for selected notes | E2E checks the panel is absent, note count is unchanged and Undo availability is unchanged after cursor placement |
| Show state for the selected notes, not the create preference | Exact Rational selection-derived duration/Triplet; explicit Custom and Mixed states | System-panel E2E seeds a conflicting prospective preference and checks selected-current state, custom/mixed states, deselection and cursor-only behavior |
| Preserve musical data and provenance through edit/history | Existing owner-scoped commands; pitch/duration edits retain IDs, owner, onset and generated source recipe | A real file-input import decodes a valid portable fixture with the same local note ID in two chord Steps and a Harmony Rest, plus two simultaneous onset-0 Rest notes. Runtime-decoded exports after palette, group transpose, duration and Delete compare exact note IDs, pitches, onsets and durations; the other owner and polyphony companions remain unchanged. Project context comparisons preserve Harmony Rest, Sections, track settings/instruments and all non-Melody fields; Undo/Redo exports are checked. |
| Reject unsafe edits atomically and avoid incidental audition | Whole-selection MIDI and progression-end validation; no partial mutation/history entry; no panel audition route | Existing System-panel E2E verifies group rejection/history; the owner-collision fixture instruments actual `AudioBufferSourceNode.start()` and `OscillatorNode.start()`, begins selection with Shift to avoid note audition, and checks no audio start across Enter/Space edits and their keyboard Undo/Redo. |
| Map scale, altered pitch and octave actions correctly | Active tonic/mode palette and scale-aware transpose actions | System-panel E2E covers D minor, altered C♯, next scale step, degree movement and octave mapping in the portable Project |
| Preserve existing creation paths | No change to direct/double-click or keyboard-create flow | Batch 3 Chromium direct-edit/double-click test and keyboard-create-without-audition test both pass |
| Improve grid-line readability without changing note/snap geometry | CSS-only vertical line styling | E2E checks line geometry at 70%, 120% and 180% zoom with Guides on/off; screenshots cover both themes and pitch grids |

#### Changed files in this batch

- `src/ui/melody/PianoRollSystemNotePanel.tsx`
- `src/ui/melody/PianoRollView.tsx`
- `src/ui/progression/ProgressionTrack.tsx`
- `src/ui/staff/ScoreSystemView.tsx`
- `src/styles/progression.css`
- `tests/e2e/piano-roll-system-note-panel.spec.ts`
- `specs/001-cadenceflow-core-studio/piano-roll-system-note-panel-plan.md`

#### Verification

- `pnpm build` — passed; TypeScript and Vite build completed, 451 modules transformed. Vite reported the existing large-chunk advisory.
- Focused Vitest (`piano-roll-batch1`, acceptance, preferences, projection, geometry and pitch-range) — 6 files, 37 tests passed with `--maxWorkers=1`.
- System-panel Chromium E2E — 3/3 passed with `--workers=1 --retries=0`. Includes portable codec import/export for duplicate owner-local IDs, Rest-owner edits and same-onset polyphony; exact pitch/duration/owner assertions, preservation of non-Melody project context, one-step Undo/Redo, Enter/Space, focus return and no-audition checks. The other two tests cover active-scale mapping, preferences, both grids/themes, 1280×720/1920×1080/640×360 responsive states, control visibility/hit-testing, music/chord scroll targets, Guides and line styling.
- Existing Batch 3 direct-edit/double-click and keyboard-create/no-audition E2Es — 2/2 passed.
- Scoped Prettier — passed. Scoped ESLint — 0 errors; 9 React Hook dependency warnings at effect/memo dependency sites in `PianoRollView.tsx` and `ScoreSystemView.tsx`.
- `git diff --check` — exit 0; Git emitted line-ending conversion warnings for the shared dirty checkout. Fresh UI captures are in `test-results/system-note-panel-*.png`; selected-note/chord states were visually inspected at desktop and 640×360 sizes.

#### Limits and acceptance boundary

The panel never edits onset or re-anchors notes, so a generated destination-Step materialization case is not applicable; this batch verifies pitch/duration edits without changing note ownership or onset. Rest-owner preservation and simultaneous same-onset polyphony are now asserted in the owner-collision E2E. The full release suite was not run. These developer checks do not constitute independent acceptance; the acceptance checkbox above intentionally remains unchecked. The checkout contains unrelated dirty and untracked work which was preserved; nothing was staged, committed, pushed or deployed.
