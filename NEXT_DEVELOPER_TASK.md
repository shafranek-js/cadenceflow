# Accepted Developer Assignment — T191 strict harmonic routing

**Status:** T191 is independently accepted. This file is retained as the completed assignment record. No new
developer batch is currently authorized; do not start T192 or any later task without an explicit user command.

## Verified baseline

- Accepted work exists through T190, including the T188 local GM catalog, Batch 2 documentary convergence,
  and T190 canonical topology. Start from the committed T190 baseline. Do not reset, clean, push, deploy, or
  rewrite protected Graphify/QA/source, screenshot, `info source`, or `CHORDFILES_COMPARISON.md` material.
- Current portable persistence is schema v5. The effective Melody instrument is exactly
  `step.melodyInstrumentOverride ?? project.melodyTrack.instrument`; inherited values are not serialized.
- All 128 General MIDI Melody programs are manifest-backed local assets at the pinned FluidR3_GM revision;
  the six old ids are compatibility identifiers. Runtime loads programs lazily and has no production CDN
  dependency or export-only catalog entries.
- Current Progression Views are Harmonic, Piano, Staff, Guitar, and Tablature. `measuresPerSystem` accepts
  `auto` and manual 1–8; Auto currently targets 2–6 and may reflow for width/density.
- Guitar fretboard/chord shapes, standard tuning, fingering, in-position Scale Tones, tablature, HQ
  Samples/SoundFont engines, and bounded strum scheduling are implemented. Scales & Modes Explorer,
  Blues vocabulary, voice leading, reharmonization, modulation, cadence formulas, and Suzuki colors are
  implemented current surfaces.
- `AudioEnginesInspector` is the sole engine/tone settings surface. HarmonyTrackControls and the lower
  PianoAudioStatus retain only their documented track/provider controls and Retry behavior. Engine/tone
  fields are not currently portable/autosave round-tripped; T197 owns codec/schema/autosave/export/Undo
  persistence and must not be inferred from the current UI.

## Authorized batch — T191 only

Implement the strict directed-tension and Modal Corridor contract from T191, FR-026–FR-036, and FR-243.

- Treat topology `targetId` as the sole Best Match after a directed tension chord such as a secondary
  dominant or secondary diminished chord. Do not promote another tension chord as an ordinary Alternative.
- Keep other musically valid visible cards selectable, but clearly distinguish a blocked/requires-confirmation
  route from a recommendation. Do not mutate or remove legacy project data.
- Enforce the Progressions Modal Interchange corridor through `I`, `IV`, or `V`: entry into and return from a
  modal-interchange chord follows the canonical gateway rules. A direct manual route outside the corridor
  must show a concise warning with explicit `Add anyway`; cancelling must be non-mutating.
- Keep `Best Match`, `Alternative`, blocked-route rationale, and Beginner/Composer/Expert explanations
  consistent between Matrix badges, Inspector, keyboard operation, and temporary-branch context.
- Preserve the accepted T190 geometry: stable semantic columns, visible source/target arrows and highlights,
  the same-band `Tritone substitution`/contextual slots, and no full-width `Additional` or `Contextual` rows.
- Add deterministic fixtures covering all 12 tonics, directed tension resolution, tension-to-tension
  exclusion, allowed corridor transitions, manual violations, cancellation, `Add anyway`, mouse, keyboard,
  playback highlight, and responsive/layout-pressure routing.

### Non-goals

- No schema change; schema v5 remains current.
- No T192–T197 work, Piano/Melody Target Notes, Explorer apply changes, Focus Mode, Card Flip, print view,
  audio-asset changes, or release work.
- Do not redesign T190 topology or move recommendation status back into the Matrix layout.

### Required evidence

- Focused Vitest with `--maxWorkers=1`.
- Focused Chromium with `--workers=1 --retries=0`, including 1280x720, 1920x1080, dark/light, and 200%
  equivalent layout pressure.
- `pnpm build`, scoped ESLint/Prettier, and `git diff --check`.
- Report the exact changed files and any remaining warnings. Stop for independent acceptance; do not update
  T191 checkboxes or `PROJECT_STATUS.md` yourself.

## Later Batch 5–8 queue (not authorized)

1. Piano Scale Tones, Melody harmonic roles, Target Notes, and the single atomic schema-v5 → v6 migration
   shared by T192 and T197: `noteColorMode` plus Piano/Guitar engine and SoundFont tone persistence; no v7.
2. Atomic Scales & Modes Explorer modal apply with undoable key/progression transaction.
3. Focus Mode and Card Flip presentation workflows.
4. Printable A4 projection and release gate.
5. Resolve the remaining nylon Guitar audio and Guitar hand PNG provenance with pinned source, hash,
   license, and attribution evidence; the reused steel asset is already covered by the T188 manifest.
6. Resolve portable/autosave/export/Undo round-trip for Piano/Guitar engine and SoundFont tone fields as the
   T192 prerequisite/joint workstream; do not create a separate schema version.

The dependency-ordered unchecked tasks are appended to `specs/001-cadenceflow-core-studio/tasks.md` as
T191–T197. T191 is now selected; later tasks still require explicit authorization.

## Verification boundary

For any future implementation, keep schema v5 valid until runtime, codec, migration, fixtures, and the
JSON Schema switch atomically. Use focused Vitest with one worker, Chromium with one worker/no retries,
build, scoped formatting/lint, `git diff --check`, and independent acceptance before the next batch.
