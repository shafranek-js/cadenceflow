# CadenceFlow — Project Status / Development Handoff

**Handoff date:** 2026-09-11
**Current implementation stage:** Phase 16 / User Story 12 export accepted through T175; T176 final US12 acceptance is the next controlled batch
**Task progress:** 160 accepted tasks, 160 / 176 total tasks
**Authoritative feature:** `specs/001-cadenceflow-core-studio/`

## 1. Current goal

Continue CadenceFlow v1 as a desktop-first harmonic composition studio without changing the approved product scope. User Story 5 (**HQ Piano Realization, Performance Controls & Audio Backend**), User Story 6 (**Exact Musical Timing & Transport Runtime**), and User Story 7 (**Functional Presets as Reusable Composition Material**) are fully accepted across all tasks T077–T118.

The previous milestone **Phase 10: User Story 7** is **ACCEPTED / COMPLETE** across all tasks T112–T118.
The previous milestone **Phase 11: User Story 8** — Save and reopen complete work safely (T119–T129) — is **ACCEPTED / COMPLETE**. **Phase 12: User Story 9** — Transfer the composition to notation and DAW workflows — is implementation code-complete with **T130–T140 ACCEPTED**. **Phase 13: User Story 10** — Work in one focused wide desktop studio — has Batch A (**T141, T143, T144**) accepted; Batch B and Phase 14 remain pending in the task ledger. **Phase 15: User Story 11** — Measure-card composition layout — is **ACCEPTED / COMPLETE** for **T159–T165**. **Phase 16: User Story 12** is accepted through **T175**: contracts, generator, Project schema v2 persistence, undoable commands, accessible melody editor/track controls, deterministic Melody Staff, verified local sampled instruments, isolated preview, separate live Melody routing, exact active-note highlighting, and deterministic MIDI/MusicXML export are complete. Final US12 integration and supported-desktop Chromium acceptance remain in T176. SC-013 and SC-014 remain open because independent MIDI/notation-application interoperability has not been verified; that external gate must be closed no later than T150/T157. Heavy external applications are not installed as part of this assignment.

## 2. Sources of truth

Use the following precedence when requirements appear ambiguous:

1. `specs/001-cadenceflow-core-studio/spec.md` — approved product requirements.
2. `specs/001-cadenceflow-core-studio/tasks.md` — implementation sequence and task IDs.
3. `specs/001-cadenceflow-core-studio/plan.md`, `data-model.md`, `contracts/` — technical architecture and contracts.
4. `reference/cadenceflow.html` — original CadenceFlow prototype/reference behavior and visual intent.
5. Older ChordLab material is **not** a v1 source of requirements unless a capability was explicitly adopted into `spec.md`.

Current spec verification:

- 1217 physical lines / 1084 non-empty lines.
- FR-001 through FR-207: 207 unique functional requirements.
- SC-001 through SC-018: 18 unique success criteria.
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

### US1 corrective acceptance — Matrix card Preview/Audition

- Formally fulfilled the audible audition requirement of FR-016 and US1 Acceptance Scenario 1.
- Ordinary Matrix chord card activation triggers contextual preview and audibly auditions the chord using the canonical piano/audio realization pipeline (`realizeMatrixCardPreview` + `PreviewAuditionController`).
- Explicit `+` remains the isolated Add action without triggering card audition.
- Invariant guaranteed: Piano Card View pitches = Staff Card View pitches = audition AudioNoteEvent pitches.
- Preview playback operates an isolated preview scope that cancels/replaces prior preview playback without stopping progression transport.
- Repeated activations of the same card re-trigger attacks from t = 0.
- Audition is non-mutating: leaves Progression, custom presets, Project semantics, and undo history untouched.
- Keyboard accessibility: Enter and Space trigger the same preview/audition path.

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

### US6/US3 corrective acceptance — direct Progression Step Duration editing

