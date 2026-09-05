# CadenceFlow — Project Status / Development Handoff

**Handoff date:** 2026-09-05  
**Current implementation stage:** Phase 10 / User Story 7 (Presets) IN PROGRESS; T112–T114 accepted  
**Task progress:** T001–T114 complete, 114 / 158 total tasks  
**Authoritative feature:** `specs/001-cadenceflow-core-studio/`

## 1. Current goal

Continue CadenceFlow v1 as a desktop-first harmonic composition studio without changing the approved product scope. User Story 5 (**HQ Piano Realization, Performance Controls & Audio Backend**) and User Story 6 (**Exact Musical Timing & Transport Runtime**) are fully accepted across all tasks T077–T111.

The previous milestone **Phase 9: User Story 6** is **ACCEPTED / COMPLETE** across all tasks T097–T111.
The current milestone is **Phase 10: User Story 7** — functional presets (T112–T118) — **IN PROGRESS (T112–T114 complete, 114 / 158)**.

## 2. Sources of truth

Use the following precedence when requirements appear ambiguous:

1. `specs/001-cadenceflow-core-studio/spec.md` — approved product requirements.
2. `specs/001-cadenceflow-core-studio/tasks.md` — implementation sequence and task IDs.
3. `specs/001-cadenceflow-core-studio/plan.md`, `data-model.md`, `contracts/` — technical architecture and contracts.
4. `reference/cadenceflow.html` — original CadenceFlow prototype/reference behavior and visual intent.
5. Older ChordLab material is **not** a v1 source of requirements unless a capability was explicitly adopted into `spec.md`.

Current spec verification:

- 1077 lines.
- FR-001 through FR-182: 182 unique functional requirements.
- SC-001 through SC-017: 17 unique success criteria.
- No `TODO`, `TBD`, or `NEEDS CLARIFICATION` placeholders.

## 3. Completed work

### Setup and foundation — T001–T018

Implemented project/config scaffolding, strict domain boundaries, exact musical-time primitives, canonical pitch/harmony/project types, command/history foundations, project schema/contracts, fixture infrastructure, and initial piano/audio interfaces.

### US1 — contextual harmonic composition — T019–T038

Implemented:

- Progressions module / Major topology.
- Key-aware chord spelling and realization.
- Contextual recommendation engine with Best Match + Alternatives and explainable rationale.
- Preview-only Matrix interaction separated from explicit Add.
- Harmonic/Piano/Staff Card Views.
- Matrix/Inspector shell and tonic selection.
- Manhattan-routing helper and architecture boundary tests/scaffolds.

### US4 + US4A — Tonal Minor and Dark Harmony — T039–T054

Implemented:

- Tonal Minor core.
- Dark Harmony module on the same Harmonic Engine.
- Secondary Diminished baseline and contextual expanded candidates.
- Neapolitan/chromatic-color vocabulary.
- Safe Major ↔ Tonal Minor/module conversion with explicit ambiguous alternatives and Keep Original.
- Stable Matrix layout with module-specific topology.
- Independent Progressions/Dark Harmony Dashboard template state.

### US2 — temporary what-if branches — T055–T064

Implemented:

- One active multi-step temporary branch.
- Start from any progression point.
- Branch-context recommendations and Composition Intent.
- Rejoin point semantics.
- Original vs Alternative comparison.
- Whole/selective commit and discard.
- Undo-safe snapshot/inverse commands.

### US3 — independent chord-step shaping — T065–T076

Implemented:

- Per-parameter Project/Piano defaults → Matrix Card override inheritance.
- Matrix Preview/Add Template snapshots into independent Progression Steps.
- Repeated identical chords do not share mutable state.
- Per-card reset, Ctrl/Cmd-click reset shortcut, bulk `Reset Current Module` / `Reset All Modules`.
- Customized marker and override count.
- Explicit `Replace Step`; normal Matrix click remains Preview-only.
- Progression reorder commands.
- Step-local Harmonic/Piano/Staff Card Views.
- `Reset Step Performance` preserving harmonic identity/variant/tensions and duration.
- Manual Preview Voicing is copied as an independent exact-pitch snapshot when explicitly added.

