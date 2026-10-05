import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import {
  createSetStepDurationCommand,
  setStepDuration,
} from "../../../src/app/commands/timingCommands";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { meter } from "../../../src/domain/timing/meter";
import { rational, rationalToNumber } from "../../../src/domain/timing/rational";
import {
  buildDurationResizeEndpointCandidates,
  createDurationResizeSnapshot,
  isDurationResizeSnapshotCurrent,
  moveDurationResizeEndpoint,
  screenXToAbsoluteResizeEndpoint,
  snapDurationResizeEndpoint,
} from "../../../src/ui/progression/durationResizeAdapter";

function projectWithSteps(
  meterValue: ReturnType<typeof meter>,
  durations: readonly ReturnType<typeof rational>[],
) {
  const base = createDefaultProject(
    "t201-resize",
    "T201 resize fixture",
    "2026-09-29T00:00:00.000Z",
  );
  const steps = durations.map((duration, index) => ({
    ...createMatrixChordStep(base, index % 2 === 0 ? "I" : "V", `step-${index + 1}`),
    duration: musicalDuration(duration),
  }));
  return Object.freeze({
    ...base,
    presentation: Object.freeze({ ...base.presentation, progressionView: "piano" as const }),
    globalTiming: Object.freeze({ ...base.globalTiming, meter: meterValue }),
    progression: Object.freeze({ steps: Object.freeze(steps) }),
  });
}

