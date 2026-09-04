# Domain Provider Contracts

These are architecture contracts, not network APIs.

## InstrumentProfile

```ts
interface InstrumentProfile {
  readonly id: string;
  readonly displayName: string;
  realizeChord(input: InstrumentRealizationInput): InstrumentRealization;
  validateManualVoicing(pitches: ExactPitch[]): ValidationResult;
  supportedCardViews(): CardViewDescriptor[];
  supportedArticulations(): ArticulationDescriptor[];
}
```

### Rules

- MUST NOT change `HarmonicFunctionIdentity`.
- MUST consume exact semantic chord/context supplied by domain.
- MAY choose voicing/register/playability according to instrument rules.

## InstrumentAudioProvider

```ts
interface InstrumentAudioProvider {
  readonly id: string;
  readonly state: "idle" | "loading" | "ready" | "fallback" | "error";
  prepare(): Promise<void>;
  schedule(events: AudioNoteEvent[], clock: AudioClock): ScheduledPlayback;
  stop(scope?: PlaybackScope): void;
  dispose(): Promise<void>;
}
```

### AudioNoteEvent

```ts
interface AudioNoteEvent {
  pitch: number;        // MIDI number, already realized
  startSeconds: number; // derived from semantic timeline
  durationSeconds: number;
  velocity: number;     // 1..127 exact source value
  channelRole: "upper" | "bass" | "metronome";
}
```

### Rules

- MUST NOT choose harmony, chord function, spelling, or step order.
- MUST NOT reinterpret velocity values stored in the project; bank-specific mapping may select/crossfade sample layers while retaining exact input velocity.
- MUST expose loading/fallback state to UI.

## HqSamplePianoProvider

Expected responsibilities:
- load manifest
- map pitch + velocity to nearby sample regions
- lazy fetch/decode
- cache decoded samples
- pitch-shift only within bounded sample regions
- apply release/envelope and optional room effect
- schedule against AudioContext time

The sample-bank preparation pipeline is build-time tooling, not project runtime state.

## SoundFontProvider

Expected v1 proof/adapter:
- `spessasynth_lib` WorkletSynthesizer
- SF2/SF3 sound bank supplied by application assets/developer configuration
- same `InstrumentAudioProvider` semantic input

User-facing arbitrary SoundFont import/management is out of scope for v1.

## RecommendationEngine

```ts
interface RecommendationEngine {
  recommend(context: RecommendationContext): RecommendationResult;
}
```

Requirements:
- deterministic for identical inputs
- one Best Match
- zero to three Alternatives above threshold
- every candidate carries explanation factors

## ProjectRepository

```ts
interface ProjectRepository {
  list(): Promise<ProjectSummary[]>;
  load(id: string): Promise<Project>;
  save(project: Project): Promise<void>;
  delete(id: string): Promise<void>;
}
```

Implementation: Dexie/IndexedDB.

## PortableProjectCodec

```ts
interface PortableProjectCodec {
  encode(project: Project): string;
  decode(json: string): Project;
}
```

- validates schema version
- runs supported migrations
- rejects future unsupported schema versions explicitly
- does not serialize Undo/Redo history or audio cache

## MidiExporter

```ts
interface MidiExporter {
  export(project: Project): Uint8Array;
}
```

Consumes semantic timing + realized performance events.

## MusicXmlExporter

```ts
interface MusicXmlExporter {
  export(project: Project): string;
}
```

Consumes semantic harmony/notation/timing directly, not MIDI.
