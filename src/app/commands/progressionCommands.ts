import type { Project } from "../../domain/project/project";
import type { Progression } from "../../domain/progression/progression";
import type {
  CardViewId,
  ChordStep,
  RestStep,
  StepPerformance,
} from "../../domain/progression/step";
import { snapshotStepPerformance } from "../../domain/progression/step";
import { musicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import { rational } from "../../domain/timing/rational";
import { resetChordStepPerformance } from "../../domain/progression/reset";
import { createMatrixChordStep } from "./matrixCommands";
import { snapshotChordMelodyRecipe } from "../../domain/melody/types";
import type { AppliedCommand, ProjectCommand } from ".";

function updateProgression(project: Project, progression: Progression, nowIso: string): Project {
  return Object.freeze({ ...project, progression, updatedAt: nowIso });
}

export interface RestoreProgressionPayload {
  readonly progression: Progression;
  readonly nowIso: string;
}
export type RestoreProgressionCommand = ProjectCommand<RestoreProgressionPayload> & {
  readonly type: "progression/restore";
};
export function restoreProgression(
  project: Project,
  command: RestoreProgressionCommand,
): AppliedCommand {
  return {
    project: updateProgression(project, command.payload.progression, command.payload.nowIso),
    inverse: {
      type: "progression/restore",
      payload: { progression: project.progression, nowIso: command.payload.nowIso },
    },
  };
}

function withInverse(project: Project, progression: Progression, nowIso: string): AppliedCommand {
  return {
    project: updateProgression(project, progression, nowIso),
    forward: { type: "progression/restore", payload: { progression, nowIso } },
    inverse: { type: "progression/restore", payload: { progression: project.progression, nowIso } },
  };
}

export interface SelectStepPayload {
  readonly stepId?: string;
  readonly nowIso: string;
}
export type SelectStepCommand = ProjectCommand<SelectStepPayload> & {
  readonly type: "progression/select-step";
};
export function selectStep(project: Project, command: SelectStepCommand): AppliedCommand {
  if (
    command.payload.stepId &&
    !project.progression.steps.some((step) => step.id === command.payload.stepId)
  )
    throw new RangeError(`Unknown progression step: ${command.payload.stepId}`);
  const { selectedStepId: _old, ...rest } = project.progression;
  const progression = Object.freeze({
    ...rest,
    ...(command.payload.stepId ? { selectedStepId: command.payload.stepId } : {}),
  });
  return withInverse(project, progression, command.payload.nowIso);
}

export interface EditStepPerformancePayload {
  readonly stepId: string;
  readonly performance: Partial<StepPerformance>;
  readonly nowIso: string;
}
export type EditStepPerformanceCommand = ProjectCommand<EditStepPerformancePayload> & {
  readonly type: "progression/edit-performance";
};
export function editStepPerformance(
  project: Project,
  command: EditStepPerformanceCommand,
): AppliedCommand {
  let found = false;
  const steps = project.progression.steps.map((step) => {
    if (step.id !== command.payload.stepId) return step;
    if (step.kind !== "chord") throw new Error("Performance can only be edited on chord steps");
    found = true;
    const performance = Object.freeze({
      ...step.performance,
      ...command.payload.performance,
      bass: command.payload.performance.bass
        ? Object.freeze({ ...command.payload.performance.bass })
        : step.performance.bass,
      perNoteVelocityOverrides: command.payload.performance.perNoteVelocityOverrides
        ? Object.freeze({ ...command.payload.performance.perNoteVelocityOverrides })
        : step.performance.perNoteVelocityOverrides,
      ...(command.payload.performance.manualVoicing
        ? { manualVoicing: Object.freeze([...command.payload.performance.manualVoicing]) }
        : {}),
    });
    return Object.freeze({ ...step, performance });
  });
  if (!found) throw new RangeError(`Unknown chord step: ${command.payload.stepId}`);
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    command.payload.nowIso,
  );
}

export interface SetStepCardViewPayload {
  readonly stepId: string;
  readonly view: CardViewId;
  readonly nowIso: string;
}
export type SetStepCardViewCommand = ProjectCommand<SetStepCardViewPayload> & {
  readonly type: "progression/set-card-view";
};
export function setStepCardView(project: Project, command: SetStepCardViewCommand): AppliedCommand {
  const steps = project.progression.steps.map((step) =>
    step.id === command.payload.stepId && step.kind === "chord"
      ? Object.freeze({ ...step, cardView: command.payload.view })
      : step,
  );
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    command.payload.nowIso,
  );
}

