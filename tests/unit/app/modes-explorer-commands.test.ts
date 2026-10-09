import { describe, expect, it } from "vitest";
import { AppStore } from "../../../src/app/appStore";
import { createMatrixChordStep } from "../../../src/app/commands/matrixCommands";
import {
  applyModesFormula,
  createModesFormulaSteps,
  type ApplyModesFormulaCommand,
} from "../../../src/app/commands/modesExplorerCommands";
import {
  getModalParentKeyAndFunction,
  CANONICAL_MODAL_FORMULAS,
} from "../../../src/domain/harmony/modes";
import type { PitchClassIdentity } from "../../../src/domain/harmony/pitch";
import { createDefaultProject } from "../../../src/domain/project/factory";
import type { Project } from "../../../src/domain/project/project";

const nowIso = "2026-09-23T00:00:00.000Z";
const dorianFormula = CANONICAL_MODAL_FORMULAS.find(
  (formula) => formula.id === "dorian-funk-vamp",
)!;

function projectWithHistory(tonic: PitchClassIdentity = 7): Project {
  const base = createDefaultProject("modes-explorer-command-test");
  const previousSteps = Object.freeze([
    createMatrixChordStep(base, "I", "previous-1", "progressions"),
    createMatrixChordStep(base, "V", "previous-2", "progressions"),
  ]);
  const progression = Object.freeze({
    ...base.progression,
    steps: previousSteps,
    selectedStepId: "previous-2",
  });
  return Object.freeze<Project>({ ...base, tonic, progression });
}

function makeCommand(
  project: Project,
  switchKey: boolean,
  modalTonic: PitchClassIdentity = 2,
): ApplyModesFormulaCommand {
  const parentTonic = getModalParentKeyAndFunction(modalTonic, dorianFormula.modeId, 1).parentTonic;
  const steps = createModesFormulaSteps(project, dorianFormula, modalTonic, [
    "formula-1",
    "formula-2",
    "formula-3",
  ]);
  return {
    type: "modes/apply-formula",
    payload: {
      formulaId: dorianFormula.id,
      modeId: dorianFormula.modeId,
      modalTonic,
      parentTonic,
      switchKey,
      steps,
      nowIso,
    },
  };
}

describe("Scales & Modes Explorer formula commands", () => {
  it("replaces the progression and parent key atomically with exact Undo and Redo", () => {
    const project = projectWithHistory(7);
    const previousProgression = project.progression;
    const store = new AppStore(project);
    const command = makeCommand(project, true);
    const formulaStepIds = command.payload.steps.map((step) => step.id);
    const expectedParent = command.payload.parentTonic;

    store.dispatch(command, applyModesFormula);

    expect(store.project.tonic).toBe(expectedParent);
    expect(store.project.progression.steps.map((step) => step.id)).toEqual(formulaStepIds);
    expect(store.project.progression.selectedStepId).toBe(formulaStepIds[0]);
    expect(store.canUndo).toBe(true);

    expect(store.undo()).toBe(true);
    expect(store.project.tonic).toBe(project.tonic);
    expect(store.project.progression).toBe(previousProgression);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(true);

    expect(store.redo()).toBe(true);
    expect(store.project.tonic).toBe(expectedParent);
    expect(store.project.progression.steps.map((step) => step.id)).toEqual(formulaStepIds);
    expect(store.canRedo).toBe(false);
  });

  it("rejects applying in a mismatched old key without changing Project or history", () => {
    const project = projectWithHistory(7);
    const store = new AppStore(project);
    const command = makeCommand(project, false);

    expect(() => store.dispatch(command, applyModesFormula)).toThrow(/parent key/i);
    expect(store.project).toBe(project);
    expect(store.canUndo).toBe(false);
    expect(store.canRedo).toBe(false);
  });

  it("allows an explicit keep-current-key choice when it matches the parent key", () => {
    const project = projectWithHistory(0);
    const store = new AppStore(project);
    const command = makeCommand(project, false);

    store.dispatch(command, applyModesFormula);

    expect(store.project.tonic).toBe(project.tonic);
    expect(store.project.progression.steps.map((step) => step.id)).toEqual([
      "formula-1",
      "formula-2",
      "formula-3",
    ]);
  });

  it("keeps Blues dominant I7/IV7/V7 local while materializing canonical I/IV/V steps", () => {
    const project = projectWithHistory(0);
    const formula = CANONICAL_MODAL_FORMULAS.find((item) => item.id === "blues-quick-change")!;
    const steps = createModesFormulaSteps(
      project,
      formula,
      0,
      formula.steps.map((_, index) => `blues-${index}`),
    );

    expect(steps.map((step) => step.harmonicFunction.functionId)).toEqual([
      "I",
      "IV",
      "I",
      "V",
      "IV",
      "I",
    ]);
    expect(steps.map((step) => step.harmonicVariant.seventh)).toEqual([
      "minor7",
      "minor7",
      "minor7",
      "minor7",
      "minor7",
      "minor7",
    ]);
  });
});
