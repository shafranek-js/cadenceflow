import { AppStore } from "./appStore";
import { renameProject, type RenameProjectCommand } from "./commands/projectCommands";
import { createDefaultProject } from "../domain/project/factory";
import { InvalidProjectNameError, normalizeProjectName } from "../domain/project/name";
import type { Project } from "../domain/project/project";
import { UnsupportedProjectVersionError } from "../domain/project/migrations";
import {
  decodePortableProject,
  encodePortableProject,
  InvalidPortableProjectError,
  sanitizePortableProjectFilename,
} from "../persistence/portableProject";
import { createAutosaveEngine, type AutosaveEngine } from "../persistence/autosave";
import {
  createProjectRepository,
  type ProjectMetadata,
  type ProjectRepository,
} from "../persistence/projectRepository";

export interface PortableProjectExport {
  readonly text: string;
  readonly filename: string;
}

export interface ProjectControllerOptions {
  readonly store: AppStore;
  readonly repo?: ProjectRepository;
  readonly autosave?: AutosaveEngine;
  readonly createId?: () => string;
  readonly now?: () => string;
  /** Stop/cancel transport and other runtime state before identity replacement. */
  readonly beforeProjectSwitch?: () => void;
}

export class ProjectNotFoundError extends Error {
  constructor(id: string) {
    super(`Project not found: ${id}`);
    this.name = "ProjectNotFoundError";
  }
}

export class ProjectOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectOperationError";
  }
}

export function createProjectId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function formatProjectOperationError(error: unknown): string {
  if (error instanceof InvalidProjectNameError) return error.message;
  if (error instanceof UnsupportedProjectVersionError) {
    return `This project was created by a newer CadenceFlow version (schema ${error.version}).`;
  }
  if (error instanceof InvalidPortableProjectError) {
    return `Could not open the project file: ${error.message}.`;
  }
  if (error instanceof ProjectNotFoundError) return "The selected project no longer exists.";
  if (error instanceof Error && error.message) return error.message;
  return "The project operation failed. The current project was not changed.";
}

function copyProjectWithIdentity(project: Project, id: string, name: string): Project {
  return Object.freeze({
    ...project,
    id,
    name,
  });
}

function importedCopyName(name: string): string {
  const suffix = " (Imported Copy)";
  const max = 100;
  return `${name.slice(0, Math.max(1, max - suffix.length))}${suffix}`;
}

/**
 * Application-level boundary for named projects, recovery, autosave, and
 * portable files. Components call this controller and never touch Dexie or
 * the portable codec directly.
 */
export class ProjectController {
  readonly repo: ProjectRepository;
  readonly autosave: AutosaveEngine;

  private readonly store: AppStore;
  private readonly createId: () => string;
  private readonly now: () => string;
  private beforeProjectSwitch: () => void;
  private autosaveStarted = false;
  private unsubscribeStore: (() => void) | null = null;
  private operation: Promise<unknown> = Promise.resolve();

  constructor(options: ProjectControllerOptions) {
    this.store = options.store;
    this.repo = options.repo ?? createProjectRepository();
    this.autosave = options.autosave ?? createAutosaveEngine({ repo: this.repo });
    this.createId = options.createId ?? createProjectId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.beforeProjectSwitch = options.beforeProjectSwitch ?? (() => {});
  }

  setBeforeProjectSwitch(callback: () => void): void {
    this.beforeProjectSwitch = callback;
  }

  /** Starts the single autosave subscription after startup recovery has run. */
  startAutosave(): void {
    if (this.autosaveStarted) return;
    this.autosaveStarted = true;
    this.unsubscribeStore = this.store.subscribe(() => {
      this.autosave.scheduleAutosave(this.store.project);
    });
    this.autosave.scheduleAutosave(this.store.project);
  }

  async recoverLastSession(): Promise<Project | null> {
    const recovered = await this.autosave.loadAutosavedProject();
    if (!recovered) return null;
    this.beforeProjectSwitch();
    this.store.replaceLoadedProject(recovered);
    return recovered;
  }