export interface SetAllStepCardViewPayload {
  readonly view: CardViewId;
  readonly nowIso: string;
}
export type SetAllStepCardViewCommand = ProjectCommand<SetAllStepCardViewPayload> & {
  readonly type: "progression/set-all-card-view";
};
export function setAllStepCardView(
  project: Project,
  command: SetAllStepCardViewCommand,
): AppliedCommand {
  const steps = project.progression.steps.map((step) =>
    step.kind === "chord" ? Object.freeze({ ...step, cardView: command.payload.view }) : step,
  );
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    command.payload.nowIso,
  );
}

export interface ResetStepPerformancePayload {
  readonly stepId: string;
  readonly nowIso: string;
}
export type ResetStepPerformanceCommand = ProjectCommand<ResetStepPerformancePayload> & {
  readonly type: "progression/reset-performance";
};
export function resetStepPerformance(
  project: Project,
  command: ResetStepPerformanceCommand,
): AppliedCommand {
  let found = false;
  const steps = project.progression.steps.map((step) => {
    if (step.id !== command.payload.stepId) return step;
    if (step.kind !== "chord") throw new Error("Only chord steps have performance settings");
    found = true;
    return resetChordStepPerformance(step, project.defaults.piano);
  });
  if (!found) throw new RangeError(`Unknown chord step: ${command.payload.stepId}`);
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    command.payload.nowIso,
  );
}

export interface BatchEditStepPerformancePayload {
  readonly performance: Partial<StepPerformance>;
  readonly nowIso: string;
}
export type BatchEditStepPerformanceCommand = ProjectCommand<BatchEditStepPerformancePayload> & {
  readonly type: "progression/batch-edit-performance";
};
export function batchEditStepPerformance(
  project: Project,
  command: BatchEditStepPerformanceCommand,
): AppliedCommand {
  const steps = project.progression.steps.map((step) => {
    if (step.kind !== "chord") return step;
    const performance = Object.freeze({
      ...step.performance,
      ...command.payload.performance,
      bass: command.payload.performance.bass
        ? Object.freeze({ ...command.payload.performance.bass })
        : step.performance.bass,
      perNoteVelocityOverrides: command.payload.performance.perNoteVelocityOverrides
        ? Object.freeze({ ...command.payload.performance.perNoteVelocityOverrides })
        : step.performance.perNoteVelocityOverrides,
      ...(command.payload.performance.manualVoicing
        ? { manualVoicing: Object.freeze([...command.payload.performance.manualVoicing]) }
        : {}),
    });
    return Object.freeze({ ...step, performance });
  });
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    command.payload.nowIso,
  );
}

export interface BatchSetStepDurationPayload {
  readonly duration: MusicalDuration;
  readonly nowIso: string;
}
export type BatchSetStepDurationCommand = ProjectCommand<BatchSetStepDurationPayload> & {
  readonly type: "progression/batch-set-duration";
};
export function batchSetStepDuration(
  project: Project,
  command: BatchSetStepDurationCommand,
): AppliedCommand {
  const steps = project.progression.steps.map((step) =>
    Object.freeze({ ...step, duration: command.payload.duration }),
  );
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    command.payload.nowIso,
  );
}

export interface ResetAllStepPerformancePayload {
  readonly nowIso: string;
}
export type ResetAllStepPerformanceCommand = ProjectCommand<ResetAllStepPerformancePayload> & {
  readonly type: "progression/reset-all-performance";
};
export function resetAllStepPerformance(
  project: Project,
  command: ResetAllStepPerformanceCommand,
): AppliedCommand {
  const steps = project.progression.steps.map((step) => {
    if (step.kind !== "chord") return step;
    return resetChordStepPerformance(step, project.defaults.piano);
  });
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    command.payload.nowIso,
  );
}

export interface ReplaceStepPayload {
  readonly stepId: string;
  readonly functionId: string;
  readonly nowIso: string;
}
export type ReplaceStepCommand = ProjectCommand<ReplaceStepPayload> & {
  readonly type: "progression/replace-step";
};
export function replaceStep(project: Project, command: ReplaceStepCommand): AppliedCommand {
  const replacement = createMatrixChordStep(
    project,
    command.payload.functionId,
    command.payload.stepId,
  );
  let found = false;
  const steps = project.progression.steps.map((step) => {
    if (step.id !== command.payload.stepId) return step;
    if (step.kind !== "chord") throw new Error("Replace Step currently targets chord steps");
    found = true;
    const { explicitSpellingOverrides: _oldSpelling, ...withoutSpelling } = step;
    const next: ChordStep = Object.freeze({
      ...withoutSpelling,
      harmonicFunction: replacement.harmonicFunction,
      harmonicVariant: replacement.harmonicVariant,
    });
    return next;
  });
  if (!found) throw new RangeError(`Unknown chord step: ${command.payload.stepId}`);
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    command.payload.nowIso,
  );
}