- Added direct `Duration` editing inside the expanded selected Step card editor in `My Progression` (`ProgressionStepCard.tsx`, `ProgressionTrack.tsx`) via reusable `StepDurationControl` (`src/ui/progression/StepDurationControl.tsx`).
- Surfaces musically meaningful preset choices: `Whole — 4 beats`, `Half — 2 beats`, `Quarter — 1 beat`, `Eighth — 1/2 beat`, `Sixteenth — 1/4 beat`, `Dotted Half — 3 beats`, `Dotted Quarter — 3/2 beats`, `Dotted Eighth — 3/4 beat`, `Quarter Triplet — 2/3 beat`, `Eighth Triplet — 1/3 beat`, plus Custom exact Rational input.
- Step-local isolation guaranteed: changing step duration from 4 to 2 changes only the selected step; neighboring steps, repeated occurrences of the same chord, and dashboard templates remain strictly independent.
- Exact Rational persistence: Project stores exact canonical beats (e.g. `2/1`, `3/2`, `2/3`, `5/4`).
- Immediate card summary reflection: card summary updates immediately (`block · v80 · 4` -> `block · v80 · 2`).
- Undo / Redo session history: committed duration changes dispatch through `timing/set-step-duration` command and support full Undo/Redo without deselecting the step or collapsing the editor.
- Reset Performance preservation invariant: resetting step performance strictly preserves `step.duration` (regression verified).
- RestStep parity: Rest steps in `My Progression` share the exact same `StepDurationControl` primitive and `timing/set-step-duration` command path.
- Responsive layout: verified at 1920×1080 and 1280×720 viewports with zero document-level horizontal overflow and fully accessible action buttons.
- Covered by 14 focused unit/integration tests (`tests/unit/progression/step-duration-editing.test.ts`) and Playwright E2E Scenario 11 (`tests/e2e/us6-timing-transport.spec.ts`).

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

### US7 Batch B — preset commands, transformations, and history integration — T115–T116

Implemented and accepted:
- `src/app/commands/presetCommands.ts` (`T115` & `T116`): Save Custom Preset stripping all performance realization data and rejecting Rest-containing progressions. Replace, Append, and Insert transformations with exact selection management.
- `src/app/appStore.ts` & `src/app/commands/index.ts`: real application history integration with `AppliedCommand.forward` snapshots.
- `tests/integration/preset-history.test.ts`: comprehensive integration suite through the production `AppStore` dispatch and `SessionHistory` pipeline.

#### Accepted US7 Command & History Invariants (T115–T116)
- **Single Undoable Mutation**: Save Custom Preset creates exactly one logical history entry on `Project.customPresets`.
- **Single Transform Action**: Replace, Append, and Insert each produce exactly one logical history entry (never per-step).
- **Snapshot Redo**: Redo restores exact historical snapshots rather than re-instantiating, re-realizing, or generating new UUIDs. Changing project defaults between Undo and Redo does not contaminate the redone progression.
- **Failed/Ambiguous/Incompatible Safety**: Failed saves (empty name, whitespace, Rest steps) and failed applications (ambiguous module mapping, incompatible functions) create zero history entries, zero partial steps, and leave Project state bit-for-bit unchanged.

### US7 Batch C — Presets browser, apply dialog, and custom preset save UI — T117

Implemented and accepted:
- `src/ui/progression/PresetsPanel.tsx`, `src/ui/progression/PresetApplyDialog.tsx`, and `src/ui/progression/SavePresetDialog.tsx` (`T117`):
  - Presets browser displaying curated built-in functional catalog (6 neutral presets) and project-owned Custom Presets section.
  - Contextual quality-aware preview dynamically reflecting current key/module (`formatChordSymbol` in `src/domain/harmony/chord.ts`), e.g. `G · Em · C · D` in G Major, `Gm · Cm · D · Gm` in G Tonal Minor, and flat-key spelling `F · Bb · C · F` in F Major.
  - Informational-only preview dispatching zero project mutations or history commands until explicit Save/Apply/Delete confirmation.
  - Insertion modes: Replace Progression (clears selection), Append to End (preserves selection), and Insert at Selected Step (inserts immediately before selected step; disabled with explanatory text when no step is selected). Simplified "Use Preset" button for empty progressions.
  - Validation: rejects empty/whitespace names, blocks saving progressions containing Rest steps with accessible warning.
  - Modal accessibility: shared `useModalFocus` hook (`src/ui/common/useModalFocus.ts`) providing initial focus placement (`#preset-name-input` on Save dialog), Tab/Shift+Tab focus trap, focus restoration on close, and topmost-only Escape handling. Stacked modal inertness marks underlying `PresetsPanel` as `inert` and `aria-hidden="true"` when child dialogs are open.
  - Responsive layouts: fluid card grid with `minmax(280px, 1fr)`, text wrapping on chords/durations, and validated viewports for mobile (`390×844`), compact desktop (`1280×720`), and full desktop (`1920×1080`).

