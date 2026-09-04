# Quickstart: CadenceFlow v1 Implementation

## Prerequisites

- Node.js current LTS supported by Vite 8
- pnpm
- Modern Chrome/Edge and Firefox
- Python or Java available only if chosen for MusicXML XSD validation tooling

## Bootstrap

```bash
pnpm create vite cadenceflow --template react-ts
cd cadenceflow
pnpm install
```

Pin the approved major/minor dependency line in the lockfile before implementation begins.

Core dependencies expected by the plan:

```bash
pnpm add react react-dom dexie vexflow spessasynth_lib
pnpm add -D typescript vite vitest @playwright/test
```

Do not add theory/audio state libraries before the domain boundaries in `plan.md` are established.

## Required first implementation step

Create pure TypeScript domain packages and fixtures before building the full UI:

```text
src/domain/harmony
src/domain/progression
src/domain/timing
tests/fixtures
```

Minimum fixture gate:
- C Major Progressions functions
- D Major transposition
- A Tonal Minor/Dark Harmony core
- `V7 -> I` and `V7 -> i` realization
- secondary dominant
- secondary diminished baseline
- N6
- ambiguous Major<->Minor conversion fixture

## Run checks

```bash
pnpm test
pnpm exec playwright test
pnpm build
```

## Piano bank development

The repository MUST NOT blindly vendor the original source bank without a documented preparation/licensing step.

Expected workflow:

```text
licensed source sample bank
  -> scripts/prepare-piano-bank
  -> web-encoded sample assets
  -> public/audio/piano-hq/manifest.json
  -> public/audio/piano-hq/samples/*
  -> public/licenses/piano-hq-attribution.txt
```

The manifest should map:
- source pitch
- playable pitch region
- velocity layer/range
- asset URL
- optional gain/tuning/release metadata

The app must remain usable while the HQ bank warms its cache.

## Architecture smoke test

Before UI feature expansion, verify:

1. A domain progression can be created without React/WebAudio imports.
2. Piano profile can realize it into exact pitches.
3. The same exact pitch list can feed:
   - mock audio provider
   - Piano visualization DTO
   - Staff visualization DTO
   - MIDI event projection
4. Project JSON round-trips through the portable schema without Undo history.
5. Switching the mock Instrument Profile does not change stored harmonic function IDs.

## MusicXML validation

Export fixtures as MusicXML 4.0 and validate against the official W3C XSD during integration testing. Keep schemas cached locally in test tooling; tests should not depend on network availability.

## Definition of first vertical slice

The first end-to-end playable slice is complete when a user can:

1. open a new project,
2. choose C + Progressions,
3. preview `I`,
4. add it with `+`,
5. add `V`,
6. see two independent Progression Steps,
7. hear both using the audio provider,
8. save/reopen the project,
9. export deterministic MIDI matching the same realized pitches.
