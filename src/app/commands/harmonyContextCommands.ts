import type { HarmonicFunctionIdentity, HarmonicModuleId } from "../../domain/harmony/functions";
import { planModuleSwitch } from "../../domain/harmony/moduleSwitch";
import type { Project } from "../../domain/project/project";
import type { ChordStep, ProgressionStep } from "../../domain/progression/step";
import type { AppliedCommand, ProjectCommand } from ".";

export interface SetTonicPayload {
  readonly tonic: number;
  readonly nowIso: string;
}
export type SetTonicCommand = ProjectCommand<SetTonicPayload> & {
  readonly type: "harmony/set-tonic";
};

export function setTonic(project: Project, command: SetTonicCommand): AppliedCommand {
  const previous = project.tonic;
  return {
    project: Object.freeze({
      ...project,
      tonic: ((command.payload.tonic % 12) + 12) % 12,
      updatedAt: command.payload.nowIso,
    }),
    inverse: {
      type: "harmony/set-tonic",
      payload: { tonic: previous, nowIso: command.payload.nowIso },
    },
  };
}

export interface SwitchModulePayload {
  readonly destinationModule: HarmonicModuleId;
  readonly resolutions: Readonly<Record<string, HarmonicFunctionIdentity | "keep-original">>;
  readonly nowIso: string;
}
export type SwitchModuleCommand = ProjectCommand<SwitchModulePayload> & {
  readonly type: "harmony/switch-module";
};

export function switchModule(project: Project, command: SwitchModuleCommand): AppliedCommand {
  const previousModule = project.activeModule;
  if (previousModule === command.payload.destinationModule) {
    return {
      project,
      inverse: {
        type: "harmony/switch-module",
        payload: {
          destinationModule: previousModule,
          resolutions: {},
          nowIso: command.payload.nowIso,
        },
      },
    };
  }

  const plan = planModuleSwitch(project.progression.steps, command.payload.destinationModule);
  const previousIdentities: Record<string, HarmonicFunctionIdentity> = {};
  const steps: ProgressionStep[] = project.progression.steps.map((step) => {
    if (step.kind === "rest") return step;
    previousIdentities[step.id] = step.harmonicFunction;
    const planned = plan.resolutions.find((item) => item.stepId === step.id)!;
    const chosen = command.payload.resolutions[step.id] ?? planned.automaticTarget;
    if (!chosen)
      throw new Error(
        `Ambiguous module switch for step ${step.id} requires an explicit resolution`,
      );
    if (chosen === "keep-original") return step;
    const next: ChordStep = Object.freeze({ ...step, harmonicFunction: chosen });
    return next;
  });

  return {
    project: Object.freeze({
      ...project,
      activeModule: command.payload.destinationModule,
      updatedAt: command.payload.nowIso,
      progression: Object.freeze({ ...project.progression, steps: Object.freeze(steps) }),
    }),
    inverse: {
      type: "harmony/switch-module",
      payload: {
        destinationModule: previousModule,
        resolutions: Object.freeze(previousIdentities),
        nowIso: command.payload.nowIso,
      },
    },
  };
}
