import type { HarmonicModuleId } from "../../domain/harmony/functions";
import type { HarmonicVariant } from "../../domain/harmony/chord";
import type {
  StepCreationOverrides,
  StepPerformanceOverrides,
} from "../../domain/project/defaults";
import type {
  MatrixCardTemplateState,
  ModuleTemplateState,
  Project,
} from "../../domain/project/project";
import type { ExactPitch } from "../../domain/harmony/pitch";
import type { AppliedCommand, ProjectCommand } from ".";

function emptyCard(functionId: string): MatrixCardTemplateState {
  return Object.freeze({ harmonicFunctionId: functionId, explicitOverrides: Object.freeze({}) });
}
function withModuleState(
  project: Project,
  moduleId: HarmonicModuleId,
  moduleState: ModuleTemplateState,
  nowIso: string,
): Project {
  return Object.freeze({
    ...project,
    updatedAt: nowIso,
    moduleTemplateStates: Object.freeze({
      ...project.moduleTemplateStates,
      [moduleId]: moduleState,
    }),
  });
}

export interface PatchMatrixTemplatePayload {
  readonly functionId: string;
  readonly durationOverride?: StepCreationOverrides["duration"] | null;
  readonly performanceOverrides?: StepPerformanceOverrides;
  readonly harmonicVariantOverride?: HarmonicVariant | null;
  readonly manualPreviewVoicing?: readonly ExactPitch[] | null;
  readonly nowIso: string;
}
export type PatchMatrixTemplateCommand = ProjectCommand<PatchMatrixTemplatePayload> & {
  readonly type: "matrix-template/patch";
};

export function patchMatrixTemplate(
  project: Project,
  command: PatchMatrixTemplateCommand,
): AppliedCommand {
  const moduleId = project.activeModule;
  const moduleState = project.moduleTemplateStates[moduleId];
  const previous = moduleState.cards[command.payload.functionId];
  const base = previous ?? emptyCard(command.payload.functionId);
  const previousPerformance = base.explicitOverrides.performance ?? Object.freeze({});
  const nextOverrides: StepCreationOverrides = Object.freeze({
    ...(base.explicitOverrides.duration ? { duration: base.explicitOverrides.duration } : {}),
    ...(Object.keys(previousPerformance).length ? { performance: previousPerformance } : {}),
    ...(command.payload.durationOverride === null
      ? {}
      : command.payload.durationOverride
        ? { duration: command.payload.durationOverride }
        : {}),
    ...(command.payload.performanceOverrides
      ? {
          performance: Object.freeze({
            ...previousPerformance,
            ...command.payload.performanceOverrides,
          }),
        }
      : {}),
  });
  let card: MatrixCardTemplateState = Object.freeze({
    ...base,
    explicitOverrides: nextOverrides,
    ...(command.payload.harmonicVariantOverride === null
      ? {}
      : command.payload.harmonicVariantOverride
        ? { harmonicVariantOverride: command.payload.harmonicVariantOverride }
        : base.harmonicVariantOverride
          ? { harmonicVariantOverride: base.harmonicVariantOverride }
          : {}),
    ...(command.payload.manualPreviewVoicing === null
      ? {}
      : command.payload.manualPreviewVoicing
        ? { manualPreviewVoicing: Object.freeze([...command.payload.manualPreviewVoicing]) }
        : base.manualPreviewVoicing
          ? { manualPreviewVoicing: base.manualPreviewVoicing }
          : {}),
    ...(base.cardViewOverride ? { cardViewOverride: base.cardViewOverride } : {}),
  });
  if (command.payload.durationOverride === null) {
    const { duration: _duration, ...rest } = card.explicitOverrides;
    card = Object.freeze({ ...card, explicitOverrides: Object.freeze(rest) });
  }
  const nextModule = Object.freeze({
    cards: Object.freeze({ ...moduleState.cards, [command.payload.functionId]: card }),
  });
  return {
    project: withModuleState(project, moduleId, nextModule, command.payload.nowIso),
    inverse: {
      type: "matrix-template/restore-module",
      payload: { moduleId, moduleState, nowIso: command.payload.nowIso },
    },
  };
}