describe("T201 direct duration resize adapter", () => {
  it("uses nearest exact endpoint with lower-duration tie break and explicit clamps", () => {
    const project = projectWithSteps(meter(4, 4, [4]), [rational(1)]);
    const snapshot = createDurationResizeSnapshot(project, "step-1");
    const tie = snapDurationResizeEndpoint(2 + 1 / 48, snapshot);

    expect(tie.endpoint).toEqual(rational(2));
    expect(tie.duration).toEqual(rational(2));
    expect(tie.clamp).toBeNull();

    const lower = snapDurationResizeEndpoint(-1, snapshot);
    expect(lower.clamp).toBe("lower");
    expect(lower.announcement).toMatch(/lower clamp/i);
    expect(lower.duration).toEqual(rational(1, 24));

    const upper = snapDurationResizeEndpoint(rationalToNumber(snapshot.editableEnd) + 1, snapshot);
    expect(upper.clamp).toBe("upper");
    expect(upper.endpoint).toEqual(snapshot.editableEnd);
    expect(upper.announcement).toMatch(/upper clamp/i);
  });

  it("keeps the pointer coordinate absolute across a 7/8 barline", () => {
    const project = projectWithSteps(meter(7, 8, [2, 2, 3]), [rational(3), rational(1)]);
    const snapshot = createDurationResizeSnapshot(project, "step-2");
    const preview = snapDurationResizeEndpoint(rational(31, 8).numerator / 8, snapshot);

    expect(preview.endpoint).toEqual(rational(31, 8));
    expect(preview.duration).toEqual(rational(7, 8));
    expect(preview.clamp).toBeNull();
  });

  it("supports a three-bar 3/4 endpoint and walks the same candidates by keyboard", () => {
    const project = projectWithSteps(meter(3, 4, [3]), [rational(2), rational(1)]);
    const snapshot = createDurationResizeSnapshot(project, "step-2");
    const preview = snapDurationResizeEndpoint(11, snapshot);
    const previous = moveDurationResizeEndpoint(snapshot, preview.endpoint, "left");
    const next = moveDurationResizeEndpoint(snapshot, previous.endpoint, "right");

    expect(preview.endpoint).toEqual(rational(11));
    expect(preview.duration).toEqual(rational(9));
    expect(previous.endpoint).toEqual(rational(263, 24));
    expect(next.endpoint).toEqual(preview.endpoint);
  });

  it("keeps the Piano Roll final chord capped while generic Step resizing spans Measures", () => {
    const project = projectWithSteps(meter(3, 4, [3]), [rational(2), rational(1)]);
    const pianoRoll = {
      ...project,
      presentation: { ...project.presentation, progressionView: "piano-roll" as const },
    };
    const snapshot = createDurationResizeSnapshot(pianoRoll, "step-2");
    const preview = snapDurationResizeEndpoint(11, snapshot);
    expect(preview.endpoint).toEqual(rational(3));
    expect(preview.duration).toEqual(rational(1));
    expect(preview.clamp).toBe("upper");
    expect(
      snapDurationResizeEndpoint(11, createDurationResizeSnapshot(project, "step-2")).endpoint,
    ).toEqual(rational(11));
  });

  it("converts screen geometry to an absolute endpoint without restarting at a measure", () => {
    const endpoint = screenXToAbsoluteResizeEndpoint(350, {
      measureStartBeats: rational(3),
      barLengthBeats: rational(7, 2),
      viewportLeftPx: 100,
      viewportWidthPx: 500,
      screenWidthPx: 1000,
      contentWidthPx: 500,
      scrollLeftPx: 0,
    });
    expect(endpoint).toBe(3.875);
  });

  it("keeps cancel/stale drafts non-mutating and commits one exact history transaction", () => {
    const initial = projectWithSteps(meter(4, 4, [4]), [rational(1)]);
    const snapshot = createDurationResizeSnapshot(initial, "step-1");
    const preview = snapDurationResizeEndpoint(2, snapshot);
    const store = new AppStore(initial);

    expect(store.history.undoDepth).toBe(0);
    expect(isDurationResizeSnapshotCurrent(store.project, snapshot)).toBe(true);
    expect(JSON.stringify(store.project)).toBe(JSON.stringify(initial));

    const staleProject = Object.freeze({ ...initial, updatedAt: "2026-09-29T00:03:00.000Z" });
    expect(isDurationResizeSnapshotCurrent(staleProject, snapshot)).toBe(false);
    expect(store.history.undoDepth).toBe(0);

    store.dispatch(
      createSetStepDurationCommand(
        "step-1",
        musicalDuration(preview.duration),
        "2026-09-29T00:04:00.000Z",
      ),
      setStepDuration,
    );
    expect(store.history.undoDepth).toBe(1);
    expect(store.project.progression.steps[0]!.duration.beats).toEqual(rational(2));
    expect(store.project.progression.steps[0]!.id).toBe("step-1");

    expect(store.undo()).toBe(true);
    expect(store.project.progression.steps[0]!.duration.beats).toEqual(rational(1));
    expect(store.project.progression.steps[0]!.id).toBe("step-1");
    expect(store.redo()).toBe(true);
    expect(store.project.progression.steps[0]!.duration.beats).toEqual(rational(2));
    expect(store.project.progression.steps[0]!.id).toBe("step-1");
  });

  it("deduplicates exact lattice, boundary, and preset candidates", () => {
    const candidates = buildDurationResizeEndpointCandidates({
      stepStartBeats: rational(2),
      editableEnd: rational(5),
      barLengthBeats: rational(3),
      stepBoundaries: [rational(3), rational(5), rational(3)],
      durationValues: [rational(1), rational(1, 3)],
    });
    expect(new Set(candidates.map((value) => `${value.numerator}/${value.denominator}`)).size).toBe(
      candidates.length,
    );
    expect(candidates).toContainEqual(rational(3));
    expect(candidates).toContainEqual(rational(5));
  });

  it("keeps existing-duration candidates separate from the fixed lattice quantum", () => {
    const candidates = buildDurationResizeEndpointCandidates({
      stepStartBeats: rational(0),
      editableEnd: rational(2),
      barLengthBeats: rational(4),
      durationValues: [rational(1, 7)],
    });

    expect(candidates).toContainEqual(rational(1, 7));
    expect(candidates).not.toContainEqual(rational(1, 168));
  });
});
