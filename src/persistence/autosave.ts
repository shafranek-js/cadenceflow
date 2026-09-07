import type { Project } from "../domain/project/project";
import type { CadenceFlowDatabase } from "./db";
import { createProjectRepository, type ProjectRepository } from "./projectRepository";

/**
 * Debounced transactional autosave engine interface and implementation (T123).
 */

export interface AutosaveOptions {
  readonly db?: CadenceFlowDatabase;
  readonly repo?: ProjectRepository;
  readonly debounceMs?: number;
  readonly clock?: { now(): number };
  readonly onSaveComplete?: (project: Project) => void;
}

export interface AutosaveEngine {
  scheduleAutosave(project: Project): void;
  flush(): Promise<void>;
  loadAutosavedProject(): Promise<Project | null>;
  clearRecoveryTarget(): Promise<void>;
  dispose(): void;
}

export class DebouncedAutosaveEngine implements AutosaveEngine {
  private readonly repo: ProjectRepository;
  private readonly debounceMs: number;
  private readonly onSaveComplete: ((project: Project) => void) | undefined;
  private pendingProject: Project | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlightPromise: Promise<void> | null = null;
  private isDisposed = false;

  constructor(options?: AutosaveOptions) {
    this.repo = options?.repo ?? createProjectRepository(options?.db);
    this.debounceMs = options?.debounceMs ?? 300;
    this.onSaveComplete = options?.onSaveComplete;
  }

  scheduleAutosave(project: Project): void {
    if (this.isDisposed) {
      return;
    }
    this.pendingProject = project;

    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.debounceMs <= 0) {
      // Immediate execution (or next tick)
      void this.executeSave();
    } else {
      this.debounceTimer = setTimeout(() => {
        this.debounceTimer = null;
        void this.executeSave();
      }, this.debounceMs);
    }
  }

  private async executeSave(): Promise<void> {
    if (this.inFlightPromise) {
      await this.inFlightPromise;
    }
    if (!this.pendingProject) {
      return;
    }

    const toSave = this.pendingProject;
    this.pendingProject = null;

    this.inFlightPromise = (async () => {
      try {
        await this.repo.saveProject(toSave);
        await this.repo.setLastActiveProjectId(toSave.id);
        this.onSaveComplete?.(toSave);
      } finally {
        this.inFlightPromise = null;
      }
      if (this.pendingProject) {
        await this.executeSave();
      }
    })();

    await this.inFlightPromise;
  }

  async flush(): Promise<void> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    await this.executeSave();
  }

  async loadAutosavedProject(): Promise<Project | null> {
    if (this.pendingProject) {
      await this.flush();
    }
    const lastActiveId = await this.repo.getLastActiveProjectId();
    if (!lastActiveId) {
      return null;
    }
    const project = await this.repo.loadProject(lastActiveId);
    if (project) {
      return project;
    }
    // Stale pointer detected: referenced project does not exist in store.
    // Deterministically clear stale pointer and return null (no arbitrary resurrection).
    await this.repo.clearLastActiveProjectId();
    return null;
  }

  /**
   * Clears the `lastActiveProjectId` recovery pointer in metadata so that subsequent
   * sessions do not automatically resume the last project.
   * NOTE: Does NOT cancel pending saves, mutate Project payloads, or delete any Project record.
   */
  async clearRecoveryTarget(): Promise<void> {
    await this.repo.clearLastActiveProjectId();
  }

  /**
   * Disposes the autosave engine, canceling any pending debounce timer
   * and discarding unpersisted pending memory state without scheduling new persistence.
   * NOTE: Call `flush()` prior to `dispose()` if pending state must be guaranteed saved.
   */
  dispose(): void {
    this.isDisposed = true;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingProject = null;
  }
}

export function createAutosaveEngine(options?: AutosaveOptions): AutosaveEngine {
  return new DebouncedAutosaveEngine(options);
}
