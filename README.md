# CadenceFlow

<p align="center">
  <strong>Desktop-first harmonic composition studio, functional harmony playground, and continuous score environment.</strong>
</p>

<p align="center">
  <a href="https://shafranek-js.github.io/cadenceflow/"><img src="https://img.shields.io/badge/Live_Demo-GitHub_Pages-22c55e.svg" alt="Live Demo"></a>
  <img src="https://img.shields.io/badge/Node-%3E%3D22.0.0-339933.svg" alt="Node version">
  <img src="https://img.shields.io/badge/pnpm-10.12.4-f69220.svg" alt="pnpm version">
  <img src="https://img.shields.io/badge/TypeScript-6.0.3-3178c6.svg" alt="TypeScript version">
  <img src="https://img.shields.io/badge/React-19.2.8-61dafb.svg" alt="React version">
  <img src="https://img.shields.io/badge/Vite-8.2.2-646cff.svg" alt="Vite version">
  <img src="https://img.shields.io/badge/VexFlow-5.0.0-00d1b2.svg" alt="VexFlow version">
</p>

---

## Overview

**CadenceFlow** is a professional desktop-first music studio designed to bridge the gap between music theory, intuitive harmonic exploration, realistic multisampled acoustic instruments, and notation.

Whether you are exploring modal interchange in jazz, writing a classical chorale, arranging chord progressions for a song, or learning functional harmony, CadenceFlow provides a unified, highly responsive canvas with exact rational timing, continuous multi-measure score systems, contextual harmonic recommendations, voice-leading automation, and DAW-grade MIDI and MusicXML export.

The accepted implementation currently extends through **T191**. The remaining roadmap is tracked in
[`PROJECT_STATUS.md`](PROJECT_STATUS.md) and
[`specs/001-cadenceflow-core-studio/tasks.md`](specs/001-cadenceflow-core-studio/tasks.md); schema v5 remains
the current portable project format.

---

## Key Features

### 1. Harmonic Matrix & Contextual Theory Engine

- **Harmonic Modules**:
  - **Tonal Major**: Full diatonic system with secondary dominants ($V^7/V$, $V^7/ii$, etc.), diminished passing chords, and modal borrowings.
  - **Tonal Minor**: Natural, harmonic, and melodic minor systems with bounded chromatic color chords; advanced augmented-sixth vocabulary remains deferred.
  - **Dark Harmony**: Minor-dominant modal topologies, Neapolitan chords ($N^6$), and chromatic voice-leading substitutions.
- **Contextual Recommendation Engine**: Analyzes your progression in real time and proposes **Best Match** and **Alternative** continuations with explainable theoretical rationale.
- **Canonical Matrix Topology**: Progressions and Dark Harmony use six stable semantic columns with vertically aligned Secondary Dominants, Main Chords, and Modal Interchange relationships. Auxiliary substitutions stay visible in labeled side slots rather than separate `Additional` rows.
- **Strict Harmonic Routing**: Directed-tension chords expose their canonical `targetId` as the sole Best Match. Modal Interchange follows an I/IV/V corridor, while intentional departures remain possible through an explicit, non-mutating `Add anyway` confirmation.
- **Safe Mode & Key Switching**: Dynamic re-realization across keys (e.g., $C \to D$) and modes with preservation of harmonic function and pitch spelling.
- **Audition vs. Commit Isolation**: Clicking a chord card in the Matrix auditions it immediately in context without polluting project history or mutating the progression until explicitly added.

### 2. Continuous Score Systems & Flexible Progression Views

- **VexFlow 5 Score Systems**: Renders progressions across continuous multi-measure systems (`ScoreSystemView`) with connected barlines, stave brackets, and metric pulse-aligned beam grouping.
- **Measures-Per-System Layout**: In Staff view, choose between meter-aware `Auto` reflow targeting 2–6 measures or fixed `1`–`8` measures per system, providing an authentic manuscript / sheet-music experience.
- **Synchronized View Modes**:
  - **Lead Sheet (`harmonic`)**: Displays Roman numerals, functional analysis badges, jazz chord symbols, and musical duration tags.
  - **Piano Keyboard (`piano`)**: Interactive 88-key mini-keyboards showing exact sounding pitches for each chord step.
  - **Grand Staff (`staff`)**: Multi-voice grand staff notation with treble and bass clefs, chord symbols, and noteheads.
  - **Guitar (`guitar`)**: Deterministic standard-tuning chord shapes, fretboard positions, and fingering.
  - **Tablature (`tablature`)**: The same canonical Guitar voicing projected as string/fret notation.
- **Measure Gap Actions**: Visual measure cards highlight metric capacity; fill gaps with meter-aware actions (`Rest`, `Extend`, `Repeat`).

### 3. HQ Piano Engine & Realistic Audio Backend

