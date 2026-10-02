# Composition UX Architecture Contract (T198)

**Status:** architecture contract only; T198 independently accepted on 2026-09-29.
**Scope:** SC-033–SC-037, FR-244–FR-251 and FR-257.
**Explicitly out of scope:** production UI, schema migration, T199 Signal spike, T200–T210 implementation,
and any change to the accepted T195 dirty checkout.

This document is normative for the Composition UX work that follows. It uses **MUST** for an invariant,
**SHOULD** for a default, and **MAY** for an implementation choice. The projection and adapter shapes below
are logical contracts, not claims that these names are already exported TypeScript APIs.

## 1. Traceability and current boundary

The contract is derived from the current artifacts, not from a new data model:

| Source | Current contract used by T198 |
| --- | --- |
| [spec.md](./spec.md), FR-244–FR-257 (lines 1289–1324) | Shared musical-time axis, projection/adapter boundary, derived harmonic roles, read-only Melody first, one Rational snap policy, non-mutating preview, deterministic alternatives, and selective MIT adapter boundary. |
| [spec.md](./spec.md), SC-033–SC-037 (lines 1596–1600) | Matrix/Progression ownership, zero-mutation preview/cancel, one Apply transaction, accessible derived roles, exact selection/timing, and deterministic rationale. |
| [plan.md](./plan.md), Composition UX architecture (lines 544–550) | Existing Project/command/history model remains the only writable source of truth; screen floats are converted before validation; T199 is disposable and isolated. |
| [data-model.md](./data-model.md), modeling rules and roadmap (lines 5–12, 572–608) | Steps are independent, time is exact, runtime/Undo state is not persisted, generated Melody remains derived, authored Melody is future v7, and the editor projection is transient. |
| [tasks.md](./tasks.md), T198–T210 (lines 715–735) | T198 is the entry gate; T201/T202 consume this contract; T206 is read-only; T207 is the future v7 authored-Melody cutover. |

The current portable schema remains v6. T198 MUST NOT add fields, migrations, codecs, stores, or runtime
objects. The existing selectedStepId compatibility field remains available; new range, gesture, drag,
candidate, and preview state is editor-session state and MUST NOT become another persisted Project shape.

## 2. Canonical inputs and shared read-only projection

### 2.1 Writable source and identity

Project is the only writable source of truth. Its canonical inputs are the ordered
Project.progression.steps, globalTiming.meter, harmonic context (tonic, activeModule), melodyTrack,
and step-local chord/melody settings. The existing shapes are:

