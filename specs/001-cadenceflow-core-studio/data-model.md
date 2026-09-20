# Data Model: CadenceFlow Core Composition Studio

**Date**: 2026-09-04

## Modeling rules

1. Harmonic identity is separate from rendered pitches.
2. A Matrix Chord Card template is not a Progression Step.
3. A Progression Step is an independent snapshot/instance.
4. Musical time is exact/relative; seconds are derived.
5. Instrument realization and audio rendering are projections.
6. Persisted data never contains runtime audio buffers, React state, or Undo history.

## Project

```text
Project
- id: UUID
- schemaVersion: integer
- name: string
- createdAt: ISO timestamp
- updatedAt: ISO timestamp
- activeModule: HarmonicModuleId
- tonic: PitchClassIdentity
- globalTiming: GlobalTiming
- groove: GrooveSettings
- presentation: PresentationState
- defaults: ProjectDefaults
- moduleTemplateStates: Map<HarmonicModuleId, ModuleTemplateState>
- progression: Progression
- temporaryBranch?: TemporaryBranch
- customPresets: CustomPreset[]
```

The current portable contract is schema v5. v4 projects migrate sequentially to v5; schema v5 adds the
optional Step-local Melody instrument override while preserving global Melody Track inheritance. This
documentary convergence does not implement schema v6 or alter the runtime codec. The only planned future
cutover is one atomic v5-to-v6 migration jointly covering `noteColorMode` and Piano/Guitar engine and
SoundFont tone persistence; the engine/tone work does not create a separate schema version.

### Invariants

- `activeModule=progressions` implies Major.
- `activeModule=dark-harmony` implies Tonal Minor.
- Mode is derived from module in v1 and is not independently persisted as a conflicting choice.
- Undo/Redo history is not part of Project.

## HarmonicContext

```text
HarmonicContext
- tonic: PitchClassIdentity
- moduleId: HarmonicModuleId
- mode: derived Major | TonalMinor
- spellingContext: EnharmonicSpellingContext
```

## HarmonicModuleDefinition

```text
HarmonicModuleDefinition
- id
- mode
- coreLayerId
- layers: HarmonicLayerDefinition[]
- topology: MatrixTopologyDefinition
- rulesetId
```

v1 modules:
- `progressions`
- `dark-harmony`

## HarmonicFunctionIdentity

Stable functional identity independent of tonic.

Examples:
- `I`, `vi`, `V7/V`
- `i`, `V7`, `vii°7/V`, `N6`

```text
HarmonicFunctionIdentity
- moduleId
- functionId
- targetFunctionId?: string
- category
```

## ChordDefinition / HarmonicVariant

```text
ChordDefinition
- harmonicFunction: HarmonicFunctionIdentity
- rootPitchClass: derived
- baseQuality
- variant: HarmonicVariant
- spelling: ChordSpelling

HarmonicVariant
- seventh?: enum
- extensions: Extension[]
- suspensions: Suspension[]
- alterations: Alteration[]
- manualEnharmonicOverrides?: ...
```

`HarmonicVariant` is composition content and is not reset by `Reset Step Performance`.

## MatrixCardTemplateState

Per-module, per-harmonic-function Preview/Add template.

```text
MatrixCardTemplateState
- harmonicFunctionId
- explicitOverrides: Partial<StepCreationDefaults>
- manualPreviewVoicing?: ExactPitch[]
- cardViewOverride?: CardViewId
```

### Resolution order

`Project/Piano Defaults -> Matrix explicit override -> effective preview settings`

### Key-change rule

The state is keyed by harmonic function, not absolute chord name. Key change re-realizes chord spelling/pitches while keeping compatible explicit performance-template overrides.

### Module rule

`Progressions` and `Dark Harmony` keep independent template maps.

## Progression

```text
Progression
- steps: ProgressionStep[]
- selectedStepId?: UUID
- loopRegion?: { startStepId, endStepId }
```

Order is array order. Drag/drop changes order, not identity.

## ProgressionStep

Union:

```text
ChordStep | RestStep
```

### ChordStep

