import type { Project } from "../domain/project/project";

/**
 * Named project repository interface and stubs (T122).
 */

export interface ProjectMetadata {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectRepository {
  listProjects(): Promise<readonly ProjectMetadata[]>;
  loadProject(id: string): Promise<Project | null>;
  saveProject(project: Project): Promise<void>;
  deleteProject(id: string): Promise<void>;
}

export function createProjectRepository(_db?: unknown): ProjectRepository {
  throw new Error("Not implemented: T122");
}
