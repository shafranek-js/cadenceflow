# Research: CadenceFlow Core Composition Studio

**Date**: 2026-09-04  
**Spec**: `spec.md`  
**Purpose**: Resolve technical choices needed for implementation planning without changing approved product scope.

## Decision 1 — Application shape

**Decision**: Build v1 as a desktop-first single-page web application with no backend dependency.

**Rationale**:
- v1 is explicitly single-user and local-first; accounts/cloud/collaboration are deferred.
- The product needs rich interactive rendering, Web Audio, downloadable/importable files, IndexedDB, and desktop keyboard/mouse interaction, all of which are available in modern browsers.
- A browser-first architecture preserves the option to wrap the same app later in Tauri/Electron without moving harmonic/domain logic.

**Rejected alternatives**:
- Native desktop first: unnecessary platform coupling for v1 and slower iteration.
- Backend-first web app: adds infrastructure without satisfying a v1 requirement.

## Decision 2 — Frontend/runtime stack

**Decision**: React 19.2 + TypeScript 7.0 + Vite 8.1, strict ESM.

**Rationale**:
- React 19.2 is the current React line and is appropriate for a large, stateful composition workspace.
- TypeScript 7.0 is current stable as of July 2026 and improves build/type-check performance for a domain-heavy application.
- Vite 8.1 is current stable and provides a fast browser-app build pipeline.

**Sources**:
- https://react.dev/versions
- https://devblogs.microsoft.com/typescript/
- https://vite.dev/blog/announcing-vite8-1

## Decision 3 — Domain model ownership

**Decision**: CadenceFlow owns a pure TypeScript semantic music model. Third-party theory/rendering libraries are adapters/helpers only.

**Rationale**:
- Harmonic correctness, explainability, deterministic fixtures, safe transposition, module-bound Major/Tonal Minor semantics, and export fidelity require one canonical internal model.
- UI, notation, audio, and export must all project from the same semantic entities rather than infer music independently.

**Implementation rule**:
- `domain/*` MUST NOT import React, VexFlow, Web Audio, SpessaSynth, IndexedDB, or browser UI modules.

## Decision 4 — State management and undo/redo

**Decision**: Use a normalized application store around pure project commands/reducers; maintain a session-only command/snapshot history for Undo/Redo.

**Rationale**:
- Product mutations are explicitly undoable and must preserve project semantics.
- A command boundary makes persistence/autosave, replayable tests, and reset/branch operations deterministic.
- Undo history is intentionally not persisted.

**Implementation note**:
- React-facing store may use a lightweight state library or React external-store integration, but mutation semantics live in pure project commands.

## Decision 5 — Persistence

**Decision**: IndexedDB via Dexie 4.4.x for named projects/autosave, with explicit schema migrations.

**Rationale**:
- IndexedDB is the correct browser primitive for structured local data and larger project state.
- Dexie 4.4.x is current and mature, reduces transaction/migration boilerplate, and keeps storage local.

**Source**:
- https://github.com/dexie/Dexie.js/releases

**Portable project file**:
- `.cadenceflow` v1 is a UTF-8 JSON document validated against a versioned JSON Schema.
- It contains semantic project data only; bundled piano samples are never embedded.
- File System Access API may enhance Save/Open when available, with standard upload/download fallback.

## Decision 6 — Harmonic Matrix rendering

**Decision**: CSS Grid for stable card topology + SVG overlay for orthogonal/Manhattan relationship routes.

**Rationale**:
- Stable spatial memory is a hard product requirement.
- DOM cards preserve accessible controls/tooltips/focus behavior.
- SVG is well suited to explicit orthogonal routes and recommendation/path highlighting.

**Rejected alternative**:
- Canvas-only matrix: harder accessibility, hit testing, per-card controls, and semantic DOM inspection.

## Decision 7 — Staff notation rendering

**Decision**: VexFlow 5 for Staff Card Views and staff visualization.

**Rationale**:
- VexFlow is a dedicated browser notation renderer and v5 is current.
- CadenceFlow will pass exact pitch spelling and realized octaves to VexFlow; VexFlow will not determine harmony or enharmonic semantics.

**Source**:
- https://github.com/vexflow/vexflow/releases

## Decision 8 — High-quality piano audio

**Decision**: v1 ships with a high-quality multisampled acoustic grand piano through a dedicated `InstrumentAudioProvider`. The reference bank for prototyping/acceptance is Salamander Grand Piano V3, prepared as a web-optimized lazy-load sample set. SoundFont support is a separate provider boundary.