export interface RestoreModuleTemplatePayload {
  readonly moduleId: HarmonicModuleId;
  readonly moduleState: ModuleTemplateState;
  readonly nowIso: string;
}
export type RestoreModuleTemplateCommand = ProjectCommand<RestoreModuleTemplatePayload> & {
  readonly type: "matrix-template/restore-module";
};
export function restoreModuleTemplate(
  project: Project,
  command: RestoreModuleTemplateCommand,
): AppliedCommand {
  const previous = project.moduleTemplateStates[command.payload.moduleId];
  return {
    project: withModuleState(
      project,
      command.payload.moduleId,
      command.payload.moduleState,
      command.payload.nowIso,
    ),
    inverse: {
      type: "matrix-template/restore-module",
      payload: {
        moduleId: command.payload.moduleId,
        moduleState: previous,
        nowIso: command.payload.nowIso,
      },
    },
  };
}

export interface RestoreAllTemplatePayload {
  readonly states: Project["moduleTemplateStates"];
  readonly nowIso: string;
}
export type RestoreAllTemplateCommand = ProjectCommand<RestoreAllTemplatePayload> & {
  readonly type: "matrix-template/restore-all";
};
export function restoreAllTemplates(
  project: Project,
  command: RestoreAllTemplateCommand,
): AppliedCommand {
  return {
    project: Object.freeze({
      ...project,
      updatedAt: command.payload.nowIso,
      moduleTemplateStates: command.payload.states,
    }),
    inverse: {
      type: "matrix-template/restore-all",
      payload: { states: project.moduleTemplateStates, nowIso: command.payload.nowIso },
    },
  };
}

export interface ResetCardTemplatePayload {
  readonly functionId: string;
  readonly nowIso: string;
}
export type ResetCardTemplateCommand = ProjectCommand<ResetCardTemplatePayload> & {
  readonly type: "matrix-template/reset-card";
};
export function resetCardTemplate(
  project: Project,
  command: ResetCardTemplateCommand,
): AppliedCommand {
  const moduleId = project.activeModule;
  const moduleState = project.moduleTemplateStates[moduleId];
  const { [command.payload.functionId]: _discard, ...cards } = moduleState.cards;
  const nextModule = Object.freeze({ cards: Object.freeze(cards) });
  return {
    project: withModuleState(project, moduleId, nextModule, command.payload.nowIso),
    inverse: {
      type: "matrix-template/restore-module",
      payload: { moduleId, moduleState, nowIso: command.payload.nowIso },
    },
  };
}

export interface ResetMatrixScopePayload {
  readonly scope: "current-module" | "all-modules";
  readonly nowIso: string;
}
export type ResetMatrixScopeCommand = ProjectCommand<ResetMatrixScopePayload> & {
  readonly type: "matrix-template/reset-scope";
};
export function resetMatrixScope(
  project: Project,
  command: ResetMatrixScopeCommand,
): AppliedCommand {
  if (command.payload.scope === "current-module") {
    const moduleId = project.activeModule;
    const previous = project.moduleTemplateStates[moduleId];
    const empty: ModuleTemplateState = Object.freeze({ cards: Object.freeze({}) });
    return {
      project: withModuleState(project, moduleId, empty, command.payload.nowIso),
      inverse: {
        type: "matrix-template/restore-module",
        payload: { moduleId, moduleState: previous, nowIso: command.payload.nowIso },
      },
    };
  }
  const previous = project.moduleTemplateStates;
  const emptyStates = Object.freeze({
    progressions: Object.freeze({ cards: Object.freeze({}) }),
    "dark-harmony": Object.freeze({ cards: Object.freeze({}) }),
  });
  return {
    project: Object.freeze({
      ...project,
      updatedAt: command.payload.nowIso,
      moduleTemplateStates: emptyStates,
    }),
    inverse: {
      type: "matrix-template/restore-all",
      payload: { states: previous, nowIso: command.payload.nowIso },
    },
  };
}