### US5 Batch A & B — canonical piano realization and contracts — T077–T089

Implemented:

- Voice-leading, manual voicing, bass, register, articulation, dynamics, and audio-provider contract suites (`T077–T080`).
- `PianoInstrumentProfile` realization pipeline (`T081`).
- Contextual voice leading with common-tone retention and bounded jumps (`T082`).
- Manual exact-pitch voicing validation and `PianoVoicingEditor` interactive keyboard UI (`T083`).
- Independent bass note (`Auto/Root/3rd/5th/Custom`) and bass octave (`Auto/-1/-2`) realization (`T084`).
- Step register control (`Auto/-2/-1/0/+1/+2`) without altering harmonic identity (`T085`).
- Piano articulations `Block`, `Arp Up`, `Arp Down`, `Broken Chord`, and `Humanized` (`T086`).
- Master velocity, dynamic levels (`ppp`..`fff`), per-note overrides, and dynamic presets (`T087`).
- `PianoPerformanceInspector` providing step-level controls for voicing, bass, register, articulation, and dynamics (`T088`).
- Canonical `AudioNoteEvent` performance realization shared across audio, visualization, and exports (`T089`).

### US5 Batch C — HQ Piano Audio Backend — T090–T094

Implemented:

- React-independent look-ahead WebAudio scheduler with zero drift (`T090`).
- 16 discrete velocity layers aligned with upstream Salamander V3 `Data/notes.txt` (`370497372ece1603d1ca7b9892c82c1da566565e`), key-region bounds covering 88 keys (`Data/region.txt`), nearest-sample pitch transposition, and LRU decoded sample cache with 128 MB PCM byte budget and non-poisoning retryability (`T091`, `T092`).
- Lazy-loaded `HqSamplePianoProvider` with cancelable tokens, observable `fallback` / `error` states, and promise lifecycle (`T092`).
- SF2/SF3 SoundFont compatibility provider using `spessasynth_lib@4.3.14` proving interchangeable audio provider contracts (`T093`).
- Reproducible bank preparation pipeline `scripts/prepare-piano-bank.ts`, full 480-region manifest, attribution license, and committed test fixtures (`C4v2.ogg`, `C4v10.ogg`, `C4v14.ogg`) for deterministic clean-checkout real browser smoke (`T094`).

### US5 Batch D — canonical projection consistency and final acceptance — T095–T096

Implemented:

- Canonical projection consistency integration test suite across 8 comprehensive fixtures (A–H) proving identical exact pitches and velocities across Piano Card View, Staff notation, `eventRealizer`, `AudioNoteEvent[]`, and `HqSamplePianoProvider` velocity-region selection (`T095`).
- User-observable `PianoAudioStatus` studio header badge (`loading`, `ready`, `fallback`, `error`) and cleanly decoupled dev/test diagnostic boundary in `src/audio/testHooks.ts`.
- Full Playwright acceptance test suite covering repeated chord independence, Manual Voicing Editor validation & register immunity, per-note dynamics & presets, independent bass selection & bounds, and HQ piano readiness & discrete velocity layer paths in real Chromium (`T096`).

**Current known limitation**: Sustain multisamples are implemented for v1; Salamander release resonance, sympathetic string resonance, hammer noise, and pedal noise layers remain deferred.

### US6 Batch A — exact timing contracts — T097–T100

Defined and verified executable test contracts for CadenceFlow's exact musical-time model:
- `tests/unit/timing/duration.test.ts` (`T097`): canonical 1 beat = quarter-note beat invariant, dotted (3/2 * base), triplet (2/3 * base), bars ↔ beats conversions across simple/compound/asymmetric meters, formatting and round-trip.
- `tests/unit/timing/meter.test.ts` (`T098`): meter validation, pulse vs canonical quarter-note beat separation, accent projection hierarchy (`primary`, `secondary`, `subdivision`), and `reflow` vs `preserve-beat-lengths` meter change policies across bar boundaries.
- `tests/unit/timing/swing.test.ts` (`T099`): straight vs swing projection, pair sum invariance, swing amount ordering, non-destructive preservation, and ineligible subdivision exclusion.
- `tests/unit/timing/timeline.test.ts` (`T100`): rational progression timeline, rest step duration consumption, harmonic predecessor resolution across rests, contiguous loop region invariant, and 1000-step precision drift immunity.

