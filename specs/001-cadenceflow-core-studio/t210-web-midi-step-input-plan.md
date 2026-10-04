# T210 Web MIDI Step Input

## Scope and protected boundaries

Implement the approved Web MIDI step-input behavior in the existing Piano Roll. Keep the feature
session-only: no Project/schema/portable-format/history metadata, MIDI recording, Note Off duration
capture, transport changes, or T212/T213/T214 work. Use the current checkout and preserve unrelated
tracked and untracked changes, including the separate chord-resize regression test. Do not stage,
commit, push, deploy, run the full suite, or claim independent acceptance.

## Interaction and state

- Put all controls in one **Midi Settings** panel in the existing responsive inspector sidebar,
  opened by an accessible header settings entry with keyboard close and focus return. The music
  toolbar contains no permanent MIDI controls. The existing status bar displays actual device
  name, connection and Armed/Disarmed/temporarily paused/error, with full title and polite announcement.
- Query browser MIDI permission if supported. Already granted access connects without prompting;
  prompt/denied/unsupported query requires **Connect MIDI** with `requestMIDIAccess({sysex:false})`.
  Select the prior available device or stable first connected input. Connection and real hotplug
  auto-arm only with Piano Roll active and transport stopped. Device changes detach old listeners.
  Ordinary renders, note mutations and repeated state notifications never rearm manual/safety OFF.
- Manual MIDI pitch `0..127` plus **Insert note** is always available as the hardware fallback.
  Armed Enter inserts that manual pitch only from the MIDI pitch field or Piano Roll grid. Escape
  disarms. Unarmed Enter keeps the existing Piano Roll behavior.
- Offer 15 exact durations: whole, half, quarter, eighth, and sixteenth, each ordinary, dotted
  (`3/2`), or triplet (`2/3`); default quarter. The duration is independent of grid Snap.
- The one absolute cursor starts at the selected Step onset (or beat zero), moves to the nearest
  current Snap subdivision on empty-grid click, and is editable through an accessible exact
  numerator/denominator control. It does not follow later note/chord selection or transport.
  Successful insertion advances by the exact duration with no second quantization.
- The cursor and controls remain transient. Disarm on transport not stopped, view change, Project
  session replacement (including a same-ID reload), Escape, input switch, or selected
  device disconnect. Do not disarm for ordinary Project `updatedAt` updates caused by note insertion.
  Window blur suspends effective input and cancels previews while preserving armed intent. Ignore
  background Note On entirely. Focus resumes only for the same session/device, active Piano Roll
  and stopped transport; Escape/manual OFF during suspension clear intent.

## MIDI parsing and lifecycle

Use a small pure `midiStepInput` module with structural Web MIDI interfaces and a testable controller.
Accept only `0x9n` with three valid data bytes and velocity above zero; ignore `0x8n`, velocity-zero
Note On, CC, pitch bend, malformed input, and all other status bytes. The Note On callback is
synchronous and processes every event in order. Attach/remove listeners without overwriting other
consumers. Guard permission promises and delayed events with a generation/session token. Disarm and
detach the active input on selection change, disconnect, scope exit, or disposal; preserve access
status and use approved granted-permission/real-hotplug automatic activation.

## Atomic insertion and audio

For each manual or MIDI insertion, synchronously read authoritative `store.project`, verify the
Piano Roll is active, transport is stopped, onset is before the exact existing progression end, and
note end does not exceed it. Locate the destination Step by absolute onset, including Rest. Generate
one stable authored-note ID and exact pitch spelling from MIDI number. Dispatch one
`melody/apply-authored-transaction` upsert against the latest `updatedAt`, relying on its existing
generated-Melody materialization and recipe/identity-preserving inverse. App integration must return
explicit success/failure; do not swallow rejection. Only a confirmed successful dispatch advances
the cursor or auditions. Invalid/overflow/stale transactions leave history and cursor untouched.

**Sound on input** is a separate default-ON sidebar toggle. After a confirmed insertion, route the inserted pitch
through the existing Melody soundfont provider and preview controller for exactly 250 ms, with the
current Melody instrument/volume. Generation guards and preview-controller stop must prevent a
delayed prepare or replaced/disarmed preview from sounding. Do not use progression transport,
Harmony audio, or re-attack/alter existing notes.

## Visual and accessibility requirements

Render an absolute vertical MIDI insertion marker over the Piano Roll note grid at the same shared
measure/zoom/scroll coordinate as note onsets. Empty-grid placement uses the current grid Snap;
successful advancement is exact duration, not Snap. Keep marker and sidebar controls visible,
keyboard-operable, labelled, and in normal CSS layout. Review normal-scale 640x360, 1280x720, and
1920x1080 captures in light/dark themes and both Degrees/Chromatic grids. Verify compact responsive
layout without introducing Project mutations or collisions with existing Piano Roll controls.

## Verification and handoff

- Unit: MIDI byte parser; explicit request options; unsupported, denied, zero/one/many device states;
  device switch/disconnect; stale permission and cleanup; ordinary/dotted/triplet Rational values;
  snap and exact cursor advancement; malformed MIDI and all ignored statuses.
- App/transaction: one Note On -> one authored note + one Undo; generated destination is materialized
  once with recipe/effective notes/IDs preserved and exact Undo/Redo; Rest ownership; rapid bursts use
  latest store state; crossing Step/bar/System is valid; composition overflow is a no-op.
- Chromium with mocked `requestMIDIAccess`: permission/device UI, every MIDI filter and channel,
  manual 0/127 path, duration options, cursor click/edit/advance, exact portable export and history,
  overflow, armed Enter vs unarmed Enter, disarm on Escape/transport/view/same-ID session/device
  disconnect; blur ignores input, guarded focus resume; Sound on input on/off, exact 250 ms scheduling, late prepare canceled. Physical MIDI hardware
  remains separately untested unless available.
- Fresh build; focused Vitest `--maxWorkers=1`; related Chromium only with `--workers=1 --retries=0`;
  scoped lint/Prettier and `git diff --check`. Retest accepted Piano Roll/Staff/regression fixtures
  related to the touched files. Inspect actual saved normal-scale captures at the three viewport
  sizes, both themes, both pitch grids, and visible cursor/sidebar open and closed states.
- Handoff lists exact baseline, changes, requirement-to-code-to-test/capture evidence, commands and
  results, protected dirty state, remaining physical-device limitation, and explicitly leaves
  independent acceptance pending.
