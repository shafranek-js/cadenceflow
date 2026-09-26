import type {
  ModalCadenceFormula,
  ModalFormulaStep,
  ExtendedScaleId,
} from "../../domain/harmony/modes";
import { getModalParentKeyAndFunction } from "../../domain/harmony/modes";
import type { PitchClassIdentity } from "../../domain/harmony/pitch";
import type { Project } from "../../domain/project/project";
import type { ChordStep } from "../../domain/progression/step";
import { createMatrixChordStep } from "./matrixCommands";
import type { AppliedCommand, ProjectCommand } from ".";

export interface ApplyModesFormulaPayload {
  readonly formulaId: string;
  readonly modeId: ExtendedScaleId;
  readonly modalTonic: PitchClassIdentity;
  readonly parentTonic: PitchClassIdentity;
  readonly switchKey: boolean;
  readonly steps: readonly ChordStep[];
  readonly nowIso: string;
}

export type ApplyModesFormulaCommand = ProjectCommand<ApplyModesFormulaPayload> & {
  readonly type: "modes/apply-formula";
};

export interface RestoreModesFormulaStatePayload {
  readonly tonic: PitchClassIdentity;
  readonly progression: Project["progression"];
  readonly nowIso: string;
}

export type RestoreModesFormulaStateCommand = ProjectCommand<RestoreModesFormulaStatePayload> & {
  readonly type: "modes/restore-formula-state";
};

function formulaSeventh(step: ModalFormulaStep): ModalFormulaStep["seventh"] {
  if (step.seventh) return step.seventh;
  return step.symbol.endsWith("7") ? "minor7" : undefined;
}

/**
 * Turns Explorer-local modal formula symbols into the existing functional
 * steps. In particular, Blues I7/IV7/V7 stays local to the Explorer and is
 * materialized as the existing I/IV/V functions with a minor seventh.
 */
export function createModesFormulaSteps(
  project: Project,
  formula: ModalCadenceFormula,
  modalTonic: PitchClassIdentity,
  stepIds: readonly string[],
): readonly ChordStep[] {
  if (stepIds.length !== formula.steps.length) {
    throw new RangeError("A stable step ID is required for every formula step");
  }
  if (new Set(stepIds).size !== stepIds.length || stepIds.some((stepId) => !stepId.trim())) {
    throw new RangeError("Formula step IDs must be non-empty and unique");
  }

  return Object.freeze(
    formula.steps.map((formulaStep, index) => {
      const { functionId, moduleId } = getModalParentKeyAndFunction(
        modalTonic,
        formula.modeId,
        formulaStep.degree,
      );
      const step = createMatrixChordStep(project, functionId, stepIds[index]!, moduleId);
      const seventh = formulaSeventh(formulaStep);
      return seventh
        ? Object.freeze({
            ...step,
            harmonicVariant: Object.freeze({ ...step.harmonicVariant, seventh }),
          })
        : step;
    }),
  );
}

export function applyModesFormula(
  project: Project,
  command: ApplyModesFormulaCommand,
): AppliedCommand {
  const expectedParentTonic = getModalParentKeyAndFunction(
    command.payload.modalTonic,
    command.payload.modeId,
    1,
  ).parentTonic;
  if (command.payload.parentTonic !== expectedParentTonic) {
    throw new Error("The selected parent key does not match this modal formula");
  }
  if (!command.payload.switchKey && project.tonic !== expectedParentTonic) {
    throw new Error(
      `Cannot apply this formula in the current key: its parent key is pitch class ${expectedParentTonic}, but the project uses pitch class ${project.tonic}. Choose the switch-key option to apply it.`,
    );
  }

  const stepIds = command.payload.steps.map((step) => step.id);
  if (
    command.payload.steps.length === 0 ||
    stepIds.some((stepId) => !stepId.trim()) ||
    new Set(stepIds).size !== stepIds.length
  ) {
    throw new RangeError("A formula must contain steps with stable, unique IDs");
  }

  const steps = Object.freeze([...command.payload.steps]);
  const progression: Project["progression"] = Object.freeze({
    steps,
    selectedStepId: steps[0]!.id,
  });
  const appliedCommand: ApplyModesFormulaCommand = {
    type: "modes/apply-formula",
    payload: { ...command.payload, steps },
  };

  return {
    project: Object.freeze({
      ...project,
      tonic: command.payload.switchKey ? expectedParentTonic : project.tonic,
      progression,
      updatedAt: command.payload.nowIso,
    }),
    forward: appliedCommand,
    inverse: {
      type: "modes/restore-formula-state",
      payload: {
        tonic: project.tonic,
        progression: project.progression,
        nowIso: command.payload.nowIso,
      },
    },
  };
}

export function restoreModesFormulaState(
  project: Project,
  command: RestoreModesFormulaStateCommand,
): AppliedCommand {
  return {
    project: Object.freeze({
      ...project,
      tonic: command.payload.tonic,
      progression: command.payload.progression,
      updatedAt: command.payload.nowIso,
    }),
    inverse: {
      type: "modes/restore-formula-state",
      payload: {
        tonic: project.tonic,
        progression: project.progression,
        nowIso: command.payload.nowIso,
      },
    },
  };
}
