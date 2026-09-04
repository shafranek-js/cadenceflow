import type { Project } from "../../domain/project/project";

export interface ProjectCommand<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
}

export interface AppliedCommand {
  readonly project: Project;
  readonly inverse: ProjectCommand;
}

export type ProjectCommandHandler<TCommand extends ProjectCommand = ProjectCommand> = (project: Project, command: TCommand) => AppliedCommand;
