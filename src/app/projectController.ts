import { AppStore } from "./appStore";
import { renameProject, type RenameProjectCommand } from "./commands/projectCommands";
import { createDefaultProject } from "../domain/project/factory";
import { InvalidProjectNameError, normalizeProjectName } from "../domain/project/name";
import type { Project } from "../domain/project/project";
import { UnsupportedProjectVersionError } from "../domain/project/migrations";
import {
  decodePortableProjectWithDiagnostics,
  type PortableProjectDecodeResult,
  encodePortableProject,
  InvalidPortableProjectError,
  sanitizePortableProjectFilename,
} from "../persistence/portableProject";
import { createAutosaveEngine, type AutosaveEngine } from "../persistence/autosave";
import { reportAutosaveComplete, reportAutosaveScheduled } from "../persistence/testHooks";
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
  /**
   * Reports an autosave failure to the shell so the user learns their work is not saved.
   * Without this the engine's rejection was invisible: no status and no retry feedback.
   */
  readonly onAutosaveError?: (error: unknown, project: Project) => void;
  /** Reports a successful autosave, e.g. to clear a previous failure notice. */
  readonly onAutosaveComplete?: (project: Project) => void;
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

export class ProjectRecoveryCancelledError extends ProjectOperationError {
  constructor() {
    super("Project recovery was cancelled. The stored project was left unchanged.");
    this.name = "ProjectRecoveryCancelledError";
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
  private onAutosaveError: (error: unknown, project: Project) => void;
  private onAutosaveComplete: (project: Project) => void;
  private isDisposed = false;
  private autosaveStarted = false;
  private startupPromise: Promise<Project> | null = null;
  private startupComplete = false;
  private unsubscribeStore: (() => void) | null = null;
  private operation: Promise<unknown> = Promise.resolve();

  constructor(options: ProjectControllerOptions) {
    this.store = options.store;
    this.repo = options.repo ?? createProjectRepository();
    this.onAutosaveError = options.onAutosaveError ?? (() => {});
    this.onAutosaveComplete = options.onAutosaveComplete ?? (() => {});
    this.autosave =
      options.autosave ??
      createAutosaveEngine({
        repo: this.repo,
        onSaveScheduled: reportAutosaveScheduled,
        onSaveComplete: (project) => {
          if (this.isDisposed || project.id !== this.store.project.id) return;
          reportAutosaveComplete(project);
          this.onAutosaveComplete(project);
        },
        onSaveError: (error, project) => {
          if (!this.isDisposed && project.id === this.store.project.id) {
            this.onAutosaveError(error, project);
          }
        },
      });
    this.createId = options.createId ?? createProjectId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.beforeProjectSwitch = options.beforeProjectSwitch ?? (() => {});
  }

  setBeforeProjectSwitch(callback: () => void): void {
    this.beforeProjectSwitch = callback;
  }

  /**
   * Registers the shell's autosave-failure reporter.
   *
   * The shell learns of a failed write here rather than through a constructor option so the
   * reporter can be a component-scoped callback that closes over UI state.
   */
  setAutosaveErrorHandler(callback: (error: unknown, project: Project) => void): void {
    this.onAutosaveError = callback;
  }

  setAutosaveCompleteHandler(callback: (project: Project) => void): void {
    this.onAutosaveComplete = callback;
  }

  /**
   * Writes any pending autosave immediately.
   *
   * Best effort for pagehide: a browser may terminate asynchronous persistence on unload.
   * Explicit project operations await flush instead.
   */
  flushPendingAutosave(): void {
    const project = this.store.project;
    void this.autosave.flush().catch((error: unknown) => {
      if (!this.isDisposed && this.store.project.id === project.id) {
        this.onAutosaveError(error, project);
      }
    });
  }

  /** Starts the single autosave subscription after startup recovery has run. */
  startAutosave(): void {
    if (this.autosaveStarted || this.isDisposed) return;
    this.autosaveStarted = true;
    this.unsubscribeStore = this.store.subscribe((change) => {
      if (change.persist) this.autosave.scheduleAutosave(this.store.project);
    });
    this.autosave.scheduleAutosave(this.store.project);
  }

  async recoverLastSession(
    confirmRecovery?: (result: PortableProjectDecodeResult) => Promise<boolean>,
  ): Promise<Project | null> {
    const result = await this.autosave.loadAutosavedProjectWithDiagnostics();
    if (!result) return null;
    await this.requireRecoveryConfirmation(result, confirmRecovery);
    this.beforeProjectSwitch();
    this.assertActive();
    this.store.replaceLoadedProject(result.project);
    return result.project;
  }

  /**
   * Establishes the startup project exactly once, even when React StrictMode
   * invokes the startup effect twice. A missing or stale recovery pointer
   * creates a collision-free default project instead of persisting the
   * transient App placeholder identity.
   */
  initializeSession(
    rawFallbackName: string,
    confirmRecovery?: (result: PortableProjectDecodeResult) => Promise<boolean>,
  ): Promise<Project> {
    if (this.startupComplete && this.startupPromise) return this.startupPromise;
    if (this.startupPromise) return this.startupPromise;
    const startup = this.runExclusive(async () => {
      const recovered = await this.autosave.loadAutosavedProjectWithDiagnostics();
      if (recovered) {
        await this.requireRecoveryConfirmation(recovered, confirmRecovery);
        this.beforeProjectSwitch();
        this.assertActive();
        this.store.replaceLoadedProject(recovered.project);
        return recovered.project;
      }

      const project = createDefaultProject(
        await this.nextAvailableId(),
        normalizeProjectName(rawFallbackName),
        this.now(),
      );
      await this.prepareIdentityReplacement();
      await this.persistAndActivate(project);
      return project;
    });
    this.startupPromise = startup;
    void startup.then(
      () => {
        this.startupComplete = true;
      },
      () => {
        if (this.startupPromise === startup) this.startupPromise = null;
      },
    );
    return startup;
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

  async openNamedProject(
    id: string,
    confirmRecovery?: (result: PortableProjectDecodeResult) => Promise<boolean>,
  ): Promise<Project> {
    return this.runExclusive(async () => {
      // Persist the outgoing runtime before reading any repository snapshot.
      // Loading first can re-activate stale data when `id` is already active.
      await this.autosave.flush();
      if (id === this.store.project.id) {
        return this.store.project;
      }

      const result = await this.loadProjectWithDiagnostics(id);
      if (!result) throw new ProjectNotFoundError(id);
      if (result.diagnostics.length > 0) {
        if (!confirmRecovery)
          throw new ProjectOperationError("Confirm the recovered project before opening it.");
        if (!(await confirmRecovery(result))) return this.store.project;
      }
      const project = result.project;
      this.beforeProjectSwitch();
      this.assertActive();
      await this.repo.setLastActiveProjectId(project.id);
      this.assertActive();
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
      this.autosave.scheduleAutosave(this.store.project);
      await this.autosave.flush();
      return this.store.project;
    }, false);
  }

  async deleteProject(
    id: string,
    confirmRecovery?: (result: PortableProjectDecodeResult) => Promise<boolean>,
  ): Promise<Project> {
    return this.runExclusive(async () => {
      const isActive = this.store.project.id === id;
      if (!isActive) {
        await this.repo.deleteProject(id);
        return this.store.project;
      }

      // Resolve a safe replacement before deleting the active record. If its
      // migration drops fields, the user must confirm while the old record is intact.
      this.beforeProjectSwitch();
      await this.autosave.flush();
      const remaining = (await this.listProjects()).filter((metadata) => metadata.id !== id);
      let replacement: Project | null = null;
      for (const metadata of remaining) {
        const result = await this.loadProjectWithDiagnostics(metadata.id);
        if (!result) continue;
        await this.requireRecoveryConfirmation(result, confirmRecovery);
        replacement = result.project;
        break;
      }

      const replacementIsFresh = replacement === null;
      if (!replacement) {
        replacement = createDefaultProject(await this.nextAvailableId(), "Untitled", this.now());
      }
      if (this.repo.replaceActiveProject) {
        await this.repo.replaceActiveProject(id, replacement);
      } else {
        // Keep the old active record recoverable until the replacement is safely
        // stored and selected. Roll the pointer back if deletion fails.
        if (replacementIsFresh) await this.repo.saveProject(replacement);
        await this.repo.setLastActiveProjectId(replacement.id);
        try {
          await this.repo.deleteProject(id);
        } catch (error) {
          await this.repo.setLastActiveProjectId(id).catch(() => {});
          throw error;
        }
      }
      this.assertActive();
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

  async openPortableProject(
    text: string,
    confirmRecovery?: (result: PortableProjectDecodeResult) => Promise<boolean>,
  ): Promise<Project> {
    // Decode and collision-check before touching current runtime, history, or
    // recovery metadata. Invalid/future-version files are non-destructive.
    const result = decodePortableProjectWithDiagnostics(text);
    if (result.diagnostics.length > 0) {
      if (!confirmRecovery)
        throw new ProjectOperationError("Confirm the recovered project before opening it.");
      if (!(await confirmRecovery(result))) return this.store.project;
    }
    return this.openPreparedPortableProject(result, result.diagnostics.length > 0);
  }

  /** Caller must present diagnostics before invoking activation of this immutable snapshot. */
  async openPreparedPortableProject(
    result: PortableProjectDecodeResult,
    recoveryConfirmed = false,
  ): Promise<Project> {
    if (result.diagnostics.length > 0 && !recoveryConfirmed) {
      throw new ProjectOperationError("Confirm the recovered project before opening it.");
    }
    this.assertActive();
    const decoded = result.project;
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
    this.isDisposed = true;
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

  private async loadProjectWithDiagnostics(
    id: string,
  ): Promise<PortableProjectDecodeResult | null> {
    if (this.repo.loadProjectWithDiagnostics) {
      return this.repo.loadProjectWithDiagnostics(id);
    }
    const project = await this.repo.loadProject(id);
    return project ? Object.freeze({ project, diagnostics: Object.freeze([]) }) : null;
  }

  private async requireRecoveryConfirmation(
    result: PortableProjectDecodeResult,
    confirmRecovery?: (result: PortableProjectDecodeResult) => Promise<boolean>,
  ): Promise<void> {
    if (result.diagnostics.length === 0) return;
    if (!confirmRecovery) {
      throw new ProjectOperationError("Confirm the recovered project before opening it.");
    }
    if (!(await confirmRecovery(result))) throw new ProjectRecoveryCancelledError();
  }

  private async prepareIdentityReplacement(): Promise<void> {
    this.beforeProjectSwitch();
    await this.autosave.flush();
    this.assertActive();
  }

  private assertActive(): void {
    if (this.isDisposed) throw new ProjectOperationError("The project session was closed.");
  }

  private async persistAndActivate(project: Project): Promise<void> {
    await this.repo.saveProject(project);
    this.assertActive();
    await this.repo.setLastActiveProjectId(project.id);
    this.assertActive();
    this.store.replaceLoadedProject(project);
  }

  private runExclusive<T>(operation: () => Promise<T>, suspendEditing = true): Promise<T> {
    const guardedOperation = async () => {
      this.assertActive();
      if (!suspendEditing) return operation();
      // Stop MIDI/audio before the first asynchronous boundary. Commands cannot modify
      // the outgoing snapshot while it is being drained or a target is being loaded.
      this.beforeProjectSwitch();
      this.store.setEditingSuspended(true);
      try {
        return await operation();
      } finally {
        this.store.setEditingSuspended(false);
      }
    };
    const result = this.operation.then(guardedOperation, guardedOperation);
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