### US6 Batch B — exact timing domain implementation — T101–T104

Implemented:
- `src/domain/timing/duration.ts` (`T101`): exact rational duration constructors, parsers, formatters, and bidirectional bar/beat conversions respecting the canonical quarter-note beat invariant.
- `src/domain/timing/meter.ts` (`T102`): meter and grouping validation, pulse-to-beat conversion, metric accent hierarchy, and proportional 1:1 `reflowProgression` scaling preserving all step identities, kinds, and performance state.
- `src/domain/timing/swing.ts` (`T103`): straight/swing groove projection with deterministic amount quantization ($N=10000$), grid-based grouping invariant across polyphonic simultaneous notes and array order permutations, and strictly positive off-beat durations.
- `src/domain/timing/timeline.ts` (`T104`): exact rational progression timeline calculation, rest step silence allocation, harmonic predecessor lookup, and contiguous loop validation with zero drift.

### US6 Batch C — transport runtime and controls — T105–T109

Implemented:
- `src/ui/transport/transportStore.ts` (`T105`): finite state machine for `stopped`, `playing`, and `paused` states, session-isolated runtime tracking (`generateTransportSessionId()`), loop-aware stop reset targets, and observable error propagation.
- `src/audio/playbackController.ts` & `src/audio/scheduler.ts` (`T106`): decoupled WebAudio look-ahead scheduling coordinator, paused-position resumption, rest-step silence scheduling, and asynchronous audio failure recovery without fallback poisoning.
- `src/ui/transport/loopState.ts` & `src/ui/progression/ProgressionTrack.tsx` (`T107`): contiguous loop range validation, single-step loops, base-anchored zero cumulative drift loop iterations ($< 10^{-9}$s across 1000 iterations), and loop-boundary stop reset semantics.
- `src/audio/metronome.ts` & `src/ui/transport/MetronomeControls.tsx` (`T108`): metronome click generation with metric accents honoring simple/compound/asymmetric beat groupings (e.g. 7/8 [2+2+3]), and 1-bar count-in preceding playback.
- `src/ui/transport/TransportBar.tsx` (`T109`): full transport bar with tempo steppers, meter change with `Reflow` vs `Preserve beat lengths` policies, groove toggle and swing amount slider, loop mode/range selectors, metronome/count-in toggles, and step duration note-value preset buttons (`Whole · Half · Quarter · Eighth · Sixteenth · Dot · Trip`) mapping to canonical quarter-note beats with `Beats:` fraction input.

### US6 Batch D — integration, E2E acceptance, and final closure — T110–T111

US6 / Phase 9 fully accepted and closed. Overall project progress: 111 / 158.
- `tests/integration/timing-audio-projection.test.ts` (`T110`): 14 comprehensive integration fixtures verifying:
  1. Exact tempo-boundary invariance (60 vs 120 BPM: $s_{120} = s_{60} / 2$, silence during rests, zero mutation).
  2. Production T103 swing projection ($\Delta = U \times \frac{A}{3}$) across $A \in [0, 0.55, 0.66, 0.75, 1.0]$.
  3. Polyphonic chord swing synchronization and straight feel with remembered non-zero amount.
  4. Rest step harmonic context: consumes timeline duration, emits zero pitched events, and resolves previous sounding chord as harmonic predecessor (`I -> Rest -> Rest -> IV`).
  5. Count-in projection strictly outside semantic time (4 beats in 4/4, 7/2 beats in 7/8 [2+2+3]).
  6. Pause/Resume Outcome B: sample attack restarts while remaining timeline duration is preserved; future notes at relative offset without duplication.
  7. Runtime audio failure cleanup: clean transition to `stopped`, active step cleared, audio error state, zero fallback.
  8. Loop zero cumulative drift ($< 10^{-9}$s across 1000 iterations for awkward rationals 7/6 and 1/3) and Stop reset to loop start.
  9. Proportional 1:1 Reflow vs Preserve Beat Lengths.
  10. Canonical subdivision, dotted, and triplet duration conversion to exact seconds.
  11. Playing Step vs Selected Editing Step independence.
