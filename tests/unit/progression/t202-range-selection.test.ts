import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  batchEditStepPerformance,
  batchPatchSteps,
  removeProgressionRange,
  removeSteps,
  reorderSteps,
  restoreProgression,
  type RestoreProgressionCommand,
} from "../../../src/app/commands/progressionCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { ChordStep } from "../../../src/domain/progression/step";
import type { Project } from "../../../src/domain/project/project";
import { addRational, rational } from "../../../src/domain/timing/rational";
import {
  EMPTY_RANGE_SELECTION,
  reduceRangeSelection,
} from "../../../src/ui/progression/rangeSelection";

const T0 = "2026-09-29T12:00:00.000Z";
const T1 = "2026-09-29T12:00:01.000Z";

function withSteps(project: Project, steps: readonly ChordStep[]): Project {
  return Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze([...steps]) }),
  });
}

function fixture(): Project {
  const project = createDefaultProject("t202", "T202", T0);
  return withSteps(project, [
    createMatrixChordStep(project, "I", "step-a"),
    createMatrixChordStep(project, "IV", "step-b"),
    createMatrixChordStep(project, "V", "step-c"),
    createMatrixChordStep(project, "I", "step-d"),
  ]);
}

describe("T202 range selection", () => {
  it("stores a contiguous range by stable IDs and extends from its anchor", () => {
    const ordered = ["step-a", "step-b", "step-c", "step-d"];
    const clicked = reduceRangeSelection(
      EMPTY_RANGE_SELECTION,
      { type: "click", stepId: "step-b" },
      ordered,
    );
    const extended = reduceRangeSelection(clicked, { type: "extend", stepId: "step-d" }, ordered);

    expect(extended).toMatchObject({ anchorId: "step-b", focusId: "step-d" });
    expect(extended.stepIds).toEqual(["step-b", "step-c", "step-d"]);
  });

  it("recomputes range order from IDs after reorder, never from saved indexes", () => {
    const selected = reduceRangeSelection(
      EMPTY_RANGE_SELECTION,
      { type: "marquee", stepIds: ["step-b", "step-c"] },
      ["step-a", "step-b", "step-c", "step-d"],
    );
    const synced = reduceRangeSelection(
      selected,
      { type: "sync", orderedStepIds: ["step-a", "step-c", "step-b", "step-d"] },
      ["step-a", "step-c", "step-b", "step-d"],
    );

    expect(synced.stepIds).toEqual(["step-c", "step-b"]);
    expect(synced.stepIds).not.toEqual(["step-b", "step-c"]);
  });

  it("marquee selection resolves only current IDs in progression order", () => {
    const selected = reduceRangeSelection(
      EMPTY_RANGE_SELECTION,
      { type: "marquee", stepIds: ["step-d", "missing", "step-b"] },
      ["step-a", "step-b", "step-c", "step-d"],
    );
    expect(selected.stepIds).toEqual(["step-b", "step-c", "step-d"]);
    expect(selected.stepIds).not.toContain("missing");
  });
});

