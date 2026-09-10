# Next Developer Assignment — CadenceFlow US12, Batch C

**Assignment:** T170–T171 only

**Do not implement T172+ in this batch.** Do not add/download SoundFont assets, route live audio,
change MIDI/MusicXML export, or run the full test suite.

**Goal:** expose the accepted recipe/command model through an accessible Chord Step context menu and
compact editor, then render its deterministic derived notes on a separate Melody staff above the existing
Piano staff. The existing Piano staff, optional bass staff, Project schema, playback sound, and exports must
remain semantically unchanged.

Authoritative sources:

- `specs/001-cadenceflow-core-studio/spec.md` — US12 and FR-191–FR-207;
- `specs/001-cadenceflow-core-studio/us12-melody-from-chords-plan.md`;
- accepted commands in `src/app/commands/melodyCommands.ts`;
- accepted pure generator in `src/domain/melody/`.

## Preflight and Git scope

1. Work on the accepted baseline containing:
   - `b96929b fix(us12): validate branch melody data and command edges`;
   - `dafb906 docs(status): accept us12 persistence and commands`.
2. Use Node `24.14.0` and pnpm `10.12.4`.
3. Before changes report `git status --short` and `git log -5 --oneline`.
4. Preserve all existing untracked QA/visual-polish files. Do not stage them.
5. Do not edit `spec.md`, `plan.md`, `tasks.md`, or `PROJECT_STATUS.md`; T170/T171 stay unchecked until
   independent review.
6. Do not push.

## T170 — accessible context menu, editor, and track controls

### Chord Step context menu

- Right-clicking any authored Chord Step fragment in My Progression, including a continuation fragment,
  must select its original Step ID and open a context menu anchored near the invocation point.
- The same menu must open from the focused fragment with `Shift+F10` and the Context Menu key.
- Do not expose it for RestStep or the virtual trailing gap.
- Menu content:
  - no recipe: `Create Melody…`;
  - existing recipe: `Edit Melody…` and `Remove Melody`.
- Use semantic `role="menu"`/`role="menuitem"`, correct keyboard focus, Arrow Up/Down, Home/End,
  Enter/Space, Escape, outside-click close, viewport collision handling, and focus restoration to the
  invoking fragment.
- Opening the menu must not create history. `Remove Melody` dispatches the accepted
  `removeMelodyRecipe` path as one Undo operation and keeps/selects the source Step.
- Avoid document-listener leaks and do not let the global Spacebar transport shortcut fire while the menu
  or dialog consumes Space.

### Compact Melody editor

- Open a modal dialog through the existing `useModalFocus` lifecycle. Cancel/Escape must produce no
  Project mutation/history and restore focus to the menu invoker.
- Controls and exact values:
  - Pattern: `up`, `down`, `up-down`, `down-up`, `outside-in`, `inside-out`;
  - Grid: `1`, `1/2`, `1/4`, `1/3`, `1/6` quarter-note beats, with readable musical labels;
  - Octave Offset: integer `-2..2`;
  - Instrument: `flute`, `violin`, `clarinet`, `oboe`, `cello`, `synth-lead`.
- Create initializes from accepted defaults. Edit initializes from the persisted recipe and current Melody
  Track instrument.
- Show a deterministic **notation preview** derived from the selected Chord Step's contextual upper
  voicing. Bass must never enter generator input. Form changes update only local draft and preview.
- Projection failure, including octave overflow beyond MIDI `0..127`, shows a stable inline error, disables
  Apply, and never clamps or mutates the recipe.
- Apply dispatches accepted `setMelodyRecipe` with full recipe and optional Instrument; both changes are
  exactly one Undo entry. Do not persist generated events.
- Do not fake audible preview with Piano. T172/T173 own SoundFont and audio preview. A disabled Preview
  control is allowed only with an accessible explanation; otherwise omit it. Batch C preview is notation.

### Melody Track controls

- In global Staff View show one compact `Melody Track` header only when at least one authored ChordStep
  has a melody recipe.
- Provide Instrument, Mute, Solo, and integer Volume `0..127`, all committing through accepted
  `setMelodyTrackSettings`.
- Mute/Solo are semantic toggle buttons with visible state/accessibility names; accepted mutual exclusion
  must appear immediately.
- Instrument/Mute/Solo each create one Undo entry per committed change.
- A mouse/touch Volume drag creates **one** Undo entry, not one per `input`: keep a local draft and commit
  once on interaction completion/blur. Keyboard changes remain deterministic and accessible.
- Controls wrap compactly without page-level horizontal scrolling.

## T171 — Melody Staff projection and rendering

### Pure UI/notation projection

- Add a deterministic immutable adapter deriving the complete Melody timeline from Project:
  1. realize each Chord Step using the same contextual upper-voicing path as Piano;
  2. exclude independent bass;
  3. call accepted `realizeChordMelody` only for Steps with recipes;
  4. offset events by the Step's exact Rational progression start;
  5. split display fragments at measure boundaries without new authored attacks;
  6. create exact rests for no-melody spans: Chord Steps without recipes, RestSteps, and final virtual gap.
