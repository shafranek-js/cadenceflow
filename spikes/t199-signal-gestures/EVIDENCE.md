# T199 Signal gesture spike

Status: disposable spike only. It does not change `src/`, schema v6, production routes,
runtime dependencies, or `tasks.md`/`PROJECT_STATUS.md`.

## Upstream and license gate

The upstream was checked on 2026-09-29 from the primary repository:

- Repository: [ryohey/signal](https://github.com/ryohey/signal)
- Revision: `632de9685990c90d0be127994908cc43692ff82a` (`main` at inspection time)
- License: [MIT LICENSE at that revision](https://github.com/ryohey/signal/blob/632de9685990c90d0be127994908cc43692ff82a/LICENSE), copyright 2016 ryohey.
- Gesture sources evaluated at the same revision: `app/src/components/PianoRoll/MouseHandler/gestures/useSelectNoteGesture.ts`,
  `useMoveSelectionGesture.ts`, `useMoveDraggableGesture.ts`, `useDragNoteEdgeGesture.ts`,
  `useDragSelectionLeftEdgeGesture.ts`, `useDragSelectionRightEdgeGesture.ts`,
  `app/src/helpers/observeDrag.ts`, and `app/src/actions/selection.ts`.

## Donor verdict

| Gesture / source seam                                               | Verdict             | Reason                                                                                                                                                         |
| ------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection / `useSelectNoteGesture`                                  | Reject direct reuse | Couples selection to Signal hooks, event entities, player position, and Signal selection state. The spike keeps only the observable hit-test/marquee behavior. |
| Move / `useMoveSelectionGesture` + `useMoveDraggableGesture`        | Reject direct reuse | Depends on Signal `usePianoRollDraggable`, MobX transactions, Signal history, and numeric MIDI tick coordinates.                                               |
| Edge resize / `useDragNoteEdgeGesture` and selection edge gestures  | Reject direct reuse | Uses Signal note events, preview audio, draggable state, and tick-based constraints; it cannot cross the CadenceFlow Rational boundary.                        |
| Coordinate transforms / `observeDrag.ts` and Signal transform types | Reject direct reuse | The source carries client-pixel deltas into Signal tick/note-number objects. CadenceFlow needs screen float → absolute beat → exact Rational.                  |
| Ctrl-drag duplicate / `actions/selection.ts`                        | Reject direct reuse | Directly clones Signal note events and mutates a Signal track command surface. T199 keeps duplication transient because authored Melody is future schema v7.   |
| Clipboard / `services/Clipboard.ts` and `PianoNotesClipboardData`   | Reject              | Clipboard was not justified for this spike and would imply a serialized Signal note-event shape. No clipboard dependency is added.                             |

No donor code was copied or adapted. Therefore there are no provenance comments on adapted files and no
`THIRD_PARTY_NOTICES.md`; the exact upstream/license record above is evaluation evidence, not a claim of
reused code.

## Adapter boundary and demonstrated semantics

`adapter.ts` is an original, pure transient gesture adapter. It accepts only screen geometry, pointer
coordinates, stable transient note IDs, and exact Rational timing. It has no Signal imports and no access to
CadenceFlow stores, audio, persistence, or history. It demonstrates:

- C4 = 1 beat, E4 = 1/2 beat, G4 = 1 beat;
- click selection, marquee multi-select, stable-ID Shift/Arrow extension, move, left/right edge resize,
  deterministic Ctrl-drag duplicate with collision-free transient IDs, and Escape/focus restoration;
- T198's finite absolute endpoint set with `q = 1/L`, nearest endpoint, lower-positive tie break,
  lower/upper clamp states, cross-bar `7/8`, and multi-bar `3/4` behavior. The full lattice is materialized
  through the requested finite horizon without an arbitrary iteration cutoff; a horizon larger than the
  explicit 1,000,000-candidate safety limit rejects fail-closed instead of silently truncating;
- finite-positive screen scales (`NaN`/`Infinity` are rejected), left-edge zero-duration boundaries, and
  the long-horizon case `editableEnd = 500`;
- transient preview objects that are discarded on cancel and never call a canonical store route.

`cadenceflow-boundary.ts` is the only demonstration seam to the existing CadenceFlow APIs. It uses the
real `AppStore`, `progression/select-step` selection-only route, and `timing/set-step-duration` command.
It deliberately does not invent note move/duplicate commands: note gestures remain transient proposals until
the future authored-Melody/schema-v7 work (T207). A successful timing Apply dispatches once and produces one
forward/inverse history entry; existing AppStore Undo/Redo is used for the evidence.

The integration test passes a screen-derived absolute endpoint into resize preview, then passes the
snapped Rational duration into the real command. The flow is:

```text
screen-space float
  -> absolute timeline endpoint
  -> finite exact Rational endpoint candidate
  -> positive-duration validation
  -> existing timing/set-step-duration command
  -> one AppStore history entry
```

Selection-only persistence is intentionally separate: `progression/select-step` notifies persistence but is
excluded from history. Preview, Escape/cancel, and invalid drafts do not call either route. The Apply test
passes the snapped preview Rational itself into `timing/set-step-duration`, then verifies one history entry;
cancel and invalid duration attempts leave Project, notifications, and history unchanged. The canonical
fixture remains a current-schema Project fixture with no Melody note edit command.

## Focused verification

Run from the repository root:

```text
pnpm exec vitest run tests/unit/t199-signal-gesture-spike.test.ts --maxWorkers=1
pnpm exec eslint spikes/t199-signal-gestures tests/unit/t199-signal-gesture-spike.test.ts
pnpm exec prettier --check spikes/t199-signal-gestures tests/unit/t199-signal-gesture-spike.test.ts
pnpm build
git diff --check
```

The final handoff reports the exact outputs and separately checks every new untracked file for whitespace.
There is no browser UI in this disposable spike, so no Chromium run is applicable.

Observed on 2026-09-29:

- `pnpm exec vitest run tests/unit/t199-signal-gesture-spike.test.ts --maxWorkers=1` — PASS, 1 file,
  4 tests.
- `pnpm exec tsc --noEmit -p tsconfig.app.json` — PASS.
- `pnpm exec eslint spikes/t199-signal-gestures tests/unit/t199-signal-gesture-spike.test.ts` — PASS.
- `pnpm exec prettier --check spikes/t199-signal-gestures tests/unit/t199-signal-gesture-spike.test.ts` — PASS.
- `pnpm build` — PASS, 424 modules transformed, built in 5.84s. Vite emitted only the existing large-chunk
  warning (`index` 2,358.97 kB minified).
- `git diff --check` — PASS; the four new files were checked separately for trailing whitespace — clean.
- Relevant Chromium E2E — not applicable: this spike has no browser UI or production route.

## Recommendations and limits

- T201 can reuse the endpoint-set/validation shape for a final visible Step fragment, but production code must
  keep the gesture draft outside Project and dispatch only `timing/set-step-duration` once on Apply.
- T202 should retain the stable-ID selection channel and focus/Escape behavior separately from the canonical
  Project selection-only route; do not convert range selection to array-index identity.
- Move/duplicate authored notes, clipboard, and note-level Undo/Redo are not implemented here. They require
  the future authored Melody contract and must not be inferred from this spike.
