# T215 — Measure Context Menu and Delete Measure

## Goal and bounds

Make every displayed Measure target its own command menu through right-click, `ContextMenu`/
`Shift+F10`, and a discoverable accessible button. Provide measure-scoped actions that already have a
canonical implementation, including Delete Measure. Keep T210 behavior and the protected portable
chord regression intact. Do not change the v9 schema or expand into T212–T214.

## Deletion semantics

- Resolve the target from its displayed zero-based measure index, never from selected Step. The
  deleted interval starts at the measure's exact `startBeats`; its end is the lesser of the next
  bar boundary and `authoredDurationBeats`. This makes a partial final bar delete only authored
  time; the layout's implicit trailing silence is not turned into negative or added duration.
- Subtract that interval from each Step interval. Remove Steps wholly inside it and split a Step
  crossing either edge into exact Rational fragments. Keep the original Step ID on its first
  surviving fragment; allocate an ID only for a second fragment. Copy chord/rest payload and
  per-Step settings to fragments. One `progression/restore` snapshot is the sole command, so undo
  and redo restore exact IDs, notes, sections and loop state.
- Snapshot the pre-delete effective Melody timeline before changing Harmony or generation context.
  Subtract the deleted interval from each note's absolute interval, retaining the prefix and/or
  rebasing the suffix by the exact deleted duration. Key note identity by `(ownerStepId, eventKey)`;
  the same event ID in two owners is distinct. Preserve a surviving source owner (and its
  instrument/recipe) when possible; if an owner is removed, put its outside fragment in the Step
  that owns that new onset. If several instruments would have to share one Step-level instrument
  setting after such a move, disable deletion with a specific reason instead of losing or changing
  a note. Transform stored authored phrase notes as well as visible effective events so authored
  durations extending beyond the current progression end and dormant notes are not truncated.
  Preserve authored spelling, ID and exact pitch/duration, uniquifying only a split fragment within
  one phrase. A dormant note whose owner would be removed must be explicitly refused if v9 cannot
  retain its owner rather than being silently discarded.
- Compare the post-delete effective timeline with the expected rebased pre-delete events. Materialize
  only generated owners whose output changed, including changes caused by a different next-chord
  context; retain the generation recipe for explicit regeneration. Do not rely only on whether the
  generated owner intersects the deleted bar.
- Preserve boundaries on surviving Step IDs. Reanchor boundaries whose entire Step is removed to
  the first surviving following Step, then the nearest preceding Step, or remove them only when the
  progression becomes empty. Keep selection on a surviving selected Step; otherwise choose the
  following then preceding survivor. Reanchor removed loop endpoints by the same neighbor rule and
  retain the loop only when the resulting endpoints are ordered. Clear it if no valid region remains.
- Stop transport and previews before applying the command. Disable Delete Measure while a temporary
  branch is active because its origin/rejoin Step IDs belong to the progression being rewritten.
  A refused/disabled operation leaves Project and history unchanged and exposes its reason.

## UI and coverage

- Add a reusable measure menu with outside-click/Escape closure, focus restoration, and coordinates
  clamped to the viewport. Keep the heading/button keyboard reachable and provide a real menu name.
- Harmonic, Piano, Guitar and Tablature progressions use their measure headers; Piano Roll uses its
  Measure heading. Staff and Tablature score systems currently group bars under a System header, so
  expose one measure-specific accessible entry for each displayed bar in that header rather than
  routing a click to the selected Step or whole System.
- Keep the existing light/dark theme. Verify open/closed menu placement at 640×360, 1280×720 and
  1920×1080 in both themes, and verify every view's heading targets the shown Measure.
- Unit coverage: first/middle/last and partial-final deletion; several Step boundaries; authored
  notes crossing both edges; same event ID across owners; generated context changes; Rest Melody;
  sections, selection and loops; exact one-entry Undo/Redo; empty progression; nonrepresentable
  instrument conflict refusal.
- Chromium coverage: pointer and keyboard open, target versus selected Step, Escape/outside/focus,
  one history entry and portable save/load, Harmonic/Piano/Staff/Guitar/Tablature/Piano Roll, branch
  explanation, transport stop, and responsive light/dark menu captures. Run focused Vitest,
  Chromium, fresh build, scoped ESLint/Prettier and `git diff --check`, plus the accepted T210,
  NOTE/CHORD, Staff/TAB and export regressions. Inspect the normal-scale captures directly.

## Handoff boundary

Record exact commands, counts, captures, Git state and any untestable physical behavior in a separate
handoff. Keep T215 unchecked until the root reviewer independently accepts it.