- Preserve duplicate MIDI pitches, exact final-event truncation, source Step ID, event ordinal,
  attack/continuation flags, and Rational timing. Float is allowed only for final screen X coordinates.
- Do not mutate Project, ChordStep, recipe, voicing, or generated events.

### Score layout

- When any recipe exists and the common Progression view is Staff, render a separate full-width Melody
  staff **above** the existing Piano staff inside every measure.
- Label it `Melody` and show the instrument; notation is concert pitch.
- Clefs: Flute, Violin, Clarinet, Oboe, Synth Lead → treble; Cello → bass.
- Use real Meter/measure layout. Include clef, time signature, barline, and padding for ledger lines,
  accidentals, stems, tuplets, and ties without clipping.
- Position notes by exact onset across useful stave width, never centered or equally spaced by item count.
- `1/3` and `1/6` grids render proper tuplets. Empty spans render rests. Cross-bar duration splits and ties
  without looking like a new attack.
- Reuse/extend existing VexFlow adapter and `MeasureStaffView`; no second notation library or serialized
  VexFlow objects.
- Keep Piano staff unchanged below. `View → Show Bass in Staff` affects only Piano presentation. On narrow
  widths Melody has priority; optional Piano bass may collapse by the existing responsive rule.
- Both themes retain white paper and black notation.

### Selection and active-note seam

- Clicking a Melody note selects its source Chord Step. Accessible label includes instrument, pitch, exact
  onset/duration, and source chord.
- Give each generated note stable identity such as `sourceStepId + eventIndex`, permitting independent
  highlighting while preserving existing chord highlighting.
- T173 owns scheduling/playhead. In this batch accept optional `activeMelodyEventKey` (or equivalent exact
  position input) through the Staff boundary and prove only that note highlights.
- Do **not** infer a melody note from `currentStepIndex`; many melody events exist inside one Chord Step.
  If exact beat position is unavailable, leave production input unset and test the presentation seam.

## Hard boundaries

- No Project/schema/migration changes; no generated notes in Project, IndexedDB, presets, or portable data.
- No SoundFont, audio provider/role, live scheduling, MIDI, or MusicXML changes.
- No harmony/bass/Matrix/Temporary Branch semantic changes.
- Preserve global Spacebar transport behavior.
- Prefer focused components/helpers; do not make `App.tsx` or `ProgressionTrack.tsx` monolithic.

## Focused acceptance tests

### Unit/component

- Menu create/edit/remove contents; absent on Rest/gap.
- Pointer and keyboard opening; navigation/activation/Escape/outside close/focus return; no listener leak or
  accidental Spacebar playback.
- Dialog defaults/edit hydration, focus trap, Cancel no-op, validation error, deterministic preview, bass
  exclusion, and Apply as one Undo/Redo entry including Instrument.
- Track visibility and all settings; exactly one history entry per Volume drag.
- Pure timeline for recipe/no-recipe/rest/gap in 4/4, 3/4, 7/8; custom/dotted duration; triplets;
  cross-bar split/tie; exact truncation; immutability/determinism.
- Instrument-clef mapping and complete measure rest filling.
- Only supplied `activeMelodyEventKey` highlights; source chord highlight remains.
- Regression: Piano/bass-view semantics and projects without melody remain unchanged.

### Focused Chromium

Create/edit/remove via pointer and keyboard, Undo/Redo, change every recipe dimension and Instrument,
operate Mute/Solo/Volume, and verify Melody staff above Piano. Include tuplets, a cross-measure case, Cello
bass clef, correct source selection/focus restoration, both themes, and no page-level horizontal scroll at
`1280×720` and `1920×1080`. Use `workers=1`, `retries=0`.

### Run only

1. new melody UI/Staff tests;
2. existing melody projection/command, Measure Staff/VexFlow, and directly affected progression/keyboard
   tests;
3. one focused Chromium spec with `--workers=1 --retries=0`;
4. TypeScript;
5. Prettier check only changed files;
6. `git diff --check`.

Do not run full Vitest, build, lint, or full Chromium. Run a minimum build step only if the focused browser
test requires it and report that fact. Restore dev server HTTP 200 at `http://127.0.0.1:5174/` afterward.

## Commits and report

Prefer:

1. `feat(us12): add melody editor and track controls`
2. `feat(us12): render derived melody staff`

Report commit hashes/file lists; focus/keyboard behavior; one-entry Apply/Volume evidence; instrument-clef
table and exact rest/tuplet/tie examples; bass-exclusion/non-persistence proof; exact focused results with
Chromium retries `0`; final Git/ahead status; HTTP status; and `Spec deviations: none` or full deviations.

**Acceptance condition:** linked recipes can be created/edited/removed accessibly, settings use the accepted
undoable path, and Staff shows a deterministic musically timed Melody system above unchanged Piano notation
without leaking sound/export/schema work into this batch.
