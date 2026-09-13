import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  duplicateSteps,
  restoreProgression,
  type DuplicateStepsCommand,
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
        bass: { pitch: { spelling: { letter: "C", accidental: "natural" }, octave: 2 }, enabled: true },
        perNoteVelocityOverrides: { "C4": 110 },
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
    expect(duplicated1.performance.perNoteVelocityOverrides).toEqual(chord1.performance.perNoteVelocityOverrides);
    expect(duplicated1.performance.perNoteVelocityOverrides).not.toBe(chord1.performance.perNoteVelocityOverrides);

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
      melody: {
        pattern: "up",
        grid: "eighth",
        octaveOffset: 1,
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
    const layout = createProgressionMeasureLayout(project.progression.steps, project.globalTiming.meter);
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
    const updatedLayout = createProgressionMeasureLayout(updated.progression.steps, updated.globalTiming.meter);
    const updatedProjection = projectScoreSystems(updatedLayout, {
      availableWidthPx: 960,
      measuresPerSystem: 2,
    });

    expect(updatedProjection.systems).toHaveLength(3);
    expect(updatedProjection.systems[2]!.measures).toHaveLength(2);
  });
});