- `tests/e2e/us6-timing-transport.spec.ts` (`T111`): 10 Playwright E2E scenarios covering note duration presets/custom inputs, 7/8 pulse grouping, Reflow vs Preserve with Undo, transport state transitions and Outcome B playhead continuation, Play From Here, Rest step visual playback, loop regions, metronome/count-in, audio failure recovery, and editor selection independence.

#### Final Accepted US6 Architecture & Invariants

- **Canonical Timing Base**: `1 MusicalDuration beat = one quarter note` (strictly independent of meter denominator).
- **Exact Semantic Timeline**: Semantic progression timing remains exact Rational arithmetic (`Rational { numerator, denominator }`). Seconds exist only at playback/export boundaries.
- **Proportional Reflow**: Proportional 1:1 Step-duration transformation:
  $$\text{newDuration} = \text{oldDuration} \times \frac{\text{newBarLength}}{\text{oldBarLength}}$$
  Step count, IDs, kinds, and non-timing performance state are strictly preserved. Incomplete final bars are preserved without padding.
- **Preserve Beat Lengths**: Canonical Step durations remain unchanged upon meter change; bar boundaries are re-indexed.
- **Non-Destructive Swing**: Swing is a non-destructive playback projection using the accepted production T103 mapping:
  $$\Delta = U \times \frac{A}{3}$$
  where $U = 1/2\text{ canonical beat} = 0.25\text{ s}$ at 120 BPM for eighth-note swing, $A \in [0, 1]$ is the normalized `swingAmount`, with deterministic quantization ($N=10000$) and grid-based polyphonic grouping:

  | Swing Amount ($A$) | Offbeat Start (seconds at 120 BPM) |
  | :--- | ---: |
  | 0.00 (Straight) | 0.250000 s |
  | 0.55 | 0.295833 s |
  | 0.66 | 0.305000 s |
  | 0.75 | 0.312500 s |
  | 1.00 (Full 2:1 Triplet) | 0.333333 s |

  Full 2:1 triplet Swing occurs at $A = 1.0$.
- **Rest Step Semantics**: Rest consumes progression timeline duration but emits no pitched piano event. Rest preserves the previous sounding chord as harmonic predecessor (`resolveHarmonicPredecessor`).
- **Loop Timing**: Anchor-based loop scheduling ($t_k = t_0 + \frac{k \times \text{num} \times 60}{\text{den} \times \text{BPM}}$) guarantees zero cumulative deadline drift ($< 10^{-9}\text{ s}$ over 1000 iterations). Stop resets playhead to loop range start.
- **Count-in Boundary**: Count-in belongs to runtime/session time and is not Progression semantic time. Count-in precedes step 0 at negative audio offset; omitted on Resume or loop iterations.
- **Selection Independence**: Selected editing Step (`selectedStepId`) and currently playing Step (`currentStepIndex`) are strictly independent runtime concepts. Transport execution never alters editor selection.
- **Pause/Resume Outcome B**:
  - Semantic transport resumes from the paused timeline position.
  - Future events are not duplicated.
  - Only the remaining realized note duration is scheduled.
  - For a sounding HQ piano sample, the sample attack restarts on Resume (arbitrary mid-buffer sample continuation is not implemented in v1).
  - Explicit distinction of timing concepts:
    1. *Semantic Step duration* (e.g. 4 canonical beats = 2.0 s at 120 BPM);
    2. *Realized sounding-note duration after articulation/gate* (e.g. ~1.9 s);
    3. *Semantic Step remainder* (e.g. 2.0 s - 0.6 s = 1.4 s);
    4. *Realized sounding-note remainder* (e.g. 1.9 s - 0.6 s = ~1.3 s).
    These four values are distinct and not implied to be identical.

