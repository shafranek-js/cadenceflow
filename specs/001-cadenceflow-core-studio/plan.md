# Implementation Plan: CadenceFlow Core Composition Studio

**Branch**: `001-cadenceflow-core-studio` | **Date**: 2026-09-04 | **Spec**: `spec.md`

**Input**: Approved feature specification from `/specs/001-cadenceflow-core-studio/spec.md`

## Summary

Implement CadenceFlow v1 as a local-first, desktop-oriented browser composition studio. The technical core is a pure TypeScript semantic music engine that owns harmonic functions, module-bound Major/Tonal Minor realization, progression instances, exact musical timing, recommendation scoring, voicing semantics, and project serialization. React renders one coherent studio around the Harmonic Matrix, Inspector, My Progression, Card Views, and transport. Piano remains the only full production Instrument Profile in v1; US12 adds a curated set of Melody Track timbres without treating them as full chord-realization profiles. US13 separates Matrix Card Views from one global My Progression view and renders Staff as responsive multi-measure score systems.

Audio is sample-based rather than oscillator-based: the launch piano uses a high-quality multisampled acoustic grand through an `InstrumentAudioProvider`, with web-optimized lazy loading/caching; an SF2/SF3 provider can be integrated independently. MIDI and MusicXML are separate projections of the same semantic model.

## Technical Context

**Language/Version**: TypeScript 7.0, strict ESM, ES2025/browser target  
**Primary Dependencies**: React 19.2, Vite 8.1, Dexie 4.4.x, VexFlow 5; `spessasynth_lib` 4.3+ as SoundFont compatibility adapter; direct Web Audio API for HQ sample-piano provider  
**Storage**: IndexedDB (Dexie) for projects/autosave; versioned JSON `.cadenceflow` portable files; Cache Storage/HTTP cache for large piano assets  
**Testing**: Vitest-compatible unit/integration runner, Playwright E2E, deterministic musical fixture suite, MusicXML XSD validation  
**Target Platform**: Modern desktop Chromium/Edge and Firefox; keyboard/mouse primary; 1280×720 to 1920×1080 launch acceptance range  
**Project Type**: Single-page desktop-first web application; no backend in v1  
**Performance Goals**: Matrix interaction response <100 ms for ordinary local actions; preview note scheduling audible without UI-frame-dependent jitter; recommendation refresh <100 ms for v1 vocabulary; 60 fps target for ordinary UI motion; no page-level horizontal scroll in supported desktop range  
**Constraints**: Harmonic/domain core must be browser/UI/audio-library independent; large piano assets must not block UI; autosave must not persist Undo history; no silent harmonic conversion; no ML requirement  
**Scale/Scope**: One local user, multiple named projects, progression sizes expected in tens to low hundreds of steps, two v1 harmonic modules, one full production instrument profile, six curated Melody Track timbres, three Matrix Card Views, and three mutually exclusive My Progression views

## Constitution Check

### Pre-design gate

- [x] **Composition First** — architecture centers progression creation/refinement, not inherited ChordLab feature breadth.
- [x] **Harmonic Correctness and Explainability** — one semantic domain model feeds recommendations, playback, notation, and export.
- [x] **Piano First, Instrument-Agnostic Product Model** — `domain/*` is independent from `instruments/piano/*` and `audio/*`; provider contracts admit future instruments.
- [x] **Direct Manipulation with Immediate Musical Feedback** — Preview/Add, Card Views, transport, selection, and branch states are explicit UI responsibilities.
- [x] **Progression Steps Are First-Class Objects** — step instances own copied settings and remain independent from Matrix templates.
- [x] **One Coherent Studio Workspace** — one app shell contains Matrix, Inspector, Progression, and transport.
- [x] **Spec-Driven, Regression-Protected Evolution** — deterministic musical fixtures and acceptance mapping are mandatory test artifacts.

**Gate result**: PASS. No constitutional violation requires complexity justification.

## Architectural Boundaries

### 1. Domain Core

Pure TypeScript, no browser/UI/audio imports.

Responsibilities:
- pitch identity and notation spelling
- harmonic context/module rulesets
- chord functions/variants/tensions
- Matrix topology definitions
- recommendation scoring and explanation factors
- progression/branch semantics
- exact musical duration/meter/groove representation
- piano-independent performance semantics that belong to a step
- project serialization DTOs and migrations

### 2. Instrument Profiles

`PianoInstrumentProfile` translates semantic chord/step data into playable piano realizations and instrument-specific controls.

