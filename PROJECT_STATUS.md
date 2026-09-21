# CadenceFlow — Project Status / Development Handoff

**Handoff date:** 2026-09-21
**Repository:** `C:\Projects\cadenceflow`
**Branch / accepted HEAD:** `master` at `986bae6` (`feat: enforce strict harmonic routing`)
**Remote relation at handoff:** `master` is 47 commits ahead of `origin/master`; nothing was pushed.
**Task state:** 197 task entries, 191 checked, 6 open (`T192`–`T197`).
**Portable project schema:** v5 (`CURRENT_PROJECT_SCHEMA_VERSION = 5`).

The checkout was clean immediately after accepting T191. This handoff update is the only expected local
change. Always re-run `git status --short --branch` before starting another batch.

## 1. Current goals and operating boundary

The accepted product baseline extends through T191. The next product objective is the combined T197/T192
batch: persist Piano/Guitar engine and SoundFont tone settings while adding Piano Scale Tones, Melody
harmonic-role metadata, and non-mutating Target Notes. These changes must enter one atomic schema-v5-to-v6
migration; a separate later schema version for audio settings is explicitly prohibited.

No T192-or-later implementation has started, and this document does not authorize it. Continue with one
developer batch at a time:

1. Assign a narrow batch to one developer task.
2. Review the actual diff and Git state independently.
3. Fix small safe defects in the same batch; return substantial defects to the same developer task.
4. Run focused Vitest and Chromium checks, then build, scoped lint/format, and `git diff --check`.
5. Update task/status checkboxes only after independent acceptance.
6. Do not start the next batch without an explicit user command.

## 2. Sources of truth

Use this precedence when documents disagree:

1. `specs/001-cadenceflow-core-studio/spec.md`
2. `specs/001-cadenceflow-core-studio/tasks.md`
3. `specs/001-cadenceflow-core-studio/plan.md`, `data-model.md`, and `contracts/`
4. Current implementation and executable tests
5. `reference/cadenceflow.html` and `info source/CadenceFlow_Master_Developer_Reference.html` only as
   historical/reference inputs, not as current product contracts

`NEXT_DEVELOPER_TASK.md` records the most recently accepted assignment. Replace it with a narrowly scoped
handoff only when the user authorizes the next batch.

## 3. Accepted implementation baseline

The foundation and user stories through T187 are accepted: harmonic composition, Tonal Minor/Dark Harmony,
temporary branches, independent Step performance, sample-backed piano/audio, exact timing and transport,
presets, persistence/autosave, MIDI and MusicXML export, responsive/accessibility work, Melody, Staff systems,
Guitar/Tab views, Suzuki colors, reharmonization/modulation, cadence formulas, and Scales & Modes Explorer.

The stage closed by this handoff added and accepted the following work.

### T188 — local 128-program GM catalog

- All 128 GM programs are represented by the manifest and can be loaded lazily from local assets.
- Production Melody playback has no CDN fallback.
- A Step may override the Melody instrument; absence inherits the Melody Track default.
- Staff, playback, MIDI, and MusicXML partition Melody by the effective instrument, so a distinct effective
  instrument receives its own score line/track/part.
- `AudioEnginesInspector` is the only Piano/Guitar engine and SoundFont tone settings surface. Track controls
  retain instrument, volume, Mute/Solo, provider status, and retry behavior.

### T189 — Melody Pitch Motion discovery

- The compact Pitch Motion selector remains the primary editor control.
- The grouped browser exposes the expanded motion vocabulary without turning the editor into a large,
  permanently expanded control surface.

### T190 — canonical Matrix topology and N6

- Progressions and Dark Harmony use six stable primary columns and three semantic zones: Secondary
  Dominants, Main Chords, and Modal Interchange.
- Directed source/target relationships remain vertically aligned.
- `subV7` and contextual diminished collisions use labeled, permanently visible same-band side slots; the UI
  has no full-width `Additional` or `Contextual` rows.
- Dark Harmony exposes the V and iv/VI poles. Diminished spellings are aliases of one canonical entity.
- `mixPolicy`, `targetId`, and `bassScaleDegree` are canonical semantic fields while old project identities
  remain readable.