### US7 Batch A — functional preset contracts — T112

Defined and verified contract tests in `tests/unit/progression/presets.test.ts` (`T112`) establishing:
- `PresetStep = { harmonicFunction, duration }` containing only `HarmonicFunctionIdentity` and `MusicalDuration` (no `HarmonicVariant`, extensions, tensions, performance overrides, or spelling).
- Exact Rational musical duration serialization and defensive schema validation (rejecting non-integers, missing fields, or invalid display hints).
- Re-realization across keys, modes, and spelling using atomic `ModuleSwitchResolution`.
- Insertion transformations (`replace`, `append`, `insert`) with strict selection management (replace clears selection, append and insert preserve selection; insert inserts immediately before selected step).
- Custom preset creation stripping performance realization and rejecting Rest-containing progressions (`unsupported-progression`).

#### Accepted US7 Preset Boundaries & Invariants
- **PresetStep Contract**: `PresetStep = HarmonicFunctionIdentity + MusicalDuration` only. Presets store purely functional harmonic material and per-step musical durations; no `HarmonicVariant`, extensions, tensions, custom voicings, dynamics, or articulations.
- **No Performance Data**: Presets strip all instrument, performance, and voicing data on save and instantiate clean default realization on application.
- **Rest-Step Restriction**: Progressions containing Rest Steps cannot be saved as v1 Custom Presets; saving returns `{ kind: "unsupported-progression", reason: "rest-step" }` without mutating project or history.
- **Insertion Semantics**:
  - `replace`: Replaces entire progression; clears selection (`selectedStepId = undefined`).
  - `append`: Appends to end; preserves existing `selectedStepId`.
  - `insert`: Inserts immediately before `selectedStepId`; preserves existing `selectedStepId`. Rejects non-empty progressions without selection with `RangeError`.
  - For empty progressions, all three modes instantiate steps at the beginning.
- **Project-Owned Custom Presets**: Custom Presets are owned by `Project.customPresets`, undoable/redoable via standard command patterns, and persisted with the project.

### US7 Batch B — functional preset domain and neutral built-ins — T113–T114

Implemented and accepted:
- `src/domain/progression/presets.ts` (`T113`): functional preset domain model storing strictly `PresetStep = HarmonicFunctionIdentity + MusicalDuration` only (zero `HarmonicVariant`, performance overrides, or voicing data). Exact Rational duration serialization with defensive validation rejecting invalid rationals, non-positive durations, or forbidden timing units (`seconds`, `durationMs`). Cross-module realization using existing `ModuleSwitchResolution` architecture without synthetic guessing (`kind: "ambiguous"` with diagnostic `ambiguousSteps` containing candidate alternatives).
- `src/domain/progression/builtInPresets.ts` (`T114`): curated built-in functional preset catalog containing exactly 6 neutral presets (3 Major: `Major I–vi–IV–V`, `Major I–IV–V–I`, `Major ii–V–I`; 3 Tonal Minor: `Minor i–iv–V–i`, `Minor i–VII–VI–V`, `Minor ii°–V–i`). Preset names, descriptions, and IDs are strictly functional and neutral with zero genre or stylistic labels. Presets and their steps are deeply frozen against mutation.

#### Accepted US7 Preset Boundaries & Invariants (T113–T114)
- **Semantic Content**: `PresetStep = HarmonicFunctionIdentity + MusicalDuration` only.
- **Cross-Module Compatibility**: Evaluated via existing `planModuleSwitch`; unambiguous steps map automatically, while ambiguous steps (`!automaticTarget && alternatives.length > 0`) yield observable diagnostic `ambiguousSteps` without partial mutation.
- **Built-in Catalog**: Exactly six neutral functional presets with neutral IDs (`builtin-major-*`, `builtin-minor-*`) and no genre labels.