Responsibilities:
- playable range
- contextual auto voicing / voice leading
- manual voicing validation
- bass realization
- register offsets
- piano articulation event expansion
- Piano Card View data

Future Guitar/Ukulele/Melodica profiles implement the same profile contract without changing stored harmonic identity. The US12 Melody Track instrument catalog is deliberately narrower: it assigns clef, General MIDI program, label, and SoundFont timbre to already-derived monophonic notes and does not implement chord voicing, Card Views, or an Instrument Profile.

### 3. Audio Providers

`InstrumentAudioProvider` consumes already-realized note events.

v1 providers:
- `HqSamplePianoProvider` — default production provider; high-quality multisampled acoustic piano, lazy loaded/cached.
- `SoundFontProvider` — `spessasynth_lib` SF2/SF3 adapter used by the curated US12 Melody Track catalog; not a user-facing sound-bank manager in v1.

Audio providers do **not** decide chord spelling, voicing semantics, harmonic function, or progression timing.

### 4. Projection/Export Layer

Independent projections:
- Web Audio playback event schedule
- Piano keyboard visualization
- VexFlow Staff visualization
- MIDI SMF export
- MusicXML 4.0 export
- future rendered audio

All consume semantic/project or realized-performance data; none reconstructs music from another projection.

### 5. Persistence Layer

- Dexie repository for named projects and autosave snapshots.
- `.cadenceflow` JSON serializer/deserializer with `schemaVersion` and migrations.
- Session Undo/Redo is excluded from serialized project data.

## Project Structure

```text
src/
├── app/
│   ├── App.tsx
│   ├── appStore.ts
│   ├── commands/
│   └── history/
├── domain/
│   ├── harmony/
│   │   ├── pitch.ts
│   │   ├── spelling.ts
│   │   ├── chord.ts
│   │   ├── functions.ts
│   │   ├── modules/
│   │   │   ├── progressions.ts
│   │   │   └── darkHarmony.ts
│   │   └── topology.ts
│   ├── recommendations/
│   │   ├── engine.ts
│   │   ├── scoring.ts
│   │   ├── intents.ts
│   │   └── explanations.ts
│   ├── progression/
│   │   ├── progression.ts
│   │   ├── step.ts
│   │   ├── branch.ts
│   │   ├── presets.ts
│   │   └── reset.ts
│   ├── timing/
│   │   ├── rational.ts
│   │   ├── meter.ts
│   │   ├── duration.ts
│   │   ├── swing.ts
│   │   └── timeline.ts
│   ├── melody/
│   │   ├── types.ts
│   │   ├── patterns.ts
│   │   └── projection.ts
│   └── project/
│       ├── project.ts
│       ├── defaults.ts
│       └── migrations.ts
├── instruments/
│   ├── contracts.ts
│   └── piano/
│       ├── profile.ts
│       ├── voicing.ts
│       ├── voiceLeading.ts
│       ├── bass.ts
│       ├── articulation.ts
│       └── dynamics.ts
├── audio/
│   ├── contracts.ts
│   ├── scheduler.ts
│   ├── eventRealizer.ts
│   ├── hq-sample-piano/
│   │   ├── provider.ts
│   │   ├── manifest.ts
│   │   ├── sampleCache.ts
│   │   └── velocityLayers.ts
│   └── soundfont/
│       └── spessaProvider.ts
├── notation/
│   ├── staffProjection.ts
│   └── vexflowAdapter.ts
├── export/
│   ├── midi/
│   │   ├── eventProjection.ts
│   │   └── writer.ts
│   └── musicxml/
│       ├── projection.ts
│       ├── writer.ts
│       └── mapping.ts
├── persistence/
│   ├── db.ts
│   ├── projectRepository.ts
│   ├── autosave.ts
│   └── portableProject.ts
├── ui/
│   ├── studio/
│   ├── matrix/
│   ├── chord-card/
│   ├── inspector/
│   ├── progression/
│   ├── piano/
│   ├── staff/
│   ├── transport/
│   ├── projects/
│   └── settings/
└── styles/

public/
├── audio/
│   └── piano-hq/
│       ├── manifest.json
│       └── samples/       # generated/distributed assets, not source recordings
└── licenses/
    └── piano-hq-attribution.txt

tests/
├── fixtures/
│   ├── harmony/
│   ├── recommendations/
│   ├── progressions/
│   ├── timing/
│   └── exports/
├── unit/
├── integration/
└── e2e/

scripts/
├── prepare-piano-bank.*
├── validate-musicxml.*
└── verify-fixtures.*
```