### US7 Batch D — Playwright acceptance, final closure, and invariants — T118

US7 / Phase 10 fully accepted and closed across all tasks T112–T118. Overall project progress: 118 / 158.

- `tests/e2e/us7-presets.spec.ts` (`T118`): 18 comprehensive real-browser E2E acceptance scenarios verifying:
  1. Presets browser renders built-in/custom functional material with neutral names and no genre taxonomy.
  2. Current progression can be saved as Custom Preset with modal autofocus and whitespace validation.
  3. Saved Preset exposes functional identities + durations only, stripping harmonic variants and performance overrides.
  4. Cross-key re-realization dynamically re-evaluates chord quality symbols across keys (e.g. C Major `C · Am · F · G` -> D Major `D · Bm · G · A`).
  5. Tonal Minor realization correctly realizes minor presets (e.g. `Minor i–iv–V–i` -> `Gm · Cm · D · Gm`).
  6. Replace Progression replaces entire progression and is fully undoable/redoable.
  7. Append to End appends preset steps to existing progression and is fully undoable/redoable.
  8. Insert at Selected Step places preset steps immediately before the selected step and is fully undoable/redoable.
  9. Insert mode is disabled with descriptive explanation when no step is selected.
  10. Empty progression uses simplified "Use Preset" flow.
  11. Rest-containing Save is rejected explicitly with non-destructive warning callout.
  12. Ambiguous cross-module mappings are protected with candidate diagnostics and disabled Apply.
  13. Incompatible mappings are strictly protected where reachable.
  14. Current session Piano defaults are instantiated on applied preset steps at application time.
  15. Custom Preset Delete + Undo/Redo restores and removes presets atomically.
  16. Modal keyboard and focus management: initial focus placement, Tab focus trapping, nested modal Escape hierarchy, and focus restoration to trigger.
  17. Responsive layout smoke tests confirm zero document-level horizontal overflow across 1920×1080, 1280×720, and 390×844 viewports.
  18. Passive browsing, opening/closing dialogs, and inspecting previews creates zero history entries.

#### Final Accepted US7 Architecture & Invariants

- **Functional Harmonic Templates**: Presets are functional harmonic templates, not saved song files or transport configurations.
- **Canonical PresetStep Contract**: Canonical `PresetStep` stores exactly:
  - `HarmonicFunctionIdentity`
  - exact `MusicalDuration`
- **Strict Exclusion of Performance State**: Presets do not store:
  - `HarmonicVariant`;
  - voicing;
  - articulation;
  - register;
  - bass;
  - dynamics;
  - MIDI velocity;
  - note-level velocity;
  - rendered chord names;
  - audio/runtime state.
- **Dynamic Re-Realization**: Presets re-realize through current Key/Mode/spelling rules.
- **Supported Harmonic Systems**: Major and Tonal Minor are supported through the existing harmony engine.
- **Ambiguous Mapping Protection**: Ambiguous mappings are explicit and never guessed.
- **Incompatible Mapping Protection**: Incompatible mappings do not mutate Progression.
- **Project Ownership**: Custom Presets belong to `Project.customPresets`.
- **Rest Step Exclusion**: v1 Custom Presets do not support Rest Steps; saving a progression containing Rest fails explicitly and atomically.
- **Apply Modes**:
  - Replace Progression (clears prior selection);
  - Append to End (preserves valid prior selection);
  - Insert at Selected Step (inserts immediately **before** selected Step, preserves selected original Step).
- **Session History Atomicity**: Successful Save/Apply/Delete operations participate in `SessionHistory` as one logical mutation.
- **Failure Zero History**: Failed/ambiguous/incompatible operations create no history entry.
- **Committed Snapshot Redo**: Redo restores committed snapshots rather than re-realizing with new defaults.
- **Application-Time Defaults**: Newly applied Preset Steps use current performance defaults at application time.
- **Neutral Built-in Catalog**: Built-in catalog contains six neutral functional presets with neutral functional names and IDs (no genre taxonomy).
- **Quality-Aware UI Previews**: Contextual UI previews show quality-aware realized chords without mutating Preset data.
- **Modal Accessibility**: Presets modal stack uses accepted focus/inert/topmost semantics.