- Project in [src/domain/project/project.ts](../../src/domain/project/project.ts#L64-L82);
- Progression.steps and the compatibility selectedStepId in
  [src/domain/progression/progression.ts](../../src/domain/progression/progression.ts#L8-L12);
- independent ChordStep/RestStep instances and stable id values in
  [src/domain/progression/step.ts](../../src/domain/progression/step.ts#L33-L53).

Array position is ordering only. A Step's id is the stable identity used by projection items, selection,
Inspector, playback association, commands, and focus restoration. Reorder changes position and timing, not
identity. A deleted Step invalidates references to that ID; it MUST NOT silently retarget them by index.

### 2.2 Logical CompositionTimelineProjection

The future Composition Editor adapter MUST expose one immutable, read-only logical projection built from one
Project snapshot. It has these semantic parts:

~~~text
CompositionTimelineProjection (logical contract; not a current export)
- projectId
- schemaVersion              // observed only; T198 does not migrate it
- meter
- barLengthBeats: Rational
- stepOrder: readonly StepId[]
- harmonyItems: readonly HarmonyTimelineItem[]
- melodyItems: readonly MelodyTimelineItem[]
- lanes: readonly InstrumentLane[]
~~~

Every item MUST retain exact musical coordinates and stable source identity. screenX, pixel width, seconds,
and MIDI ticks are render/runtime values and MUST NOT appear in the canonical projection:

~~~text
HarmonyTimelineItem
- stepId, stepIndex
- stepKind: "chord" | "rest"
- measureIndex, fragmentIndex
- startBeats, endBeats, offsetInStepBeats: Rational
- durationBeats: Rational
- startsHere, continuesFromPrevious, continuesToNext

MelodyTimelineItem
- eventKey, sourceStepId, eventIndex
- pitch: ExactPitch
- startBeats, durationBeats: Rational
- instrument, clef
- harmonicRole: { primary, targetNext }  // derived, not serialized MelodyEvent data
- startsHere, continuesFromPrevious, continuesToNext

InstrumentLane
- kind: "harmony" | "melody"
- instrumentId
- sourceStepIds/events projected into that lane
~~~

The names above describe the minimum semantic contents and may be implemented by composing existing DTOs;
they do not authorize a second stored timeline model.

### 2.3 Existing timing projection to reuse

The Harmony part MUST be derived using the existing exact timing seams:

1. [createProgressionTimeline](../../src/domain/timing/timeline.ts#L5-L20) and its implementation
   ([timeline.ts](../../src/domain/timing/timeline.ts#L35-L90)) provide ordered Step entries with exact
   startBeats, endBeats, durationBeats, and bar positions.
2. [createProgressionMeasureLayout](../../src/domain/timing/measureLayout.ts#L13-L58) splits a Step at
   measure boundaries into exact ProgressionMeasureFragment values and marks
   startsHere, continuesFromPrevious, and continuesToNext.
3. The same layout adds only an implicit final ProgressionMeasureGap; internal silence MUST remain a
   canonical RestStep, per [measureLayout.ts](../../src/domain/timing/measureLayout.ts#L111-L220).

There is no separate persisted “measure event” or “gap Step”. A Harmony item is a fragment of its source
Step. A rest is identified from fragment.step.kind === "rest"; a trailing gap is identified from the
existing ProgressionMeasureGap. A continuation is a visual fragment relation, never a new Step ID.

### 2.4 Existing Melody projection and future distinction

The current generated Melody contract already supplies a read-only source for the shared axis:

- MelodyEvent retains sourceStepId, exact startOffsetBeats, and exact durationBeats in
  [src/domain/melody/types.ts](../../src/domain/melody/types.ts#L64-L75).
- createMelodyTimeline(project) is a derived, generated-only projection; it consumes the same measure
  layout, emits exact note/rest fragments, and partitions effective instruments into deterministic lanes in
  [src/notation/melodyStaffProjection.ts](../../src/notation/melodyStaffProjection.ts#L32-L95) and
  [melodyStaffProjection.ts](../../src/notation/melodyStaffProjection.ts#L341-L443).
- HarmonicNoteRole is derived from the current and next harmonic context, with accessible non-color
  semantics, in [src/domain/harmony/noteRoles.ts](../../src/domain/harmony/noteRoles.ts#L6-L19) and
  [noteRoles.ts](../../src/domain/harmony/noteRoles.ts#L36-L76).

The boundary is deliberate:

| Capability | Existing now | T198 contract | Future implementation |
| --- | --- | --- | --- |
| Harmony timing/fragments/rests/continuations | createProgressionTimeline + createProgressionMeasureLayout | Adapter composes these exact values; no duplicate timing model | T200/T201/T202 consumers |
| Generated Melody events and instrument lanes | createMelodyTimeline and MelodyInstrumentLane | Adapter reads them and aligns them to the same measure/Rational axis | T206 read-only inline lane |
| Authored Melody note IDs/onset/duration | Not in current v6 MelodyEvent | T198 MUST NOT add or serialize them | T207 and schema v7 only |
| One effective phrase resolver for all consumers | Not a T198 API | T198 reserves no implementation name | T207 only: resolveEffectiveMelodyPhrase |
| Screen selection/drag/candidate preview | Existing single-step UI state and local component state | New range/gesture/candidate state is transient and adapter-owned | T200–T204 |

The T206 lane is read-only and MUST reuse the generated projection; it MUST NOT imply authored notes,
schema v7, or a second Melody source. T207 is the only task that can add the generated/authored ChordMelody
union and authored notes described in [data-model.md](./data-model.md#L572-L593).

## 3. Ownership and cross-surface relationships

### 3.1 Matrix: harmonic discovery

Matrix owns harmonic search, context, topology, recommendations, and non-committing card preview. It may
select a Matrix card, calculate a harmonic realization, expose rationale, audition it, and offer an explicit
Add route. It MUST NOT become the temporal editor for committed Steps: no Matrix gesture may silently change
Step order, duration, range selection, or an existing Step instance.

The current separation is visible in AppStore.matrixSession.previewFunctionId and its non-persisting
selectMatrixPreview/clearMatrixPreview methods ([appStore.ts](../../src/app/appStore.ts#L6-L18),
[appStore.ts](../../src/app/appStore.ts#L40-L48)). A Matrix card is a template, not a Step and has no
canonical Step identity before Add. Matrix and My Progression may expose equivalent chord meaning by
resolving the same harmonic model, but they MUST NOT share object identity. Explicit Add snapshots the
template into a new independent Step with its own stable ID; only that new Step becomes a My Progression
editing target. T198 preserves that distinction.

### 3.2 My Progression: temporal editing

My Progression owns the shared Harmony/Melody timeline as the temporal editing surface. It owns selection
of committed Step IDs, exact duration/order edits, rests/trailing gaps, playback association, and opening the
existing Inspector/editor for a selected Step. Existing Progression UI already consumes the exact measure
layout and createMelodyTimeline, and ProgressionStepCard exposes accessible selection by data-step-id,
aria-pressed, and aria-current.

An edit MUST target a stable Step ID and use a canonical project command. The current duration route is
timing/set-step-duration with { stepId, duration: MusicalDuration, nowIso } in
[src/app/commands/timingCommands.ts](../../src/app/commands/timingCommands.ts#L159-L220). The current
command boundary is ProjectCommand -> AppliedCommand in
[src/app/commands/index.ts](../../src/app/commands/index.ts#L3-L17).

### 3.3 Selection, Inspector, and playback

Selection is an identity relationship, not a playhead:

- Existing single selection is Project.progression.selectedStepId, resolved to the selected Step for the
  Inspector and command handlers. The current progression/select-step route is a persisted compatibility
  route, not transient editor state: AppStore.dispatch excludes it from SessionHistory but still calls
  notify({ persist: true }), so projectController schedules autosave
  ([appStore.ts](../../src/app/appStore.ts#L50-L61), [projectController.ts](../../src/app/projectController.ts#L120-L127)).
  A future gesture MUST capture its baseline after that intentional selection route has completed.
- A Melody note selects its owning sourceStepId; a continuation fragment selects the same owner. A
  multi-selection/range stores stable IDs in transient editor state, in progression order, never DOM indexes.
- Inspector edits and editor commits retain the target ID. If the target disappeared or the snapshot changed,
  the gesture is invalidated and no command is emitted.
- Playback uses separate transport state: currentStepIndex, activeMelodyEventKey, and session identity
  live in [TransportStore](../../src/ui/transport/transportStore.ts#L4-L15), while Play/Pause/Resume/Stop
  transition that state in [transportStore.ts](../../src/ui/transport/transportStore.ts#L154-L220). The
  playback controller likewise starts/pauses/resumes/stops transport without dispatching selection
  ([playbackController.ts](../../src/audio/playbackController.ts#L188-L222)).

Therefore **Play, Play From Here, Pause, Resume, and Stop MUST leave the selected Step ID unchanged**.
The playing Step and selected Step may differ; aria-current="step" identifies playback and
aria-pressed="true" identifies selection. Stop clears playback highlighting, not selection.

## 4. Gesture and selection state machine

This state machine applies to the future Composition Editor surface. It does not retrofit unrequested
behavior into current Staff, Matrix, or Card View code. Before a transient gesture begins, the adapter captures
`gestureBaseline` from the current Project after the latest intentional selection-only route. That baseline,
not a snapshot from before selection, is the comparison point for Cancel/Restore.

~~~text
IDLE
  -> SELECTED          click/focus a Step or Melody event; a Matrix card remains discovery/preview context until Add
  -> PREVIEWING        begin a supported gesture with a captured Step ID

SELECTED
  -> SELECTED          click/keyboard navigation changes transient target IDs
  -> PREVIEWING        pointer-down/keyboard edit begins
  -> IDLE              Escape with no open gesture/range

PREVIEWING
  -> PREVIEWING        pointer-move, keyboard candidate movement, or Space audition
  -> CANCELLED         Escape, pointercancel, lost pointer capture, invalid target, or blur cancellation
  -> READY              finite screen coordinate converted, snapped, and domain-validated

READY
  -> PREVIEWING        candidate changes before Apply
  -> COMMITTING        pointer-up / Enter / explicit Apply
  -> CANCELLED         Escape

COMMITTING
  -> SELECTED          one command succeeds; select/retain affected stable IDs and restore logical focus
  -> CANCELLED         command validation fails; emit no command and announce the error

CANCELLED
  -> SELECTED          restore the gestureBaseline selection and invoker focus
  -> IDLE              if there was no selection
~~~

State semantics:

1. The existing compatibility selectedStepId update is a persisted selection-only exception: it changes
   Project, is excluded from SessionHistory, and may schedule autosave. After that route, IDLE, SELECTED,
   PREVIEWING, READY, and CANCELLED hold only transient editor state: gestureBaseline identity/hash, stable
   target IDs, pointer capture, draft Rational values, candidate key, preview token, and focus invoker. New
   range/gesture state MUST NOT be written to Project, SessionHistory, or schedule a preview-caused autosave.
2. Pointer gestures capture the source stepId on pointer-down. Pointer movement updates only the draft;
   pointer-up is the commit boundary. Pointer cancellation and lost capture are cancel transitions.
3. Keyboard navigation uses the same IDs and draft pipeline as pointer input. ArrowLeft/ArrowRight move the
   target; Shift+Arrow extends a contiguous range; Space auditions the focused candidate; Enter applies;
   Escape cancels the draft or closes the candidate surface. Held-key repeats MUST NOT create repeated commits.
   Moving focus alone is transient. When navigation intentionally changes the single selected Step, it uses
   the existing selection-only route, updates the Inspector owner, and captures a new gestureBaseline before
   any preview begins.
4. Escape is idempotent. It stops the relevant preview/audition, drops the draft, restores the transient
   editor state to gestureBaseline, leaves Project byte-for-byte equal to that baseline, and returns focus to
   the invoker or the nearest surviving Step target. It does not reverse the intentional selection-only route
   that established the baseline.
5. The editor MUST expose focusable controls with stable accessible names, aria-pressed for selection,
   aria-current="step" for playback, and text/state descriptions for Rational duration, rest,
   continuation, instrument lane, and harmonic role. Color alone is insufficient.
6. Existing Staff behavior remains authoritative until its future keyboard-composition task is accepted;
   T198 defines the shared lifecycle, not a production keyboard remapping.

## 5. Rational coordinate, snapping, and command transaction

### 5.1 One absolute-endpoint snap policy

All pointer and keyboard duration-resize paths MUST use this single policy, named **nearest exact endpoint**.
The coordinate is always on the shared absolute timeline, never restarted at the containing measure:

1. Resolve the selected Step's exact `stepStartBeats` from canonical Step order, equivalently the earliest
   `ProgressionMeasureFragment.startBeats` for that Step. Convert the screen coordinate to a finite raw
   `rawEndpointBeats` by adding the containing measure's absolute `startBeats` to its local pointer offset.
   Float arithmetic exists only in this transient adapter calculation. The committed duration is always
   `endpoint - stepStartBeats`, including all preceding fragments of the selected Step.
2. Build one finite positive endpoint set for the current snapshot. Let `barLengthBeats` be the exact value
   from `createProgressionMeasureLayout`, let `q = 1 / L` where `L` is the least common multiple of 24,
   the denominator of `barLengthBeats`, and the denominators used by `DURATION_PRESETS`, and let
   `editableEnd = max(playbackDurationBeats, stepStartBeats + 4 * barLengthBeats)`.
   The endpoint set is the deduplicated union of:
   - `stepStartBeats + k*q` for positive integers `k` whose endpoint is at or before `editableEnd`;
   - every exact existing Step start/end and every measure boundary at or before `editableEnd`;
   - `stepStartBeats + d` for every exact existing Step duration and every `DURATION_PRESETS` value that
     remains within `editableEnd`; and
   - `editableEnd` itself, so the upper clamp is explicit.
   Filter the union to endpoints strictly greater than `stepStartBeats`; every member is a normalized
   Rational. The range is finite because `editableEnd` is finite for the snapshot and `q` is positive; it is
   not an unbounded duration universe. An implementation MAY find neighboring candidates arithmetically
   rather than materializing the entire lattice for a long progression.
3. Select the endpoint with the smallest absolute numeric distance to `rawEndpointBeats`. A tie selects the
   smaller positive duration `endpoint - stepStartBeats`; a remaining tie uses normalized endpoint
   `(numerator, denominator)` ascending. Keyboard Left/Right uses the immediate predecessor/successor in
   this same sorted absolute-endpoint set, never a second keyboard grid.
4. The `q = 1/24` minimum lattice covers exact Rational durations `3/4 = 18q` and `7/8 = 21q`, while
   measure boundaries and the finite horizon cover cross-bar and multi-bar endpoints. For example, in a
   `7/8` meter (`barLengthBeats = 7/2`), a Step beginning at absolute beat `3` may snap to endpoint
   `31/8`, yielding duration `7/8` and crossing the bar boundary at `7/2`; in a `3/4` meter, a Step at
   absolute beat `2` may snap to endpoint `11`, yielding a three-bar duration of `9` beats. The endpoint
   is absolute in both examples; it is not a local coordinate within one measure.
5. If the raw endpoint is before the first positive candidate, clamp to that candidate and expose a lower
   clamp/overflow state. If it is after `editableEnd`, clamp to `editableEnd` and expose an upper
   clamp/overflow state. A preview MUST announce the clamp; Apply may commit only a positive exact duration.
   If validation finds no positive endpoint for the current snapshot, it rejects the draft and transitions to
   Cancelled. No overflow creates new candidates outside the finite horizon.
6. Construct a Rational/MusicalDuration from the selected exact duration, then validate the target Step,
   positive duration, current snapshot identity, and command-specific invariants. The command handler remains
   the final validator. rational() normalizes safe integer fractions in
   [src/domain/timing/rational.ts](../../src/domain/timing/rational.ts#L1-L66).

The adapter MUST NOT persist a rounded pixel value, decimal beat, seconds value, MIDI tick, or donor-library
coordinate. Swing is a later performance projection and MUST NOT change stored Step duration fractions.

### 5.2 One canonical transaction

After validation, one completed edit MUST call one canonical command dispatch. For direct duration resize,
that is the existing timing/set-step-duration route; other edits use the existing command whose domain
semantics match the operation. If a future operation changes multiple semantic fields, it MUST be represented
by one command handler with one AppliedCommand inverse, not a loop of dispatches.

The current AppStore.dispatch applies the command, pushes one forward/inverse pair to SessionHistory,
and notifies persistence; Undo/Redo consumes that pair through the existing inverse dispatcher
([appStore.ts](../../src/app/appStore.ts#L50-L86), [history.ts](../../src/app/history/history.ts#L3-L45)).
The contract is:

~~~text
screen float
  -> absolute endpoint
  -> exact duration Rational
  -> domain validation against the current Project snapshot
  -> one mutating ProjectCommand dispatch
  -> one HistoryEntry (forward + inverse)
  -> post-commit persistence of the final Project snapshot through the existing debounce
~~~

No intermediate draft, pointermove, preview, focus change, or audition may enter history. A failed or
cancelled validation emits no mutating command or history entry and schedules no preview-caused autosave;
an autosave already scheduled by the persisted selection-only route may still flush, and the contract does not
cancel or delay it. A valid Apply emits exactly one mutating command/history transaction and its inverse
restores the exact prior Project semantics, including stable Step IDs and the gestureBaseline selection when the
command does not intentionally change selection. The UI may reconcile the existing compatibility
selectedStepId/focus after the commit through the selection-only route; that route is excluded from history but
is a persisted compatibility update, not a second musical edit.

## 6. Preview, audition, Apply, and determinism

### 6.1 Non-mutating preview/audition

Preview means a derived rendering of a frozen Project snapshot plus transient draft/candidate state.
Audition means transient audio for that preview. Both MUST satisfy, relative to the `gestureBaseline` captured
after any intentional selection-only route:

- Project JSON is byte-for-byte unchanged from `gestureBaseline`;
- SessionHistory.undoDepth and redoDepth are unchanged;
- no autosave is scheduled or flushed because of preview/audition; an autosave already pending from the
  selection-only route may flush during preview, and preview MUST NOT cancel, delay, or claim that flush;
- no canonical Step is created, removed, reordered, or retimed;
- the existing progression transport is not paused, stopped, or replaced.

The current Matrix preview already uses notify({ persist: false }), and the
PreviewAuditionController has an independent preview scope that cancels prior preview audio without
touching progression transport or Undo history ([appStore.ts](../../src/app/appStore.ts#L40-L48) and
[previewAudition.ts](../../src/audio/previewAudition.ts#L17-L26)). The Composition Editor MUST use the
same separation. It MUST NOT call AppStore.dispatch for preview, and it MUST NOT route preview through the
project autosave subscription in [src/app/projectController.ts](../../src/app/projectController.ts#L120-L127).
The existing progression/select-step dispatch is different: it intentionally persists selection and may have
an autosave pending before preview begins; preview neither creates that pending save nor promises to stop it.

Auditioning a new candidate cancels the previous candidate's preview scope. It MUST NOT call the main
PlaybackController.stop() or alter the selected Step. Stop/Escape of candidate audio is local to the
preview scope.

### 6.2 Apply and deterministic alternatives

For fixed Project snapshot, tonic/module, selected stable IDs, and explicit user intent, alternatives MUST be
ordered and reproducible. Candidate identity and rationale MUST be derived from semantic values, not random
IDs or screen coordinates. Existing RecommendationResult/RecommendationCandidate structured factors are
the authoritative shape for Matrix rationale; the future Alternatives tray may render that result but MUST NOT
invent a second scoring meaning.

The candidate tray contract is:

~~~text
fixed Project snapshot + intent + selected IDs
  -> deterministic candidate keys and structured factors
  -> transient preview/audition only
  -> Enter/Apply
  -> one canonical ProjectCommand and one history entry
~~~

Apply first stops the candidate's preview scope, validates against the still-current Project snapshot, and
then dispatches once. If the snapshot or target Step changed, Apply is rejected with an accessible message;
the Project and history remain unchanged. Cancel/Escape closes the tray, restores the invoker focus and the
gestureBaseline draft/selection state, and emits no mutating command or preview-caused autosave.

## 7. Signal adapter and provenance gate (T199 entry contract)

T199 is a disposable spike after T198, not a production dependency. It may evaluate only MIT-licensed
interaction gestures: selection, move, edge resize, coordinate transforms, and clipboard only if separately
justified by the spike. The required fixture is C4 for 1 beat, E4 for 1/2 beat, and G4 for 1 beat, with
select, move, resize, multi-select, Ctrl-drag duplicate, and Undo/Redo exercises.

The only admissible boundary is:

~~~text
CadenceFlow fixture / screen geometry
  -> disposable gesture adapter (screen float + pointer/keyboard events)
  -> transient CadenceFlow gesture result
  -> T198 Rational snap + validation + canonical command boundary
~~~

The adapter MUST NOT import, copy, or depend on Signal domain models, stores, audio, history, persistence,
or project semantics. Signal coordinates and numeric MIDI ticks MUST remain outside the CadenceFlow domain.
The spike MUST stay outside src/ production UI and MUST not change schema or runtime behavior.

Before any adapted donor code lands, every adapted file MUST carry a provenance comment naming the upstream
repository, exact revision/commit, source path, MIT license, and local modifications. The repository MUST
also contain THIRD_PARTY_NOTICES.md with the same per-file mapping. A URL without a revision, or a general
MIT statement without file-level mapping, is insufficient. If no code is adapted, no donor code or notice is
created. T198 itself adds neither a Signal dependency nor a notice because it contains no adapted code.

## 8. Invariants

1. One Project snapshot produces one deterministic read-only Harmony/Melody projection.
2. Every projected editable item resolves to a stable canonical Step ID; fragments and continuations never
   create identity aliases.
3. Internal silence is a RestStep; only the final incomplete measure has an implicit trailing gap.
4. Exact Rational values are the only persisted timing values. Screen floats, seconds, swing-adjusted
   playback timing, and audio handles are derived.
5. Matrix discovers harmony; My Progression edits temporal Step instances.
6. Single selection, range selection, playback highlight, and Matrix preview are separate state channels.
7. Play, Play From Here, Pause, Resume, and Stop do not clear or replace selectedStepId.
8. Preview, audition, cancel, and candidate navigation do not mutate Project or history relative to
   gestureBaseline and do not schedule preview-caused autosave; a pending selection-only autosave may flush.
9. Every valid Apply is one canonical command and one forward/inverse history entry; Undo/Redo restores the
   exact prior semantic state.
10. Harmonic roles are derived { primary, targetNext }, announced with text/semantics, and never written
    into serialized MelodyEvent.
11. T198 adds no schema field and does not materialize generated Melody notes.
12. Signal, if evaluated later, is confined to a disposable MIT gesture adapter with per-file provenance;
    Signal domain/store/audio/history code never crosses the boundary.

## 9. Acceptance examples for SC-033–SC-037

These examples are the minimum independent checks for this contract. They describe observable behavior and
do not authorize implementation in T198.

| Criterion | Deterministic acceptance example |
| --- | --- |
| SC-033 ownership and identity | With two independent ChordStep instances that share the same harmonic function, Matrix card preview changes only Matrix session state. The Matrix card is a template, not a Step; Matrix and My Progression show equivalent chord meaning by resolving the same harmonic model. Explicit Add snapshots that template into a new independent Step with a new stable Step ID. Editing duration/order in My Progression changes only the addressed Step, and clicking a generated Melody event selects its sourceStepId. |
| SC-033 playback relationship | Select Step B, then Play, Play From Here on another Step, Pause, Resume, and Stop. currentStepIndex/playback highlight may change, but project.progression.selectedStepId === "B" remains true and Inspector ownership stays on B. |
| SC-034 preview/cancel | First complete any intentional progression/select-step action, then capture the post-selection gestureBaseline Project JSON, history depths, and autosave observability. Start a duration or alternative preview, drag through several absolute-timeline positions, audition twice, press Escape, and stop preview audio. Project and history remain equal to that baseline; preview adds no dispatch or autosave schedule, while an already pending selection-only autosave may flush; main transport is unchanged and focus returns to the invoker. |
| SC-034 Apply/Undo/Redo | From a fixed snapshot, preview an exact candidate and press Apply once. Exactly one command/history entry is added. Undo restores the prior exact Rational duration/Step state; Redo restores the candidate; no second entry is created by pointer movement or preview audio. |
| SC-035 role/accessibility | For a generated note that is a root and a target-next note, the derived role is { primary: "root", targetNext: true }. Accessible text exposes both facts when harmonic-role colors are disabled. Serialized MelodyEvent contains no role fields; schema remains v6. |
| SC-036 exact selection/resize | Use C4=1 beat, E4=1/2 beat, G4=1 beat. Resize from an absolute-timeline raw endpoint halfway between exact candidates; the lower positive duration wins the tie. Verify `3/4 = 18/24`, `7/8 = 21/24`, a `7/8`-meter cross-bar endpoint, and a multi-bar endpoint such as duration `9` in `3/4` meter. Repeating the same pointer trace yields identical endpoint, numerator/denominator, Step ID, and projection; below/above-horizon inputs expose deterministic clamp/overflow. Shift+Arrow extends a contiguous stable-ID range; reorder does not turn it into index selection. |
| SC-037 deterministic alternatives | Run the same Project snapshot, intent, and selected IDs twice. Candidate keys, ordering, scores/factors, labels, and rationale are identical. Arrow navigation and Space audition do not mutate Project/history. Enter applies only the focused candidate through one command. |

## 10. T198 review result and non-goals

Cross-artifact review found no need to change the authoritative spec, plan, data model, task ledger, or
project status for this contract. The only intentional T198 artifact is this document. It does not mark T198
complete, claim T199 evidence, change schema v6, add a UI, add a command, add a test, or introduce a
third-party dependency.

## 11. Piano Roll batch 1 canonical Melody and v9 interim contract

The approved batch 1 extends the existing Step-owned Melody semantics without adding a persisted timeline,
Undo store, or audio engine. Chord Steps retain the v8 `melody` wire shape (`generated` recipe or legacy
`authored` phrase). Rest Steps may store an `authoredMelody` phrase and an optional owner instrument override;
there is no generated Rest Melody. The phrase uses exact pitch plus relative Rational onset/duration and
allows polyphony, including equal pitch and onset.

The new `melody/apply-authored-transaction` command accepts a set of absolute Rational note proposals and
applies them atomically. It resolves owner by onset against cumulative Step boundaries (an exact boundary
belongs to the next Step), keeps IDs through moves, regenerates an ID if the destination phrase already owns
that ID, and rejects stale snapshots, generated destinations, or any new note whose onset/end falls outside
the current progression. Delete and Undo use the same one-command inverse boundary. Reorder keeps notes on
their owner; owner deletion removes them with that Step; Step duplication creates fresh authored note IDs.

`createEffectiveMelodyTimeline` is the shared playback/notation/export source. It derives absolute Rational
positions from current Step durations, resolves instrument as Step override then Melody Track, supports
authored Rest notes, emits one attack per note, and clips only the effective duration at the current
progression end. Stored note duration is untouched when the progression is shortened. Notes starting at or
after the end are omitted consistently. Newly proposed edits are rejected if they would cross that end.

Schema v9 adds Rest `authoredMelody` and `melodyInstrumentOverride` and recognizes
`presentation.progressionView: "piano-roll"`. The v8→v9 migration preserves all prior Project data and does
not convert generated recipes. Until the Piano Roll renderer is implemented, decode and encode retain a
persisted `piano-roll` preference while the UI routes its current renderer through Harmonic view. This is a
temporary derived fallback: no import loss and no blank view. Grid, zoom, and the Piano Roll renderer are
outside batch 1.
