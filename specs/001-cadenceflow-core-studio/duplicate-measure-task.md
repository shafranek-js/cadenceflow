# Duplicate Measure — scoped implementation task

## Goal and bounds

Add **Duplicate Measure N to End** to the existing shared Measure context menu. The target is the displayed Measure index supplied by the menu, never the selected Step. Copy its effective Harmony and Melody to one new, full-length Measure appended after the progression's final barline. Do not insert next to the source, add a toolbar, change schema, or change existing Insert Measure After/Delete behavior.

## Exact interval and partial-bar policy

- A displayed Measure is the half-open Rational interval `[measure.startBeats, measure.endBeats)`, with full capacity `measure.capacityBeats`. Copy each Harmony fragment and each effective Melody event only where it intersects that interval. Clip crossing notes at both interval edges; a sustain entering from before the source Measure begins at offset zero in the copy, and a note leaving the Measure ends at its barline. Copy a final partial Measure's authored portion, not its implicit trailing silence as music.
- Append at `layout.playbackDurationBeats`, the next barline after the existing progression. If the existing final Measure is partial, insert an explicit Rest for `[layout.authoredDurationBeats, layout.playbackDurationBeats)` before the copy. If the source Measure is partial, append an explicit Rest for its implicit trailing gap inside the duplicated bar. Thus padding plus copied fragments totals exact whole-bar Rational duration and never invents notes.
- Do not alter any existing Step, phrase, note, section, or loop. If making the existing partial tail explicit would activate dormant authored Melody beyond the old progression end, refuse atomically with an explanation. Also refuse an active temporary branch, a copied note with no representable owner, or any copied Step that would need multiple Melody instruments under the v9 Step-level ownership model.
- Give all copied Steps and authored note events fresh collision-free IDs. Preserve chord/rest payloads, per-Step overrides, exact durations and offsets, concert/source pitch frames and spelling. Copy Rest Melody. Preserve generated mode and its recipe where the appended context regenerates the copied effective phrase exactly; otherwise materialize only the affected phrase as authored while retaining its recipe.
- Keep existing section and loop anchors attached to original Steps. Select the first copied Step after success. Apply tail padding and copied content through one `progression/restore` command so Undo/Redo and portable save/reopen are exact. Stop transport and pending previews before dispatch, following existing mutation paths.

## Implementation and verification

1. Add a pure planner next to the accepted measure insertion/deletion planners; compare the candidate's effective timeline against the unchanged original timeline plus the clipped copied events, and return an actionable refusal before mutation if that contract cannot be represented.
2. Add one menu item and route its displayed Measure index through the shared `MeasureContextMenu` used by Harmonic, Piano, Guitar, Tablature, Staff and Piano Roll. Preserve keyboard/context-menu access, focus restoration, and existing actions.
3. Add meaningful one-worker unit coverage for multi-chord fragments, Rest Melody, authored/generated notes crossing bar and Step boundaries, partial source/final bars, duplicate-again IDs, mixed-owner/instrument refusal, atomic failure, selection, exact Undo/Redo, and portable reopen.
4. Add one-worker/no-retry Chromium coverage for duplicating a middle Measure to the end from the shared menu, source-versus-selection targeting, context-menu keyboard/focus, views, transport stop, music equivalence, Undo/Redo and portable reopen. Preserve accepted T210/T212/T213/T214/T215, stable Measure width and group selection, plus the protected chord portable regression.
5. Run a fresh build, focused Vitest (`--maxWorkers=1`), focused Chromium (`--workers=1 --retries=0`), scoped ESLint/Prettier and `git diff --check`. Capture and inspect light/dark menu and appended-Measure states at compact, standard and large viewports. Record exact evidence in a separate implementation handoff; independent acceptance remains pending.

## Checkout boundaries

Preserve every existing dirty and untracked file and the empty index. Do not change task checkboxes or acceptance records, stage, commit, push, deploy, clean the checkout, run a full suite, change Actions, package a ZIP, or start adjacent work.
