# CadenceFlow release-gate handoff — 2026-10-04

Current status update — 2026-10-05: the T201 adapter/command-routing conflict described below is resolved with 33/33 focused units and 41/41 scoped Chromium cases. See [the resolution and current remaining release boundary](t201-endpoint-resolution-2026-10-05.md). The original results and investigation below remain historical evidence; complete release acceptance is still pending.

## Current state

The reviewed checkout is `master` at `361c914a39032e0be69aae52b85f47c3a15ad845`, equal to
`origin/master`; that commit was published to GitHub Pages. This follow-up changes only regression-test
code and documentation. It does not change production runtime, schema, or generated product data.
Nothing in this handoff marks the full release accepted.

The scoped feature records below remain valid within their stated boundaries: Piano Roll Batches 1–3,
the System NOTE and CHORD panels, T210, T212–T215, the Staff/Guitar display fix, Measure insert/close,
stable Measure width, Piano Roll group selection and selection-control placement, and Duplicate Measure.
Their own acceptance records contain the exact evidence. They are not substitutes for FR-261's full
release checks.

## Regression debt A — portable chord autoscroll

The protected `tests/e2e/piano-roll-system-chord-portable.spec.ts` inherited addition remains intact:
the second-Measure chord shrink/restore scenario and all exact musical-data, Undo/Redo, and portable
assertions are still present. The full current diff in that file is the inherited 62-line scenario plus
the following narrow helper/assertion replacement in the earlier boundary-autoscroll test:

- Before: sampled `window.scrollY`, moved the pointer to `window.innerHeight - 8`, and expected the
  window scroll offset to increase.
- After: reads `.studio-grid.scrollTop` and its scroll extent; checks that the handle starts below the
  app header; moves to the bottom edge of `.studio-grid` while staying above the persistent status
  bar and inside the viewport; polls for `.studio-grid.scrollTop` growth.

The check measures the actual scroll container used by `PianoRollView` and reserves the header/footer
regions in its pointer geometry. Pointer cancellation still requires the resize status to disappear and
the portable export to equal the pre-gesture snapshot.

## Regression debt B — T201 duration endpoint conflict

No T201 expectation or production code was changed. The current focused unit run reproduces the failure:

```text
pnpm exec vitest run tests/unit/progression/t201-direct-duration-resize.test.ts tests/unit/melody/piano-roll-system-chord-commands.test.ts tests/unit/app/timing-commands.test.ts --maxWorkers=1
3 files, 31/32 tests passed; the single failure is T201's endpoint assertion (expected 11, received 3).
```

The fixture creates a 3/4 progression with a chord at absolute beat 2, duration 1, and no following Step.
In `createDurationResizeSnapshot`, the chord branch computes the current measure end as beat 3 and, when
the final chord ends on or before that barline, caps `editableEnd` at that measure end. Consequently the
snap candidate at beat 11 is excluded and `snapDurationResizeEndpoint(11, snapshot)` returns beat 3.
This chord-specific cap was added to the generic adapter in commit `f801562`; the working HEAD for this
task remains `361c914`.

There is a later Piano Roll CHORD command contract that explicitly rejects extending its final chord past
its Measure boundary, and the related edge workflow uses an explicit trailing Rest. However, the accepted
T201 contract and its historical regression allow a direct Step resize across multiple Measures on the
shared Rational timeline. The CHORD plan scopes the changed boundary interaction to Piano Roll; it does
not explicitly redefine the generic T201 duration handle across all progression views. That leaves a
real contract conflict: should the final-chord Measure cap apply to generic T201 resize, or only to the
separate Piano Roll chord-edge command?

An explicit following Rest gives the adapter a duration reservoir and can allow a chord to grow up to
the Rest's endpoint minus the minimum 1/24-beat remainder. This is a different scenario and does not
prove that the original no-Rest T201 fixture was invalid. Do not change the expected value to 3 or loosen
the test before the contract is decided. Root should choose the intended scope; if the cap is to remain
generic, update the T201 contract and fixture with both the capped case and a valid Rest-bounded long
resize. If T201's cross-Measure behavior remains, make the smallest adapter change that preserves the
Piano Roll CHORD command boundary and add a regression across the generic resize consumer.

