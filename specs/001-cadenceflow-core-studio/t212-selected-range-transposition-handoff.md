# T212 selected-range transposition — implementation handoff

Date: 2026-10-03 (Europe/Prague). Owner: implementation checkout. Reviewer/independent acceptance: pending.

T212 is implemented in the existing working tree and ready for root review. This handoff does not accept the task. The T212 checklist item remains unchecked; T213/T214 and release acceptance remain outside scope.

The accepted T210 source context is recorded at `specs/001-cadenceflow-core-studio/t210-web-midi-step-input-independent-acceptance.md` for this same `C:/Projects/cadenceflow` workspace and published HEAD `f801562794b39ff3d039b56e0010829aff9a1b2b`; it was an uncommitted working-tree acceptance, not a separate clean worktree. There is no isolated T210-only source snapshot path. The current T212 layer now shares several of those source files, so HEAD is the published baseline, while the report is the T210 acceptance record.

## Implementation

- Persisted an additive `transpositionSemitones` offset on Chord and Rest Steps. Schema v10 migration gives existing saved and temporary-branch Steps identity offset; portable encoding, decoding and strict schema validation preserve the field.
- Centralized exact pitch/frame conversions, boundary compensation and spelling policy in `domain/progression/transposition.ts`. Source-frame ordered realizations keep later automatic voicing context unchanged while effective Harmony, bass, Melody, Staff/TAB, audio and MusicXML use each owner's concert pitch.
- Added one atomic selected-stable-ID range command with full-state MIDI-bound validation, generated-Melody context preservation/materialization, and one Undo/Redo transaction. The toolbar uses a draft preview; Apply mutates once, while Cancel and Escape do not mutate.
- Routed concert-pitch Piano Roll, Staff and MIDI note edits back through the destination Step's source frame. Existing note spelling survives unchanged-MIDI edits; noncanonical enharmonic concert spelling uses the persisted matching override. Generated notes retain source MIDI identity when materialized.
- Kept Piano Roll chord/range selection transient. This avoids changing `selectedStepId` and `updatedAt` as a side effect of selection, preserving exact snapshots and Undo/Redo. Timeline reanchoring now leaves authored notes without `sourcePitchMidi` untouched; it retains explicit metadata and adds source identity for materialized generated notes only.
- Made voice-leading optimization offset-aware: `smooth-all` evaluates each chord in concert pitch, while tonic/dominant pedal strategies store the inverse-transposed source-frame bass pitch so every owner sounds the same concert pedal.

## Requirement, code and test mapping

| Requirement | Code | Verification |
| --- | --- | --- |
| Persist a local semitone offset on Chord/Rest Steps; migrate older projects and preserve portable round-trips | `src/domain/progression/step.ts`; `src/domain/project/migrations.ts`; `src/persistence/portableProject.ts`; `src/domain/progression/transposition.ts` | `tests/unit/persistence/t212-transposition-schema.test.ts`; `tests/unit/progression/transposition.test.ts`; imported/exported T212 E2E projects |
| Apply a selected stable-ID range atomically; support positive/negative, octave and additive offsets; zero is a no-op; reject invalid output without history | `src/app/commands/rangeTranspositionCommands.ts`; `src/app/commands/progressionCommands.ts`; `src/ui/progression/RangeSelectionToolbar.tsx` | `tests/unit/app/range-transposition.test.ts`; `tests/e2e/t212-range-transposition.spec.ts` Apply/Cancel/Escape and Undo/Redo cases |
| Transpose authored Chord and Rest Melody plus selected generated Melody while preserving note IDs, source recipe and unselected context | `src/app/commands/rangeTranspositionCommands.ts`; `src/domain/melody/effectiveTimeline.ts`; `src/app/commands/authoredMelodyTransaction.ts` | `tests/unit/app/range-transposition.test.ts` selected Rest/authored/generated and unchanged unselected generated phrase cases |
| Keep manual voicing, custom bass, Piano Roll edits, MIDI insertion and cross-owner clipboard in concert pitch while persisting each destination owner's source pitch | `src/domain/progression/transposition.ts`; `src/instruments/piano/profile.ts`; `src/ui/inspector/PianoPerformanceInspector.tsx`; `src/ui/melody/PianoRollView.tsx`; `src/app/commands/authoredMelodyTransaction.ts` | `tests/unit/app/range-transposition.test.ts`; T212 Chromium mocked-MIDI and different-offset clipboard cases; both assert stored and sounding MIDI |
| Keep playback, Staff, MIDI and MusicXML at the same concert pitch | `src/audio/eventRealizer.ts`; `src/audio/melodyPerformance.ts`; `src/notation/melodyStaffProjection.ts`; `src/export/midi/eventProjection.ts`; `src/export/musicxml/projection.ts` | `tests/unit/progression/t212-concert-pitch-consumers.test.ts` compares chord playback/MIDI/MusicXML plus authored Melody playback/Staff/MIDI/MusicXML |
| Preserve optimization semantics for differently transposed owners | `src/domain/progression/voiceLeadingOptimizer.ts` | `tests/unit/progression/voice-leading-optimizer.test.ts` verifies concert-pitch tonic/dominant pedals and smooth-all candidate selection |
| Show the same selected range/local marker in all six views; keep editor usable at compact and desktop sizes | `src/ui/progression/RangeSelectionToolbar.tsx`; `src/ui/progression/StepTranspositionBadge.tsx`; `src/ui/staff/ScoreSystemView.tsx`; `src/ui/melody/PianoRollView.tsx` | `tests/e2e/t212-range-transposition.spec.ts` six-view test and six dark/light viewport captures |

