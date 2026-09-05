---

description: "Executable implementation task list for CadenceFlow v1"
---

# Tasks: CadenceFlow Core Composition Studio

**Input**: Design documents from `/specs/001-cadenceflow-core-studio/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Included because the approved specification defines mandatory acceptance scenarios and the implementation plan requires deterministic fixtures, integration tests, Playwright E2E, and MusicXML validation.

**Organization**: Shared setup/foundation first; implementation phases then follow independently testable user stories. P1 stories form the product core; P2 stories complete reusable project, export, and studio UX.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it targets different files and has no dependency on unfinished work in the same phase.
- **[Story]**: Maps the task to the approved user story (`US4A` is preserved as a distinct story).
- Every task names concrete repository paths.

## Path Conventions

- Single browser app at repository root; implementation under `src/`.
- Tests under `tests/unit/`, `tests/integration/`, `tests/e2e/`, and deterministic data under `tests/fixtures/`.
- Build-time utilities under `scripts/`; distributable piano assets under `public/audio/piano-hq/`.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize the single-page TypeScript/React workspace and validation/tooling skeleton from `plan.md`.

- [x] T001 Initialize the Vite + React + TypeScript application and package scripts in `package.json`, `index.html`, and `src/main.tsx`
- [x] T002 Configure strict TypeScript/ESM browser targets in `tsconfig.json`, `tsconfig.app.json`, and `tsconfig.node.json`
- [x] T003 [P] Configure Vite build/dev behavior and static asset handling in `vite.config.ts`
- [x] T004 [P] Configure Vitest and Playwright test runners in `vitest.config.ts` and `playwright.config.ts`
- [x] T005 [P] Configure linting/formatting and repository ignore rules in `eslint.config.js`, `.prettierrc`, and `.gitignore`
- [x] T006 [P] Create the layered source/test directory skeleton from `plan.md` under `src/`, `tests/`, `scripts/`, and `public/`
- [x] T007 [P] Create deterministic fixture verification entry point in `scripts/verify-fixtures.ts` and wire `pnpm verify:fixtures` in `package.json`
- [x] T008 [P] Create offline MusicXML validation script placeholder and local-schema convention in `scripts/validate-musicxml.ts`
- [x] T009 [P] Create the HQ piano-bank preparation script contract and attribution output paths in `scripts/prepare-piano-bank.ts` and `public/licenses/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build canonical semantic types, commands, history, and provider boundaries that every user story depends on.

**⚠️ CRITICAL**: No user-story implementation begins until this phase is complete.

- [x] T010 Implement exact rational arithmetic with normalization/comparison/addition/subtraction in `src/domain/timing/rational.ts` and unit tests in `tests/unit/timing/rational.test.ts`
- [x] T011 [P] Implement canonical pitch identity and `ExactPitch` representation independent of notation spelling in `src/domain/harmony/pitch.ts` and tests in `tests/unit/harmony/pitch.test.ts`
- [x] T012 [P] Implement harmonic function, chord-definition, harmonic-variant, and structured tension types in `src/domain/harmony/functions.ts` and `src/domain/harmony/chord.ts`
- [x] T013 [P] Implement `HarmonicContext`, module-definition contracts, and module/Mode coupling primitives in `src/domain/harmony/modules/types.ts` and `src/domain/harmony/topology.ts`
- [x] T014 [P] Implement canonical `Progression`, `ChordStep`, `RestStep`, and step identifiers in `src/domain/progression/progression.ts` and `src/domain/progression/step.ts`
- [x] T015 [P] Implement `Project`, project defaults, per-module Matrix template-state containers, and schemaVersion fields in `src/domain/project/project.ts` and `src/domain/project/defaults.ts`
- [x] T016 [P] Implement `MusicalDuration`, `GlobalTiming`, meter, and groove value objects in `src/domain/timing/duration.ts`, `src/domain/timing/meter.ts`, and `src/domain/timing/swing.ts`
- [x] T017 [P] Implement `InstrumentProfile` and realization boundary types in `src/instruments/contracts.ts`
- [x] T018 [P] Implement `InstrumentAudioProvider`, `AudioNoteEvent`, playback-scope, and audio-clock contracts in `src/audio/contracts.ts`
- [x] T019 Implement canonical project command interface and immutable command application boundary in `src/app/commands/index.ts` and `src/app/appStore.ts`
- [x] T020 Implement session-scoped Undo/Redo history that is excluded from serialized project state in `src/app/history/history.ts` and tests in `tests/unit/app/history.test.ts`
- [x] T021 [P] Add canonical deterministic fixtures for C Major, D Major, A Tonal Minor, secondary dominant, secondary diminished baseline, N6, and ambiguous module conversion under `tests/fixtures/harmony/`
- [x] T022 Add foundational integration test proving the domain model imports no React/WebAudio/VexFlow/SpessaSynth modules in `tests/integration/architecture-boundaries.test.ts`

---

## Phase 3: User Story 1 - Build a progression from contextual harmonic guidance (Priority: P1) 🎯 MVP