- N6 is realized in first inversion with the IV-degree bass across Piano, Staff, Guitar, Tablature, playback,
  and export. Explicit authored Root/Custom bass remains authoritative.
- The no-strong-recommendation message is rendered in the bottom status bar so recommendation changes do not
  shift the Matrix layout.

### T191 — strict directed tension and Modal Corridor

- After a directed-tension chord, its `targetId` is the sole Best Match; competing tension chords are not
  ordinary Alternatives.
- Progressions Modal Interchange enters and returns through I, IV, or V.
- A manual violation opens a focused warning with `Add anyway`; Cancel is non-mutating and restores the prior
  preview for both the main progression and temporary branches.
- Mouse Add and `Ctrl+Enter` use the same guarded path in every Matrix card view.
- Route evaluation uses the committed progression/branch endpoint, not the currently previewed card. This
  prevents preview-first bypasses.
- Blocked routes use compact `Confirm` badges; detailed rationale remains available in accessible labels and
  Recommendation Inspector. The physical-board label remains `Don't Mix`.

## 4. Technical decisions to preserve

### Architecture and state

- `src/domain/**` stays framework-independent: no React, VexFlow, Dexie, WebAudio, or browser persistence.
- Harmonic truth, performance realization, notation, audio, and export remain separate projections of the
  same canonical Project state. Do not create parallel pitch or timing models in the UI.
- Matrix cards are reusable Preview/Add templates; Progression Steps are independent snapshots.
- Preview/audition is non-mutating. Add/Replace/Apply operations go through commands and history.
- Selected editing Step and currently playing Step remain independent.

### Persistence and compatibility

- Schema v5 is current. Do not change the JSON Schema constant independently of runtime types, migration,
  codec, IndexedDB/autosave, portable import/export, fixtures, and Undo/Redo tests.
- The next migration is one atomic v5-to-v6 cutover shared by T197 and T192.
- Existing optional `melodyInstrumentOverride` semantics must remain backward compatible.
- Legacy harmonic identities without the newer routing fields must continue to open without losing Steps.

### Audio and UI ownership

- GM playback is local and manifest-backed. Missing local assets must surface an explicit error; do not restore
  a production CDN fallback.
- Piano/Guitar engine and SoundFont tone choices currently live only in session state and only in
  `AudioEnginesInspector`; this is the T197 persistence gap.
- Keep track-local instrument, volume, Mute/Solo, status, and retry controls outside the engine settings card.
- Staff is a system-based notation view. Harmonic and Piano views keep independent measure cards.
- Staff groups Melody notes by effective instrument; changing one Step's Melody instrument must not move
  unrelated Melody notes to that instrument's staff.

### Matrix routing

- The six-column topology is semantic, not an equal-width imitation of the physical product.
- Auxiliary chords remain visible and labeled in same-band side slots rather than collapsible or full-width
  rows.
- Every valid visible card stays selectable. Strict rules require confirmation; they do not silently remove
  the user's manual override path.
- All Add entry points must call the same route guard. Preview state must never become the route origin.

## 5. Main files for the completed stage

### Contracts and documentation

- `specs/001-cadenceflow-core-studio/{spec.md,plan.md,data-model.md,tasks.md}`
- `specs/001-cadenceflow-core-studio/contracts/cadenceflow-project.schema.json`
- `README.md`, `NEXT_DEVELOPER_TASK.md`, `PROJECT_STATUS.md`

### Harmonic domain and application routing

- `src/domain/harmony/{functions.ts,functionSemantics.ts,topology.ts,routing.ts,tendencyArrows.ts}`
- `src/domain/harmony/modules/{progressions.ts,darkHarmony.ts}`
- `src/domain/harmony/moduleRegistry.ts`
- `src/domain/recommendations/{engine.ts,explanations.ts}`
- `src/domain/progression/effectiveChord.ts`
- `src/app/App.tsx`

### Matrix, Inspector, progression, and notation UI