**Why this is preferred over a generic GM SoundFont**:
- Salamander is a Yamaha C5 sample library with 16 velocity layers and 48 kHz/24-bit source material, providing substantially more realistic piano dynamics than a small general-purpose GM bank.
- The library is CC BY 3.0 and can be redistributed with required attribution.
- The original 16-bit package is roughly 394 MB and the 24-bit package is much larger, so loading one monolithic bank into browser memory is undesirable.

**Sources**:
- https://github.com/sfzinstruments/SalamanderGrandPiano
- https://sfzinstruments.github.io/pianos/salamander/

**Web delivery strategy**:
- Pre-process source samples into web-suitable encoded assets and a manifest.
- Lazy-load/decode only required pitch/velocity neighborhoods, then cache them.
- Keep exact velocity as input to velocity-layer selection/crossfade logic.
- Schedule playback against `AudioContext` time, not UI timers.
- Add light room/reverb processing only as presentation; dry note identity/timing remains canonical.

**SoundFont compatibility**:
- Use a separate adapter based on `spessasynth_lib` 4.3+ for SF2/SF3/DLS compatibility/prototyping.
- `spessasynth_lib` supports browser WebAudio/AudioWorklet and current SoundFont formats under Apache-2.0.
- User-facing arbitrary sound-bank import remains deferred in the product spec.

**Sources**:
- https://spessasus.github.io/spessasynth_lib/
- https://github.com/spessasus/spessasynth_lib

**Rejected alternative**:
- Make one large SF2/SF3 the only v1 audio architecture. Large SoundFonts can have browser-memory/startup penalties and couple the product to one bank format.

## Decision 9 — Playback scheduling

**Decision**: Canonical timing is stored as rational musical time; playback converts it to AudioContext timestamps through a look-ahead scheduler.

**Rationale**:
- Bars/beats/subdivisions, dotted values, triplets, custom meters, beat grouping, swing, Rest Steps, loop regions, and global BPM need exact musical semantics.
- UI timers are not reliable enough to be the source of audible scheduling.

**Timing representation**:
- Rational tick-free fractions internally (numerator/denominator) or an equivalent exact rational type.
- Conversion to seconds happens only at the playback/export boundary.
- Swing is a non-destructive timing transform applied during event realization.

## Decision 10 — Recommendation engine

**Decision**: Deterministic rule/scoring engine, not ML/LLM.

**Inputs**:
- module/mode ruleset
- tonic/key context
- committed progression path
- temporary branch path
- current preview realization/harmonic variant
- Composition Intent
- voice-leading features where relevant

**Output**:
- one Best Match
- up to three Alternatives above a relevance threshold
- structured explanation factors used by Beginner/Composer/Expert presentation layers

## Decision 11 — MIDI export

**Decision**: Generate Standard MIDI File data directly from the semantic performance event stream.

**Rationale**:
- The same event realization used for playback can generate deterministic note-on/note-off, velocity, tempo, meter, rest gaps, and swing timing.
- MIDI is not used as an intermediate representation for MusicXML.

## Decision 12 — MusicXML export

**Decision**: Generate MusicXML 4.0 directly from semantic project/progression data and validate exported fixtures against the W3C MusicXML 4.0 XSD in tests.

**Rationale**:
- MusicXML is semantic notation interchange, not a MIDI transcription format.
- v4.0 remains the published MusicXML format and the XSD is the preferred validation mechanism; DTDs are deprecated.

**Sources**:
- https://www.musicxml.com/for-developers/
- https://www.w3.org/2021/06/musicxml40/

## Decision 13 — Testing strategy

**Decision**: Layered deterministic test suite.

- Unit: harmony, spelling, recommendation scoring, timing fractions, swing transform, voicing, reset/default inheritance, serialization.
- Musical fixtures: known Major/Tonal Minor progressions and expected realizations.
- Integration: project store + persistence + playback event generation + export.
- Browser/E2E: Playwright for matrix interaction, branch workflow, Card Views, progression editing, transport, project save/open.
- Visual/audio assertions: exact pitch/event lists are primary; audio smoke tests verify bank loading and velocity-region behavior without relying on fragile waveform snapshots.

## Decision 14 — No backend in v1

**Decision**: All v1 services run locally in-browser.

**Consequence**:
- No REST/GraphQL contracts are required.
- The main contracts are the portable project schema and internal provider boundaries.