**Goal**: A user can select a tonic/module, preview chords without mutation, see explainable contextual recommendations, switch Card Views, and explicitly add a playable four-step progression.

**Independent Test**: From an empty project, choose C + Progressions, preview `I`, follow recommendations, add four steps with `+`, and verify ordinary card clicks never mutate My Progression.

### Tests

- [x] T023 [P] [US1] Write deterministic tests for Progressions Diatonic Core, Secondary Dominants, Modal Interchange, and stable card positions in `tests/unit/harmony/progressions.test.ts`
- [x] T024 [P] [US1] Write recommendation tests for exactly one Best Match, zero-to-three Alternatives, and non-recommended valid choices in `tests/unit/recommendations/engine.test.ts`
- [x] T025 [P] [US1] Write integration tests for Preview versus explicit `+` Add semantics in `tests/integration/matrix-preview-add.test.ts`
- [x] T026 [P] [US1] Write Playwright acceptance for building a four-step progression from Matrix guidance in `tests/e2e/us1-build-progression.spec.ts`
### Implementation

- [x] T027 [US1] Implement Major Progressions module vocabulary and default topology in `src/domain/harmony/modules/progressions.ts`
- [x] T028 [US1] Implement key-aware enharmonic spelling plus point-level manual spelling override in `src/domain/harmony/spelling.ts`
- [x] T029 [US1] Implement structured chord variants/tensions validation and harmonic-identity preservation rules in `src/domain/harmony/chord.ts`
- [x] T030 [US1] Implement stable Manhattan-routing topology metadata without contextual card reordering in `src/domain/harmony/topology.ts`
- [x] T031 [US1] Implement deterministic contextual recommendation scoring and thresholds in `src/domain/recommendations/engine.ts` and `src/domain/recommendations/scoring.ts`
- [x] T032 [US1] Implement structured recommendation explanation factors and Beginner/Composer/Expert render payloads in `src/domain/recommendations/explanations.ts`
- [x] T033 [US1] Implement Matrix preview/add state and explicit non-mutating card selection commands in `src/app/commands/matrixCommands.ts` and `src/app/appStore.ts`
- [x] T034 [US1] Implement Harmonic Matrix and chord-card shell with explicit `+` action in `src/ui/matrix/HarmonicMatrix.tsx` and `src/ui/chord-card/ChordCard.tsx`
- [x] T035 [US1] Implement `CardViewState` global-view plus per-card override behavior in `src/domain/project/project.ts` and `src/ui/chord-card/CardViewSwitcher.tsx`
- [x] T036 [US1] Implement Harmonic Card View, Piano preview DTO, and Staff preview DTO so Piano/Staff consume the same realized pitches in `src/ui/chord-card/views/`, `src/ui/piano/`, and `src/notation/staffProjection.ts`
- [x] T037 [US1] Implement VexFlow Staff Card View adapter in `src/notation/vexflowAdapter.ts` and `src/ui/staff/StaffCardView.tsx`
- [x] T038 [US1] Implement Inspector recommendation display with expertise-dependent rationale in `src/ui/inspector/RecommendationInspector.tsx`

**Checkpoint**: A user can select a tonic/module, preview chords without mutation, see explainable contextual recommendations, switch Card Views, and explicitly add a playable four-step progression.

---

## Phase 4: User Story 4 - Work in Major and practical Tonal Minor (Priority: P1)

**Goal**: Major and practical Tonal Minor use the same workflow, transposition preserves function/settings, and ambiguous module conversion is never silent.

**Independent Test**: Transpose a C Major progression to D Major, switch to Tonal Minor, and verify unambiguous functions re-realize while an ambiguous chromatic step produces explicit alternatives including Keep Original.

### Tests

- [x] T039 [P] [US4] Write Tonal Minor functional-dominant and leading-tone fixtures/tests in `tests/unit/harmony/tonal-minor.test.ts`
- [x] T040 [P] [US4] Write transposition and Major↔Tonal Minor conversion tests, including ambiguous mappings, in `tests/unit/harmony/module-conversion.test.ts`
- [x] T041 [P] [US4] Write integration test proving step-local performance data survives key/module re-realization in `tests/integration/key-mode-rerealization.test.ts`
### Implementation

- [x] T042 [US4] Implement practical Tonal Minor core realization including `V/V7`, `vii°`, natural-minor `v`, and `VII` variants in `src/domain/harmony/modules/darkHarmony.ts`
- [x] T043 [US4] Implement functional transposition/re-realization and key-change preservation rules in `src/domain/harmony/realization.ts`
- [x] T044 [US4] Implement safe module-conversion result model with unambiguous auto-conversion and ambiguous alternatives/Keep Original in `src/domain/harmony/moduleSwitch.ts`
- [x] T045 [US4] Implement tonic-change and module-change project commands with Undo/Redo support in `src/app/commands/harmonyContextCommands.ts`
- [x] T046 [US4] Write Playwright acceptance for key transposition and ambiguous module conversion in `tests/e2e/us4-major-minor.spec.ts`

