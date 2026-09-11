import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  batchEditStepPerformance,
  batchSetStepDuration,
  resetAllStepPerformance,
  restoreProgression,
  type RestoreProgressionCommand,
} from "../../../src/app/commands/progressionCommands";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";
import type { Project } from "../../../src/domain/project/project";
import type { ChordStep } from "../../../src/domain/progression/step";

const T0 = "2026-09-11T12:00:00.000Z";
const T1 = "2026-09-11T12:00:01.000Z";

function withSteps(project: Project, steps: readonly ChordStep[]): Project {
  return Object.freeze({
    ...project,
    progression: Object.freeze({ ...project.progression, steps: Object.freeze([...steps]) }),
  });
}

describe("Batch progression commands", () => {
  it("batchEditStepPerformance updates all chord steps with inverse undo", () => {
    const project = createDefaultProject("p", "Batch Test", T0);
    const step1 = createMatrixChordStep(project, "I", "step-1");
    const step2 = createMatrixChordStep(project, "IV", "step-2");
    const step3 = createMatrixChordStep(project, "V", "step-3");
    const initial = withSteps(project, [step1, step2, step3]);

    const result = batchEditStepPerformance(initial, {
      type: "progression/batch-edit-performance",
      payload: {
        performance: { articulation: "arp-down", register: 1, masterVelocity: 95 },
        nowIso: T1,
      },
    });

    const updatedSteps = result.project.progression.steps as readonly ChordStep[];
    expect(updatedSteps).toHaveLength(3);
    for (const step of updatedSteps) {
      expect(step.performance.articulation).toBe("arp-down");
      expect(step.performance.register).toBe(1);
      expect(step.performance.masterVelocity).toBe(95);
    }

    // Check inverse
    expect(result.inverse.type).toBe("progression/restore");
    const reverted = restoreProgression(
      result.project,
      result.inverse as RestoreProgressionCommand,
    ).project;
    const revertedSteps = reverted.progression.steps as readonly ChordStep[];
    expect(revertedSteps[0]!.performance.articulation).toBe(step1.performance.articulation);
    expect(revertedSteps[0]!.performance.register).toBe(step1.performance.register);
  });

  it("batchSetStepDuration updates all progression step durations with undo", () => {
    const project = createDefaultProject("p", "Batch Test", T0);
    const step1 = createMatrixChordStep(project, "I", "step-1");
    const step2 = createMatrixChordStep(project, "V", "step-2");
    const initial = withSteps(project, [step1, step2]);

    const newDuration = musicalDuration(rational(2, 1));
    const result = batchSetStepDuration(initial, {
      type: "progression/batch-set-duration",
      payload: {
        duration: newDuration,
        nowIso: T1,
      },
    });

    expect(result.project.progression.steps[0]!.duration).toEqual(newDuration);
    expect(result.project.progression.steps[1]!.duration).toEqual(newDuration);

    const reverted = restoreProgression(
      result.project,
      result.inverse as RestoreProgressionCommand,
    ).project;
    expect(reverted.progression.steps[0]!.duration).toEqual(step1.duration);
  });

  it("resetAllStepPerformance restores piano defaults across all chord steps", () => {
    const project = createDefaultProject("p", "Batch Test", T0);
    const step1 = createMatrixChordStep(project, "I", "step-1");
    const step2 = createMatrixChordStep(project, "V", "step-2");
    let populated = withSteps(project, [step1, step2]);

    populated = batchEditStepPerformance(populated, {
      type: "progression/batch-edit-performance",
      payload: {
        performance: { articulation: "arp-up", register: -1, masterVelocity: 40 },
        nowIso: T1,
      },
    }).project;

    const resetResult = resetAllStepPerformance(populated, {
      type: "progression/reset-all-performance",
      payload: { nowIso: T1 },
    });

    const resetSteps = resetResult.project.progression.steps as readonly ChordStep[];
    expect(resetSteps[0]!.performance.articulation).toBe("humanized");
    expect(resetSteps[0]!.performance.register).toBe("auto");
    expect(resetSteps[0]!.performance.masterVelocity).toBe(80);
    expect(resetSteps[1]!.performance.articulation).toBe("humanized");

    // Undo restore
    const reverted = restoreProgression(
      resetResult.project,
      resetResult.inverse as RestoreProgressionCommand,
    ).project;
    expect((reverted.progression.steps[0] as ChordStep).performance.articulation).toBe("arp-up");
  });
});