## Fresh verification in this task

Runtime: Node `v24.14.0`; pnpm `10.12.4`.

- `pnpm run build` — passed; TypeScript and Vite transformed 465 modules. Output was
  `index-DsdteDIA.js` and `index-VlJtNUr4.css`. The known large-chunk and plugin-timing advisories remain.
- Focused Vitest above — 31/32; the unresolved T201 case is described above. The two chord-command and
  timing-command files passed all 31 tests.
- `pnpm exec playwright test tests/e2e/t201-direct-duration-resize.spec.ts tests/e2e/piano-roll-system-chord-portable.spec.ts tests/e2e/piano-roll-system-note-panel.spec.ts tests/e2e/piano-roll-system-chord-panel.spec.ts tests/e2e/piano-roll-group-note-selection.spec.ts tests/e2e/t215-measure-context-menu.spec.ts tests/e2e/measure-insert-and-close.spec.ts tests/e2e/measure-duplicate.spec.ts tests/e2e/piano-roll-stable-measure-width.spec.ts --project=chromium --workers=1 --retries=0` — 71/72. All NOTE/CHORD/group/Measure/T201 browser scenarios and the protected 62-line second-Measure regression passed. One existing portable Tie/group test failed once when its Export menu did not appear within 5 seconds after the menu interaction.
- The isolated repeat of that exact Tie/group test passed 1/1. A complete repeat of
  `pnpm exec playwright test tests/e2e/piano-roll-system-chord-portable.spec.ts --project=chromium --workers=1 --retries=0`
  then passed 27/27, including the autoscroll assertion and Tie/group case. Preserve the initial 71/72
  result in the release record; the repeat supports a transient-test classification but does not erase
  the observed failure.
- The first Chromium attempt in this task was stopped after the preview URL served an unrelated practice
  app, confirmed by its page snapshot. No result from that attempt counts. The correct preview was then
  launched from this checkout, and `http://127.0.0.1:4173/` returned HTTP 200, title `CadenceFlow`, and
  the just-built JS asset before the passing/partial runs above.
- Full Vitest, the full Playwright suite, Firefox, and release acceptance were not run.

## One current list of remaining release gates

1. Root reviews the T201 conflict above and records the intended contract before any production or
   assertion change. Do not treat the current failing endpoint test as green.
2. At the final reviewed runtime, rerun the scoped T201/chord-duration unit contracts and the portable
   chord, NOTE/CHORD, group-selection, and Measure regressions after a fresh build. If the portable
   Export-menu timeout recurs, resolve it or document an evidence-backed disposition instead of
   counting only the successful repeat.
3. Execute FR-261 release coverage: current and migrated portable-project round-trips; offline assets and
   notices; A4 print and representative long-progression layout; production build; complete required
   Vitest and browser regression; and a recorded disposition for every observed or known test failure.
4. Revisit the historical T215-related Staff count-in failure (63/64 related cases, reported against
   the published baseline) in the final release run. The T215 file passed in this task's scoped run, but
   the related Staff count-in scenario was outside the 72-test command above.
5. Decide whether the untested physical MIDI-device path is required for the release. T210 step-input
   feature acceptance is recorded, but physical MIDI hardware and actual external audio output were not
   tested in its scoped acceptance.
6. Root performs independent release acceptance only after those gates have current evidence. GitHub
   Pages publication of `361c914` is confirmed separately and does not satisfy these checks.

## Worktree boundary before the publication request

At the time this handoff was first prepared, no files had been staged, committed, pushed, deployed, or
cleaned, and Actions settings had not been changed. The user later explicitly requested commit, push,
and GitHub Pages publication, authorizing those steps. The protected portable test and all inherited
artifacts remain present. The published change contains only this handoff, linked status/spec/plan
corrections, and the portable autoscroll test; it does not change production runtime, schema, or
generated product data. The T201 conflict and complete release gate remain open after publication.
