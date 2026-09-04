# CadenceFlow — Project Status / Development Handoff

**Handoff date:** 2026-09-04  
**Current implementation stage:** US3 source complete; next milestone is US5 Piano Performance + HQ Audio  
**Task progress:** T001–T076 complete, 76 / 158 total tasks  
**Authoritative feature:** `specs/001-cadenceflow-core-studio/`

## 1. Current goal

Continue CadenceFlow v1 as a desktop-first harmonic composition studio without changing the approved product scope. The immediate goal is **User Story 5 / Phase 8**: implement a piano realization pipeline and high-quality velocity-sensitive sample playback while preserving one canonical pitch/velocity model across Piano View, Staff View, audio scheduling, and later exports.

Do **not** start US6 timing/transport until US5 passes its acceptance gate.

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
- Architecture must support a lazy-loaded HQ multisample piano provider plus a separate SF2/SF3-compatible provider behind `InstrumentAudioProvider`.
- Velocity must affect actual timbral sample selection, not only amplitude.
- Production sample files are currently **not bundled**. `public/audio/piano-hq/manifest.json` contains no regions and the attribution file is still a placeholder.
- Do not add samples without verifying redistribution/license/attribution requirements.

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

## 6. Verification performed at handoff

The following checks were rerun against the current files on 2026-09-04.

### Passed

- `tsc -p tsconfig.domain.json --noEmit` → **PASS**.
- `tsc -p tsconfig.foundation.json --noEmit` → **PASS**.
- UI TS/TSX strict smoke compile with temporary React/VexFlow type stubs → **PASS**.
- Test-source strict TypeScript smoke with temporary Vitest/Playwright/Node stubs → **PASS**.
- `cadenceflow-project.schema.json` JSON parse → **PASS**.
- Spec/task consistency → **PASS**: 182 FR, 17 SC, 76 completed tasks, no placeholders.

These stub-based smoke checks validate local TypeScript consistency only; they are **not substitutes** for the real framework/test packages.

### Not yet validated with the real toolchain

- Vite production build.
- Vitest execution.
- Playwright browser acceptance tests.
- ESLint / Prettier against installed dependencies.
- Real WebAudio/sample playback.
- HQ piano sample-bank preparation/loading.

## 7. Known issues / environment limitations

1. **No `.git` directory is present** in `/mnt/data/cadenceflow-spec`.
   - `git status` and `git diff` cannot be verified.
   - Do not infer historical changes from timestamps as if they were Git history.
   - Establish/attach a real repository before the next implementation batch.

2. **`node_modules` is absent** and `pnpm` is not installed in the current environment.

3. Current global compiler is **TypeScript 5.8.3**, while `package.json` requests `typescript ^7.0.0` and `tsconfig.app.json`/`tsconfig.node.json` target `ES2025`.
   - Domain/foundation configs deliberately target ES2022 and compile with the global compiler.
   - Full app build must be repeated using the project-local TypeScript version after dependency installation.

4. HQ piano assets are not present.
   - `public/audio/piano-hq/manifest.json`: `regions: []`.
   - `public/licenses/piano-hq-attribution.txt`: placeholder only.

5. US5–US10 and cross-cutting polish are not implemented. Do not mark tasks complete based only on scaffold files or interfaces.

## 8. Approaches already tried but not valid in this environment

- `npm test -- --runInBand` was attempted and failed with `vitest: not found` because dependencies are not installed.
- `npm run build` was attempted and failed before Vite because the environment fell back to global TypeScript 5.8.3, which rejects the configured `ES2025` target/lib and cannot resolve project Node typings without installed dependencies.
- Previous attempts to restore packages during this implementation stage were blocked by unavailable package registry access; the handoff therefore intentionally does not claim a real dependency-based build/test pass.
- Git verification was attempted and failed because the working folder is not a Git repository.

Do not treat these failures as confirmed product-code regressions. Restore the intended toolchain first, then rerun the official commands.

## 9. Next development sequence

### Preflight — before modifying product code

1. Attach this folder to the intended Git repository or initialize a new repository and create a baseline commit from the handoff package.
2. Use Node >=22 as specified in `package.json`.
3. Restore the project package manager/dependencies. Prefer a reproducible lockfile and pin the package-manager version.
4. Run:
   - `npm run build` (or the equivalent selected package-manager command)
   - `npm test`
   - `npm run test:e2e`
   - `npm run lint`
   - `npm run format:check`
5. If baseline failures appear, separate environment/configuration failures from real code failures before changing domain behavior.
6. Record the verified baseline in this document before starting US5.

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