### US8 Batch A — portable project and autosave recovery contracts — T119–T120

Defined executable test contracts for CadenceFlow v1 project persistence and autosave recovery:
- `tests/unit/persistence/portable-project.test.ts` (`T119`): 18 unit tests establishing `.cadenceflow` contract conformance, full semantic round-trip across all domains (US1–US7), schema validation rejection of malformed envelopes or extra properties, pure version migration chain, unsupported future-version rejection, wire codec mappings, and strict exclusion of history, audio, and transport runtime state.
- `tests/integration/autosave-recovery.test.ts` (`T120`): 10 integration tests establishing transactional Dexie autosave, temporary what-if branch persistence and restoration, debounce coalescing, queue flush on demand, last-active project pointer management, and atomic deletion cleanup.

#### Accepted US8 Persistence Boundaries & Invariants (T119–T120)
- **Tonic Wire Format**: Runtime Project uses canonical `tonic: number` (`0`..`11`). Portable wire schema specifies `tonic: { semitone: number }`. Codec bridges this reversibly without altering the authoritative JSON Schema.
- **DurationDisplayHint Wire Format**: Runtime uses structured `DurationDisplayHint` (`beats`, `bars`, `dotted`, `triplet`). Portable schema specifies string (`{ "type": "string" }`). Codec bridges this deterministically and reversibly (e.g. `bars:<n>`, `beats:<label>`, `dotted:<n>/<d>`, `triplet:<n>/<d>`).
- **Strict Decode Pipeline Order**:
  1. `JSON.parse` (syntax error -> `InvalidPortableProjectError`);
  2. Plain-object / envelope check (rejects non-objects, arrays, null -> `InvalidPortableProjectError`);
  3. Read `schemaVersion` (validate integer $\ge 1$ -> `InvalidPortableProjectError`);
  4. Future-version check (`schemaVersion > CURRENT_VERSION` throws `UnsupportedProjectVersionError`);
  5. Migration chain (`migrateProjectData`);
  6. JSON Schema validation against `cadenceflow-project.schema.json` via JSON Schema validator (violations -> `InvalidPortableProjectError`);
  7. Portable document -> runtime `Project` decode with domain invariant validation.
- **Single Canonical Project Record**: Both portable file export and Dexie persistence share the exact same canonical serialization boundary produced by `PortableProject` codec. Dexie `ProjectRecord` stores `{ id, name, updatedAt, schemaVersion, revision, payload: PortableProjectDocument }` in IndexedDB table `projects` indexed by `id`, `name`, `updatedAt`.
- **Last-Active Pointer**: `lastActiveProjectId` is stored in a dedicated Dexie `metadata` key-value store, not `localStorage`. Atomic delete cleans up the pointer if the active project is deleted.
- **Strict State Exclusion**: Session Undo/Redo history, audio buffers/caches, and transport playback states are strictly excluded from persistence and initialized clean upon load.

### US8 Batch B — portable codec, migrations, and dexie repository — T121, T122, T124, T125

Implemented and accepted:
- `src/persistence/db.ts` (`T121`): Canonical `projects + metadata` Dexie architecture. IndexedDB table `projects` indexed by `id`, `name`, `updatedAt`, `schemaVersion`, `revision`. Metadata store `metadata` with key `lastActiveProjectId`. Zero separate autosave semantic store.
- `src/persistence/projectRepository.ts` (`T122`): Named project repository list/load/save/delete. Stores canonical portable `.cadenceflow` JSON payload in `ProjectRecord.payload`. Validation-before-write using `encodePortableProject`. Atomic transactional deletion with automatic cleanup of `lastActiveProjectId` pointer when active project is deleted.
- `src/persistence/portableProject.ts` (`T124`): Pure `.cadenceflow` codec validated with Ajv 2020 against JSON Schema draft 2020-12 (`cadenceflow-project.schema.json`). Reversible explicit codec bridge for `tonic` (`number` $\leftrightarrow$ `{ semitone }`). Strict deterministic and reversible grammar for `DurationDisplayHint` (`beats`, `beats:<label>`, `bars:<n>`, `dotted:<n>/<d>`, `triplet:<n>/<d>`) with explicit rejection of malformed or unknown strings. Strict exclusion of session history, audio caches, and transport playback states.
- `src/domain/project/migrations.ts` (`T125`): Pure schema version migration chain. Current genesis schema version 1 passes through directly; explicit rejection of future versions (`schemaVersion > CURRENT_PROJECT_SCHEMA_VERSION`) with `UnsupportedProjectVersionError`.

