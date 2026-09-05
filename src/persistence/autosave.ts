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
}

export interface AutosaveEngine {
  scheduleAutosave(project: Project): void;
  flush(): Promise<void>;
  loadAutosavedProject(): Promise<Project | null>;
  clearAutosave(): Promise<void>;
  dispose(): void;
}

export class DebouncedAutosaveEngine implements AutosaveEngine {
  private readonly repo: ProjectRepository;
  private readonly debounceMs: number;
  private pendingProject: Project | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlightPromise: Promise<void> | null = null;
  private isDisposed = false;

  constructor(options?: AutosaveOptions) {
    this.repo = options?.repo ?? createProjectRepository(options?.db);
    this.debounceMs = options?.debounceMs ?? 300;
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
    if (lastActiveId) {
      const project = await this.repo.loadProject(lastActiveId);
      if (project) {
        return project;
      }
    }
    // Fallback if no last active pointer exists: find most recently updated project
    const list = await this.repo.listProjects();
    if (list.length > 0 && list[0]) {
      return this.repo.loadProject(list[0].id);
    }
    return null;
  }

  async clearAutosave(): Promise<void> {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingProject = null;
    await this.repo.clearLastActiveProjectId();
  }

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
