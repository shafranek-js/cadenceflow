# CadenceFlow — Project Status / Development Handoff

**Handoff date:** 2026-09-05  
**Current implementation stage:** US6 / Phase 9 in progress; timing contracts (T097–T100) accepted; next milestone is US6 domain implementation (T101–T104)  
**Task progress:** T001–T100 complete, 100 / 158 total tasks  
**Authoritative feature:** `specs/001-cadenceflow-core-studio/`

## 1. Current goal

Continue CadenceFlow v1 as a desktop-first harmonic composition studio without changing the approved product scope. User Story 5 (**HQ Piano Realization, Performance Controls & Audio Backend**) is fully accepted across all tasks T077–T096.

The current milestone is **Phase 9: User Story 6** — timing, meter, grouping, swing, and step-based transport (T097–T111). Timing contracts T097–T100 are accepted. Canonical timing invariant is established:
- `1 MusicalDuration beat = one quarter note`
- Bar length in canonical beats is `meter.numerator * 4 / meter.denominator`.
- All musical timing arithmetic is exact Rational arithmetic.

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

### Domain / commands

- `src/domain/harmony/moduleRegistry.ts`
- `src/domain/harmony/moduleSwitch.ts`
- `src/domain/harmony/realization.ts`
- `src/domain/harmony/topology.ts`
- `src/domain/progression/branch.ts`
- `src/domain/progression/step.ts`
- `src/domain/progression/reset.ts`
- `src/domain/project/defaults.ts`
- `src/domain/project/project.ts`
- `src/domain/recommendations/engine.ts`
- `src/app/commands/branchCommands.ts`
- `src/app/commands/harmonyContextCommands.ts`
- `src/app/commands/matrixCommands.ts`
- `src/app/commands/matrixTemplateCommands.ts`
- `src/app/commands/progressionCommands.ts`

### UI

- `src/app/App.tsx`
- `src/ui/matrix/HarmonicMatrix.tsx`
- `src/ui/matrix/ModuleSelector.tsx`
- `src/ui/matrix/ModuleSwitchDialog.tsx`
- `src/ui/matrix/TonicSelector.tsx`
- `src/ui/progression/BranchControls.tsx`
- `src/ui/progression/BranchComparison.tsx`
- `src/ui/progression/ProgressionTrack.tsx`
- `src/ui/progression/ProgressionStepCard.tsx`
- `src/ui/inspector/CardTemplateInspector.tsx`
- `src/ui/inspector/CompositionIntentControl.tsx`
- `src/ui/chord-card/ChordCard.tsx`
- `src/ui/settings/MatrixResetMenu.tsx`

### Tests/fixtures

- `tests/unit/harmony/*`
- `tests/unit/progression/branch.test.ts`
- `tests/unit/progression/step-independence.test.ts`
- `tests/unit/recommendations/*`
- `tests/integration/key-mode-rerealization.test.ts`
- `tests/integration/branch-undo.test.ts`
- `tests/integration/matrix-preview-add.test.ts`
- `tests/integration/matrix-template-state.test.ts`
- `tests/e2e/us1-build-progression.spec.ts`
- `tests/e2e/us2-branching.spec.ts`
- `tests/e2e/us3-step-independence.spec.ts`
- `tests/e2e/us4-major-minor.spec.ts`
- `tests/e2e/us4a-modules.spec.ts`

## 6. Verification performed

The real toolchain and test suite were stabilized and verified on 2026-09-04:

- Toolchain: `pnpm 10.12.4` pinned via `packageManager` in `package.json`, `typescript 6.0.3` pinned.
- `pnpm run build` (`tsc -b && vite build`) → **PASS**.
- `pnpm test` (Vitest, 23 files, 89 tests across domain, UI, and US5 Batch A/B contracts) → **PASS**.
- `pnpm run test:e2e` (Playwright Chromium, 6 specs including US1–US4A) → **PASS**.
- `pnpm run lint` (ESLint 9) → **PASS** (0 errors, 0 warnings).
- `pnpm run format:check` (Prettier) → **PASS**.
- App dev server active on `http://localhost:5173`.
- Spec/task consistency → **PASS**: 182 FR, 17 SC, 89 completed tasks (T001–T089), no placeholders.

## 7. Known issues / environment limitations