  async listProjects(): Promise<readonly ProjectMetadata[]> {
    const projects = await this.repo.listProjects();
    return Object.freeze(
      [...projects].sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) ||
          a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id),
      ),
    );
  }

  async createNewProject(rawName: string): Promise<Project> {
    return this.runExclusive(async () => {
      const name = normalizeProjectName(rawName);
      const project = createDefaultProject(await this.nextAvailableId(), name, this.now());
      await this.prepareIdentityReplacement();
      await this.persistAndActivate(project);
      return project;
    });
  }

  async openNamedProject(id: string): Promise<Project> {
    return this.runExclusive(async () => {
      const project = await this.repo.loadProject(id);
      if (!project) throw new ProjectNotFoundError(id);
      await this.prepareIdentityReplacement();
      await this.repo.setLastActiveProjectId(project.id);
      this.store.replaceLoadedProject(project);
      return project;
    });
  }

  async renameActiveProject(rawName: string): Promise<Project> {
    return this.runExclusive(async () => {
      const command: RenameProjectCommand = {
        type: "project/rename",
        payload: { name: normalizeProjectName(rawName), nowIso: this.now() },
      };
      this.store.dispatch(command, renameProject);
      await this.repo.saveProject(this.store.project);
      await this.repo.setLastActiveProjectId(this.store.project.id);
      return this.store.project;
    });
  }

  async deleteProject(id: string): Promise<Project> {
    return this.runExclusive(async () => {
      const isActive = this.store.project.id === id;
      if (!isActive) {
        await this.repo.deleteProject(id);
        return this.store.project;
      }

      // Stop runtime first, then flush the outgoing semantic state before the
      // transactional repository deletion. The repository clears the matching
      // recovery pointer as part of deleteProject().
      this.beforeProjectSwitch();
      await this.autosave.flush();
      await this.repo.deleteProject(id);

      // Deterministic policy: restore the most recently updated surviving
      // project; if none survives, create a fresh Untitled project.
      const remaining = await this.listProjects();
      for (const metadata of remaining) {
        const replacement = await this.repo.loadProject(metadata.id);
        if (replacement) {
          await this.repo.setLastActiveProjectId(replacement.id);
          this.store.replaceLoadedProject(replacement);
          return replacement;
        }
      }

      const replacement = createDefaultProject(
        await this.nextAvailableId(),
        "Untitled",
        this.now(),
      );
      await this.repo.saveProject(replacement);
      await this.repo.setLastActiveProjectId(replacement.id);
      this.store.replaceLoadedProject(replacement);
      return replacement;
    });
  }

  async saveProjectAs(rawName: string): Promise<Project> {
    return this.runExclusive(async () => {
      const name = normalizeProjectName(rawName);
      const copy = copyProjectWithIdentity(this.store.project, await this.nextAvailableId(), name);
      await this.prepareIdentityReplacement();
      await this.persistAndActivate(copy);
      return copy;
    });
  }

  exportProject(): PortableProjectExport {
    const text = encodePortableProject(this.store.project);
    return Object.freeze({
      text,
      filename: sanitizePortableProjectFilename(this.store.project.name),
    });
  }

  async openPortableProject(text: string): Promise<Project> {
    // Decode and collision-check before touching current runtime, history, or
    // recovery metadata. Invalid/future-version files are non-destructive.
    const decoded = decodePortableProject(text);
    const sameId = await this.repo.loadProject(decoded.id);
    const imported = sameId
      ? copyProjectWithIdentity(
          decoded,
          await this.nextAvailableId(),
          importedCopyName(decoded.name),
        )
      : decoded;

    return this.runExclusive(async () => {
      await this.prepareIdentityReplacement();
      await this.persistAndActivate(imported);
      return imported;
    });
  }

  async flush(): Promise<void> {
    await this.autosave.flush();
  }

  dispose(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.autosave.dispose();
  }

  private async nextAvailableId(): Promise<string> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const id = this.createId();
      if (!(await this.repo.loadProject(id))) return id;
    }
    throw new ProjectOperationError("Could not allocate a unique project ID.");
  }

  private async prepareIdentityReplacement(): Promise<void> {
    this.beforeProjectSwitch();
    await this.autosave.flush();
  }

  private async persistAndActivate(project: Project): Promise<void> {
    await this.repo.saveProject(project);
    await this.repo.setLastActiveProjectId(project.id);
    this.store.replaceLoadedProject(project);
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operation.then(operation, operation);
    this.operation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function createProjectController(options: ProjectControllerOptions): ProjectController {
  return new ProjectController(options);
}