**Checkpoint**: Major and practical Tonal Minor use the same workflow, transposition preserves function/settings, and ambiguous module conversion is never silent.

---

## Phase 5: User Story 4A - Switch between Progressions and Dark Harmony modules (Priority: P1)

**Goal**: Progressions and Dark Harmony are first-class module topologies sharing one progression/recommendation engine while retaining independent Dashboard template states.

**Independent Test**: Switch repeatedly between Progressions and Dark Harmony in one project, use each launch topology, and confirm progression data plus each module's Dashboard overrides persist independently.

### Tests

- [x] T047 [P] [US4A] Write Dark Harmony topology tests for Secondary Diminished, Tonal Minor Core, and Neapolitan/Chromatic Colors in `tests/unit/harmony/dark-harmony.test.ts`
- [x] T048 [P] [US4A] Write tests for baseline `vii°7/V`, `vii°7/iv`, `vii°7/VI` plus contextual expanded-strip promotion in `tests/unit/harmony/secondary-diminished.test.ts`
### Implementation

- [x] T049 [US4A] Implement curated Neapolitan/N6, common-tone diminished, passing diminished, and Chromatic Mediants vocabulary in `src/domain/harmony/modules/darkHarmony.ts`
- [x] T050 [US4A] Implement complete secondary-diminished target generation while exposing a stable three-card baseline plus contextual candidates in `src/domain/harmony/modules/darkHarmony.ts` and `src/domain/harmony/topology.ts`
- [x] T051 [US4A] Implement Progressions↔Dark Harmony module switch binding (`Progressions→Major`, `Dark Harmony→Tonal Minor`) and independent per-module Matrix template states in `src/app/commands/harmonyContextCommands.ts` and `src/domain/project/project.ts`
- [x] T052 [US4A] Implement module selector, Dark Harmony layer labels, and stable expanded strip without moving baseline cards in `src/ui/matrix/ModuleSelector.tsx` and `src/ui/matrix/FunctionalLayer.tsx`
- [x] T053 [US4A] Implement Inspector details for Neapolitan/chromatic and secondary-diminished function targets in `src/ui/inspector/HarmonyDetails.tsx`
- [x] T054 [US4A] Write Playwright acceptance for switching modules without losing progression or module-specific Dashboard state in `tests/e2e/us4a-modules.spec.ts`

**Checkpoint**: Progressions and Dark Harmony are first-class module topologies sharing one progression/recommendation engine while retaining independent Dashboard template states.

---

## Phase 6: User Story 2 - Explore multi-step what-if branches without damaging the progression (Priority: P1)

**Goal**: One temporary multi-step branch can start anywhere, accumulate contextual recommendations, compare Original/Alternative, rejoin, and commit wholly or selectively.

**Independent Test**: Start a branch from the middle of a progression, add multiple preview steps, set a rejoin point, compare paths, commit only the intended interval, then Undo the commit.

### Tests

- [x] T055 [P] [US2] Write branch model/rejoin/whole-commit/selective-commit tests in `tests/unit/progression/branch.test.ts`
- [x] T056 [P] [US2] Write recommendation-context tests proving each temporary branch step affects the next ranking in `tests/unit/recommendations/branch-context.test.ts`
### Implementation

- [x] T057 [US2] Implement single-active-branch state, origin index, branch steps, rejoin point, and commit transformations in `src/domain/progression/branch.ts`
- [x] T058 [US2] Implement Composition Intent values and intent-dependent scoring modifiers without hiding valid harmony in `src/domain/recommendations/intents.ts` and `src/domain/recommendations/scoring.ts`
- [x] T059 [US2] Implement branch start/add/rejoin/commit/discard commands with Undo/Redo in `src/app/commands/branchCommands.ts`
- [x] T060 [US2] Implement Original-versus-Alternative branch comparison UI in `src/ui/progression/BranchComparison.tsx`
- [x] T061 [US2] Implement rejoin-point selection and whole/selective commit controls in `src/ui/progression/BranchControls.tsx`
- [x] T062 [US2] Implement Composition Intent control scoped to the active exploration/branch in `src/ui/inspector/CompositionIntentControl.tsx`
- [x] T063 [US2] Write integration test for branch commit followed by Undo restoring the exact original progression in `tests/integration/branch-undo.test.ts`
- [x] T064 [US2] Write Playwright acceptance for mid-progression what-if branching and rejoin in `tests/e2e/us2-branching.spec.ts`

**Checkpoint**: One temporary multi-step branch can start anywhere, accumulate contextual recommendations, compare Original/Alternative, rejoin, and commit wholly or selectively.

---

## Phase 7: User Story 3 - Shape repeated chord occurrences independently (Priority: P1)

**Goal**: Matrix cards are reusable Preview/Add templates while every added Progression Step is an independent snapshot with editable/resettable step-local state.