## 4. Key technical decisions that must be preserved

### Architecture boundaries

- `src/domain/**` is framework-independent and must not depend on React, VexFlow, Dexie, WebAudio, SoundFont libraries, or browser persistence.
- Harmonic Engine / Progression / Timing / Instrument Profile / Audio Provider / Export are separate layers.
- Instrument profiles realize musical state; they do not own harmonic truth.
- UI visualization and audio must project from canonical semantic/performance state, never maintain parallel pitch models.

### Harmonic model

- v1 modules: `Progressions` = Major, `Dark Harmony` = Tonal Minor.
- Module change changes Mode and uses safe functional re-realization.
- Ambiguous/non-diatonic conversions may not be silently guessed.
- Matrix layout is stable; contextual candidates appear in an expanded strip rather than moving baseline cards.

### Matrix templates vs Progression Steps

- Matrix card = reusable Preview/Add Template.
- Progression Step = independent snapshot.
- Dashboard explicit settings are tied to harmonic function and module-local template state.
- Project/Piano defaults are inherited per parameter until overridden.
- Existing Progression Steps never change because defaults or Matrix templates later change.

### Piano/audio direction

- Piano is the only fully implemented v1 instrument profile.
- Required output is realistic **sample-based acoustic piano**, not an oscillator placeholder.
- Architecture supports a lazy-loaded HQ multisample piano provider plus a separate SF2/SF3-compatible provider behind `InstrumentAudioProvider`.
- Velocity affects actual timbral sample selection across 16 discrete velocity layers, not only amplitude.
- Upstream source revision is pinned to `370497372ece1603d1ca7b9892c82c1da566565e`.
- Full 480-region sustain manifest is generated; 3 test fixtures (`C4v2.ogg`, `C4v10.ogg`, `C4v14.ogg`) are committed for zero-setup clean-checkout test execution. Full bank can be prepared via `scripts/prepare-piano-bank.ts`.
- Known limitation: sustain samples implemented; release/resonance/hammer/pedal noise deferred.

### Persistence/export direction

- Portable `.cadenceflow` schema exists as a contract, but persistence implementation is scheduled for US8.
- MIDI and MusicXML implementation is scheduled for US9 and must project directly from canonical semantic/performance data; neither should be reverse-engineered from the other.

## 5. Main files implemented/changed in the completed stage

The working folder has no Git metadata, so this is a verified list of the main current files associated with completed tasks, **not a Git diff**.

### Domain / timing / transport / audio

- `src/domain/harmony/*`
- `src/domain/progression/*`
- `src/domain/timing/duration.ts`
- `src/domain/timing/meter.ts`
- `src/domain/timing/rational.ts`
- `src/domain/timing/swing.ts`
- `src/domain/timing/timeline.ts`
- `src/audio/playbackController.ts`
- `src/audio/scheduler.ts`
- `src/audio/metronome.ts`
- `src/audio/eventRealizer.ts`
- `src/audio/hq-sample-piano/*`
- `src/audio/soundfont/*`
- `src/ui/transport/transportStore.ts`
- `src/ui/transport/loopState.ts`
- `src/ui/transport/TransportBar.tsx`
- `src/ui/transport/MetronomeControls.tsx`
- `src/ui/transport/StepDurationControls.tsx`

### Tests/fixtures

- `tests/unit/harmony/*`
- `tests/unit/progression/*`
- `tests/unit/instruments/*`
- `tests/unit/audio/*`
- `tests/unit/timing/*`
- `tests/unit/transport/*`
- `tests/integration/timing-audio-projection.test.ts`
- `tests/integration/pitch-projection-consistency.test.ts`
- `tests/integration/audio-provider-contract.test.ts`
- `tests/e2e/us1-build-progression.spec.ts`
- `tests/e2e/us2-branching.spec.ts`
- `tests/e2e/us3-step-independence.spec.ts`
- `tests/e2e/us4-major-minor.spec.ts`
- `tests/e2e/us4a-modules.spec.ts`
- `tests/e2e/us5-piano-performance.spec.ts`
- `tests/e2e/us5-audio-playback.spec.ts`
- `tests/e2e/us6-timing-transport.spec.ts`

