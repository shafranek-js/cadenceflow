import { exactPitch } from "../../../src/domain/harmony/pitch";
import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  duplicateSteps,
  removeSteps,
  restoreProgression,
  type DuplicateStepsCommand,
  type RemoveStepsCommand,
  type RestoreProgressionCommand,
} from "../../../src/app/commands/progressionCommands";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import type { ChordStep, RestStep } from "../../../src/domain/progression/step";
import { createProgressionMeasureLayout } from "../../../src/domain/timing/measureLayout";
import { projectScoreSystems } from "../../../src/notation/scoreSystemProjection";

const T0 = "2026-09-04T12:00:00.000Z";
const T1 = "2026-09-04T12:00:01.000Z";

describe("duplicateSteps command", () => {
  it("deep clones chord steps with independent performance and generates new IDs", () => {
    let project = createDefaultProject("p", "DuplicateTest", T0);
    const baseChord1 = createMatrixChordStep(project, "I", "step-1");
    const chord1: ChordStep = {
      ...baseChord1,
      performance: {
        ...baseChord1.performance,
        bass: {
          choice: "custom",
          octaveOffset: "auto",
          customPitch: exactPitch(36, { step: "C", alter: 0 }),
        },
        perNoteVelocityOverrides: { C4: 110 },
      },
    };
    const chord2 = createMatrixChordStep(project, "IV", "step-2");

    project = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze([chord1, chord2]),
      }),
    });

    const command: DuplicateStepsCommand = {
      type: "progression/duplicate-steps",
      payload: {
        steps: [chord1, chord2],
        nowIso: T1,
      },
    };

    const applied = duplicateSteps(project, command);
    const updated = applied.project;

    expect(updated.progression.steps).toHaveLength(4);
    const duplicated1 = updated.progression.steps[2] as ChordStep;
    const duplicated2 = updated.progression.steps[3] as ChordStep;

    expect(duplicated1.id).not.toBe(chord1.id);
    expect(duplicated2.id).not.toBe(chord2.id);
    expect(duplicated1.harmonicFunction.functionId).toBe("I");
    expect(duplicated2.harmonicFunction.functionId).toBe("IV");

    // Independent snapshot
    expect(duplicated1.performance).not.toBe(chord1.performance);
    expect(duplicated1.performance.bass).toEqual(chord1.performance.bass);
    expect(duplicated1.performance.bass).not.toBe(chord1.performance.bass);
    expect(duplicated1.performance.perNoteVelocityOverrides).toEqual(
      chord1.performance.perNoteVelocityOverrides,
    );
    expect(duplicated1.performance.perNoteVelocityOverrides).not.toBe(
      chord1.performance.perNoteVelocityOverrides,
    );

    // Inverse restores previous steps
    const inverse = applied.inverse as RestoreProgressionCommand;
    const reverted = restoreProgression(updated, inverse).project;
    expect(reverted.progression.steps).toHaveLength(2);
    expect(reverted.progression.steps[0]?.id).toBe("step-1");
    expect(reverted.progression.steps[1]?.id).toBe("step-2");
  });

  it("handles rest steps and melody recipes correctly", () => {
    let project = createDefaultProject("p", "RestMelodyTest", T0);
    const chord: ChordStep = {
      ...createMatrixChordStep(project, "V", "chord-1"),
      // `ChordStep.melody` is a `ChordMelody`, i.e. `{ mode: "generated" as const, recipe }`; a bare recipe
      // is not a valid value. Passing one made `cloneStepMelody` read `.phrase` off it and throw.
      melody: {
        mode: "generated" as const,
        recipe: {
          pitchMotion: "up",
          rhythm: "even",
          connection: "retrigger",
          grid: "eighth",
          octaveOffset: 1,
        },
      },
    };
    const rest: RestStep = {
      id: "rest-1",
      kind: "rest",
      duration: musicalDuration(rational(2, 1)),
    };

    project = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze([chord, rest]),
      }),
    });

    const command: DuplicateStepsCommand = {
      type: "progression/duplicate-steps",
      payload: {
        steps: [chord, rest],
        newStepIds: ["new-chord", "new-rest"],
        nowIso: T1,
      },
    };

    const applied = duplicateSteps(project, command);
    const updated = applied.project;

    expect(updated.progression.steps).toHaveLength(4);
    const clonedChord = updated.progression.steps[2] as ChordStep;
    const clonedRest = updated.progression.steps[3] as RestStep;

    expect(clonedChord.id).toBe("new-chord");
    expect(clonedChord.kind).toBe("chord");
    expect(clonedChord.melody).not.toBe(chord.melody);
    expect(clonedChord.melody).toEqual(chord.melody);

    expect(clonedRest.id).toBe("new-rest");
    expect(clonedRest.kind).toBe("rest");
    expect(clonedRest.duration).toEqual(rest.duration);
  });

  it("duplicates steps from a ScoreSystem and appends as a new system", () => {
    let project = createDefaultProject("p", "ScoreSystemTest", T0);
    // Add 4 bars of chords (each bar is 4 beats in 4/4)
    const chords = [
      createMatrixChordStep(project, "I", "c1"),
      createMatrixChordStep(project, "IV", "c2"),
      createMatrixChordStep(project, "V", "c3"),
      createMatrixChordStep(project, "I", "c4"),
    ];

    project = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze(chords),
      }),
    });

    // Layout with 2 measures per system
    const layout = createProgressionMeasureLayout(
      project.progression.steps,
      project.globalTiming.meter,
    );
    const projection = projectScoreSystems(layout, {
      availableWidthPx: 960,
      measuresPerSystem: 2,
    });

    expect(projection.systems).toHaveLength(2);
    const system0 = projection.systems[0]!;
    expect(system0.measures).toHaveLength(2);

    // Extract steps from system 0
    const stepIndices = new Set<number>();
    for (const sm of system0.measures) {
      for (const frag of sm.measure.fragments) {
        stepIndices.add(frag.stepIndex);
      }
    }
    const stepsToDuplicate = Array.from(stepIndices)
      .sort((a, b) => a - b)
      .map((idx) => project.progression.steps[idx]!);

    expect(stepsToDuplicate.map((s) => s.id)).toEqual(["c1", "c2"]);

    // Duplicate system 0
    const command: DuplicateStepsCommand = {
      type: "progression/duplicate-steps",
      payload: { steps: stepsToDuplicate, nowIso: T1 },
    };
    const applied = duplicateSteps(project, command);
    const updated = applied.project;

    expect(updated.progression.steps).toHaveLength(6);

    // Verify new layout has 3 systems
    const updatedLayout = createProgressionMeasureLayout(
      updated.progression.steps,
      updated.globalTiming.meter,
    );
    const updatedProjection = projectScoreSystems(updatedLayout, {
      availableWidthPx: 960,
      measuresPerSystem: 2,
    });

    expect(updatedProjection.systems).toHaveLength(3);
    expect(updatedProjection.systems[2]!.measures).toHaveLength(2);
  });

  it("removes steps and clears selection if selected step was deleted", () => {
    let project = createDefaultProject("p", "DeleteStepsTest", T0);
    const chords = [
      createMatrixChordStep(project, "I", "c1"),
      createMatrixChordStep(project, "IV", "c2"),
      createMatrixChordStep(project, "V", "c3"),
    ];
    project = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze(chords),
        selectedStepId: "c2",
      }),
    });

    const command: RemoveStepsCommand = {
      type: "progression/remove-steps",
      payload: { stepIds: ["c1", "c2"], nowIso: T1 },
    };
    const applied = removeSteps(project, command);
    const updated = applied.project;

    expect(updated.progression.steps).toHaveLength(1);
    expect(updated.progression.steps[0]!.id).toBe("c3");
    expect(updated.progression.selectedStepId).toBeUndefined();

    // Test Undo
    const inverse = applied.inverse as RestoreProgressionCommand;
    const reverted = restoreProgression(updated, inverse).project;
    expect(reverted.progression.steps).toHaveLength(3);
    expect(reverted.progression.selectedStepId).toBe("c2");
  });

  it("deletes all steps of a ScoreSystem reflowing remaining systems", () => {
    let project = createDefaultProject("p", "DeleteSystemTest", T0);
    const chords = [
      createMatrixChordStep(project, "I", "c1"),
      createMatrixChordStep(project, "IV", "c2"),
      createMatrixChordStep(project, "V", "c3"),
      createMatrixChordStep(project, "I", "c4"),
    ];
    project = Object.freeze({
      ...project,
      progression: Object.freeze({
        ...project.progression,
        steps: Object.freeze(chords),
      }),
    });

    // 2 measures per system = 2 systems
    const layout = createProgressionMeasureLayout(
      project.progression.steps,
      project.globalTiming.meter,
    );
    const projection = projectScoreSystems(layout, {
      availableWidthPx: 960,
      measuresPerSystem: 2,
    });
    expect(projection.systems).toHaveLength(2);

    // Delete System 0
    const system0 = projection.systems[0]!;
    const stepIndices = new Set<number>();
    for (const sm of system0.measures) {
      for (const frag of sm.measure.fragments) {
        stepIndices.add(frag.stepIndex);
      }
    }
    const stepIdsToRemove = Array.from(stepIndices).map(
      (idx) => project.progression.steps[idx]!.id,
    );
    expect(stepIdsToRemove).toEqual(["c1", "c2"]);

    const command: RemoveStepsCommand = {
      type: "progression/remove-steps",
      payload: { stepIds: stepIdsToRemove, nowIso: T1 },
    };
    const applied = removeSteps(project, command);
    const updated = applied.project;

    expect(updated.progression.steps).toHaveLength(2);
    expect(updated.progression.steps.map((s) => s.id)).toEqual(["c3", "c4"]);

    const updatedLayout = createProgressionMeasureLayout(
      updated.progression.steps,
      updated.globalTiming.meter,
    );
    const updatedProjection = projectScoreSystems(updatedLayout, {
      availableWidthPx: 960,
      measuresPerSystem: 2,
    });
    expect(updatedProjection.systems).toHaveLength(1);
    expect(updatedProjection.systems[0]!.measures).toHaveLength(2);
  });
});
