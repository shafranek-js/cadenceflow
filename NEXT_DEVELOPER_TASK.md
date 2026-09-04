# Next Developer Assignment — CadenceFlow US5, Batch A

**Assignment:** T077–T080 only  
**Do not implement T081+ in this batch.**  
**Goal:** establish executable test contracts for Piano realization and Audio Provider behavior before implementation.

## Preflight requirement

Before changing test/product code:

1. Restore/attach Git and create a baseline commit from the handoff state.
2. Restore dependencies with Node >=22 and a reproducible lockfile/package-manager version.
3. Run the existing baseline build/tests/lint. Report real failures separately from environment failures.
4. Do not alter approved product semantics merely to make old scaffolds pass.

## T077 — contextual voice-leading tests

Create `tests/unit/instruments/piano/voice-leading.test.ts`.

Required cases:

- Common tones are retained where musically reasonable.
- Consecutive voicings prefer bounded/minimal movement over independent root-position jumps.
- Repeated chord can retain/adjust voicing contextually without sharing mutable step state.
- Register preference constrains but does not redefine harmonic identity.
- Deterministic input produces deterministic auto-voicing.

## T078 — manual voicing, bass, register and range tests

Create `tests/unit/instruments/piano/realization.test.ts`.

Required cases:

- Manual exact pitches/octaves round-trip unchanged.
- Manual pitches remain step-local.
- Bass is independent from the upper voicing.
- `Auto / Root / 3rd / 5th / Custom` bass semantics are testable.
- Bass octave `Auto / -1 / -2` is independent from upper register.
- Register `Auto / -2 / -1 / 0 / +1 / +2` moves realization without changing harmony.
- Out-of-range/invalid manual pitches return validation errors rather than silent mutation.

## T079 — articulation and dynamics tests

Create `tests/unit/instruments/piano/performance.test.ts`.

Required cases:

- Piano articulations: `Block`, `Arp Up`, `Arp Down`, `Broken Chord`, `Humanized`.
- `Strum` must not appear in the Piano profile.
- Master Velocity source of truth is numeric 1–127.
- Musical labels map to defaults without destroying a previously entered exact MIDI velocity.
- Per-note velocity overrides inherit Master Velocity for non-overridden notes.
- Presets: `Balanced`, `Top Voice Emphasis`, `Bass Emphasis`, `Inner Voices Soft`, `Humanized Dynamics`.
- Humanization is bounded and testable; avoid flaky randomness by using an injected deterministic source/seed in tests.

## T080 — Audio Provider contract tests

Create `tests/integration/audio-provider-contract.test.ts` using a mock clock/provider.

Required contract checks:

- `prepare()` transitions provider state predictably.
- `schedule()` consumes canonical `AudioNoteEvent[]`, not UI chord objects.
- Schedule start times use the injected `AudioClock`, not React/render-frame timing.
- `stop(scope)` and `dispose()` are idempotent or safely repeatable.
- Provider errors/fallback state are observable and do not mutate Project/Progression state.
- Contract permits both future `HqSamplePianoProvider` and `SoundFontProvider` without changing callers.

## Architecture constraints

- Tests may drive new type/interface refinements only when compatible with `spec.md` and existing contracts.
- Do not import React/VexFlow/Dexie into `src/domain/**`.
- Do not implement a second pitch representation for audio.
- Do not add or download piano sample assets in this batch.
- Do not start timing transport (US6).

## Required submission to orchestrator

Return:

- Git diff/commit for T077–T080.
- Exact commands and full summary of build/unit/integration/e2e results.
- Any interface changes required to make these tests express the approved model.
- List of unresolved questions/blockers, if any.
- Explicit statement: `Spec deviations: none` or enumerate them.

**Acceptance condition:** the tests are specific enough that T081–T094 can be implemented against them without reinterpreting the product model.
