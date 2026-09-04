import type {
  Project,
  MatrixCardTemplateState,
  ModuleTemplateState,
} from "../../domain/project/project";
import type { CardViewId } from "../../domain/progression/step";
import type { AppliedCommand, ProjectCommand } from ".";

export interface SetGlobalCardViewPayload {
  readonly view: CardViewId;
  readonly nowIso: string;
}
export type SetGlobalCardViewCommand = ProjectCommand<SetGlobalCardViewPayload> & {
  readonly type: "matrix/set-global-card-view";
};

export function setGlobalCardView(
  project: Project,
  command: SetGlobalCardViewCommand,
): AppliedCommand {
  const previous = project.presentation.globalMatrixCardView;
  return {
    project: Object.freeze({
      ...project,
      updatedAt: command.payload.nowIso,
      presentation: Object.freeze({
        ...project.presentation,
        globalMatrixCardView: command.payload.view,
      }),
    }),
    inverse: {
      type: "matrix/set-global-card-view",
      payload: { view: previous, nowIso: command.payload.nowIso },
    },
  };
}

export interface SetCardViewOverridePayload {
  readonly functionId: string;
  readonly view: CardViewId | null;
  readonly nowIso: string;
}
export type SetCardViewOverrideCommand = ProjectCommand<SetCardViewOverridePayload> & {
  readonly type: "matrix/set-card-view-override";
};

export function setCardViewOverride(
  project: Project,
  command: SetCardViewOverrideCommand,
): AppliedCommand {
  const moduleId = project.activeModule;
  const moduleState = project.moduleTemplateStates[moduleId];
  const previousCard = moduleState.cards[command.payload.functionId];
  const previousView = previousCard?.cardViewOverride ?? null;
  const card: MatrixCardTemplateState = command.payload.view
    ? Object.freeze({
        harmonicFunctionId: command.payload.functionId,
        explicitOverrides: previousCard?.explicitOverrides ?? Object.freeze({}),
        ...(previousCard?.harmonicVariantOverride
          ? { harmonicVariantOverride: previousCard.harmonicVariantOverride }
          : {}),
        ...(previousCard?.manualPreviewVoicing
          ? { manualPreviewVoicing: previousCard.manualPreviewVoicing }
          : {}),
        cardViewOverride: command.payload.view,
      })
    : Object.freeze({
        harmonicFunctionId: command.payload.functionId,
        explicitOverrides: previousCard?.explicitOverrides ?? Object.freeze({}),
        ...(previousCard?.harmonicVariantOverride
          ? { harmonicVariantOverride: previousCard.harmonicVariantOverride }
          : {}),
        ...(previousCard?.manualPreviewVoicing
          ? { manualPreviewVoicing: previousCard.manualPreviewVoicing }
          : {}),
      });
  const nextModule: ModuleTemplateState = Object.freeze({
    cards: Object.freeze({ ...moduleState.cards, [command.payload.functionId]: card }),
  });
  return {
    project: Object.freeze({
      ...project,
      updatedAt: command.payload.nowIso,
      moduleTemplateStates: Object.freeze({
        ...project.moduleTemplateStates,
        [moduleId]: nextModule,
      }),
    }),
    inverse: {
      type: "matrix/set-card-view-override",
      payload: {
        functionId: command.payload.functionId,
        view: previousView,
        nowIso: command.payload.nowIso,
      },
    },
  };
}