#### Accepted US8 Batch B Boundaries & Invariants
- **Canonical Store Pair**: Dexie database contains strictly two stores: `projects` (canonical project snapshots) and `metadata` (`lastActiveProjectId` pointer). No redundant or secondary autosave snapshot store.
- **Canonical Payload Equality**: Payload stored in `projects[id].payload` is bit-for-bit identical to `encodePortableProject(project)`. Persistence-only `revision` is isolated to the Dexie record wrapper and never appears in `.cadenceflow` exports.
- **Validation Before Write**: Saving a project validates the wire payload against the schema prior to database execution; invalid writes throw and leave stored state, revision, and metadata untouched.
- **Strict Grammar**: `DurationDisplayHint` enforces strict v1 grammar without silent fallback.
- **Single Source of Schema Truth**: Ajv 2020 draft 2020-12 compiles `specs/001-cadenceflow-core-studio/contracts/cadenceflow-project.schema.json`.

### US8 Batch C — project management and portable file actions — T126–T128

Implemented and accepted:
- `src/app/projectController.ts` (`T126`–`T128`): application boundary for atomic project identity transitions, last-session recovery, autosave lifecycle, collision-safe IDs, and fresh session history after replacement. Startup initialization is idempotent under React StrictMode and an active-project open performs a safe flush/no-op instead of loading a stale snapshot.
- `src/ui/projects/ProjectManager.tsx` (`T126`): accessible New/Open/Rename/Delete project UI with active-project recovery and deterministic active-project deletion fallback.
- `src/ui/projects/PortableProjectActions.tsx` (`T127`): Save Project As, production-path `.cadenceflow` export/download, and file import through the UI with non-destructive decode failures.
- `src/app/commands/projectCommands.ts` and `src/domain/project/name.ts` (`T128`): pure rename command and normalized project-name validation.
- `tests/integration/project-controller.test.ts`, `tests/unit/persistence/project-name.test.ts`, and `tests/e2e/us8-project-actions.spec.ts`: focused controller, validation, and browser coverage for project lifecycle, persistence, portable round-trip, collision handling, and fresh history.

#### Accepted US8 Batch C Boundaries & Invariants
- **Atomic Identity Replacement**: Successful New/Open/Delete/Save As/Import transitions flush outgoing state, stop transient playback/preview runtime, persist the target, update `lastActiveProjectId`, and replace the loaded project as one application-level transition.
- **StrictMode-Safe Startup**: `initializeSession()` does not overwrite an existing `local-dev` project or create duplicate projects during repeated React initialization; startup autosave begins only after successful recovery or initialization.
- **Fresh Session History**: Project replacement and portable import initialize Undo/Redo empty while preserving the imported or recovered semantic project state.
- **Portable Collision Safety**: Importing a document whose project ID already exists creates a new imported identity and never overwrites the existing local project.

### US8 Batch D — final persistence acceptance — T129

Accepted after the final persistence corrections:
- `tests/e2e/us8-project-actions.spec.ts` (`T129`): deterministic Chromium acceptance for autosave restart recovery, portable project round-trip, exact Manual Voicing state, exact per-note velocity overrides, and collision-safe project identity behavior.
- `tests/unit/persistence/codec-mapping.test.ts`: deterministic debounced autosave burst coverage proving scheduled snapshots converge to the latest completed/saved snapshot.

#### Accepted US8 Batch D Evidence
- Final persistence acceptance baseline: Vitest `494 / 494`; Chromium `45 / 45`, with no retry.
- US8 / Phase 11 is fully accepted and closed across T119–T129. US9 MIDI Batch A and MusicXML Batch B are accepted; final export UI/integration/browser acceptance remains pending.

### US9 Batch A — direct MIDI projection and deterministic SMF — T130, T132, T133

