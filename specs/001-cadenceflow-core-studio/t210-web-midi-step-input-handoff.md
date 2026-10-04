# T210 Web MIDI step input implementation handoff

Date: 2026-10-02 (Europe/Prague). Implementation complete; **independent acceptance pending**.
T210 stays unchecked in tasks.md. Physical MIDI hardware was not available/tested.

## Checkout and boundaries

- Workspace: `C:/Projects/cadenceflow`.
- Branch: `master`; HEAD `f801562794b39ff3d039b56e0010829aff9a1b2b`.
- All work is uncommitted and unstaged. No commit, push, deploy, cleanup, full-suite run or Actions change.
- Reused the initial uncommitted T210 implementation, corrected its stale UX/lifecycle contract, and
  reconciled FR-256, SC-040, T210 and the saved implementation plan with the latest human requirements.
- Preserved `tests/e2e/piano-roll-system-chord-portable.spec.ts`, including its pre-existing 62-line
  resize regression. This developer did not edit that file. Other initial dirty/untracked material remains.
- No Project schema/codec/autosave fields, MIDI recording/chord aggregation or T212/T213/T214 work.

## Architecture and behavior

`midiStepInput.ts` owns browser permission/device listeners and pure protocol/timing helpers.
`armed` represents intention; `focusSuspended` and `effectiveInputEnabled` separately govern the
input gate. A permission generation invalidates stale session/reset/disposal results. An activation
epoch spans both `permissions.query` and `requestMIDIAccess`: manual/safety OFF during either
pending stage prevents the later result from reviving intent. `pendingPermission` lets the actual
Escape keyboard handler cancel activation during the otherwise-idle query stage. Startup permission
checking happens once per controller, after App startup restoration is ready, including StrictMode
controller replacement. Unsupported permission queries use explicit Connect, never an automatic prompt.

Granted access connects with `{sysex:false}`, preserves the prior available choice or selects the
stable first connected input, and auto-arms only with active Piano Roll and stopped transport.
Device notifications keep current selection/intent; real new/replaced connected inputs may activate.
Old listeners are removed before attaching replacements; device object replacement with the same ID
also detaches old listeners and cancels previews. No `onmidimessage` property is overwritten.

`ProgressionTrack` owns transient exact cursor/duration/manual-pitch/sound settings. Its synchronous
cursor ref advances only after App confirms successful commit. A layout effect refreshes the insertion
callback and current activation context before browser input. Session identity includes both Project
ID and a transient App session counter, so a same-ID import disarms. Ordinary note updatedAt/selection/
UndoRedo do not move the cursor or rearm. Escape/manual OFF clear intent during suspension. Playback,
view/session replacement and selected-device disconnect permanently disarm. Window blur stops and
cancels previews, preserves intent and drops background Note On without queue/replay; focus clears
suspension, with lifecycle disarm preventing unsafe resume. Moving focus inside the window does not pause.

`StudioWorkspace` hosts one **Midi Settings** panel in the existing My Progression sidebar grid slot.
The ordinary Selected Step sidebar remains mounted and is hidden while settings are open. An accessible
header settings entry opens the panel; Escape/Close return focus. The existing responsive grid stacks
it at compact widths. Panel scrolling and measured header clearance keep controls accessible at 640x360.
No MIDI controls are added to the music toolbar. React portals carry the transient controls into the
shell panel slot and compact actual-device/connection/arm/pause status into the existing status bar.
Status has a full title and polite live region. The status bar retains its existing document placement;
no T214 bottom/pinning redesign was introduced.

`App.insertPianoRollMidiNote` synchronously reads authoritative `store.project`, validates active view,
stopped transport, actual pitch 0..127 and exact positive timing within existing composition end,
locates the destination owner by absolute onset, and dispatches one existing authored Melody transaction.
The transaction error is returned explicitly. The existing transaction materializes generated notes
once and preserves their recipe, effective phrase, IDs and owner/instrument semantics; Rest supports
authored Melody. Overflow and unrepresentable large-fraction arithmetic reject the entire note without history/data/cursor changes or automatic bars.
Pitch uses the existing exact-pitch constructor and Piano Roll chromatic spelling convention; displayed
range expansion remains the existing note-derived range behavior. Positive Note On on any channel is
one note/one Undo; velocity-zero, Note Off, CC, pitch bend and malformed status/data are ignored.

All 15 whole/half/quarter/eighth/sixteenth ordinary/dotted/triplet durations are exact Rational values.
Quarter defaults independently of Snap. The selected Step initializes the cursor; explicit empty-grid
click snaps to the nearest current quantum, while typed fractions and successful advancement stay exact.
Armed Enter and Insert note share the insertion path; unarmed Enter keeps its existing behavior.

