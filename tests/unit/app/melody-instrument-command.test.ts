import { describe, expect, it } from "vitest";
import { addMatrixPreview } from "../../../src/app/commands/matrixCommands";
import { applyInverseCommand } from "../../../src/app/commands/dispatcher";
import {
  createSetMelodyRecipeCommand,
  createSetMelodyInstrumentOverrideCommand,
  setMelodyRecipe,
  setMelodyInstrumentOverride,
} from "../../../src/app/commands/melodyCommands";
import { createDefaultProject } from "../../../src/domain/project/factory";

const NOW = "2026-09-14T12:00:00.000Z";

function createChordProject() {
  return addMatrixPreview(createDefaultProject("t188-command", "T188", NOW), {
    type: "matrix/add-preview",
    payload: { functionId: "I", stepId: "step-1", nowIso: NOW },
  }).project;
}

const RECIPE = {
  pitchMotion: "up" as const,
  rhythm: "even" as const,
  connection: "retrigger" as const,
  grid: "eighth" as const,
  octaveOffset: 0 as const,
};

describe("T188 Step-local Melody instrument command", () => {
  it("changes only the selected Step and restores inheritance through undo", () => {
    const initial = setMelodyRecipe(
      createChordProject(),
      createSetMelodyRecipeCommand("step-1", RECIPE, NOW),
    ).project;
    const command = createSetMelodyInstrumentOverrideCommand("step-1", "cello", NOW);
    const applied = setMelodyInstrumentOverride(initial, command);
    expect(applied.project.melodyTrack.instrument).toBe("flute");
    expect(applied.project.progression.steps[0]).toHaveProperty(
      "melodyInstrumentOverride",
      "cello",
    );
    expect(applyInverseCommand(applied.project, applied.inverse)).toEqual(initial);

    const inherited = setMelodyInstrumentOverride(
      applied.project,
      createSetMelodyInstrumentOverrideCommand("step-1", null, "2026-09-14T12:01:00.000Z"),
    );
    expect(inherited.project.progression.steps[0]).not.toHaveProperty("melodyInstrumentOverride");
  });
});
