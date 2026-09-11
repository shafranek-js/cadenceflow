# CadenceFlow

<p align="center">
  <strong>Desktop-first harmonic composition studio, functional harmony playground, and continuous score environment.</strong>
</p>

<p align="center">
  <a href="https://shafranek-js.github.io/cadenceflow/"><img src="https://img.shields.io/badge/Live_Demo-GitHub_Pages-22c55e.svg" alt="Live Demo"></a>
  <img src="https://img.shields.io/badge/Node-%3E%3D22.0.0-339933.svg" alt="Node version">
  <img src="https://img.shields.io/badge/pnpm-10.12.4-f69220.svg" alt="pnpm version">
  <img src="https://img.shields.io/badge/TypeScript-6.0.3-3178c6.svg" alt="TypeScript version">
  <img src="https://img.shields.io/badge/React-19.2.0-61dafb.svg" alt="React version">
  <img src="https://img.shields.io/badge/Vite-8.1.0-646cff.svg" alt="Vite version">
  <img src="https://img.shields.io/badge/VexFlow-5.0.0-00d1b2.svg" alt="VexFlow version">
  <img src="https://img.shields.io/badge/Tests-515%20passing-brightgreen.svg" alt="Tests">
</p>

---

## Overview

**CadenceFlow** is a professional desktop-first music studio designed to bridge the gap between music theory, intuitive harmonic exploration, realistic multisampled acoustic instruments, and notation.

Whether you are exploring modal interchange in jazz, writing a classical chorale, arranging chord progressions for a song, or learning functional harmony, CadenceFlow provides a unified, highly responsive canvas with exact rational timing, continuous multi-measure score systems, contextual harmonic recommendations, voice-leading automation, and DAW-grade MIDI and MusicXML export.

---

## Key Features

### 1. Harmonic Matrix & Contextual Theory Engine
- **Harmonic Modules**:
  - **Tonal Major**: Full diatonic system with secondary dominants ($V^7/V$, $V^7/ii$, etc.), diminished passing chords, and modal borrowings.
  - **Tonal Minor**: Natural, harmonic, and melodic minor systems with augmented 6th chords and chromatic color chords.
  - **Dark Harmony**: Minor-dominant modal topologies, Neapolitan chords ($N^6$), and chromatic voice-leading substitutions.
- **Contextual Recommendation Engine**: Analyzes your progression in real time and proposes **Best Match** and **Alternative** continuations with explainable theoretical rationale.
- **Safe Mode & Key Switching**: Dynamic re-realization across keys (e.g., $C \to D$) and modes with preservation of harmonic function and pitch spelling.
- **Audition vs. Commit Isolation**: Clicking a chord card in the Matrix auditions it immediately in context without polluting project history or mutating the progression until explicitly added.

### 2. Continuous Score Systems & Flexible Progression Views
- **VexFlow 5 Score Systems**: Renders progressions across continuous multi-measure systems (`ScoreSystemView`) with connected barlines, stave brackets, and metric pulse-aligned beam grouping.
- **Measures-Per-System Layout**: Choose between `Auto` responsive reflow or fixed `1`, `2`, `3`, or `4` measures per system, providing an authentic manuscript / sheet-music experience.
- **Synchronized View Modes**:
  - **Lead Sheet (`harmonic`)**: Displays Roman numerals, functional analysis badges, jazz chord symbols, and musical duration tags.
  - **Piano Keyboard (`piano`)**: Interactive 88-key mini-keyboards showing exact sounding pitches for each chord step.
  - **Grand Staff (`staff`)**: Multi-voice grand staff notation with treble and bass clefs, chord symbols, and noteheads.
- **Measure Gap Actions**: Visual measure cards highlight metric capacity; fill gaps with meter-aware actions (`Rest`, `Extend`, `Repeat`).

### 3. HQ Piano Engine & Realistic Audio Backend
- **Multisample Grand Piano**: Built on the Salamander V3 Grand Piano library with **16 discrete velocity layers** (capturing true timbral change across dynamic ranges, not merely volume scaling).
- **88-Key Coverage**: Nearest-sample transposition across 30 recorded roots for pristine sample fidelity.
- **Zero-Drift WebAudio Look-Ahead Scheduler**: Decoupled from the React render loop to guarantee sample-accurate event dispatching.
- **128 MB LRU Decoded PCM Audio Cache**: Keeps active samples in memory with automatic eviction and zero playback stalling.
- **SoundFont Compatibility Fallback**: SF2/SF3 compatibility provider ensures playback availability on low-spec devices or offline setups.
- **Live Status Indicator**: Real-time header badge reflecting audio provider states (`loading`, `ready`, `fallback`, `error`).

### 4. Dedicated Melody Track & Visual Staff Editor
- **Integrated Melody Layer**: Compose melodies directly over your chord progressions with synchronized transport playback.
- **Interactive Staff Editing**: Add, adjust, and re-pitch notes directly on the musical score.
- **Scale-Degree Guidance**: Real-time visual feedback indicating chord tones, scale degrees, and passing tensions relative to the active harmony.
- **Sampled General MIDI Instruments**: Choose from authentic local sample maps (Grand Piano, Electric Piano, Violin, Flute, Oboe, Trumpet, Acoustic Guitar) powered by FluidR3_GM.
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
- **Portable Project Files**: Single-file `.cadenceflow` (JSON Schema v3) format for saving, sharing, and archiving complete projects.
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

# Lint and check code formatting
pnpm run lint
pnpm run format:check
```

---

## Keyboard Shortcuts

| Shortcut | Context | Action |
| :--- | :--- | :--- |
| <kbd>Space</kbd> | Global | Play / Pause transport |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Harmonic Matrix | Audition focused chord card |
| <kbd>Escape</kbd> | Global | Dismiss selection / Close modals |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Cmd</kbd> + <kbd>Z</kbd> | Global | Undo last action |
| <kbd>Ctrl</kbd> + <kbd>Y</kbd> / <kbd>Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd> | Global | Redo last undone action |
| <kbd>Tab</kbd> / <kbd>Shift</kbd> + <kbd>Tab</kbd> | Modal Dialogs | Accessible focus navigation trap |

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

Salamander Grand Piano V3 samples are distributed under the Creative Commons Attribution 3.0 Unported License. FluidR3_GM soundfont assets are distributed under the CC-BY 3.0 license. See `public/licenses/` for full attribution notices.
