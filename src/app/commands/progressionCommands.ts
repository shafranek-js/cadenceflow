import type { Project } from "../../domain/project/project";
import type { Progression } from "../../domain/progression/progression";
import type {
  CardViewId,
  ChordStep,
  ProgressionStep,
  RestStep,
  StepPerformance,
} from "../../domain/progression/step";
import { snapshotStepPerformance } from "../../domain/progression/step";
import { musicalDuration, type MusicalDuration } from "../../domain/timing/duration";
import { rational } from "../../domain/timing/rational";
import { resetChordStepPerformance } from "../../domain/progression/reset";
import { createMatrixChordStep } from "./matrixCommands";
import { snapshotChordMelodyRecipe, type ChordMelodyRecipe } from "../../domain/melody/types";
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

export interface RemoveStepsPayload {
  readonly stepIds: readonly string[];
  readonly nowIso: string;
}
export type RemoveStepsCommand = ProjectCommand<RemoveStepsPayload> & {
  readonly type: "progression/remove-steps";
};
/** Removes a set of steps from progression (e.g. when deleting a Score System). */
export function removeSteps(project: Project, command: RemoveStepsCommand): AppliedCommand {
  const idsToRemove = new Set(command.payload.stepIds);
  const steps = project.progression.steps.filter((step) => !idsToRemove.has(step.id));
  const { selectedStepId, ...rest } = project.progression;
  const progression = Object.freeze({
    ...rest,
    steps: Object.freeze(steps),
    ...(selectedStepId && !idsToRemove.has(selectedStepId) ? { selectedStepId } : {}),
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

export interface DuplicateStepsPayload {
  readonly steps: readonly ProgressionStep[];
  readonly newStepIds?: readonly string[];
  readonly nowIso: string;
}

export type DuplicateStepsCommand = ProjectCommand<DuplicateStepsPayload> & {
  readonly type: "progression/duplicate-steps";
};

/** Clones an arbitrary list of steps (e.g. from a Score System) and appends them to the end of My Progression. */
export function duplicateSteps(project: Project, command: DuplicateStepsCommand): AppliedCommand {
  const newStepIds = command.payload.newStepIds;
  const newSteps = command.payload.steps.map((source, index) => {
    const id = newStepIds?.[index] ?? crypto.randomUUID();
    if (source.kind === "rest") {
      const rest: RestStep = Object.freeze({
        ...source,
        id,
      });
      return rest;
    }
    const chord: ChordStep = Object.freeze({
      ...source,
      id,
      performance: snapshotStepPerformance(source.performance),
      ...(source.melody !== undefined ? { melody: snapshotChordMelodyRecipe(source.melody) } : {}),
      ...(source.explicitSpellingOverrides
        ? { explicitSpellingOverrides: Object.freeze({ ...source.explicitSpellingOverrides }) }
        : {}),
    });
    return chord;
  });

  const steps = Object.freeze([...project.progression.steps, ...newSteps]);
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps }),
    command.payload.nowIso,
  );
}

export interface ReorderStepsPayload {
  readonly steps: readonly ProgressionStep[];
  readonly nowIso: string;
}
export type ReorderStepsCommand = ProjectCommand<ReorderStepsPayload> & {
  readonly type: "progression/reorder-steps";
};
/** Replaces the full step order in My Progression with a reordered sequence. */
export function reorderSteps(project: Project, command: ReorderStepsCommand): AppliedCommand {
  if (command.payload.steps.length !== project.progression.steps.length) {
    throw new Error(
      `Reordered step count (${command.payload.steps.length}) must match current step count (${project.progression.steps.length})`,
    );
  }
  const currentIds = new Set(project.progression.steps.map((s) => s.id));
  for (const s of command.payload.steps) {
    if (!currentIds.has(s.id)) {
      throw new Error(`Step ${s.id} does not exist in current progression`);
    }
  }
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze([...command.payload.steps]) }),
    command.payload.nowIso,
  );
}

