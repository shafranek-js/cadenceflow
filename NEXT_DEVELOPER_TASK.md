# Next Developer Assignment — T188 GM Melody catalog and inheritance

**Status:** Authorized for implementation. Stop after this batch for independent orchestrator acceptance.

Implement only T188: replace the six-value Melody instrument union with one canonical 128-program General
MIDI catalog, retain the current six ids and local timbres, and add a project-level default plus optional
Step-local instrument override. Do not add audio assets or dependencies.

## Accepted baseline and invariants

- T001–T186 and T189, schema v4, FR-001–FR-220, and SC-001–SC-021 are accepted.
- Melody recipe generation and its five axes remain unchanged. Instrument is a separate Step/Track concern.
- Existing six ids and v1–v4 projects remain valid; no-Melody MIDI/MusicXML output remains compatible.
- The checkout is intentionally dirty. Preserve accepted tracked work and unrelated untracked Graphify, QA,
  source, screenshot, and evidence files. Do not commit, push, deploy, or reformat unrelated files.

## Required implementation

1. Add a pure immutable catalog in `src/domain/melody/instrumentCatalog.ts` with exactly one entry for each
   zero-based GM program 0–127: stable id, family, label, clef, playable range, optional sample asset, and
   `available | export-only`. Keep `flute`, `violin`, `clarinet`, `oboe`, `cello`, and `synth-lead` as the
   canonical ids for their existing programs; use `gm-NNN` for the other 122. Reject duplicate ids/programs,
   missing programs, invalid ranges, and asset metadata not backed by the existing manifest. Range metadata
   is informational: use 0..127 unless a narrower range is already verified; do not invent range enforcement.
2. Move Project persistence to schema v5. Add optional `ChordStep.melodyInstrumentOverride`; absence means
   `Use track instrument`. Implement strict v4→v5 migration with no overrides, sequential old-version
   migration, Temporary Branch support, autosave/recovery, future-version rejection, and canonical v5 JSON
   schema/codec coverage. Never serialize an inherited effective value.
3. Add one pure resolver equivalent to
   `step.melodyInstrumentOverride ?? project.melodyTrack.instrument`. Add undoable commands for the global
   default and Step override/inherit transition. Repeat copies an explicit override into an independent Step;
   Remove Melody removes its override; reorder/replace/delete and Undo/Redo keep canonical Step identity.
4. Replace the current Instrument selects with one reusable compact grouped/searchable keyboard-accessible
   picker. In Melody Track controls it edits the global default. In Create/Edit Melody it starts with
   `Use track instrument`, edits only the draft Step override, and preserves Apply/Cancel semantics and every
   Melody recipe axis. Show GM program plus `Realtime`/`Export only`; keep focus, Escape, light/dark,
   1280×720, 1920×1080, 200% zoom, internal scrolling, and no page overflow.
5. Drive Melody preview, Staff labels/clefs, live playback, MIDI, and MusicXML from the effective instrument.
   Lazy-load only used playable timbres. Export-only choices must expose an identified nonfatal unavailable
   state, never substitute a timbre or stop Harmony, and remain exportable. Mixed-instrument progressions
   retain playable phrases and report unavailable ones. Do not preload all six assets.
6. Partition events by effective instrument with no duplication. Each unique instrument gets exactly one
   Staff line in every system where it sounds, one MIDI track, and one full-score MusicXML part. Repeated
   Steps using the same instrument reuse that lane. A Step override moves its events to the override lane.
   Staff omits lanes inactive for that system; MusicXML fills inactive measures with rests. Order lanes by
   first progression occurrence, then GM program/id. Preserve timing/ties/tuplets and no-Melody output.

## Verification

- Add focused catalog completeness/metadata tests for all 128 programs and six manifest-backed assets.
- Add command, Repeat/remove, migration/codec/autosave, inheritance, mixed-instrument playback/provider,
  Staff lane, separate MIDI-track, separate MusicXML-part, event-partition, and no-Melody compatibility tests.
- Add focused Chromium for global/default inheritance, two independent Step overrides, Apply/Cancel,
  search/group/keyboard/focus, explicit export-only state, save/reload, Undo/Redo, and responsive containment.
- Run focused Vitest with `--maxWorkers=1`, focused Chromium with `--workers=1 --retries=0`, `pnpm build`,
  scoped ESLint/Prettier, and `git diff --check`.

## Boundaries

Do not add/download assets, implement arbitrary SoundFont management, create chord Instrument Profiles or
multiple Melody Tracks, alter pitch/rhythm generation, add Suzuki colors, touch Matrix views, or broaden
Harmony behavior. If the existing audio scheduling interface cannot represent mixed effective instruments,
extend only the Melody event/provider path and preserve piano/harmony contracts.

Report decisions, changed files, exact checks/totals, unavailable-audio behavior, remaining risks, and final
Git status; then stop for independent acceptance.
