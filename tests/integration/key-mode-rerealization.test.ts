import { describe, expect, it } from "vitest";
import { createDefaultProject } from "../../src/domain/project/factory";
import { addMatrixPreview } from "../../src/app/commands/matrixCommands";
import { setTonic, switchModule } from "../../src/app/commands/harmonyContextCommands";

function addStep(project: ReturnType<typeof createDefaultProject>, functionId: string) {
  return addMatrixPreview(project, {
    type: "matrix/add-preview",
    payload: { functionId, stepId: `step-${functionId}`, nowIso: "2026-09-04T12:00:01.000Z" },
  }).project;
}

describe("key/module re-realization", () => {
  it("preserves step-local performance data across tonic and unambiguous module changes", () => {
    let project = addStep(createDefaultProject("p", "test", "2026-09-04T12:00:00.000Z"), "V");
    const original = project.progression.steps[0];
    if (!original || original.kind !== "chord") throw new Error("expected chord step");
    const performance = original.performance;

    project = setTonic(project, {
      type: "harmony/set-tonic",
      payload: { tonic: 2, nowIso: "2026-09-04T12:00:02.000Z" },
    }).project;
    project = switchModule(project, {
      type: "harmony/switch-module",
      payload: {
        destinationModule: "dark-harmony",
        resolutions: {},
        nowIso: "2026-09-04T12:00:03.000Z",
      },
    }).project;

    const changed = project.progression.steps[0];
    if (!changed || changed.kind !== "chord") throw new Error("expected chord step");
    expect(changed.harmonicFunction.functionId).toBe("V");
    expect(changed.performance).toBe(performance);
    expect(changed.duration).toBe(original.duration);
  });
});