Accepted implementation basis:
- `src/export/midi/eventProjection.ts` (`T132`): direct canonical semantic/performance-to-MIDI projection using the piano realization, exact beat-domain timing, contextual voice leading, independent bass, articulation, Rest/trailing-Rest timing, swing boundary, and half-up tick quantization with minimum one-tick allocation for positive sub-tick steps and notes.
- `src/export/midi/writer.ts` (`T133`): deterministic format-0, single-track Standard MIDI File writer with tempo/meter metadata, stable note tie ordering, VLQ delta encoding, and semantic end-of-track timing.
- `tests/unit/export/midi.test.ts` (`T130`): literal pitch/velocity/timing goldens, independent Rest/swing/contextual realization coverage, independent SMF parsing, VLQ, determinism, and immutability checks.

#### Accepted US9 MIDI Batch A Boundaries & Evidence
- Playback and MIDI share the canonical beat-domain performance projection and contextual voice-leading chain through the correction commit.
- Focused corrected audio/playback/MIDI suite: `3 files / 31 tests` PASS. Full Node 24 Vitest baseline: `55 files / 505 tests` PASS. Full Chromium: `45 / 45` PASS with `0` retries.
- Accepted progress after MIDI Batch A was `132 / 158`; the separate MusicXML Batch B below raises accepted progress to `137 / 158`.

### US9 Batch B — MusicXML projection, notation writer, and offline validation — T131, T134–T137

Accepted implementation basis:
- `src/export/musicxml/projection.ts` (`T134`): direct saved semantic Project → immutable MusicXML DTO projection with exact Rational durations, key/mode, additive meter, tempo, harmony, spelling, rests, ties, and saved-progression-only source policy.
- `src/export/musicxml/mapping.ts` (`T135`): executable mode/key, pitch, harmony, dynamics, articulation, groove, and unsupported-semantic mapping/diagnostic policy.
- `src/export/musicxml/writer.ts` (`T136`): deterministic MusicXML 4.0 partwise writer with structured harmony, notes, rests, dynamics, arpeggiation, UTF-8 output, and invalid-projection failures.
- `scripts/validate-musicxml.ts` and `tests/fixtures/exports/musicxml/` (`T137`): real offline libxml2 XSD validation using the cached official MusicXML 4.0 schema dependency set and local catalog.

#### Accepted US9 MusicXML Batch B Evidence — 2026-09-07
- Focused MusicXML suite: `16 / 16` PASS.
- Full Node 24 Vitest: `56 files / 521 tests` PASS.
- TypeScript, build, ESLint, Prettier, and `git diff --check`: PASS.
- Chromium baseline: `45 / 45` PASS in each of three sequential runs with `--retries=0` (`0,0,0` exit codes).
- Fresh writer output passes offline XSD validation; the intentionally invalid fixture is rejected with exit code `1`.
- Official schema cache is byte-identical to the prior accepted cache; `spec.md` is unchanged.

### US9 Batch C — export UI, cross-projection integration, and browser acceptance — T138–T140

Accepted implementation basis:
- `src/ui/projects/ExportActions.tsx` and `src/ui/projects/exportActionSupport.ts` (`T138`): Project-menu MIDI/MusicXML export with explicit empty-progression validation, saved-progression-only export, non-mutating state/history behavior, actionable MusicXML omission diagnostics, and browser Blob URL lifecycle handling.
- `tests/integration/export-projection-consistency.test.ts` (`T139`): playback event realization, MIDI projection, and MusicXML semantic projection are compared against one canonical fixture.
- `tests/e2e/us9-export.spec.ts` (`T140`): Chromium acceptance covers successful exports, empty and Rest-only progressions, active-branch exclusion, redo/history preservation, and download failure handling.

Final verified US9 acceptance baseline:
- Full Vitest: `58 files / 527 tests` PASS.
- US9 Chromium ×3: `12 / 12` in each run, retries `0`.
- Full Chromium: `49 / 49`, retries `0`.
- TypeScript, production build, ESLint, Prettier, and `git diff --check`: PASS.

External interoperability remains an honest open gap: SC-013 and SC-014 have not been verified in independent MIDI/notation applications. The gate is scheduled for closure no later than T150/T157; heavy applications are intentionally not installed in this assignment.

### US10 Batch A — responsive desktop Studio shell — T141, T143, T144

Accepted implementation basis:
- `src/ui/studio/StudioWorkspace.tsx` and `src/app/App.tsx` (`T143`): stable slot-based Studio composition for project context, Transport, Harmonic Matrix, Inspector, My Progression, and overlays; App retains project, history, transport, and command ownership.
- `src/styles/studio.css`, `src/styles/matrix.css`, and `src/styles/progression.css` (`T144`): full-width desktop layout with Matrix and Inspector side by side, wrapping header/Transport groups, and progression-local horizontal overflow.
- `tests/e2e/us10-desktop-layout.spec.ts` (`T141`): production UI acceptance at 1280×720 and 1920×1080 with page-level overflow checks and local progression scrolling.

