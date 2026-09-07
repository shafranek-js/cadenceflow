import type { Project } from "../domain/project/project";

export interface PersistenceTestState {
  readonly autosaveCount: number;
  readonly lastAutosavedProjectId: string;
  readonly lastAutosavedProjectName: string;
}

interface PersistenceTestWindow extends Window {
  __CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__?: boolean;
  __cadenceflow_persistence__?: PersistenceTestState;
}

function testWindow(): PersistenceTestWindow | null {
  if (typeof window === "undefined") return null;
  const candidate = window as PersistenceTestWindow;
  if (!import.meta.env.DEV && !candidate.__CADENCEFLOW_ENABLE_TEST_OBSERVABILITY__) {
    return null;
  }
  return candidate;
}

/**
 * Reports a completed production autosave without exposing a mutation API.
 * This is intentionally inert outside DEV or explicit automated-test mode.
 */
export function reportAutosaveComplete(project: Project): void {
  const candidate = testWindow();
  if (!candidate) return;
  const previous = candidate.__cadenceflow_persistence__;
  candidate.__cadenceflow_persistence__ = Object.freeze({
    autosaveCount: (previous?.autosaveCount ?? 0) + 1,
    lastAutosavedProjectId: project.id,
    lastAutosavedProjectName: project.name,
  });
}