**Independent Test**: Add the same chord twice, customize each occurrence differently, modify/reset Dashboard templates, reorder steps, replace explicitly, and confirm no unintended cross-mutation.

### Tests

- [x] T065 [P] [US3] Write snapshot/independence/reset/default-inheritance tests in `tests/unit/progression/step-independence.test.ts`
- [x] T066 [P] [US3] Write integration tests for Matrix card overrides following harmonic function across key changes and remaining module-local across module switches in `tests/integration/matrix-template-state.test.ts`
### Implementation

- [x] T067 [US3] Implement per-parameter Project/Piano default resolution and Matrix-card override inheritance in `src/domain/project/defaults.ts`
- [x] T068 [US3] Implement Matrix Preview/Add Template snapshot creation into independent `ChordStep` state in `src/domain/progression/step.ts` and `src/app/commands/progressionCommands.ts`
- [x] T069 [US3] Implement per-card `Reset Card to Defaults`, Ctrl/Cmd-click settings shortcut, and undoable reset command in `src/ui/chord-card/ChordCardSettingsButton.tsx` and `src/app/commands/matrixTemplateCommands.ts`
- [x] T070 [US3] Implement `Reset Current Module` and `Reset All Modules` commands without touching My Progression in `src/app/commands/matrixTemplateCommands.ts` and `src/ui/settings/MatrixResetMenu.tsx`
- [x] T071 [US3] Implement customized-state marker, override count, and Inspector override list in `src/ui/chord-card/CustomizedIndicator.tsx` and `src/ui/inspector/CardTemplateInspector.tsx`
- [x] T072 [US3] Implement explicit `Replace Step` command/action while ordinary Matrix click remains Preview-only in `src/app/commands/progressionCommands.ts` and `src/ui/progression/StepActions.tsx`
- [x] T073 [US3] Implement My Progression drag/drop plus keyboard-accessible reorder commands in `src/ui/progression/ProgressionTrack.tsx` and `src/app/commands/progressionCommands.ts`
- [x] T074 [US3] Implement My Progression per-step editor and step-local Card Views (`Chord`, `Piano`, `Staff`) in `src/ui/progression/ProgressionStepCard.tsx` and `src/ui/progression/StepCardViewSwitcher.tsx`
- [x] T075 [US3] Implement `Reset Step Performance` preserving harmonic identity/variant/tensions, duration, and position in `src/domain/progression/reset.ts` and `src/app/commands/progressionCommands.ts`
- [x] T076 [US3] Write Playwright acceptance for repeated-chord independence, Dashboard reset, explicit Replace Step, and step reset in `tests/e2e/us3-step-independence.spec.ts`

**Checkpoint**: Matrix cards are reusable Preview/Add templates while every added Progression Step is an independent snapshot with editable/resettable step-local state.

---

## Phase 8: User Story 5 - Hear contextual piano voicing and control detailed performance (Priority: P1)

**Goal**: Piano realizes context-aware voicings, manual exact pitches, bass/register/articulation/dynamics, and high-quality velocity-sensitive sample playback.

**Independent Test**: Create two repeated chords with different voicings/dynamics, edit exact pitches and per-note velocity, hear the difference through HQ piano audio, and verify displayed pitches match scheduled pitches.

### Tests

- [x] T077 [P] [US5] Write piano auto-voicing/voice-leading tests with common-tone retention and bounded jumps in `tests/unit/instruments/piano/voice-leading.test.ts`
- [x] T078 [P] [US5] Write manual voicing, bass-separation, register-offset, and playable-range tests in `tests/unit/instruments/piano/realization.test.ts`
- [x] T079 [P] [US5] Write articulation and dynamics/per-note velocity/preset tests in `tests/unit/instruments/piano/performance.test.ts`
- [x] T080 [P] [US5] Write audio-provider contract tests with a mock clock/provider in `tests/integration/audio-provider-contract.test.ts`
### Implementation

