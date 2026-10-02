# Staff/Guitar display fix — approved separate batch

## Authorization and baseline

Start only after independently accepted Piano Roll batch 3, System NOTE and System CHORD. These gates are now accepted. Implement in the existing GPT-6 Luna developer thread, as a separate batch. Preserve all accepted Piano Roll behavior and all foreign tracked/untracked dirty work. No staging, commit, push, deployment, full suite, adjacent tasks, system voice leading, new Staff/Guitar editing, or Project schema change.

The user's original `C:/Users/pavel/Downloads/first.cadenceflow` is protected. Copy it unchanged into a regression fixture; never modify the original. It decodes as schema 9 with eight measures and 24 notes, including dotted/long cross-bar and simultaneous notes. Audio already sounds correct: the problem is incorrect notation and a jumping visual playhead. Existing 5/2 values appear as quarter glyphs despite exact internal ticks, dots are not explicitly attached, TAB disables stems, the merged Harmony/Melody TAB branch omits beams/tuplets/ties, and Staff playhead interpolation targets the next event and falls back to Harmony in rests.

## 1. Shared exact rhythmic projection

Introduce a derived layer between the common effective Melody timeline and VexFlow, without changing stored source events or Project. Decompose onset and effective duration using meter grouping and bar boundaries into real written note values, dots, rests, triplets and tied fragments. Support ordinary, dotted and composite durations, every standard duration/triplet and all exact Rational values beyond the standard grid. Nonstandard denominators require exact explicit tuplet-ratio groups; never round or display a fake quarter for a custom duration.

Fragment durations must sum exactly to the effective original duration. This is rendering only and must not introduce audio attacks. Each fragment retains owner-scoped source identity, absolute onset, exact duration, rhythmic voice, written value and continuation links. Group pitches with identical onset and rhythm into a chord; independent overlapping rhythms need separate voices and must never serialize polyphony. Integrate the shared projection into `melodyStaffProjection.ts`, `vexflowAdapter.ts` and `ScoreSystemView.tsx`.

## 2. Staff and rhythmic Guitar TAB

Staff must render real attached dots, flags, meter-aware beams, rests and tuplets. Tie fragments of the same source event within a measure, across measures and across systems. Distinct repeated events with the same pitch must not be tied. Harmony, Melody, voices and hit regions share horizontal geometry. Dense measures grow in width rather than colliding glyphs.

Replace the current Guitar TAB rendering with rhythmic TAB: retain six strings and fret numbers, and add stems, flags, beams, dots, rhythmic rests, tuplets and hold ties. Do not add a separate musical staff above it. Use the same exact projection, including the merged Harmony/Melody branch. Tied fragments retain the same fret/string and do not receive new fingering or attacks. Never drop musical events because string placement conflicts; explicitly mark impossible combinations while preserving the original music.

## 3. Continuous audio-clock playhead and sounding highlights

The existing playback controller publishes a shared time snapshot containing session ID, actual audio-clock anchor, musical start, tempo, bounds and state. Derive absolute musical position from the actual audio clock and map it through common measure geometry, never toward the next note destination. Movement stays continuous through rests, holds and chord changes; system transitions and loop resets obey exact time bounds.

Highlight all sounding source notes from their effective intervals independently of selection. Rendered ties/fragments must not restart source-event highlights. Pause freezes position, resume continues, and stop, finish and replacement clear it. Handle count-in, Play From Here, loops and view changes. Preserve the existing audio scheduler, instruments and correct sound; do not introduce per-note visual timers.

## 4. Independent verification and handoff

Use the unchanged copied user project as a real regression fixture: 5/2 G4 in measure 2, dotted 3/2 values, 9/2 G4 across measures 7–8, rests and simultaneous C4/G3 in the last measure. Cover standard durations, all triplets, nonstandard Rational values, independent overlap voices and cross-system continuation. Verify exact sums, onset/duration/source identity, actual dots/flags/beams/tuplets/ties, no extra attacks, and no Project/history/export mutation.

Use controlled audio clocks to verify continuous movement between attacks and through rests, pause/resume, loops, delayed preparation, stop/replacement and view changes. Actually view normal-CSS-scale Staff and Guitar captures at 1280×720, 1920×1080 and 640×360 in both global themes, including active playback and scroll states. Full-page captures are supplementary.

Run focused Vitest with `--maxWorkers=1`, a fresh build, relevant Chromium with `--workers=1 --retries=0`, scoped ESLint/Prettier and `git diff --check`. No full repository suite. Provide baseline/delta/architecture/provenance, requirement-to-code-to-test evidence, changed files, exact checks and protected Git state. Independent reviewer acceptance is required; only after successful final Staff/Guitar acceptance mark this status and pause the existing automation. Do not claim full release regression.