Sidebar-only **Sound on input** defaults ON. After confirmed commit, App previews only that inserted
Melody event for 250ms through the existing current instrument/volume provider/controller. It does not
start transport, change recorded duration, reattack Harmony or existing notes. The existing preview
request token and stop path cancel delayed preparation on OFF, blur, Escape, device/session/view/transport
changes. Manual fallback works without MIDI access; empty/invalid pitch is rejected.

## Requirement to code and evidence

| Requirement | Implementation | Verification |
| --- | --- | --- |
| One Midi Settings sidebar, no permanent main controls, keyboard close/focus return | StudioWorkspace.tsx; PianoRollMidiStepInput.tsx; ProgressionTrack portal; progression.css | Granted-startup Chromium test; responsive capture test; 24 open/closed viewport captures and 4 compact lower-panel captures |
| Actual device status, connection/armed/pause/error, polite/title | MidiSettingsPortal; existing footer slot | Startup, disconnect and focus tests; 12 normal-width status captures |
| Granted startup auto-connect/arm; prompt/denied fallback | connectStartup/connectAlreadyGranted/connect; App projectReady prop | Granted reload test; denied/unsupported/no-device Chromium; permission-query units |
| Stable multi-device selection, detach/hotplug, no duplicate listeners | Controller select/refresh/detach | Multi-device and hotplug Chromium; same-ID replacement/cleanup units |
| Manual/safety OFF survives delayed query/access | Generation and activation epoch; pendingPermission Escape gate | Delayed-query browser Escape test; delayed-query/access units |
| Blur ignores input, safe resume, manual/Escape/session/view/transport permanent OFF | Separate intent/suspension/effective gate; lifecycle handlers and session key | Focus and manual OFF/transport/same-ID replacement Chromium; focus units |
| All channels and ignored messages | parseMidiNoteOn | Protocol units and mocked multi-channel/ignored-message Chromium |
| Exact durations/cursor independent of Snap | Rational helpers and synchronous cursor ref; grid marker | All 15 duration units; typed fraction, Snap, burst and overflow Chromium |
| One note/Undo; bursts latest store; exact UndoRedo; generated/Rest/cross-System | App authoritative callback and existing authoredMelodyTransaction | Portable snapshots, sequential burst/history, generated sourceRecipe, exact generated Undo, Rest and cross-boundary Chromium; existing transaction units |
| Preview only after commit, 250ms, cancel late prepare | App MIDI preview path and reset/stop callbacks | Three Chromium audio tests: sound-off, blur and Escape cancellation, then exact single Melody event at 0.25s; existing audition units |
| Accepted NOTE/CHORD/guides/Staff/TAB/MusicXML preserved | Existing routes retained | Focused related Chromium regression command below; MusicXML and transaction unit files |

## Final verification

Fresh build: `pnpm build` passed (TypeScript + Vite). Vite retains its large-chunk warning and plugin
timing notices; they are warnings, not build errors.

Focused unit command:

```powershell
pnpm exec vitest run tests/unit/melody/midi-step-input.test.ts tests/unit/melody/piano-roll-batch1-acceptance.test.ts tests/unit/melody/piano-roll-system-chord-commands.test.ts tests/unit/audio/piano-roll-audition.test.ts tests/unit/export/t207-authored-melody-projection.test.ts --maxWorkers=1
```

Result: **5 files, 42 tests passed**. Includes transaction/history, generated/Rest ownership, audition
and MusicXML projection/parser regression evidence as well as MIDI protocol/lifecycle/timing units.

T210 Chromium command, run against the fresh final build:

```powershell
pnpm exec playwright test tests/e2e/t210-web-midi-step-input.spec.ts --project=chromium --workers=1 --retries=0
```

Result: **18 passed; 44.2s**. Real browser interaction with mocked Web MIDI; not physical-device acceptance.

Related Chromium command:

```powershell
pnpm exec playwright test tests/e2e/piano-roll-system-note-panel.spec.ts tests/e2e/piano-roll-system-chord-portable.spec.ts tests/e2e/piano-roll-degrees-altered-guides.spec.ts tests/e2e/piano-roll-batch1-existing-views.spec.ts tests/e2e/staff-guitar-audio-clock.spec.ts --project=chromium --workers=1 --retries=0 --grep 'System note panel edits selected|owner-colliding|real portable import|normal pointer resize transfers exact|restores a second-measure|Degrees highlights|v9 authored Rest|Staff and rhythmic TAB'
```

Result: **6 passed / 2 failed, 2.3m**. Both failures were reproduced against published baseline
`f801562` with the modified UI modules replaced at load time by `git show` source, without resetting
any worktree files. The old existing-view test selects a Staff/inline-lane attribute while Piano Roll
uses `data-piano-roll-event-key`; the guides test fails the same compact simultaneous toolbar/note
viewport expectation at line 149 on baseline. The old files/assertions were preserved. See
`artifacts/validation/t210-midi/baseline-regression-evidence.md` and its runnable diagnostic server/config
for exact commands, failing triggers and baseline evidence. The two additional T210 scoped tests use
current view-specific attributes, assert exact Rest ownership/phrase/continuations across all six
views and both themes, and validate guide rows/full-height altered notes/visibility independently
at all three viewports and both themes. These are passing checks, not weakened versions of legacy assertions.