- [x] T081 [US5] Implement `PianoInstrumentProfile` realization pipeline in `src/instruments/piano/profile.ts`
- [x] T082 [US5] Implement contextual auto voicing and neighboring-step voice leading in `src/instruments/piano/voicing.ts` and `src/instruments/piano/voiceLeading.ts`
- [x] T083 [US5] Implement manual exact-pitch voicing validation/editor domain operations in `src/instruments/piano/voicing.ts` and `src/ui/piano/PianoVoicingEditor.tsx`
- [x] T084 [US5] Implement independent bass note (`Auto/Root/3rd/5th/Custom`) and bass octave (`Auto/-1/-2`) realization in `src/instruments/piano/bass.ts`
- [x] T085 [US5] Implement step register control (`Auto/-2/-1/0/+1/+2`) in `src/instruments/piano/voicing.ts` and `src/ui/inspector/RegisterControl.tsx`
- [x] T086 [US5] Implement Piano articulations `Block`, `Arp Up`, `Arp Down`, `Broken Chord`, `Humanized` in `src/instruments/piano/articulation.ts`
- [x] T087 [US5] Implement exact Master Velocity, musical dynamic labels, per-note overrides, and dynamics presets in `src/instruments/piano/dynamics.ts`
- [x] T088 [US5] Implement piano performance controls in Inspector in `src/ui/inspector/PianoPerformanceInspector.tsx`
- [x] T089 [US5] Implement canonical performance-event realization consumed by audio/visualization/export in `src/audio/eventRealizer.ts`
- [x] T090 [US5] Implement AudioContext look-ahead scheduler independent of React frames in `src/audio/scheduler.ts`
- [x] T091 [US5] Implement HQ piano manifest, velocity-region selection, bounded pitch mapping, and decoded-sample cache in `src/audio/hq-sample-piano/manifest.ts`, `velocityLayers.ts`, and `sampleCache.ts`
- [x] T092 [US5] Implement lazy-loaded `HqSamplePianoProvider` with loading/fallback/error states in `src/audio/hq-sample-piano/provider.ts`
- [x] T093 [P] [US5] Implement `spessasynth_lib` SF2/SF3 compatibility proof provider behind the same contract in `src/audio/soundfont/spessaProvider.ts`
- [x] T094 [US5] Implement sample-bank preparation/encoding/attribution pipeline in `scripts/prepare-piano-bank.ts`, `public/audio/piano-hq/manifest.json`, and `public/licenses/piano-hq-attribution.txt`
- [x] T095 [US5] Write integration test proving Piano View, Staff View, scheduled audio events, and stored manual voicing use identical exact pitches/velocities in `tests/integration/pitch-projection-consistency.test.ts`
- [x] T096 [US5] Write Playwright acceptance for manual voicing, per-note velocity, dynamics presets, and audible HQ-piano readiness state in `tests/e2e/us5-piano-performance.spec.ts`

**Checkpoint**: Piano realizes context-aware voicings, manual exact pitches, bass/register/articulation/dynamics, and high-quality velocity-sensitive sample playback.

---

## Phase 9: User Story 6 - Build musical timing without becoming a piano roll (Priority: P1)

**Goal**: Exact bars/beats/subdivisions/rests/meter/grouping/swing and step-based transport play consistently with metronome/count-in/loop, without free DAW-style scrub.

**Independent Test**: Use a custom 7/8 (2+2+3) project with chord/rest steps, dotted/triplet durations and swing; Play/Pause/Resume/Stop, Play From Here, loop a range, and verify no loop drift.

### Tests

- [x] T097 [P] [US6] Write exact-duration, dotted, triplet, and bars/beats conversion tests in `tests/unit/timing/duration.test.ts`
- [x] T098 [P] [US6] Write custom meter/grouping and `Reflow` versus `Preserve beat lengths` transformation tests in `tests/unit/timing/meter.test.ts`
- [x] T099 [P] [US6] Write swing and semantic-duration preservation tests in `tests/unit/timing/swing.test.ts`
- [x] T100 [P] [US6] Write timeline/Rest Step/loop-boundary/no-drift tests in `tests/unit/timing/timeline.test.ts`
### Implementation

- [x] T101 [US6] Implement exact duration constructors/parsers for bars, beats, fractional beats, dotted values, and tuplets in `src/domain/timing/duration.ts`
- [x] T102 [US6] Implement custom meter validation, beat grouping, accents, and meter-change transformation policies in `src/domain/timing/meter.ts`
- [x] T103 [US6] Implement project-level Straight/Swing groove timing projection without modifying semantic durations in `src/domain/timing/swing.ts`
- [x] T104 [US6] Implement semantic progression timeline with Rest Steps and step-boundary indexing in `src/domain/timing/timeline.ts`
- [x] T105 [US6] Implement transport state machine for Play/Pause/Resume/Stop/Play From Here with session runtime state in `src/ui/transport/transportStore.ts`
- [x] T106 [US6] Integrate transport with look-ahead audio scheduler and paused-position resumption in `src/audio/scheduler.ts`
- [x] T107 [US6] Implement contiguous loop-region model and Stop reset-to-loop-start semantics in `src/ui/transport/loopState.ts` and `src/ui/progression/ProgressionTrack.tsx`
- [x] T108 [US6] Implement metronome and one-bar default Count-in honoring custom beat grouping in `src/audio/metronome.ts` and `src/ui/transport/MetronomeControls.tsx`
- [x] T109 [US6] Implement Tempo, Time Signature, beat-grouping, duration, swing, loop, and step-based transport controls in `src/ui/transport/TransportBar.tsx`
- [x] T110 [US6] Write integration test comparing semantic timeline with emitted AudioNoteEvents under tempo, swing, rests, and loop boundaries in `tests/integration/timing-audio-projection.test.ts`
- [x] T111 [US6] Write Playwright acceptance for custom meter, Rest Step, swing, count-in, loop region, Pause/Resume/Stop, and Play From Here in `tests/e2e/us6-timing-transport.spec.ts`

**Checkpoint**: Exact bars/beats/subdivisions/rests/meter/grouping/swing and step-based transport play consistently with metronome/count-in/loop, without free DAW-style scrub.

