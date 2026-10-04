# T210 independent acceptance — 2026-10-02

Accepted locally by the root reviewer after the complete developer handoff at cursor
`66147585-ec5f-4763-911c-4225e18055b9:68`. This accepts the full approved T210 contract,
not a resize-only subset or a full release. Physical MIDI hardware remains untested.

## Independent evidence

The reviewer inspected the controller, parser, duration/cursor helpers, sidebar/status portal,
StudioWorkspace layout, ProgressionTrack insertion path, App transaction/audio path and the actual
unit/browser assertions, then ran these checks on the current dirty checkout:

```powershell
pnpm exec vitest run tests/unit/melody/midi-step-input.test.ts tests/unit/melody/piano-roll-batch1-acceptance.test.ts tests/unit/melody/piano-roll-system-chord-commands.test.ts tests/unit/audio/piano-roll-audition.test.ts tests/unit/export/t207-authored-melody-projection.test.ts --maxWorkers=1
pnpm build
pnpm exec playwright test tests/e2e/t210-web-midi-step-input.spec.ts --project=chromium --workers=1 --retries=0
pnpm exec playwright test tests/e2e/piano-roll-system-note-panel.spec.ts tests/e2e/piano-roll-system-chord-portable.spec.ts tests/e2e/staff-guitar-audio-clock.spec.ts --project=chromium --workers=1 --retries=0 --grep 'System note panel edits selected|owner-colliding|real portable import|normal pointer resize transfers exact|restores a second-measure|Staff and rhythmic TAB'
pnpm exec eslint src/app/App.tsx src/audio/testHooks.ts src/ui/melody/PianoRollView.tsx src/ui/melody/PianoRollMidiStepInput.tsx src/ui/melody/midiStepInput.ts src/ui/progression/ProgressionTrack.tsx src/ui/studio/StudioWorkspace.tsx tests/unit/melody/midi-step-input.test.ts tests/e2e/t210-web-midi-step-input.spec.ts
pnpm exec prettier --check src/app/App.tsx src/audio/testHooks.ts src/styles/progression.css src/ui/melody/PianoRollView.tsx src/ui/melody/PianoRollMidiStepInput.tsx src/ui/melody/midiStepInput.ts src/ui/progression/ProgressionTrack.tsx src/ui/studio/StudioWorkspace.tsx tests/unit/melody/midi-step-input.test.ts tests/e2e/t210-web-midi-step-input.spec.ts
git diff --check
```

Results: 5 Vitest files / **42 tests passed**; fresh build passed; **18/18 T210 Chromium**
and **6/6 related Chromium** passed. ESLint: zero errors, six existing Hook warnings.
Prettier and diff check passed. Build chunk-size warnings are retained.

## Requirement assessment

- All MIDI controls live in Midi Settings, with keyboard close/focus return and the existing
  responsive sidebar pattern. The existing status bar shows actual device/connection/arm state.
- Granted startup and real hotplug activation can auto-arm; prompt/denied startup does not prompt.
  Device selection/listener cleanup and delayed permission cancellation were inspected and tested.
- Armed intent, effective input and window suspension are distinct. Background messages are discarded;
  safe focus resumes input, while Escape/manual Off/playback/view/session/disconnect clear intent.
- All 15 exact durations, independent Snap, absolute cursor, pitch 0–127 and message filters are covered.
  Synchronous authoritative store reads preserve bursts. Cursor advances only after confirmed success.
- Existing/generated/Rest Melody, cross-step/bar/System notes, exact Undo/Redo, owner/recipe preservation
  and whole-insert overflow rejection are asserted through portable project data.
- Successful input previews only the current Melody instrument/volume for 250 ms; delayed preparation,
  disarm/suspension/session changes and Sound on input Off are guarded. MIDI state is transient;
  schema/codec/autosave were not extended.
- Related checks preserve NOTE, CHORD, both-edge duration transfer, the protected second-measure
  regression, Staff/TAB audio-clock behavior and authored export projection.

## Visual inspection

The independent browser run regenerated current captures in `artifacts/validation/t210-midi/`.
The reviewer opened and inspected 24 open/closed viewport captures (Degrees/Chromatic, light/dark,
640×360 / 1280×720 / 1920×1080), 12 status-bar captures and four compact panel-bottom captures.
Midi Settings remains below the header, desktop music/sidebar columns remain separate, compact
controls are reachable by internal scrolling, and cursor/status states are legible. No new MIDI
overlap or horizontal overflow was found. Existing 1280-wide transport toolbar crowding is outside
T210; this report does not claim all application layout issues are resolved.

## Limits and preserved state

Two broader legacy scenarios failed in the developer run and were reproduced against baseline:
an obsolete melody-event selector and a compact viewport visibility expectation. The reviewer
inspected the baseline substitution helper and evidence; these are not counted as passing tests.
See the developer handoff and `artifacts/validation/t210-midi/baseline-regression-evidence.md`.
The focused current related scenarios above passed independently.

Browser MIDI permissions/protocol and audio scheduling use mocks; real hardware/audio output,
other browser engines and the full release suite are unverified. T212/T213/T214 remain separate.

HEAD remains `f801562794b39ff3d039b56e0010829aff9a1b2b` on master. All implementation/doc/test/capture
changes remain unstaged and uncommitted. The old 62-line chord-portable regression and all unrelated
tracked/untracked work are preserved. No commit, push, deployment, cleanup or Actions change occurred.
Changed implementation files and complete Git status are listed in the developer handoff; this
acceptance adds only this report and the T210 status entry in tasks.md.
