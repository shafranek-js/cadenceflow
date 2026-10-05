# Piano Roll chord cards — 2026-10-05

Implemented global, independently switchable Show piano / Show guitar chord controls in every Piano Roll System header. Both default off and persist in optional local storage (`cadenceflow.pianoRollChordCards`), outside Project and Undo. Existing PianoCardView/GuitarCardView render the effective chord, inversion/bass, transposition and corresponding instrument presentation settings. Piano is above Guitar. Cards repeat at Measure continuations, keep exact fragment widths and shrink proportionally without increasing grid width. Rest/gap cells contain no instrument image. Click selects/auditions via the existing harmony callback; Shift-click extends selection without audition. Selection and transport state are shared with the harmony strip.

Changed for this feature: src/ui/melody/PianoRollChordCards.tsx, src/ui/melody/chordCardPreferences.ts, src/ui/melody/PianoRollView.tsx, src/ui/progression/ProgressionTrack.tsx, src/ui/staff/ScoreSystemView.tsx, src/styles/progression.css, tests/e2e/piano-roll-system-chord-panel.spec.ts. Prior unrelated dirty changes remain preserved; nothing staged, committed, pushed or deployed.

## Verification

- `pnpm run build`: passed, 467 modules. Existing large-chunk warning. Final assets index-wBjnu77o.css / index-DxRfYDXV.js.
- `pnpm exec playwright test tests/e2e/piano-roll-system-chord-panel.spec.ts tests/e2e/piano-roll-group-note-selection.spec.ts --project=chromium --workers=1 --retries=0 --output C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4f-d564-7612-8b29-bc59c92804cc/instrument-cards-regression`: 13 passed, 1 failed because the new comparison fixture removed Steps still referenced by Song Sections. Fixed the fixture to retain those Steps.
- `pnpm exec playwright test tests/e2e/piano-roll-system-chord-panel.spec.ts --grep 'embedded chord cards' --project=chromium --workers=1 --retries=0 --output C:/Users/pavel/.codex/visualizations/2026/10/02/01a0fd4f-d564-7612-8b29-bc59c92804cc/instrument-cards-realization`: remaining comparison passed. All 14 focused scenarios now have passing evidence. Comparison checks actual active piano pitches and guitar frets/symbol against standalone views for a transposed inverted chord.
- `pnpm exec vitest run tests/unit/ui/piano-card-view.test.ts tests/unit/ui/guitar-card-view.test.ts tests/unit/instruments/guitar/voicings.test.ts tests/unit/melody/piano-roll-preferences.test.ts --maxWorkers=1`: clean rerun 4 files / 28 tests passed. Initial run had a fork-worker startup timeout; no code change was needed.
- Scoped ESLint: no errors; only three pre-existing PianoRollView hook dependency warnings. New files and changed test have zero warnings.
- Scoped Prettier check and `git diff --check`: passed.

The card test covers all four combinations, global synchronization, local persistence, continuation selection, Shift-click, unchanged portable Project data, and fitting a sixteenth-note chord. A guarded preview-controller spy verifies ordinary card click auditions once and Shift-click remains silent. Actual audible output was not independently listened to; the existing audio path is reused.

## Visual evidence

Normal viewport screenshots retained here for 640x360, 1280x720 and 1920x1080, Dark and Light. The plain filenames show the System header; `-piano` and `-guitar` captures scroll the corresponding row into the existing Studio scrollport. All six size/theme combinations were visually inspected, including the tiny scaled card, selected card contrast and stacked rows. At 640x360 the header and full card cannot fit together vertically; normal Studio scrolling reveals the cards without page overflow. Very short chords intentionally produce tiny diagrams, as requested. No full-suite/release acceptance is claimed.
