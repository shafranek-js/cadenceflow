import type {
  MeasuresPerSystem,
  PresentationMode,
  ProgressionView,
  Project,
  ThemeMode,
} from "../../domain/project/project";
import type { AppliedCommand, ProjectCommand } from ".";

export interface SetThemePayload {
  readonly theme: ThemeMode;
  readonly nowIso: string;
}

export type SetThemeCommand = ProjectCommand<SetThemePayload> & {
  readonly type: "presentation/set-theme";
};

export interface SetExpertiseModePayload {
  readonly expertiseMode: PresentationMode;
  readonly nowIso: string;
}

export type SetExpertiseModeCommand = ProjectCommand<SetExpertiseModePayload> & {
  readonly type: "presentation/set-expertise-mode";
};

export interface SetStaffBassVisibilityPayload {
  readonly visible: boolean;
  readonly nowIso: string;
}

export type SetStaffBassVisibilityCommand = ProjectCommand<SetStaffBassVisibilityPayload> & {
  readonly type: "presentation/set-staff-bass-visibility";
};

export function setTheme(project: Project, command: SetThemeCommand): AppliedCommand {
  const previous = project.presentation.theme;
  return {
    project: Object.freeze({
      ...project,
      updatedAt: command.payload.nowIso,
      presentation: Object.freeze({
        ...project.presentation,
        theme: command.payload.theme,
      }),
    }),
    inverse: {
      type: "presentation/set-theme",
      payload: { theme: previous, nowIso: command.payload.nowIso },
    },
  };
}

export function setExpertiseMode(
  project: Project,
  command: SetExpertiseModeCommand,
): AppliedCommand {
  const previous = project.presentation.expertiseMode;
  return {
    project: Object.freeze({
      ...project,
      updatedAt: command.payload.nowIso,
      presentation: Object.freeze({
        ...project.presentation,
        expertiseMode: command.payload.expertiseMode,
      }),
    }),
    inverse: {
      type: "presentation/set-expertise-mode",
      payload: { expertiseMode: previous, nowIso: command.payload.nowIso },
    },
  };
}

export function setStaffBassVisibility(
  project: Project,
  command: SetStaffBassVisibilityCommand,
): AppliedCommand {
  const previous = project.presentation.showBassInStaff;
  return {
    project: Object.freeze({
      ...project,
      updatedAt: command.payload.nowIso,
      presentation: Object.freeze({
        ...project.presentation,
        showBassInStaff: command.payload.visible,
      }),
    }),
    inverse: {
      type: "presentation/set-staff-bass-visibility",
      payload: { visible: previous, nowIso: command.payload.nowIso },
    },
  };
}

export interface SetProgressionViewPayload {
  readonly view: ProgressionView;
  readonly nowIso: string;
}

export type SetProgressionViewCommand = ProjectCommand<SetProgressionViewPayload> & {
  readonly type: "presentation/set-progression-view";
};

export function setProgressionView(
  project: Project,
  command: SetProgressionViewCommand,
): AppliedCommand {
  const previous = project.presentation.progressionView;
  return {
    project: Object.freeze({
      ...project,
      updatedAt: command.payload.nowIso,
      presentation: Object.freeze({
        ...project.presentation,
        progressionView: command.payload.view,
      }),
    }),
    inverse: {
      type: "presentation/set-progression-view",
      payload: { view: previous, nowIso: command.payload.nowIso },
    },
  };
}

export interface SetMeasuresPerSystemPayload {
  readonly measuresPerSystem: MeasuresPerSystem;
  readonly nowIso: string;
}

export type SetMeasuresPerSystemCommand = ProjectCommand<SetMeasuresPerSystemPayload> & {
  readonly type: "presentation/set-measures-per-system";
};

export function setMeasuresPerSystem(
  project: Project,
  command: SetMeasuresPerSystemCommand,
): AppliedCommand {
  const previous = project.presentation.measuresPerSystem;
  return {
    project: Object.freeze({
      ...project,
      updatedAt: command.payload.nowIso,
      presentation: Object.freeze({
        ...project.presentation,
        measuresPerSystem: command.payload.measuresPerSystem,
      }),
    }),
    inverse: {
      type: "presentation/set-measures-per-system",
      payload: { measuresPerSystem: previous, nowIso: command.payload.nowIso },
    },
  };
}
