import { describe, expect, it } from "vitest";
import { AppStore } from "../../src/app/appStore";
import {
  applyTimingResizeOnce,
  createCanonicalStepDurationFixture,
  projectJson,
  selectStepThroughPersistedRoute,
} from "../../spikes/t199-signal-gestures/cadenceflow-boundary";
import {
  T199_FIXTURE,
  beginInteraction,
  beginPreview,
  buildExactEndpointCandidates,
  cancelInteraction,
  cloneFixture,
  ctrlDragDuplicatePreview,
  escapePreview,
  keyboardExtendSelection,
  movePreview,
  resizeNotePreview,
  screenToTimelinePoint,
  selectAt,
  selectByMarquee,
  snapExactEndpoint,
} from "../../spikes/t199-signal-gestures/adapter";
import { equalRational, rational, rationalToNumber } from "../../src/domain/timing/rational";

const GEOMETRY = {
  left: 100,
  top: 40,
  pixelsPerBeat: 96,
  pixelsPerPitch: 20,
  highestMidi: 67,
} as const;

function pitchPoint(midi: number, beat: number) {
  return {
    x: GEOMETRY.left + beat * GEOMETRY.pixelsPerBeat,
    y: GEOMETRY.top + (GEOMETRY.highestMidi - midi + 0.5) * GEOMETRY.pixelsPerPitch,
  };
}

