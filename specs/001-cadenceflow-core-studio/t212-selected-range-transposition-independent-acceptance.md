# T212 independent acceptance

Accepted by root on 2026-10-03 (Europe/Prague), against the actual uncommitted checkout at published HEAD `f801562794b39ff3d039b56e0010829aff9a1b2b`. This accepts T212 only, not release readiness or the remaining programme.

Reviewed the implementation handoff and requirement matrix, source-frame conversion and compensation/spelling fields, migration/codec, atomic range command and inverse snapshot, generated-context preservation, authored/Rest transactions, optimizer concert/source conversion, editor selection, audio cancellation, and downstream playback/notation/export tests. Earlier callback, focus, viewport, spelling, transient selection and sourcePitchMidi regressions were corrected before this gate.

## Independent commands

- `pnpm run build`: passed, 461 modules; Vite 15.66s; existing large-chunk warning only.
- `pnpm exec vitest run tests/unit/app/range-transposition.test.ts tests/unit/progression/transposition.test.ts tests/unit/progression/voice-leading-optimizer.test.ts tests/unit/progression/t212-concert-pitch-consumers.test.ts tests/unit/persistence/t212-transposition-schema.test.ts --maxWorkers=1`: 5 files, 27/27 passed.
- `pnpm exec playwright test tests/e2e/t212-range-transposition.spec.ts tests/e2e/t210-web-midi-step-input.spec.ts tests/e2e/t215-measure-context-menu.spec.ts tests/e2e/piano-roll-system-chord-portable.spec.ts tests/e2e/t202-range-selection.spec.ts --project=chromium --workers=1 --retries=0`: 67/67 passed, 7.6 minutes. Includes the five T212 scenarios, mocked MIDI under nonzero offset, autosave reload, cross-owner clipboard with differing offsets and portable reopen, exact protected chord snapshots and related accepted flows.
- Scoped ESLint on 14 source/test paths: exit 0, zero errors, three existing PianoRollView exhaustive-deps warnings.
- Scoped Prettier on nine T212 modules/tests: passed. Shared whole-file formatting exclusions remain described in the implementation handoff; no blanket formatting performed.
- `git diff --check`: passed. Index empty; protected portable chord test remains exactly 62 additions and zero deletions.

## Visual inspection

The independent Chromium run freshly regenerated all six normal-viewport images in `artifacts/validation/t212-transposition/screenshots/`. Root opened and inspected every `range-editor-{640x360,1280x720,1920x1080}-{dark,light}.png`. The amount input, preview and Apply/Cancel are readable, below the header, inside the viewport and unobstructed. The compact layout has no internal scrolling; browser checks also exercise input focus/click and focus return.

## Limits

Physical MIDI is untested; browser MIDI is mocked. No full suite or publication was performed. Previously established chord-panel geometry and Staff count-in baseline defects remain separate and are not counted as passes. Existing T210/T215 changes and all tracked/untracked material remain preserved. No stage, commit, push, deployment, cleanup or Actions change occurred.