- `src/ui/matrix/{HarmonicMatrix.tsx,FunctionalLayer.tsx,RouteWarningDialog.tsx}`
- `src/ui/chord-card/ChordCard.tsx`
- `src/ui/inspector/RecommendationInspector.tsx`
- `src/ui/header/PianoAudioStatus.tsx`
- `src/ui/harmony/HarmonyTrackControls.tsx`
- `src/ui/staff/{ScoreSystemView.tsx,StaffCardView.tsx}`
- `src/ui/guitar/{GuitarCardView.tsx,TabCardView.tsx}`
- `src/styles/{matrix.css,studio.css}`

### Audio assets and verification

- `src/domain/melody/instrumentCatalog.ts`
- `src/audio/soundfont/melodyProvider.ts`
- `public/audio/melody/manifest.json`
- `public/audio/soundfont/*-mp3.js`
- `public/licenses/FluidR3_GM-attribution.txt`
- `scripts/{generate-melody-manifest.ts,verify-melody-assets.ts}`

### Focused acceptance suites

- `tests/unit/harmony/{t190-matrix-contract.test.ts,t191-strict-routing.test.ts}`
- `tests/unit/progression/t190-n6-bass-override.test.ts`
- `tests/unit/matrix/playback-highlight.test.ts`
- `tests/unit/audio/soundfont/melody-provider.test.ts`
- `tests/e2e/{t188-melody-instrument-catalog.spec.ts,t190-matrix-spatial-topology.spec.ts,t191-strict-routing.spec.ts}`
- `tests/fixtures/harmony/t190-matrix-contract.json`

## 6. Verified evidence

Validated toolchain: Node `24.14.0`, pnpm `10.12.4` (`package.json` requires Node `>=22`).

- T188: `pnpm verify:melody-assets` verified 128/128 manifest entries, local files, byte sizes, SHA-256,
  license, and attribution metadata. Focused Vitest passed 8 files / 25 tests; Chromium passed 7/7 with
  external SoundFont requests blocked.
- T190: focused Vitest passed 7 files / 32 tests; Chromium passed 7/7.
- T191: focused Vitest passed 5 files / 34 tests; the final T191 Chromium suite passed 4/4, and the combined
  T190/T191 regression run passed 8/8.
- The production build passed after T191. Scoped Prettier and `git diff --check` passed. Scoped ESLint had
  zero errors and three pre-existing `App.tsx` React Hooks dependency warnings.
- Visual acceptance covered Matrix topology in Progressions and Dark Harmony at 1920x1080 and 1280x720,
  light/dark themes, and 200% equivalent layout pressure. T191 additionally verified compact badges,
  keyboard focus, the warning dialog, playback highlighting, stable columns, and no page-level overflow.
- The latest built `dist/` occupies 409,507,614 bytes. The build reports the known large JavaScript chunk
  warning.

Only focused suites were rerun for T188–T191; a new full Vitest/Chromium regression is intentionally deferred
to the release gate rather than claimed here.

## 7. Known issues and release risks

1. **T197 persistence gap:** Piano/Guitar engine and SoundFont tone selections are session-only and do not
   round-trip through schema, codec, autosave, portable files, or Undo/Redo.
2. **T196 provenance gap:** provenance/license evidence is unresolved for
   `public/audio/soundfont/acoustic_guitar_nylon-mp3.js` and the Guitar hand PNG copies. Do not claim legal
   sufficiency until evidence is committed or the assets are replaced/removed.
3. **HQ Piano licensing record:** provenance and attribution are present, but the repository does not contain
   a separate full piano-bank license text. Resolve explicitly at the release gate.
4. **Release size:** local GM and HQ Piano assets produce a roughly 409.5 MB `dist/`. Keep this visible during
   packaging/deployment decisions; do not reintroduce CDN dependencies merely to hide the size.
5. **Build/lint diagnostics:** the large-chunk warning and three pre-existing `App.tsx` hook warnings remain.
6. **Piano fidelity:** sustain samples are implemented; release resonance, sympathetic resonance, hammer
   noise, and pedal noise are deferred.