export interface InsertStepsAfterPayload {
  readonly afterStepId: string;
  readonly steps: readonly ProgressionStep[];
  readonly nowIso: string;
}
export type InsertStepsAfterCommand = ProjectCommand<InsertStepsAfterPayload> & {
  readonly type: "progression/insert-steps-after";
};
/** Inserts arbitrary steps immediately after a given step ID. */
export function insertStepsAfter(
  project: Project,
  command: InsertStepsAfterCommand,
): AppliedCommand {
  const index = project.progression.steps.findIndex(
    (step) => step.id === command.payload.afterStepId,
  );
  if (index === -1) {
    throw new Error(`Step ${command.payload.afterStepId} not found in progression`);
  }
  const current = [...project.progression.steps];
  current.splice(index + 1, 0, ...command.payload.steps);
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(current) }),
    command.payload.nowIso,
  );
}

export interface InsertStepsBeforePayload {
  readonly beforeStepId: string;
  readonly steps: readonly ProgressionStep[];
  readonly nowIso: string;
}
export type InsertStepsBeforeCommand = ProjectCommand<InsertStepsBeforePayload> & {
  readonly type: "progression/insert-steps-before";
};
/** Inserts arbitrary steps immediately before a given step ID. */
export function insertStepsBefore(
  project: Project,
  command: InsertStepsBeforeCommand,
): AppliedCommand {
  const index = project.progression.steps.findIndex(
    (step) => step.id === command.payload.beforeStepId,
  );
  if (index === -1) {
    throw new Error(`Step ${command.payload.beforeStepId} not found in progression`);
  }
  const current = [...project.progression.steps];
  current.splice(index, 0, ...command.payload.steps);
  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(current) }),
    command.payload.nowIso,
  );
}

export interface StepPatch {
  readonly performance?: Partial<StepPerformance>;
  readonly melody?: ChordMelodyRecipe | null;
}

export interface BatchPatchStepsPayload {
  readonly updates: ReadonlyArray<{
    readonly stepId: string;
    readonly patch: StepPatch;
  }>;
  readonly nowIso: string;
}
export type BatchPatchStepsCommand = ProjectCommand<BatchPatchStepsPayload> & {
  readonly type: "progression/batch-patch-steps";
};
/** Applies performance and/or melody patches across an arbitrary set of steps. */
export function batchPatchSteps(project: Project, command: BatchPatchStepsCommand): AppliedCommand {
  const patchMap = new Map(command.payload.updates.map((u) => [u.stepId, u.patch]));
  const steps = project.progression.steps.map((step) => {
    const patch = patchMap.get(step.id);
    if (!patch || step.kind !== "chord") return step;

    let updatedPerformance = step.performance;
    if (patch.performance) {
      updatedPerformance = Object.freeze({
        ...step.performance,
        ...patch.performance,
        bass: patch.performance.bass
          ? Object.freeze({ ...patch.performance.bass })
          : step.performance.bass,
        perNoteVelocityOverrides: patch.performance.perNoteVelocityOverrides
          ? Object.freeze({ ...patch.performance.perNoteVelocityOverrides })
          : step.performance.perNoteVelocityOverrides,
        ...(patch.performance.manualVoicing
          ? { manualVoicing: Object.freeze([...patch.performance.manualVoicing]) }
          : {}),
      });
    }

    let updatedMelody = step.melody;
    if (patch.melody === null) {
      updatedMelody = undefined;
    } else if (patch.melody !== undefined) {
      updatedMelody = snapshotChordMelodyRecipe(patch.melody);
    }

    const {
      melody: _prevMelody,
      melodyInstrumentOverride: _prevMelodyInstrumentOverride,
      ...rest
    } = step;
    const updatedChord: ChordStep = Object.freeze({
      ...rest,
      performance: updatedPerformance,
      ...(updatedMelody !== undefined ? { melody: updatedMelody } : {}),
      ...(patch.melody !== null && step.melodyInstrumentOverride !== undefined
        ? { melodyInstrumentOverride: step.melodyInstrumentOverride }
        : {}),
    });
    return updatedChord;
  });

  return withInverse(
    project,
    Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    command.payload.nowIso,
  );
}
