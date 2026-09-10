import type { AppliedCommand, ProjectCommand } from ".";
import type { Project } from "../../domain/project/project";
import type { ChordStep, ProgressionStep } from "../../domain/progression/step";
import {
  snapshotChordMelodyRecipe,
  snapshotMelodyTrackSettings,
  validateMelodyTrackSettings,
  type ChordMelodyRecipe,
  type MelodyInstrument,
  type MelodyTrackSettings,
} from "../../domain/melody/types";

export type MelodyCommandErrorReason =
  "unknown-step" | "rest-step" | "missing-recipe" | "invalid-settings-patch";

export class MelodyCommandError extends RangeError {
  readonly reason: MelodyCommandErrorReason;

  constructor(message: string, reason: MelodyCommandErrorReason) {
    super(message);
    this.name = "MelodyCommandError";
    this.reason = reason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface MelodyStateSnapshot {
  readonly stepId?: string;
  readonly recipe?: ChordMelodyRecipe;
  readonly melodyTrack: MelodyTrackSettings;
  readonly selectedStepId?: string;
  readonly updatedAt: string;
}

export type RestoreMelodyStatePayload = MelodyStateSnapshot;
export type RestoreMelodyStateCommand = ProjectCommand<RestoreMelodyStatePayload> & {
  readonly type: "melody/restore-state";
};

export interface SetMelodyRecipePayload {
  readonly stepId: string;
  readonly recipe: ChordMelodyRecipe;
  readonly instrument?: MelodyInstrument;
  readonly nowIso: string;
}
export type SetMelodyRecipeCommand = ProjectCommand<SetMelodyRecipePayload> & {
  readonly type: "melody/set-recipe";
};

export function createSetMelodyRecipeCommand(
  stepId: string,
  recipe: ChordMelodyRecipe,
  nowIso: string,
  instrument?: MelodyInstrument,
): SetMelodyRecipeCommand {
  return {
    type: "melody/set-recipe",
    payload: {
      stepId,
      recipe,
      nowIso,
      ...(instrument !== undefined ? { instrument } : {}),
    },
  };
}

export interface RemoveMelodyRecipePayload {
  readonly stepId: string;
  readonly nowIso: string;
}
export type RemoveMelodyRecipeCommand = ProjectCommand<RemoveMelodyRecipePayload> & {
  readonly type: "melody/remove-recipe";
};

export function createRemoveMelodyRecipeCommand(
  stepId: string,
  nowIso: string,
): RemoveMelodyRecipeCommand {
  return {
    type: "melody/remove-recipe",
    payload: { stepId, nowIso },
  };
}

export interface SetMelodyTrackSettingsPayload {
  readonly settings?: MelodyTrackSettings;
  readonly patch?: Partial<MelodyTrackSettings>;
  readonly nowIso: string;
}
export type SetMelodyTrackSettingsCommand = ProjectCommand<SetMelodyTrackSettingsPayload> & {
  readonly type: "melody/set-track-settings";
};

export function createSetMelodyTrackSettingsCommand(
  settings: MelodyTrackSettings,
  nowIso: string,
): SetMelodyTrackSettingsCommand {
  return {
    type: "melody/set-track-settings",
    payload: { settings, nowIso },
  };
}

export function createPatchMelodyTrackSettingsCommand(
  patch: Partial<MelodyTrackSettings>,
  nowIso: string,
): SetMelodyTrackSettingsCommand {
  return {
    type: "melody/set-track-settings",
    payload: { patch, nowIso },
  };
}

function snapshotState(project: Project, stepId?: string): MelodyStateSnapshot {
  const step = stepId === undefined ? undefined : findChordStep(project, stepId);
  return {
    ...(stepId !== undefined ? { stepId } : {}),
    ...(step?.melody !== undefined ? { recipe: snapshotChordMelodyRecipe(step.melody) } : {}),
    melodyTrack: snapshotMelodyTrackSettings(project.melodyTrack),
    ...(project.progression.selectedStepId !== undefined
      ? { selectedStepId: project.progression.selectedStepId }
      : {}),
    updatedAt: project.updatedAt,
  };
}

function findStep(project: Project, stepId: string): ProgressionStep {
  const step = project.progression.steps.find((candidate) => candidate.id === stepId);
  if (!step) throw new MelodyCommandError(`Unknown progression step: ${stepId}`, "unknown-step");
  return step;
}

function findChordStep(project: Project, stepId: string): ChordStep {
  const step = findStep(project, stepId);
  if (step.kind !== "chord") {
    throw new MelodyCommandError(
      `Melody recipes can only be attached to chord steps: ${stepId}`,
      "rest-step",
    );
  }
  return step;
}

function restoreProgressionSelection(
  project: Project,
  selectedStepId: string | undefined,
): Project["progression"] {
  const { selectedStepId: _discard, ...withoutSelection } = project.progression;
  return Object.freeze({
    ...withoutSelection,
    ...(selectedStepId !== undefined ? { selectedStepId } : {}),
  });
}

function withMelodyState(project: Project, snapshot: MelodyStateSnapshot): Project {
  let progression = project.progression;
  if (snapshot.stepId !== undefined) {
    const step = findChordStep(project, snapshot.stepId);
    const nextStep: ChordStep = Object.freeze(
      snapshot.recipe === undefined
        ? (() => {
            const { melody: _discard, ...withoutMelody } = step;
            return withoutMelody;
          })()
        : { ...step, melody: snapshotChordMelodyRecipe(snapshot.recipe) },
    );
    progression = Object.freeze({
      ...restoreProgressionSelection(project, snapshot.selectedStepId),
      steps: Object.freeze(
        project.progression.steps.map((candidate) =>
          candidate.id === snapshot.stepId ? nextStep : candidate,
        ),
      ),
    });
  } else if (snapshot.selectedStepId !== project.progression.selectedStepId) {
    progression = restoreProgressionSelection(project, snapshot.selectedStepId);
  }

  return Object.freeze({
    ...project,
    progression,
    melodyTrack: snapshotMelodyTrackSettings(snapshot.melodyTrack),
    updatedAt: snapshot.updatedAt,
  });
}

function appliedWithSnapshots(
  project: Project,
  next: MelodyStateSnapshot,
  previous: MelodyStateSnapshot,
): AppliedCommand {
  return {
    project: withMelodyState(project, next),
    forward: { type: "melody/restore-state", payload: next },
    inverse: { type: "melody/restore-state", payload: previous },
  };
}

export function restoreMelodyState(
  project: Project,
  command: RestoreMelodyStateCommand,
): AppliedCommand {
  const previous = snapshotState(project, command.payload.stepId);
  if (command.payload.stepId !== undefined) findChordStep(project, command.payload.stepId);
  return {
    project: withMelodyState(project, command.payload),
    inverse: { type: "melody/restore-state", payload: previous },
  };
}

export function setMelodyRecipe(project: Project, command: SetMelodyRecipeCommand): AppliedCommand {
  const step = findChordStep(project, command.payload.stepId);
  const previous = snapshotState(project, command.payload.stepId);
  const recipe = snapshotChordMelodyRecipe(command.payload.recipe);
  const melodyTrack =
    command.payload.instrument === undefined
      ? snapshotMelodyTrackSettings(project.melodyTrack)
      : snapshotMelodyTrackSettings({
          ...project.melodyTrack,
          instrument: command.payload.instrument,
        });

  return appliedWithSnapshots(
    project,
    {
      stepId: step.id,
      recipe,
      melodyTrack,
      ...(project.progression.selectedStepId !== undefined
        ? { selectedStepId: project.progression.selectedStepId }
        : {}),
      updatedAt: command.payload.nowIso,
    },
    previous,
  );
}

export const applyMelodyRecipe = setMelodyRecipe;

export function removeMelodyRecipe(
  project: Project,
  command: RemoveMelodyRecipeCommand,
): AppliedCommand {
  const step = findChordStep(project, command.payload.stepId);
  if (step.melody === undefined) {
    throw new MelodyCommandError(
      `Chord step has no melody recipe: ${command.payload.stepId}`,
      "missing-recipe",
    );
  }
  const previous = snapshotState(project, command.payload.stepId);
  return appliedWithSnapshots(
    project,
    {
      stepId: command.payload.stepId,
      melodyTrack: snapshotMelodyTrackSettings(project.melodyTrack),
      ...(project.progression.selectedStepId !== undefined
        ? { selectedStepId: project.progression.selectedStepId }
        : {}),
      updatedAt: command.payload.nowIso,
    },
    previous,
  );
}

function resolveTrackSettings(
  project: Project,
  payload: SetMelodyTrackSettingsPayload,
): MelodyTrackSettings {
  if (payload.settings !== undefined && payload.patch !== undefined) {
    throw new MelodyCommandError(
      "Melody Track settings command accepts either settings or patch, not both",
      "invalid-settings-patch",
    );
  }
  if (payload.settings !== undefined) return snapshotMelodyTrackSettings(payload.settings);
  if (payload.patch === undefined) {
    throw new MelodyCommandError(
      "Melody Track settings command requires settings or patch",
      "invalid-settings-patch",
    );
  }

  const patch = payload.patch;
  if (patch.muted === true && patch.solo === true) {
    throw new MelodyCommandError(
      "Melody Track cannot be muted and solo at the same time",
      "invalid-settings-patch",
    );
  }
  const next = {
    ...project.melodyTrack,
    ...patch,
    ...(patch.muted === true && patch.solo === undefined ? { solo: false } : {}),
    ...(patch.solo === true && patch.muted === undefined ? { muted: false } : {}),
  };
  return validateMelodyTrackSettings(next);
}

export function setMelodyTrackSettings(
  project: Project,
  command: SetMelodyTrackSettingsCommand,
): AppliedCommand {
  const previous = snapshotState(project);
  const settings = resolveTrackSettings(project, command.payload);
  return appliedWithSnapshots(
    project,
    {
      melodyTrack: settings,
      ...(project.progression.selectedStepId !== undefined
        ? { selectedStepId: project.progression.selectedStepId }
        : {}),
      updatedAt: command.payload.nowIso,
    },
    previous,
  );
}

export const updateMelodyTrackSettings = setMelodyTrackSettings;

export type MelodyCommand =
  | SetMelodyRecipeCommand
  | RemoveMelodyRecipeCommand
  | SetMelodyTrackSettingsCommand
  | RestoreMelodyStateCommand;

export function applyMelodyCommand(project: Project, command: MelodyCommand): AppliedCommand {
  switch (command.type) {
    case "melody/set-recipe":
      return setMelodyRecipe(project, command);
    case "melody/remove-recipe":
      return removeMelodyRecipe(project, command);
    case "melody/set-track-settings":
      return setMelodyTrackSettings(project, command);
    case "melody/restore-state":
      return restoreMelodyState(project, command);
  }
}
