# Next Developer Assignment — CadenceFlow US12, Batch F

**Assignment:** T175 only — deterministic Melody part in MusicXML 4.0.

**Do not implement T176.** Do not change MIDI, UI, Project schema, live playback, or accepted Staff
presentation behavior.

## Accepted baseline

Work on current `master` containing:

- `6b2defb feat(us12): export melody as a separate midi track`;
- `0ffee9f docs(status): accept us12 melody midi export`.

Before editing, report `git status --short` and `git log -6 --oneline`. Preserve every untracked QA,
visual-polish, screenshot, and source-information item; do not stage it. Do not push.

## Required semantic projection

- Extend the existing semantic MusicXML projection directly from the accepted contextual Melody timeline;
  do not reconstruct Melody from MIDI, WebAudio events, rendered SVG, or Piano bass.
- Add an optional immutable Melody part only when an authored Progression ChordStep owns a Melody recipe.
- Temporary Branch recipes and runtime/highlight state must not enter MusicXML.
- `Mute`, `Solo`, and Melody Volume are playback settings and must not suppress or alter notation.
- Preserve exact Rational timing until MusicXML `divisions` conversion. Divisions must account for Melody
  grids, measure boundaries, tuplets, rests, and cross-bar fragments, and must retain the accepted overflow
  error behavior.
- The source Project and projection DTOs must remain immutable and deterministic.

## Score and part structure

For projects containing Melody, output the Melody part before the existing Piano part in both `<part-list>`
and score order. Keep the accepted Piano part semantics unchanged.

- Keep Piano as stable part `P1` so its internal identifiers and no-Melody output remain compatible.
- Use a stable separate Melody part ID such as `P2`, with matching `score-instrument` and
  `midi-instrument` IDs.
- Melody is a single staff and voice, written at concert pitch.
- Clef mapping:
  - Cello → bass clef, F on line 4;
  - Violin, Oboe, Clarinet, Flute, Synth Lead → treble clef, G on line 2.
- Write the selected human-readable instrument name in `<part-name>` and `<instrument-name>`.
- MusicXML MIDI fields are one-based: zero-based app/MIDI channel `2` becomes `<midi-channel>3`, and the
  stored zero-based GM program becomes `<midi-program>program + 1`.
- Program mapping before one-based conversion: Violin 40, Cello 42, Oboe 68, Clarinet 71, Flute 73,
  Synth Lead 80.

## Melody notation

- Every generated Melody note must use its exact spelling/pitch and written duration from the accepted
  Melody projection.
- Chords without recipes, explicit RestSteps, and the aligned trailing virtual gap must be represented by
  real rests so every Melody measure is rhythmically complete.
- Notes crossing a barline must be split into fragments with `<tie>` and matching `<notations><tied>`
  stop/start semantics. Continuations must not create a second attack.
- Encode eighth- and sixteenth-triplet grids with correct `<time-modification>` values and deterministic
  tuplet start/stop notation. Do not approximate tuplets as ordinary notes.
- Straight/Swing changes live and MIDI timing only; written MusicXML durations/onsets remain straight.
- Keep harmony symbols, Piano dynamics, Piano grand staff, bass staff, tempo, key, meter/grouping, and
  existing Piano rests exactly as accepted.

## Strict backward compatibility

- If the authored progression contains no Melody recipe, `projectProjectToMusicXml` and `writeMusicXml`
  must return byte-for-byte identical DTO/XML output to the pre-T175 implementation.
- A Melody recipe present only in Temporary Branch must not add a part or change a byte.
- Existing public aliases and file writer APIs must remain compatible.
- Existing MusicXML diagnostics must remain stable; add new typed diagnostics only when a Melody semantic
  cannot be represented exactly.

## Required tests

Extend focused MusicXML tests and validate freshly generated output against the repository's offline
MusicXML 4.0 XSD:

- Melody appears before Piano with stable unique IDs;
- all six instrument names, clefs, MIDI channels, and one-based MIDI programs;
- exact pitches/spellings, note types, durations, voices, and staff numbers;
- explicit rests for no-recipe chords, RestSteps, and trailing virtual gap;
- eighth- and sixteenth-triplet `<time-modification>` plus tuplet boundaries;
- cross-bar start/stop ties and no duplicate attacks;
- 3/4 and grouped 7/8 measure completeness;
- Mute/Solo/Volume and Swing do not change written notation;
- Temporary Branch is excluded;
- deterministic XML and Project immutability;
- a pinned no-Melody fixture remains byte-for-byte identical to its pre-T175 XML;
- invalid Melody projection data fails with a typed stable error rather than producing invalid XML.

Use an independently parsed XML assertion for part order and IDs in addition to string checks. At least
one fresh Melody fixture must pass the real offline XSD validator; a deliberately invalid fixture must
still be rejected.

## Verification and reporting

Run only:

1. focused MusicXML Vitest files with `--maxWorkers=1`;
2. `pnpm validate:musicxml` (or the repository's exact offline validation command) on fresh valid and
   deliberately invalid fixtures;
3. the export projection consistency test if the shared contract changes;
4. TypeScript;
5. ESLint and Prettier for changed files only;
6. `git diff --check`.

Do not run full Vitest, full Chromium, unrelated E2E, or the production build. No Chromium test is required
for this projection/writer-only batch. Restore/keep the dev server at `http://127.0.0.1:5174/`.

Commit implementation and tests as:

`feat(us12): export melody as a separate musicxml part`

Leave T175 unchecked and do not modify `PROJECT_STATUS.md`, `spec.md`, `plan.md`, or `tasks.md`; acceptance
is recorded only after independent review.

Report commit hash and exact files; parsed part order/IDs; instrument/clef/program evidence; rest, tuplet,
tie, divisions, and measure-capacity evidence; no-Melody byte compatibility; real XSD results; focused
commands; final Git status/ahead count; HTTP status; and `Spec deviations: none` or every deviation.