describe("T202 targeted atomic commands", () => {
  it("changes only addressed IDs and records one AppStore history entry", () => {
    const initial = fixture();
    const store = new AppStore(initial);
    store.dispatch(
      {
        type: "progression/batch-edit-performance",
        payload: {
          stepIds: ["step-a", "step-c"],
          performance: { masterVelocity: 42 },
          nowIso: T1,
        },
      },
      batchEditStepPerformance,
    );

    expect(store.history.undoDepth).toBe(1);
    expect(
      store.project.progression.steps.map((step) =>
        step.kind === "chord" ? step.performance.masterVelocity : null,
      ),
    ).toEqual([42, 80, 42, 80]);
    expect(store.undo()).toBe(true);
    expect(
      store.project.progression.steps.map((step) =>
        step.kind === "chord" ? step.performance.masterVelocity : null,
      ),
    ).toEqual([80, 80, 80, 80]);
  });

  it("applies one targeted patch and restores it as one transaction", () => {
    const initial = fixture();
    const result = batchPatchSteps(initial, {
      type: "progression/batch-patch-steps",
      payload: {
        updates: [{ stepId: "step-b", patch: { performance: { masterVelocity: 55 } } }],
        nowIso: T1,
      },
    });
    expect(result.project.progression.steps[1]!.performance.masterVelocity).toBe(55);
    expect(result.project.progression.steps[0]!.performance.masterVelocity).toBe(80);
    expect(
      restoreProgression(result.project, result.inverse as RestoreProgressionCommand).project
        .progression,
    ).toEqual(initial.progression);
  });

  it("removes addressed IDs and preserves the remaining stable identity order", () => {
    const initial = fixture();
    const result = removeSteps(initial, {
      type: "progression/remove-steps",
      payload: { stepIds: ["step-b", "step-c"], nowIso: T1 },
    });
    expect(result.project.progression.steps.map((step) => step.id)).toEqual(["step-a", "step-d"]);
  });

  it("clears selected Harmony to exact Rest intervals in one history entry", () => {
    const base = fixture();
    const initial: Project = Object.freeze({
      ...base,
      progression: Object.freeze({
        ...base.progression,
        sections: Object.freeze([
          Object.freeze({ id: "verse", name: "Verse", startStepId: "step-b" }),
          Object.freeze({ id: "chorus", name: "Chorus", startStepId: "step-d" }),
        ]),
      }),
    });
    const originalSteps = initial.progression.steps;
    const originalStart = (stepId: string) => {
      let start = rational(0);
      for (const step of originalSteps) {
        if (step.id === stepId) return start;
        start = addRational(start, step.duration.beats);
      }
      throw new Error(`Unknown Step ${stepId}`);
    };
    const store = new AppStore(initial);
    const command = {
      type: "progression/remove-range-harmony" as const,
      payload: { stepIds: ["step-b", "step-c"], nowIso: T1 },
    };
    store.dispatch(command, removeProgressionRange);
    expect(store.project.progression.steps.map((step) => step.id)).toEqual(
      originalSteps.map((step) => step.id),
    );
    for (const stepId of ["step-b", "step-c"]) {
      const before = originalSteps.find((step) => step.id === stepId)!;
      const after = store.project.progression.steps.find((step) => step.id === stepId)!;
      expect(after.kind).toBe("rest");
      expect(after.id).toBe(before.id);
      expect(after.duration).toEqual(before.duration);
    }
    let updatedStart = rational(0);
    for (const step of store.project.progression.steps) {
      if (step.id === "step-d") break;
      updatedStart = addRational(updatedStart, step.duration.beats);
    }
    expect(updatedStart).toEqual(originalStart("step-d"));
    expect(store.project.progression.sections).toEqual(initial.progression.sections);
    expect(store.history.undoDepth).toBe(1);
    store.dispatch(command, removeProgressionRange);
    expect(store.history.undoDepth).toBe(1);
    expect(store.undo()).toBe(true);
    expect(store.project.progression).toEqual(initial.progression);
    expect(store.redo()).toBe(true);
    expect(store.project.progression.steps.map((step) => step.kind)).toEqual([
      "chord",
      "rest",
      "rest",
      "chord",
    ]);
  });

  it("accepts a reordered stable-ID sequence without turning selection into indexes", () => {
    const initial = fixture();
    const result = reorderSteps(initial, {
      type: "progression/reorder-steps",
      payload: {
        steps: [
          initial.progression.steps[0]!,
          initial.progression.steps[2]!,
          initial.progression.steps[1]!,
          initial.progression.steps[3]!,
        ],
        nowIso: T1,
      },
    });
    expect(result.project.progression.steps.map((step) => step.id)).toEqual([
      "step-a",
      "step-c",
      "step-b",
      "step-d",
    ]);
  });
});