---

## Phase 10: User Story 7 - Use functional presets as reusable composition material (Priority: P2)

**Goal**: Built-in and custom presets store harmonic functions plus durations and can replace, append, or insert in any compatible key/module context.

**Independent Test**: Save a current progression as a Custom Preset, switch key/module, apply it using each insertion mode, and verify no performance settings were embedded.

### Tests

- [x] T112 [P] [US7] Write preset serialization/re-realization/insertion tests in `tests/unit/progression/presets.test.ts`
### Implementation

- [x] T113 [US7] Implement functional preset model with harmonic identities + per-step musical durations only in `src/domain/progression/presets.ts`
- [x] T114 [P] [US7] Implement curated built-in preset catalog data in `src/domain/progression/builtInPresets.ts`
- [x] T115 [US7] Implement Save as Custom Preset command stripping performance realization data in `src/app/commands/presetCommands.ts`
- [x] T116 [US7] Implement `Replace Progression`, `Append to End`, and `Insert at Selected Step` transformations in `src/domain/progression/presets.ts` and `src/app/commands/presetCommands.ts`
- [x] T117 [US7] Implement Presets browser, apply dialog, and Custom Preset save UI in `src/ui/progression/PresetsPanel.tsx` and `src/ui/progression/PresetApplyDialog.tsx`
- [x] T118 [US7] Write Playwright acceptance for cross-key functional preset reuse and all insertion modes in `tests/e2e/us7-presets.spec.ts`

**Checkpoint**: Built-in and custom presets store harmonic functions plus durations and can replace, append, or insert in any compatible key/module context.

---

## Phase 11: User Story 8 - Save and reopen complete work safely (Priority: P2)

**Goal**: Named local projects autosave/recover complete semantic state, and portable `.cadenceflow` files round-trip without session Undo history or audio cache.

**Independent Test**: Create a named project with an active branch and customized steps/cards, reload from autosave, export/import `.cadenceflow`, and confirm a fresh Undo history.

### Tests

- [x] T119 [P] [US8] Write project schema round-trip and unsupported-future-version tests in `tests/unit/persistence/portable-project.test.ts`
- [x] T120 [P] [US8] Write Dexie autosave/recovery tests including active temporary branch in `tests/integration/autosave-recovery.test.ts`
### Implementation

- [ ] T121 [US8] Implement Dexie database schema and project records in `src/persistence/db.ts`
- [ ] T122 [US8] Implement named-project repository list/load/save/delete in `src/persistence/projectRepository.ts`
- [ ] T123 [US8] Implement debounced/transactional autosave excluding Undo/Redo and audio runtime state in `src/persistence/autosave.ts`
- [ ] T124 [US8] Implement `.cadenceflow` JSON codec with JSON Schema validation in `src/persistence/portableProject.ts` using `specs/001-cadenceflow-core-studio/contracts/cadenceflow-project.schema.json` as contract
- [ ] T125 [US8] Implement pure schema-version migration chain and explicit future-version rejection in `src/domain/project/migrations.ts`
- [ ] T126 [US8] Implement new/open/rename/delete project UX and last-session recovery in `src/ui/projects/ProjectManager.tsx`
- [ ] T127 [US8] Implement Save Project As / Export Project / Open Project file interactions in `src/ui/projects/PortableProjectActions.tsx`
- [ ] T128 [US8] Ensure project load/import clears session Undo/Redo history in `src/app/history/history.ts` and `src/app/commands/projectCommands.ts`
- [ ] T129 [US8] Write Playwright acceptance for autosave restart recovery and portable project round-trip in `tests/e2e/us8-persistence.spec.ts`

**Checkpoint**: Named local projects autosave/recover complete semantic state, and portable `.cadenceflow` files round-trip without session Undo history or audio cache.

---

## Phase 12: User Story 9 - Transfer the composition to notation and DAW workflows (Priority: P2)

**Goal**: MIDI and MusicXML are independent projections of the same semantic/performance model and preserve all representable pitches, timing, spelling, velocity, meter, tempo, dynamics, and rests.

**Independent Test**: Export the same fixture to MIDI and MusicXML, validate MusicXML 4.0 locally, parse MIDI fixture output, and compare both against the canonical project/realization rather than against each other.

### Tests

- [ ] T130 [P] [US9] Write MIDI event-projection golden tests for order, exact pitches, rests, timing, velocity, and per-note overrides in `tests/unit/export/midi.test.ts`
- [ ] T131 [P] [US9] Write MusicXML semantic golden tests for spelling, harmony, durations, key/mode, meter, tempo, dynamics, rests, and unsupported-semantic mapping behavior in `tests/unit/export/musicxml.test.ts`
### Implementation