describe("T199 disposable Signal gesture spike", () => {
  it("keeps selection, move, resize, multi-select, duplicate, cancel, and focus transient", () => {
    const notes = cloneFixture();
    const c4 = selectAt(notes, pitchPoint(60, 0.5), GEOMETRY);
    expect(c4.selectedIds).toEqual(["note-c4"]);

    const multi = selectByMarquee(notes, { x: 95, y: 35 }, { x: 270, y: 220 }, GEOMETRY);
    expect(multi.selectedIds).toEqual(["note-c4", "note-e4", "note-g4"]);
    expect(
      keyboardExtendSelection(["note-c4", "note-e4", "note-g4"], c4, "right").selectedIds,
    ).toEqual(["note-c4", "note-e4"]);

    const moved = movePreview(notes, multi.selectedIds, { x: 48, y: -20 }, GEOMETRY);
    expect(moved.map((note) => note.id)).toEqual(notes.map((note) => note.id));
    expect(moved.map((note) => rationalToNumber(note.onset))).toEqual([0.5, 1.5, 2]);
    expect(moved.map((note) => note.midi)).toEqual([61, 65, 68]);

    const duplicated = ctrlDragDuplicatePreview(
      notes,
      ["note-c4", "note-e4"],
      { x: 96, y: 0 },
      GEOMETRY,
    );
    expect(duplicated.map((note) => note.id)).toEqual([
      "note-c4",
      "note-e4",
      "note-g4",
      "note-c4-copy-1",
      "note-e4-copy-1",
    ]);
    expect(duplicated[3]?.onset).toEqual(rational(1));
    const duplicatedAgain = ctrlDragDuplicatePreview(
      duplicated,
      ["note-c4", "note-e4"],
      { x: 96, y: 0 },
      GEOMETRY,
    );
    expect(duplicatedAgain.map((note) => note.id)).toEqual([
      "note-c4",
      "note-e4",
      "note-g4",
      "note-c4-copy-1",
      "note-e4-copy-1",
      "note-c4-copy-2",
      "note-e4-copy-2",
    ]);
    expect(new Set(duplicatedAgain.map((note) => note.id)).size).toBe(duplicatedAgain.length);

    const snapshot = beginInteraction(notes, "progression-step-button");
    const previewState = beginPreview(snapshot);
    expect(previewState).toEqual({
      phase: "preview",
      invokerFocusId: "progression-step-button",
      focusedId: "gesture-preview",
    });
    const cancelled = cancelInteraction(snapshot);
    expect(cancelled.notes).toEqual(notes);
    expect(escapePreview(previewState).focusedId).toBe("progression-step-button");
    expect(escapePreview(previewState).phase).toBe("idle");
  });

  it("converts screen floats to absolute endpoints and exact Rational resize values", () => {
    const point = screenToTimelinePoint(
      { x: 100 + 96 * 1.375, y: GEOMETRY.top + 1.5 * GEOMETRY.pixelsPerPitch },
      GEOMETRY,
    );
    expect(point.absoluteBeat).toBe(1.375);
    expect(point.midi).toBe(66);
    expect(() =>
      screenToTimelinePoint({ x: 100, y: 40 }, { ...GEOMETRY, pixelsPerBeat: Number.NaN }),
    ).toThrow("finite and positive");
    expect(() =>
      screenToTimelinePoint(
        { x: 100, y: 40 },
        { ...GEOMETRY, pixelsPerPitch: Number.POSITIVE_INFINITY },
      ),
    ).toThrow("finite and positive");

    const candidates = buildExactEndpointCandidates({
      stepStart: rational(0),
      editableEnd: rational(4),
      meter: { numerator: 4, denominator: 4 },
      existingEndpoints: [rational(1), rational(3, 2)],
      durationPresets: [rational(1, 2), rational(1)],
    });
    const snapped = snapExactEndpoint(1.52, rational(0), rational(4), candidates);
    expect(snapped.endpoint).toEqual(rational(3, 2));
    expect(snapped.duration).toEqual(rational(3, 2));
    expect(equalRational(rational(18, 24), rational(3, 4))).toBe(true);
    expect(equalRational(rational(21, 24), rational(7, 8))).toBe(true);

    const resized = resizeNotePreview(notesForResize(), "note-c4", "right", 1.52, {
      stepStart: rational(0),
      editableEnd: rational(4),
      meter: { numerator: 4, denominator: 4 },
      existingEndpoints: [rational(1), rational(3, 2)],
      durationPresets: [rational(1, 2), rational(1)],
    });
    expect(resized.duration).toEqual(rational(3, 2));
    expect(resized.note.id).toBe("note-c4");
    const resizedLeft = resizeNotePreview(notesForResize(), "note-e4", "left", 0.51, {
      stepStart: rational(0),
      editableEnd: rational(4),
      meter: { numerator: 4, denominator: 4 },
    });
    expect(resizedLeft.note.onset).toEqual(rational(1, 2));
    expect(resizedLeft.note.duration).toEqual(rational(1));
    expect(() =>
      resizeNotePreview(notesForResize(), "note-e4", "left", 1.5, {
        stepStart: rational(0),
        editableEnd: rational(4),
        meter: { numerator: 4, denominator: 4 },
      }),
    ).toThrow("positive duration");
    expect(() =>
      resizeNotePreview(notesForResize(), "missing", "right", 1, {
        stepStart: rational(0),
        editableEnd: rational(4),
        meter: { numerator: 4, denominator: 4 },
      }),
    ).toThrow("Unknown transient note");
  });

  it("uses absolute cross-bar and multi-bar candidates with deterministic clamp/tie rules", () => {
    const sevenEight = buildExactEndpointCandidates({
      stepStart: rational(3),
      editableEnd: rational(7),
      meter: { numerator: 7, denominator: 8 },
    });
    const crossBar = snapExactEndpoint(3.87, rational(3), rational(7), sevenEight);
    expect(crossBar.endpoint).toEqual(rational(31, 8));
    expect(crossBar.duration).toEqual(rational(7, 8));
    expect(crossBar.clamp).toBeNull();

    const threeFour = buildExactEndpointCandidates({
      stepStart: rational(2),
      editableEnd: rational(11),
      meter: { numerator: 3, denominator: 4 },
    });
    const multiBar = snapExactEndpoint(10.99, rational(2), rational(11), threeFour);
    expect(multiBar.endpoint).toEqual(rational(11));
    expect(multiBar.duration).toEqual(rational(9));
    const clampCandidates = buildExactEndpointCandidates({
      stepStart: rational(0),
      editableEnd: rational(4),
      meter: { numerator: 3, denominator: 4 },
    });
    expect(snapExactEndpoint(-10, rational(0), rational(4), clampCandidates).clamp).toBe("lower");
    expect(snapExactEndpoint(99, rational(0), rational(4), clampCandidates).clamp).toBe("upper");

    const tie = snapExactEndpoint(1.125, rational(0), rational(2), [rational(1), rational(5, 4)]);
    expect(tie.endpoint).toEqual(rational(1));

    const longProgression = buildExactEndpointCandidates({
      stepStart: rational(0),
      editableEnd: rational(500),
      meter: { numerator: 4, denominator: 4 },
    });
    expect(longProgression.length).toBeGreaterThan(10_000);
    expect(snapExactEndpoint(450.01, rational(0), rational(500), longProgression).endpoint).toEqual(
      rational(10_800, 24),
    );
    expect(longProgression.at(-1)).toEqual(rational(500));
    expect(() =>
      buildExactEndpointCandidates({
        stepStart: rational(3),
        editableEnd: rational(3),
        meter: { numerator: 4, denominator: 4 },
      }),
    ).toThrow("no positive exact endpoint");
  });

  it("keeps previews/cancel out of Project/history and applies one real Step command with Undo/Redo", () => {
    const store = new AppStore(createCanonicalStepDurationFixture());
    const notifications: boolean[] = [];
    const unsubscribe = store.subscribe((change) => notifications.push(change.persist));
    expect(store.history.undoDepth).toBe(0);
    const notesBefore = JSON.stringify(T199_FIXTURE);
    const projectBeforeSelection = projectJson(store);

    selectStepThroughPersistedRoute(store, "step-duration");
    expect(store.history.undoDepth).toBe(0);
    expect(store.project.progression.selectedStepId).toBe("step-duration");
    expect(notifications).toEqual([true]);
    const gestureBaseline = projectJson(store);

    const pointerEndpoint = screenToTimelinePoint(pitchPoint(60, 1.52), GEOMETRY).absoluteBeat;
    expect(pointerEndpoint).toBeCloseTo(1.52);
    const preview = resizeNotePreview(notesForResize(), "note-c4", "right", pointerEndpoint, {
      stepStart: rational(0),
      editableEnd: rational(4),
      meter: { numerator: 4, denominator: 4 },
      existingEndpoints: [rational(1), rational(3, 2)],
    });
    expect(preview.duration).toEqual(rational(3, 2));
    expect(projectJson(store)).toBe(gestureBaseline);
    expect(store.history.undoDepth).toBe(0);
    expect(notifications).toEqual([true]);
    expect(JSON.stringify(T199_FIXTURE)).toBe(notesBefore);
    const cancelled = cancelInteraction(beginInteraction(notesForResize(), "duration-handle"));
    expect(cancelled.notes).toEqual(notesForResize());
    expect(projectJson(store)).toBe(gestureBaseline);
    expect(store.history.undoDepth).toBe(0);
    expect(notifications).toEqual([true]);
    expect(() => applyTimingResizeOnce(store, "step-duration", rational(0))).toThrow(
      "canonical duration must be positive",
    );
    expect(projectJson(store)).toBe(gestureBaseline);
    expect(store.history.undoDepth).toBe(0);

    applyTimingResizeOnce(store, "step-duration", preview.duration);
    expect(store.history.undoDepth).toBe(1);
    expect(store.project.progression.steps[0]?.duration.beats).toEqual(rational(3, 2));
    expect(store.project.schemaVersion).toBe(createCanonicalStepDurationFixture().schemaVersion);
    expect(notifications).toEqual([true, true]);

    expect(store.undo()).toBe(true);
    expect(store.history.undoDepth).toBe(0);
    expect(store.history.redoDepth).toBe(1);
    expect(store.project.progression.steps[0]?.duration.beats).toEqual(rational(1));
    expect(store.redo()).toBe(true);
    expect(store.history.undoDepth).toBe(1);
    expect(store.project.progression.steps[0]?.duration.beats).toEqual(rational(3, 2));
    expect(projectBeforeSelection).not.toBe(gestureBaseline);
    unsubscribe();
  });
});

function notesForResize() {
  return cloneFixture();
}
