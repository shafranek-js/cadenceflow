import type { Project } from "../domain/project/project";

/**
 * Debounced transactional autosave engine interface and stubs (T123).
 */

export interface AutosaveOptions {
  readonly debounceMs?: number;
}

export interface AutosaveEngine {
  scheduleAutosave(project: Project): void;
  flush(): Promise<void>;
  loadAutosavedProject(): Promise<Project | null>;
  clearAutosave(): Promise<void>;
  dispose(): void;
}

export function createAutosaveEngine(_options?: AutosaveOptions): AutosaveEngine {
  throw new Error("Not implemented: T123");
}
