# Next Developer Assignment — CadenceFlow US12, Batch G

**Assignment:** T176 only — final US12 integration and Chromium acceptance.

This is an acceptance batch, not a feature-expansion batch. Audit the existing US12 coverage, add only
the missing cross-layer and browser acceptance evidence described below, and make product-code changes
only when a new test exposes a concrete defect.

## Accepted baseline

Work on current `master` containing:

- `2e33784 feat(us12): export melody as a separate musicxml part`;
- `a140cae fix(us12): align melody previews and step audition`;
- `c225cec fix(us12): highlight step preview notes`;
- `a7691e8 feat(us12): export melody as a separate musicxml part`;
- the docs/status commit that accepts T175 and assigns T176.

Before editing, report `git status --short` and `git log -6 --oneline`. Preserve every untracked QA,
visual-polish, screenshot, and source-information item; do not stage it. Do not push.

## Scope boundaries

- Implement **T176 only**. Do not start Phase 14/T150–T158 or reopen accepted T166–T175 behavior.
- Do not change `spec.md`, `plan.md`, `tasks.md`, or `PROJECT_STATUS.md`.
- Leave T176 unchecked; the orchestrator records acceptance after independent review.
- Do not redesign Melody UI, audio providers, Staff layout, MIDI, MusicXML, or Project schema.
- Do not add a piano roll, manual Melody notes, multiple Melody tracks, SoundFont import, rendered audio,
  mobile redesign, or external DAW/notation-app installation.
- If acceptance exposes a defect, make the smallest semantic correction and add a regression test. List
  every product file changed and explain the failed invariant.

## Required cross-layer integration evidence

Add `tests/integration/us12-melody-acceptance.test.ts` (or one equivalently focused file) that proves
SC-018 from one immutable canonical Project fixture instead of merely repeating isolated unit tests.

The integration fixture must cover all six Patterns and all five Grids across the fixture set and verify:

- Melody events use only each source Chord Step's contextual upper voicing; bass pitches never enter;
- event indexes, Step IDs, exact Rational onsets/durations, truncated tails, duplicates, and octave
  doublings remain deterministic;
- recipe-only persistence survives encode/decode and contains no generated-note/event arrays;
- Staff, playback/performance, MIDI, and MusicXML project the same Melody pitch identity and exact source
  timing, accounting for their documented representation units;
- Straight/Swing affects only supported live/MIDI timing and does not alter semantic/Staff/MusicXML
  written timing; triplet grids remain straight;
- MIDI and MusicXML retain Melody when Mute, Solo, or Volume changes; Temporary Branch-only recipes remain
  excluded;
- source Project and all returned projections remain unchanged and deterministic.

Use independent parsing of serialized MIDI bytes and serialized MusicXML for at least one representative
fixture. Do not prove serialization solely by comparing production DTOs to each other.

## Required Chromium acceptance

Extend the focused US12 E2E coverage or add `tests/e2e/us12-final-acceptance.spec.ts`. Reuse existing
helpers where practical. Chromium must prove the user-visible path rather than setting Project state by
calling production internals.

Cover these outcomes:

1. Create and edit a Melody recipe through the keyboard-accessible context menu/dialog; verify focus
   return and one-step Undo/Redo behavior.
2. Change Instrument, Mute, Solo, and Volume; verify Mute/Solo exclusion and that Melody Staff clef/note
   presentation updates without changing the Piano staff.
3. Save/autosave and reload the project; verify the recipe, instrument, controls, and regenerated Staff
   phrase survive while Undo/Redo history is fresh.
4. Export MIDI and MusicXML from the restored project; inspect downloaded bytes/text independently and
   confirm Melody is present with the selected instrument while playback-only settings do not remove it.
5. Verify playback highlights the source chord and one current Melody note, then clears highlights after
   Stop. Sample-provider failure must leave Piano usable and both export actions enabled; use deterministic
   request interception if this can be tested without adding product-only hooks.
6. At both 1280×720 and 1920×1080, verify light and dark themes, readable selected Melody-note state,
   visible controls/staves, and zero document-level horizontal scroll.

Avoid timing sleeps. Wait on observable application state, downloads, responses, and deterministic test
hooks already present in the product.

## Verification commands

Use Node 24.14.0 and pnpm 10.12.4. Run only the US12-focused gates:

1. `pnpm verify:melody-assets`
2. Focused US12 Vitest files, including the new integration test, with `--maxWorkers=1`
3. `pnpm validate:musicxml` for one freshly generated valid Melody document and one deliberate invalid
   document
4. `pnpm exec tsc --noEmit`
5. `pnpm build`
6. After the build, targeted US12 Chromium only with `--project=chromium --workers=1 --retries=0`
7. ESLint and Prettier for changed files only
8. `git diff --check`

Do not run full Vitest, full Chromium, unrelated E2E, or Firefox. The later Phase 14/T157 gate owns the
complete product suite. Keep or restore the dev server at `http://127.0.0.1:5174/` and verify HTTP 200.

## Commit and report

Commit implementation/tests as:

`test(us12): complete melody acceptance`

Report:

- commit hash and exact files;
- the canonical fixture matrix for all Patterns/Grids;
- independent parsed MIDI/MusicXML evidence;
- persistence/reload and fresh-history evidence;
- Chromium results by viewport/theme with retry count;
- any product defects found and corrections made;
- exact focused commands and totals;
- final Git status/ahead count and HTTP status;
- `Spec deviations: none` or every deviation.