Batch A verification: focused US10 Chromium `2 / 2` PASS, repeat-each `6 / 6` PASS, and final full Chromium `51 / 51` PASS with workers `1` and retries `0`. Theme, expertise, and accessibility behavior remain the next review scope; US10 and Phase 13 are not complete.

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

- Portable `.cadenceflow` persistence, named projects, autosave recovery, project-management UI, and final composition acceptance are implemented and accepted through T126–T129.
- MIDI projection and deterministic SMF writing are accepted through T130/T132/T133. MusicXML projection, mapping, writing, and offline validation are accepted through T131/T134–T137; neither export is reconstructed from the other.

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
- `src/domain/progression/presets.ts`
- `src/domain/progression/builtInPresets.ts`
- `src/app/commands/presetCommands.ts`
- `src/ui/progression/PresetsPanel.tsx`
- `src/ui/progression/PresetApplyDialog.tsx`
- `src/ui/progression/SavePresetDialog.tsx`
- `src/ui/common/useModalFocus.ts`
- `tests/unit/progression/presets.test.ts`
- `tests/unit/progression/built-in-presets.test.ts`
- `tests/unit/app/preset-commands.test.ts`
- `tests/unit/ui/presets-ui.test.ts`
- `tests/integration/preset-history.test.ts`
- `tests/e2e/us1-build-progression.spec.ts`
- `tests/e2e/us2-branching.spec.ts`
- `tests/e2e/us3-step-independence.spec.ts`
- `tests/e2e/us4-major-minor.spec.ts`
- `tests/e2e/us4a-modules.spec.ts`
- `tests/e2e/us5-piano-performance.spec.ts`
- `tests/e2e/us5-audio-playback.spec.ts`
- `tests/e2e/us6-timing-transport.spec.ts`
- `tests/e2e/us7-presets.spec.ts`

## 6. Verification performed

The real toolchain and test suite were verified on 2026-09-05:

- Toolchain: `pnpm 10.12.4` pinned via `packageManager` in `package.json`, `typescript 6.0.3` pinned.
- `pnpm run build` (`tsc -b && vite build`) → **PASS** (0 errors).
- Vitest full suite (55 test files, 505 tests) → **PASS** (`505 / 505` GREEN).
- `tests/e2e/us7-presets.spec.ts` (Playwright Chromium, 18 tests) → **PASS** (`18 / 18` GREEN).
- `pnpm run test:e2e:chromium` (Playwright Chromium, 45 tests across US1–US8) → **PASS** (`45 / 45` GREEN).
- `pnpm run lint` (ESLint 9) → **PASS** (0 errors, 0 warnings).
- `pnpm run format:check` (Prettier) → **PASS** (all files formatted).
- Spec integrity: 1077 lines, 182 FRs, 17 SCs, 0 TODOs / TBD / NEEDS CLARIFICATION placeholders.
- Verified visual evidence archive:
  - Path: `review-artifacts/us7-final/us7-final-evidence.zip`
  - Size: `1,451,719 bytes`
  - SHA-256: `453d99d3dcb1a8411b0f8687a107fcb916dd8543a191263bef1d971da86f36b4`
  - Contents: 13 PNGs (`01`–`13`), verified integrity (all 13 entries readable).
- Prior US6 visual evidence archive:
  - Path: `review-artifacts/us6-final/us6-final-evidence.zip`
  - Size: `1,845,685 bytes`
  - SHA-256: `97f4919b3431db74898c53736fc9ded9f33d01c7ff0be9315f1ec0bd9fd8b29a`
  - Contents: 10 PNGs (`01`–`10`) + `us6-final-demo.webm`, verified integrity.

## 7. Known issues / environment limitations