## Status

- [x] Prior Piano Roll / NOTE / CHORD independent gates accepted.
- [x] Separate Staff/Guitar implementation dispatched.
- [x] Developer implementation and complete handoff.
- [x] Independent Staff/Guitar acceptance.
- [x] Existing automation paused after final acceptance.

## Developer handoff evidence — 2026-10-02

### Requirement-to-code trace

- Exact written values, dots, rests, tuplets, tie fragments, and their durations are projected in `src/export/musicxml/projection.ts` and serialized by `src/export/musicxml/writer.ts`. The original portable project and the original supplied MusicXML are retained as fixtures under `tests/fixtures/exports/musicxml/real-project-8/`; `tests/unit/export/musicxml.test.ts` compares semantic event timelines, reconstructs ties, and validates notation durations. The protected Staff/Guitar project remains `tests/fixtures/staff-guitar-first.cadenceflow`.
- Staff, rhythmic TAB, shared audio-clock highlighting, Harmony deletion into same-duration Rest, exact resize ownership, melody-preserving chord merges, and Rest ties are implemented in the existing Piano Roll/Staff command and view paths. The focused regressions live in `tests/e2e/staff-guitar-audio-clock.spec.ts`, `tests/e2e/piano-roll-system-chord-portable.spec.ts`, `tests/e2e/us10-progression-remove.spec.ts`, and the corresponding melody, notation, audio-clock, and export unit tests.
- The Piano Roll chord band draws its vertical measure/beat/subdivision grid from the note-grid projection in `src/ui/melody/PianoRollView.tsx`. Real edge hit targets, edge cursors, same-measure transfer, cross-measure Rest creation, cancellation and exact barline restoration are covered by `tests/e2e/piano-roll-system-chord-portable.spec.ts`.
- The NOTE controls stay in the System header row on desktop and use the compact layout at narrow widths through `src/styles/progression.css`; the existing compact viewport behavior remains covered by `tests/e2e/piano-roll-system-note-panel.spec.ts`.

### Verification completed

- Focused Chromium on the fresh production build: `tests/e2e/piano-roll-system-chord-portable.spec.ts` — 26/26 passed. The Rest-only first measure → second-measure chord case shrinks the chord from four beats to two, leaves an exact six-beat Rest, keeps the next chord at beat 8, and restores the left edge to the original barline. The same run verifies chord+Rest ties in both orders, deletion, guides, exact undo/redo, resize cursors, and shared-grid alignment while zoomed and scrolled.
- The final focused Chromium set across NOTE panel, Harmony removal, duration resize, range selection, Staff interactions, and Staff/Guitar clock behavior — 37/37 passed. A refreshed complete `tests/e2e/staff-guitar-audio-clock.spec.ts` run — 3/3 passed, including delayed sample fetch, pause/resume/stop, a one-measure loop wrap, Count-in hiding the playhead until playback starts, and Play from this System replacing the prior loop session.
- `tests/e2e/us6-timing-transport.spec.ts --grep="Scenario 5"` — 1/1 passed for Play From Here with Count-in. `tests/e2e/piano-roll-system-chord-portable.spec.ts` also verifies that tying a chord to a same-measure Rest consumes the entire Rest in either order, preserves Melody and downstream onset, avoids an extra Harmony attack, and restores exact portable bytes through Undo/Redo.
- The current focused Vitest runs cover 11 files and 147 tests: notation projection/VexFlow, MusicXML projection and validation, chord commands, Piano Roll behavior, playback controllers/audition, progression selection/sections, authored Melody commands, and tablature.
- Actual normal-CSS captures for Staff and rhythmic TAB at 1280×720, 1920×1080, and 640×360 in both themes, plus active playback, were viewed and retained in `artifacts/validation/staff-guitar/`. The four NOTE panel captures at 1280×720 and 640×360 were viewed and retained in `artifacts/validation/note-panel/`; desktop keeps System, measure count, and controls on one row, while the compact viewport wraps without horizontal scrolling. The 1280×900 chord shrink/re-expansion captures are in `artifacts/validation/chord-resize/`.
- A fresh `pnpm run build` passed after the runtime edits; the existing large-chunk advisory remains. Scoped ESLint reported zero errors and six React Hook dependency warnings. Scoped Prettier passes after formatting, and `git diff --check` passes.
- `pnpm exec tsx scripts/validate-musicxml.ts artifacts/exports/musicxml/8.fixed.musicxml` reports valid MusicXML 4.0. The retained real-project inputs match the hashes in their README. The protected Staff/Guitar fixture SHA-256 remains `032D1177CDB42E39A0A818C2ECA3924F316F3B4C6CC7DE571682125DB037C297`.