7. **Firefox automation:** the headless Windows Firefox runner has previously crashed in SWGL. Chromium is the
   accepted deterministic browser gate; do not report Firefox coverage without a fresh successful run.

## 8. Approaches tried and rejected or corrected

- **CDN-backed GM playback:** initially made all programs available but violated offline/local production
  requirements. It was replaced with the verified local manifest and must not return as a fallback.
- **SF3/stb-vorbis decoding path:** was quarantined after unreliable local decoding. Current Melody playback
  uses local FluidR3_GM MP3 sample maps through the accepted SoundFont provider.
- **Full-width `Additional` / `Contextual` Matrix rows:** wasted vertical space and obscured the physical-board
  relationships. Replaced by labeled same-band side slots.
- **Collapsible auxiliary chords:** hid valid choices and added unnecessary interaction. Auxiliary cards are
  now permanently visible and explicitly labeled.
- **Duplicated engine/tone settings:** controls in Matrix and All Steps & Measures diverged. Ownership is now
  Matrix Inspector only; do not duplicate them again.
- **Inline no-recommendation status:** changed Matrix height and caused layout movement. It now belongs in the
  fixed bottom status bar.
- **Preview-derived route origin:** allowed a forbidden route to bypass confirmation after previewing its
  target. Route guards now use the committed progression or branch endpoint.
- **Long blocked-route badges:** interfered with card readability. The accepted UI uses a
  compact `Confirm` indicator and keeps the explanation in accessible details/Inspector.

## 9. Ordered next steps

### 1. T197 + T192 — atomic schema v6 and semantic note roles

Implement these together in one controlled batch:

- persist `pianoEngine`, `guitarEngine`, `pianoSoundfontInstrument`, and `guitarSoundfontInstrument` through
  Project state, commands, schema, migration, codec, IndexedDB/autosave, portable import/export, and Undo/Redo;
- add `noteColorMode: standard | suzuki | harmonic-role` in the same v5-to-v6 migration;
- add Piano Root/Chord/Scale Tones and accessible non-color role indicators;
- classify Melody notes as chord, scale, altered, and target-next;
- add Target Notes as preview/generative guidance without mutating existing Melody until explicit apply;
- preserve effective Melody instrument partitioning and calibrate full Guitar strum spread to 20–40 ms.

Acceptance must include v5 fixtures migrating to v6, v6 round-trips across every persistence path, rejection of
future versions, Undo/Redo, export invariance, accessibility, and focused Chromium coverage.

### 2. T193 — atomic Scales & Modes application

Apply parent key and formula Steps through one undoable command; reject application in an inappropriate old
key; keep audition/cancel non-mutating and Blues I7/IV7/V7 semantics local to the Explorer.

### 3. T194 — Focus Mode and Card Flip

Add presentation-only workflows without changing musical data or global Card View. Cover keyboard/focus,
reduced motion, screen readers, responsive containment, and Guitar/Melody compatibility.

### 4. T196 — asset provenance prerequisite

Resolve or replace the nylon Guitar and Guitar hand assets. Preserve exact file inventory, byte sizes, hashes,
source revision, license, and attribution evidence.

### 5. T195 — Printable A4 and release gate

Implement HTML/print-CSS output for measures, chord symbols, arrows, and compact Guitar diagrams. Then run
offline asset verification, schema compatibility, focused and full Vitest/Chromium regression, build,
lint/format, print-size/clipping checks, and final status/publication evidence. T195 may close only after T196
and the T197/T192 schema work are accepted.

## 10. Startup checklist for the next developer

1. Read this file and `NEXT_DEVELOPER_TASK.md` completely.
2. Run `git status --short --branch` and `git log -5 --oneline`; preserve any user-owned changes.
3. Read the exact task text and linked FR/SC contracts before editing.
4. Confirm schema v5 remains internally consistent before beginning the joint v6 cutover.
5. Use focused checks with `--maxWorkers=1` and Chromium with `--workers=1 --retries=0`.
6. Do not update task checkboxes, commit, push, or begin another batch before independent acceptance unless the
   user explicitly requests it.