- [ ] T132 [US9] Implement direct semantic/performance-to-MIDI event projection in `src/export/midi/eventProjection.ts`
- [ ] T133 [US9] Implement deterministic Standard MIDI File writer in `src/export/midi/writer.ts`
- [ ] T134 [US9] Implement semantic-to-MusicXML projection independent of MIDI in `src/export/musicxml/projection.ts`
- [ ] T135 [US9] Implement explicit CadenceFlow-to-MusicXML mapping/omission rules in `src/export/musicxml/mapping.ts`
- [ ] T136 [US9] Implement MusicXML 4.0 writer in `src/export/musicxml/writer.ts`
- [ ] T137 [US9] Complete offline MusicXML XSD validation tooling and cached schema fixtures in `scripts/validate-musicxml.ts` and `tests/fixtures/exports/musicxml/`
- [ ] T138 [US9] Implement export commands/UI with empty-progression validation in `src/ui/projects/ExportActions.tsx`
- [ ] T139 [US9] Write integration test comparing playback event realization, MIDI projection, and MusicXML semantic projection to the same canonical fixture in `tests/integration/export-projection-consistency.test.ts`
- [ ] T140 [US9] Write Playwright acceptance for MIDI/MusicXML export availability and empty-project error state in `tests/e2e/us9-export.spec.ts`

**Checkpoint**: MIDI and MusicXML are independent projections of the same semantic/performance model and preserve all representable pitches, timing, spelling, velocity, meter, tempo, dynamics, and rests.

---

## Phase 13: User Story 10 - Work in one focused wide desktop studio (Priority: P2)

**Goal**: The entire composition loop is usable in one full-width desktop workspace with dark/light themes, expertise controls, accessible interaction, and no page-level horizontal scroll.

**Independent Test**: At 1280×720 and 1920×1080, operate Matrix, Inspector, Progression, Piano/Staff views, project/transport controls, theme, and expertise mode using mouse and keyboard without horizontal page scroll.

### Tests

- [ ] T141 [P] [US10] Write Playwright viewport tests for 1280×720 and 1920×1080 with no page-level horizontal scroll in `tests/e2e/us10-desktop-layout.spec.ts`
- [ ] T142 [P] [US10] Write keyboard/accessibility tests for chord cards, `+`, settings/reset, Card Views, reorder, module controls, and transport in `tests/e2e/us10-accessibility.spec.ts`
### Implementation

- [ ] T143 [US10] Implement full-width Studio shell composing Matrix, Inspector, My Progression, and Transport in `src/ui/studio/StudioWorkspace.tsx` and `src/app/App.tsx`
- [ ] T144 [US10] Implement desktop layout/responsive CSS for supported viewport range in `src/styles/studio.css`, `src/styles/matrix.css`, and `src/styles/progression.css`
- [ ] T145 [US10] Implement dark and high-contrast light theme tokens/persistence in `src/styles/tokens.css` and `src/ui/settings/ThemeControl.tsx`
- [ ] T146 [US10] Implement Beginner/Composer/Expert presentation-mode control without feature gating in `src/ui/settings/ExpertiseModeControl.tsx`
- [ ] T147 [US10] Implement global keyboard focus management and accessible names/descriptions for interactive studio controls in `src/ui/studio/focusManagement.ts` and affected UI components
- [ ] T148 [US10] Ensure recommendation state and customized/card-view states use text/icon/shape in addition to color in `src/ui/matrix/` and `src/ui/chord-card/`
- [ ] T149 [US10] Write final Playwright studio journey covering project→compose→branch→edit→play→save→export at both supported viewport extremes in `tests/e2e/us10-studio-journey.spec.ts`

**Checkpoint**: The entire composition loop is usable in one full-width desktop workspace with dark/light themes, expertise controls, accessible interaction, and no page-level horizontal scroll.

---

## Phase 14: Polish & Cross-Cutting Regression

**Purpose**: Close performance, licensing, migration, accessibility, and full-suite acceptance gaps after all selected stories are complete.