```text
ChordStep
- id: UUID
- kind: "chord"
- harmonicFunction: HarmonicFunctionIdentity
- harmonicVariant: HarmonicVariant
- explicitSpellingOverrides?: ...
- duration: MusicalDuration
- performance: StepPerformance
- melody?: ChordMelodyRecipe
- melodyInstrumentOverride?: MelodyInstrumentId
- cardView: CardViewId (legacy compatibility only; hidden and ignored by My Progression rendering)
```

## ChordMelodyRecipe

```text
ChordMelodyRecipe
- pitchMotion: up | down | up-down | down-up | outside-in | inside-out |
  repeat-root | repeat-top | alternate-root-up | alternate-top-down
- rhythm: even | dotted | reverse-dotted | tresillo
- connection: retrigger | tie-repeated
- grid: quarter | eighth | sixteenth | eighth-triplet | sixteenth-triplet
- octaveOffset: -2 | -1 | 0 | +1 | +2
```

Generated Melody events are derived and never persisted. Schema v5 keeps this canonical recipe shape and
stores an optional sibling `melodyInstrumentOverride` only when the Step does not inherit the Melody Track
default. Schema-v3 `{pattern, grid, octaveOffset}` recipes migrate to the equivalent motion with `even` and
`retrigger`; schema v4 migrates without adding overrides.

## MelodyInstrumentCatalogEntry

```text
MelodyInstrumentCatalogEntry
- id: existing stable id | gm-NNN
- program: integer 0..127 (zero-based MIDI program)
- family: Piano | Chromatic Percussion | Organ | Guitar | Bass | Strings | Ensemble |
  Brass | Reed | Pipe | Synth Lead | Synth Pad | Synth Effects | Ethnic | Percussive | Sound Effects
- label: canonical General MIDI program name
- clef: treble | bass
- playableRange: { minMidi: 0..127, maxMidi: 0..127 }
- sampleAsset: manifest-backed local FluidR3_GM file
- realtimeAvailability: available (all 128 current catalog entries)
```

The immutable catalog contains exactly 128 entries and one entry per program. Existing ids `flute`,
`violin`, `clarinet`, `oboe`, `cello`, and `synth-lead` remain canonical; programs without those ids use
`gm-NNN`. Effective resolution is pure: `step.melodyInstrumentOverride ?? melodyTrack.instrument`.
The manifest records source revision, per-file byte size, and SHA-256. Availability affects realtime
audition only and never changes notes or export eligibility. A failed local load is an explicit provider
error; the current catalog has no export-only programs.

## MelodyInstrumentLane (derived, not persisted)

```text
MelodyInstrumentLane
- instrumentId: MelodyInstrumentId
- firstStepIndex: integer >= 0
- events: MelodyEvent[] belonging only to that effective instrument
- activeSystemIndexes: integer[]
```

Events are partitioned without duplication. One lane produces one Staff line in each system where it is
active, one MIDI track, and one full-score MusicXML part. Staff omits inactive lanes for the current system;
MusicXML retains empty measures as rests. Lane order is first progression occurrence, then GM program and id.

## MelodyPitchMotionGalleryItem (UI projection, not persisted)

```text
MelodyPitchMotionGalleryItem
- pitchMotion: ChordMelodyRecipe.pitchMotion
- group: Directional | Shapes | PedalAndAlternating
- label: string
- contour: derived canonical ordered pitch sample
```

The gallery contains every supported Pitch Motion exactly once. Selecting an item changes only the
editor draft's `pitchMotion`; group, label, contour, expanded state, and any gallery selection metadata are
presentation-only and MUST NOT enter Project persistence, Undo/Redo, playback, MIDI, or MusicXML.

### RestStep

```text
RestStep
- id: UUID
- kind: "rest"
- duration: MusicalDuration
```

Rest does not become harmonic recommendation context; the previous sounding harmonic event remains the harmonic predecessor.

## StepPerformance

```text
StepPerformance
- articulation: PianoArticulation
- register: Auto | -2 | -1 | 0 | +1 | +2
- voicingMode: Auto | Manual
- manualVoicing?: ExactPitch[]
- bass: BassSettings
- masterVelocity: 1..127
- perNoteVelocityOverrides: Map<ExactPitchOrVoiceId, 1..127>
- dynamicsViewPreference: Musical | MIDI
```