1. **Active Git Repository**: Repository is active and clean on `master` branch.
2. **Playwright Firefox**: Firefox runner encounters an SWGL crash in this headless Windows container environment; Chromium baseline is fully green and accepted.
3. **HQ piano assets**: Prepared sample bank manifest and committed test fixtures (`C4v2.ogg`, `C4v10.ogg`, `C4v14.ogg`) verified in real Chromium WebAudio; full bank preparation pipeline verified in `scripts/prepare-piano-bank.ts`.
4. **US8 T129**: Final end-to-end composition acceptance is accepted and complete; US9 T130–T140 and US10 Batch A T141/T143/T144 are accepted, with SC-013/SC-014 external interoperability still open.

## 8. Next development sequence: Phase 16 / US12 — Batch G T176

T166–T175 are accepted after independent review. Melody playback uses verified local FluidR3_GM MP3
sample maps through `soundfont-player`; the quarantined `stb-vorbis`/SF3 path is not used, and no antivirus
exclusion is required. Format-1 MIDI and MusicXML now add deterministic Melody projections while
preserving the accepted no-Melody bytes. The next controlled scope is final US12 acceptance only.

- **T176**: [ ] Run final US12 integration and Chromium acceptance at supported desktop sizes. Product
  changes are permitted only as narrow corrections to defects exposed by that acceptance evidence.

T172–T173 focused acceptance: offline asset verification PASS; 5 focused Vitest files / 17 tests PASS;
US12 Chromium 2 / 2 PASS with `--workers=1 --retries=0`; TypeScript, scoped ESLint, Prettier, and
`git diff --check` PASS. Review corrections preserve contextual preview realization, rebase audition to
an immediate start, fix the octave label, and ensure a clean checkout no longer imports removed
`spessasynth_lib`/`stb-vorbis` dependencies.

T174 focused acceptance: MIDI Vitest 22 / 22 PASS; independent format-1 parsing confirms Conductor,
Melody, Chords, and Bass track order, Melody channel 2, all six GM program mappings, CC7 volume, exact
notes/velocities/ticks, note-off ordering, and aligned EOT. T139 export consistency 1 / 1 PASS after
rebuilding its local `libxmljs2` native binding. TypeScript, scoped ESLint, Prettier, and `git diff --check`
PASS. Mute/Solo and Temporary Branch are excluded from export policy, while no-Melody format-1 and legacy
format-0 bytes remain pinned and unchanged.

T175 focused acceptance: MusicXML Vitest 35 / 35 PASS and export projection consistency 1 / 1 PASS.
Independent XML parsing confirms Melody `P2` before Piano `P1` in both part-list and score order; all six
instrument names, clefs, one-based MIDI programs, channel 3, exact pitches, rests, tuplets, cross-bar ties,
measure capacity, and no-Melody bytes are covered. Fresh Melody output passes the offline MusicXML 4.0
XSD validator and a deliberate invalid document is rejected. TypeScript, scoped ESLint, Prettier, and
`git diff --check` PASS. Review correction `a7691e8` restores legacy Piano octave serialization for strict
no-Melody compatibility and makes malformed Melody DTO failures consistently typed.

## 9. Handoff operating model

From this point, development continues in controlled batches:

1. The orchestrator issues one scoped developer assignment referencing exact task IDs.
2. The developer implements only that scope and returns Git diff/commit, files changed, test output, and any deviations.
3. The orchestrator reviews code against `spec.md`, architecture boundaries, task acceptance, and regression risk.
4. Failed review returns a correction list; tasks remain unchecked.
5. Accepted review updates `tasks.md`, `PROJECT_STATUS.md`, and the handoff package.

See `DEVELOPMENT_WORKFLOW.md` and `NEXT_DEVELOPER_TASK.md` for the exact next assignment and review protocol.

## 10. Phase 15 / User Story 11 — measure-card composition layout

T159–T165 are implemented and verified. `My Progression` remains a flat authored `ChordStep`/`RestStep` sequence; measure cards, fragments, continuation markers, and the final virtual gap are derived from the current meter with exact Rational arithmetic. Gap actions are undoable (`Rest`, `Extend`, `Repeat`), `Full bar` is meter-aware, playback runs through the aligned final silence, and MIDI/MusicXML preserve the barline-aligned duration without phantom notes. Staff view uses one shared staff for multiple onsets in a measure.

Verification: full Vitest **69 files / 571 tests**, full Chromium **98 / 98** with `--workers=1 --retries=0`, TypeScript, build, ESLint, Prettier, and `git diff --check` all pass. Build retains the known large-chunk warning only. No schema migration, commit, or push was performed; existing visual-polish worktree changes were preserved.