**Structure Decision**: One browser application with strict layered directories. `domain/` and the serialization model are dependency-inverted away from React/WebAudio/VexFlow/SpessaSynth. Instrument and audio integrations depend on domain contracts, never the reverse.

## Phase 0 — Research Output

Completed in `research.md`.

Resolved decisions include:
- browser SPA/no backend
- React/TypeScript/Vite stack
- IndexedDB/Dexie persistence
- stable DOM + SVG Matrix rendering
- VexFlow Staff view
- high-quality sample-based piano + separate SoundFont adapter
- exact musical-time scheduler
- deterministic recommendation engine
- direct MIDI and MusicXML projections

## Phase 1 — Design Outputs

- `data-model.md` — canonical project/domain entities and state boundaries.
- `contracts/cadenceflow-project.schema.json` — v1 portable file schema contract.
- `contracts/domain-providers.md` — instrument/audio/export boundary contracts.
- `quickstart.md` — implementation bootstrap and validation commands.

## Implementation Slices

### Slice 1 — Domain skeleton and deterministic fixtures

Deliver:
- Pitch/Harmonic Context/Module definitions.
- Major Progressions topology and Tonal Minor/Dark Harmony topology.
- Chord variants/tensions and spelling.
- Progression Step, Rest Step, branch, project defaults.
- Baseline theory fixtures before UI.

Exit gate:
- deterministic tests pass for supported harmonic acceptance set.

### Slice 2 — Project store, commands, Undo/Redo, persistence

Deliver:
- normalized store and project command boundary.
- session history.
- Dexie project repository/autosave.
- `.cadenceflow` schema/round-trip/migration path.

Exit gate:
- SC-011/SC-012 project round-trip fixtures pass.

### Slice 3 — Harmonic Matrix + Card templates + Card Views shell

Deliver:
- full-width studio shell.
- module/key controls.
- stable module topology.
- Preview/Add/Replace semantics.
- per-card template inheritance/customization/reset/global reset.
- Harmonic/Piano/Staff Card View state model.

Exit gate:
- no accidental progression mutation from Preview; spatial positions remain stable.

### Slice 4 — Recommendation engine and branch exploration

Deliver:
- contextual ranking.
- Composition Intent.
- 1 Best Match + up to 3 Alternatives.
- Beginner/Composer/Expert explanations.
- multi-step branch/rejoin/commit.

Exit gate:
- every displayed recommendation has structured rationale; branch commit fixtures pass.

### Slice 5 — Piano realization and progression editing

Deliver:
- voice-leading aware auto voicing.
- manual Piano Voicing Editor.
- bass/register/articulation/dynamics/per-note velocity.
- dynamics presets.
- My Progression drag/drop and step-local musical/performance settings; the historical per-step view
  behavior is superseded by the global Progression View in Slice 12.

Exit gate:
- repeated same-chord steps remain independent through edit/save/reopen.

### Slice 6 — Timing/transport/groove

Deliver:
- rational durations, bars/beats/subdivisions/dotted/triplets.
- custom meter + grouping.
- Rest Step.
- Swing.
- Play/Pause/Stop/Play From Here.
- loop region, metronome, count-in.

Exit gate:
- timing fixtures agree across timeline and event realization; loop has no drift in acceptance test.

### Slice 7 — High-quality piano audio

Deliver:
- `InstrumentAudioProvider` contract.
- HQ sample-bank preparation pipeline.
- lazy sample cache and loading UI state.
- Web Audio event scheduling.
- velocity-layer/timbre behavior.
- SF2/SF3 SpessaSynth adapter proof path.

Exit gate:
- SC-007/SC-017 pitch consistency and velocity-region tests pass.

### Slice 8 — MIDI + MusicXML export

Deliver:
- direct MIDI event projection and writer.
- MusicXML 4.0 semantic projection/writer.
- XSD validation fixtures.

Exit gate:
- independent-app acceptance tests for MIDI and MusicXML pass.

### Slice 9 — Presets, project UX, theme, final regression

Deliver:
- built-in functional presets and Custom Presets.
- preset insertion choices.
- named projects/open/save/as/autosave recovery.
- dark/high-contrast light theme.
- accessibility and desktop viewport acceptance.

Exit gate:
- full SC-001..SC-017 suite passes.

### Slice 10 — Measure-card composition layout

Deliver:
- pure Rational measure layout projection over the existing flat Progression Steps;
- one measure card per bar in My Progression, with proportional event segments and an interactive
  trailing gap;
