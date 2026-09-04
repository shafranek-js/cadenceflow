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
- cardView: CardViewId
```

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

Future Instrument Profiles may register e.g. `guitar`.

Matrix has:
- global selected Card View
- optional per-card override

My Progression has step-local Card View state.

All views consume the same current preview/step realization.

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
```

These are reconstructed after project load.