export interface RemoveStepPayload {
  readonly stepId: string;
  readonly nowIso: string;
}
export type RemoveStepCommand = ProjectCommand<RemoveStepPayload> & {
  readonly type: "progression/remove-step";
};
export function removeStep(project: Project, command: RemoveStepCommand): AppliedCommand {
  if (!project.progression.steps.some((step) => step.id === command.payload.stepId))
    throw new RangeError(`Unknown progression step: ${command.payload.stepId}`);
  const steps = project.progression.steps.filter((step) => step.id !== command.payload.stepId);
  const { selectedStepId, ...rest } = project.progression;
  const progression = Object.freeze({
    ...rest,
    steps: Object.freeze(steps),
    ...(selectedStepId && selectedStepId !== command.payload.stepId ? { selectedStepId } : {}),
  });
  return withInverse(project, progression, command.payload.nowIso);
}

export interface ReorderStepPayload {
  readonly stepId: string;
  readonly targetIndex: number;
  readonly nowIso: string;
}
export type ReorderStepCommand = ProjectCommand<ReorderStepPayload> & {
  readonly type: "progression/reorder-step";
};
export function reorderStep(project: Project, command: ReorderStepCommand): AppliedCommand {
  const sourceIndex = project.progression.steps.findIndex(
    (step) => step.id === command.payload.stepId,
  );
  if (sourceIndex < 0) throw new RangeError(`Unknown progression step: ${command.payload.stepId}`);
  const target = Math.max(
    0,
    Math.min(command.payload.targetIndex, project.progression.steps.length - 1),
  );
  const steps = [...project.progression.steps];
  const [moving] = steps.splice(sourceIndex, 1);
  steps.splice(target, 0, moving!);
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    command.payload.nowIso,
  );
}

export interface AddRestStepPayload {
  readonly stepId: string;
  readonly duration?: MusicalDuration;
  readonly nowIso: string;
}
export type AddRestStepCommand = ProjectCommand<AddRestStepPayload> & {
  readonly type: "progression/add-rest";
};
export function addRestStep(project: Project, command: AddRestStepCommand): AppliedCommand {
  const restStep: RestStep = Object.freeze({
    id: command.payload.stepId,
    kind: "rest",
    duration: command.payload.duration ?? musicalDuration(rational(1, 1)),
  });
  const steps = Object.freeze([...project.progression.steps, restStep]);
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps }),
    command.payload.nowIso,
  );
}

export interface RepeatChordStepPayload {
  readonly sourceStepId: string;
  readonly stepId: string;
  readonly duration: MusicalDuration;
  readonly nowIso: string;
}

export type RepeatChordStepCommand = ProjectCommand<RepeatChordStepPayload> & {
  readonly type: "progression/repeat-chord";
};

/** Adds a new, independent copy of the final chord for an explicitly chosen duration. */
export function repeatChordStep(project: Project, command: RepeatChordStepCommand): AppliedCommand {
  const sourceIndex = project.progression.steps.findIndex(
    (step) => step.id === command.payload.sourceStepId,
  );
  if (sourceIndex === -1) {
    throw new RangeError(`Unknown source chord step: ${command.payload.sourceStepId}`);
  }
  if (sourceIndex !== project.progression.steps.length - 1) {
    throw new RangeError("Only the final progression chord can be repeated into the bar gap");
  }
  const source = project.progression.steps[sourceIndex]!;
  if (source.kind !== "chord") {
    throw new Error("Only a chord step can be repeated");
  }
  if (project.progression.steps.some((step) => step.id === command.payload.stepId)) {
    throw new RangeError(`Progression step ID already exists: ${command.payload.stepId}`);
  }

  const repeated: ChordStep = Object.freeze({
    ...source,
    id: command.payload.stepId,
    duration: command.payload.duration,
    performance: snapshotStepPerformance(source.performance),
    ...(source.melody !== undefined ? { melody: snapshotChordMelodyRecipe(source.melody) } : {}),
  });
  const steps = Object.freeze([...project.progression.steps, repeated]);
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps }),
    command.payload.nowIso,
  );
}