### Reset Step Performance

Resets `StepPerformance` to current Project/Piano Defaults while preserving:
- step id/order
- harmonic function
- harmonic variant/extensions/tensions
- duration
- spelling content unless separately reset

## ExactPitch

```text
ExactPitch
- midiNumber: 0..127
- pitchClassIdentity
- octave
- spelling: { step, alter }
```

Pitch identity and spelling are separate so `F#` vs `Gb` is preserved in Staff/MusicXML without changing sounding pitch.

## PianoRealization

Runtime/project-derived projection; manual voicing may make exact pitches persisted in StepPerformance.

```text
PianoRealization
- upperVoices: RealizedNote[]
- bassVoice?: RealizedNote
- articulationEvents: NotePerformanceEvent[]
```

Auto realization is recalculated from context; it is not persisted as stale fixed pitches unless the user enters Manual Voicing.

## RealizedNote / NotePerformanceEvent

```text
RealizedNote
- pitch: ExactPitch
- voiceId
- effectiveVelocity

NotePerformanceEvent
- noteId
- pitch
- startMusicalTime
- durationMusicalTime
- velocity
- role: upper | bass
```

This is the common performance event source for:
- Web Audio
- MIDI export
- playback highlighting

## MusicalDuration

Use exact rational units.

```text
Rational = { numerator: integer, denominator: positive integer }

MusicalDuration
- beats: Rational
- displayHint?: bars/beats/dotted/triplet representation
```

Semantic equality is based on exact rational duration, not display text.

## GlobalTiming

```text
GlobalTiming
- tempoBpm: positive number
- meter:
  - numerator: integer
  - denominator: power-of-two note unit
  - grouping: integer[]
```

Example: `7/8` grouping `[2,2,3]`.

v1 has no tempo/meter map inside progression.

## GrooveSettings

```text
GrooveSettings
- feel: Straight | Swing
- swingAmount: normalized implementation-defined range
```

Swing is applied during event realization and does not mutate stored duration fractions.

## TemporaryBranch

```text
TemporaryBranch
- id
- originStepId | origin=end
- rejoinStepId?: UUID
- steps: ProgressionStepDraft[]
- compositionIntent: CompositionIntent
```

Only one active branch exists in v1.

## CompositionIntent

```text
Neutral | Resolve | BuildTension | DarkenEmotional | Surprise | SmoothVoiceLeading
```

Intent belongs to current exploration/branch, not committed Progression Steps.

## RecommendationResult

```text
RecommendationResult
- contextHash
- bestMatch: RecommendationCandidate
- alternatives: RecommendationCandidate[0..3]

RecommendationCandidate
- harmonicFunction
- harmonicVariantSuggestion?
- score
- factors: RecommendationFactor[]
```

`factors` are structured and later verbalized at Beginner/Composer/Expert depth.

## CardViewState

Supported v1 IDs:
- `harmonic`
- `piano`
- `staff`
- `guitar`
- `tablature`

Matrix has:
- global selected Card View
- optional per-card override

My Progression does not consume Card View state. Its presentation is controlled only by
`PresentationState.progressionView`.

All views consume the same current preview/step realization.

## PresentationState

```text
PresentationState
- expertiseMode: Beginner | Composer | Expert
- theme: Dark | Light
- globalMatrixCardView: CardViewId
- progressionView: harmonic | piano | staff | guitar | tablature
- measuresPerSystem: auto | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
- showBassInStaff: boolean
- ...other existing presentation-only settings
```

### Progression-view invariants

- `progressionView` is one required global value; `mixed` is not valid runtime or persisted state.
- `measuresPerSystem` is a Staff-only maximum. Manual values `1`–`8` remain valid hard maximums. `auto`
  calculates `clamp(floor(16 / measureDurationQuarterBeats), 2, 6)`, where one measure is
  `numerator * 4 / denominator` quarter-note beats; available width and density may reduce the actual
  count. Harmonic/Piano/Guitar/Tablature ignore this field and keep independent vertical measure sections.