- **Multisample Grand Piano**: Built on the Salamander V3 Grand Piano library with **16 discrete velocity layers** (capturing true timbral change across dynamic ranges, not merely volume scaling).
- **88-Key Coverage**: Nearest-sample transposition across 30 recorded roots for pristine sample fidelity.
- **Zero-Drift WebAudio Look-Ahead Scheduler**: Decoupled from the React render loop to guarantee sample-accurate event dispatching.
- **128 MB LRU Decoded PCM Audio Cache**: Keeps active samples in memory with automatic eviction and zero playback stalling.
- **Selectable Audio Engines**: Piano and Guitar can use their HQ sample engine or a SoundFont engine. Engine and tone selection live in the Matrix Audio Engines inspector; track controls remain focused on instrument, volume, Mute/Solo, status, and retry.
- **Live Status Indicator**: Real-time header badge reflecting audio provider states (`loading`, `ready`, `fallback`, `error`).

### 4. Dedicated Melody Track & Derived Staff View

- **Integrated Melody Layer**: Generate a monophonic melody from the chord progression using selectable patterns, rhythmic grids, and octave offsets with synchronized transport playback.
- **Derived Staff View**: Display the progression and optional Melody layer as VexFlow grand-staff notation with clefs, chord symbols, noteheads, selection, context actions, and playback highlighting.
- **128-Program Melody Catalog**: Choose any General MIDI melodic program from the grouped picker. All 128
  entries resolve to manifest-backed local FluidR3_GM sample maps and load on demand; the six historical
  ids remain stable compatibility identifiers. Production playback has no CDN fallback.
- **Global and Step-Local Instruments**: A Melody Track instrument acts as the default, while individual Chord
  Steps can override it. Staff, playback, MIDI, and MusicXML partition Melody events by effective instrument,
  so unrelated notes remain on their own instrument lines and tracks.
- **Guitar & Tablature Views**: Inspect deterministic chord shapes, fingering, in-position Scale Tones,
  and tablature, with independent HQ Samples/SoundFont Guitar engines and bounded strum timing.
- **Scales & Modes Explorer**: Explore diatonic, minor-variant, pentatonic, and Blues scales with
  characteristic chords, Piano/Guitar projections, and auditionable cadence formulas.
- **Full Track Controls**: Independent volume, mute, and solo controls for both Melody and Harmony tracks.

### 5. Exact Musical Timing & Transport Runtime

- **Rational Arithmetic**: Semantic musical time is represented as exact Rational numbers (`Rational { numerator, denominator }`) with the invariant: **1 canonical beat = 1 quarter note**.
- **Arbitrary Meter Support**: Supports simple, compound, and asymmetric time signatures (e.g., $4/4$, $3/4$, $6/8$, $7/8$ `[2+2+3]`, $5/4$).
- **Meter Reflow Policies**:
  - **Proportional Reflow**: Scales note durations proportionally ($1:1$) across meter transformations while preserving step count and performance data.
  - **Preserve Beat Lengths**: Keeps exact note durations intact and re-indexes bar boundaries.
- **Non-Destructive Swing Engine**: Polyphonic pairwise-invariant swing groove ($\Delta = U \times \frac{A}{3}$, reaching true $2:1$ triplet swing at $A=1.0$).
- **Sample-Accurate Loop Regions**: Anchor-based loop scheduling guarantees zero cumulative drift ($< 10^{-9}\text{ s}$ over 1000 iterations).
- **Metronome & Count-in**: Metric-accented metronome click with 1-bar pre-roll count-in.

### 6. Voice Leading, Voicing & Performance Controls

- **Voice-Leading Automation**: Contextual algorithms minimize voice leaps, preserve common tones, and avoid awkward octave leaps.
- **Piano Voicing Editor**: Interactive 88-key voicing editor allows composers to define custom exact-pitch voicings for any chord step.
- **Independent Bass Control**: Configure bass behavior independently (`Auto`, `Root`, `3rd`, `5th`, or `Custom`) and shift bass octave ($-1$, $-2$).
- **Articulations**: Block, Arpeggio Up, Arpeggio Down, Broken Chord, and Humanized timing.
- **Dynamic Shaping**: Select dynamic levels ($ppp$ through $fff$) with per-note velocity overrides.
- **Progression Global Inspector**: Edit voicing, octave register, dynamics, and articulations globally across all steps simultaneously when no individual step is selected.

### 7. Temporary What-If Branches

- **Non-Destructive Exploration**: Branch off from any chord step in your progression to audition alternative harmonic pathways.
- **A/B Comparison**: Seamlessly switch between the original progression and the experimental branch.
- **Selective Commit**: Merge the branch or individual steps into your progression, or discard it without affecting your project history.

### 8. Functional Presets Catalog