This is the developer handoff only. Independent Staff/Guitar acceptance and pausing the existing automation remain outstanding.

### Follow-up verification — 2026-10-02

- Fixed cross-voice tick placement in `src/notation/vexflowAdapter.ts`: each rhythmic voice now includes exact-duration invisible gaps up to later entry onsets. VexFlow therefore keeps a note at the start of a measure separate from a Rest beginning on beat 2, while preserving exact source tie fragments. `tests/unit/notation/vexflow-adapter.test.ts` checks the tied G4 and later Rest positions in one system; `tests/e2e/staff-guitar-audio-clock.spec.ts` checks the same separation in the protected first-project fixture.
- The same-measure chord-to-Rest Tie contract remains verified in both entry orders: the chord occupies the full Rest, downstream Melody onset and sound stay intact, and one Undo/Redo restores the exact portable project. The Rest-only first measure → chord in measure 2 resize regression also passes: shrinking the left edge to beat 6 and returning to beat 4 restores the original barline without moving the following chord at beat 8.
- Final focused Chromium verification after the renderer change: `tests/e2e/staff-guitar-audio-clock.spec.ts` — 3/3 passed; `tests/e2e/piano-roll-system-chord-portable.spec.ts` — 26/26 passed. The actual G4 continuation and beat-2 Rest are separated by more than 20 CSS pixels in the protected project fixture.
- Final focused Vitest verification: 13 relevant files, 179 tests passed with `--maxWorkers=1`. The `vexflow-adapter.test.ts` file includes 37 passed tests. JSDOM's existing missing-canvas implementation warnings were emitted; test exit status and pass counts are green.
- Refreshed production build passed after the renderer change (454 modules; existing large-chunk advisory only). Scoped ESLint on the changed adapter and its two focused tests passed; Prettier check on those files and this plan passed; `git diff --check` passed.
- The latest browser run saved 13 actual playback captures—Staff and rhythmic TAB at 640×360, 1280×720, and 1920×1080 in dark and light themes, plus an active-Melody 1280×720 capture—in `artifacts/validation/staff-guitar/2026-10-02-voice-spacing-final/`. Each capture was visually inspected, including all four 640×360 combinations. The 640×360 views now show score notation or tablature, note glyphs, and the active playhead instead of a blank score area.
- The protected fixture SHA-256 remains `032D1177CDB42E39A0A818C2ECA3924F316F3B4C6CC7DE571682125DB037C297`. Independent Staff/Guitar acceptance remains pending; do not pause the existing automation until that acceptance is recorded.

### Final independent acceptance — 2026-10-02, developer cursor 253

The complete Staff/Guitar scope, latest authorized Piano Roll amendments and MusicXML repair are independently accepted. This supersedes the earlier pending reviewer decisions above.

- Independent review 247 passed 119 focused unit tests and 32 Chromium scenarios (26 CHORD, 3 NOTE, 3 Staff clock). The subsequent renderer correction passed a fresh 454-module build, 80 focused notation/export unit tests and the 3 Staff/Guitar Chromium scenarios again, with one worker and no retries. Scoped adapter/test ESLint and Prettier and `git diff --check` passed.
- The final renderer separates the measure-8 G4 continuation from the later Rest. Real dots, attached internal and cross-bar ties, beams, rests, rhythmic TAB and active playheads were visually inspected. The reviewer actually viewed all 12 fresh normal-scale active captures at 1920×1080, 1280×720 and 640×360 in both themes: `artifacts/validation/reviewer-253-active-*.png`. Narrow captures are scrolled viewport samples, supplemented by the developer's final glyph captures; they do not assert that the whole score fits a 360-pixel viewport.
- Protected input hashes remained unchanged in independent review. The repaired `artifacts/exports/musicxml/8.fixed.musicxml` passed MusicXML 4.0 validation and independent semantic timeline/written-value tests. Correct counts are 24 source events, 25 original XML fragments and 27 repaired fragments; ties reconstruct the same 24 events. External-player audio was not independently auditioned.
- Baseline `bd29330`, all subsequent dirty work and the root T214 backlog-only hunk are preserved. No further staging, commit, push, deployment or full repository suite was performed. This is scoped independent acceptance, not a full release regression claim.