- [ ] T150 Run and fix the complete deterministic fixture suite mapped to SC-001..SC-017 in `tests/fixtures/`, `tests/unit/`, and `tests/integration/`
- [ ] T151 [P] Add performance benchmarks for recommendation refresh and ordinary Matrix actions against the <100 ms plan targets in `tests/integration/performance.test.ts`
- [ ] T152 [P] Add long-progression timing/loop soak fixture for drift and scheduler stability in `tests/integration/transport-soak.test.ts`
- [ ] T153 [P] Audit `.cadenceflow` migration fixtures and add at least one prior-schema migration fixture in `tests/fixtures/progressions/`
- [ ] T154 [P] Audit HQ piano attribution/license packaging and production asset manifest in `public/licenses/piano-hq-attribution.txt` and `public/audio/piano-hq/manifest.json`
- [ ] T155 Run production build and bundle/asset-size review; document lazy-audio behavior in `specs/001-cadenceflow-core-studio/quickstart.md`
- [ ] T156 Run full keyboard/accessibility regression and fix critical issues across `src/ui/`
- [ ] T157 Run `pnpm test`, `pnpm verify:fixtures`, `pnpm exec playwright test`, `pnpm build`, and offline MusicXML validation; record final acceptance notes in `specs/001-cadenceflow-core-studio/checklists/implementation-readiness.md`
- [ ] T158 Update `specs/001-cadenceflow-core-studio/quickstart.md` with verified bootstrap/run/test/audio-bank commands from the implemented project

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup** → can start immediately.
- **Phase 2 Foundational** → depends on Phase 1 and blocks all user stories.
- **US1** → first vertical MVP after Foundation.
- **US4** → depends on the US1 Major-domain baseline; adds first-class Tonal Minor and safe re-realization.
- **US4A** → depends on US4 Tonal Minor primitives; adds the Dark Harmony product module/topology.
- **US2** → depends on US1 recommendation/context primitives and foundational progression model.
- **US3** → depends on foundational project defaults + progression steps and US1 Matrix template/add semantics.
- **US5** → depends on US3 step-local performance state; audio projection also converges with US6 semantic timing for transport integration.
- **US6** → depends on foundational exact-time types; scheduler integration can proceed alongside late US5 audio-provider work.
- **US7** → depends on harmonic-function realization (US4/US4A) and progression commands (US3).
- **US8** → repository/codec work can start after Foundation, but final round-trip acceptance depends on state introduced by US2/US3/US5/US6.
- **US9** → depends on canonical realized performance (US5) and exact timeline (US6).
- **US10** → shell work may start earlier, but final acceptance integrates all preceding stories.
- **Phase 14 Polish** → runs after all selected P1/P2 stories.

### User Story Dependency Graph

```text
Setup → Foundation → US1
                    ├─→ US4 → US4A
                    ├─→ US2
                    └─→ US3 → US5 ─┐
                              └─────┼→ US9
Foundation ─────────────────→ US6 ──┘
US3 + US4/US4A ─────────────→ US7
Foundation + accumulated state ────→ US8
All product stories ───────────────→ US10 → Polish
```

### Parallel Opportunities

- Setup configuration tasks marked `[P]` can run concurrently.
- In Foundation, pure domain types, contracts, fixtures, and provider interfaces marked `[P]` can be developed concurrently before store/history integration.
- Within each story, test/fixture tasks marked `[P]` should be authored in parallel before implementation and must initially fail for the intended behavior.
- After Foundation, US2 branch-domain work, US4 Tonal-Minor work, and parts of US3 template-state work can proceed concurrently if different developers own them; integrate against US1 contracts.
- US5 piano realization and US6 timing can proceed largely in parallel, converging at `src/audio/eventRealizer.ts` / `src/audio/scheduler.ts`.
- US8 persistence infrastructure can begin early, but its final acceptance fixture should be refreshed after all persisted state shapes stabilize.

## Milestone / Delivery Strategy

### Milestone 1 — Playable Harmonic MVP
Complete Phases 1–3. Exit when C Major Progressions can preview/recommend/add four independent steps and deterministic US1 tests pass.

### Milestone 2 — Dual Harmonic Modules + Safe Exploration
Complete Phases 4–6. Exit when Major/Tonal Minor conversion, Dark Harmony, contextual secondary diminished, and multi-step branch/rejoin all pass acceptance.

### Milestone 3 — Independent Performance + Real Piano
Complete Phases 7–8. Exit when repeated steps remain independent and HQ velocity-sensitive piano playback matches visualized exact pitches.

### Milestone 4 — Musical Time + Transport
Complete Phase 9. Exit when custom meter/grouping, rests, swing, metronome/count-in, loop, and step-based transport pass no-drift acceptance.

### Milestone 5 — Reuse, Persistence, Interchange
Complete Phases 10–12. Exit when presets, autosave/portable projects, MIDI, and MusicXML round-trip/validation are stable.

### Milestone 6 — Studio UX + Release Candidate
Complete Phases 13–14. Exit when desktop/a11y/performance/full regression pass SC-001..SC-017.

## MVP First

1. Complete Setup and Foundation.
2. Complete US1 only.
3. Run `pnpm test`, `pnpm verify:fixtures`, and the US1 Playwright acceptance.
4. Demo the first vertical slice before expanding to Tonal Minor/Dark Harmony.
5. Continue milestone-by-milestone; do not start Scales, Blues, Guitar production profile, rendered WAV/MP3, cloud sync, or other future-scope work.

## Notes

- `Progressions` and `Dark Harmony` are v1 harmonic modules; `Scales` and `Blues` remain future modules.
- Piano is the only production Instrument Profile in v1; Guitar Card View/profile remains future capability.
- HQ piano quality is mandatory, but the harmonic/project model must not depend on a specific SoundFont or sample-bank format.
- No task may serialize Undo/Redo history into project/autosave/`.cadenceflow` data.
- No task may silently map ambiguous harmonic content during module/mode changes.
- MIDI and MusicXML must project from canonical semantics independently; neither is reconstructed from the other.
- `spec.md` remains the product authority; if implementation reveals a product ambiguity, return to clarification rather than silently inventing behavior.