## Verification

| Check | Result |
| --- | --- |
| `pnpm run build` (includes `tsc -b`) | Passed; 461 modules built. Existing large-chunk warning remains (2.627 MB JS). Vite completed in 3m 6s, with 168.2s in `vite:prepare-out-dir`'s `renderStart` hook. A final `pnpm exec tsc -b` also passed after lint cleanup. |
| `pnpm exec vitest run tests/unit/app/range-transposition.test.ts tests/unit/progression/transposition.test.ts tests/unit/progression/voice-leading-optimizer.test.ts tests/unit/progression/t212-concert-pitch-consumers.test.ts tests/unit/persistence/t212-transposition-schema.test.ts --maxWorkers=1` | 5 files, 27 tests passed, including source-frame bounds, selected Rest/authored/generated phrases, manual voicing/custom bass, failed-command history atomicity, pedal strategies, and projection parity. |
| `pnpm exec playwright test tests/e2e/t212-range-transposition.spec.ts --project=chromium --workers=1 --retries=0` | 5/5 passed. Includes mocked MIDI under a +2 owner offset with save/reload, clipboard paste from +2 to -3 owner offsets with Undo/Redo and portable reopen, Apply/Cancel/Escape, six-view output, and screenshot capture. |
| `pnpm exec playwright test tests/e2e/t210-web-midi-step-input.spec.ts tests/e2e/t215-measure-context-menu.spec.ts tests/e2e/piano-roll-system-chord-portable.spec.ts tests/e2e/t202-range-selection.spec.ts --project=chromium --workers=1 --retries=0` | 62/62 passed, no retries. This covers the protected portable chord Undo/Redo, duration ripple, generated Split, T210 MIDI, T215 measure menu and T202 range selection cases. |
| `git diff --check` | Passed. |
| Scoped Prettier check for T212 docs, modules, optimizer changes and T212 tests | Scoped checks pass with five pre-existing formatting hotspots excluded. Whole-file checks flag `src/domain/progression/voiceLeadingOptimizer.ts`, `src/domain/project/migrations.ts`, `src/ui/inspector/PianoPerformanceInspector.tsx`, `src/ui/melody/MelodyStaffView.tsx` and `tests/unit/progression/voice-leading-optimizer.test.ts` for untouched shared/legacy lines; the T212 hunks in those files were compared to Prettier output and kept formatted. |

Scoped ESLint ran on 16 T212 source/test paths with the repository flat config: **0 errors and 3 existing `react-hooks/exhaustive-deps` warnings** in unchanged Piano Roll effects. Cold config initialization loads 291 rules slowly on this host; the scoped lint completed after initialization. Removed five unused imports/variables discovered in the first scoped pass.

## Visual evidence

The six screenshots are under `artifacts/validation/t212-transposition/screenshots/`, with filenames `range-editor-{640x360,1280x720,1920x1080}-{dark,light}.png`. I inspected all six regenerated captures. At 640×360 the dialog remains below the app header, fully within the viewport, with the Semitones field and Apply/Cancel visible; no internal dialog scrolling is needed. At 1280×720 and 1920×1080 the dialog and controls also fit within the viewport in both themes. Contrast and selected-state indicators remain legible.

## Acceptance boundary and working-tree state

The T215 independent acceptance report records two existing chord-panel geometry failures on published HEAD (`piano-roll-system-chord-panel.spec.ts:279`, 25.1953125 px versus `<1`; and `:176`, zero visible chords versus `>0`) plus the separate Staff count-in playhead defect. Those baseline results are not counted as T212 passes. The 62-test batch above does not include the chord-panel file. No full suite or physical MIDI device test was run; MIDI E2E is mocked.

HEAD remains `f801562794b39ff3d039b56e0010829aff9a1b2b` on `master...origin/master`; the Git index is empty. Existing T210/T215 changes, evidence, untracked files, and the protected 62-line addition in `piano-roll-system-chord-portable.spec.ts` remain in the worktree. Nothing was staged, committed, pushed, deployed, cleaned up, or marked independently accepted.
