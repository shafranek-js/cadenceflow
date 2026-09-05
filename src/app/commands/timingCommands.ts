import type { Project } from "../../domain/project/project";
import type { Progression } from "../../domain/progression/progression";
import type { Meter, MeterChangePolicy } from "../../domain/timing/meter";
import { applyMeterChange } from "../../domain/timing/meter";
import type { GrooveSettings } from "../../domain/timing/swing";
import type { MusicalDuration } from "../../domain/timing/duration";
import type { AppliedCommand, ProjectCommand } from ".";

export interface SetTempoPayload {
  readonly tempoBpm: number;
  readonly nowIso: string;
}

export type SetTempoCommand = ProjectCommand<SetTempoPayload> & {
  readonly type: "timing/set-tempo";
};

export function setTempo(project: Project, command: SetTempoCommand): AppliedCommand {
  const oldTempo = project.globalTiming.tempoBpm;
  const newTempo = command.payload.tempoBpm;
  if (!Number.isFinite(newTempo) || newTempo <= 0) {
    throw new RangeError("tempoBpm must be positive finite number");
  }

  const updatedProject: Project = Object.freeze({
    ...project,
    globalTiming: Object.freeze({
      ...project.globalTiming,
      tempoBpm: newTempo,
    }),
    updatedAt: command.payload.nowIso,
  });

  return {
    project: updatedProject,
    inverse: {
      type: "timing/set-tempo",
      payload: { tempoBpm: oldTempo, nowIso: command.payload.nowIso },
    },
  };
}

export interface SetMeterPayload {
  readonly meter: Meter;
  readonly policy: MeterChangePolicy;
  readonly nowIso: string;
}

export type SetMeterCommand = ProjectCommand<SetMeterPayload> & {
  readonly type: "timing/set-meter";
};

export function setMeter(project: Project, command: SetMeterCommand): AppliedCommand {
  const oldMeter = project.globalTiming.meter;
  const newMeter = command.payload.meter;
  const policy = command.payload.policy;

  const transformedSteps = applyMeterChange(project.progression.steps, oldMeter, newMeter, policy);
  const updatedProgression: Progression = Object.freeze({
    ...project.progression,
    steps: transformedSteps,
  });

  const updatedProject: Project = Object.freeze({
    ...project,
    globalTiming: Object.freeze({
      ...project.globalTiming,
      meter: newMeter,
    }),
    progression: updatedProgression,
    updatedAt: command.payload.nowIso,
  });

  return {
    project: updatedProject,
    inverse: {
      type: "timing/restore-meter-and-steps",
      payload: {
        meter: oldMeter,
        steps: project.progression.steps,
        nowIso: command.payload.nowIso,
      },
    },
  };
}

export interface RestoreMeterAndStepsPayload {
  readonly meter: Meter;
  readonly steps: Progression["steps"];
  readonly nowIso: string;
}

export type RestoreMeterAndStepsCommand = ProjectCommand<RestoreMeterAndStepsPayload> & {
  readonly type: "timing/restore-meter-and-steps";
};

export function restoreMeterAndSteps(
  project: Project,
  command: RestoreMeterAndStepsCommand,
): AppliedCommand {
  const oldMeter = project.globalTiming.meter;
  const oldSteps = project.progression.steps;

  const updatedProgression: Progression = Object.freeze({
    ...project.progression,
    steps: command.payload.steps,
  });

  const updatedProject: Project = Object.freeze({
    ...project,
    globalTiming: Object.freeze({
      ...project.globalTiming,
      meter: command.payload.meter,
    }),
    progression: updatedProgression,
    updatedAt: command.payload.nowIso,
  });

  return {
    project: updatedProject,
    inverse: {
      type: "timing/restore-meter-and-steps",
      payload: {
        meter: oldMeter,
        steps: oldSteps,
        nowIso: command.payload.nowIso,
      },
    },
  };
}

export interface SetGroovePayload {
  readonly groove: GrooveSettings;
  readonly nowIso: string;
}

export type SetGrooveCommand = ProjectCommand<SetGroovePayload> & {
  readonly type: "timing/set-groove";
};

export function setGroove(project: Project, command: SetGrooveCommand): AppliedCommand {
  const oldGroove = project.groove;

  const updatedProject: Project = Object.freeze({
    ...project,
    groove: command.payload.groove,
    updatedAt: command.payload.nowIso,
  });

  return {
    project: updatedProject,
    inverse: {
      type: "timing/set-groove",
      payload: { groove: oldGroove, nowIso: command.payload.nowIso },
    },
  };
}

export interface SetStepDurationPayload {
  readonly stepId: string;
  readonly duration: MusicalDuration;
  readonly nowIso: string;
}

export type SetStepDurationCommand = ProjectCommand<SetStepDurationPayload> & {
  readonly type: "timing/set-step-duration";
};

export function setStepDuration(project: Project, command: SetStepDurationCommand): AppliedCommand {
  const targetStepIndex = project.progression.steps.findIndex(
    (s) => s.id === command.payload.stepId,
  );
  if (targetStepIndex === -1) {
    throw new RangeError(`Unknown progression step: ${command.payload.stepId}`);
  }

  const oldStep = project.progression.steps[targetStepIndex]!;
  const oldDuration = oldStep.duration;

  const updatedSteps = project.progression.steps.map((step, idx) => {
    if (idx !== targetStepIndex) return step;
    return Object.freeze({
      ...step,
      duration: command.payload.duration,
    });
  });

  const updatedProgression: Progression = Object.freeze({
    ...project.progression,
    steps: Object.freeze(updatedSteps),
  });

  const updatedProject: Project = Object.freeze({
    ...project,
    progression: updatedProgression,
    updatedAt: command.payload.nowIso,
  });

  return {
    project: updatedProject,
    inverse: {
      type: "timing/set-step-duration",
      payload: {
        stepId: command.payload.stepId,
        duration: oldDuration,
        nowIso: command.payload.nowIso,
      },
    },
  };
}