## 6. Verification performed

The real toolchain and test suite were verified on 2026-09-05:

- Toolchain: `pnpm 10.12.4` pinned via `packageManager` in `package.json`, `typescript 6.0.3` pinned.
- `pnpm run build` (`tsc -b && vite build`) → **PASS** (0 errors).
- `pnpm test` (Vitest, 42 test files, 290 tests) → **PASS** (`290 / 290` GREEN).
- `pnpm run test:e2e:chromium` (Playwright Chromium, 22 tests across US1–US6) → **PASS** (`22 / 22` GREEN).
- `pnpm run lint` (ESLint 9) → **PASS** (0 errors, 0 warnings).
- `pnpm run format:check` (Prettier) → **PASS** (all files formatted).
- Spec integrity: 1077 lines, 182 FRs, 17 SCs, 0 TODOs / TBD / NEEDS CLARIFICATION placeholders.
- Verified visual evidence archive:
  - Path: `review-artifacts/us6-final/us6-final-evidence.zip`
  - Size: `1,845,685 bytes`
  - SHA-256: `97f4919b3431db74898c53736fc9ded9f33d01c7ff0be9315f1ec0bd9fd8b29a`
  - Contents: 10 PNGs (`01`–`10`) + `us6-final-demo.webm`, verified integrity.

## 7. Known issues / environment limitations

1. **Active Git Repository**: Repository is active and clean on `master` branch.
2. **Playwright Firefox**: Firefox runner encounters an SWGL crash in this headless Windows container environment; Chromium baseline is fully green and accepted.
3. **HQ piano assets**: Prepared sample bank manifest and committed test fixtures (`C4v2.ogg`, `C4v10.ogg`, `C4v14.ogg`) verified in real Chromium WebAudio; full bank preparation pipeline verified in `scripts/prepare-piano-bank.ts`.
4. **US7–US10**: Pending start and implementation of US7 presets.

## 8. Next development sequence: Phase 10 / US7 — T113–T118
 
Active milestone is **Phase 10: User Story 7 — Use functional presets as reusable composition material (Priority: P2)**:
 
- **T112**: [x] Preset serialization, re-realization across keys/modes, and insertion transformation tests in `tests/unit/progression/presets.test.ts`.
- **T113**: [ ] Functional preset model with harmonic identities + per-step musical durations only in `src/domain/progression/presets.ts`.
- **T114**: [ ] Curated built-in preset catalog data in `src/domain/progression/builtInPresets.ts`.
- **T115**: [ ] Save as Custom Preset command stripping performance realization data in `src/app/commands/presetCommands.ts`.
- **T116**: [ ] `Replace Progression`, `Append to End`, and `Insert at Selected Step` transformations in `src/domain/progression/presets.ts` and `src/app/commands/presetCommands.ts`.
- **T117**: [ ] Presets browser, apply dialog, and Custom Preset save UI in `src/ui/progression/PresetsPanel.tsx` and `src/ui/progression/PresetApplyDialog.tsx`.
- **T118**: [ ] Playwright acceptance for cross-key functional preset reuse and all insertion modes in `tests/e2e/us7-presets.spec.ts`.

## 9. Handoff operating model

From this point, development continues in controlled batches:

1. The orchestrator issues one scoped developer assignment referencing exact task IDs.
2. The developer implements only that scope and returns Git diff/commit, files changed, test output, and any deviations.
3. The orchestrator reviews code against `spec.md`, architecture boundaries, task acceptance, and regression risk.
4. Failed review returns a correction list; tasks remain unchecked.
5. Accepted review updates `tasks.md`, `PROJECT_STATUS.md`, and the handoff package.

See `DEVELOPMENT_WORKFLOW.md` and `NEXT_DEVELOPER_TASK.md` for the exact next assignment and review protocol.