- **Curated Built-In Library**: Neutral functional harmonic templates including classic progressions ($I\text{--}vi\text{--}IV\text{--}V$, $ii\text{--}V\text{--}I$, minor $i\text{--}iv\text{--}V\text{--}i$, Andalusian cadences, and modal formulas).
- **Custom Presets**: Save your own progressions as reusable functional templates (harmonic functions + durations) that automatically adapt to any key or mode.

### 9. DAW & Notation Interoperability

- **Standard MIDI Export**: Generates deterministic Standard MIDI Files (Type 0 and multi-track Type 1 with Conductor, Melody, Chords, and Bass tracks).
- **MusicXML 4.0 Export**: Produces clean, standards-compliant MusicXML partwise documents validated against official W3C/MusicXML XSD schemas for import into MuseScore, Dorico, Sibelius, or Finale.
- **Portable Project Files**: Single-file `.cadenceflow` (JSON Schema v5) format for saving, sharing, and archiving complete projects.
- **Local Autosave & Recovery**: Offline-first IndexedDB storage via Dexie ensures zero data loss across sessions.

---

## Tech Stack & Architecture

CadenceFlow adheres to strict clean-architecture boundaries:

```
src/
├── domain/            # Pure TypeScript, zero external dependencies (framework-agnostic)
│   ├── harmony/       # Pitch, scale, chord spelling, tonal engine, dark harmony
│   ├── progression/   # Progression steps, branching, functional presets
│   ├── timing/        # Exact rational arithmetic, meters, durations, swing
│   └── project/       # Project model, factory, and schema migrations
├── audio/             # WebAudio lookahead scheduler, HQ piano & melody engines
├── notation/          # VexFlow 5 adapters and continuous score system projections
├── persistence/       # Dexie.js (IndexedDB) and portable .cadenceflow codec (Ajv)
├── export/            # Deterministic MIDI and MusicXML 4.0 writers
├── ui/                # React 19 UI components, transport, matrix, score systems
└── app/               # Application store, command pattern (undo/redo), controllers
```

- **Frontend**: [React 19](https://react.dev/), [TypeScript 6](https://www.typescriptlang.org/), [Vite 8](https://vitejs.dev/)
- **Music Notation**: [VexFlow 5](https://www.vexflow.com/)
- **Persistence**: [Dexie.js](https://dexie.org/) (IndexedDB), [Ajv 2020](https://ajv.js.org/)
- **Audio**: Web Audio API, [soundfont-player](https://github.com/danigb/soundfont-player), Salamander Grand Piano V3
- **Testing**: [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/), [jsdom](https://github.com/jsdom/jsdom)

---

## Getting Started

### Prerequisites

- **Node.js**: `>= 22.0.0`
- **pnpm**: `10.12.4` (or latest `pnpm 10`)

### Installation

```bash
# Clone the repository
git clone https://github.com/shafranek-js/cadenceflow.git
cd cadenceflow

# Install dependencies with pnpm
pnpm install
```

### Development Server

```bash
# Start Vite development server
pnpm run dev
```

The application will be available at `http://localhost:5173/`.

### Production Build

```bash
# Typecheck and build optimized static assets
pnpm run build

# Preview production build locally
pnpm run preview
```

---

## Testing & Verification

CadenceFlow maintains a comprehensive test suite across unit, integration, notation, and end-to-end browser tests:

```bash
# Run all unit and integration tests (Vitest)
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Run Playwright E2E browser tests (Chromium)
pnpm run test:e2e:chromium

# Validate generated MusicXML against official XSD schemas
pnpm run validate:musicxml

# Verify offline Melody audio assets
pnpm run verify:melody-assets
pnpm run verify:guitar-asset-provenance

# Lint and check code formatting
pnpm run lint
pnpm run format:check
```

---

## Keyboard Shortcuts

| Shortcut                                                                          | Context         | Action                             |
| :-------------------------------------------------------------------------------- | :-------------- | :--------------------------------- |
| <kbd>Space</kbd>                                                                  | Global          | Play / Pause transport             |
| <kbd>Enter</kbd> / <kbd>Space</kbd>                                               | Harmonic Matrix | Audition focused chord card        |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd>                                                | Harmonic Matrix | Add focused chord with route guard |
| <kbd>Escape</kbd>                                                                 | Global          | Dismiss selection / Close modals   |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Cmd</kbd> + <kbd>Z</kbd>                    | Global          | Undo last action                   |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Global          | Redo last undone action            |
| <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd>                                | Modal Dialogs   | Accessible focus navigation trap   |

---

## License

This repository does not currently include a `LICENSE` file, and the package metadata does not declare a project-wide license.

Repository asset notices include [HQ piano attribution](public/licenses/piano-hq-attribution.txt), [FluidR3_GM attribution](public/licenses/FluidR3_GM-attribution.txt), the included [FluidR3_GM CC BY 3.0 license](public/licenses/FluidR3_GM-CC-BY-3.0.txt), and the [guitar hand illustration authorship notice](public/licenses/guitar-hand-fretting-attribution.txt).