- Changing either value is undoable and never mutates Progression Steps or musical/export state.
- The schema version does not change for this additive normalization. On load, an explicit valid
  `progressionView` wins; otherwise a non-empty uniform set of legacy Chord Step `cardView` values seeds
  it, and mixed/empty/absent legacy values seed `harmonic`.
- Legacy `ChordStep.cardView` remains loadable for old files but is hidden, is not written by My
  Progression UI, and is ignored by My Progression rendering.

### Audio engine setting boundary

`HarmonyTrackSettings` currently contains the active-session Piano/Guitar engine and SoundFont tone fields,
but `encodeHarmonyTrackSettings()` writes only `instrument`, `muted`, `solo`, and `volume`. The current
schema v5 contract also lacks `pianoSoundfontInstrument`, and the portable/autosave/export/Undo round-trip
does not claim to preserve any engine or tone field. `AudioEnginesInspector` is the sole settings surface;
All Steps & Measures retains track controls and provider status/retry, while `PianoAudioStatus` is read-only.
Atomic codec/schema/migration/autosave/export/Undo coverage is an open roadmap task, not a schema-v5 change.
It is a prerequisite or joint workstream for the single v5-to-v6 cutover owned by T192/T197; it must not
create a second engine/tone migration after that cutover.

## GuitarChordShape and GuitarTabProjection (derived, not persisted)

```text
GuitarChordShape
- standardTuning: E2 A2 D3 G3 B3 E4
- frets: six positions (-1 muted, 0 open, 1..24 fretted)
- baseFret: integer >= 1
- fingers?: six optional left-hand finger numbers
- scaleTones?: in-position derived non-chord tones

GuitarTabProjection
- chordSymbol
- baseFret
- six ordered string positions with string name, fret, mute/open state, and optional finger
```

Both projections derive from canonical harmonic/realized pitches. They are used by Guitar and Tablature
Card/Progression Views and do not create alternate persisted Steps.

## ScaleExplorerProjection (UI projection, not persisted)

The Scales & Modes Explorer derives formula, pitch classes, characteristic metadata, modal chords, and
canonical cadence formulas from the immutable scale library. Piano and Guitar visualizations are views of
that projection. Audition is non-mutating; Apply uses existing progression commands.

## ScoreSystemProjection

Pure presentation projection over the exact measure layout:

```text
ScoreSystemProjection
- systems: ScoreSystem[]

ScoreSystem
- index: integer
- measures: consecutive MeasureProjection[]
- requiredWidthPx: number
- horizontallyScrollable: boolean
```

Each measure requires a base width of
`84 × measureDurationQuarterBeats` pixels, where one measure is `numerator * 4 / denominator`
quarter-note beats. The normal attack budget is two unique attacks per quarter-note beat; every attack
above that budget adds `44` pixels. This gives approximately 168 px for 2/4, 252 px for 3/4 or 6/8,
336 px for 4/4, and 294 px for 7/8. Measures are greedily packed in order up to the Staff maximum and
available width. A single over-dense measure keeps its required width inside a local scroller. Melody
and all visible Harmony staves share the same measure boundaries and temporal x-coordinate mapping.

## Preset

```text
Preset
- id
- name
- source: builtIn | custom
- steps:
  - harmonicFunction
  - harmonicVariant? (only if explicitly part of preset semantics)
  - duration
```

Performance settings are not stored in presets.

## Persistence tables

Suggested Dexie stores:

```text
projects: id, name, updatedAt
projectSnapshots: projectId, schemaVersion, savedAt
appMeta: key
```

Optionally keep only the latest autosave snapshot per project in v1 unless crash-recovery testing shows a need for a small rotating journal.

## Audio runtime objects (not persisted)

```text
InstrumentAudioProvider
AudioContext
DecodedSampleCache
SoundBankHandle
PlaybackSession
ScheduledSourceHandles
PianoAudioEngine: hq-samples | soundfont
GuitarAudioEngine: hq-samples | soundfont
GuitarStrumSchedule: bounded per-string onset offsets
```

These are reconstructed after project load.