- explicit Rest, Extend, and Repeat gap actions with independent-step and Undo/Redo guarantees;
- Full bar duration derived from the current Meter;
- aligned trailing silence in playback, MIDI, and MusicXML without changing `.cadenceflow` storage.

Exit gate:
- four-beat and additive-meter measure fixtures, gap actions, playback boundary behavior, and both
  export projections pass deterministic unit/integration tests and desktop Chromium acceptance.

### Slice 11 — User Story 12: recipe-derived melody from Chord Steps

Deliver:
- US12 product contracts for one linked Melody Track without expanding scope to a piano roll, multiple
  Melody Tracks, arbitrary external SoundFonts, or rendered-audio export;
- pure framework-independent melody types, six deterministic pitch-order patterns, five exact Rational
  grids, octave-offset validation, and immutable source-step-linked projection;
- Project schema v2, v1 migration, portable persistence, and recipe-only storage;
- undoable create/edit/remove and Repeat/Extend/delete/reorder semantics for linked melody recipes;
- accessible Chord Step context menu, compact editor, preview, Melody Track controls, Melody Staff, and
  active-note highlighting;
- a licensed lazy FluidR3Mono provider path with graceful failure fallback;
- independent playback, MIDI, and MusicXML melody projections while preserving no-melody output
  compatibility.

Exit gate:
- deterministic unit coverage proves every pattern/grid/timing/offset/error/immutability contract before
  schema, UI, audio, playback, or export integration proceeds; the complete US12 acceptance follows in
  Phase 16 after review of the generator.

### Slice 12 — User Story 13: global Progression View and score systems

Deliver:
- required `PresentationState.progressionView` and `measuresPerSystem` values, no schema-version bump,
  deterministic legacy initialization from hidden `step.cardView`, portable persistence, and undoable
  presentation-only commands;
- one synchronized Progression View value in the toolbar, View menu, Global Inspector, and renderer,
  with no `Mixed` runtime/UI state and no production mutation of legacy per-step views;
- a pure score-system grouping projection using the documented measure-width and attack-density rules;
- one VexFlow SVG per system with shared Melody/Harmony temporal positions, repeated clefs, first-system
  meter, optional saved bass, rests, ties, tuplets, and local overflow for a single dense measure;
- separate full-width vertical Harmonic/Piano measure sections with one horizontal step row per measure,
  plus Staff-system interactions preserving selection,
  playback highlight, reorder, context menus, Rest, and trailing-gap actions;
- visual/accessibility polish and focused Chromium acceptance at supported viewports, themes, and zoom.

Exit gate:
- FR-208–FR-214 and SC-019 pass focused unit/integration/Chromium checks, production build, scoped
  formatting, and independent diff review without changing Melody, playback, Matrix Card View, or export
  semantics.

## Performance and Audio Strategy

- Recommendation calculations remain synchronous/pure while v1 vocabulary is small; move to worker only if profiling demonstrates a need.
- Audio events are scheduled ahead against `AudioContext.currentTime`; React render timing is never used as the audio clock.
- HQ piano assets are manifest-driven and lazily decoded. Frequently used central-register/velocity samples may be prewarmed after first user gesture.
- The app surfaces `HQ Piano loading`/fallback state explicitly.
- Do not preload a several-hundred-MB bank before the workspace becomes usable.

## Data Migration Strategy

- Every persisted Project and `.cadenceflow` file includes `schemaVersion`.
- Migrations are pure functions `vN -> vN+1`, fixture tested.
- Autosave writes the current schema only.
- Unsupported future schema versions fail with an explicit compatibility message; never silently discard unknown musical data.

## Accessibility/Interaction Strategy

- Chord cards and their `+`/settings/reset affordances are keyboard reachable.
- Recommendation state uses text/icon/shape in addition to color.
- Global/per-card Card View switching preserves focus logically.
- The global Progression View and measures-per-system controls preserve focus logically and never expose
  a synthetic `Mixed` option.
- Drag/drop has keyboard-accessible reorder commands.
- Tooltips are supplementary; critical state is available via accessible names/descriptions.

## Post-design Constitution Re-check

- [x] Domain remains independent from instrument/audio/UI.
- [x] Every external projection consumes canonical semantics.
- [x] No deferred ChordLab feature entered scope implicitly.
- [x] Audio quality requirement does not couple harmonic semantics to one sound bank format.
- [x] Progression Step independence is preserved through persistence/export.
- [x] Acceptance criteria have corresponding implementation/test slices.
- [x] US13 keeps score-system layout as a projection over canonical measure/music semantics.

**Gate result**: PASS.

## Complexity Tracking

No constitution violations. No exceptions required.
