import { describe, expect, it } from "vitest";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  repeatChordStep,
  type RepeatChordStepCommand,
} from "../../../src/app/commands/progressionCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";
import { musicalDuration } from "../../../src/domain/timing/duration";
import { rational } from "../../../src/domain/timing/rational";

describe("measure gap progression commands", () => {
  it("repeats the final chord as an independent step", () => {
    const base = createDefaultProject("gap-command");
    const source = createMatrixChordStep(base, "I", "source");
    const project = Object.freeze({
      ...base,
      progression: Object.freeze({ steps: Object.freeze([source]) }),
    });
    const command: RepeatChordStepCommand = {
      type: "progression/repeat-chord",
      payload: {
        sourceStepId: "source",
        stepId: "repeat",
        duration: musicalDuration(rational(2)),
        nowIso: "2026-09-09T00:00:00.000Z",
      },
    };
    const applied = repeatChordStep(project, command);
    const repeated = applied.project.progression.steps[1]!;
    expect(repeated).toMatchObject({
      id: "repeat",
      kind: "chord",
      duration: musicalDuration(rational(2)),
    });
    expect(repeated).not.toBe(source);
    expect(repeated.performance).not.toBe(source.performance);
    expect(applied.inverse).toMatchObject({ type: "progression/restore" });
  });

  it("rejects repeating a non-final or rest step", () => {
    const base = createDefaultProject("gap-command-invalid");
    const first = createMatrixChordStep(base, "I", "first");
    const final = createMatrixChordStep(base, "V", "final");
    const project = Object.freeze({
      ...base,
      progression: Object.freeze({ steps: Object.freeze([first, final]) }),
    });
    const command: RepeatChordStepCommand = {
      type: "progression/repeat-chord",
      payload: {
        sourceStepId: "first",
        stepId: "repeat",
        duration: musicalDuration(rational(2)),
        nowIso: "2026-09-09T00:00:00.000Z",
      },
    };
    expect(() => repeatChordStep(project, command)).toThrow(/final progression chord/);
  });
});