Scoped ESLint command:

```powershell
pnpm exec eslint src/app/App.tsx src/audio/testHooks.ts src/ui/melody/PianoRollView.tsx src/ui/melody/PianoRollMidiStepInput.tsx src/ui/melody/midiStepInput.ts src/ui/progression/ProgressionTrack.tsx src/ui/studio/StudioWorkspace.tsx tests/unit/melody/midi-step-input.test.ts tests/e2e/t210-web-midi-step-input.spec.ts
```

Result: **passed, 0 errors / 6 existing hook-dependency warnings** in App/PianoRollView. The new MIDI/controller/sidebar/test files and ProgressionTrack are clean.

Scoped Prettier and whitespace:

```powershell
pnpm exec prettier --check src/app/App.tsx src/audio/testHooks.ts src/styles/progression.css src/ui/melody/PianoRollView.tsx src/ui/melody/PianoRollMidiStepInput.tsx src/ui/melody/midiStepInput.ts src/ui/progression/ProgressionTrack.tsx src/ui/studio/StudioWorkspace.tsx tests/unit/melody/midi-step-input.test.ts tests/e2e/t210-web-midi-step-input.spec.ts
git diff --check
```

Result: **Prettier passed for all matched source/test files; git diff --check passed**. Git emits ordinary LF-to-CRLF working-copy notices.

## Captures actually viewed

Primary current evidence lives in `artifacts/validation/t210-midi/`:

- `{dark,light}-{degrees,chromatic}-{640x360,1280x720,1920x1080}-{open,closed}.png`: 24 normal-CSS
  viewport captures, each opened and visually inspected. No fullpage screenshots substitute for these.
- The same 12 combinations with `-status.png`: existing status bar inspected in both themes and every
  width, alongside existing Piano Audio status; no collision.
- `{dark,light}-{degrees,chromatic}-640x360-open-bottom.png`: four normal viewport captures of the
  keyboard-focused manual pitch, Insert note and Sound on input after scrolling inside the compact panel.
- The browser test asserts panel bounds inside viewport, panel below header and no horizontal overflow.
  At desktop widths panel and music occupy separate columns; at compact width the existing layout stacks
  them and the panel scrolls internally. Cursor marker is visible on the closed music viewport captures.
- Prior unsuffixed PNGs were preserved but are **not** used as evidence for the latest sidebar contract.

## Changed files and final Git state

T210 source: `src/app/App.tsx`, `src/audio/testHooks.ts`, `src/styles/progression.css`,
`src/ui/melody/PianoRollView.tsx`, `src/ui/progression/ProgressionTrack.tsx`,
`src/ui/studio/StudioWorkspace.tsx`, new `src/ui/melody/PianoRollMidiStepInput.tsx`,
new `src/ui/melody/midiStepInput.ts`.

Documentation: modified `specs/001-cadenceflow-core-studio/spec.md` and `tasks.md`; new/reconciled
`t210-web-midi-step-input-plan.md`; this new handoff. T210 remains unchecked.

Tests: new `tests/unit/melody/midi-step-input.test.ts`, new
`tests/e2e/t210-web-midi-step-input.spec.ts`; new/updated capture artifacts and baseline diagnostic evidence/helpers under the existing untracked
`artifacts/validation/t210-midi/`. Protected dirty chord-portable regression remains unchanged.

Final status (all unstaged; no index diff):

```text
 M specs/001-cadenceflow-core-studio/spec.md
 M specs/001-cadenceflow-core-studio/tasks.md
 M src/app/App.tsx
 M src/audio/testHooks.ts
 M src/styles/progression.css
 M src/ui/melody/PianoRollView.tsx
 M src/ui/progression/ProgressionTrack.tsx
 M src/ui/studio/StudioWorkspace.tsx
 M tests/e2e/piano-roll-system-chord-portable.spec.ts
?? artifacts/validation/t210-midi/
?? specs/001-cadenceflow-core-studio/t210-web-midi-step-input-handoff.md
?? specs/001-cadenceflow-core-studio/t210-web-midi-step-input-plan.md
?? src/ui/melody/PianoRollMidiStepInput.tsx
?? src/ui/melody/midiStepInput.ts
?? tests/e2e/t210-web-midi-step-input.spec.ts
?? tests/unit/melody/midi-step-input.test.ts
```

## Remaining acceptance boundary

The root reviewer must independently assess this complete implementation and evidence. No independent
acceptance is claimed. Physical MIDI connection, real browser/OS permission behavior and audible
hardware output remain untested; Chromium protocol/permission/audio scheduling were mocked. Firefox,
other browser engines and the full suite were intentionally outside this requested validation scope.
The existing status bar is not pinned at viewport bottom; that adjacent T214 redesign remains excluded.
