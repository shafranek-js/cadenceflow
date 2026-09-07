import type { Project } from "../../domain/project/project";
import { normalizeProjectName } from "../../domain/project/name";
import type { AppliedCommand, ProjectCommand } from ".";

export interface RenameProjectPayload {
  readonly name: string;
  readonly nowIso: string;
}

export type RenameProjectCommand = ProjectCommand<RenameProjectPayload> & {
  readonly type: "project/rename";
};

export function renameProject(project: Project, command: RenameProjectCommand): AppliedCommand {
  const name = normalizeProjectName(command.payload.name);
  const next = Object.freeze({
    ...project,
    name,
    updatedAt: command.payload.nowIso,
  });

  return {
    project: next,
    forward: {
      type: "project/rename",
      payload: { name, nowIso: command.payload.nowIso },
    },
    inverse: {
      type: "project/rename",
      payload: { name: project.name, nowIso: command.payload.nowIso },
    },
  };
}
