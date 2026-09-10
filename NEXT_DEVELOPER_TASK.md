# Next Developer Assignment — CadenceFlow US12, Batch E

**Assignment:** T174 only — deterministic Melody track in Standard MIDI File format 1.

**Do not implement T175 or T176.** Do not change MusicXML, UI, Project schema, playback behavior, or the
accepted Melody generator/provider.

## Accepted baseline

Work on the current `master` baseline containing:

- `18bd946 fix(us12): share contextual melody realization`;
- `28e9863 feat(us12): add safe sampled melody playback`;
- `a5287f2 test(us12): complete melody playback acceptance`;
- `866810a fix(us12): complete safe melody playback acceptance`;
- `acd1210 docs(status): accept us12 sampled melody playback`.

Before editing, report `git status --short` and `git log -6 --oneline`. Preserve all untracked
visual-polish/QA/source-information files and do not stage them. Do not push.

## Required behavior

### Projection

- Extend the semantic MIDI projection without reconstructing Melody from live WebAudio or Staff SVG.
- Generate Melody from the accepted contextual upper-voicing and exact Rational recipe timeline.
- Straight subdivisions follow the same Swing onset projection as live Melody; triplet grids remain
  unswung. Quantize only at the existing MIDI PPQ boundary using the established deterministic half-up
  policy.
- Melody events inherit the velocity of their corresponding pre-octave-offset upper source note.
  Melody Track Volume must not overwrite note velocity; it is exported separately as CC7.
- `Mute` and `Solo` are playback controls only and must not remove or alter exported Piano or Melody data.
- Temporary Branch recipes and runtime/highlight state must not enter MIDI.
- Preserve aligned final-measure silence through End-of-Track; do not create phantom notes.
- Keep the source `Project` and all projection DTOs immutable and deterministic.

### Format-1 writer

When at least one authored Progression ChordStep has a Melody recipe, write exactly four tracks in this
order:

1. `CadenceFlow Conductor` — tempo and meter;
2. `CadenceFlow Melody` — Melody notes;
3. `CadenceFlow Chords` — Piano upper notes;
4. `CadenceFlow Bass` — independent Piano bass notes.

Melody track requirements:

- zero-based MIDI channel `2` for channel prefix, program change, CC7, note-on, and note-off;
- track name `CadenceFlow Melody`;
- instrument-name meta event from the selected human-readable instrument label;
- program mapping: Violin `40`, Cello `42`, Oboe `68`, Clarinet `71`, Flute `73`, Synth Lead `80`;
- CC7 value equals the stored integer Melody Track Volume `0..127`;
- at a shared tick, note-off precedes note-on, including consecutive notes of the same pitch;
- End-of-Track is emitted at the same aligned `totalTicks` as every other track.

Do not emit a nonstandard clef event: MIDI has no portable clef semantic.

### Strict backward compatibility

- A project with no authored Melody recipe must produce byte-for-byte identical output from
  `projectProjectToMidi` + `writeMidiFile` to the accepted pre-T174 baseline.
- Such a file remains format 1 with the existing three tracks in the existing order.
- `writeStandardMidiFile` keeps its accepted format-0 behavior and bytes.
- The presence of only a Temporary Branch Melody recipe does not enable the Melody track.

## Suggested interfaces

Keep the existing public APIs working:

- `projectProjectToMidi(project)`;
- `projectProgressionToMidi(project)`;
- `projectMidiEvents(project)`;
- `writeMidiFile(projection)`;
- `writeStandardMidiFile(projection)`.

An optional immutable Melody section may be added to `MidiProjection`, but omit it entirely for
no-Melody projects so backward-compatible callers and byte output remain stable. Reuse or extract the
existing tick quantizer instead of duplicating a different rounding algorithm.

## Required tests

Extend the focused MIDI tests with an independent SMF parser that verifies actual emitted bytes, not only
internal DTOs:

- four-track format-1 order and declared track count;
- Melody channel prefix/channel `2`, instrument name, exact GM program, and CC7 volume;
- exact Melody pitches, velocities, start/end ticks, and aligned EOT;
- Swing changes straight-grid onsets but not triplet-grid onsets;
- repeated same pitch has note-off before the following note-on;
- Mute/Solo do not change exported data;
- Temporary Branch is excluded;
- output is deterministic and Project is not mutated;
- a no-Melody fixture is byte-for-byte identical to a pinned pre-T174 golden byte sequence;
- legacy `writeStandardMidiFile` format-0 bytes remain unchanged.

Use a fixture containing at least two contextual chords, one Rest, a trailing virtual gap, a velocity
override, and a Melody octave offset. Cover all six instrument program mappings with a table-driven test.

## Verification and reporting

Run only:

1. focused MIDI Vitest files with `--maxWorkers=1`;
2. the existing export projection consistency test if its MIDI contract is touched;
3. TypeScript;
4. ESLint and Prettier for changed files only;
5. `git diff --check`.

Do not run full Vitest, full Chromium, MusicXML validation, or unrelated E2E. No Chromium test is required
because this batch changes the existing export projection/writer behind an already accepted UI action.
Keep the dev server responding at `http://127.0.0.1:5174/` after verification.

Commit implementation and tests together as:

`feat(us12): export melody as a separate midi track`

Leave T174 unchecked and do not change `PROJECT_STATUS.md`, `spec.md`, `plan.md`, or `tasks.md`; acceptance
status is updated only after independent review.

Report the commit hash, exact changed files, parser evidence for every track/channel/program/CC7/EOT,
no-Melody golden compatibility evidence, focused command results, final Git status/ahead count, HTTP status,
and `Spec deviations: none` or the complete deviation list.
