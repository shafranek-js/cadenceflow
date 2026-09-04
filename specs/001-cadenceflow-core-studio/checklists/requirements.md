# Requirements Quality Checklist: CadenceFlow Core Composition Studio

**Purpose**: Final pre-plan requirements-quality gate  
**Created**: 2026-09-04  
**Feature**: `../spec.md`

## Source and scope integrity

- [x] CHK001 Authoritative sources are explicitly identified; legacy ChordLab is not treated as a requirements source.
- [x] CHK002 v1 scope and deferred/future capabilities are separately enumerated.
- [x] CHK003 Progressions/Dark Harmony module scope and module-to-mode coupling are unambiguous.
- [x] CHK004 Piano-first scope and future instrument extensibility are both explicit.

## Harmonic and progression semantics

- [x] CHK005 Harmonic function identity is distinguished from absolute chord realization.
- [x] CHK006 Preview/Add/Replace behavior is explicit and prevents accidental progression mutation.
- [x] CHK007 Repeated chord occurrences are independent Progression Step instances.
- [x] CHK008 Key change and Major/Tonal Minor re-realization rules cover unambiguous and ambiguous cases.
- [x] CHK009 Structured variants/tensions and their recommendation impact are specified.
- [x] CHK010 Dark Harmony baseline layers and curated/expanded Secondary Diminished behavior are specified.

## Editing/state boundaries

- [x] CHK011 Matrix template state versus Progression Step state is explicitly separated.
- [x] CHK012 Defaults/overrides/reset inheritance rules are specified for card, module, and progression-step scopes.
- [x] CHK013 Undo/Redo scope and non-persistence are explicit.
- [x] CHK014 Temporary branch, rejoin, selective commit, and whole-branch commit are covered.

## Timing/playback/audio

- [x] CHK015 Tempo, meter, grouping, relative duration, subdivisions, rests, swing, loop, metronome, and count-in are specified.
- [x] CHK016 Play/Pause/Stop/Play From Here and step-based playhead semantics are explicit.
- [x] CHK017 High-quality sample-based piano audio is required and separated from the harmonic domain model.
- [x] CHK018 Velocity/per-note velocity semantics are consistent across playback and MIDI.
- [x] CHK019 Audio loading/fallback/licensing requirements are stated without forcing one container format.

## Visualization/export/persistence

- [x] CHK020 Harmonic/Piano/Staff Card Views use the same realization and support per-card/global switching.
- [x] CHK021 Enharmonic spelling behavior and targeted manual overrides are defined.
- [x] CHK022 MIDI and MusicXML are independent projections of the semantic model.
- [x] CHK023 Named project, autosave, recovery, portable project file, and temporary-branch persistence are covered.
- [x] CHK024 Project file does not require MIDI/MusicXML reconstruction.

## Quality and measurability

- [x] CHK025 Functional requirements have unique sequential identifiers FR-001..FR-182.
- [x] CHK026 Success criteria have unique identifiers SC-001..SC-017 and are measurable/testable.
- [x] CHK027 No TODO/TBD/NEEDS CLARIFICATION placeholders remain in the approved spec.
- [x] CHK028 Requirements describe WHAT/WHY; technical implementation choices are kept in plan/research artifacts.
- [x] CHK029 Constitution principles have no unresolved conflict with the specification.

## Review result

**PASS** — requirements are ready for implementation planning.