1. **Active Git Repository**: Repository is active and clean on `master` branch.
2. **Playwright Firefox**: Firefox runner encounters an SWGL crash in this headless Windows container environment; Chromium baseline is fully green and accepted.
3. **HQ piano assets**: Manifest currently has empty regions; sample bank preparation, encoding, attribution, and lazy audio provider are assigned in US5 Batch C (T090–T094).
4. **US6–US10**: Pending completion and acceptance of US5.

## 8. Current development sequence: US5 Batch C — T090–T094

Batch A and Batch B have been accepted by the orchestrator (commits `73a07ff` through `6d63f70`).
Active milestone is **US5 Batch C (HQ Piano Audio Backend)**:

- **T090**: React-independent look-ahead scheduler (`src/audio/scheduler.ts`).
- **T091**: HQ multisample manifest, 16 velocity layers, sample cache (`src/audio/hq-sample-piano/`).
- **T092**: Lazy `HqSamplePianoProvider` with loading/fallback/error states (`src/audio/hq-sample-piano/provider.ts`).
- **T093**: `spessasynth_lib` SF2/SF3 compatibility proof provider (`src/audio/soundfont/spessaProvider.ts`).
- **T094**: Sample-bank preparation script, manifest, and CC-BY attribution (`scripts/prepare-piano-bank.ts`, `public/audio/piano-hq/`, `public/licenses/`).

### Phase 8 / US5 — tasks T077–T096

Implement in four reviewable batches:

**Batch A — tests and contracts first: T077–T080**

- Voice-leading tests.
- Manual voicing/bass/register/range tests.
- Articulation/dynamics/per-note velocity/preset tests.
- Audio-provider contract tests with mock clock/provider.

**Batch B — canonical piano realization: T081–T089**

- `PianoInstrumentProfile` pipeline.
- Contextual voice leading.
- Manual exact-pitch editor/domain validation.
- Independent bass and register.
- Piano articulations.
- Master velocity + per-note overrides + dynamic presets.
- Piano Performance Inspector.
- Canonical performance-event realization shared by audio/visualization/export.

**Batch C — audio backend: T090–T094**

- React-independent look-ahead scheduler.
- HQ multisample manifest/velocity region selection/cache.
- Lazy `HqSamplePianoProvider` with explicit loading/fallback/error states.
- SF2/SF3 proof provider behind the same audio contract.
- Sample preparation + license/attribution pipeline.

**Batch D — consistency/acceptance: T095–T096**

- Prove Piano View, Staff View, stored manual voicing and scheduled audio events use identical exact pitches/velocities.
- Playwright acceptance for manual voicing, per-note velocity, presets, and HQ audio readiness.

### US5 acceptance gate

Do not mark T077–T096 complete until all of the following are demonstrated:

- Automatic voicing uses neighboring-step context and avoids unnecessary jumps.
- Manual voicing preserves exact pitches/octaves.
- Bass is an independent lower voice.
- Register controls work without changing harmonic identity.
- `Block / Arp Up / Arp Down / Broken Chord / Humanized` produce deterministic event patterns except explicitly bounded humanization.
- Master Velocity and per-note overrides survive step-local editing and are reflected in scheduled events.
- Dynamic presets include `Balanced`, `Top Voice Emphasis`, `Bass Emphasis`, `Inner Voices Soft`, `Humanized Dynamics`.
- HQ provider selects velocity-sensitive sample regions, lazy-loads/cache samples, and exposes loading/error/fallback state.
- No oscillator placeholder is accepted as completion of HQ piano audio.
- No unverified/unlicensed sample assets are committed.
- Real tests/build are green in the restored dependency environment.

Only after that gate proceed to **Phase 9 / US6 timing and transport**.

## 10. Handoff operating model

From this point, development should be orchestrated as controlled batches:

1. The orchestrator issues one scoped developer assignment referencing exact task IDs.
2. The developer implements only that scope and returns Git diff/commit, files changed, test output, and any deviations.
3. The orchestrator reviews code against `spec.md`, architecture boundaries, task acceptance, and regression risk.
4. Failed review returns a correction list; tasks remain unchecked.
5. Accepted review updates `tasks.md`, `PROJECT_STATUS.md`, and the handoff package.

See `DEVELOPMENT_WORKFLOW.md` and `NEXT_DEVELOPER_TASK.md` for the exact next assignment and review protocol.
