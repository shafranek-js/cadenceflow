# T212 selected-range transposition — design preparation

Date: 2026-10-03. Status: proposed contract for the next separate developer batch, not implementation or acceptance.

## Current evidence

The Project schema is v9 (`src/domain/project/migrations.ts`). ChordStep and RestStep have no persisted transposition field (`src/domain/progression/step.ts`). The existing range toolbar explicitly disables Transpose. `realizeChord(identity, tonic)` receives global tonic; multiple score/card/inline/Piano Roll projections call it directly. Implementing only a toolbar command or changing the Project tonic cannot satisfy T212.

T215 is independently accepted; its implementation and all existing dirty files remain protected. No adjacent implementation has started. No stage, commit, push, deployment or Actions changes are authorized by this document.

## Proposed musical contract

Transpose selected stable Step IDs by an integer semitone amount in one command. Preserve global tonic, Step IDs, durations, sections, loops, instruments, dynamics, selection and every unrelated Step. Both Harmony and the selected owners' Melody move by the same amount, including Rest-owned authored notes and their cross-bar continuations. Selection refers to owners, not clipping rectangles. Zero is a no-op; reject the whole operation when any resulting exact pitch falls outside MIDI 0..127. Never clamp, drop or octave-wrap an invalid note.

Retain harmonic function identity relative to the original Project context. Display a clear local transposition indication alongside the resulting chord name; do not silently label a changed root as an unchanged concert-pitch function. Matrix discovery and global setTonic retain their existing semantics. Determine spelling from a shared deterministic transposition policy, respecting exact altered pitches, rather than coercing notes to scale degrees.

## Representation and projection gate

Before implementation, the developer must compare two representations explicitly: a canonical Step-local accumulated semitone offset versus materialized local harmonic context plus transformed authored pitches. The preferred candidate is a Step-local offset shared by ChordStep and RestStep, default zero, with schema v9→v10 migration and round-trip validation. This choice is conditional on proving a single resolution boundary can serve all projections without double-transposing manual voicing/custom bass, authored notes, regenerated Melody or newly inserted notes.

For an offset representation, stored pitches remain in the owner's source frame. Every editor accepting concert pitch must invert the owner's offset before persistence; all effective projections apply it exactly once. This includes T210 MIDI input, manual note entry, Piano Roll move/resize/clipboard, authored dialog, chord replacement, generated materialization, cross-owner transactions, split/tie/delete/duplicate and T215 measure deletion. If this frame rule cannot be made coherent, revise the representation before adding a schema constant or enabling the control.

The resolution boundary must account for chord realization, manual voicing, custom bass, chord spelling overrides, generated Melody's next-chord context, authored exact pitches, and optimizer output. Preserve unselected generated owners' effective phrases when a selected next chord changes their context; use explicit materialization with retained recipes only when necessary. A global effective-timeline comparison should reject unintended outside changes.

## Implementation inventory to verify

- Model/migration/codec/fixtures, autosave and portable projects: add the representation atomically; older versions migrate to identity behavior and future versions still refuse safely.
- Shared harmonic and exact-pitch resolution: replace Step-specific direct `realizeChord(...project.tonic)` calls with one authoritative path. Keep Matrix-only realization independent.
- Playback/audition, voicing optimizer, MIDI, MusicXML, printable score, Harmonic/Piano/Guitar/Staff/TAB/Piano Roll and chord labels: prove identical concert pitch and deterministic spelling.
- Authored/generated Melody and all editing transactions: prove frame conversion exactly once, stable identity/ownership and no unrelated changes.
- Range toolbar: accessible transient amount editor, explicit Apply/Cancel, preview non-mutating, one Undo/Redo; clear invalid-range reason. Stop/cancel stale audio previews on application and session changes.

## Verification gate

Pure tests must cover positive/negative/octave offsets, repeated accumulation and zero, exact spelling, manual voicing/custom bass, altered/generated/authored/Rest notes, cross-owner data, out-of-range atomic rejection, unselected generation context, old-project migration, codec/autosave/export, one history entry and exact Undo/Redo.

Chromium must exercise actual Shift-selected ranges and Apply/Cancel/Escape, all six views, mocked MIDI insertion into a transposed owner, cross-owner move/clipboard, save/reopen, playback/export agreement, and unrelated Step preservation. Inspect normal 640×360, 1280×720 and 1920×1080 images in both themes. Run focused Vitest with maxWorkers=1, fresh build, related Chromium with workers=1/retries=0, scoped lint/format and diff checks. Protect accepted T210/T215/NOTE/CHORD/Staff/TAB/MusicXML behavior.

The developer must submit a complete handoff with exact commands/totals, requirement mapping, durable actually viewed captures, Git state and limitations. Independent root acceptance remains a separate gate. T212 stays unchecked until then; T213/T214 remain separate sequential batches.
